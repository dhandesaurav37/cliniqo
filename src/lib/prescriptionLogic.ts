export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Drops',
  'Cream',
  'Ointment',
  'Injection',
  'Sachet',
  'Inhaler',
  'Gel',
  'Powder',
  'Other',
] as const;

export const ADMINISTRATION_ROUTES = [
  'Oral',
  'Topical',
  'Ophthalmic',
  'Otic',
  'Nasal',
  'Sublingual',
  'Inhalation',
  'IV',
  'IM',
  'SC',
  'Other',
] as const;

export type FrequencyPreset =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'as_directed'
  | 'prn'
  | 'variable';

export const FREQUENCY_PRESET_OPTIONS: Array<{
  value: FrequencyPreset;
  label: string;
  dailyFactor: number | null;
}> = [
  { value: 'once_daily', label: 'Once daily (OD)', dailyFactor: 1 },
  { value: 'twice_daily', label: 'Twice daily (BD)', dailyFactor: 2 },
  { value: 'three_times_daily', label: 'Three times daily (TDS)', dailyFactor: 3 },
  { value: 'four_times_daily', label: 'Four times daily (QID)', dailyFactor: 4 },
  { value: 'as_directed', label: 'As directed', dailyFactor: null },
  { value: 'prn', label: 'PRN / As needed', dailyFactor: null },
  { value: 'variable', label: 'Variable schedule (manual qty)', dailyFactor: null },
];

export const TIMING_OPTIONS = [
  'After food',
  'Before food',
  'With food',
  'At bedtime',
  'As directed',
] as const;

export type TimingOption = (typeof TIMING_OPTIONS)[number];

export interface PrescriptionMedicineItem {
  id: string;
  medicineId: string | null;
  medicineName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  route: string;
  doseAmount: number | null;
  doseUnit: string;
  dosageDisplay: string;
  frequencyPreset: FrequencyPreset;
  frequencyLabel: string;
  dailyAdministrations: number | null;
  durationDays: number | null;
  durationText: string;
  timing: string;
  calculatedQuantity: number | null;
  calculatedUnit: string | null;
  quantityNumeric: number | null;
  quantityDisplay: string;
  quantityOverridden: boolean;
  isVariableSchedule: boolean;
  isPrn: boolean;
  specialInstructions: string;
}

export interface QuantityCalculationResult {
  calculatedQuantity: number | null;
  calculatedUnit: string | null;
  explanation: string;
  requiresManualEntry: boolean;
}

export function getDefaultUnitForDosageForm(dosageForm: string): string {
  const f = dosageForm.trim().toLowerCase();
  if (f === 'tablet') return 'tablet';
  if (f === 'capsule') return 'capsule';
  if (f === 'syrup' || f === 'suspension') return 'ml';
  if (f === 'drops') return 'drop';
  if (f === 'sachet' || f === 'powder') return 'sachet';
  if (f === 'injection') return 'vial';
  if (f === 'inhaler') return 'puff';
  if (f === 'cream' || f === 'ointment' || f === 'gel') return 'application';
  return 'unit';
}

export function pluralizeUnit(unit: string, count: number): string {
  const clean = unit.trim().toLowerCase() || 'unit';
  if (clean === 'ml' || clean === 'mg' || clean === 'mcg') return clean;
  if (count === 1) return clean;
  if (clean.endsWith('s')) return clean;
  return `${clean}s`;
}

export function isLiquidForm(dosageForm: string): boolean {
  const f = dosageForm.trim().toLowerCase();
  return f === 'syrup' || f === 'suspension' || f === 'drops';
}

export function isTopicalForm(dosageForm: string): boolean {
  const f = dosageForm.trim().toLowerCase();
  return f === 'cream' || f === 'ointment' || f === 'gel';
}

export function calculateDeterministicQuantity(params: {
  dosageForm: string;
  doseAmount: number | null;
  doseUnit: string;
  frequencyPreset: FrequencyPreset;
  dailyAdministrations: number | null;
  durationDays: number | null;
  isVariableSchedule?: boolean;
  isPrn?: boolean;
}): QuantityCalculationResult {
  const {
    dosageForm,
    doseAmount,
    doseUnit,
    frequencyPreset,
    dailyAdministrations,
    durationDays,
    isVariableSchedule,
    isPrn,
  } = params;

  if (isVariableSchedule || frequencyPreset === 'variable') {
    return {
      calculatedQuantity: null,
      calculatedUnit: null,
      explanation: 'Variable schedule selected — enter dispensing quantity manually.',
      requiresManualEntry: true,
    };
  }

  if (frequencyPreset === 'as_directed') {
    return {
      calculatedQuantity: null,
      calculatedUnit: null,
      explanation: 'As directed schedule — enter dispensing quantity manually.',
      requiresManualEntry: true,
    };
  }

  if (isPrn || frequencyPreset === 'prn') {
    if (!dailyAdministrations || dailyAdministrations <= 0) {
      return {
        calculatedQuantity: null,
        calculatedUnit: null,
        explanation:
          'PRN / As needed — quantity is not calculated unless maximum daily frequency is specified.',
        requiresManualEntry: true,
      };
    }
  }

  if (isTopicalForm(dosageForm)) {
    return {
      calculatedQuantity: null,
      calculatedUnit: 'tube',
      explanation: `${dosageForm} is a topical preparation — confirm tube/pack count manually.`,
      requiresManualEntry: true,
    };
  }

  const presetMeta = FREQUENCY_PRESET_OPTIONS.find((opt) => opt.value === frequencyPreset);
  const effectiveDaily =
    dailyAdministrations && dailyAdministrations > 0
      ? dailyAdministrations
      : (presetMeta?.dailyFactor ?? null);

  if (!doseAmount || doseAmount <= 0 || !effectiveDaily || effectiveDaily <= 0 || !durationDays || durationDays <= 0) {
    return {
      calculatedQuantity: null,
      calculatedUnit: null,
      explanation: 'Enter dose amount, daily frequency, and duration days to calculate quantity.',
      requiresManualEntry: true,
    };
  }

  const total = Math.round(doseAmount * effectiveDaily * durationDays * 100) / 100;

  if (isLiquidForm(dosageForm)) {
    const unit = doseUnit.trim() || 'ml';
    return {
      calculatedQuantity: total,
      calculatedUnit: unit,
      explanation: `${doseAmount} ${unit} × ${effectiveDaily}/day × ${durationDays} days = ${total} ${pluralizeUnit(unit, total)} total volume`,
      requiresManualEntry: false,
    };
  }

  const unit = doseUnit.trim() || getDefaultUnitForDosageForm(dosageForm);
  return {
    calculatedQuantity: total,
    calculatedUnit: unit,
    explanation: `${doseAmount} × ${effectiveDaily} × ${durationDays} = ${total} ${pluralizeUnit(unit, total)}`,
    requiresManualEntry: false,
  };
}

export function buildDosageDisplay(doseAmount: number | null, doseUnit: string): string {
  if (!doseAmount || doseAmount <= 0) return doseUnit.trim() || 'As directed';
  const unit = doseUnit.trim() || 'unit';
  return `${doseAmount} ${pluralizeUnit(unit, doseAmount)}`;
}

export function syncMedicineCalculatedQuantity(item: PrescriptionMedicineItem): PrescriptionMedicineItem {
  const calc = calculateDeterministicQuantity({
    dosageForm: item.dosageForm,
    doseAmount: item.doseAmount,
    doseUnit: item.doseUnit,
    frequencyPreset: item.frequencyPreset,
    dailyAdministrations: item.dailyAdministrations,
    durationDays: item.durationDays,
    isVariableSchedule: item.isVariableSchedule,
    isPrn: item.isPrn,
  });

  const dosageDisplay = buildDosageDisplay(item.doseAmount, item.doseUnit);

  if (item.quantityOverridden) {
    return {
      ...item,
      dosageDisplay,
      calculatedQuantity: calc.calculatedQuantity,
      calculatedUnit: calc.calculatedUnit,
    };
  }

  if (calc.calculatedQuantity !== null && calc.calculatedUnit) {
    return {
      ...item,
      dosageDisplay,
      calculatedQuantity: calc.calculatedQuantity,
      calculatedUnit: calc.calculatedUnit,
      quantityNumeric: calc.calculatedQuantity,
      quantityDisplay: `${calc.calculatedQuantity} ${pluralizeUnit(calc.calculatedUnit, calc.calculatedQuantity)}`,
    };
  }

  return {
    ...item,
    dosageDisplay,
    calculatedQuantity: null,
    calculatedUnit: calc.calculatedUnit,
  };
}

export interface SafetyWarning {
  id: string;
  severity: 'critical' | 'warning';
  category: 'allergy' | 'duplicate' | 'missing_field' | 'instructions';
  message: string;
  medicineIndex?: number;
}

export function evaluatePrescriptionSafety(params: {
  medicines: PrescriptionMedicineItem[];
  patientAllergies: string[];
  generalInstructions: string[];
}): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  const { medicines, patientAllergies, generalInstructions } = params;

  const cleanAllergies = patientAllergies
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length >= 2);

  const seenFingerprints = new Map<string, number>();

  medicines.forEach((med, index) => {
    const label = `${med.medicineName}${med.strength ? ` (${med.strength})` : ''}`;

    // 1. Allergy matching (direct token/substring match against medicine, generic, brand)
    if (cleanAllergies.length > 0) {
      const hay = `${med.medicineName} ${med.genericName} ${med.brandName}`.toLowerCase();
      cleanAllergies.forEach((allergy) => {
        const allergyTokens = allergy.split(/[\s,/()-]+/).filter((t) => t.length >= 3);
        const matched =
          hay.includes(allergy) || allergyTokens.some((token) => hay.includes(token));
        if (matched) {
          warnings.push({
            id: `allergy-${index}-${allergy}`,
            severity: 'critical',
            category: 'allergy',
            medicineIndex: index,
            message: `Allergy Alert: "${label}" matches patient's recorded allergy ("${allergy}").`,
          });
        }
      });
    }

    // 2. Duplicate medicine entries
    const key = `${med.medicineName.trim().toLowerCase()}|${med.strength.trim().toLowerCase()}|${med.dosageForm.trim().toLowerCase()}`;
    if (med.medicineName.trim()) {
      const firstIndex = seenFingerprints.get(key);
      if (firstIndex !== undefined) {
        warnings.push({
          id: `dup-${index}`,
          severity: 'warning',
          category: 'duplicate',
          medicineIndex: index,
          message: `Duplicate medicine entry: "${label}" appears in item #${firstIndex + 1} and #${index + 1}.`,
        });
      } else {
        seenFingerprints.set(key, index);
      }
    }

    // 3. Missing strength
    if (!med.strength.trim()) {
      warnings.push({
        id: `strength-${index}`,
        severity: 'warning',
        category: 'missing_field',
        medicineIndex: index,
        message: `Missing strength for "${med.medicineName || `Medicine #${index + 1}`}".`,
      });
    }

    // 4. Missing route
    if (!med.route.trim()) {
      warnings.push({
        id: `route-${index}`,
        severity: 'warning',
        category: 'missing_field',
        medicineIndex: index,
        message: `Missing route of administration for "${label}".`,
      });
    }

    // 5. Missing frequency
    if (!med.frequencyLabel.trim()) {
      warnings.push({
        id: `freq-${index}`,
        severity: 'warning',
        category: 'missing_field',
        medicineIndex: index,
        message: `Missing dosing frequency for "${label}".`,
      });
    }

    // 6. Missing duration where required (non-PRN and non-as-directed)
    const durationOptional = med.isPrn || med.frequencyPreset === 'prn' || med.frequencyPreset === 'as_directed';
    if (!durationOptional && (!med.durationDays || med.durationDays <= 0) && !med.durationText.trim()) {
      warnings.push({
        id: `duration-${index}`,
        severity: 'warning',
        category: 'missing_field',
        medicineIndex: index,
        message: `Missing duration for "${label}".`,
      });
    }

    // 7. Missing dispensing quantity
    if (!med.quantityDisplay.trim()) {
      warnings.push({
        id: `qty-${index}`,
        severity: 'warning',
        category: 'instructions',
        medicineIndex: index,
        message: `Dispensing quantity is blank for "${label}".`,
      });
    }
  });

  if (medicines.length > 0 && generalInstructions.length === 0) {
    const anySpecial = medicines.some((m) => m.specialInstructions.trim().length > 0);
    if (!anySpecial) {
      warnings.push({
        id: 'incomplete-instructions',
        severity: 'warning',
        category: 'instructions',
        message: 'Incomplete instructions: add at least one general or medicine-specific instruction.',
      });
    }
  }

  return warnings;
}

export function createEmptyMedicineDraftItem(): PrescriptionMedicineItem {
  return {
    id: `rx-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    medicineId: null,
    medicineName: '',
    genericName: '',
    brandName: '',
    strength: '',
    dosageForm: 'Tablet',
    route: 'Oral',
    doseAmount: null,
    doseUnit: 'tablet',
    dosageDisplay: 'As directed',
    frequencyPreset: 'twice_daily',
    frequencyLabel: 'Twice daily (BD)',
    dailyAdministrations: 2,
    durationDays: null,
    durationText: '',
    timing: 'After food',
    calculatedQuantity: null,
    calculatedUnit: 'tablet',
    quantityNumeric: null,
    quantityDisplay: '',
    quantityOverridden: false,
    isVariableSchedule: false,
    isPrn: false,
    specialInstructions: '',
  };
}
