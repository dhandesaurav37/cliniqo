import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import test from 'node:test';
import {
  addDaysToDateStr,
  buildSlotLockKey,
  computeScheduledAtUtcMs,
  generateDoctorAvailableSlots,
  getClinicTodayDate,
  validateClinicSlotAvailability,
} from '../src/lib/appointmentLogic.ts';
import {
  buildEmergencyContact,
  calculateAgeFromDob,
  normalizeMobileLast10,
  parseCommaSeparatedList,
} from '../src/lib/patientLogic.ts';
import {
  calculateDeterministicQuantity,
  createEmptyMedicineDraftItem,
  evaluatePrescriptionSafety,
  syncMedicineCalculatedQuantity,
} from '../src/lib/prescriptionLogic.ts';
import {
  verifyHmacSha256Signature,
  verifyTimingSafeSecretMatch,
} from '../functions/src/whatsappCrypto.ts';

test('Patient logic: mobile normalization, DOB age calculation, CSV parsing, emergency contact', () => {
  assert.equal(normalizeMobileLast10('+91 98765-43210'), '9876543210');
  assert.equal(normalizeMobileLast10('98765432'), '98765432');

  const today = new Date();
  const pastYear = today.getFullYear() - 32;
  const dobBeforeToday = `${pastYear}-01-01`;
  assert.equal(calculateAgeFromDob(dobBeforeToday), 32);
  assert.equal(calculateAgeFromDob('invalid-date'), null);
  assert.equal(calculateAgeFromDob('1800-01-01'), null);

  assert.deepEqual(
    parseCommaSeparatedList(' Penicillin , , Sulfa drugs,  Dust '),
    ['Penicillin', 'Sulfa drugs', 'Dust'],
  );

  assert.equal(buildEmergencyContact('', '', ''), null);
  assert.equal(buildEmergencyContact('Asha', '123', 'Mother'), null);
  assert.deepEqual(buildEmergencyContact('Asha Rao', '+91 9876543210', 'Mother'), {
    name: 'Asha Rao',
    mobile: '+91 9876543210',
    relation: 'Mother',
  });
});

test('Prescription deterministic quantity engine calculates tablets, liquids, and manual-entry forms accurately', () => {
  const tabletResult = calculateDeterministicQuantity({
    dosageForm: 'Tablet',
    doseAmount: 1,
    doseUnit: 'tablet',
    frequencyPreset: 'three_times_daily',
    dailyAdministrations: 3,
    durationDays: 5,
  });
  assert.equal(tabletResult.calculatedQuantity, 15);
  assert.equal(tabletResult.calculatedUnit, 'tablet');
  assert.equal(tabletResult.requiresManualEntry, false);

  const syrupResult = calculateDeterministicQuantity({
    dosageForm: 'Syrup',
    doseAmount: 5,
    doseUnit: 'ml',
    frequencyPreset: 'twice_daily',
    dailyAdministrations: 2,
    durationDays: 7,
  });
  assert.equal(syrupResult.calculatedQuantity, 70);
  assert.equal(syrupResult.calculatedUnit, 'ml');
  assert.equal(syrupResult.requiresManualEntry, false);

  const creamResult = calculateDeterministicQuantity({
    dosageForm: 'Cream',
    doseAmount: 1,
    doseUnit: 'application',
    frequencyPreset: 'twice_daily',
    dailyAdministrations: 2,
    durationDays: 5,
  });
  assert.equal(creamResult.calculatedQuantity, null);
  assert.equal(creamResult.calculatedUnit, 'tube');
  assert.equal(creamResult.requiresManualEntry, true);

  const prnNoMax = calculateDeterministicQuantity({
    dosageForm: 'Tablet',
    doseAmount: 1,
    doseUnit: 'tablet',
    frequencyPreset: 'prn',
    dailyAdministrations: null,
    durationDays: 5,
    isPrn: true,
  });
  assert.equal(prnNoMax.calculatedQuantity, null);
  assert.equal(prnNoMax.requiresManualEntry, true);

  const synced = syncMedicineCalculatedQuantity({
    ...createEmptyMedicineDraftItem(),
    medicineName: 'Paracetamol',
    strength: '500 mg',
    doseAmount: 1,
    doseUnit: 'tablet',
    frequencyPreset: 'twice_daily',
    dailyAdministrations: 2,
    durationDays: 5,
    durationText: '5 days',
  });
  assert.equal(synced.quantityNumeric, 10);
  assert.equal(synced.quantityDisplay, '10 tablets');
});

test('Prescription rule-based safety checker flags allergies, duplicates, and missing clinical fields', () => {
  const item = syncMedicineCalculatedQuantity({
    ...createEmptyMedicineDraftItem(),
    medicineName: 'Amoxicillin + Clavulanate',
    genericName: 'Amoxicillin',
    strength: '625 mg',
    doseAmount: 1,
    doseUnit: 'tablet',
    frequencyPreset: 'twice_daily',
    dailyAdministrations: 2,
    durationDays: 5,
    durationText: '5 days',
  });

  const warnings = evaluatePrescriptionSafety({
    medicines: [item, { ...item, id: 'dup-2' }],
    patientAllergies: ['Penicillin / Amoxicillin'],
    generalInstructions: [],
  });

  assert.ok(warnings.some((w) => w.severity === 'critical' && w.category === 'allergy'));
  assert.ok(warnings.some((w) => w.category === 'duplicate'));
  assert.ok(warnings.some((w) => w.category === 'instructions'));
});

test('Appointment scheduling logic handles IST offset, working-day guards, and slot conflict exclusion', () => {
  // 2026-11-16 10:00 IST (UTC+5:30) == 04:30 UTC
  const utcMs = computeScheduledAtUtcMs('2026-11-16', '10:00', 'Asia/Kolkata');
  assert.equal(new Date(utcMs).toISOString(), '2026-11-16T04:30:00.000Z');

  assert.equal(buildSlotLockKey('doc1', '2026-11-20', '10:30'), 'doc1_2026-11-20_1030');

  const futureDate = addDaysToDateStr(getClinicTodayDate('Asia/Kolkata'), 14);
  const clinicStub = {
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>,
    openingTime: '09:00',
    closingTime: '18:00',
    appointmentDuration: 15,
    timezone: 'Asia/Kolkata',
  };

  const pastErr = validateClinicSlotAvailability({
    clinic: clinicStub,
    appointmentDate: '2020-01-01',
    appointmentTime: '10:00',
    durationMinutes: 15,
  });
  assert.ok(pastErr && pastErr.includes('past'));

  const outOfHoursErr = validateClinicSlotAvailability({
    clinic: clinicStub,
    appointmentDate: futureDate,
    appointmentTime: '21:00',
    durationMinutes: 15,
  });
  // If futureDate happens to fall on Sun it catches Sunday, otherwise clinic hours — both are valid rejections
  assert.ok(outOfHoursErr !== null);

  // Pick a guaranteed Monday in the future
  let futureMon = futureDate;
  for (let i = 0; i < 7; i += 1) {
    const candidate = addDaysToDateStr(futureDate, i);
    const dt = new Date(`${candidate}T12:00:00Z`);
    if (dt.getUTCDay() === 1) {
      futureMon = candidate;
      break;
    }
  }

  const slotResult = generateDoctorAvailableSlots({
    clinic: clinicStub,
    dateStr: futureMon,
    doctorId: 'doc_1',
    existingAppointments: [
      {
        id: 'appt_1',
        doctorId: 'doc_1',
        appointmentDate: futureMon,
        appointmentTime: '10:00',
        durationMinutes: 15,
        status: 'scheduled',
        patientName: 'Rohan',
      },
      {
        id: 'appt_2',
        doctorId: 'doc_1',
        appointmentDate: futureMon,
        appointmentTime: '10:15',
        durationMinutes: 15,
        status: 'cancelled',
        patientName: 'Cancelled Patient',
      },
    ],
  });

  assert.equal(slotResult.isWorkingDay, true);
  const slot1000 = slotResult.slots.find((s) => s.time === '10:00');
  const slot1015 = slotResult.slots.find((s) => s.time === '10:15');
  assert.equal(slot1000?.available, false);
  assert.equal(slot1015?.available, true);
});

test('Meta WhatsApp webhook crypto verification fails closed when secret is missing and verifies valid HMAC-SHA256', () => {
  const payload = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }), 'utf8');
  const secret = 'test_app_secret_12345';
  const validSig = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

  assert.equal(verifyHmacSha256Signature(payload, validSig, secret), true);
  assert.equal(verifyHmacSha256Signature(payload, validSig, ''), false);
  assert.equal(verifyHmacSha256Signature(payload, 'sha256=deadbeef', secret), false);
  assert.equal(verifyHmacSha256Signature(payload, undefined, secret), false);
  assert.equal(verifyHmacSha256Signature(undefined, validSig, secret), false);

  assert.equal(verifyTimingSafeSecretMatch('my-verify-token', 'my-verify-token'), true);
  assert.equal(verifyTimingSafeSecretMatch('my-verify-token', 'wrong-token'), false);
  assert.equal(verifyTimingSafeSecretMatch('', 'my-verify-token'), false);
});
