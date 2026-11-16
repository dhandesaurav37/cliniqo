import * as crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FIRESTORE_DATABASE_ID } from './appointments.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore(admin.app(), FIRESTORE_DATABASE_ID);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSecureCode(): string {
  const bytes = crypto.randomBytes(5);
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `CLINIC-${suffix}`;
}

function assertVerifiedAuth(auth: { uid: string; token: { email_verified?: boolean; email?: string } } | undefined) {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  if (!auth.token?.email_verified) {
    throw new HttpsError('failed-precondition', 'Email verification is required.');
  }
  return { uid: auth.uid, email: auth.token.email || '' };
}

export const createClinicWithCode = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const payload = request.data as Record<string, unknown>;

  const name = String(payload.name ?? '').trim();
  const address = String(payload.address ?? '').trim();
  const city = String(payload.city ?? '').trim();
  const state = String(payload.state ?? '').trim();
  const pincode = String(payload.pincode ?? '').trim();
  const phone = String(payload.phone ?? '').trim();
  const email = String(payload.email ?? '').trim();
  const logoUrl = String(payload.logoUrl ?? '').trim();
  const consultationFee = Number(payload.consultationFee ?? 0);
  const openingTime = String(payload.openingTime ?? '09:00').trim();
  const closingTime = String(payload.closingTime ?? '20:00').trim();
  const workingDays = Array.isArray(payload.workingDays) ? payload.workingDays : [];
  const appointmentDuration = Number(payload.appointmentDuration ?? 15);

  if (name.length < 2 || address.length < 3 || city.length < 2 || state.length < 2) {
    throw new HttpsError('invalid-argument', 'Required clinic details are incomplete.');
  }

  return db.runTransaction(async (tx) => {
    const clinicRef = db.collection('clinics').doc();
    const clinicId = clinicRef.id;

    let joiningCode = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateSecureCode();
      const codeSnap = await tx.get(db.collection('clinicCodes').doc(candidate));
      if (!codeSnap.exists) {
        joiningCode = candidate;
        break;
      }
    }

    if (!joiningCode) {
      throw new HttpsError('aborted', 'Unable to allocate unique joining code. Please retry.');
    }

    const now = FieldValue.serverTimestamp();
    const membershipRef = db.collection('clinicMemberships').doc(`${clinicId}_${uid}`);
    const codeRef = db.collection('clinicCodes').doc(joiningCode);

    tx.set(clinicRef, {
      name,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      logoUrl,
      ownerId: uid,
      joiningCode,
      joiningCodeActive: true,
      consultationFee,
      currency: 'INR',
      openingTime,
      closingTime,
      workingDays,
      appointmentDuration,
      createdAt: now,
      updatedAt: now,
    });

    tx.set(membershipRef, {
      clinicId,
      clinicOwnerId: uid,
      userId: uid,
      role: 'owner',
      isPractisingDoctor: true,
      status: 'active',
      joinedAt: now,
    });

    tx.set(codeRef, {
      clinicId,
      ownerId: uid,
      publicName: name,
      publicAddress: address,
      publicCity: city,
      publicState: state,
      active: true,
      createdAt: now,
    });

    return { clinicId, joiningCode };
  });
});

export const regenerateClinicCode = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const clinicId = String(request.data?.clinicId ?? '').trim();
  if (!clinicId) {
    throw new HttpsError('invalid-argument', 'clinicId is required.');
  }

  return db.runTransaction(async (tx) => {
    const clinicRef = db.collection('clinics').doc(clinicId);
    const clinicSnap = await tx.get(clinicRef);
    if (!clinicSnap.exists) {
      throw new HttpsError('not-found', 'Clinic not found.');
    }
    const clinic = clinicSnap.data()!;
    if (clinic.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the clinic owner can rotate the joining code.');
    }

    let nextCode = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateSecureCode();
      const snap = await tx.get(db.collection('clinicCodes').doc(candidate));
      if (!snap.exists) {
        nextCode = candidate;
        break;
      }
    }
    if (!nextCode) {
      throw new HttpsError('aborted', 'Could not generate a unique code.');
    }

    if (clinic.joiningCode) {
      tx.update(db.collection('clinicCodes').doc(clinic.joiningCode), { active: false });
    }

    const now = FieldValue.serverTimestamp();
    tx.set(db.collection('clinicCodes').doc(nextCode), {
      clinicId,
      ownerId: uid,
      publicName: clinic.name,
      publicAddress: clinic.address,
      publicCity: clinic.city,
      publicState: clinic.state,
      active: true,
      createdAt: now,
    });

    tx.update(clinicRef, {
      joiningCode: nextCode,
      joiningCodeActive: true,
      updatedAt: now,
    });

    return { clinicId, joiningCode: nextCode };
  });
});

export const revokeClinicCode = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const clinicId = String(request.data?.clinicId ?? '').trim();
  if (!clinicId) {
    throw new HttpsError('invalid-argument', 'clinicId is required.');
  }

  return db.runTransaction(async (tx) => {
    const clinicRef = db.collection('clinics').doc(clinicId);
    const clinicSnap = await tx.get(clinicRef);
    if (!clinicSnap.exists) {
      throw new HttpsError('not-found', 'Clinic not found.');
    }
    const clinic = clinicSnap.data()!;
    if (clinic.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the clinic owner can revoke the joining code.');
    }

    if (clinic.joiningCode) {
      tx.update(db.collection('clinicCodes').doc(clinic.joiningCode), { active: false });
    }

    tx.update(clinicRef, {
      joiningCode: '',
      joiningCodeActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { clinicId, joiningCodeActive: false };
  });
});

export const resolveClinicCode = onCall(async (request) => {
  const rawCode = String(request.data?.code ?? '').trim().toUpperCase();
  const rateKey = crypto
    .createHash('sha256')
    .update(request.auth?.uid || request.rawRequest?.ip || 'anon')
    .digest('hex');

  const rateRef = db.collection('codeLookupRateLimits').doc(rateKey);
  const rateSnap = await rateRef.get();
  const nowMs = Date.now();
  if (rateSnap.exists) {
    const data = rateSnap.data()!;
    const blockedUntil = data.blockedUntil instanceof Timestamp ? data.blockedUntil.toMillis() : 0;
    if (blockedUntil > nowMs) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many invalid clinic code attempts. Please wait a minute and try again.',
      );
    }
  }

  if (!/^CLINIC-[A-Z0-9]{4,12}$/.test(rawCode)) {
    throw new HttpsError('invalid-argument', 'Invalid clinic code format.');
  }

  const codeSnap = await db.collection('clinicCodes').doc(rawCode).get();
  if (!codeSnap.exists || !codeSnap.data()?.active) {
    const prevCount = rateSnap.exists ? Number(rateSnap.data()?.failures || 0) : 0;
    const nextCount = prevCount + 1;
    await rateRef.set({
      failures: nextCount,
      blockedUntil: nextCount >= 5 ? Timestamp.fromMillis(nowMs + 60_000) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError('not-found', 'Clinic code is invalid or no longer active.');
  }

  if (rateSnap.exists) {
    await rateRef.delete();
  }

  const clinicSnap = await db.collection('clinics').doc(codeSnap.data()!.clinicId).get();
  if (!clinicSnap.exists) {
    throw new HttpsError('not-found', 'Clinic record not found.');
  }

  const clinic = clinicSnap.data()!;
  return {
    clinicId: clinicSnap.id,
    clinicName: clinic.name,
    address: `${clinic.address}, ${clinic.city}, ${clinic.state}`,
    valid: true,
  };
});

export const reviewJoinRequest = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const requestId = String(request.data?.requestId ?? '').trim();
  const decision = String(request.data?.decision ?? '').trim();

  if (!requestId || (decision !== 'approved' && decision !== 'rejected')) {
    throw new HttpsError('invalid-argument', 'Valid requestId and decision are required.');
  }

  return db.runTransaction(async (tx) => {
    const reqRef = db.collection('clinicJoinRequests').doc(requestId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Join request not found.');
    }

    const reqData = reqSnap.data()!;
    if (reqData.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request has already been reviewed.');
    }
    if (reqData.userId === uid) {
      throw new HttpsError('permission-denied', 'You cannot approve your own join request.');
    }

    const clinicSnap = await tx.get(db.collection('clinics').doc(reqData.clinicId));
    if (!clinicSnap.exists || clinicSnap.data()!.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the clinic owner can review join requests.');
    }

    const now = FieldValue.serverTimestamp();
    tx.update(reqRef, {
      status: decision,
      reviewedAt: now,
      reviewedBy: uid,
    });

    if (decision === 'approved') {
      tx.set(db.collection('clinicMemberships').doc(requestId), {
        clinicId: reqData.clinicId,
        clinicOwnerId: uid,
        userId: reqData.userId,
        memberName: reqData.applicantName,
        memberEmail: reqData.applicantEmail,
        memberMobile: reqData.applicantMobile,
        role: 'receptionist',
        status: 'active',
        joinedAt: now,
      });
    }

    tx.set(db.collection('staffAuditLogs').doc(), {
      clinicId: reqData.clinicId,
      clinicOwnerId: uid,
      actorUid: uid,
      targetUid: reqData.userId,
      targetName: reqData.applicantName,
      action: decision === 'approved' ? 'approved_receptionist' : 'rejected_request',
      createdAt: now,
    });

    return { requestId, status: decision };
  });
});

export const revokeStaffAccess = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const membershipId = String(request.data?.membershipId ?? '').trim();
  if (!membershipId) {
    throw new HttpsError('invalid-argument', 'membershipId is required.');
  }

  return db.runTransaction(async (tx) => {
    const memRef = db.collection('clinicMemberships').doc(membershipId);
    const memSnap = await tx.get(memRef);
    if (!memSnap.exists) {
      throw new HttpsError('not-found', 'Membership not found.');
    }

    const mem = memSnap.data()!;
    if (mem.role === 'owner' || mem.userId === uid) {
      throw new HttpsError('failed-precondition', 'Clinic owner access cannot be revoked.');
    }

    const clinicSnap = await tx.get(db.collection('clinics').doc(mem.clinicId));
    if (!clinicSnap.exists || clinicSnap.data()!.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the clinic owner can revoke staff access.');
    }

    const now = FieldValue.serverTimestamp();
    tx.update(memRef, {
      status: 'revoked',
      revokedAt: now,
    });

    tx.set(db.collection('staffAuditLogs').doc(), {
      clinicId: mem.clinicId,
      clinicOwnerId: uid,
      actorUid: uid,
      targetUid: mem.userId,
      targetName: mem.memberName || 'Receptionist',
      action: 'revoked_access',
      createdAt: now,
    });

    return { membershipId, status: 'revoked' };
  });
});

export const registerClinicPatient = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const payload = request.data as Record<string, unknown>;
  const clinicId = String(payload.clinicId ?? '').trim();
  const fullName = String(payload.fullName ?? '').trim();
  const mobile = String(payload.mobile ?? '').trim();

  if (!clinicId || fullName.length < 2 || mobile.length < 7) {
    throw new HttpsError('invalid-argument', 'Valid clinicId, fullName, and mobile are required.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const actorRole = String(memSnap.data()!.role || 'receptionist');
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');

  const digits = mobile.replace(/\D/g, '');
  const mobileLast10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const year = new Date().getFullYear();

  return db.runTransaction(async (tx) => {
    const counterRef = db.collection('clinics').doc(clinicId).collection('counters').doc('patientCounter');
    const counterSnap = await tx.get(counterRef);
    const nextSeq =
      counterSnap.exists && counterSnap.data()?.year === year
        ? Number(counterSnap.data()?.seq || 0) + 1
        : 1;
    const patientId = `PAT-${year}-${String(nextSeq).padStart(4, '0')}`;
    const now = FieldValue.serverTimestamp();

    const patientRef = db.collection('clinics').doc(clinicId).collection('patients').doc();
    const auditRef = db.collection('clinics').doc(clinicId).collection('patientAuditLogs').doc();

    tx.set(counterRef, { clinicId, year, seq: nextSeq, updatedAt: now });
    tx.set(patientRef, {
      patientId,
      clinicId,
      fullName: fullName.slice(0, 120),
      fullNameLower: fullName.toLowerCase().slice(0, 120),
      dateOfBirth: payload.dateOfBirth ? String(payload.dateOfBirth).slice(0, 10) : null,
      age: typeof payload.age === 'number' ? payload.age : null,
      gender: payload.gender || null,
      mobile: mobile.slice(0, 24),
      mobileLast10: mobileLast10.slice(0, 15),
      alternateMobile: String(payload.alternateMobile ?? '').trim().slice(0, 24),
      address: String(payload.address ?? '').trim().slice(0, 300),
      city: String(payload.city ?? '').trim().slice(0, 100),
      pincode: String(payload.pincode ?? '').trim().slice(0, 12),
      allergies: Array.isArray(payload.allergies) ? payload.allergies.slice(0, 30) : [],
      existingConditions: Array.isArray(payload.existingConditions) ? payload.existingConditions.slice(0, 30) : [],
      currentMedications: Array.isArray(payload.currentMedications) ? payload.currentMedications.slice(0, 30) : [],
      emergencyContact: payload.emergencyContact || null,
      medicalNotes: String(payload.medicalNotes ?? '').trim().slice(0, 2000),
      registrationDate: now,
      registeredBy: uid,
      registeredByName: actorName.slice(0, 120),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(auditRef, {
      clinicId,
      patientDocId: patientRef.id,
      patientId,
      patientName: fullName.slice(0, 120),
      actorUid: uid,
      actorName: actorName.slice(0, 120),
      actorRole,
      action: 'registered_patient',
      summary: `Registered patient ${patientId}`,
      createdAt: now,
    });

    return { docId: patientRef.id, patientId };
  });
});

function getClinicQueueDateServer(timezone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export const addPatientToQueue = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const clinicId = String(request.data?.clinicId ?? '').trim();
  const patientDocumentId = String(request.data?.patientDocumentId ?? '').trim();
  if (!clinicId || !patientDocumentId) {
    throw new HttpsError('invalid-argument', 'clinicId and patientDocumentId are required.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const actorRole = String(memSnap.data()!.role || 'receptionist');
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');

  const clinicSnap = await db.collection('clinics').doc(clinicId).get();
  if (!clinicSnap.exists) {
    throw new HttpsError('not-found', 'Clinic not found.');
  }
  const clinicData = clinicSnap.data()!;
  const timezone = String(clinicData.timezone || 'Asia/Kolkata');
  const queueDate = getClinicQueueDateServer(timezone);

  const patientSnap = await db.collection('clinics').doc(clinicId).collection('patients').doc(patientDocumentId).get();
  if (!patientSnap.exists || patientSnap.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Active patient record not found.');
  }
  const patient = patientSnap.data()!;

  return db.runTransaction(async (tx) => {
    const counterRef = db.collection('clinics').doc(clinicId).collection('dailyQueues').doc(queueDate);
    const counterSnap = await tx.get(counterRef);
    const nextSeq = counterSnap.exists ? Number(counterSnap.data()?.seq || 0) + 1 : 1;
    const tokenLabel = String(nextSeq).padStart(3, '0');
    const now = FieldValue.serverTimestamp();

    const entryRef = counterRef.collection('entries').doc();
    const auditRef = db.collection('clinics').doc(clinicId).collection('queueAuditLogs').doc();

    tx.set(counterRef, { clinicId, queueDate, timezone, seq: nextSeq, updatedAt: now });
    tx.set(entryRef, {
      clinicId,
      patientId: patient.patientId,
      patientDocumentId,
      patientName: patient.fullName,
      patientAge: patient.age ?? null,
      patientGender: patient.gender ?? null,
      patientMobile: patient.mobile || '',
      tokenNumber: nextSeq,
      tokenLabel,
      queueDate,
      timezone,
      status: 'waiting',
      assignedDoctorId: null,
      assignedDoctorName: null,
      priority: false,
      priorityChangedBy: null,
      priorityChangedByName: null,
      priorityReason: null,
      cancelReason: null,
      arrivalTime: now,
      calledAt: null,
      acceptedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdBy: uid,
      createdByName: actorName,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(auditRef, {
      clinicId,
      queueDate,
      entryId: entryRef.id,
      tokenNumber: nextSeq,
      patientId: patient.patientId,
      patientName: patient.fullName,
      actorUid: uid,
      actorName,
      actorRole,
      action: 'added_to_queue',
      summary: `Added ${patient.fullName} (${patient.patientId}) as Token #${tokenLabel}`,
      reason: null,
      createdAt: now,
    });

    return { entryId: entryRef.id, tokenNumber: nextSeq, tokenLabel, queueDate };
  });
});

export const transitionQueueEntry = onCall(async (request) => {
  const { uid } = assertVerifiedAuth(request.auth);
  const clinicId = String(request.data?.clinicId ?? '').trim();
  const queueDate = String(request.data?.queueDate ?? '').trim();
  const entryId = String(request.data?.entryId ?? '').trim();
  const action = String(request.data?.action ?? '').trim();
  const reason = String(request.data?.reason ?? '').trim().slice(0, 240);

  if (!clinicId || !queueDate || !entryId || !action) {
    throw new HttpsError('invalid-argument', 'clinicId, queueDate, entryId, and action are required.');
  }

  const memSnap = await db.collection('clinicMemberships').doc(`${clinicId}_${uid}`).get();
  if (!memSnap.exists || memSnap.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Active clinic membership is required.');
  }
  const role = String(memSnap.data()!.role || 'receptionist');
  const actorName = String(memSnap.data()?.memberName || 'Clinic Staff');
  const isDoctorOrOwner = role === 'owner' || role === 'doctor';

  if (action !== 'cancel' && !isDoctorOrOwner) {
    throw new HttpsError('permission-denied', 'Only doctors can perform clinical queue transitions.');
  }

  return db.runTransaction(async (tx) => {
    const entryRef = db.collection('clinics').doc(clinicId).collection('dailyQueues').doc(queueDate).collection('entries').doc(entryId);
    const snap = await tx.get(entryRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Queue entry not found.');
    }
    const entry = snap.data()!;
    const now = FieldValue.serverTimestamp();

    if (entry.status === 'completed' || entry.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Completed or cancelled entries cannot be modified.');
    }

    if (action === 'accept') {
      if (entry.status !== 'waiting' && entry.status !== 'called') {
        throw new HttpsError('failed-precondition', 'Only waiting or called entries can be accepted.');
      }
      if (entry.assignedDoctorId && entry.assignedDoctorId !== uid) {
        throw new HttpsError('aborted', 'Entry already accepted by another doctor.');
      }
      tx.update(entryRef, {
        status: 'in_consultation',
        assignedDoctorId: uid,
        assignedDoctorName: actorName,
        acceptedAt: now,
        updatedAt: now,
      });
    } else if (action === 'complete') {
      if (entry.status !== 'in_consultation') {
        throw new HttpsError('failed-precondition', 'Only in-consultation entries can be completed.');
      }
      tx.update(entryRef, { status: 'completed', completedAt: now, updatedAt: now });
    } else if (action === 'hold') {
      if (!['waiting', 'called', 'in_consultation'].includes(entry.status)) {
        throw new HttpsError('failed-precondition', 'Invalid status transition to hold.');
      }
      tx.update(entryRef, { status: 'on_hold', updatedAt: now });
    } else if (action === 'skip') {
      if (!['waiting', 'called', 'on_hold'].includes(entry.status)) {
        throw new HttpsError('failed-precondition', 'Invalid status transition to skip.');
      }
      tx.update(entryRef, { status: 'skipped', updatedAt: now });
    } else if (action === 'resume') {
      if (entry.status !== 'on_hold' && entry.status !== 'skipped') {
        throw new HttpsError('failed-precondition', 'Only on-hold or skipped entries can resume.');
      }
      tx.update(entryRef, { status: 'waiting', assignedDoctorId: null, assignedDoctorName: null, updatedAt: now });
    } else if (action === 'cancel') {
      if (!['waiting', 'called', 'on_hold', 'skipped'].includes(entry.status)) {
        throw new HttpsError('failed-precondition', 'Cannot cancel in-consultation or completed entry.');
      }
      tx.update(entryRef, {
        status: 'cancelled',
        cancelReason: reason || 'Removed mistakenly added entry',
        cancelledAt: now,
        updatedAt: now,
      });
    } else {
      throw new HttpsError('invalid-argument', 'Unsupported queue action.');
    }

    return { entryId, action };
  });
});

export {
  createClinicAppointment,
  processAppointmentReminders,
  rescheduleClinicAppointment,
  transitionAppointmentStatus,
  whatsappWebhook,
} from './appointments.js';
