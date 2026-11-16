import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import type { MembershipRole } from './clinicService';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { PatientRecord } from './patientService';
import type { PrescriptionMedicineItem } from './prescriptionLogic';

export type ConsultationStatus = 'draft' | 'completed';
export type PrescriptionStatus = 'draft' | 'finalized';
export type PrescriptionAuditAction =
  | 'created_draft'
  | 'updated_draft'
  | 'finalized_prescription'
  | 'created_amendment'
  | 'printed_or_downloaded_pdf';

export interface ClinicalObservations {
  bloodPressure?: string;
  pulseRate?: string;
  temperature?: string;
  oxygenSaturation?: string;
  weight?: string;
  height?: string;
}

export interface ConsultationRecord {
  id: string;
  clinicId: string;
  patientId: string;
  patientDocumentId: string;
  queueEntryId?: string | null;
  queueDate?: string | null;
  doctorId: string;
  doctorName: string;
  chiefComplaint?: string;
  symptoms: string[];
  symptomDuration?: string;
  additionalSymptoms?: string;
  observations: ClinicalObservations;
  primaryDiagnosis?: string;
  additionalDiagnosis?: string;
  diagnoses: string[];
  clinicalNotes?: string;
  examinationFindings?: string;
  doctorAdvice?: string;
  additionalInstructions?: string;
  status: ConsultationStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp | null;
}

export interface ConsultationUpdateInput {
  chiefComplaint: string;
  symptoms: string[];
  symptomDuration: string;
  additionalSymptoms: string;
  observations: ClinicalObservations;
  primaryDiagnosis: string;
  additionalDiagnosis: string;
  diagnoses: string[];
  clinicalNotes: string;
  examinationFindings: string;
  doctorAdvice: string;
  additionalInstructions: string;
}

export interface PrescriptionRecord {
  id: string;
  clinicId: string;
  consultationId: string;
  patientId: string;
  patientDocumentId: string;
  prescriptionNumber: string;
  doctorId: string;
  doctorName: string;
  medicines: PrescriptionMedicineItem[];
  generalInstructions: string[];
  followUpRecommendation: string | null;
  followUpDate: string | null;
  allergyWarningsSnapshot?: string[];
  doctorConfirmedReview: boolean;
  status: PrescriptionStatus;
  version: number;
  parentPrescriptionId?: string | null;
  rootPrescriptionId?: string | null;
  amendmentReason?: string | null;
  amendedByUid?: string | null;
  signedByUid?: string | null;
  signedByName?: string | null;
  signedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PrescriptionTemplateRecord {
  id: string;
  clinicId: string;
  name: string;
  description?: string;
  medicines: PrescriptionMedicineItem[];
  generalInstructions: string[];
  followUpRecommendation?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PrescriptionAuditLogRecord {
  id: string;
  clinicId: string;
  prescriptionId: string;
  consultationId: string;
  patientId: string;
  actorUid: string;
  actorName: string;
  actorRole: 'owner' | 'doctor';
  action: PrescriptionAuditAction;
  version: number;
  reason?: string | null;
  summary: string;
  createdAt?: Timestamp;
}

class ConsultationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsultationDomainError';
  }
}

function rethrowConsultationError(error: unknown, op: OperationType, path: string): never {
  if (error instanceof ConsultationDomainError) {
    throw error;
  }
  handleFirestoreError(error, op, path);
}

function generatePrescriptionNumber(): string {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RX-${year}-${suffix}`;
}

function sanitizeMedicinesForFirestore(medicines: PrescriptionMedicineItem[]): PrescriptionMedicineItem[] {
  return medicines.slice(0, 30).map((m) => ({
    id: String(m.id || `rx-${Date.now()}`).slice(0, 64),
    medicineId: m.medicineId ? String(m.medicineId).slice(0, 128) : null,
    medicineName: String(m.medicineName || '').trim().slice(0, 140),
    genericName: String(m.genericName || '').trim().slice(0, 140),
    brandName: String(m.brandName || '').trim().slice(0, 140),
    strength: String(m.strength || '').trim().slice(0, 60),
    dosageForm: String(m.dosageForm || 'Tablet').trim().slice(0, 40),
    route: String(m.route || 'Oral').trim().slice(0, 40),
    doseAmount: typeof m.doseAmount === 'number' && !Number.isNaN(m.doseAmount) ? m.doseAmount : null,
    doseUnit: String(m.doseUnit || 'unit').trim().slice(0, 30),
    dosageDisplay: String(m.dosageDisplay || 'As directed').trim().slice(0, 80),
    frequencyPreset: m.frequencyPreset || 'as_directed',
    frequencyLabel: String(m.frequencyLabel || '').trim().slice(0, 80),
    dailyAdministrations:
      typeof m.dailyAdministrations === 'number' && !Number.isNaN(m.dailyAdministrations)
        ? m.dailyAdministrations
        : null,
    durationDays:
      typeof m.durationDays === 'number' && !Number.isNaN(m.durationDays) ? m.durationDays : null,
    durationText: String(m.durationText || '').trim().slice(0, 80),
    timing: String(m.timing || 'After food').trim().slice(0, 60),
    calculatedQuantity:
      typeof m.calculatedQuantity === 'number' && !Number.isNaN(m.calculatedQuantity)
        ? m.calculatedQuantity
        : null,
    calculatedUnit: m.calculatedUnit ? String(m.calculatedUnit).slice(0, 30) : null,
    quantityNumeric:
      typeof m.quantityNumeric === 'number' && !Number.isNaN(m.quantityNumeric)
        ? m.quantityNumeric
        : null,
    quantityDisplay: String(m.quantityDisplay || '').trim().slice(0, 80),
    quantityOverridden: Boolean(m.quantityOverridden),
    isVariableSchedule: Boolean(m.isVariableSchedule),
    isPrn: Boolean(m.isPrn),
    specialInstructions: String(m.specialInstructions || '').trim().slice(0, 300),
  }));
}

function sanitizeObservations(obs: ClinicalObservations): ClinicalObservations {
  const clean: ClinicalObservations = {};
  if (obs.bloodPressure?.trim()) clean.bloodPressure = obs.bloodPressure.trim().slice(0, 32);
  if (obs.pulseRate?.trim()) clean.pulseRate = obs.pulseRate.trim().slice(0, 32);
  if (obs.temperature?.trim()) clean.temperature = obs.temperature.trim().slice(0, 32);
  if (obs.oxygenSaturation?.trim()) clean.oxygenSaturation = obs.oxygenSaturation.trim().slice(0, 32);
  if (obs.weight?.trim()) clean.weight = obs.weight.trim().slice(0, 32);
  if (obs.height?.trim()) clean.height = obs.height.trim().slice(0, 32);
  return clean;
}

export async function openOrCreateConsultationForQueueEntry(params: {
  clinicId: string;
  patient: Pick<PatientRecord, 'id' | 'patientId'>;
  queueEntryId: string;
  queueDate: string;
  doctorUid: string;
  doctorName: string;
}): Promise<string> {
  const { clinicId, patient, queueEntryId, queueDate, doctorUid, doctorName } = params;
  const path = `clinics/${clinicId}/consultations`;
  try {
    const existingSnap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'consultations'),
        where('queueEntryId', '==', queueEntryId),
        limit(1),
      ),
    );
    if (!existingSnap.empty) {
      return existingSnap.docs[0].id;
    }

    const ref = doc(collection(db, 'clinics', clinicId, 'consultations'));
    await setDoc(ref, {
      clinicId,
      patientId: patient.patientId,
      patientDocumentId: patient.id,
      queueEntryId,
      queueDate,
      doctorId: doctorUid,
      doctorName: doctorName.trim().slice(0, 120) || 'Doctor',
      chiefComplaint: '',
      symptoms: [],
      symptomDuration: '',
      additionalSymptoms: '',
      observations: {},
      primaryDiagnosis: '',
      additionalDiagnosis: '',
      diagnoses: [],
      clinicalNotes: '',
      examinationFindings: '',
      doctorAdvice: '',
      additionalInstructions: '',
      status: 'draft',
      completedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    rethrowConsultationError(error, OperationType.WRITE, path);
  }
}

export async function createStandaloneConsultation(params: {
  clinicId: string;
  patient: Pick<PatientRecord, 'id' | 'patientId'>;
  doctorUid: string;
  doctorName: string;
}): Promise<string> {
  const { clinicId, patient, doctorUid, doctorName } = params;
  const path = `clinics/${clinicId}/consultations`;
  try {
    const ref = doc(collection(db, 'clinics', clinicId, 'consultations'));
    await setDoc(ref, {
      clinicId,
      patientId: patient.patientId,
      patientDocumentId: patient.id,
      queueEntryId: null,
      queueDate: null,
      doctorId: doctorUid,
      doctorName: doctorName.trim().slice(0, 120) || 'Doctor',
      chiefComplaint: '',
      symptoms: [],
      symptomDuration: '',
      additionalSymptoms: '',
      observations: {},
      primaryDiagnosis: '',
      additionalDiagnosis: '',
      diagnoses: [],
      clinicalNotes: '',
      examinationFindings: '',
      doctorAdvice: '',
      additionalInstructions: '',
      status: 'draft',
      completedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    rethrowConsultationError(error, OperationType.CREATE, path);
  }
}

export async function fetchConsultationById(
  clinicId: string,
  consultationId: string,
): Promise<ConsultationRecord | null> {
  const path = `clinics/${clinicId}/consultations/${consultationId}`;
  try {
    const snap = await getDoc(doc(db, 'clinics', clinicId, 'consultations', consultationId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<ConsultationRecord, 'id'>),
    };
  } catch (error) {
    rethrowConsultationError(error, OperationType.GET, path);
  }
}

export async function fetchPatientConsultations(
  clinicId: string,
  patientDocumentId: string,
): Promise<ConsultationRecord[]> {
  const path = `clinics/${clinicId}/consultations`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'consultations'),
        where('patientDocumentId', '==', patientDocumentId),
        limit(30),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ConsultationRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function fetchPatientPrescriptions(
  clinicId: string,
  patientDocumentId: string,
): Promise<PrescriptionRecord[]> {
  const path = `clinics/${clinicId}/prescriptions`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'prescriptions'),
        where('patientDocumentId', '==', patientDocumentId),
        limit(40),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function saveConsultationDraft(params: {
  clinicId: string;
  consultationId: string;
  input: ConsultationUpdateInput;
  markCompleted?: boolean;
}): Promise<void> {
  const { clinicId, consultationId, input, markCompleted = false } = params;
  const path = `clinics/${clinicId}/consultations/${consultationId}`;
  try {
    const symptoms = Array.from(
      new Set(
        [input.chiefComplaint.trim(), ...input.symptoms.map((s) => s.trim())].filter(Boolean),
      ),
    ).slice(0, 30);

    const diagnoses = Array.from(
      new Set(
        [input.primaryDiagnosis.trim(), ...input.diagnoses.map((d) => d.trim())].filter(Boolean),
      ),
    ).slice(0, 20);

    await updateDoc(doc(db, 'clinics', clinicId, 'consultations', consultationId), {
      chiefComplaint: input.chiefComplaint.trim().slice(0, 500),
      symptoms,
      symptomDuration: input.symptomDuration.trim().slice(0, 120),
      additionalSymptoms: input.additionalSymptoms.trim().slice(0, 1000),
      observations: sanitizeObservations(input.observations),
      primaryDiagnosis: input.primaryDiagnosis.trim().slice(0, 300),
      additionalDiagnosis: input.additionalDiagnosis.trim().slice(0, 500),
      diagnoses,
      clinicalNotes: input.clinicalNotes.trim().slice(0, 4000),
      examinationFindings: input.examinationFindings.trim().slice(0, 3000),
      doctorAdvice: input.doctorAdvice.trim().slice(0, 3000),
      additionalInstructions: input.additionalInstructions.trim().slice(0, 2000),
      status: markCompleted ? 'completed' : 'draft',
      completedAt: markCompleted ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    rethrowConsultationError(error, OperationType.UPDATE, path);
  }
}

export async function fetchPrescriptionsForConsultation(
  clinicId: string,
  consultationId: string,
): Promise<PrescriptionRecord[]> {
  const path = `clinics/${clinicId}/prescriptions`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'prescriptions'),
        where('consultationId', '==', consultationId),
        limit(20),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionRecord, 'id'>) }))
      .sort((a, b) => (b.version - a.version) || ((b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function fetchClinicPrescriptions(clinicId: string): Promise<PrescriptionRecord[]> {
  const path = `clinics/${clinicId}/prescriptions`;
  try {
    const snap = await getDocs(
      query(collection(db, 'clinics', clinicId, 'prescriptions'), limit(120)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function fetchPrescriptionById(
  clinicId: string,
  prescriptionId: string,
): Promise<PrescriptionRecord | null> {
  const path = `clinics/${clinicId}/prescriptions/${prescriptionId}`;
  try {
    const snap = await getDoc(doc(db, 'clinics', clinicId, 'prescriptions', prescriptionId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<PrescriptionRecord, 'id'>),
    };
  } catch (error) {
    rethrowConsultationError(error, OperationType.GET, path);
  }
}

export async function savePrescriptionDraft(params: {
  clinicId: string;
  prescriptionId?: string | null;
  consultation: Pick<ConsultationRecord, 'id' | 'patientId' | 'patientDocumentId'>;
  doctorUid: string;
  doctorName: string;
  actorRole: MembershipRole;
  medicines: PrescriptionMedicineItem[];
  generalInstructions: string[];
  followUpRecommendation: string;
  followUpDate: string;
  allergyWarningsSnapshot: string[];
}): Promise<string> {
  const {
    clinicId,
    prescriptionId,
    consultation,
    doctorUid,
    doctorName,
    actorRole,
    medicines,
    generalInstructions,
    followUpRecommendation,
    followUpDate,
    allergyWarningsSnapshot,
  } = params;

  const cleanMedicines = sanitizeMedicinesForFirestore(medicines);
  const cleanInstructions = generalInstructions.map((i) => i.trim().slice(0, 240)).filter(Boolean).slice(0, 20);
  const cleanWarnings = allergyWarningsSnapshot.map((w) => w.trim().slice(0, 240)).filter(Boolean).slice(0, 30);
  const safeRole = actorRole === 'owner' ? 'owner' : 'doctor';

  if (prescriptionId) {
    const path = `clinics/${clinicId}/prescriptions/${prescriptionId}`;
    try {
      const ref = doc(db, 'clinics', clinicId, 'prescriptions', prescriptionId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new ConsultationDomainError('Prescription draft not found.');
      }
      if (snap.data().status !== 'draft') {
        throw new ConsultationDomainError(
          'Finalized prescriptions are locked and cannot be modified. Create an amendment version instead.',
        );
      }

      const batch = writeBatch(db);
      batch.update(ref, {
        medicines: cleanMedicines,
        generalInstructions: cleanInstructions,
        followUpRecommendation: followUpRecommendation.trim().slice(0, 300) || null,
        followUpDate: followUpDate.trim().slice(0, 20) || null,
        allergyWarningsSnapshot: cleanWarnings,
        doctorConfirmedReview: false,
        status: 'draft',
        signedAt: null,
        signedByUid: null,
        signedByName: null,
        updatedAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'));
      batch.set(auditRef, {
        clinicId,
        prescriptionId,
        consultationId: consultation.id,
        patientId: consultation.patientId,
        actorUid: doctorUid,
        actorName: doctorName.trim().slice(0, 120) || 'Doctor',
        actorRole: safeRole,
        action: 'updated_draft',
        version: Number(snap.data().version || 1),
        reason: null,
        summary: `Saved draft Rx ${String(snap.data().prescriptionNumber || '')} (${cleanMedicines.length} medicines)`,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      return prescriptionId;
    } catch (error) {
      rethrowConsultationError(error, OperationType.UPDATE, path);
    }
  }

  const path = `clinics/${clinicId}/prescriptions`;
  try {
    const ref = doc(collection(db, 'clinics', clinicId, 'prescriptions'));
    const prescriptionNumber = generatePrescriptionNumber();
    const batch = writeBatch(db);

    batch.set(ref, {
      clinicId,
      consultationId: consultation.id,
      patientId: consultation.patientId,
      patientDocumentId: consultation.patientDocumentId,
      prescriptionNumber,
      doctorId: doctorUid,
      doctorName: doctorName.trim().slice(0, 120) || 'Doctor',
      medicines: cleanMedicines,
      generalInstructions: cleanInstructions,
      followUpRecommendation: followUpRecommendation.trim().slice(0, 300) || null,
      followUpDate: followUpDate.trim().slice(0, 20) || null,
      allergyWarningsSnapshot: cleanWarnings,
      doctorConfirmedReview: false,
      status: 'draft',
      version: 1,
      parentPrescriptionId: null,
      rootPrescriptionId: ref.id,
      amendmentReason: null,
      amendedByUid: null,
      signedByUid: null,
      signedByName: null,
      signedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const auditRef = doc(collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'));
    batch.set(auditRef, {
      clinicId,
      prescriptionId: ref.id,
      consultationId: consultation.id,
      patientId: consultation.patientId,
      actorUid: doctorUid,
      actorName: doctorName.trim().slice(0, 120) || 'Doctor',
      actorRole: safeRole,
      action: 'created_draft',
      version: 1,
      reason: null,
      summary: `Created draft prescription ${prescriptionNumber}`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return ref.id;
  } catch (error) {
    rethrowConsultationError(error, OperationType.CREATE, path);
  }
}

export async function finalizeAndSignPrescription(params: {
  clinicId: string;
  prescriptionId: string;
  consultation: Pick<ConsultationRecord, 'id' | 'patientId' | 'patientDocumentId'>;
  doctorUid: string;
  doctorName: string;
  actorRole: MembershipRole;
  medicines: PrescriptionMedicineItem[];
  generalInstructions: string[];
  followUpRecommendation: string;
  followUpDate: string;
  allergyWarningsSnapshot: string[];
}): Promise<void> {
  const {
    clinicId,
    prescriptionId,
    consultation,
    doctorUid,
    doctorName,
    actorRole,
    medicines,
    generalInstructions,
    followUpRecommendation,
    followUpDate,
    allergyWarningsSnapshot,
  } = params;

  if (medicines.length === 0) {
    throw new ConsultationDomainError('Add at least one medicine before signing and finalizing.');
  }

  const path = `clinics/${clinicId}/prescriptions/${prescriptionId}`;
  const cleanMedicines = sanitizeMedicinesForFirestore(medicines);
  const cleanInstructions = generalInstructions.map((i) => i.trim().slice(0, 240)).filter(Boolean).slice(0, 20);
  const cleanWarnings = allergyWarningsSnapshot.map((w) => w.trim().slice(0, 240)).filter(Boolean).slice(0, 30);
  const safeRole = actorRole === 'owner' ? 'owner' : 'doctor';

  try {
    const ref = doc(db, 'clinics', clinicId, 'prescriptions', prescriptionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new ConsultationDomainError('Prescription draft not found.');
    }
    if (snap.data().status !== 'draft') {
      throw new ConsultationDomainError('This prescription has already been signed and finalized.');
    }

    const batch = writeBatch(db);
    batch.update(ref, {
      medicines: cleanMedicines,
      generalInstructions: cleanInstructions,
      followUpRecommendation: followUpRecommendation.trim().slice(0, 300) || null,
      followUpDate: followUpDate.trim().slice(0, 20) || null,
      allergyWarningsSnapshot: cleanWarnings,
      doctorConfirmedReview: true,
      status: 'finalized',
      signedByUid: doctorUid,
      signedByName: doctorName.trim().slice(0, 120) || 'Doctor',
      signedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const auditRef = doc(collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'));
    batch.set(auditRef, {
      clinicId,
      prescriptionId,
      consultationId: consultation.id,
      patientId: consultation.patientId,
      actorUid: doctorUid,
      actorName: doctorName.trim().slice(0, 120) || 'Doctor',
      actorRole: safeRole,
      action: 'finalized_prescription',
      version: Number(snap.data().version || 1),
      reason: null,
      summary: `Signed & finalized ${String(snap.data().prescriptionNumber || '')} v${Number(snap.data().version || 1)}`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    rethrowConsultationError(error, OperationType.UPDATE, path);
  }
}

export async function createAmendedPrescriptionDraft(params: {
  clinicId: string;
  parentPrescription: PrescriptionRecord;
  doctorUid: string;
  doctorName: string;
  actorRole: MembershipRole;
  reason: string;
}): Promise<string> {
  const { clinicId, parentPrescription, doctorUid, doctorName, actorRole, reason } = params;
  const cleanReason = reason.trim().slice(0, 300);
  if (cleanReason.length < 3) {
    throw new ConsultationDomainError('Please enter a brief amendment reason (minimum 3 characters).');
  }
  if (parentPrescription.status !== 'finalized') {
    throw new ConsultationDomainError('Only finalized prescriptions require a versioned amendment.');
  }

  const nextVersion = parentPrescription.version + 1;
  const path = `clinics/${clinicId}/prescriptions`;
  const safeRole = actorRole === 'owner' ? 'owner' : 'doctor';

  try {
    const ref = doc(collection(db, 'clinics', clinicId, 'prescriptions'));
    const batch = writeBatch(db);
    const rootId = parentPrescription.rootPrescriptionId || parentPrescription.id;

    batch.set(ref, {
      clinicId,
      consultationId: parentPrescription.consultationId,
      patientId: parentPrescription.patientId,
      patientDocumentId: parentPrescription.patientDocumentId,
      prescriptionNumber: `${parentPrescription.prescriptionNumber.split('-v')[0]}-v${nextVersion}`.slice(0, 40),
      doctorId: doctorUid,
      doctorName: doctorName.trim().slice(0, 120) || 'Doctor',
      medicines: sanitizeMedicinesForFirestore(parentPrescription.medicines),
      generalInstructions: parentPrescription.generalInstructions.slice(0, 20),
      followUpRecommendation: parentPrescription.followUpRecommendation || null,
      followUpDate: parentPrescription.followUpDate || null,
      allergyWarningsSnapshot: parentPrescription.allergyWarningsSnapshot || [],
      doctorConfirmedReview: false,
      status: 'draft',
      version: nextVersion,
      parentPrescriptionId: parentPrescription.id,
      rootPrescriptionId: rootId,
      amendmentReason: cleanReason,
      amendedByUid: doctorUid,
      signedByUid: null,
      signedByName: null,
      signedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const auditRef = doc(collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'));
    batch.set(auditRef, {
      clinicId,
      prescriptionId: ref.id,
      consultationId: parentPrescription.consultationId,
      patientId: parentPrescription.patientId,
      actorUid: doctorUid,
      actorName: doctorName.trim().slice(0, 120) || 'Doctor',
      actorRole: safeRole,
      action: 'created_amendment',
      version: nextVersion,
      reason: cleanReason,
      summary: `Created amendment draft v${nextVersion} from ${parentPrescription.prescriptionNumber}`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return ref.id;
  } catch (error) {
    rethrowConsultationError(error, OperationType.CREATE, path);
  }
}

export async function recordPrescriptionPdfAction(params: {
  clinicId: string;
  prescription: PrescriptionRecord;
  doctorUid: string;
  doctorName: string;
  actorRole: MembershipRole;
  mode: 'download' | 'print';
}): Promise<void> {
  const { clinicId, prescription, doctorUid, doctorName, actorRole, mode } = params;
  const safeRole = actorRole === 'owner' ? 'owner' : 'doctor';
  try {
    const auditRef = doc(collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'));
    await setDoc(auditRef, {
      clinicId,
      prescriptionId: prescription.id,
      consultationId: prescription.consultationId,
      patientId: prescription.patientId,
      actorUid: doctorUid,
      actorName: doctorName.trim().slice(0, 120) || 'Doctor',
      actorRole: safeRole,
      action: 'printed_or_downloaded_pdf',
      version: prescription.version,
      reason: null,
      summary:
        mode === 'download'
          ? `Downloaded A4 PDF for ${prescription.prescriptionNumber}`
          : `Printed ${prescription.prescriptionNumber}`,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit logging for document export
  }
}

export async function fetchPrescriptionAuditLogs(
  clinicId: string,
  prescriptionId: string,
): Promise<PrescriptionAuditLogRecord[]> {
  const path = `clinics/${clinicId}/prescriptionAuditLogs`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'prescriptionAuditLogs'),
        where('prescriptionId', '==', prescriptionId),
        limit(40),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionAuditLogRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function fetchPrescriptionTemplates(
  clinicId: string,
): Promise<PrescriptionTemplateRecord[]> {
  const path = `clinics/${clinicId}/prescriptionTemplates`;
  try {
    const snap = await getDocs(collection(db, 'clinics', clinicId, 'prescriptionTemplates'));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrescriptionTemplateRecord, 'id'>) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    rethrowConsultationError(error, OperationType.LIST, path);
  }
}

export async function savePrescriptionTemplate(params: {
  clinicId: string;
  templateId?: string | null;
  name: string;
  description?: string;
  medicines: PrescriptionMedicineItem[];
  generalInstructions: string[];
  followUpRecommendation?: string;
  doctorUid: string;
  doctorName: string;
}): Promise<string> {
  const {
    clinicId,
    templateId,
    name,
    description = '',
    medicines,
    generalInstructions,
    followUpRecommendation = '',
    doctorUid,
    doctorName,
  } = params;

  const cleanName = name.trim().slice(0, 120);
  if (cleanName.length < 2) {
    throw new ConsultationDomainError('Template name must be at least 2 characters.');
  }

  const payloadMedicines = sanitizeMedicinesForFirestore(medicines).slice(0, 25);
  const payloadInstructions = generalInstructions.map((i) => i.trim().slice(0, 240)).filter(Boolean).slice(0, 20);

  if (templateId) {
    const path = `clinics/${clinicId}/prescriptionTemplates/${templateId}`;
    try {
      await updateDoc(doc(db, 'clinics', clinicId, 'prescriptionTemplates', templateId), {
        name: cleanName,
        description: description.trim().slice(0, 300),
        medicines: payloadMedicines,
        generalInstructions: payloadInstructions,
        followUpRecommendation: followUpRecommendation.trim().slice(0, 300) || null,
        updatedAt: serverTimestamp(),
      });
      return templateId;
    } catch (error) {
      rethrowConsultationError(error, OperationType.UPDATE, path);
    }
  }

  const path = `clinics/${clinicId}/prescriptionTemplates`;
  try {
    const ref = doc(collection(db, 'clinics', clinicId, 'prescriptionTemplates'));
    await setDoc(ref, {
      clinicId,
      name: cleanName,
      description: description.trim().slice(0, 300),
      medicines: payloadMedicines,
      generalInstructions: payloadInstructions,
      followUpRecommendation: followUpRecommendation.trim().slice(0, 300) || null,
      createdBy: doctorUid,
      createdByName: doctorName.trim().slice(0, 120) || 'Doctor',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    rethrowConsultationError(error, OperationType.CREATE, path);
  }
}

export async function deletePrescriptionTemplate(
  clinicId: string,
  templateId: string,
): Promise<void> {
  const path = `clinics/${clinicId}/prescriptionTemplates/${templateId}`;
  try {
    await deleteDoc(doc(db, 'clinics', clinicId, 'prescriptionTemplates', templateId));
  } catch (error) {
    rethrowConsultationError(error, OperationType.DELETE, path);
  }
}
