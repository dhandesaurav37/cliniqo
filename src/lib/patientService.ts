import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  writeBatch,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { MembershipRole } from './clinicService';
import { db, handleFirestoreError, OperationType } from './firebase';

export type PatientGender = 'male' | 'female' | 'other';
export type PatientStatus = 'active' | 'archived';

export interface EmergencyContact {
  name: string;
  mobile: string;
  relation?: string;
}

export interface PatientRecord {
  id: string;
  patientId: string;
  clinicId: string;
  fullName: string;
  fullNameLower: string;
  dateOfBirth: string | null;
  age: number | null;
  gender: PatientGender | null;
  mobile: string;
  mobileLast10: string;
  alternateMobile: string;
  address: string;
  city: string;
  pincode: string;
  allergies: string[];
  existingConditions: string[];
  currentMedications: string[];
  emergencyContact: EmergencyContact | null;
  medicalNotes: string;
  registrationDate?: Timestamp;
  registeredBy: string;
  registeredByName?: string;
  status: PatientStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DoctorClinicalNoteRecord {
  clinicId: string;
  patientDocId: string;
  clinicalNotes: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface PatientAuditLogRecord {
  id: string;
  clinicId: string;
  patientDocId: string;
  patientId: string;
  patientName: string;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  action:
    | 'registered_patient'
    | 'updated_demographics'
    | 'updated_medical_info'
    | 'updated_clinical_notes'
    | 'archived_patient'
    | 'restored_patient';
  summary: string;
  createdAt?: Timestamp;
}

export interface PatientFormInput {
  fullName: string;
  dateOfBirth: string;
  age: number | null;
  gender: PatientGender | '';
  mobile: string;
  alternateMobile: string;
  address: string;
  city: string;
  pincode: string;
  allergiesText: string;
  existingConditionsText: string;
  currentMedicationsText: string;
  emergencyName: string;
  emergencyMobile: string;
  emergencyRelation: string;
  medicalNotes: string;
}

export function normalizeMobileLast10(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function calculateAgeFromDob(dob: string | null | undefined): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}

export function parseCommaSeparatedList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 30);
}

export function buildEmergencyContact(
  name: string,
  mobile: string,
  relation: string,
): EmergencyContact | null {
  const cleanName = name.trim().slice(0, 120);
  const cleanMobile = mobile.trim().slice(0, 24);
  const cleanRelation = relation.trim().slice(0, 60);
  if (!cleanName && !cleanMobile) return null;
  if (!cleanName || cleanMobile.length < 7) return null;
  const contact: EmergencyContact = {
    name: cleanName,
    mobile: cleanMobile,
  };
  if (cleanRelation) {
    contact.relation = cleanRelation;
  }
  return contact;
}

export async function findDuplicatePatientsByMobile(
  clinicId: string,
  mobile: string,
): Promise<PatientRecord[]> {
  const mobileLast10 = normalizeMobileLast10(mobile);
  if (mobileLast10.length < 7) return [];

  const path = `clinics/${clinicId}/patients`;
  try {
    const q = query(
      collection(db, 'clinics', clinicId, 'patients'),
      where('mobileLast10', '==', mobileLast10),
      limit(10),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
      .filter((p) => p.status === 'active');
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function registerClinicPatient(params: {
  clinicId: string;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  input: PatientFormInput;
}): Promise<{ docId: string; patientId: string }> {
  const { clinicId, actorUid, actorName, actorRole, input } = params;
  const cleanName = input.fullName.trim().slice(0, 120);
  const cleanMobile = input.mobile.trim().slice(0, 24);
  const mobileLast10 = normalizeMobileLast10(cleanMobile);
  const dob = input.dateOfBirth.trim() ? input.dateOfBirth.trim().slice(0, 10) : null;
  const computedAge = dob ? calculateAgeFromDob(dob) : input.age;
  const year = new Date().getFullYear();

  const allergies = parseCommaSeparatedList(input.allergiesText);
  const existingConditions = parseCommaSeparatedList(input.existingConditionsText);
  const currentMedications = parseCommaSeparatedList(input.currentMedicationsText);
  const emergencyContact = buildEmergencyContact(
    input.emergencyName,
    input.emergencyMobile,
    input.emergencyRelation,
  );

  const path = `clinics/${clinicId}/patients`;
  try {
    return await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'clinics', clinicId, 'counters', 'patientCounter');
      const counterSnap = await tx.get(counterRef);

      let nextSeq = 1;
      if (counterSnap.exists()) {
        const counterData = counterSnap.data();
        if (Number(counterData.year) === year) {
          nextSeq = Number(counterData.seq || 0) + 1;
        }
      }

      const patientId = `PAT-${year}-${String(nextSeq).padStart(4, '0')}`;
      const patientRef = doc(collection(db, 'clinics', clinicId, 'patients'));
      const auditRef = doc(collection(db, 'clinics', clinicId, 'patientAuditLogs'));

      tx.set(counterRef, {
        clinicId,
        year,
        seq: nextSeq,
        updatedAt: serverTimestamp(),
      });

      tx.set(patientRef, {
        patientId,
        clinicId,
        fullName: cleanName,
        fullNameLower: cleanName.toLowerCase(),
        dateOfBirth: dob,
        age: computedAge !== null && computedAge >= 0 && computedAge <= 130 ? computedAge : null,
        gender: input.gender ? input.gender : null,
        mobile: cleanMobile,
        mobileLast10,
        alternateMobile: input.alternateMobile.trim().slice(0, 24),
        address: input.address.trim().slice(0, 300),
        city: input.city.trim().slice(0, 100),
        pincode: input.pincode.trim().slice(0, 12),
        allergies,
        existingConditions,
        currentMedications,
        emergencyContact,
        medicalNotes: input.medicalNotes.trim().slice(0, 2000),
        registrationDate: serverTimestamp(),
        registeredBy: actorUid,
        registeredByName: actorName.trim().slice(0, 120) || 'Clinic Staff',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        clinicId,
        patientDocId: patientRef.id,
        patientId,
        patientName: cleanName,
        actorUid,
        actorName: actorName.trim().slice(0, 120) || 'Clinic Staff',
        actorRole,
        action: 'registered_patient',
        summary: `Registered patient ${patientId}`,
        createdAt: serverTimestamp(),
      });

      return { docId: patientRef.id, patientId };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPatientStats(
  clinicId: string,
  startOfTodayUtcMs?: number,
): Promise<{
  totalActive: number;
  todayRegistered: number;
  recentPatients: PatientRecord[];
}> {
  const path = `clinics/${clinicId}/patients`;
  try {
    const patientsCol = collection(db, 'clinics', clinicId, 'patients');
    const [countSnap, recentSnap, todaySnap] = await Promise.all([
      getCountFromServer(query(patientsCol, where('status', '==', 'active'))),
      getDocs(query(patientsCol, orderBy('registrationDate', 'desc'), limit(6))),
      typeof startOfTodayUtcMs === 'number'
        ? getCountFromServer(
            query(
              patientsCol,
              where('registrationDate', '>=', Timestamp.fromMillis(startOfTodayUtcMs)),
            ),
          )
        : Promise.resolve(null),
    ]);

    const recentPatients = recentSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
      .filter((p) => p.status === 'active')
      .slice(0, 5);

    return {
      totalActive: countSnap.data().count,
      todayRegistered: todaySnap ? todaySnap.data().count : 0,
      recentPatients,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface PatientQueryOptions {
  searchText?: string;
  sortOrder?: 'newest' | 'oldest';
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: 'active' | 'archived' | 'all';
  pageSize?: number;
  cursor?: QueryDocumentSnapshot | null;
}

export async function queryPatientsPage(
  clinicId: string,
  options: PatientQueryOptions = {},
): Promise<{
  patients: PatientRecord[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
  isSearchMode: boolean;
}> {
  const {
    searchText = '',
    sortOrder = 'newest',
    dateFrom = '',
    dateTo = '',
    statusFilter = 'active',
    pageSize = 15,
    cursor = null,
  } = options;

  const path = `clinics/${clinicId}/patients`;
  const patientsCol = collection(db, 'clinics', clinicId, 'patients');
  const trimmed = searchText.trim();

  try {
    // Mode 1: Indexed search queries (never downloads full collection)
    if (trimmed.length > 0) {
      const upper = trimmed.toUpperCase();
      let snap;

      if (upper.startsWith('PAT-')) {
        snap = await getDocs(query(patientsCol, where('patientId', '==', upper), limit(15)));
      } else if (/^[+\d\s()-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 3) {
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length >= 10) {
          const last10 = digits.slice(-10);
          snap = await getDocs(
            query(patientsCol, where('mobileLast10', '==', last10), limit(25)),
          );
        } else {
          snap = await getDocs(
            query(
              patientsCol,
              where('mobileLast10', '>=', digits),
              where('mobileLast10', '<=', `${digits}\uf8ff`),
              orderBy('mobileLast10'),
              limit(25),
            ),
          );
        }
      } else {
        const lower = trimmed.toLowerCase();
        snap = await getDocs(
          query(
            patientsCol,
            where('fullNameLower', '>=', lower),
            where('fullNameLower', '<=', `${lower}\uf8ff`),
            orderBy('fullNameLower'),
            limit(25),
          ),
        );
      }

      const matched = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
        .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter));

      return {
        patients: matched,
        lastDoc: null,
        hasMore: false,
        isSearchMode: true,
      };
    }

    // Mode 2: Paginated list with optional registrationDate range & sort
    const constraints: QueryConstraint[] = [];
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00`);
      if (!Number.isNaN(fromDate.getTime())) {
        constraints.push(where('registrationDate', '>=', Timestamp.fromDate(fromDate)));
      }
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999`);
      if (!Number.isNaN(toDate.getTime())) {
        constraints.push(where('registrationDate', '<=', Timestamp.fromDate(toDate)));
      }
    }

    constraints.push(orderBy('registrationDate', sortOrder === 'oldest' ? 'asc' : 'desc'));
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(pageSize + 1));

    const snap = await getDocs(query(patientsCol, ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const patients = pageDocs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) }))
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter));

    return {
      patients,
      lastDoc: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
      hasMore,
      isSearchMode: false,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPatientByIdOrCode(
  clinicId: string,
  idOrCode: string,
): Promise<PatientRecord | null> {
  const clean = idOrCode.trim();
  if (!clean) return null;

  const path = `clinics/${clinicId}/patients/${clean}`;
  try {
    if (clean.toUpperCase().startsWith('PAT-')) {
      const snap = await getDocs(
        query(
          collection(db, 'clinics', clinicId, 'patients'),
          where('patientId', '==', clean.toUpperCase()),
          limit(1),
        ),
      );
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) };
    }

    const docSnap = await getDoc(doc(db, 'clinics', clinicId, 'patients', clean));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...(docSnap.data() as Omit<PatientRecord, 'id'>) };
    }

    // Fallback check by patientId
    const byCodeSnap = await getDocs(
      query(
        collection(db, 'clinics', clinicId, 'patients'),
        where('patientId', '==', clean),
        limit(1),
      ),
    );
    if (byCodeSnap.empty) return null;
    const d = byCodeSnap.docs[0];
    return { id: d.id, ...(d.data() as Omit<PatientRecord, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchDoctorClinicalNote(
  clinicId: string,
  patientDocId: string,
): Promise<DoctorClinicalNoteRecord | null> {
  const path = `clinics/${clinicId}/patients/${patientDocId}/doctorNotes/clinical`;
  try {
    const snap = await getDoc(
      doc(db, 'clinics', clinicId, 'patients', patientDocId, 'doctorNotes', 'clinical'),
    );
    if (!snap.exists()) return null;
    return snap.data() as DoctorClinicalNoteRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updatePatientDemographics(params: {
  clinicId: string;
  patient: PatientRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  input: PatientFormInput;
}): Promise<void> {
  const { clinicId, patient, actorUid, actorName, actorRole, input } = params;
  const cleanName = input.fullName.trim().slice(0, 120);
  const cleanMobile = input.mobile.trim().slice(0, 24);
  const dob = input.dateOfBirth.trim() ? input.dateOfBirth.trim().slice(0, 10) : null;
  const computedAge = dob ? calculateAgeFromDob(dob) : input.age;
  const emergencyContact = buildEmergencyContact(
    input.emergencyName,
    input.emergencyMobile,
    input.emergencyRelation,
  );

  const path = `clinics/${clinicId}/patients/${patient.id}`;
  try {
    const batch = writeBatch(db);
    const patientRef = doc(db, 'clinics', clinicId, 'patients', patient.id);
    const auditRef = doc(collection(db, 'clinics', clinicId, 'patientAuditLogs'));

    batch.update(patientRef, {
      fullName: cleanName,
      fullNameLower: cleanName.toLowerCase(),
      dateOfBirth: dob,
      age: computedAge !== null && computedAge >= 0 && computedAge <= 130 ? computedAge : null,
      gender: input.gender ? input.gender : null,
      mobile: cleanMobile,
      mobileLast10: normalizeMobileLast10(cleanMobile),
      alternateMobile: input.alternateMobile.trim().slice(0, 24),
      address: input.address.trim().slice(0, 300),
      city: input.city.trim().slice(0, 100),
      pincode: input.pincode.trim().slice(0, 12),
      emergencyContact,
      updatedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      clinicId,
      patientDocId: patient.id,
      patientId: patient.patientId,
      patientName: cleanName,
      actorUid,
      actorName: actorName.trim().slice(0, 120) || 'Clinic Staff',
      actorRole,
      action: 'updated_demographics',
      summary: 'Updated patient demographic information',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePatientFullByDoctor(params: {
  clinicId: string;
  patient: PatientRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  input: PatientFormInput;
  doctorClinicalNotes: string;
}): Promise<void> {
  const { clinicId, patient, actorUid, actorName, actorRole, input, doctorClinicalNotes } = params;
  const cleanName = input.fullName.trim().slice(0, 120);
  const cleanMobile = input.mobile.trim().slice(0, 24);
  const dob = input.dateOfBirth.trim() ? input.dateOfBirth.trim().slice(0, 10) : null;
  const computedAge = dob ? calculateAgeFromDob(dob) : input.age;
  const emergencyContact = buildEmergencyContact(
    input.emergencyName,
    input.emergencyMobile,
    input.emergencyRelation,
  );

  const path = `clinics/${clinicId}/patients/${patient.id}`;
  try {
    const batch = writeBatch(db);
    const patientRef = doc(db, 'clinics', clinicId, 'patients', patient.id);
    const noteRef = doc(db, 'clinics', clinicId, 'patients', patient.id, 'doctorNotes', 'clinical');
    const auditRef = doc(collection(db, 'clinics', clinicId, 'patientAuditLogs'));

    batch.update(patientRef, {
      fullName: cleanName,
      fullNameLower: cleanName.toLowerCase(),
      dateOfBirth: dob,
      age: computedAge !== null && computedAge >= 0 && computedAge <= 130 ? computedAge : null,
      gender: input.gender ? input.gender : null,
      mobile: cleanMobile,
      mobileLast10: normalizeMobileLast10(cleanMobile),
      alternateMobile: input.alternateMobile.trim().slice(0, 24),
      address: input.address.trim().slice(0, 300),
      city: input.city.trim().slice(0, 100),
      pincode: input.pincode.trim().slice(0, 12),
      emergencyContact,
      allergies: parseCommaSeparatedList(input.allergiesText),
      existingConditions: parseCommaSeparatedList(input.existingConditionsText),
      currentMedications: parseCommaSeparatedList(input.currentMedicationsText),
      medicalNotes: input.medicalNotes.trim().slice(0, 2000),
      updatedAt: serverTimestamp(),
    });

    batch.set(noteRef, {
      clinicId,
      patientDocId: patient.id,
      clinicalNotes: doctorClinicalNotes.trim().slice(0, 5000),
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      clinicId,
      patientDocId: patient.id,
      patientId: patient.patientId,
      patientName: cleanName,
      actorUid,
      actorName: actorName.trim().slice(0, 120) || 'Doctor',
      actorRole,
      action: 'updated_medical_info',
      summary: 'Updated patient demographics and medical information',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setPatientArchiveStatus(params: {
  clinicId: string;
  patient: PatientRecord;
  nextStatus: PatientStatus;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
}): Promise<void> {
  const { clinicId, patient, nextStatus, actorUid, actorName, actorRole } = params;
  const path = `clinics/${clinicId}/patients/${patient.id}`;
  try {
    const batch = writeBatch(db);
    const patientRef = doc(db, 'clinics', clinicId, 'patients', patient.id);
    const auditRef = doc(collection(db, 'clinics', clinicId, 'patientAuditLogs'));

    batch.update(patientRef, {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      clinicId,
      patientDocId: patient.id,
      patientId: patient.patientId,
      patientName: patient.fullName,
      actorUid,
      actorName: actorName.trim().slice(0, 120) || 'Clinic Staff',
      actorRole,
      action: nextStatus === 'archived' ? 'archived_patient' : 'restored_patient',
      summary:
        nextStatus === 'archived'
          ? `Archived patient record ${patient.patientId}`
          : `Restored patient record ${patient.patientId}`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchPatientAuditLogs(
  clinicId: string,
  patientDocId: string,
): Promise<PatientAuditLogRecord[]> {
  const path = `clinics/${clinicId}/patientAuditLogs`;
  try {
    const q = query(
      collection(db, 'clinics', clinicId, 'patientAuditLogs'),
      where('patientDocId', '==', patientDocId),
      limit(30),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientAuditLogRecord, 'id'>) }))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
