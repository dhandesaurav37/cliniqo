import * as admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  extractMobileLast10,
  formatReadableDate,
  formatReadableTime,
  resolveTemplateName,
  sendWhatsAppTemplateMessage,
  verifyMetaWebhookSignature,
  verifyWebhookTokenMatch,
  WHATSAPP_SECRETS,
  type ClinicWhatsAppTemplateConfig,
  type WhatsAppMessageType,
} from './whatsapp.js';

export const FIRESTORE_DATABASE_ID = 'ai-studio-cliniqo-d8ef6b11-a10b-40c5-a196-2df6be82f24c';

function getNamedDb() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return -1;
  return hh * 60 + mm;
}

function getWeekdayInTimezone(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const approx = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    weekday: 'short',
  }).format(approx);
  const normalized = weekdayShort.slice(0, 3);
  return WEEKDAY_NAMES.includes(normalized as (typeof WEEKDAY_NAMES)[number]) ? normalized : 'Mon';
}

function getTimezoneOffsetMinutes(timezone: string, utcDate: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(utcDate);
    const val = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      val('year'),
      val('month') - 1,
      val('day'),
      val('hour') === 24 ? 0 : val('hour'),
      val('minute'),
      val('second'),
    );
    return (asUtc - utcDate.getTime()) / 60000;
  } catch {
    return 330; // Fallback IST +05:30
  }
}

export function computeScheduledUtcMs(dateStr: string, timeStr: string, timezone = 'Asia/Kolkata'): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offsetMin = getTimezoneOffsetMinutes(timezone, new Date(naiveUtc));
  return naiveUtc - offsetMin * 60000;
}

function buildSlotKey(doctorId: string, appointmentDate: string, appointmentTime: string): string {
  return `${doctorId}_${appointmentDate}_${appointmentTime.replace(':', '')}`;
}

function assertVerifiedAuth(auth: { uid: string; token: { email_verified?: boolean } } | undefined) {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  if (!auth.token?.email_verified) {
    throw new HttpsError('failed-precondition', 'Verified email is required.');
  }
  return auth.uid;
}

function validateClinicAvailability(params: {
  clinicData: Record<string, unknown>;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
}): { timezone: string; scheduledAtUtcMs: number } {
  const { clinicData, appointmentDate, appointmentTime, durationMinutes } = params;
  if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(appointmentDate)) {
    throw new HttpsError('invalid-argument', 'Invalid appointment date format (YYYY-MM-DD).');
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(appointmentTime)) {
    throw new HttpsError('invalid-argument', 'Invalid appointment time format (HH:mm).');
  }

  const timezone = String(clinicData.timezone || 'Asia/Kolkata');
  const workingDays = Array.isArray(clinicData.workingDays)
    ? clinicData.workingDays.map((d) => String(d))
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = getWeekdayInTimezone(appointmentDate, timezone);
  if (!workingDays.includes(dayName)) {
    throw new HttpsError(
      'failed-precondition',
      `Clinic is closed on ${dayName}. Please select a working day (${workingDays.join(', ')}).`,
    );
  }

  const openMin = parseTimeToMinutes(String(clinicData.openingTime || '09:00'));
  const closeMin = parseTimeToMinutes(String(clinicData.closingTime || '20:00'));
  const startMin = parseTimeToMinutes(appointmentTime);
  const endMin = startMin + durationMinutes;

  if (openMin >= 0 && closeMin > openMin && (startMin < openMin || endMin > closeMin)) {
    throw new HttpsError(
      'failed-precondition',
      `Selected slot must fall within clinic hours (${clinicData.openingTime} – ${clinicData.closingTime}).`,
    );
  }

  const scheduledAtUtcMs = computeScheduledUtcMs(appointmentDate, appointmentTime, timezone);
  return { timezone, scheduledAtUtcMs };
}

async function emitClinicAppointmentNotification(params: {
  db: FirebaseFirestore.Firestore;
  clinicId: string;
  type:
    | 'appointment_scheduled'
    | 'appointment_confirmed'
    | 'appointment_reschedule_requested'
    | 'appointment_rescheduled'
    | 'appointment_cancelled';
  title: string;
  message: string;
  doctorId?: string | null;
}) {
  const { db, clinicId, type, title, message, doctorId } = params;
  const memSnap = await db
    .collection('clinicMemberships')
    .where('clinicId', '==', clinicId)
    .where('status', '==', 'active')
    .get();

  const recipients = new Set<string>();
  memSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.role === 'receptionist' || data.role === 'owner' || data.userId === doctorId) {
      recipients.add(String(data.userId));
    }
  });

  if (recipients.size === 0) return;
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  recipients.forEach((recipientUid) => {
    batch.set(db.collection('notifications').doc(), {
      recipientUid,
      clinicId,
      type,
      title: title.slice(0, 140),
      message: message.slice(0, 400),
      read: false,
      createdAt: now,
    });
  });
  await batch.commit();
}

async function dispatchAppointmentWhatsApp(params: {
  db: FirebaseFirestore.Firestore;
  clinicId: string;
  clinicData: Record<string, unknown>;
  appointmentId: string;
  appointmentData: {
    patientDocId: string;
    patientId: string;
    patientName: string;
    patientMobile: string;
    doctorName: string;
    appointmentDate: string;
    appointmentTime: string;
  };
  messageType: WhatsAppMessageType;
  skipPatientNotification?: boolean;
}): Promise<{
  deliveryStatus: 'sent' | 'failed' | 'skipped_no_consent' | 'skipped_not_configured';
  errorMessage: string | null;
  providerMessageId: string | null;
}> {
  const { db, clinicId, clinicData, appointmentId, appointmentData, messageType, skipPatientNotification } =
    params;

  const scheduleSlotKey = `${appointmentData.appointmentDate}_${appointmentData.appointmentTime}`;
  const idempotencyKey = `${appointmentId}_${messageType}_${scheduleSlotKey}`;
  const logRef = db.collection('clinics').doc(clinicId).collection('notificationLogs').doc(idempotencyKey);
  const clinicConfig = (clinicData.whatsappSettings as ClinicWhatsAppTemplateConfig | undefined) || null;
  const templateName = resolveTemplateName(messageType, clinicConfig);

  const prefsSnap = await db
    .collection('clinics')
    .doc(clinicId)
    .collection('patientCommPrefs')
    .doc(appointmentData.patientDocId)
    .get();
  const prefs = prefsSnap.exists ? prefsSnap.data() : null;
  const hasConsent =
    !skipPatientNotification &&
    Boolean(prefs?.whatsappConsent) &&
    prefs?.whatsappEnabled !== false &&
    prefs?.preferredMethod !== 'none' &&
    clinicConfig?.enabled !== false;

  if (!hasConsent) {
    const reason = skipPatientNotification
      ? 'Staff chose not to notify patient via WhatsApp.'
      : clinicConfig?.enabled === false
        ? 'Clinic WhatsApp notifications are disabled in clinic settings.'
        : 'Patient has not granted active WhatsApp consent.';
    const now = FieldValue.serverTimestamp();
    await logRef.set({
      clinicId,
      appointmentId,
      patientDocId: appointmentData.patientDocId,
      patientId: appointmentData.patientId,
      patientName: appointmentData.patientName,
      channel: 'whatsapp',
      recipientMobile: appointmentData.patientMobile,
      messageType,
      scheduleSlotKey,
      idempotencyKey,
      templateName,
      deliveryStatus: 'skipped_no_consent',
      providerMessageId: null,
      errorMessage: reason,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { deliveryStatus: 'skipped_no_consent', errorMessage: reason, providerMessageId: null };
  }

  const dispatchResult = await sendWhatsAppTemplateMessage({
    recipientMobile: appointmentData.patientMobile,
    messageType,
    patientName: appointmentData.patientName,
    clinicName: String(clinicData.name || 'Cliniqo Clinic'),
    doctorName: appointmentData.doctorName,
    appointmentDate: appointmentData.appointmentDate,
    appointmentTime: appointmentData.appointmentTime,
    clinicConfig,
  });

  const now = FieldValue.serverTimestamp();
  await logRef.set({
    clinicId,
    appointmentId,
    patientDocId: appointmentData.patientDocId,
    patientId: appointmentData.patientId,
    patientName: appointmentData.patientName,
    channel: 'whatsapp',
    recipientMobile: appointmentData.patientMobile,
    messageType,
    scheduleSlotKey,
    idempotencyKey,
    templateName: dispatchResult.templateName,
    deliveryStatus: dispatchResult.deliveryStatus,
    providerMessageId: dispatchResult.providerMessageId,
    errorMessage: dispatchResult.errorMessage,
    sentAt: dispatchResult.deliveryStatus === 'sent' ? now : null,
    deliveredAt: null,
    readAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    deliveryStatus: dispatchResult.deliveryStatus,
    errorMessage: dispatchResult.errorMessage,
    providerMessageId: dispatchResult.providerMessageId,
  };
}

export const createClinicAppointment = onCall(
  { region: 'asia-south1', secrets: WHATSAPP_SECRETS },
  async (request) => {
  const uid = assertVerifiedAuth(request.auth);
  const db = getNamedDb();
  const payload = request.data as Record<string, unknown>;

  const clinicId = String(payload.clinicId ?? '').trim();
  const patientDocId = String(payload.patientDocId ?? '').trim();
  const doctorId = String(payload.doctorId ?? '').trim();
  const appointmentDate = String(payload.appointmentDate ?? '').trim();
  const appointmentTime = String(payload.appointmentTime ?? '').trim();
  const appointmentType = String(payload.appointmentType ?? 'follow_up').trim();
  const reason = String(payload.reason ?? '').trim().slice(0, 300);
  const additionalInstructions = String(payload.additionalInstructions ?? '').trim().slice(0, 1000);
  const internalNotes = String(payload.internalNotes ?? '').trim().slice(0, 1000);
  const consultationId = payload.consultationId ? String(payload.consultationId).trim() : null;
  const sendWhatsapp = payload.sendWhatsapp !== false;

  if (!clinicId || !patientDocId || !doctorId || !appointmentDate || !appointmentTime) {
    throw new HttpsError('invalid-argument', 'Required appointment scheduling fields are missing.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const actorRole = String(memSnap.data()!.role || 'receptionist') as 'owner' | 'doctor' | 'receptionist';
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');

  const clinicSnap = await db.collection('clinics').doc(clinicId).get();
  if (!clinicSnap.exists) {
    throw new HttpsError('not-found', 'Clinic not found.');
  }
  const clinicData = clinicSnap.data()!;
  if (
    actorRole === 'receptionist' &&
    clinicData.receptionistPermissions &&
    clinicData.receptionistPermissions.canCreateAppointments === false
  ) {
    throw new HttpsError('permission-denied', 'Receptionists are not authorized to schedule appointments for this clinic.');
  }

  const durationMinutes = Math.min(
    180,
    Math.max(5, Number(payload.durationMinutes || clinicData.appointmentDuration || 15)),
  );
  const { timezone, scheduledAtUtcMs } = validateClinicAvailability({
    clinicData,
    appointmentDate,
    appointmentTime,
    durationMinutes,
  });

  const [patientSnap, docMemSnap] = await Promise.all([
    db.collection('clinics').doc(clinicId).collection('patients').doc(patientDocId).get(),
    db.collection('clinicMemberships').doc(`${clinicId}_${doctorId}`).get(),
  ]);

  if (!patientSnap.exists || patientSnap.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Active patient record not found.');
  }
  const patient = patientSnap.data()!;
  const doctorName = String(
    payload.doctorName || docMemSnap.data()?.memberName || 'Clinic Doctor',
  ).slice(0, 120);

  const slotKey = buildSlotKey(doctorId, appointmentDate, appointmentTime);
  const requestedStartMin = parseTimeToMinutes(appointmentTime);
  const requestedEndMin = requestedStartMin + durationMinutes;

  const appointmentRef = db.collection('clinics').doc(clinicId).collection('appointments').doc();
  const appointmentId = appointmentRef.id;

  await db.runTransaction(async (tx) => {
    const sameDayQuery = db
      .collection('clinics')
      .doc(clinicId)
      .collection('appointments')
      .where('doctorId', '==', doctorId)
      .where('appointmentDate', '==', appointmentDate);
    const sameDaySnap = await tx.get(sameDayQuery);

    for (const existingDoc of sameDaySnap.docs) {
      const ex = existingDoc.data();
      if (['cancelled', 'no_show', 'completed'].includes(String(ex.status))) continue;
      const exStart = parseTimeToMinutes(String(ex.appointmentTime));
      const exEnd = exStart + Number(ex.durationMinutes || 15);
      if (requestedStartMin < exEnd && exStart < requestedEndMin) {
        throw new HttpsError(
          'already-exists',
          `Doctor already has an appointment at ${ex.appointmentTime} on ${appointmentDate}. Please pick another slot.`,
        );
      }
    }

    const slotRef = db.collection('clinics').doc(clinicId).collection('appointmentSlots').doc(slotKey);
    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists && slotSnap.data()?.active === true) {
      throw new HttpsError('already-exists', 'That appointment time slot has just been booked.');
    }

    const now = FieldValue.serverTimestamp();
    const initialReminderState =
      scheduledAtUtcMs - Date.now() > 2 * 60 * 60 * 1000 ? 'pending' : 'not_applicable';

    tx.set(slotRef, {
      clinicId,
      doctorId,
      appointmentDate,
      appointmentTime,
      appointmentId,
      active: true,
      updatedAt: now,
    });

    tx.set(appointmentRef, {
      clinicId,
      clinicName: String(clinicData.name || 'Cliniqo Clinic').slice(0, 140),
      patientDocId,
      patientId: String(patient.patientId),
      patientName: String(patient.fullName),
      patientMobile: String(patient.mobile),
      patientMobileLast10: extractMobileLast10(String(patient.mobile)),
      doctorId,
      doctorName,
      consultationId: consultationId || null,
      appointmentDate,
      appointmentTime,
      durationMinutes,
      scheduledAtUtcMs,
      timezone,
      appointmentType: ['follow_up', 'general', 'review_reports', 'routine_checkup'].includes(appointmentType)
        ? appointmentType
        : 'follow_up',
      reason: reason || null,
      additionalInstructions: additionalInstructions || null,
      internalNotes: internalNotes || null,
      status: 'scheduled',
      cancelReason: null,
      rescheduleCount: 0,
      whatsappNotificationStatus: 'pending',
      whatsappConfirmationSentAt: null,
      lastWhatsappError: null,
      reminder24hStatus: scheduledAtUtcMs - Date.now() > 24 * 60 * 60 * 1000 ? 'pending' : 'not_applicable',
      reminder2hStatus: initialReminderState,
      confirmedAt: null,
      confirmedVia: null,
      rescheduleRequestedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdBy: uid,
      createdByName: actorName.slice(0, 120),
      createdByRole: actorRole,
      createdAt: now,
      updatedAt: now,
    });

    tx.set(db.collection('clinics').doc(clinicId).collection('appointmentLogs').doc(), {
      clinicId,
      appointmentId,
      patientDocId,
      patientId: String(patient.patientId),
      patientName: String(patient.fullName),
      actorUid: uid,
      actorName: actorName.slice(0, 120),
      actorRole,
      action: 'scheduled',
      previousDate: null,
      previousTime: null,
      newDate: appointmentDate,
      newTime: appointmentTime,
      reason: reason || null,
      summary: `Scheduled ${appointmentType.replace('_', ' ')} for ${appointmentDate} at ${formatReadableTime(appointmentTime)}`,
      createdAt: now,
    });
  });

  const dispatch = await dispatchAppointmentWhatsApp({
    db,
    clinicId,
    clinicData,
    appointmentId,
    appointmentData: {
      patientDocId,
      patientId: String(patient.patientId),
      patientName: String(patient.fullName),
      patientMobile: String(patient.mobile),
      doctorName,
      appointmentDate,
      appointmentTime,
    },
    messageType: 'confirmation',
    skipPatientNotification: !sendWhatsapp,
  });

  await appointmentRef.update({
    whatsappNotificationStatus: dispatch.deliveryStatus,
    whatsappConfirmationSentAt: dispatch.deliveryStatus === 'sent' ? FieldValue.serverTimestamp() : null,
    lastWhatsappError: dispatch.errorMessage,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await emitClinicAppointmentNotification({
    db,
    clinicId,
    type: 'appointment_scheduled',
    title: `Appointment booked: ${String(patient.fullName)}`,
    message: `${formatReadableDate(appointmentDate)} at ${formatReadableTime(appointmentTime)} with ${doctorName}.`,
    doctorId,
  });

  return {
    appointmentId,
    whatsappNotificationStatus: dispatch.deliveryStatus,
    providerMessageId: dispatch.providerMessageId,
    whatsappError: dispatch.errorMessage,
  };
});

export const rescheduleClinicAppointment = onCall(
  { region: 'asia-south1', secrets: WHATSAPP_SECRETS },
  async (request) => {
  const uid = assertVerifiedAuth(request.auth);
  const db = getNamedDb();
  const payload = request.data as Record<string, unknown>;

  const clinicId = String(payload.clinicId ?? '').trim();
  const appointmentId = String(payload.appointmentId ?? '').trim();
  const newDate = String(payload.appointmentDate ?? '').trim();
  const newTime = String(payload.appointmentTime ?? '').trim();
  const doctorId = String(payload.doctorId ?? '').trim();
  const doctorNameInput = String(payload.doctorName ?? '').trim();
  const reason = String(payload.reason ?? '').trim().slice(0, 300);
  const notifyPatient = payload.sendWhatsapp !== false;

  if (!clinicId || !appointmentId || !newDate || !newTime) {
    throw new HttpsError('invalid-argument', 'clinicId, appointmentId, date, and time are required.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const actorRole = String(memSnap.data()!.role || 'receptionist') as 'owner' | 'doctor' | 'receptionist';
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');

  const clinicSnap = await db.collection('clinics').doc(clinicId).get();
  if (!clinicSnap.exists) {
    throw new HttpsError('not-found', 'Clinic not found.');
  }
  const clinicData = clinicSnap.data()!;
  if (
    actorRole === 'receptionist' &&
    clinicData.receptionistPermissions &&
    clinicData.receptionistPermissions.canCreateAppointments === false
  ) {
    throw new HttpsError('permission-denied', 'Receptionists are not authorized to reschedule appointments.');
  }

  const appointmentRef = db.collection('clinics').doc(clinicId).collection('appointments').doc(appointmentId);
  let targetDoctorId = doctorId;
  let targetDoctorName = doctorNameInput;
  let apptSnapshotData: FirebaseFirestore.DocumentData | null = null;
  let scheduledAtUtcMs = 0;

  await db.runTransaction(async (tx) => {
    const apptSnap = await tx.get(appointmentRef);
    if (!apptSnap.exists) {
      throw new HttpsError('not-found', 'Appointment not found.');
    }
    const existing = apptSnap.data()!;
    apptSnapshotData = existing;

    if (!['scheduled', 'confirmed', 'reschedule_requested'].includes(String(existing.status))) {
      throw new HttpsError('failed-precondition', 'Completed or cancelled appointments cannot be rescheduled.');
    }

    targetDoctorId = targetDoctorId || String(existing.doctorId);
    targetDoctorName = targetDoctorName || String(existing.doctorName);
    const durationMinutes = Number(existing.durationMinutes || clinicData.appointmentDuration || 15);
    const availability = validateClinicAvailability({
      clinicData,
      appointmentDate: newDate,
      appointmentTime: newTime,
      durationMinutes,
    });
    scheduledAtUtcMs = availability.scheduledAtUtcMs;

    const requestedStartMin = parseTimeToMinutes(newTime);
    const requestedEndMin = requestedStartMin + durationMinutes;

    const sameDayQuery = db
      .collection('clinics')
      .doc(clinicId)
      .collection('appointments')
      .where('doctorId', '==', targetDoctorId)
      .where('appointmentDate', '==', newDate);
    const sameDaySnap = await tx.get(sameDayQuery);

    for (const d of sameDaySnap.docs) {
      if (d.id === appointmentId) continue;
      const ex = d.data();
      if (['cancelled', 'no_show', 'completed'].includes(String(ex.status))) continue;
      const exStart = parseTimeToMinutes(String(ex.appointmentTime));
      const exEnd = exStart + Number(ex.durationMinutes || 15);
      if (requestedStartMin < exEnd && exStart < requestedEndMin) {
        throw new HttpsError(
          'already-exists',
          `Doctor already has an appointment at ${ex.appointmentTime} on ${newDate}.`,
        );
      }
    }

    const oldSlotKey = buildSlotKey(
      String(existing.doctorId),
      String(existing.appointmentDate),
      String(existing.appointmentTime),
    );
    const newSlotKey = buildSlotKey(targetDoctorId, newDate, newTime);

    const newSlotRef = db.collection('clinics').doc(clinicId).collection('appointmentSlots').doc(newSlotKey);
    const newSlotSnap = await tx.get(newSlotRef);
    if (newSlotKey !== oldSlotKey && newSlotSnap.exists && newSlotSnap.data()?.active === true) {
      throw new HttpsError('already-exists', 'The selected slot is already booked.');
    }

    const now = FieldValue.serverTimestamp();
    if (oldSlotKey !== newSlotKey) {
      tx.set(
        db.collection('clinics').doc(clinicId).collection('appointmentSlots').doc(oldSlotKey),
        {
          clinicId,
          doctorId: String(existing.doctorId),
          appointmentDate: String(existing.appointmentDate),
          appointmentTime: String(existing.appointmentTime),
          appointmentId,
          active: false,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    tx.set(newSlotRef, {
      clinicId,
      doctorId: targetDoctorId,
      appointmentDate: newDate,
      appointmentTime: newTime,
      appointmentId,
      active: true,
      updatedAt: now,
    });

    tx.update(appointmentRef, {
      doctorId: targetDoctorId,
      doctorName: targetDoctorName,
      appointmentDate: newDate,
      appointmentTime: newTime,
      timezone: availability.timezone,
      scheduledAtUtcMs,
      status: 'scheduled',
      rescheduleCount: Number(existing.rescheduleCount || 0) + 1,
      whatsappNotificationStatus: 'pending',
      lastWhatsappError: null,
      reminder24hStatus: scheduledAtUtcMs - Date.now() > 24 * 60 * 60 * 1000 ? 'pending' : 'not_applicable',
      reminder2hStatus: scheduledAtUtcMs - Date.now() > 2 * 60 * 60 * 1000 ? 'pending' : 'not_applicable',
      updatedAt: now,
    });

    tx.set(db.collection('clinics').doc(clinicId).collection('appointmentLogs').doc(), {
      clinicId,
      appointmentId,
      patientDocId: String(existing.patientDocId),
      patientId: String(existing.patientId),
      patientName: String(existing.patientName),
      actorUid: uid,
      actorName: actorName.slice(0, 120),
      actorRole,
      action: 'rescheduled',
      previousDate: String(existing.appointmentDate),
      previousTime: String(existing.appointmentTime),
      newDate,
      newTime,
      reason: reason || null,
      summary: `Rescheduled from ${existing.appointmentDate} ${existing.appointmentTime} to ${newDate} ${newTime}`,
      createdAt: now,
    });
  });

  const exData = apptSnapshotData!;
  const dispatch = await dispatchAppointmentWhatsApp({
    db,
    clinicId,
    clinicData,
    appointmentId,
    appointmentData: {
      patientDocId: String(exData.patientDocId),
      patientId: String(exData.patientId),
      patientName: String(exData.patientName),
      patientMobile: String(exData.patientMobile),
      doctorName: targetDoctorName,
      appointmentDate: newDate,
      appointmentTime: newTime,
    },
    messageType: 'reschedule',
    skipPatientNotification: !notifyPatient,
  });

  await appointmentRef.update({
    whatsappNotificationStatus: dispatch.deliveryStatus,
    lastWhatsappError: dispatch.errorMessage,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await emitClinicAppointmentNotification({
    db,
    clinicId,
    type: 'appointment_rescheduled',
    title: `Appointment rescheduled: ${String(exData.patientName)}`,
    message: `Moved to ${formatReadableDate(newDate)} at ${formatReadableTime(newTime)}.`,
    doctorId: targetDoctorId,
  });

  return {
    appointmentId,
    whatsappNotificationStatus: dispatch.deliveryStatus,
    providerMessageId: dispatch.providerMessageId,
    whatsappError: dispatch.errorMessage,
  };
});

export const transitionAppointmentStatus = onCall(
  { region: 'asia-south1', secrets: WHATSAPP_SECRETS },
  async (request) => {
  const uid = assertVerifiedAuth(request.auth);
  const db = getNamedDb();
  const payload = request.data as Record<string, unknown>;

  const clinicId = String(payload.clinicId ?? '').trim();
  const appointmentId = String(payload.appointmentId ?? '').trim();
  const nextStatus = String(payload.status ?? '').trim() as
    | 'confirmed'
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'reschedule_requested';
  const cancelReason = String(payload.cancelReason ?? '').trim().slice(0, 300);
  const notifyPatientOnCancel = payload.sendWhatsapp !== false;

  if (!clinicId || !appointmentId || !['confirmed', 'completed', 'cancelled', 'no_show', 'reschedule_requested'].includes(nextStatus)) {
    throw new HttpsError('invalid-argument', 'Valid clinicId, appointmentId, and status are required.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const actorRole = String(memSnap.data()!.role || 'receptionist') as 'owner' | 'doctor' | 'receptionist';
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');

  const clinicSnap = await db.collection('clinics').doc(clinicId).get();
  if (!clinicSnap.exists) {
    throw new HttpsError('not-found', 'Clinic not found.');
  }
  const clinicData = clinicSnap.data()!;

  if (
    nextStatus === 'cancelled' &&
    actorRole === 'receptionist' &&
    clinicData.receptionistPermissions &&
    clinicData.receptionistPermissions.canCancelAppointments === false
  ) {
    throw new HttpsError('permission-denied', 'Receptionists are not authorized to cancel appointments.');
  }

  if (nextStatus === 'cancelled' && cancelReason.length < 3) {
    throw new HttpsError('invalid-argument', 'A brief cancellation reason is required.');
  }

  const appointmentRef = db.collection('clinics').doc(clinicId).collection('appointments').doc(appointmentId);
  let apptData: FirebaseFirestore.DocumentData | null = null;

  await db.runTransaction(async (tx) => {
    const apptSnap = await tx.get(appointmentRef);
    if (!apptSnap.exists) {
      throw new HttpsError('not-found', 'Appointment not found.');
    }
    const existing = apptSnap.data()!;
    apptData = existing;

    if (!['scheduled', 'confirmed', 'reschedule_requested'].includes(String(existing.status))) {
      throw new HttpsError('failed-precondition', 'This appointment is already finalized.');
    }

    const now = FieldValue.serverTimestamp();
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: now,
    };

    if (nextStatus === 'confirmed') {
      updates.confirmedAt = now;
      updates.confirmedVia = 'staff';
    } else if (nextStatus === 'completed') {
      updates.completedAt = now;
      updates.reminder24hStatus = existing.reminder24hStatus === 'pending' ? 'not_applicable' : existing.reminder24hStatus;
      updates.reminder2hStatus = existing.reminder2hStatus === 'pending' ? 'not_applicable' : existing.reminder2hStatus;
    } else if (nextStatus === 'cancelled') {
      updates.cancelledAt = now;
      updates.cancelReason = cancelReason;
      updates.reminder24hStatus = existing.reminder24hStatus === 'pending' ? 'not_applicable' : existing.reminder24hStatus;
      updates.reminder2hStatus = existing.reminder2hStatus === 'pending' ? 'not_applicable' : existing.reminder2hStatus;
    } else if (nextStatus === 'no_show') {
      updates.reminder24hStatus = existing.reminder24hStatus === 'pending' ? 'not_applicable' : existing.reminder24hStatus;
      updates.reminder2hStatus = existing.reminder2hStatus === 'pending' ? 'not_applicable' : existing.reminder2hStatus;
    } else if (nextStatus === 'reschedule_requested') {
      updates.rescheduleRequestedAt = now;
    }

    if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
      const slotKey = buildSlotKey(
        String(existing.doctorId),
        String(existing.appointmentDate),
        String(existing.appointmentTime),
      );
      tx.set(
        db.collection('clinics').doc(clinicId).collection('appointmentSlots').doc(slotKey),
        {
          clinicId,
          doctorId: String(existing.doctorId),
          appointmentDate: String(existing.appointmentDate),
          appointmentTime: String(existing.appointmentTime),
          appointmentId,
          active: false,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    tx.update(appointmentRef, updates);
    tx.set(db.collection('clinics').doc(clinicId).collection('appointmentLogs').doc(), {
      clinicId,
      appointmentId,
      patientDocId: String(existing.patientDocId),
      patientId: String(existing.patientId),
      patientName: String(existing.patientName),
      actorUid: uid,
      actorName: actorName.slice(0, 120),
      actorRole,
      action: nextStatus,
      previousDate: String(existing.appointmentDate),
      previousTime: String(existing.appointmentTime),
      newDate: null,
      newTime: null,
      reason: nextStatus === 'cancelled' ? cancelReason : null,
      summary:
        nextStatus === 'cancelled'
          ? `Cancelled appointment: ${cancelReason}`
          : `Marked appointment as ${nextStatus.replace('_', ' ')}`,
      createdAt: now,
    });
  });

  const ex = apptData!;
  let whatsappResult: Awaited<ReturnType<typeof dispatchAppointmentWhatsApp>> | null = null;
  if (nextStatus === 'cancelled') {
    whatsappResult = await dispatchAppointmentWhatsApp({
      db,
      clinicId,
      clinicData,
      appointmentId,
      appointmentData: {
        patientDocId: String(ex.patientDocId),
        patientId: String(ex.patientId),
        patientName: String(ex.patientName),
        patientMobile: String(ex.patientMobile),
        doctorName: String(ex.doctorName),
        appointmentDate: String(ex.appointmentDate),
        appointmentTime: String(ex.appointmentTime),
      },
      messageType: 'cancellation',
      skipPatientNotification: !notifyPatientOnCancel,
    });

    await appointmentRef.update({
      whatsappNotificationStatus: whatsappResult.deliveryStatus,
      lastWhatsappError: whatsappResult.errorMessage,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await emitClinicAppointmentNotification({
      db,
      clinicId,
      type: 'appointment_cancelled',
      title: `Appointment cancelled: ${String(ex.patientName)}`,
      message: `${formatReadableDate(String(ex.appointmentDate))} at ${formatReadableTime(String(ex.appointmentTime))} · ${cancelReason}`,
      doctorId: String(ex.doctorId),
    });
  }

  return {
    appointmentId,
    status: nextStatus,
    whatsappNotificationStatus: whatsappResult?.deliveryStatus || null,
  };
});

/**
 * Cloud Scheduler job running every 10 minutes to dispatch idempotent 24-hour and 2-hour
 * WhatsApp reminders for active ('scheduled' | 'confirmed') appointments.
 */
export const processAppointmentReminders = onSchedule(
  { region: 'asia-south1', schedule: 'every 10 minutes', secrets: WHATSAPP_SECRETS },
  async () => {
    const db = getNamedDb();
    const nowMs = Date.now();
    const horizonMs = nowMs + 25 * 60 * 60 * 1000;

    const snapshot = await db
      .collectionGroup('appointments')
      .where('scheduledAtUtcMs', '>', nowMs)
      .where('scheduledAtUtcMs', '<=', horizonMs)
      .get();

    const clinicCache = new Map<string, Record<string, unknown> | null>();

    for (const docSnap of snapshot.docs) {
      const appt = docSnap.data();
      if (!['scheduled', 'confirmed'].includes(String(appt.status))) continue;

      const clinicId = String(appt.clinicId || '');
      if (!clinicId) continue;

      if (!clinicCache.has(clinicId)) {
        const cSnap = await db.collection('clinics').doc(clinicId).get();
        clinicCache.set(clinicId, cSnap.exists ? cSnap.data()! : null);
      }
      const clinicData = clinicCache.get(clinicId);
      if (!clinicData) continue;

      const msRemaining = Number(appt.scheduledAtUtcMs) - nowMs;
      const hoursRemaining = msRemaining / (60 * 60 * 1000);

      let reminderType: 'reminder_24h' | 'reminder_2h' | null = null;
      if (hoursRemaining <= 2 && hoursRemaining > 0 && appt.reminder2hStatus === 'pending') {
        reminderType = 'reminder_2h';
      } else if (hoursRemaining <= 24.5 && hoursRemaining > 2 && appt.reminder24hStatus === 'pending') {
        reminderType = 'reminder_24h';
      }

      if (!reminderType) continue;

      const scheduleSlotKey = `${appt.appointmentDate}_${appt.appointmentTime}`;
      const idempotencyKey = `${docSnap.id}_${reminderType}_${scheduleSlotKey}`;
      const logRef = db.collection('clinics').doc(clinicId).collection('notificationLogs').doc(idempotencyKey);
      const clinicConfig = (clinicData.whatsappSettings as ClinicWhatsAppTemplateConfig | undefined) || null;
      const templateName = resolveTemplateName(reminderType, clinicConfig);

      // Idempotent reservation inside transaction so duplicate scheduler invocations never double-send
      const claimed = await db.runTransaction(async (tx) => {
        const existingLog = await tx.get(logRef);
        if (existingLog.exists) return false;
        const freshAppt = await tx.get(docSnap.ref);
        if (!freshAppt.exists || !['scheduled', 'confirmed'].includes(String(freshAppt.data()?.status))) {
          return false;
        }
        const nowTs = FieldValue.serverTimestamp();
        tx.set(logRef, {
          clinicId,
          appointmentId: docSnap.id,
          patientDocId: String(appt.patientDocId),
          patientId: String(appt.patientId),
          patientName: String(appt.patientName),
          channel: 'whatsapp',
          recipientMobile: String(appt.patientMobile),
          messageType: reminderType,
          scheduleSlotKey,
          idempotencyKey,
          templateName,
          deliveryStatus: 'pending_backend_dispatch',
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: nowTs,
          updatedAt: nowTs,
        });
        return true;
      });

      if (!claimed) continue;

      const prefsSnap = await db
        .collection('clinics')
        .doc(clinicId)
        .collection('patientCommPrefs')
        .doc(String(appt.patientDocId))
        .get();
      const prefs = prefsSnap.exists ? prefsSnap.data() : null;
      const hasConsent =
        Boolean(prefs?.whatsappConsent) &&
        prefs?.whatsappEnabled !== false &&
        prefs?.preferredMethod !== 'none' &&
        clinicConfig?.enabled !== false;

      const reminderField = reminderType === 'reminder_2h' ? 'reminder2hStatus' : 'reminder24hStatus';
      const nowTs = FieldValue.serverTimestamp();

      if (!hasConsent) {
        await logRef.update({
          deliveryStatus: 'skipped_no_consent',
          errorMessage: 'Patient WhatsApp consent is missing or disabled.',
          updatedAt: nowTs,
        });
        await docSnap.ref.update({
          [reminderField]: 'skipped_no_consent',
          updatedAt: nowTs,
        });
        continue;
      }

      const result = await sendWhatsAppTemplateMessage({
        recipientMobile: String(appt.patientMobile),
        messageType: reminderType,
        patientName: String(appt.patientName),
        clinicName: String(clinicData.name || appt.clinicName || 'Cliniqo Clinic'),
        doctorName: String(appt.doctorName),
        appointmentDate: String(appt.appointmentDate),
        appointmentTime: String(appt.appointmentTime),
        clinicConfig,
      });

      await logRef.update({
        deliveryStatus: result.deliveryStatus,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        sentAt: result.deliveryStatus === 'sent' ? nowTs : null,
        updatedAt: nowTs,
      });
      await docSnap.ref.update({
        [reminderField]: result.deliveryStatus,
        lastWhatsappError: result.errorMessage,
        updatedAt: nowTs,
      });
    }
  },
);

/**
 * Official Meta WhatsApp Business Cloud API Webhook.
 * Supports GET verification handshake and POST delivery status updates + patient Confirm / Reschedule replies.
 */
export const whatsappWebhook = onRequest(
  { region: 'asia-south1', secrets: WHATSAPP_SECRETS },
  async (req, res) => {
  if (req.method === 'GET') {
    const mode = String(req.query['hub.mode'] ?? '');
    const token = String(req.query['hub.verify_token'] ?? '');
    const challenge = String(req.query['hub.challenge'] ?? '');

    if (mode === 'subscribe' && verifyWebhookTokenMatch(token)) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden: invalid WhatsApp webhook verification token.');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signature = req.header('x-hub-signature-256');
  if (!verifyMetaWebhookSignature(req.rawBody, signature)) {
    res.status(403).send('Invalid Meta webhook signature.');
    return;
  }

  const body = req.body as {
    object?: string;
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: 'sent' | 'delivered' | 'read' | 'failed';
            errors?: Array<{ title?: string; message?: string; code?: number }>;
          }>;
          messages?: Array<{
            from?: string;
            type?: string;
            text?: { body?: string };
            button?: { payload?: string; text?: string };
            interactive?: {
              type?: string;
              button_reply?: { id?: string; title?: string };
            };
          }>;
        };
      }>;
    }>;
  };

  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    res.status(200).send('EVENT_IGNORED');
    return;
  }

  const db = getNamedDb();
  const now = FieldValue.serverTimestamp();

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // 1. Delivery Status Webhooks (sent / delivered / read / failed)
      for (const statusEvt of value.statuses || []) {
        if (!statusEvt.id || !statusEvt.status) continue;
        const logsSnap = await db
          .collectionGroup('notificationLogs')
          .where('providerMessageId', '==', statusEvt.id)
          .limit(1)
          .get();
        if (logsSnap.empty) continue;

        const logDoc = logsSnap.docs[0];
        const logData = logDoc.data();
        const errMsg = statusEvt.errors?.[0]?.message || statusEvt.errors?.[0]?.title || null;
        const logUpdate: Record<string, unknown> = {
          deliveryStatus: statusEvt.status,
          errorMessage: errMsg,
          updatedAt: now,
        };
        if (statusEvt.status === 'delivered') logUpdate.deliveredAt = now;
        if (statusEvt.status === 'read') logUpdate.readAt = now;
        await logDoc.ref.update(logUpdate);

        if (logData.messageType === 'confirmation' && logData.clinicId && logData.appointmentId) {
          await db
            .collection('clinics')
            .doc(String(logData.clinicId))
            .collection('appointments')
            .doc(String(logData.appointmentId))
            .update({
              whatsappNotificationStatus: statusEvt.status,
              lastWhatsappError: errMsg,
              updatedAt: now,
            });
        }
      }

      // 2. Patient Interactive Replies (Confirm / Request Reschedule)
      for (const msg of value.messages || []) {
        const senderLast10 = extractMobileLast10(String(msg.from || ''));
        if (senderLast10.length < 7) continue;

        const rawIntent = (
          msg.interactive?.button_reply?.id ||
          msg.interactive?.button_reply?.title ||
          msg.button?.payload ||
          msg.button?.text ||
          msg.text?.body ||
          ''
        )
          .trim()
          .toUpperCase();

        const isConfirm =
          rawIntent === 'CONFIRM_APPOINTMENT' ||
          rawIntent === 'CONFIRM' ||
          rawIntent === 'YES' ||
          rawIntent === '1';
        const isReschedule =
          rawIntent === 'REQUEST_RESCHEDULE' ||
          rawIntent === 'RESCHEDULE' ||
          rawIntent === '2';

        if (!isConfirm && !isReschedule) continue;

        const apptSnap = await db
          .collectionGroup('appointments')
          .where('patientMobileLast10', '==', senderLast10)
          .where('status', 'in', ['scheduled', 'confirmed'])
          .orderBy('scheduledAtUtcMs', 'asc')
          .limit(1)
          .get();

        if (apptSnap.empty) continue;

        const apptDoc = apptSnap.docs[0];
        const appt = apptDoc.data();
        const clinicId = String(appt.clinicId);
        const targetStatus = isConfirm ? 'confirmed' : 'reschedule_requested';

        await apptDoc.ref.update({
          status: targetStatus,
          ...(isConfirm
            ? { confirmedAt: now, confirmedVia: 'whatsapp_webhook' }
            : { rescheduleRequestedAt: now }),
          updatedAt: now,
        });

        await db.collection('clinics').doc(clinicId).collection('appointmentLogs').doc().set({
          clinicId,
          appointmentId: apptDoc.id,
          patientDocId: String(appt.patientDocId),
          patientId: String(appt.patientId),
          patientName: String(appt.patientName),
          actorUid: 'system_whatsapp',
          actorName: 'WhatsApp Patient Reply',
          actorRole: 'system',
          action: isConfirm ? 'confirmed' : 'reschedule_requested',
          previousDate: String(appt.appointmentDate),
          previousTime: String(appt.appointmentTime),
          newDate: null,
          newTime: null,
          reason: `Patient replied via WhatsApp: "${rawIntent.slice(0, 60)}"`,
          summary: isConfirm
            ? 'Patient confirmed appointment via WhatsApp reply'
            : 'Patient requested reschedule via WhatsApp reply — clinic staff review needed',
          createdAt: now,
        });

        await emitClinicAppointmentNotification({
          db,
          clinicId,
          type: isConfirm ? 'appointment_confirmed' : 'appointment_reschedule_requested',
          title: isConfirm
            ? `WhatsApp Confirmed: ${String(appt.patientName)}`
            : `Reschedule Requested: ${String(appt.patientName)}`,
          message: isConfirm
            ? `${String(appt.patientName)} confirmed their ${formatReadableDate(String(appt.appointmentDate))} (${formatReadableTime(String(appt.appointmentTime))}) visit via WhatsApp.`
            : `${String(appt.patientName)} requested a reschedule for ${formatReadableDate(String(appt.appointmentDate))} (${formatReadableTime(String(appt.appointmentTime))}) via WhatsApp.`,
          doctorId: String(appt.doctorId),
        });
      }
    }
  }

  res.status(200).send('EVENT_RECEIVED');
});
