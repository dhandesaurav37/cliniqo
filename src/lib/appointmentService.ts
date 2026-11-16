import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  buildSlotLockKey,
  computeScheduledAtUtcMs,
  formatDateHuman,
  formatTime12h,
  parseTimeToMinutes,
  validateClinicSlotAvailability,
  type AppointmentStatus,
  type AppointmentType,
  type NotificationLogDeliveryStatus,
  type PreferredCommMethod,
  type ReminderStatus,
  type WhatsAppNotificationStatus,
} from './appointmentLogic';
import type { ClinicRecord, MembershipRole, NotificationType } from './clinicService';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { PatientRecord } from './patientService';

export interface ClinicDoctorOption {
  uid: string;
  name: string;
  role: 'owner' | 'doctor';
  email?: string;
}

export interface AppointmentRecord {
  id: string;
  clinicId: string;
  clinicName: string;
  patientDocId: string;
  patientId: string;
  patientName: string;
  patientMobile: string;
  patientMobileLast10: string;
  doctorId: string;
  doctorName: string;
  consultationId?: string | null;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  scheduledAtUtcMs: number;
  timezone: string;
  appointmentType: AppointmentType;
  reason?: string | null;
  additionalInstructions?: string | null;
  internalNotes?: string | null;
  status: AppointmentStatus;
  cancelReason?: string | null;
  rescheduleCount: number;
  whatsappNotificationStatus: WhatsAppNotificationStatus;
  whatsappConfirmationSentAt?: Timestamp | null;
  lastWhatsappError?: string | null;
  reminder24hStatus: ReminderStatus;
  reminder2hStatus: ReminderStatus;
  confirmedAt?: Timestamp | null;
  confirmedVia?: 'staff' | 'whatsapp_webhook' | null;
  rescheduleRequestedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  cancelledAt?: Timestamp | null;
  createdBy: string;
  createdByName?: string;
  createdByRole: MembershipRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PatientCommPrefsRecord {
  id: string;
  clinicId: string;
  patientDocId: string;
  patientId: string;
  mobile: string;
  whatsappConsent: boolean;
  consentTimestamp?: Timestamp | null;
  preferredMethod: PreferredCommMethod;
  whatsappEnabled: boolean;
  updatedBy: string;
  updatedByName?: string;
  updatedAt?: Timestamp;
}

export interface AppointmentLogRecord {
  id: string;
  clinicId: string;
  appointmentId: string;
  patientDocId: string;
  patientId: string;
  patientName: string;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole | 'system';
  action:
    | 'scheduled'
    | 'confirmed'
    | 'rescheduled'
    | 'reschedule_requested'
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'consent_updated';
  previousDate?: string | null;
  previousTime?: string | null;
  newDate?: string | null;
  newTime?: string | null;
  reason?: string | null;
  summary: string;
  createdAt?: Timestamp;
}

export interface NotificationLogRecord {
  id: string;
  clinicId: string;
  appointmentId: string;
  patientDocId: string;
  patientId: string;
  patientName: string;
  channel: 'whatsapp';
  recipientMobile: string;
  messageType: 'confirmation' | 'reminder_24h' | 'reminder_2h' | 'reschedule' | 'cancellation';
  scheduleSlotKey: string;
  idempotencyKey: string;
  templateName?: string | null;
  deliveryStatus: NotificationLogDeliveryStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  readAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const USE_CLOUD_FUNCTIONS = import.meta.env.VITE_USE_CLOUD_FUNCTIONS === 'true';

function extractLast10Digits(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function isReceptionistAuthorizedToCreate(clinic: ClinicRecord | null, role?: MembershipRole): boolean {
  if (!clinic) return false;
  if (role === 'owner' || role === 'doctor') return true;
  if (role === 'receptionist') {
    return clinic.receptionistPermissions?.canCreateAppointments !== false;
  }
  return false;
}

export function isReceptionistAuthorizedToCancel(clinic: ClinicRecord | null, role?: MembershipRole): boolean {
  if (!clinic) return false;
  if (role === 'owner' || role === 'doctor') return true;
  if (role === 'receptionist') {
    return clinic.receptionistPermissions?.canCancelAppointments !== false;
  }
  return false;
}

export async function fetchClinicDoctors(
  clinic: ClinicRecord,
  currentUid: string,
  currentRole: MembershipRole,
): Promise<ClinicDoctorOption[]> {
  try {
    if (currentRole === 'owner' || clinic.ownerId === currentUid) {
      const snap = await getDocs(
        query(
          collection(db, 'clinicMemberships'),
          where('clinicOwnerId', '==', clinic.ownerId),
          where('clinicId', '==', clinic.id),
        ),
      );
      const doctors = snap.docs
        .map((d) => d.data())
        .filter((d) => d.status === 'active' && (d.role === 'owner' || d.role === 'doctor'))
        .map((d) => ({
          uid: String(d.userId),
          name: String(d.memberName || 'Clinic Doctor'),
          role: (d.role === 'owner' ? 'owner' : 'doctor') as 'owner' | 'doctor',
          email: d.memberEmail ? String(d.memberEmail) : undefined,
        }));
      if (doctors.length > 0) return doctors;
    }

    // Fallback or receptionist view: read clinic owner membership card directly (permitted by rules)
    const ownerMemSnap = await getDoc(doc(db, 'clinicMemberships', `${clinic.id}_${clinic.ownerId}`));
    if (ownerMemSnap.exists()) {
      const data = ownerMemSnap.data();
      return [
        {
          uid: clinic.ownerId,
          name: String(data.memberName || 'Clinic Doctor'),
          role: 'owner',
          email: data.memberEmail ? String(data.memberEmail) : undefined,
        },
      ];
    }

    return [
      {
        uid: clinic.ownerId,
        name: 'Clinic Doctor',
        role: 'owner',
      },
    ];
  } catch {
    return [
      {
        uid: clinic.ownerId,
        name: 'Clinic Doctor',
        role: 'owner',
      },
    ];
  }
}

export function subscribeToClinicAppointments(
  clinicId: string,
  onData: (appointments: AppointmentRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'clinics', clinicId, 'appointments'), where('clinicId', '==', clinicId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentRecord, 'id'>) }))
        .sort((a, b) => a.scheduledAtUtcMs - b.scheduledAtUtcMs);
      onData(list);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function fetchClinicAppointments(clinicId: string): Promise<AppointmentRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'clinics', clinicId, 'appointments'), where('clinicId', '==', clinicId)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentRecord, 'id'>) }))
      .sort((a, b) => a.scheduledAtUtcMs - b.scheduledAtUtcMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `clinics/${clinicId}/appointments`);
  }
}

export async function fetchAppointmentById(
  clinicId: string,
  appointmentId: string,
): Promise<AppointmentRecord | null> {
  try {
    const snap = await getDoc(doc(db, 'clinics', clinicId, 'appointments', appointmentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<AppointmentRecord, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `clinics/${clinicId}/appointments/${appointmentId}`);
  }
}

export async function fetchPatientAppointments(
  clinicId: string,
  patientDocId: string,
): Promise<AppointmentRecord[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'appointments'),
        where('clinicId', '==', clinicId),
        where('patientDocId', '==', patientDocId),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentRecord, 'id'>) }))
      .sort((a, b) => b.scheduledAtUtcMs - a.scheduledAtUtcMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `clinics/${clinicId}/appointments`);
  }
}

export async function fetchConsultationAppointments(
  clinicId: string,
  consultationId: string,
): Promise<AppointmentRecord[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'appointments'),
        where('clinicId', '==', clinicId),
        where('consultationId', '==', consultationId),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentRecord, 'id'>) }))
      .sort((a, b) => b.scheduledAtUtcMs - a.scheduledAtUtcMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `clinics/${clinicId}/appointments`);
  }
}

export async function fetchAppointmentLogs(
  clinicId: string,
  appointmentId: string,
): Promise<AppointmentLogRecord[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'appointmentLogs'),
        where('clinicId', '==', clinicId),
        where('appointmentId', '==', appointmentId),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentLogRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `clinics/${clinicId}/appointmentLogs`);
  }
}

export async function fetchAppointmentNotificationLogs(
  clinicId: string,
  appointmentId: string,
): Promise<NotificationLogRecord[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'notificationLogs'),
        where('clinicId', '==', clinicId),
        where('appointmentId', '==', appointmentId),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationLogRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `clinics/${clinicId}/notificationLogs`);
  }
}

export async function fetchPatientCommPrefs(
  clinicId: string,
  patientDocId: string,
): Promise<PatientCommPrefsRecord | null> {
  try {
    const snap = await getDoc(doc(db, 'clinics', clinicId, 'patientCommPrefs', patientDocId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<PatientCommPrefsRecord, 'id'>) };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.GET,
      `clinics/${clinicId}/patientCommPrefs/${patientDocId}`,
    );
  }
}

export async function upsertPatientCommPrefs(params: {
  clinicId: string;
  patientDocId: string;
  patientId: string;
  mobile: string;
  whatsappConsent: boolean;
  preferredMethod: PreferredCommMethod;
  whatsappEnabled: boolean;
  actorUid: string;
  actorName: string;
}): Promise<PatientCommPrefsRecord> {
  const {
    clinicId,
    patientDocId,
    patientId,
    mobile,
    whatsappConsent,
    preferredMethod,
    whatsappEnabled,
    actorUid,
    actorName,
  } = params;

  const ref = doc(db, 'clinics', clinicId, 'patientCommPrefs', patientDocId);
  const path = `clinics/${clinicId}/patientCommPrefs/${patientDocId}`;
  try {
    const existing = await getDoc(ref);
    const prevConsentTimestamp = existing.exists() ? existing.data().consentTimestamp || null : null;
    const nextConsentTs = whatsappConsent
      ? prevConsentTimestamp || serverTimestamp()
      : null;

    await setDoc(ref, {
      clinicId,
      patientDocId,
      patientId,
      mobile: mobile.trim().slice(0, 24),
      whatsappConsent: Boolean(whatsappConsent),
      consentTimestamp: nextConsentTs,
      preferredMethod,
      whatsappEnabled: Boolean(whatsappEnabled),
      updatedBy: actorUid,
      updatedByName: actorName.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    const updated = await getDoc(ref);
    return { id: updated.id, ...(updated.data() as Omit<PatientCommPrefsRecord, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function emitLocalAppointmentNotifications(params: {
  clinicId: string;
  clinicOwnerId: string;
  doctorId: string;
  actorUid: string;
  type: NotificationType;
  title: string;
  message: string;
}) {
  const { clinicId, clinicOwnerId, doctorId, actorUid, type, title, message } = params;
  const recipients = new Set<string>([clinicOwnerId, doctorId]);
  recipients.delete(actorUid); // Notify clinic peers; if empty, skip
  if (recipients.size === 0) return;

  await Promise.all(
    Array.from(recipients).map((recipientUid) =>
      setDoc(doc(collection(db, 'notifications')), {
        recipientUid,
        clinicId,
        type,
        title: title.slice(0, 140),
        message: message.slice(0, 400),
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => undefined),
    ),
  );
}

export interface CreateAppointmentInput {
  clinic: ClinicRecord;
  patient: Pick<PatientRecord, 'id' | 'patientId' | 'fullName' | 'mobile'>;
  doctorId: string;
  doctorName: string;
  consultationId?: string | null;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes?: number;
  appointmentType: AppointmentType;
  reason: string;
  additionalInstructions: string;
  internalNotes: string;
  sendWhatsapp: boolean;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<{
  appointmentId: string;
  whatsappNotificationStatus: WhatsAppNotificationStatus;
  whatsappMessage: string;
}> {
  const {
    clinic,
    patient,
    doctorId,
    doctorName,
    consultationId,
    appointmentDate,
    appointmentTime,
    appointmentType,
    reason,
    additionalInstructions,
    internalNotes,
    sendWhatsapp,
    actorUid,
    actorName,
    actorRole,
  } = input;

  if (!isReceptionistAuthorizedToCreate(clinic, actorRole)) {
    throw new Error('Receptionists are not authorized to schedule appointments for this clinic.');
  }

  const durationMinutes = Math.min(
    180,
    Math.max(5, Number(input.durationMinutes || clinic.appointmentDuration || 15)),
  );
  const validationErr = validateClinicSlotAvailability({
    clinic,
    appointmentDate,
    appointmentTime,
    durationMinutes,
  });
  if (validationErr) {
    throw new Error(validationErr);
  }

  if (USE_CLOUD_FUNCTIONS) {
    try {
      const fn = httpsCallable<Record<string, unknown>, {
        appointmentId: string;
        whatsappNotificationStatus: WhatsAppNotificationStatus;
        whatsappError?: string | null;
      }>(getFunctions(db.app), 'createClinicAppointment');
      const result = await fn({
        clinicId: clinic.id,
        patientDocId: patient.id,
        doctorId,
        doctorName,
        consultationId: consultationId || null,
        appointmentDate,
        appointmentTime,
        durationMinutes,
        appointmentType,
        reason,
        additionalInstructions,
        internalNotes,
        sendWhatsapp,
      });
      const st = result.data.whatsappNotificationStatus;
      return {
        appointmentId: result.data.appointmentId,
        whatsappNotificationStatus: st,
        whatsappMessage:
          st === 'sent'
            ? 'WhatsApp confirmation sent via Meta Cloud API.'
            : result.data.whatsappError || 'Appointment saved.',
      };
    } catch (fnError: unknown) {
      const code = (fnError as { code?: string })?.code || '';
      if (code === 'functions/already-exists' || code === 'functions/invalid-argument' || code === 'functions/failed-precondition' || code === 'functions/permission-denied') {
        throw new Error(fnError instanceof Error ? fnError.message : 'Unable to schedule appointment.');
      }
      // Fall through to client atomic Firestore transaction if Cloud Function endpoint is unreachable
    }
  }

  const timezone = clinic.timezone || 'Asia/Kolkata';
  const scheduledAtUtcMs = computeScheduledAtUtcMs(appointmentDate, appointmentTime, timezone);
  const requestedStartMin = parseTimeToMinutes(appointmentTime);
  const requestedEndMin = requestedStartMin + durationMinutes;

  // Pre-check overlapping appointments for same doctor & date
  const sameDaySnap = await getDocs(
    query(
      collection(db, 'clinics', clinic.id, 'appointments'),
      where('clinicId', '==', clinic.id),
      where('doctorId', '==', doctorId),
      where('appointmentDate', '==', appointmentDate),
    ),
  );
  for (const d of sameDaySnap.docs) {
    const ex = d.data();
    if (['cancelled', 'no_show', 'completed'].includes(String(ex.status))) continue;
    const exStart = parseTimeToMinutes(String(ex.appointmentTime));
    const exEnd = exStart + Number(ex.durationMinutes || clinic.appointmentDuration || 15);
    if (requestedStartMin < exEnd && exStart < requestedEndMin) {
      throw new Error(
        `${doctorName} already has an appointment at ${formatTime12h(String(ex.appointmentTime))} on ${formatDateHuman(appointmentDate)}. Please choose another slot.`,
      );
    }
  }

  const commPrefs = await fetchPatientCommPrefs(clinic.id, patient.id);
  const hasConsent =
    sendWhatsapp &&
    Boolean(commPrefs?.whatsappConsent) &&
    commPrefs?.whatsappEnabled !== false &&
    commPrefs?.preferredMethod !== 'none' &&
    clinic.whatsappSettings?.enabled !== false;

  const waStatus: WhatsAppNotificationStatus = hasConsent
    ? 'skipped_not_configured'
    : 'skipped_no_consent';
  const waNote = hasConsent
    ? 'Patient consented. Cloud Functions WhatsApp dispatcher is offline in preview (enable VITE_USE_CLOUD_FUNCTIONS=true after deploying Cloud Functions + Meta Secret Manager credentials).'
    : !sendWhatsapp
      ? 'Staff opted out of sending WhatsApp notification for this booking.'
      : clinic.whatsappSettings?.enabled === false
        ? 'Clinic WhatsApp notifications are turned off in Clinic Settings.'
        : 'No active WhatsApp consent recorded for this patient.';

  const slotKey = buildSlotLockKey(doctorId, appointmentDate, appointmentTime);
  const appointmentRef = doc(collection(db, 'clinics', clinic.id, 'appointments'));
  const appointmentId = appointmentRef.id;
  const scheduleSlotKey = `${appointmentDate}_${appointmentTime}`;
  const notifLogKey = `${appointmentId}_confirmation_${scheduleSlotKey}`;

  try {
    await runTransaction(db, async (tx) => {
      const slotRef = doc(db, 'clinics', clinic.id, 'appointmentSlots', slotKey);
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists() && slotSnap.data()?.active === true) {
        throw new Error('This time slot has just been booked. Please pick another available time.');
      }

      const now = serverTimestamp();
      const msUntilVisit = scheduledAtUtcMs - Date.now();
      const rem24h: ReminderStatus =
        msUntilVisit > 24 * 60 * 60 * 1000 ? (hasConsent ? 'pending' : 'skipped_no_consent') : 'not_applicable';
      const rem2h: ReminderStatus =
        msUntilVisit > 2 * 60 * 60 * 1000 ? (hasConsent ? 'pending' : 'skipped_no_consent') : 'not_applicable';

      tx.set(slotRef, {
        clinicId: clinic.id,
        doctorId,
        appointmentDate,
        appointmentTime,
        appointmentId,
        active: true,
        updatedAt: now,
      });

      tx.set(appointmentRef, {
        clinicId: clinic.id,
        clinicName: clinic.name.slice(0, 140),
        patientDocId: patient.id,
        patientId: patient.patientId,
        patientName: patient.fullName.slice(0, 120),
        patientMobile: patient.mobile.slice(0, 24),
        patientMobileLast10: extractLast10Digits(patient.mobile),
        doctorId,
        doctorName: doctorName.slice(0, 120),
        consultationId: consultationId || null,
        appointmentDate,
        appointmentTime,
        durationMinutes,
        scheduledAtUtcMs,
        timezone,
        appointmentType,
        reason: reason.trim().slice(0, 300) || null,
        additionalInstructions: additionalInstructions.trim().slice(0, 1000) || null,
        internalNotes: internalNotes.trim().slice(0, 1000) || null,
        status: 'scheduled',
        cancelReason: null,
        rescheduleCount: 0,
        whatsappNotificationStatus: waStatus,
        whatsappConfirmationSentAt: null,
        lastWhatsappError: waNote.slice(0, 400),
        reminder24hStatus: rem24h,
        reminder2hStatus: rem2h,
        confirmedAt: null,
        confirmedVia: null,
        rescheduleRequestedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdBy: actorUid,
        createdByName: actorName.slice(0, 120),
        createdByRole: actorRole,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(doc(collection(db, 'clinics', clinic.id, 'appointmentLogs')), {
        clinicId: clinic.id,
        appointmentId,
        patientDocId: patient.id,
        patientId: patient.patientId,
        patientName: patient.fullName.slice(0, 120),
        actorUid,
        actorName: actorName.slice(0, 120),
        actorRole,
        action: 'scheduled',
        previousDate: null,
        previousTime: null,
        newDate: appointmentDate,
        newTime: appointmentTime,
        reason: reason.trim().slice(0, 300) || null,
        summary: `Scheduled ${appointmentType.replace('_', ' ')} for ${formatDateHuman(appointmentDate)} at ${formatTime12h(appointmentTime)}`,
        createdAt: now,
      });

      tx.set(doc(db, 'clinics', clinic.id, 'notificationLogs', notifLogKey), {
        clinicId: clinic.id,
        appointmentId,
        patientDocId: patient.id,
        patientId: patient.patientId,
        patientName: patient.fullName.slice(0, 120),
        channel: 'whatsapp',
        recipientMobile: patient.mobile.slice(0, 24),
        messageType: 'confirmation',
        scheduleSlotKey,
        idempotencyKey: notifLogKey,
        templateName:
          clinic.whatsappSettings?.templateConfirmation || 'cliniqo_appointment_confirmation',
        deliveryStatus: waStatus,
        providerMessageId: null,
        errorMessage: waNote.slice(0, 400),
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already been booked')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `clinics/${clinic.id}/appointments`);
  }

  await emitLocalAppointmentNotifications({
    clinicId: clinic.id,
    clinicOwnerId: clinic.ownerId,
    doctorId,
    actorUid,
    type: 'appointment_scheduled',
    title: `Appointment booked: ${patient.fullName}`,
    message: `${formatDateHuman(appointmentDate)} at ${formatTime12h(appointmentTime)} with ${doctorName}.`,
  });

  return {
    appointmentId,
    whatsappNotificationStatus: waStatus,
    whatsappMessage: waNote,
  };
}

export async function rescheduleAppointment(params: {
  clinic: ClinicRecord;
  appointment: AppointmentRecord;
  newDate: string;
  newTime: string;
  doctorId?: string;
  doctorName?: string;
  reason?: string;
  sendWhatsapp?: boolean;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<{ whatsappNotificationStatus: WhatsAppNotificationStatus; whatsappMessage: string }> {
  const {
    clinic,
    appointment,
    newDate,
    newTime,
    reason = '',
    sendWhatsapp = true,
    actorUid,
    actorName,
    actorRole,
  } = params;

  if (!isReceptionistAuthorizedToCreate(clinic, actorRole)) {
    throw new Error('Receptionists are not authorized to reschedule appointments.');
  }

  const targetDoctorId = params.doctorId || appointment.doctorId;
  const targetDoctorName = params.doctorName || appointment.doctorName;
  const durationMinutes = appointment.durationMinutes || clinic.appointmentDuration || 15;

  const validationErr = validateClinicSlotAvailability({
    clinic,
    appointmentDate: newDate,
    appointmentTime: newTime,
    durationMinutes,
  });
  if (validationErr) {
    throw new Error(validationErr);
  }

  if (USE_CLOUD_FUNCTIONS) {
    try {
      const fn = httpsCallable<Record<string, unknown>, {
        whatsappNotificationStatus: WhatsAppNotificationStatus;
        whatsappError?: string | null;
      }>(getFunctions(db.app), 'rescheduleClinicAppointment');
      const result = await fn({
        clinicId: clinic.id,
        appointmentId: appointment.id,
        appointmentDate: newDate,
        appointmentTime: newTime,
        doctorId: targetDoctorId,
        doctorName: targetDoctorName,
        reason,
        sendWhatsapp,
      });
      return {
        whatsappNotificationStatus: result.data.whatsappNotificationStatus,
        whatsappMessage:
          result.data.whatsappNotificationStatus === 'sent'
            ? 'Reschedule notification sent on WhatsApp.'
            : result.data.whatsappError || 'Appointment rescheduled.',
      };
    } catch (fnError: unknown) {
      const code = (fnError as { code?: string })?.code || '';
      if (code === 'functions/already-exists' || code === 'functions/invalid-argument' || code === 'functions/failed-precondition' || code === 'functions/permission-denied') {
        throw new Error(fnError instanceof Error ? fnError.message : 'Unable to reschedule appointment.');
      }
    }
  }

  const timezone = clinic.timezone || appointment.timezone || 'Asia/Kolkata';
  const scheduledAtUtcMs = computeScheduledAtUtcMs(newDate, newTime, timezone);
  const requestedStartMin = parseTimeToMinutes(newTime);
  const requestedEndMin = requestedStartMin + durationMinutes;

  const sameDaySnap = await getDocs(
    query(
      collection(db, 'clinics', clinic.id, 'appointments'),
      where('clinicId', '==', clinic.id),
      where('doctorId', '==', targetDoctorId),
      where('appointmentDate', '==', newDate),
    ),
  );
  for (const d of sameDaySnap.docs) {
    if (d.id === appointment.id) continue;
    const ex = d.data();
    if (['cancelled', 'no_show', 'completed'].includes(String(ex.status))) continue;
    const exStart = parseTimeToMinutes(String(ex.appointmentTime));
    const exEnd = exStart + Number(ex.durationMinutes || 15);
    if (requestedStartMin < exEnd && exStart < requestedEndMin) {
      throw new Error(
        `${targetDoctorName} already has an appointment at ${formatTime12h(String(ex.appointmentTime))} on ${formatDateHuman(newDate)}.`,
      );
    }
  }

  const commPrefs = await fetchPatientCommPrefs(clinic.id, appointment.patientDocId);
  const hasConsent =
    sendWhatsapp &&
    Boolean(commPrefs?.whatsappConsent) &&
    commPrefs?.whatsappEnabled !== false &&
    commPrefs?.preferredMethod !== 'none' &&
    clinic.whatsappSettings?.enabled !== false;

  const waStatus: WhatsAppNotificationStatus = hasConsent
    ? 'skipped_not_configured'
    : 'skipped_no_consent';
  const waNote = hasConsent
    ? 'Appointment rescheduled. Cloud Functions WhatsApp dispatcher is offline in preview.'
    : 'Patient has not granted active WhatsApp consent.';

  const oldSlotKey = buildSlotLockKey(
    appointment.doctorId,
    appointment.appointmentDate,
    appointment.appointmentTime,
  );
  const newSlotKey = buildSlotLockKey(targetDoctorId, newDate, newTime);
  const scheduleSlotKey = `${newDate}_${newTime}`;
  const notifLogKey = `${appointment.id}_reschedule_${scheduleSlotKey}`;

  try {
    await runTransaction(db, async (tx) => {
      const apptRef = doc(db, 'clinics', clinic.id, 'appointments', appointment.id);
      const apptSnap = await tx.get(apptRef);
      if (!apptSnap.exists()) throw new Error('Appointment not found.');
      const fresh = apptSnap.data();
      if (!['scheduled', 'confirmed', 'reschedule_requested'].includes(String(fresh.status))) {
        throw new Error('Completed or cancelled appointments cannot be rescheduled.');
      }

      const newSlotRef = doc(db, 'clinics', clinic.id, 'appointmentSlots', newSlotKey);
      const newSlotSnap = await tx.get(newSlotRef);
      if (newSlotKey !== oldSlotKey && newSlotSnap.exists() && newSlotSnap.data()?.active === true) {
        throw new Error('The selected time slot is already booked.');
      }

      const now = serverTimestamp();
      if (oldSlotKey !== newSlotKey) {
        tx.set(
          doc(db, 'clinics', clinic.id, 'appointmentSlots', oldSlotKey),
          {
            clinicId: clinic.id,
            doctorId: appointment.doctorId,
            appointmentDate: appointment.appointmentDate,
            appointmentTime: appointment.appointmentTime,
            appointmentId: appointment.id,
            active: false,
            updatedAt: now,
          },
          { merge: true },
        );
      }

      tx.set(newSlotRef, {
        clinicId: clinic.id,
        doctorId: targetDoctorId,
        appointmentDate: newDate,
        appointmentTime: newTime,
        appointmentId: appointment.id,
        active: true,
        updatedAt: now,
      });

      const msUntilVisit = scheduledAtUtcMs - Date.now();
      tx.update(apptRef, {
        doctorId: targetDoctorId,
        doctorName: targetDoctorName.slice(0, 120),
        appointmentDate: newDate,
        appointmentTime: newTime,
        durationMinutes,
        scheduledAtUtcMs,
        timezone,
        status: 'scheduled',
        rescheduleCount: Number(fresh.rescheduleCount || 0) + 1,
        whatsappNotificationStatus: waStatus,
        lastWhatsappError: waNote.slice(0, 400),
        reminder24hStatus:
          msUntilVisit > 24 * 60 * 60 * 1000 ? (hasConsent ? 'pending' : 'skipped_no_consent') : 'not_applicable',
        reminder2hStatus:
          msUntilVisit > 2 * 60 * 60 * 1000 ? (hasConsent ? 'pending' : 'skipped_no_consent') : 'not_applicable',
        updatedAt: now,
      });

      tx.set(doc(collection(db, 'clinics', clinic.id, 'appointmentLogs')), {
        clinicId: clinic.id,
        appointmentId: appointment.id,
        patientDocId: appointment.patientDocId,
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        actorUid,
        actorName: actorName.slice(0, 120),
        actorRole,
        action: 'rescheduled',
        previousDate: appointment.appointmentDate,
        previousTime: appointment.appointmentTime,
        newDate,
        newTime,
        reason: reason.trim().slice(0, 300) || null,
        summary: `Rescheduled from ${formatDateHuman(appointment.appointmentDate)} ${formatTime12h(appointment.appointmentTime)} to ${formatDateHuman(newDate)} ${formatTime12h(newTime)}`,
        createdAt: now,
      });

      tx.set(doc(db, 'clinics', clinic.id, 'notificationLogs', notifLogKey), {
        clinicId: clinic.id,
        appointmentId: appointment.id,
        patientDocId: appointment.patientDocId,
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        channel: 'whatsapp',
        recipientMobile: appointment.patientMobile,
        messageType: 'reschedule',
        scheduleSlotKey,
        idempotencyKey: notifLogKey,
        templateName:
          clinic.whatsappSettings?.templateReschedule || 'cliniqo_appointment_rescheduled',
        deliveryStatus: waStatus,
        providerMessageId: null,
        errorMessage: waNote.slice(0, 400),
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already booked')) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `clinics/${clinic.id}/appointments/${appointment.id}`,
    );
  }

  await emitLocalAppointmentNotifications({
    clinicId: clinic.id,
    clinicOwnerId: clinic.ownerId,
    doctorId: targetDoctorId,
    actorUid,
    type: 'appointment_rescheduled',
    title: `Appointment rescheduled: ${appointment.patientName}`,
    message: `Moved to ${formatDateHuman(newDate)} at ${formatTime12h(newTime)}.`,
  });

  return { whatsappNotificationStatus: waStatus, whatsappMessage: waNote };
}

export async function updateAppointmentStatus(params: {
  clinic: ClinicRecord;
  appointment: AppointmentRecord;
  nextStatus: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'reschedule_requested';
  cancelReason?: string;
  sendWhatsappOnCancel?: boolean;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const {
    clinic,
    appointment,
    nextStatus,
    cancelReason = '',
    sendWhatsappOnCancel = true,
    actorUid,
    actorName,
    actorRole,
  } = params;

  if (nextStatus === 'cancelled' && !isReceptionistAuthorizedToCancel(clinic, actorRole)) {
    throw new Error('Receptionists are not authorized to cancel appointments for this clinic.');
  }
  if (nextStatus === 'cancelled' && cancelReason.trim().length < 3) {
    throw new Error('Please enter a brief reason for cancelling the appointment.');
  }

  if (USE_CLOUD_FUNCTIONS) {
    try {
      const fn = httpsCallable(getFunctions(db.app), 'transitionAppointmentStatus');
      await fn({
        clinicId: clinic.id,
        appointmentId: appointment.id,
        status: nextStatus,
        cancelReason,
        sendWhatsapp: sendWhatsappOnCancel,
      });
      return;
    } catch (fnError: unknown) {
      const code = (fnError as { code?: string })?.code || '';
      if (code === 'functions/invalid-argument' || code === 'functions/failed-precondition' || code === 'functions/permission-denied') {
        throw new Error(fnError instanceof Error ? fnError.message : 'Unable to update appointment.');
      }
    }
  }

  const slotKey = buildSlotLockKey(
    appointment.doctorId,
    appointment.appointmentDate,
    appointment.appointmentTime,
  );

  let waCancelStatus: WhatsAppNotificationStatus = appointment.whatsappNotificationStatus;
  let waCancelNote = '';
  if (nextStatus === 'cancelled') {
    const prefs = await fetchPatientCommPrefs(clinic.id, appointment.patientDocId);
    const hasConsent =
      sendWhatsappOnCancel &&
      Boolean(prefs?.whatsappConsent) &&
      prefs?.whatsappEnabled !== false &&
      prefs?.preferredMethod !== 'none' &&
      clinic.whatsappSettings?.enabled !== false;
    waCancelStatus = hasConsent ? 'skipped_not_configured' : 'skipped_no_consent';
    waCancelNote = hasConsent
      ? 'Appointment cancelled. Cloud Functions WhatsApp dispatcher is offline in preview.'
      : 'No active WhatsApp consent or cancellation notice disabled.';
  }

  try {
    await runTransaction(db, async (tx) => {
      const apptRef = doc(db, 'clinics', clinic.id, 'appointments', appointment.id);
      const apptSnap = await tx.get(apptRef);
      if (!apptSnap.exists()) throw new Error('Appointment not found.');
      const fresh = apptSnap.data();
      if (!['scheduled', 'confirmed', 'reschedule_requested'].includes(String(fresh.status))) {
        throw new Error('Completed or cancelled appointments cannot be modified.');
      }

      const now = serverTimestamp();
      const updates: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: now,
      };

      if (nextStatus === 'confirmed') {
        updates.confirmedAt = now;
        updates.confirmedVia = 'staff';
      } else if (nextStatus === 'completed') {
        updates.completedAt = now;
        if (fresh.reminder24hStatus === 'pending') updates.reminder24hStatus = 'not_applicable';
        if (fresh.reminder2hStatus === 'pending') updates.reminder2hStatus = 'not_applicable';
      } else if (nextStatus === 'cancelled') {
        updates.cancelledAt = now;
        updates.cancelReason = cancelReason.trim().slice(0, 300);
        updates.whatsappNotificationStatus = waCancelStatus;
        updates.lastWhatsappError = waCancelNote.slice(0, 400);
        if (fresh.reminder24hStatus === 'pending') updates.reminder24hStatus = 'not_applicable';
        if (fresh.reminder2hStatus === 'pending') updates.reminder2hStatus = 'not_applicable';
      } else if (nextStatus === 'no_show') {
        if (fresh.reminder24hStatus === 'pending') updates.reminder24hStatus = 'not_applicable';
        if (fresh.reminder2hStatus === 'pending') updates.reminder2hStatus = 'not_applicable';
      } else if (nextStatus === 'reschedule_requested') {
        updates.rescheduleRequestedAt = now;
      }

      if (nextStatus === 'cancelled' || nextStatus === 'no_show') {
        const slotRef = doc(db, 'clinics', clinic.id, 'appointmentSlots', slotKey);
        const slotSnap = await tx.get(slotRef);
        if (slotSnap.exists() && slotSnap.data()?.appointmentId === appointment.id) {
          tx.set(
            slotRef,
            {
              clinicId: clinic.id,
              doctorId: appointment.doctorId,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime,
              appointmentId: appointment.id,
              active: false,
              updatedAt: now,
            },
            { merge: true },
          );
        }
      }

      tx.update(apptRef, updates);
      tx.set(doc(collection(db, 'clinics', clinic.id, 'appointmentLogs')), {
        clinicId: clinic.id,
        appointmentId: appointment.id,
        patientDocId: appointment.patientDocId,
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        actorUid,
        actorName: actorName.slice(0, 120),
        actorRole,
        action: nextStatus,
        previousDate: appointment.appointmentDate,
        previousTime: appointment.appointmentTime,
        newDate: null,
        newTime: null,
        reason: nextStatus === 'cancelled' ? cancelReason.trim().slice(0, 300) : null,
        summary:
          nextStatus === 'cancelled'
            ? `Cancelled appointment: ${cancelReason.trim().slice(0, 220)}`
            : `Updated status to ${nextStatus.replace('_', ' ')}`,
        createdAt: now,
      });

      if (nextStatus === 'cancelled') {
        const scheduleSlotKey = `${appointment.appointmentDate}_${appointment.appointmentTime}`;
        const notifLogKey = `${appointment.id}_cancellation_${scheduleSlotKey}`;
        tx.set(doc(db, 'clinics', clinic.id, 'notificationLogs', notifLogKey), {
          clinicId: clinic.id,
          appointmentId: appointment.id,
          patientDocId: appointment.patientDocId,
          patientId: appointment.patientId,
          patientName: appointment.patientName,
          channel: 'whatsapp',
          recipientMobile: appointment.patientMobile,
          messageType: 'cancellation',
          scheduleSlotKey,
          idempotencyKey: notifLogKey,
          templateName:
            clinic.whatsappSettings?.templateCancelled || 'cliniqo_appointment_cancelled',
          deliveryStatus: waCancelStatus,
          providerMessageId: null,
          errorMessage: waCancelNote.slice(0, 400),
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `clinics/${clinic.id}/appointments/${appointment.id}`,
    );
  }

  if (nextStatus === 'cancelled') {
    await emitLocalAppointmentNotifications({
      clinicId: clinic.id,
      clinicOwnerId: clinic.ownerId,
      doctorId: appointment.doctorId,
      actorUid,
      type: 'appointment_cancelled',
      title: `Appointment cancelled: ${appointment.patientName}`,
      message: `${formatDateHuman(appointment.appointmentDate)} · ${cancelReason.trim()}`,
    });
  }
}
