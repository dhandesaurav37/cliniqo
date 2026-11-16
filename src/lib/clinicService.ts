import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export type MembershipRole = 'owner' | 'doctor' | 'receptionist';
export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'revoked';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type NotificationType =
  | 'join_request_submitted'
  | 'join_request_received'
  | 'request_approved'
  | 'request_rejected'
  | 'access_revoked'
  | 'queue_patient_added'
  | 'queue_patient_resumed'
  | 'queue_updated'
  | 'queue_patient_accepted'
  | 'queue_consultation_completed'
  | 'queue_patient_held'
  | 'queue_patient_skipped'
  | 'queue_patient_called'
  | 'appointment_scheduled'
  | 'appointment_confirmed'
  | 'appointment_reschedule_requested'
  | 'appointment_rescheduled'
  | 'appointment_cancelled';
export type StaffAuditAction = 'approved_receptionist' | 'rejected_request' | 'revoked_access';

export const WORKING_DAYS_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WorkingDay = (typeof WORKING_DAYS_OPTIONS)[number];

export interface UserProfileRecord {
  uid: string;
  fullName: string;
  email: string;
  mobile: string;
  photoURL?: string;
  qualification?: string;
  specialization?: string;
  registrationNumber?: string;
  experience?: number;
  consultationTimings?: string;
  acceptedTerms: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReceptionistPermissions {
  canCreateAppointments: boolean;
  canCancelAppointments: boolean;
}

export interface ClinicWhatsAppSettings {
  enabled: boolean;
  templateConfirmation?: string;
  templateReminder24h?: string;
  templateReminder2h?: string;
  templateReschedule?: string;
  templateCancelled?: string;
  languageCode?: string;
}

export interface ClinicRecord {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  logoUrl?: string;
  ownerId: string;
  joiningCode: string;
  joiningCodeActive: boolean;
  consultationFee: number;
  currency: 'INR';
  openingTime: string;
  closingTime: string;
  workingDays: WorkingDay[];
  appointmentDuration: number;
  timezone?: string;
  receptionistPermissions?: ReceptionistPermissions;
  whatsappSettings?: ClinicWhatsAppSettings;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ClinicMembershipRecord {
  id: string;
  clinicId: string;
  clinicOwnerId?: string;
  userId: string;
  memberName?: string;
  memberEmail?: string;
  memberMobile?: string;
  role: MembershipRole;
  isPractisingDoctor?: boolean;
  status: MembershipStatus;
  joinedAt?: Timestamp;
  revokedAt?: Timestamp | null;
}

export interface PublicClinicPreview {
  code: string;
  clinicId: string;
  clinicOwnerId: string;
  clinicName: string;
  publicAddress: string;
  publicCity: string;
  publicState: string;
}

export interface ClinicJoinRequestRecord {
  id: string;
  clinicId: string;
  clinicOwnerId: string;
  clinicName: string;
  userId: string;
  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
  requestedRole: 'receptionist';
  status: JoinRequestStatus;
  requestedAt?: Timestamp;
  reviewedAt?: Timestamp | null;
  reviewedBy?: string | null;
}

export interface NotificationRecord {
  id: string;
  recipientUid: string;
  clinicId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt?: Timestamp;
}

export interface StaffAuditLogRecord {
  id: string;
  clinicId: string;
  clinicOwnerId: string;
  actorUid: string;
  targetUid: string;
  targetName: string;
  action: StaffAuditAction;
  createdAt?: Timestamp;
}

export interface DoctorOnboardingInput {
  fullName: string;
  photoURL: string;
  qualification: string;
  specialization: string;
  registrationNumber: string;
  experience: number;
  consultationTimings: string;
}

export interface ClinicOnboardingInput {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  logoUrl: string;
  consultationFee: number;
  openingTime: string;
  closingTime: string;
  workingDays: WorkingDay[];
  appointmentDuration: number;
  timezone?: string;
  receptionistPermissions?: ReceptionistPermissions;
  whatsappSettings?: ClinicWhatsAppSettings;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LOOKUP_STORAGE_KEY = 'cliniqo_code_lookup_attempts';
const MAX_CODE_ATTEMPTS = 5;
const CODE_COOLDOWN_MS = 2 * 60 * 1000;

export function generateSecureClinicCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `CLINIC-${suffix}`;
}

export function normalizeClinicCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function getLookupRateState(): { count: number; lockedUntil: number } {
  try {
    const raw = window.localStorage.getItem(CODE_LOOKUP_STORAGE_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as { count?: number; lockedUntil?: number };
    return {
      count: Number(parsed.count) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function recordFailedCodeAttempt(): number {
  const current = getLookupRateState();
  const nextCount = current.count + 1;
  const lockedUntil = nextCount >= MAX_CODE_ATTEMPTS ? Date.now() + CODE_COOLDOWN_MS : 0;
  try {
    window.localStorage.setItem(
      CODE_LOOKUP_STORAGE_KEY,
      JSON.stringify({ count: lockedUntil ? 0 : nextCount, lockedUntil }),
    );
  } catch {
    // Ignore storage error
  }
  return lockedUntil;
}

function resetCodeAttempts(): void {
  try {
    window.localStorage.removeItem(CODE_LOOKUP_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

export async function createInitialUserProfile(params: {
  uid: string;
  fullName: string;
  email: string;
  mobile: string;
}): Promise<void> {
  const path = `users/${params.uid}`;
  try {
    await setDoc(doc(db, 'users', params.uid), {
      fullName: params.fullName.trim().slice(0, 120),
      email: params.email.trim().slice(0, 160),
      mobile: params.mobile.trim().slice(0, 24),
      acceptedTerms: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function ensureUserProfileOnLogin(params: {
  uid: string;
  fullName: string;
  email: string;
  mobile?: string;
}): Promise<UserProfileRecord | null> {
  const path = `users/${params.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', params.uid));
    if (snap.exists()) {
      return { uid: snap.id, ...(snap.data() as Omit<UserProfileRecord, 'uid'>) };
    }
    await setDoc(doc(db, 'users', params.uid), {
      fullName: (params.fullName || 'Clinic User').trim().slice(0, 120),
      email: params.email.trim().slice(0, 160),
      mobile: (params.mobile || 'Not provided').trim().slice(0, 24),
      acceptedTerms: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const createdSnap = await getDoc(doc(db, 'users', params.uid));
    return createdSnap.exists()
      ? { uid: createdSnap.id, ...(createdSnap.data() as Omit<UserProfileRecord, 'uid'>) }
      : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateBasicStaffProfile(params: {
  uid: string;
  fullName: string;
  mobile: string;
}): Promise<void> {
  const path = `users/${params.uid}`;
  try {
    await updateDoc(doc(db, 'users', params.uid), {
      fullName: params.fullName.trim().slice(0, 120),
      mobile: params.mobile.trim().slice(0, 24),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateDoctorProfile(
  uid: string,
  input: DoctorOnboardingInput,
  fallbackMobile = 'Not provided',
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const mobile = snap.exists()
      ? String(snap.data().mobile || fallbackMobile).slice(0, 24)
      : fallbackMobile;

    await updateDoc(userRef, {
      fullName: input.fullName.trim().slice(0, 120),
      mobile,
      photoURL: input.photoURL.trim().slice(0, 40000),
      qualification: input.qualification.trim().slice(0, 120),
      specialization: input.specialization.trim().slice(0, 120),
      registrationNumber: input.registrationNumber.trim().slice(0, 80),
      experience: Math.min(80, Math.max(0, Number(input.experience) || 0)),
      consultationTimings: input.consultationTimings.trim().slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createClinicWithUniqueCode(params: {
  uid: string;
  doctor: DoctorOnboardingInput;
  clinic: ClinicOnboardingInput;
}): Promise<{ clinicId: string; joiningCode: string }> {
  const { uid, doctor, clinic } = params;

  await updateDoctorProfile(uid, doctor);
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : null;

  try {
    return await runTransaction(db, async (tx) => {
      const clinicRef = doc(collection(db, 'clinics'));
      const clinicId = clinicRef.id;

      let chosenCode = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateSecureClinicCode();
        const codeRef = doc(db, 'clinicCodes', candidate);
        const existingCode = await tx.get(codeRef);
        if (!existingCode.exists()) {
          chosenCode = candidate;
          break;
        }
      }

      if (!chosenCode) {
        throw new Error('Could not allocate a unique clinic joining code. Please try again.');
      }

      const membershipId = `${clinicId}_${uid}`;
      const membershipRef = doc(db, 'clinicMemberships', membershipId);
      const codeRef = doc(db, 'clinicCodes', chosenCode);

      const cleanName = clinic.name.trim().slice(0, 140);
      const cleanAddress = clinic.address.trim().slice(0, 300);
      const cleanCity = clinic.city.trim().slice(0, 100);
      const cleanState = clinic.state.trim().slice(0, 100);

      const clinicPayload: Record<string, unknown> = {
        name: cleanName,
        address: cleanAddress,
        city: cleanCity,
        state: cleanState,
        pincode: clinic.pincode.trim().slice(0, 12),
        phone: clinic.phone.trim().slice(0, 24),
        ownerId: uid,
        joiningCode: chosenCode,
        joiningCodeActive: true,
        consultationFee: Math.min(100000, Math.max(0, Number(clinic.consultationFee) || 0)),
        currency: 'INR',
        openingTime: clinic.openingTime.trim().slice(0, 10),
        closingTime: clinic.closingTime.trim().slice(0, 10),
        workingDays: clinic.workingDays.slice(0, 7),
        appointmentDuration: Math.min(180, Math.max(5, Number(clinic.appointmentDuration) || 15)),
        timezone: (clinic.timezone || 'Asia/Kolkata').trim().slice(0, 64),
        receptionistPermissions: clinic.receptionistPermissions || {
          canCreateAppointments: true,
          canCancelAppointments: true,
        },
        whatsappSettings: clinic.whatsappSettings || {
          enabled: true,
          languageCode: 'en',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (clinic.email.trim()) {
        clinicPayload.email = clinic.email.trim().slice(0, 160);
      }
      if (clinic.logoUrl.trim()) {
        clinicPayload.logoUrl = clinic.logoUrl.trim().slice(0, 40000);
      }

      tx.set(clinicRef, clinicPayload);

      tx.set(membershipRef, {
        clinicId,
        clinicOwnerId: uid,
        userId: uid,
        memberName: doctor.fullName.trim().slice(0, 120),
        memberEmail: String(userData?.email || '').slice(0, 160),
        memberMobile: String(userData?.mobile || 'Not provided').slice(0, 24),
        role: 'owner',
        isPractisingDoctor: true,
        status: 'active',
        joinedAt: serverTimestamp(),
      });

      tx.set(codeRef, {
        clinicId,
        ownerId: uid,
        publicName: cleanName,
        publicAddress: `${cleanAddress}, ${cleanCity}, ${cleanState}`.slice(0, 300),
        publicCity: cleanCity,
        publicState: cleanState,
        active: true,
        createdAt: serverTimestamp(),
      });

      return { clinicId, joiningCode: chosenCode };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'clinics');
  }
}

export async function updateClinicDetails(
  clinicId: string,
  clinic: ClinicOnboardingInput,
): Promise<void> {
  const path = `clinics/${clinicId}`;
  try {
    const clinicRef = doc(db, 'clinics', clinicId);
    const snap = await getDoc(clinicRef);
    const currentCode = snap.exists() ? String(snap.data().joiningCode || '') : '';
    const isCodeActive = snap.exists() ? Boolean(snap.data().joiningCodeActive) : false;

    const cleanName = clinic.name.trim().slice(0, 140);
    const cleanAddress = clinic.address.trim().slice(0, 300);
    const cleanCity = clinic.city.trim().slice(0, 100);
    const cleanState = clinic.state.trim().slice(0, 100);

    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      name: cleanName,
      address: cleanAddress,
      city: cleanCity,
      state: cleanState,
      pincode: clinic.pincode.trim().slice(0, 12),
      phone: clinic.phone.trim().slice(0, 24),
      email: clinic.email.trim().slice(0, 160),
      logoUrl: clinic.logoUrl.trim().slice(0, 40000),
      consultationFee: Math.min(100000, Math.max(0, Number(clinic.consultationFee) || 0)),
      openingTime: clinic.openingTime.trim().slice(0, 10),
      closingTime: clinic.closingTime.trim().slice(0, 10),
      workingDays: clinic.workingDays.slice(0, 7),
      appointmentDuration: Math.min(180, Math.max(5, Number(clinic.appointmentDuration) || 15)),
      timezone: (clinic.timezone || 'Asia/Kolkata').trim().slice(0, 64),
      updatedAt: serverTimestamp(),
    };
    if (clinic.receptionistPermissions) {
      updatePayload.receptionistPermissions = {
        canCreateAppointments: Boolean(clinic.receptionistPermissions.canCreateAppointments),
        canCancelAppointments: Boolean(clinic.receptionistPermissions.canCancelAppointments),
      };
    }
    if (clinic.whatsappSettings) {
      updatePayload.whatsappSettings = {
        enabled: Boolean(clinic.whatsappSettings.enabled),
        languageCode: (clinic.whatsappSettings.languageCode || 'en').trim().slice(0, 16),
        ...(clinic.whatsappSettings.templateConfirmation?.trim()
          ? { templateConfirmation: clinic.whatsappSettings.templateConfirmation.trim().slice(0, 120) }
          : {}),
        ...(clinic.whatsappSettings.templateReminder24h?.trim()
          ? { templateReminder24h: clinic.whatsappSettings.templateReminder24h.trim().slice(0, 120) }
          : {}),
        ...(clinic.whatsappSettings.templateReminder2h?.trim()
          ? { templateReminder2h: clinic.whatsappSettings.templateReminder2h.trim().slice(0, 120) }
          : {}),
        ...(clinic.whatsappSettings.templateReschedule?.trim()
          ? { templateReschedule: clinic.whatsappSettings.templateReschedule.trim().slice(0, 120) }
          : {}),
        ...(clinic.whatsappSettings.templateCancelled?.trim()
          ? { templateCancelled: clinic.whatsappSettings.templateCancelled.trim().slice(0, 120) }
          : {}),
      };
    }
    batch.update(clinicRef, updatePayload);

    if (isCodeActive && currentCode && /^CLINIC-[A-Z0-9]{4,12}$/.test(currentCode)) {
      batch.update(doc(db, 'clinicCodes', currentCode), {
        publicName: cleanName,
        publicAddress: `${cleanAddress}, ${cleanCity}, ${cleanState}`.slice(0, 300),
        publicCity: cleanCity,
        publicState: cleanState,
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncClinicCodePublicInfo(clinic: ClinicRecord): Promise<void> {
  if (!clinic.joiningCodeActive || !clinic.joiningCode) return;
  if (!/^CLINIC-[A-Z0-9]{4,12}$/.test(clinic.joiningCode)) return;
  try {
    const codeRef = doc(db, 'clinicCodes', clinic.joiningCode);
    const snap = await getDoc(codeRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const expectedAddress = `${clinic.address}, ${clinic.city}, ${clinic.state}`.slice(0, 300);
    if (data.publicName === clinic.name && data.publicAddress === expectedAddress) {
      return;
    }
    await updateDoc(codeRef, {
      publicName: clinic.name.slice(0, 140),
      publicAddress: expectedAddress,
      publicCity: clinic.city.slice(0, 100),
      publicState: clinic.state.slice(0, 100),
    });
  } catch {
    // Non-critical backfill
  }
}

export async function regenerateJoiningCode(
  clinicId: string,
  uid: string,
): Promise<string> {
  const path = `clinics/${clinicId}`;
  try {
    return await runTransaction(db, async (tx) => {
      const clinicRef = doc(db, 'clinics', clinicId);
      const clinicSnap = await tx.get(clinicRef);
      if (!clinicSnap.exists()) {
        throw new Error('Clinic not found.');
      }

      const clinicData = clinicSnap.data();
      const oldCode = String(clinicData.joiningCode || '');
      let nextCode = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateSecureClinicCode();
        if (candidate === oldCode) continue;
        const snap = await tx.get(doc(db, 'clinicCodes', candidate));
        if (!snap.exists()) {
          nextCode = candidate;
          break;
        }
      }

      if (!nextCode) {
        throw new Error('Could not generate a unique joining code. Please retry.');
      }

      if (oldCode) {
        const oldRef = doc(db, 'clinicCodes', oldCode);
        const oldSnap = await tx.get(oldRef);
        if (oldSnap.exists()) {
          tx.update(oldRef, { active: false });
        }
      }

      const cleanName = String(clinicData.name || '').slice(0, 140);
      const cleanAddress = String(clinicData.address || '');
      const cleanCity = String(clinicData.city || '').slice(0, 100);
      const cleanState = String(clinicData.state || '').slice(0, 100);

      tx.set(doc(db, 'clinicCodes', nextCode), {
        clinicId,
        ownerId: uid,
        publicName: cleanName,
        publicAddress: `${cleanAddress}, ${cleanCity}, ${cleanState}`.slice(0, 300),
        publicCity: cleanCity,
        publicState: cleanState,
        active: true,
        createdAt: serverTimestamp(),
      });

      tx.update(clinicRef, {
        joiningCode: nextCode,
        joiningCodeActive: true,
        updatedAt: serverTimestamp(),
      });

      return nextCode;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revokeJoiningCode(clinicId: string): Promise<void> {
  const path = `clinics/${clinicId}`;
  try {
    await runTransaction(db, async (tx) => {
      const clinicRef = doc(db, 'clinics', clinicId);
      const clinicSnap = await tx.get(clinicRef);
      if (!clinicSnap.exists()) {
        throw new Error('Clinic not found.');
      }

      const oldCode = String(clinicSnap.data().joiningCode || '');
      if (oldCode) {
        const oldRef = doc(db, 'clinicCodes', oldCode);
        const oldSnap = await tx.get(oldRef);
        if (oldSnap.exists()) {
          tx.update(oldRef, { active: false });
        }
      }

      tx.update(clinicRef, {
        joiningCode: '',
        joiningCodeActive: false,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resolveClinicCode(rawCode: string): Promise<PublicClinicPreview> {
  const rateState = getLookupRateState();
  if (rateState.lockedUntil > Date.now()) {
    const secs = Math.ceil((rateState.lockedUntil - Date.now()) / 1000);
    throw new Error(
      `Too many invalid clinic code attempts. Please wait ${secs} seconds and verify the code with your doctor.`,
    );
  }

  const normalized = normalizeClinicCode(rawCode);
  if (!/^CLINIC-[A-Z0-9]{4,12}$/.test(normalized)) {
    recordFailedCodeAttempt();
    throw new Error('Please enter a valid clinic code in the format CLINIC-XXXXX.');
  }

  try {
    const codeSnap = await getDoc(doc(db, 'clinicCodes', normalized));
    if (!codeSnap.exists()) {
      recordFailedCodeAttempt();
      throw new Error('No clinic found with that joining code. Please check with your doctor.');
    }

    const data = codeSnap.data();
    if (data.active !== true) {
      recordFailedCodeAttempt();
      throw new Error(
        'This clinic joining code has been deactivated. Please ask your clinic administrator for the current code.',
      );
    }

    resetCodeAttempts();
    return {
      code: normalized,
      clinicId: String(data.clinicId),
      clinicOwnerId: String(data.ownerId),
      clinicName: String(data.publicName || 'Verified Cliniqo Clinic'),
      publicAddress: String(data.publicAddress || 'Address available upon clinic approval'),
      publicCity: String(data.publicCity || ''),
      publicState: String(data.publicState || ''),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('No clinic found') ||
        error.message.includes('deactivated') ||
        error.message.includes('format') ||
        error.message.includes('Too many'))
    ) {
      throw error;
    }
    throw new Error('Unable to verify clinic code right now. Please check your connection and try again.');
  }
}

export async function submitClinicJoinRequest(params: {
  uid: string;
  clinic: PublicClinicPreview;
  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
}): Promise<ClinicJoinRequestRecord> {
  const { uid, clinic, applicantName, applicantEmail, applicantMobile } = params;
  const requestId = `${clinic.clinicId}_${uid}`;

  if (clinic.clinicOwnerId === uid) {
    throw new Error('You are already the owner of this clinic.');
  }

  // Check for existing membership or prior request
  try {
    const existingMem = await getDoc(doc(db, 'clinicMemberships', requestId));
    if (existingMem.exists()) {
      const status = existingMem.data().status;
      if (status === 'active') {
        throw new Error('You already have active access to this clinic.');
      }
      if (status === 'revoked') {
        throw new Error(
          'Your previous access to this clinic was revoked by the administrator. Please contact your doctor directly.',
        );
      }
    }

    const existingReq = await getDoc(doc(db, 'clinicJoinRequests', requestId));
    if (existingReq.exists()) {
      const reqData = existingReq.data();
      if (reqData.status === 'pending') {
        throw new Error('You already have a pending access request for this clinic.');
      }
      if (reqData.status === 'rejected') {
        throw new Error(
          'A previous joining request for this clinic was declined. Please contact the clinic owner.',
        );
      }
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('active access') ||
        err.message.includes('revoked') ||
        err.message.includes('pending access') ||
        err.message.includes('declined'))
    ) {
      throw err;
    }
    // Missing doc throws permission-denied when evaluating existing().userId on non-existent docs if not caught;
    // ignore missing-doc check error and let batch create validate cleanly.
  }

  const cleanName = applicantName.trim().slice(0, 120);
  const cleanEmail = applicantEmail.trim().slice(0, 160);
  const cleanMobile = applicantMobile.trim().slice(0, 24);
  const cleanClinicName = clinic.clinicName.trim().slice(0, 140);

  try {
    const batch = writeBatch(db);
    const reqRef = doc(db, 'clinicJoinRequests', requestId);
    const selfNotifRef = doc(collection(db, 'notifications'));
    const ownerNotifRef = doc(collection(db, 'notifications'));

    batch.set(reqRef, {
      clinicId: clinic.clinicId,
      clinicOwnerId: clinic.clinicOwnerId,
      clinicName: cleanClinicName,
      userId: uid,
      applicantName: cleanName,
      applicantEmail: cleanEmail,
      applicantMobile: cleanMobile,
      requestedRole: 'receptionist',
      status: 'pending',
      requestedAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
    });

    batch.set(selfNotifRef, {
      recipientUid: uid,
      clinicId: clinic.clinicId,
      type: 'join_request_submitted',
      title: `Request sent to ${cleanClinicName}`,
      message:
        'Your request has been sent to the clinic administrator. You will receive access after approval.',
      read: false,
      createdAt: serverTimestamp(),
    });

    batch.set(ownerNotifRef, {
      recipientUid: clinic.clinicOwnerId,
      clinicId: clinic.clinicId,
      type: 'join_request_received',
      title: `New receptionist request: ${cleanName}`,
      message: `${cleanName} (${cleanEmail}) requested receptionist access to ${cleanClinicName}.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    const snap = await getDoc(reqRef);
    return {
      id: requestId,
      ...(snap.data() as Omit<ClinicJoinRequestRecord, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `clinicJoinRequests/${requestId}`);
  }
}

export async function fetchClinicStaffWorkspace(
  clinicId: string,
  ownerUid: string,
): Promise<{
  joinRequests: ClinicJoinRequestRecord[];
  memberships: ClinicMembershipRecord[];
  auditLogs: StaffAuditLogRecord[];
}> {
  try {
    const [reqSnap, memSnap, logSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'clinicJoinRequests'),
          where('clinicOwnerId', '==', ownerUid),
          where('clinicId', '==', clinicId),
        ),
      ),
      getDocs(
        query(
          collection(db, 'clinicMemberships'),
          where('clinicOwnerId', '==', ownerUid),
          where('clinicId', '==', clinicId),
        ),
      ),
      getDocs(
        query(
          collection(db, 'staffAuditLogs'),
          where('clinicOwnerId', '==', ownerUid),
          where('clinicId', '==', clinicId),
        ),
      ),
    ]);

    const joinRequests = reqSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ClinicJoinRequestRecord, 'id'>) }))
      .sort((a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0));

    const memberships = memSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ClinicMembershipRecord, 'id'>) }))
      .sort((a, b) => (b.joinedAt?.toMillis() ?? 0) - (a.joinedAt?.toMillis() ?? 0));

    const auditLogs = logSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffAuditLogRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

    return { joinRequests, memberships, auditLogs };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'staffWorkspace');
  }
}

export async function approveJoinRequest(params: {
  request: ClinicJoinRequestRecord;
  reviewerUid: string;
}): Promise<void> {
  const { request, reviewerUid } = params;
  const path = `clinicJoinRequests/${request.id}`;
  try {
    const batch = writeBatch(db);
    const reqRef = doc(db, 'clinicJoinRequests', request.id);
    const memRef = doc(db, 'clinicMemberships', request.id);
    const auditRef = doc(collection(db, 'staffAuditLogs'));
    const staffNotifRef = doc(collection(db, 'notifications'));
    const ownerNotifRef = doc(collection(db, 'notifications'));

    batch.update(reqRef, {
      status: 'approved',
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerUid,
    });

    batch.set(memRef, {
      clinicId: request.clinicId,
      clinicOwnerId: request.clinicOwnerId,
      userId: request.userId,
      memberName: request.applicantName.slice(0, 120),
      memberEmail: request.applicantEmail.slice(0, 160),
      memberMobile: request.applicantMobile.slice(0, 24),
      role: 'receptionist',
      isPractisingDoctor: false,
      status: 'active',
      joinedAt: serverTimestamp(),
      revokedAt: null,
    });

    batch.set(auditRef, {
      clinicId: request.clinicId,
      clinicOwnerId: reviewerUid,
      actorUid: reviewerUid,
      targetUid: request.userId,
      targetName: request.applicantName.slice(0, 120),
      action: 'approved_receptionist',
      createdAt: serverTimestamp(),
    });

    batch.set(staffNotifRef, {
      recipientUid: request.userId,
      clinicId: request.clinicId,
      type: 'request_approved',
      title: `Access approved for ${request.clinicName}`,
      message: `Your receptionist access to ${request.clinicName} has been approved. Sign in to view your dashboard.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    batch.set(ownerNotifRef, {
      recipientUid: reviewerUid,
      clinicId: request.clinicId,
      type: 'request_approved',
      title: `${request.applicantName} approved as receptionist`,
      message: `${request.applicantName} now has active receptionist access to ${request.clinicName}.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function rejectJoinRequest(params: {
  request: ClinicJoinRequestRecord;
  reviewerUid: string;
}): Promise<void> {
  const { request, reviewerUid } = params;
  const path = `clinicJoinRequests/${request.id}`;
  try {
    const batch = writeBatch(db);
    const reqRef = doc(db, 'clinicJoinRequests', request.id);
    const auditRef = doc(collection(db, 'staffAuditLogs'));
    const staffNotifRef = doc(collection(db, 'notifications'));

    batch.update(reqRef, {
      status: 'rejected',
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerUid,
    });

    batch.set(auditRef, {
      clinicId: request.clinicId,
      clinicOwnerId: reviewerUid,
      actorUid: reviewerUid,
      targetUid: request.userId,
      targetName: request.applicantName.slice(0, 120),
      action: 'rejected_request',
      createdAt: serverTimestamp(),
    });

    batch.set(staffNotifRef, {
      recipientUid: request.userId,
      clinicId: request.clinicId,
      type: 'request_rejected',
      title: `Request declined by ${request.clinicName}`,
      message: `Your receptionist access request for ${request.clinicName} was not approved. Please contact the clinic administrator.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function revokeStaffMembership(params: {
  membership: ClinicMembershipRecord;
  clinicName: string;
  actorUid: string;
}): Promise<void> {
  const { membership, clinicName, actorUid } = params;
  const path = `clinicMemberships/${membership.id}`;
  const targetName = (membership.memberName || membership.memberEmail || 'Staff Member').slice(0, 120);

  try {
    const batch = writeBatch(db);
    const memRef = doc(db, 'clinicMemberships', membership.id);
    const auditRef = doc(collection(db, 'staffAuditLogs'));
    const staffNotifRef = doc(collection(db, 'notifications'));
    const ownerNotifRef = doc(collection(db, 'notifications'));

    batch.update(memRef, {
      status: 'revoked',
      revokedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      clinicId: membership.clinicId,
      clinicOwnerId: actorUid,
      actorUid,
      targetUid: membership.userId,
      targetName,
      action: 'revoked_access',
      createdAt: serverTimestamp(),
    });

    batch.set(staffNotifRef, {
      recipientUid: membership.userId,
      clinicId: membership.clinicId,
      type: 'access_revoked',
      title: `Clinic access revoked`,
      message: `Your receptionist access to ${clinicName} has been revoked by the clinic administrator.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    batch.set(ownerNotifRef, {
      recipientUid: actorUid,
      clinicId: membership.clinicId,
      type: 'access_revoked',
      title: `Revoked access for ${targetName}`,
      message: `${targetName}'s receptionist access to ${clinicName} has been revoked.`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsAsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    notificationIds.forEach((id) => {
      batch.update(doc(db, 'notifications', id), { read: true });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function fetchUserWorkspace(uid: string): Promise<{
  profile: UserProfileRecord | null;
  membership: ClinicMembershipRecord | null;
  clinic: ClinicRecord | null;
  joinRequest: ClinicJoinRequestRecord | null;
}> {
  let profile: UserProfileRecord | null = null;
  let membership: ClinicMembershipRecord | null = null;
  let clinic: ClinicRecord | null = null;
  let joinRequest: ClinicJoinRequestRecord | null = null;

  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      profile = { uid: userSnap.id, ...(userSnap.data() as Omit<UserProfileRecord, 'uid'>) };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  try {
    const memQuery = query(collection(db, 'clinicMemberships'), where('userId', '==', uid));
    const memSnap = await getDocs(memQuery);
    const activeDoc =
      memSnap.docs.find((d) => d.data().status === 'active') || memSnap.docs[0] || null;

    if (activeDoc) {
      membership = {
        id: activeDoc.id,
        ...(activeDoc.data() as Omit<ClinicMembershipRecord, 'id'>),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'clinicMemberships');
  }

  try {
    const reqQuery = query(collection(db, 'clinicJoinRequests'), where('userId', '==', uid));
    const reqSnap = await getDocs(reqQuery);
    const sortedReqs = reqSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ClinicJoinRequestRecord, 'id'>) }))
      .sort((a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0));
    joinRequest = sortedReqs.find((r) => r.status === 'pending') || sortedReqs[0] || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'clinicJoinRequests');
  }

  if (membership && membership.status === 'active') {
    try {
      const clinicSnap = await getDoc(doc(db, 'clinics', membership.clinicId));
      if (clinicSnap.exists()) {
        clinic = {
          id: clinicSnap.id,
          ...(clinicSnap.data() as Omit<ClinicRecord, 'id'>),
        };
        if (membership.role === 'owner') {
          void syncClinicCodePublicInfo(clinic);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `clinics/${membership.clinicId}`);
    }
  }

  return { profile, membership, clinic, joinRequest };
}
