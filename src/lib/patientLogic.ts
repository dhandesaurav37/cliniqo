export type PatientGender = 'male' | 'female' | 'other';
export type PatientStatus = 'active' | 'archived';

export interface EmergencyContact {
  name: string;
  mobile: string;
  relation?: string;
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
