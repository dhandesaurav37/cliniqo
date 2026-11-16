import type { ClinicOnboardingInput, DoctorOnboardingInput } from './clinicService';

export interface OnboardingDraft {
  doctor: DoctorOnboardingInput;
  clinic: ClinicOnboardingInput;
}

export const DEFAULT_DOCTOR_DRAFT: DoctorOnboardingInput = {
  fullName: '',
  photoURL: '',
  qualification: '',
  specialization: '',
  registrationNumber: '',
  experience: 0,
  consultationTimings: '09:30 AM – 01:30 PM, 05:00 PM – 08:30 PM',
};

export const DEFAULT_CLINIC_DRAFT: ClinicOnboardingInput = {
  name: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  logoUrl: '',
  consultationFee: 500,
  openingTime: '09:00',
  closingTime: '20:00',
  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  appointmentDuration: 15,
};

function getStorageKey(uid: string): string {
  return `cliniqo_onboarding_v1_${uid}`;
}

export function loadOnboardingDraft(uid: string): OnboardingDraft {
  try {
    const raw = localStorage.getItem(getStorageKey(uid));
    if (!raw) {
      return {
        doctor: { ...DEFAULT_DOCTOR_DRAFT },
        clinic: { ...DEFAULT_CLINIC_DRAFT },
      };
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      doctor: { ...DEFAULT_DOCTOR_DRAFT, ...(parsed.doctor || {}) },
      clinic: { ...DEFAULT_CLINIC_DRAFT, ...(parsed.clinic || {}) },
    };
  } catch {
    return {
      doctor: { ...DEFAULT_DOCTOR_DRAFT },
      clinic: { ...DEFAULT_CLINIC_DRAFT },
    };
  }
}

export function saveOnboardingDraft(uid: string, draft: OnboardingDraft): void {
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(draft));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function clearOnboardingDraft(uid: string): void {
  try {
    localStorage.removeItem(getStorageKey(uid));
  } catch {
    // Ignore storage removal errors
  }
}
