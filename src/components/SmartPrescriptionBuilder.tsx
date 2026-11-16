import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FilePlus2,
  FileSignature,
  Loader2,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClinicRecord, UserProfileRecord } from '../lib/clinicService';
import type {
  ConsultationRecord,
  PrescriptionRecord,
  PrescriptionTemplateRecord,
} from '../lib/consultationService';
import {
  filterClinicMedicines,
  seedStarterSampleMedicines,
  type MedicineRecord,
} from '../lib/medicineService';
import type { PatientRecord } from '../lib/patientService';
import {
  ADMINISTRATION_ROUTES,
  calculateDeterministicQuantity,
  createEmptyMedicineDraftItem,
  DOSAGE_FORMS,
  evaluatePrescriptionSafety,
  FREQUENCY_PRESET_OPTIONS,
  getDefaultUnitForDosageForm,
  pluralizeUnit,
  syncMedicineCalculatedQuantity,
  TIMING_OPTIONS,
  type FrequencyPreset,
  type PrescriptionMedicineItem,
} from '../lib/prescriptionLogic';
import { PrescriptionDocumentPreview } from './PrescriptionDocumentPreview';

const GENERAL_INSTRUCTION_PRESETS = [
  'Take medicines as prescribed',
  'Follow dietary advice',
  'Return for follow-up',
  'Bring previous reports',
  'Drink plenty of fluids and rest',
];

const DOSE_UNIT_OPTIONS = [
  'tablet',
  'capsule',
  'ml',
  'drop',
  'sachet',
  'puff',
  'vial',
  'application',
  'unit',
];

interface SmartPrescriptionBuilderProps {
  clinic: ClinicRecord;
  doctor: UserProfileRecord | null;
  actorUid: string;
  patient: PatientRecord;
  consultation: Partial<ConsultationRecord>;
  activePrescription: PrescriptionRecord | null;
  clinicMedicines: MedicineRecord[];
  onMedicinesCatalogReload: () => Promise<void>;
  templates: PrescriptionTemplateRecord[];
  medicines: PrescriptionMedicineItem[];
  onChangeMedicines: (next: PrescriptionMedicineItem[]) => void;
  generalInstructions: string[];
  onChangeGeneralInstructions: (next: string[]) => void;
  followUpRecommendation: string;
  onChangeFollowUpRecommendation: (val: string) => void;
  followUpDate: string;
  onChangeFollowUpDate: (val: string) => void;
  doctorAdvice?: string;
  savingDraft: boolean;
  signingPrescription: boolean;
  onSaveDraft: () => Promise<void>;
  onFinalizeAndSign: () => Promise<void>;
  onSaveAsTemplate: (name: string, description: string) => Promise<void>;
  onDownloadPdf: () => Promise<void>;
  onPrint: () => Promise<void>;
  onOpenAmendmentModal: () => void;
}

export function SmartPrescriptionBuilder({
  clinic,
  doctor,
  actorUid,
  patient,
  consultation,
  activePrescription,
  clinicMedicines,
  onMedicinesCatalogReload,
  templates,
  medicines,
  onChangeMedicines,
  generalInstructions,
  onChangeGeneralInstructions,
  followUpRecommendation,
  onChangeFollowUpRecommendation,
  followUpDate,
  onChangeFollowUpDate,
  doctorAdvice = '',
  savingDraft,
  signingPrescription,
  onSaveDraft,
  onFinalizeAndSign,
  onSaveAsTemplate,
  onDownloadPdf,
  onPrint,
  onOpenAmendmentModal,
}: SmartPrescriptionBuilderProps) {
  const isFinalized = activePrescription?.status === 'finalized';

  const [medSearch, setMedSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const [customInstr, setCustomInstr] = useState('');

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    if (!showPreviewModal && !showSignModal && !showSaveTemplateModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSaveTemplateModal && !savingTemplate) {
        setShowSaveTemplateModal(false);
      } else if (showSignModal && !signingPrescription) {
        setShowSignModal(false);
      } else if (showPreviewModal) {
        setShowPreviewModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showPreviewModal,
    showSignModal,
    signingPrescription,
    showSaveTemplateModal,
    savingTemplate,
  ]);

  const filteredCatalog = useMemo(
    () =>
      filterClinicMedicines(clinicMedicines, medSearch, {
        includeInactive: false,
        favoritesOnly,
      }).slice(0, 12),
    [clinicMedicines, medSearch, favoritesOnly],
  );

  const safetyWarnings = useMemo(
    () =>
      evaluatePrescriptionSafety({
        medicines,
        patientAllergies: patient.allergies,
        generalInstructions,
      }),
    [medicines, patient.allergies, generalInstructions],
  );

  const criticalAllergyWarnings = safetyWarnings.filter((w) => w.severity === 'critical');

  const handleSeedSamples = async () => {
    setSeedingSample(true);
    try {
      await seedStarterSampleMedicines({ clinicId: clinic.id, actorUid });
      await onMedicinesCatalogReload();
    } finally {
      setSeedingSample(false);
    }
  };

  const handleAddFromCatalog = (med: MedicineRecord) => {
    if (isFinalized) return;
    const baseItem = createEmptyMedicineDraftItem();
    const defaultUnit = med.defaultUnit || getDefaultUnitForDosageForm(med.dosageForm);
    const isTopical = ['cream', 'ointment', 'gel'].includes(med.dosageForm.toLowerCase());
    const doseAmount = isTopical ? null : defaultUnit === 'ml' ? 5 : 1;
    const populated = syncMedicineCalculatedQuantity({
      ...baseItem,
      id: `rx-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      medicineId: med.id,
      medicineName: med.medicineName,
      genericName: med.genericName,
      brandName: med.brandName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      route: med.route || 'Oral',
      doseAmount,
      doseUnit: defaultUnit,
      frequencyPreset: isTopical ? 'twice_daily' : 'twice_daily',
      frequencyLabel: 'Twice daily (BD)',
      dailyAdministrations: 2,
      durationDays: 5,
      durationText: '5 days',
      timing: isTopical ? 'As directed' : 'After food',
      quantityDisplay: isTopical ? '1 tube' : '',
      quantityNumeric: isTopical ? 1 : null,
      quantityOverridden: isTopical,
    });
    onChangeMedicines([...medicines, populated]);
  };

  const handleAddBlankMedicine = () => {
    if (isFinalized) return;
    onChangeMedicines([...medicines, createEmptyMedicineDraftItem()]);
  };

  const updateItem = (
    idx: number,
    updater: (prev: PrescriptionMedicineItem) => PrescriptionMedicineItem,
  ) => {
    if (isFinalized) return;
    const next = medicines.map((item, i) => {
      if (i !== idx) return item;
      return syncMedicineCalculatedQuantity(updater(item));
    });
    onChangeMedicines(next);
  };

  const removeItem = (idx: number) => {
    if (isFinalized) return;
    onChangeMedicines(medicines.filter((_, i) => i !== idx));
  };

  const moveItem = (idx: number, direction: -1 | 1) => {
    if (isFinalized) return;
    const target = idx + direction;
    if (target < 0 || target >= medicines.length) return;
    const copy = [...medicines];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    onChangeMedicines(copy);
  };

  const handleApplyTemplate = () => {
    if (isFinalized || !selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    const clonedMeds = tpl.medicines.map((m, i) =>
      syncMedicineCalculatedQuantity({
        ...m,
        id: `rx-tpl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      }),
    );
    onChangeMedicines([...medicines, ...clonedMeds]);
    const mergedInstructions = Array.from(
      new Set([...generalInstructions, ...tpl.generalInstructions]),
    );
    onChangeGeneralInstructions(mergedInstructions);
    if (!followUpRecommendation.trim() && tpl.followUpRecommendation) {
      onChangeFollowUpRecommendation(tpl.followUpRecommendation);
    }
    setTemplateNotice(
      `Applied "${tpl.name}" to draft. Review dosages, patient allergies, and quantities before finalizing.`,
    );
  };

  const handleAddInstruction = (text: string) => {
    if (isFinalized) return;
    const clean = text.trim();
    if (!clean) return;
    if (!generalInstructions.includes(clean)) {
      onChangeGeneralInstructions([...generalInstructions, clean]);
    }
  };

  const handleRemoveInstruction = (idx: number) => {
    if (isFinalized) return;
    onChangeGeneralInstructions(generalInstructions.filter((_, i) => i !== idx));
  };

  const handleSaveTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (templateName.trim().length < 2) {
      setTemplateError('Please enter a template name (at least 2 characters).');
      return;
    }
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      await onSaveAsTemplate(templateName.trim(), templateDescription.trim());
      setShowSaveTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (err: unknown) {
      setTemplateError(
        err instanceof Error ? err.message : 'Unable to save prescription template.',
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[#0B192C]">
            Smart Prescription Maker
          </h2>
          <p className="text-xs text-slate-600">
            Structured medicine selection, deterministic quantity calculation, reusable templates,
            and rule-based safety checks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Eye className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
            Preview Prescription
          </button>

          {!isFinalized && medicines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTemplateError(null);
                setShowSaveTemplateModal(true);
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              Save as Template
            </button>
          )}
        </div>
      </div>

      {/* Finalized Lock Notice */}
      {isFinalized && activePrescription && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/85 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs space-y-1">
              <p className="font-display text-sm font-bold text-emerald-950">
                Prescription Finalized &amp; Locked ({activePrescription.prescriptionNumber} · v
                {activePrescription.version})
              </p>
              <p className="text-emerald-800">
                Confirmed by {activePrescription.signedByName || activePrescription.doctorName}
                {activePrescription.signedAt
                  ? ` on ${activePrescription.signedAt.toDate().toLocaleString('en-IN')}`
                  : ''}
                . Finalized prescriptions are immutable.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onPrint()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Print
            </button>
            <button
              type="button"
              onClick={() => void onDownloadPdf()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download A4 PDF
            </button>
            <button
              type="button"
              onClick={onOpenAmendmentModal}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-3.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              Amend (Create v{activePrescription.version + 1})
            </button>
          </div>
        </div>
      )}

      {/* Template Loader & Medicine Catalog Picker (only editable on Draft) */}
      {!isFinalized && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Medicine Database Search */}
          <div className="lg:col-span-8 lucid-glass rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-sky-700" aria-hidden="true" />
                <h3 className="font-display text-sm font-bold text-[#0B192C]">
                  Select from Clinic Medicine Database
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((prev) => !prev)}
                  className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer ${
                    favoritesOnly
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Favorites
                </button>
                <Link
                  to="/app/doctor/medicines"
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  Manage Medicines
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                placeholder="Search by medicine name, generic name, brand, strength, or form..."
                className="flex-1 min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <button
                type="button"
                onClick={handleAddBlankMedicine}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                Custom Medicine Row
              </button>
            </div>

            {clinicMedicines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center space-y-2.5">
                <p className="text-xs text-slate-600">
                  Your clinic medicine database is currently empty. Add medicines in Manage
                  Medicines or load starter sample records for testing.
                </p>
                <button
                  type="button"
                  disabled={seedingSample}
                  onClick={() => void handleSeedSamples()}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {seedingSample ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Load Sample Starter Medicines (10)
                </button>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No active medicines match &ldquo;{medSearch}&rdquo;. Try another keyword or add a
                Custom Medicine Row.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                {filteredCatalog.map((med) => (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => handleAddFromCatalog(med)}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0B192C] truncate flex items-center gap-1">
                        {med.isFavorite && (
                          <Star
                            className="h-3 w-3 text-amber-500 fill-amber-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">
                          {med.medicineName} {med.strength}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {med.dosageForm} · {med.genericName || med.brandName}
                        {med.isSampleData ? ' · Sample' : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 shrink-0">
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Add
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reusable Templates Selector */}
          <div className="lg:col-span-4 lucid-glass-subtle rounded-2xl p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-[#0B192C]">
                  Reusable Templates
                </h3>
                <Link
                  to="/app/doctor/prescription-templates"
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  Manage
                </Link>
              </div>
              <p className="text-xs text-slate-600">
                Templates only pre-fill editable draft fields. You always review and confirm before
                signing.
              </p>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  setTemplateNotice(null);
                }}
                aria-label="Select prescription template"
                className="w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-[#0B192C] focus:border-sky-500 focus:outline-none"
              >
                <option value="">
                  {templates.length === 0
                    ? 'No saved templates yet'
                    : 'Choose a template to apply...'}
                </option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.medicines.length} medicines)
                  </option>
                ))}
              </select>

              {templateNotice && (
                <p className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                  {templateNotice}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!selectedTemplateId}
              onClick={handleApplyTemplate}
              className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              Apply Template to Draft
            </button>
          </div>
        </div>
      )}

      {/* Safety Checks Panel (Deterministic) */}
      {safetyWarnings.length > 0 && (
        <div
          role="region"
          aria-label="Prescription Safety Checks"
          className={`rounded-2xl border p-4 sm:p-5 space-y-2.5 ${
            criticalAllergyWarnings.length > 0
              ? 'border-rose-300 bg-rose-50/90 text-rose-950'
              : 'border-amber-300 bg-amber-50/90 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2 font-display text-sm font-bold">
            <ShieldAlert
              className={`h-4 w-4 shrink-0 ${
                criticalAllergyWarnings.length > 0 ? 'text-rose-700' : 'text-amber-700'
              }`}
              aria-hidden="true"
            />
            <span>
              Rule-Based Safety &amp; Completeness Checks ({safetyWarnings.length})
            </span>
          </div>
          <ul className="space-y-1.5 text-xs">
            {safetyWarnings.map((w) => (
              <li key={w.id} className="flex items-start gap-2">
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                    w.severity === 'critical' ? 'text-rose-700' : 'text-amber-700'
                  }`}
                  aria-hidden="true"
                />
                <span className={w.severity === 'critical' ? 'font-bold text-rose-900' : ''}>
                  {w.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Editable Prescribed Medicines List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#0B192C] tabular-nums">
            Prescribed Medicines ({medicines.length})
          </h3>
        </div>

        {medicines.length === 0 ? (
          <div className="lucid-glass rounded-2xl px-6 py-10 text-center space-y-2">
            <p className="font-display text-sm font-bold text-[#0B192C]">
              No medicines added to this prescription yet
            </p>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Search and add medicines from your clinic medicine database above, apply a reusable
              template, or click &ldquo;Custom Medicine Row&rdquo;.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {medicines.map((med, idx) => {
              const calc = calculateDeterministicQuantity({
                dosageForm: med.dosageForm,
                doseAmount: med.doseAmount,
                doseUnit: med.doseUnit,
                frequencyPreset: med.frequencyPreset,
                dailyAdministrations: med.dailyAdministrations,
                durationDays: med.durationDays,
                isVariableSchedule: med.isVariableSchedule,
                isPrn: med.isPrn,
              });

              return (
                <article
                  key={med.id}
                  className="lucid-glass rounded-2xl p-5 space-y-4 border border-slate-200/80"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 font-mono text-xs font-bold text-sky-800 border border-sky-200 tabular-nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-[#0B192C] truncate">
                          {med.medicineName || 'New Medicine Entry'}{' '}
                          {med.strength ? `(${med.strength})` : ''}
                        </p>
                        {med.genericName && (
                          <p className="text-[11px] text-slate-500 truncate">{med.genericName}</p>
                        )}
                      </div>
                    </div>

                    {!isFinalized && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveItem(idx, -1)}
                          aria-label={`Move medicine ${idx + 1} up`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === medicines.length - 1}
                          onClick={() => moveItem(idx, 1)}
                          aria-label={`Move medicine ${idx + 1} down`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          aria-label={`Remove medicine ${idx + 1}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Row 1: Identity & Form */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Medicine Name *
                      </label>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={med.medicineName}
                        onChange={(e) =>
                          updateItem(idx, (p) => ({ ...p, medicineName: e.target.value }))
                        }
                        placeholder="e.g., Paracetamol"
                        className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Strength
                      </label>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={med.strength}
                        onChange={(e) =>
                          updateItem(idx, (p) => ({ ...p, strength: e.target.value }))
                        }
                        placeholder="e.g., 500 mg"
                        className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] disabled:bg-slate-50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Form
                        </label>
                        <select
                          disabled={isFinalized}
                          value={med.dosageForm}
                          onChange={(e) => {
                            const form = e.target.value;
                            updateItem(idx, (p) => ({
                              ...p,
                              dosageForm: form,
                              doseUnit: getDefaultUnitForDosageForm(form),
                            }));
                          }}
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2 text-xs text-[#0B192C] disabled:bg-slate-50"
                        >
                          {DOSAGE_FORMS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Route
                        </label>
                        <select
                          disabled={isFinalized}
                          value={med.route}
                          onChange={(e) =>
                            updateItem(idx, (p) => ({ ...p, route: e.target.value }))
                          }
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2 text-xs text-[#0B192C] disabled:bg-slate-50"
                        >
                          {ADMINISTRATION_ROUTES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Structured Dosage, Frequency, Timing, Duration */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Dose Qty
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          disabled={isFinalized}
                          value={med.doseAmount ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            updateItem(idx, (p) => ({
                              ...p,
                              doseAmount: val !== null && !Number.isNaN(val) ? val : null,
                            }));
                          }}
                          placeholder="1"
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] tabular-nums disabled:bg-slate-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Unit
                        </label>
                        <select
                          disabled={isFinalized}
                          value={med.doseUnit}
                          onChange={(e) =>
                            updateItem(idx, (p) => ({ ...p, doseUnit: e.target.value }))
                          }
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2 text-xs text-[#0B192C] disabled:bg-slate-50"
                        >
                          {DOSE_UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Frequency
                      </label>
                      <select
                        disabled={isFinalized}
                        value={med.frequencyPreset}
                        onChange={(e) => {
                          const preset = e.target.value as FrequencyPreset;
                          const meta = FREQUENCY_PRESET_OPTIONS.find((o) => o.value === preset);
                          updateItem(idx, (p) => ({
                            ...p,
                            frequencyPreset: preset,
                            frequencyLabel: meta?.label || p.frequencyLabel,
                            dailyAdministrations: meta?.dailyFactor ?? null,
                            isVariableSchedule: preset === 'variable',
                            isPrn: preset === 'prn',
                          }));
                        }}
                        className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] disabled:bg-slate-50"
                      >
                        {FREQUENCY_PRESET_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {med.frequencyPreset === 'prn' ? (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Max Daily Doses (optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={isFinalized}
                          value={med.dailyAdministrations ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            updateItem(idx, (p) => ({
                              ...p,
                              dailyAdministrations:
                                val !== null && !Number.isNaN(val) && val > 0 ? val : null,
                            }));
                          }}
                          placeholder="Leave blank if open PRN"
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] tabular-nums disabled:bg-slate-50"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Food / Timing
                        </label>
                        <select
                          disabled={isFinalized}
                          value={med.timing}
                          onChange={(e) =>
                            updateItem(idx, (p) => ({ ...p, timing: e.target.value }))
                          }
                          className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] disabled:bg-slate-50"
                        >
                          {TIMING_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Duration (Days)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={isFinalized}
                        value={med.durationDays ?? ''}
                        onChange={(e) => {
                          const days = e.target.value === '' ? null : Number(e.target.value);
                          updateItem(idx, (p) => ({
                            ...p,
                            durationDays: days !== null && !Number.isNaN(days) ? days : null,
                            durationText:
                              days !== null && !Number.isNaN(days) && days > 0
                                ? `${days} ${days === 1 ? 'day' : 'days'}`
                                : p.durationText,
                          }));
                        }}
                        placeholder="e.g., 5"
                        className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] tabular-nums disabled:bg-slate-50"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Duration Text (Printed)
                      </label>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={med.durationText}
                        onChange={(e) =>
                          updateItem(idx, (p) => ({ ...p, durationText: e.target.value }))
                        }
                        placeholder="e.g., 5 days"
                        className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Row 3: Deterministic Quantity Calculation + Override + Special Instructions */}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 items-start rounded-xl bg-slate-50/85 border border-slate-200/70 p-3.5">
                    <div className="lg:col-span-5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-900">
                        <Calculator className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                        <span>Deterministic Quantity Calculation</span>
                      </div>
                      <p className="text-[11px] text-slate-600 tabular-nums">{calc.explanation}</p>
                    </div>

                    <div className="lg:col-span-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Dispensing Quantity *
                        </label>
                        {med.quantityOverridden && calc.calculatedQuantity !== null && !isFinalized && (
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(idx, (p) => ({
                                ...p,
                                quantityOverridden: false,
                                quantityNumeric: calc.calculatedQuantity,
                                quantityDisplay:
                                  calc.calculatedQuantity !== null && calc.calculatedUnit
                                    ? `${calc.calculatedQuantity} ${pluralizeUnit(
                                        calc.calculatedUnit,
                                        calc.calculatedQuantity,
                                      )}`
                                    : '',
                              }))
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
                          >
                            <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                            Use Calculated
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={med.quantityDisplay}
                        onChange={(e) => {
                          const txt = e.target.value;
                          const parsedNum = parseFloat(txt);
                          updateItem(idx, (p) => ({
                            ...p,
                            quantityOverridden: true,
                            quantityDisplay: txt,
                            quantityNumeric: Number.isNaN(parsedNum) ? null : parsedNum,
                          }));
                        }}
                        placeholder={calc.requiresManualEntry ? 'Enter qty (e.g., 1 bottle)' : 'Auto'}
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0B192C] tabular-nums disabled:bg-slate-100"
                      />
                    </div>

                    <div className="lg:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Special Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={med.specialInstructions}
                        onChange={(e) =>
                          updateItem(idx, (p) => ({ ...p, specialInstructions: e.target.value }))
                        }
                        placeholder="e.g., Take with full glass of water"
                        className="mt-1 w-full min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-[#0B192C] disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* General Instructions & Follow-up Recommendation */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7 lucid-glass rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#0B192C]">
            General Patient Instructions
          </h3>

          {!isFinalized && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {GENERAL_INSTRUCTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddInstruction(preset)}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50 cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-sky-700" aria-hidden="true" />
                    {preset}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInstr}
                  onChange={(e) => setCustomInstr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddInstruction(customInstr);
                      setCustomInstr('');
                    }
                  }}
                  placeholder="Add custom patient instruction..."
                  className="flex-1 min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C]"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleAddInstruction(customInstr);
                    setCustomInstr('');
                  }}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </>
          )}

          {generalInstructions.length === 0 ? (
            <p className="text-xs text-slate-500">No general instructions added yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {generalInstructions.map((item, i) => (
                <li
                  key={`${item}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-[#0B192C]"
                >
                  <span>{item}</span>
                  {!isFinalized && (
                    <button
                      type="button"
                      onClick={() => handleRemoveInstruction(i)}
                      aria-label="Remove instruction"
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-5 lucid-glass rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#0B192C]">
            Follow-up Recommendation (Optional)
          </h3>
          <p className="text-[11px] text-slate-500">
            Printed on the prescription for patient guidance.
          </p>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">
              Recommendation Note
            </label>
            <input
              type="text"
              disabled={isFinalized}
              value={followUpRecommendation}
              onChange={(e) => onChangeFollowUpRecommendation(e.target.value)}
              placeholder="e.g., Review after 5 days if fever persists"
              className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">
              Suggested Review Date (Optional)
            </label>
            <input
              type="date"
              disabled={isFinalized}
              value={followUpDate}
              onChange={(e) => onChangeFollowUpDate(e.target.value)}
              className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] tabular-nums disabled:bg-slate-50"
            />
          </div>
        </div>
      </div>

      {/* Bottom Prescription Actions */}
      {!isFinalized && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/85 p-4">
          <p className="text-xs text-slate-600">
            Save progress as a draft or review all items to finalize and lock this prescription.
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={savingDraft || signingPrescription}
              onClick={() => void onSaveDraft()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save Draft
            </button>

            <button
              type="button"
              disabled={medicines.length === 0 || savingDraft || signingPrescription}
              onClick={() => {
                setConfirmChecked(false);
                setShowSignModal(true);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
              Review &amp; Sign Prescription
            </button>
          </div>
        </div>
      )}

      {/* A4 Document Preview Modal */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 backdrop-blur-sm p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPreviewModal(false);
          }}
        >
          <div className="w-full max-w-[840px] space-y-4">
            <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg border border-slate-200">
              <p className="font-display text-sm font-bold text-[#0B192C]">
                A4 Prescription Preview ({isFinalized ? 'Finalized' : 'Unsigned Draft'})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {activePrescription && (
                  <>
                    <button
                      type="button"
                      onClick={() => void onPrint()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDownloadPdf()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-3.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download PDF
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <PrescriptionDocumentPreview
              clinic={clinic}
              doctor={doctor}
              patient={patient}
              consultation={consultation}
              prescription={activePrescription}
              draftMedicines={medicines}
              draftGeneralInstructions={generalInstructions}
              draftFollowUpRecommendation={followUpRecommendation}
              draftFollowUpDate={followUpDate}
              draftDoctorAdvice={doctorAdvice}
            />
          </div>
        </div>
      )}

      {/* Review & Sign Confirmation Modal */}
      {showSignModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !signingPrescription) setShowSignModal(false);
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#0B192C]">
                  Review &amp; Finalize Prescription
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Patient: <span className="font-semibold text-[#0B192C]">{patient.fullName}</span>{' '}
                  ({patient.patientId})
                </p>
              </div>
              <button
                type="button"
                disabled={signingPrescription}
                onClick={() => setShowSignModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {patient.allergies.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
                <span className="font-bold">Recorded Patient Allergies: </span>
                <span>{patient.allergies.join(', ')}</span>
              </div>
            )}

            {safetyWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-1.5 text-xs text-amber-950">
                <p className="font-bold">Safety Notices to Acknowledge ({safetyWarnings.length}):</p>
                <ul className="list-disc pl-4 space-y-1">
                  {safetyWarnings.map((w) => (
                    <li key={w.id}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Medicine</th>
                    <th className="py-2.5 px-3">Dosage &amp; Schedule</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {medicines.map((med, idx) => (
                    <tr key={med.id}>
                      <td className="py-2.5 px-3 font-semibold text-[#0B192C]">
                        {idx + 1}. {med.medicineName} {med.strength}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {med.dosageDisplay} · {med.frequencyLabel} · {med.timing}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 tabular-nums">
                        {med.durationText || 'As directed'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#0B192C] tabular-nums">
                        {med.quantityDisplay || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>
                I confirm I have clinically reviewed every medicine, dosage, schedule, dispensing
                quantity, and any patient allergy or safety warnings above. Once finalized, this
                prescription cannot be edited (only amended via a new version).
              </span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={signingPrescription}
                onClick={() => setShowSignModal(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={!confirmChecked || signingPrescription}
                onClick={async () => {
                  await onFinalizeAndSign();
                  setShowSignModal(false);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50 cursor-pointer"
              >
                {signingPrescription ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Confirm &amp; Finalize Prescription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save As Reusable Template Modal */}
      {showSaveTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingTemplate) setShowSaveTemplateModal(false);
          }}
        >
          <form
            onSubmit={handleSaveTemplateSubmit}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-[#0B192C]">
              Save Prescription as Template
            </h3>
            <p className="text-xs text-slate-600">
              Saves the current {medicines.length} medicine(s), general instructions, and follow-up
              note as a reusable clinic template.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Template Name *</label>
              <input
                type="text"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Acute Viral Fever — Adult"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Description (Optional)
              </label>
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief clinical note for when to load this template"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
              />
            </div>

            {templateError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                {templateError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={savingTemplate}
                onClick={() => setShowSaveTemplateModal(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTemplate || templateName.trim().length < 2}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {savingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
