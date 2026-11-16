import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { MembershipRole, NotificationType } from './clinicService';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { PatientGender, PatientRecord } from './patientService';

class QueueDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueDomainError';
  }
}

function handleQueueMutationError(
  error: unknown,
  operationType: OperationType,
  path: string,
): never {
  if (error instanceof QueueDomainError) {
    throw error;
  }
  handleFirestoreError(error, operationType, path);
}

export type QueueStatus =
  | 'waiting'
  | 'called'
  | 'in_consultation'
  | 'on_hold'
  | 'skipped'
  | 'completed'
  | 'cancelled';

export type QueueAuditAction =
  | 'added_to_queue'
  | 'called_patient'
  | 'accepted_patient'
  | 'held_patient'
  | 'skipped_patient'
  | 'resumed_patient'
  | 'completed_consultation'
  | 'cancelled_entry'
  | 'priority_updated';

export interface DailyQueueEntryRecord {
  id: string;
  clinicId: string;
  patientId: string;
  patientDocumentId: string;
  patientName: string;
  patientAge: number | null;
  patientGender: PatientGender | null;
  patientMobile?: string;
  tokenNumber: number;
  tokenLabel: string;
  queueDate: string;
  timezone: string;
  status: QueueStatus;
  assignedDoctorId: string | null;
  assignedDoctorName?: string | null;
  priority: boolean;
  priorityChangedBy?: string | null;
  priorityChangedByName?: string | null;
  priorityReason?: string | null;
  cancelReason?: string | null;
  arrivalTime?: Timestamp;
  calledAt?: Timestamp | null;
  acceptedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  cancelledAt?: Timestamp | null;
  createdBy: string;
  createdByName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QueueAuditLogRecord {
  id: string;
  clinicId: string;
  queueDate: string;
  entryId: string;
  tokenNumber: number;
  patientId: string;
  patientName: string;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  action: QueueAuditAction;
  summary: string;
  reason?: string | null;
  createdAt?: Timestamp;
}

export const QUEUE_STATUS_META: Record<
  QueueStatus,
  {
    label: string;
    description: string;
    textClass: string;
    surfaceClass: string;
    markerClass: string;
  }
> = {
  waiting: {
    label: 'Waiting',
    description: 'Checked in and waiting for the doctor',
    textClass: 'text-sky-800',
    surfaceClass: 'border-sky-200 bg-sky-50/85',
    markerClass: 'bg-sky-600',
  },
  called: {
    label: 'Called',
    description: 'Called to consultation room',
    textClass: 'text-indigo-800',
    surfaceClass: 'border-indigo-200 bg-indigo-50/85',
    markerClass: 'bg-indigo-600',
  },
  in_consultation: {
    label: 'In Consultation',
    description: 'Currently with the doctor',
    textClass: 'text-emerald-800',
    surfaceClass: 'border-emerald-200 bg-emerald-50/90',
    markerClass: 'bg-emerald-600',
  },
  on_hold: {
    label: 'On Hold',
    description: 'Temporarily paused by doctor',
    textClass: 'text-amber-800',
    surfaceClass: 'border-amber-200 bg-amber-50/90',
    markerClass: 'bg-amber-600',
  },
  skipped: {
    label: 'Skipped',
    description: 'Deferred; can resume back to waiting',
    textClass: 'text-slate-700',
    surfaceClass: 'border-slate-300 bg-slate-100/90',
    markerClass: 'bg-slate-500',
  },
  completed: {
    label: 'Completed',
    description: 'Consultation finished',
    textClass: 'text-teal-800',
    surfaceClass: 'border-teal-200 bg-teal-50/85',
    markerClass: 'bg-teal-600',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Removed from active queue with audit record',
    textClass: 'text-rose-800',
    surfaceClass: 'border-rose-200 bg-rose-50/85',
    markerClass: 'bg-rose-600',
  },
};

export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Kolkata';

export function formatTokenLabel(tokenNumber: number): string {
  return String(Math.max(1, tokenNumber)).padStart(3, '0');
}

export function getClinicQueueDate(timezone = DEFAULT_CLINIC_TIMEZONE): string {
  const tz = timezone?.trim() || DEFAULT_CLINIC_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback to Asia/Kolkata
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function formatWaitDuration(
  arrivalTime?: Timestamp | null,
  referenceMs = Date.now(),
): string {
  if (!arrivalTime) return 'Just arrived';
  const diffMs = Math.max(0, referenceMs - arrivalTime.toMillis());
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatQueueTime(
  ts?: Timestamp | null,
  timezone = DEFAULT_CLINIC_TIMEZONE,
): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleTimeString('en-IN', {
      timeZone: timezone || DEFAULT_CLINIC_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts.toDate().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

export function formatQueueDateHeading(queueDate: string): string {
  const parsed = new Date(`${queueDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return queueDate;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function subscribeToDailyQueue(
  clinicId: string,
  queueDate: string,
  onData: (entries: DailyQueueEntryRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `clinics/${clinicId}/dailyQueues/${queueDate}/entries`;
  const q = query(
    collection(db, 'clinics', clinicId, 'dailyQueues', queueDate, 'entries'),
    orderBy('tokenNumber', 'asc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DailyQueueEntryRecord, 'id'>),
      }));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export function subscribeToQueueAuditLogs(
  clinicId: string,
  queueDate: string,
  onData: (logs: QueueAuditLogRecord[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'clinics', clinicId, 'queueAuditLogs'),
    where('queueDate', '==', queueDate),
    limit(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<QueueAuditLogRecord, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(list);
    },
    () => {
      // Non-critical listener failure ignored on UI
    },
  );
}

async function sendClinicNotifications(params: {
  clinicId: string;
  recipientUids: string[];
  type: NotificationType;
  title: string;
  message: string;
}): Promise<void> {
  const uniqueRecipients = Array.from(new Set(params.recipientUids.filter(Boolean)));
  if (uniqueRecipients.length === 0) return;

  try {
    const batch = writeBatch(db);
    uniqueRecipients.forEach((uid) => {
      const ref = doc(collection(db, 'notifications'));
      batch.set(ref, {
        recipientUid: uid,
        clinicId: params.clinicId,
        type: params.type,
        title: params.title.slice(0, 140),
        message: params.message.slice(0, 400),
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch {
    // Non-blocking notification dispatch so clinical queue transitions always commit reliably
  }
}

async function resolveActiveReceptionistRecipients(params: {
  clinicId: string;
  clinicOwnerId: string;
  fallbackCreatorUid?: string;
  excludeUid: string;
}): Promise<string[]> {
  const recipients = new Set<string>();
  try {
    const memSnap = await getDocs(
      query(
        collection(db, 'clinicMemberships'),
        where('clinicOwnerId', '==', params.clinicOwnerId),
        where('clinicId', '==', params.clinicId),
      ),
    );
    memSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.status === 'active' && data.role === 'receptionist' && data.userId !== params.excludeUid) {
        recipients.add(String(data.userId));
      }
    });
  } catch {
    // Fallback to entry creator if membership list is unavailable
  }

  if (params.fallbackCreatorUid && params.fallbackCreatorUid !== params.excludeUid) {
    recipients.add(params.fallbackCreatorUid);
  }
  return Array.from(recipients);
}

export async function addPatientToTodayQueue(params: {
  clinicId: string;
  clinicOwnerId: string;
  timezone?: string;
  patient: PatientRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<{ entryId: string; tokenNumber: number; tokenLabel: string; queueDate: string }> {
  const { clinicId, clinicOwnerId, patient, actorUid, actorName, actorRole } = params;
  const timezone = params.timezone?.trim() || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);

  if (patient.status !== 'active') {
    throw new QueueDomainError('Archived patients cannot be added to the active queue. Please restore first.');
  }

  const entriesCol = collection(db, 'clinics', clinicId, 'dailyQueues', queueDate, 'entries');
  const existingSnap = await getDocs(
    query(entriesCol, where('patientDocumentId', '==', patient.id), limit(10)),
  );
  const activeExisting = existingSnap.docs.find((d) => {
    const status = String(d.data().status || '');
    return ['waiting', 'called', 'in_consultation', 'on_hold'].includes(status);
  });
  if (activeExisting) {
    const data = activeExisting.data();
    throw new QueueDomainError(
      `${patient.fullName} is already in today's queue (Token #${data.tokenLabel || formatTokenLabel(Number(data.tokenNumber || 1))}).`,
    );
  }

  const path = `clinics/${clinicId}/dailyQueues/${queueDate}/entries`;
  try {
    const result = await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'clinics', clinicId, 'dailyQueues', queueDate);
      const counterSnap = await tx.get(counterRef);

      const nextSeq = counterSnap.exists() ? Number(counterSnap.data().seq || 0) + 1 : 1;
      const tokenLabel = formatTokenLabel(nextSeq);
      const entryRef = doc(entriesCol);
      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));

      tx.set(counterRef, {
        clinicId,
        queueDate,
        timezone,
        seq: nextSeq,
        updatedAt: serverTimestamp(),
      });

      tx.set(entryRef, {
        clinicId,
        patientId: patient.patientId,
        patientDocumentId: patient.id,
        patientName: patient.fullName.trim().slice(0, 120),
        patientAge: patient.age ?? null,
        patientGender: patient.gender ?? null,
        patientMobile: patient.mobile.slice(0, 24),
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
        arrivalTime: serverTimestamp(),
        calledAt: null,
        acceptedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdBy: actorUid,
        createdByName: actorName.trim().slice(0, 120) || 'Clinic Staff',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate,
        entryId: entryRef.id,
        tokenNumber: nextSeq,
        patientId: patient.patientId,
        patientName: patient.fullName.trim().slice(0, 120),
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Clinic Staff',
        actorRole,
        action: 'added_to_queue',
        summary: `Added ${patient.fullName} (${patient.patientId}) as Token #${tokenLabel}`,
        reason: null,
        createdAt: serverTimestamp(),
      });

      return { entryId: entryRef.id, tokenNumber: nextSeq, tokenLabel, queueDate };
    });

    if (clinicOwnerId && clinicOwnerId !== actorUid) {
      await sendClinicNotifications({
        clinicId,
        recipientUids: [clinicOwnerId],
        type: 'queue_patient_added',
        title: `New patient in queue: Token #${result.tokenLabel}`,
        message: `${patient.fullName} (${patient.patientId}) was added to today's waiting list by ${actorName}.`,
      });
    }

    return result;
  } catch (error) {
    handleQueueMutationError(error, OperationType.WRITE, path);
  }
}

export async function callQueuePatient(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const data = snap.data();
      if (data.status !== 'waiting') {
        throw new QueueDomainError(`Only waiting patients can be called (current status: ${data.status}).`);
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'called',
        calledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'called_patient',
        summary: `Called Token #${entry.tokenLabel} (${entry.patientName})`,
        reason: null,
        createdAt: serverTimestamp(),
      });
    });

    const recipients = await resolveActiveReceptionistRecipients({
      clinicId,
      clinicOwnerId,
      fallbackCreatorUid: entry.createdBy,
      excludeUid: actorUid,
    });
    await sendClinicNotifications({
      clinicId,
      recipientUids: recipients,
      type: 'queue_patient_called',
      title: `Token #${entry.tokenLabel} called`,
      message: `${actorName} called ${entry.patientName} (${entry.patientId}) to the consultation room.`,
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function acceptQueuePatient(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry no longer exists.');
      }
      const current = snap.data();
      if (current.status !== 'waiting' && current.status !== 'called') {
        throw new QueueDomainError(
          `Patient Token #${entry.tokenLabel} is already ${QUEUE_STATUS_META[current.status as QueueStatus]?.label || current.status}.`,
        );
      }
      if (current.assignedDoctorId && current.assignedDoctorId !== actorUid) {
        throw new QueueDomainError(
          `Patient Token #${entry.tokenLabel} was already accepted by ${current.assignedDoctorName || 'another doctor'}.`,
        );
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'in_consultation',
        assignedDoctorId: actorUid,
        assignedDoctorName: actorName.trim().slice(0, 120) || 'Doctor',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'accepted_patient',
        summary: `${actorName} accepted Token #${entry.tokenLabel} (${entry.patientName}) into consultation`,
        reason: null,
        createdAt: serverTimestamp(),
      });
    });

    const recipients = await resolveActiveReceptionistRecipients({
      clinicId,
      clinicOwnerId,
      fallbackCreatorUid: entry.createdBy,
      excludeUid: actorUid,
    });
    await sendClinicNotifications({
      clinicId,
      recipientUids: recipients,
      type: 'queue_patient_accepted',
      title: `Token #${entry.tokenLabel} in consultation`,
      message: `${actorName} accepted ${entry.patientName} (${entry.patientId}).`,
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function holdQueuePatient(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const status = String(snap.data().status || '');
      if (!['waiting', 'called', 'in_consultation'].includes(status)) {
        throw new QueueDomainError('Only active patients can be placed on hold.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'on_hold',
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'held_patient',
        summary: `Placed Token #${entry.tokenLabel} (${entry.patientName}) on hold`,
        reason: null,
        createdAt: serverTimestamp(),
      });
    });

    const recipients = await resolveActiveReceptionistRecipients({
      clinicId,
      clinicOwnerId,
      fallbackCreatorUid: entry.createdBy,
      excludeUid: actorUid,
    });
    await sendClinicNotifications({
      clinicId,
      recipientUids: recipients,
      type: 'queue_patient_held',
      title: `Token #${entry.tokenLabel} put on hold`,
      message: `${actorName} put ${entry.patientName} (${entry.patientId}) on hold.`,
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function skipQueuePatient(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const status = String(snap.data().status || '');
      if (!['waiting', 'called', 'on_hold'].includes(status)) {
        throw new QueueDomainError('Only waiting, called, or on-hold patients can be skipped.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'skipped',
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'skipped_patient',
        summary: `Skipped Token #${entry.tokenLabel} (${entry.patientName})`,
        reason: null,
        createdAt: serverTimestamp(),
      });
    });

    const recipients = await resolveActiveReceptionistRecipients({
      clinicId,
      clinicOwnerId,
      fallbackCreatorUid: entry.createdBy,
      excludeUid: actorUid,
    });
    await sendClinicNotifications({
      clinicId,
      recipientUids: recipients,
      type: 'queue_patient_skipped',
      title: `Token #${entry.tokenLabel} skipped`,
      message: `${actorName} skipped ${entry.patientName} (${entry.patientId}). Queue record retained.`,
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function resumeQueuePatient(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  reason?: string;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole, reason } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;
  const cleanReason = reason?.trim().slice(0, 240) || 'Returned to waiting queue';

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const status = String(snap.data().status || '');
      if (status !== 'on_hold' && status !== 'skipped') {
        throw new QueueDomainError('Only on-hold or skipped patients can return to waiting.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'waiting',
        assignedDoctorId: null,
        assignedDoctorName: null,
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'resumed_patient',
        summary: `Returned Token #${entry.tokenLabel} (${entry.patientName}) to waiting queue`,
        reason: cleanReason,
        createdAt: serverTimestamp(),
      });
    });

    if (clinicOwnerId && clinicOwnerId !== actorUid) {
      await sendClinicNotifications({
        clinicId,
        recipientUids: [clinicOwnerId],
        type: 'queue_patient_resumed',
        title: `Patient returned to queue: Token #${entry.tokenLabel}`,
        message: `${entry.patientName} (${entry.patientId}) resumed to waiting queue.`,
      });
    }
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function completeQueueConsultation(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const data = snap.data();
      if (data.status !== 'in_consultation') {
        throw new QueueDomainError('Only a patient currently in consultation can be marked completed.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'completed_consultation',
        summary: `Completed consultation for Token #${entry.tokenLabel} (${entry.patientName})`,
        reason: null,
        createdAt: serverTimestamp(),
      });
    });

    const recipients = await resolveActiveReceptionistRecipients({
      clinicId,
      clinicOwnerId,
      fallbackCreatorUid: entry.createdBy,
      excludeUid: actorUid,
    });
    await sendClinicNotifications({
      clinicId,
      recipientUids: recipients,
      type: 'queue_consultation_completed',
      title: `Consultation completed: Token #${entry.tokenLabel}`,
      message: `${actorName} completed consultation for ${entry.patientName} (${entry.patientId}).`,
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function cancelQueueEntry(params: {
  clinicId: string;
  clinicOwnerId: string;
  entry: DailyQueueEntryRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  reason?: string;
}): Promise<void> {
  const { clinicId, clinicOwnerId, entry, actorUid, actorName, actorRole, reason } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;
  const cleanReason = reason?.trim().slice(0, 240) || 'Removed mistakenly added entry';

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const status = String(snap.data().status || '');
      if (!['waiting', 'called', 'on_hold', 'skipped'].includes(status)) {
        throw new QueueDomainError('Patients already in consultation or completed cannot be cancelled.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        status: 'cancelled',
        cancelReason: cleanReason,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Clinic Staff',
        actorRole,
        action: 'cancelled_entry',
        summary: `Cancelled Token #${entry.tokenLabel} (${entry.patientName})`,
        reason: cleanReason,
        createdAt: serverTimestamp(),
      });
    });

    if (clinicOwnerId && clinicOwnerId !== actorUid) {
      await sendClinicNotifications({
        clinicId,
        recipientUids: [clinicOwnerId],
        type: 'queue_updated',
        title: `Queue updated: Token #${entry.tokenLabel} cancelled`,
        message: `${actorName} removed ${entry.patientName} (${entry.patientId}) from today's queue (${cleanReason}).`,
      });
    }
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function toggleQueuePriority(params: {
  clinicId: string;
  entry: DailyQueueEntryRecord;
  nextPriority: boolean;
  reason: string;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, entry, nextPriority, reason, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/dailyQueues/${entry.queueDate}/entries/${entry.id}`;
  const cleanReason = reason.trim().slice(0, 240);

  if (nextPriority && cleanReason.length < 2) {
    throw new QueueDomainError('Please enter a brief clinical reason for marking priority.');
  }

  try {
    await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'clinics', clinicId, 'dailyQueues', entry.queueDate, 'entries', entry.id);
      const snap = await tx.get(entryRef);
      if (!snap.exists()) {
        throw new QueueDomainError('Queue entry not found.');
      }
      const status = String(snap.data().status || '');
      if (status === 'completed' || status === 'cancelled') {
        throw new QueueDomainError('Cannot change priority on completed or cancelled entries.');
      }

      const auditRef = doc(collection(db, 'clinics', clinicId, 'queueAuditLogs'));
      tx.update(entryRef, {
        priority: nextPriority,
        priorityChangedBy: actorUid,
        priorityChangedByName: actorName.trim().slice(0, 120) || 'Doctor',
        priorityReason: nextPriority ? cleanReason : null,
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        queueDate: entry.queueDate,
        entryId: entry.id,
        tokenNumber: entry.tokenNumber,
        patientId: entry.patientId,
        patientName: entry.patientName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Doctor',
        actorRole,
        action: 'priority_updated',
        summary: nextPriority
          ? `Marked Token #${entry.tokenLabel} (${entry.patientName}) as Priority`
          : `Cleared priority flag on Token #${entry.tokenLabel} (${entry.patientName})`,
        reason: nextPriority ? cleanReason : 'Priority cleared',
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleQueueMutationError(error, OperationType.UPDATE, path);
  }
}

export async function fetchQueueEntryById(
  clinicId: string,
  queueDate: string,
  entryId: string,
): Promise<DailyQueueEntryRecord | null> {
  const path = `clinics/${clinicId}/dailyQueues/${queueDate}/entries/${entryId}`;
  try {
    const snap = await getDoc(doc(db, 'clinics', clinicId, 'dailyQueues', queueDate, 'entries', entryId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<DailyQueueEntryRecord, 'id'>),
    };
  } catch (error) {
    handleQueueMutationError(error, OperationType.GET, path);
  }
}

