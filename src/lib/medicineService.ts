import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getDefaultUnitForDosageForm } from './prescriptionLogic';

export type MedicineStatus = 'active' | 'inactive';

export interface MedicineRecord {
  id: string;
  clinicId: string;
  medicineName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  route: string;
  packagingInfo: string;
  defaultUnit: string;
  isSampleData: boolean;
  isFavorite: boolean;
  status: MedicineStatus;
  searchKeywords: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MedicineFormInput {
  medicineName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  route: string;
  packagingInfo: string;
  defaultUnit?: string;
  isFavorite?: boolean;
  isSampleData?: boolean;
}

export const STARTER_SAMPLE_MEDICINES: MedicineFormInput[] = [
  {
    medicineName: 'Paracetamol',
    genericName: 'Acetaminophen',
    brandName: 'Crocin / Dolo 500 (Sample)',
    strength: '500 mg',
    dosageForm: 'Tablet',
    route: 'Oral',
    packagingInfo: 'Strip of 15 tablets',
    defaultUnit: 'tablet',
    isFavorite: true,
    isSampleData: true,
  },
  {
    medicineName: 'Amoxicillin + Clavulanic Acid',
    genericName: 'Amoxicillin Clavulanate',
    brandName: 'Augmentin 625 (Sample)',
    strength: '625 mg',
    dosageForm: 'Tablet',
    route: 'Oral',
    packagingInfo: 'Strip of 10 tablets',
    defaultUnit: 'tablet',
    isFavorite: true,
    isSampleData: true,
  },
  {
    medicineName: 'Amoxicillin',
    genericName: 'Amoxicillin Trihydrate',
    brandName: 'Mox 500 (Sample)',
    strength: '500 mg',
    dosageForm: 'Capsule',
    route: 'Oral',
    packagingInfo: 'Strip of 10 capsules',
    defaultUnit: 'capsule',
    isFavorite: false,
    isSampleData: true,
  },
  {
    medicineName: 'Cetirizine',
    genericName: 'Cetirizine Hydrochloride',
    brandName: 'Cetzine (Sample)',
    strength: '10 mg',
    dosageForm: 'Tablet',
    route: 'Oral',
    packagingInfo: 'Strip of 10 tablets',
    defaultUnit: 'tablet',
    isFavorite: true,
    isSampleData: true,
  },
  {
    medicineName: 'Pantoprazole',
    genericName: 'Pantoprazole Sodium',
    brandName: 'Pan 40 (Sample)',
    strength: '40 mg',
    dosageForm: 'Tablet',
    route: 'Oral',
    packagingInfo: 'Strip of 15 tablets',
    defaultUnit: 'tablet',
    isFavorite: true,
    isSampleData: true,
  },
  {
    medicineName: 'Azithromycin',
    genericName: 'Azithromycin Dihydrate',
    brandName: 'Azithral 500 (Sample)',
    strength: '500 mg',
    dosageForm: 'Tablet',
    route: 'Oral',
    packagingInfo: 'Strip of 5 tablets',
    defaultUnit: 'tablet',
    isFavorite: false,
    isSampleData: true,
  },
  {
    medicineName: 'Paracetamol Suspension',
    genericName: 'Paracetamol Oral Suspension',
    brandName: 'Calpol 250/5 (Sample)',
    strength: '250 mg / 5 ml',
    dosageForm: 'Suspension',
    route: 'Oral',
    packagingInfo: 'Bottle of 60 ml',
    defaultUnit: 'ml',
    isFavorite: false,
    isSampleData: true,
  },
  {
    medicineName: 'Oral Rehydration Salts (ORS)',
    genericName: 'Sodium Chloride + Potassium Chloride + Dextrose',
    brandName: 'Electral (Sample)',
    strength: '21.8 g',
    dosageForm: 'Sachet',
    route: 'Oral',
    packagingInfo: 'Single 21.8 g sachet',
    defaultUnit: 'sachet',
    isFavorite: false,
    isSampleData: true,
  },
  {
    medicineName: 'Moxifloxacin Eye Drops',
    genericName: 'Moxifloxacin Ophthalmic Solution',
    brandName: 'Vigamox (Sample)',
    strength: '0.5% w/v',
    dosageForm: 'Drops',
    route: 'Ophthalmic',
    packagingInfo: 'Dropper bottle 5 ml',
    defaultUnit: 'drop',
    isFavorite: false,
    isSampleData: true,
  },
  {
    medicineName: 'Mupirocin Ointment',
    genericName: 'Mupirocin Topical',
    brandName: 'T-Bact (Sample)',
    strength: '2% w/w',
    dosageForm: 'Ointment',
    route: 'Topical',
    packagingInfo: 'Tube of 5 g',
    defaultUnit: 'application',
    isFavorite: false,
    isSampleData: true,
  },
];

function buildSearchKeywords(input: {
  medicineName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
}): string {
  return [
    input.medicineName,
    input.genericName,
    input.brandName,
    input.strength,
    input.dosageForm,
  ]
    .join(' ')
    .toLowerCase()
    .trim()
    .slice(0, 450);
}

export async function fetchClinicMedicines(clinicId: string): Promise<MedicineRecord[]> {
  const path = `clinics/${clinicId}/medicines`;
  try {
    const snap = await getDocs(
      query(collection(db, 'clinics', clinicId, 'medicines'), orderBy('medicineName', 'asc')),
    );
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<MedicineRecord, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function filterClinicMedicines(
  medicines: MedicineRecord[],
  searchText: string,
  options?: { includeInactive?: boolean; favoritesOnly?: boolean },
): MedicineRecord[] {
  const q = searchText.trim().toLowerCase();
  return medicines
    .filter((m) => (options?.includeInactive ? true : m.status === 'active'))
    .filter((m) => (options?.favoritesOnly ? m.isFavorite : true))
    .filter((m) => {
      if (!q) return true;
      return (
        m.searchKeywords.includes(q) ||
        m.medicineName.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.brandName.toLowerCase().includes(q) ||
        m.strength.toLowerCase().includes(q) ||
        m.dosageForm.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.medicineName.localeCompare(b.medicineName);
    });
}

export async function seedStarterSampleMedicines(params: {
  clinicId: string;
  actorUid: string;
}): Promise<number> {
  const { clinicId, actorUid } = params;
  const path = `clinics/${clinicId}/medicines`;
  try {
    const existing = await getDocs(collection(db, 'clinics', clinicId, 'medicines'));
    const existingNames = new Set(
      existing.docs.map((d) => String(d.data().medicineName || '').toLowerCase().trim()),
    );

    const toCreate = STARTER_SAMPLE_MEDICINES.filter(
      (item) => !existingNames.has(item.medicineName.toLowerCase().trim()),
    );
    if (toCreate.length === 0) return 0;

    const batch = writeBatch(db);
    toCreate.forEach((item) => {
      const ref = doc(collection(db, 'clinics', clinicId, 'medicines'));
      batch.set(ref, {
        clinicId,
        medicineName: item.medicineName.trim().slice(0, 140),
        genericName: item.genericName.trim().slice(0, 140),
        brandName: item.brandName.trim().slice(0, 140),
        strength: item.strength.trim().slice(0, 60),
        dosageForm: item.dosageForm.trim().slice(0, 40),
        route: item.route.trim().slice(0, 40),
        packagingInfo: item.packagingInfo.trim().slice(0, 140),
        defaultUnit: (item.defaultUnit || getDefaultUnitForDosageForm(item.dosageForm)).slice(0, 30),
        isSampleData: true,
        isFavorite: Boolean(item.isFavorite),
        status: 'active',
        searchKeywords: buildSearchKeywords(item),
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return toCreate.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createClinicMedicine(params: {
  clinicId: string;
  actorUid: string;
  input: MedicineFormInput;
}): Promise<string> {
  const { clinicId, actorUid, input } = params;
  const path = `clinics/${clinicId}/medicines`;
  try {
    const ref = doc(collection(db, 'clinics', clinicId, 'medicines'));
    await setDoc(ref, {
      clinicId,
      medicineName: input.medicineName.trim().slice(0, 140),
      genericName: input.genericName.trim().slice(0, 140),
      brandName: input.brandName.trim().slice(0, 140),
      strength: input.strength.trim().slice(0, 60),
      dosageForm: input.dosageForm.trim().slice(0, 40),
      route: input.route.trim().slice(0, 40),
      packagingInfo: input.packagingInfo.trim().slice(0, 140),
      defaultUnit: (input.defaultUnit || getDefaultUnitForDosageForm(input.dosageForm)).slice(0, 30),
      isSampleData: Boolean(input.isSampleData),
      isFavorite: Boolean(input.isFavorite),
      status: 'active',
      searchKeywords: buildSearchKeywords(input),
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateClinicMedicine(params: {
  clinicId: string;
  medicineId: string;
  input: MedicineFormInput;
}): Promise<void> {
  const { clinicId, medicineId, input } = params;
  const path = `clinics/${clinicId}/medicines/${medicineId}`;
  try {
    await updateDoc(doc(db, 'clinics', clinicId, 'medicines', medicineId), {
      medicineName: input.medicineName.trim().slice(0, 140),
      genericName: input.genericName.trim().slice(0, 140),
      brandName: input.brandName.trim().slice(0, 140),
      strength: input.strength.trim().slice(0, 60),
      dosageForm: input.dosageForm.trim().slice(0, 40),
      route: input.route.trim().slice(0, 40),
      packagingInfo: input.packagingInfo.trim().slice(0, 140),
      defaultUnit: (input.defaultUnit || getDefaultUnitForDosageForm(input.dosageForm)).slice(0, 30),
      isSampleData: Boolean(input.isSampleData),
      isFavorite: Boolean(input.isFavorite),
      searchKeywords: buildSearchKeywords(input),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleMedicineFavorite(params: {
  clinicId: string;
  medicineId: string;
  isFavorite: boolean;
}): Promise<void> {
  const path = `clinics/${params.clinicId}/medicines/${params.medicineId}`;
  try {
    await updateDoc(doc(db, 'clinics', params.clinicId, 'medicines', params.medicineId), {
      isFavorite: params.isFavorite,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setMedicineStatus(params: {
  clinicId: string;
  medicineId: string;
  status: MedicineStatus;
}): Promise<void> {
  const path = `clinics/${params.clinicId}/medicines/${params.medicineId}`;
  try {
    await updateDoc(doc(db, 'clinics', params.clinicId, 'medicines', params.medicineId), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
