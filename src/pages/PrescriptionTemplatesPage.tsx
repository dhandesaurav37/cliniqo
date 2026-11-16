import {
  BookmarkPlus,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  deletePrescriptionTemplate,
  fetchPrescriptionTemplates,
  savePrescriptionTemplate,
  type PrescriptionTemplateRecord,
} from '../lib/consultationService';
import {
  fetchClinicMedicines,
  filterClinicMedicines,
  type MedicineRecord,
} from '../lib/medicineService';
import {
  ADMINISTRATION_ROUTES,
  createEmptyMedicineDraftItem,
  DOSAGE_FORMS,
  FREQUENCY_PRESET_OPTIONS,
  getDefaultUnitForDosageForm,
  syncMedicineCalculatedQuantity,
  TIMING_OPTIONS,
  type FrequencyPreset,
  type PrescriptionMedicineItem,
} from '../lib/prescriptionLogic';

export function PrescriptionTemplatesPage() {
  const { user, clinic, profile } = useAuth();
  const [templates, setTemplates] = useState<PrescriptionTemplateRecord[]>([]);
  const [clinicMedicines, setClinicMedicines] = useState<MedicineRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<PrescriptionTemplateRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [medicines, setMedicines] = useState<PrescriptionMedicineItem[]>([]);
  const [instrInput, setInstrInput] = useState('');
  const [generalInstructions, setGeneralInstructions] = useState<string[]>([]);
  const [followUpRecommendation, setFollowUpRecommendation] = useState('');
  const [medSearch, setMedSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PrescriptionTemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actorName = profile?.fullName || user?.displayName || 'Doctor';

  const loadData = useCallback(async () => {
    if (!clinic) return;
    setLoading(true);
    setError(null);
    try {
      const [tpls, meds] = await Promise.all([
        fetchPrescriptionTemplates(clinic.id),
        fetchClinicMedicines(clinic.id),
      ]);
      setTemplates(tpls);
      setClinicMedicines(meds);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load templates.'));
    } finally {
      setLoading(false);
    }
  }, [clinic]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!modalOpen && !deleteTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget && !deleting) {
        setDeleteTarget(null);
      } else if (modalOpen && !saving) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, saving, deleteTarget, deleting]);

  const catalogMatches = useMemo(
    () =>
      filterClinicMedicines(clinicMedicines, medSearch, {
        includeInactive: false,
      }).slice(0, 8),
    [clinicMedicines, medSearch],
  );

  const openCreateModal = () => {
    setEditingTpl(null);
    setName('');
    setDescription('');
    setMedicines([]);
    setGeneralInstructions([]);
    setFollowUpRecommendation('');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (tpl: PrescriptionTemplateRecord) => {
    setEditingTpl(tpl);
    setName(tpl.name);
    setDescription(tpl.description || '');
    setMedicines(tpl.medicines || []);
    setGeneralInstructions(tpl.generalInstructions || []);
    setFollowUpRecommendation(tpl.followUpRecommendation || '');
    setModalError(null);
    setModalOpen(true);
  };

  const addCatalogMedicine = (med: MedicineRecord) => {
    const unit = med.defaultUnit || getDefaultUnitForDosageForm(med.dosageForm);
    const next = syncMedicineCalculatedQuantity({
      ...createEmptyMedicineDraftItem(),
      id: `tpl-med-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      medicineId: med.id,
      medicineName: med.medicineName,
      genericName: med.genericName,
      brandName: med.brandName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      route: med.route || 'Oral',
      doseAmount: unit === 'ml' ? 5 : 1,
      doseUnit: unit,
      frequencyPreset: 'twice_daily',
      frequencyLabel: 'Twice daily (BD)',
      dailyAdministrations: 2,
      durationDays: 5,
      durationText: '5 days',
      timing: 'After food',
    });
    setMedicines((prev) => [...prev, next]);
  };

  const updateTemplateMed = (
    idx: number,
    updater: (prev: PrescriptionMedicineItem) => PrescriptionMedicineItem,
  ) => {
    setMedicines((prev) =>
      prev.map((m, i) => (i === idx ? syncMedicineCalculatedQuantity(updater(m)) : m)),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !user) return;
    if (name.trim().length < 2) {
      setModalError('Please enter a template name (at least 2 characters).');
      return;
    }
    const invalidMedIdx = medicines.findIndex((m) => m.medicineName.trim().length < 2);
    if (invalidMedIdx !== -1) {
      setModalError(`Medicine row #${invalidMedIdx + 1} requires a valid medicine name.`);
      return;
    }
    setSaving(true);
    setModalError(null);
    setError(null);
    setFeedback(null);
    try {
      await savePrescriptionTemplate({
        clinicId: clinic.id,
        templateId: editingTpl?.id || null,
        name: name.trim(),
        description: description.trim(),
        medicines,
        generalInstructions,
        followUpRecommendation,
        doctorUid: user.uid,
        doctorName: actorName,
      });
      setModalOpen(false);
      setFeedback(
        editingTpl ? `Updated template "${name.trim()}".` : `Created template "${name.trim()}".`,
      );
      await loadData();
    } catch (err: unknown) {
      setModalError(getUserFriendlyErrorMessage(err, 'Unable to save template.'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!clinic || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePrescriptionTemplate(clinic.id, deleteTarget.id);
      setFeedback(`Deleted template "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to delete template.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShellLayout breadcrumb="Rx Templates">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Reusable Prescription Templates
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Create clinic-wide structured prescription sets that pre-fill draft prescriptions.
              Doctors always review and confirm before signing.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer whitespace-nowrap"
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
            New Template
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading prescription templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="lucid-glass rounded-3xl px-6 py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              No prescription templates created yet
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              Save your frequently used medicine combinations here or directly from inside any
              patient consultation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {templates.map((tpl) => (
              <article
                key={tpl.id}
                className="lucid-glass rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-bold text-[#0B192C]">
                        {tpl.name}
                      </h2>
                      {tpl.description && (
                        <p className="text-xs text-slate-600 mt-0.5">{tpl.description}</p>
                      )}
                    </div>
                    <span className="rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-xs font-semibold text-sky-800 tabular-nums shrink-0">
                      {tpl.medicines.length} medicines
                    </span>
                  </div>

                  {tpl.medicines.length > 0 && (
                    <ul className="space-y-1 text-xs text-slate-700 border-t border-slate-200/70 pt-2.5">
                      {tpl.medicines.map((m, idx) => (
                        <li key={`${m.id}-${idx}`} className="truncate">
                          <span className="font-semibold text-[#0B192C]">
                            {idx + 1}. {m.medicineName} {m.strength}
                          </span>{' '}
                          · {m.dosageDisplay} · {m.frequencyLabel} ({m.durationText || 'As directed'})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 pt-3">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(tpl)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(tpl)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#0B192C] px-3 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Template Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#0B192C]">
                {editingTpl ? 'Edit Prescription Template' : 'Create Prescription Template'}
              </h2>
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Acute Gastroenteritis — Adult"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional usage note"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>
            </div>

            {/* Quick-add from clinic medicines */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#0B192C]">Add Medicines to Template</p>
                <button
                  type="button"
                  onClick={() => setMedicines((p) => [...p, createEmptyMedicineDraftItem()])}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0B192C] cursor-pointer"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  Custom Row
                </button>
              </div>
              <input
                type="search"
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                placeholder="Search clinic medicine database..."
                className="w-full min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C]"
              />
              {catalogMatches.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {catalogMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => addCatalogMedicine(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B192C] hover:border-sky-300 hover:bg-sky-50 cursor-pointer"
                    >
                      <Plus className="h-3 w-3 text-sky-700" aria-hidden="true" />
                      {m.medicineName} {m.strength}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Template Medicines Editor */}
            <div className="space-y-3">
              {medicines.map((m, idx) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 p-3.5 space-y-2.5 bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0B192C]">
                      #{idx + 1} {m.medicineName || 'Custom Medicine'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMedicines((p) => p.filter((_, i) => i !== idx))}
                      className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <input
                      type="text"
                      value={m.medicineName}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({ ...p, medicineName: e.target.value }))
                      }
                      placeholder="Name"
                      className="sm:col-span-2 min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs"
                    />
                    <input
                      type="text"
                      value={m.strength}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({ ...p, strength: e.target.value }))
                      }
                      placeholder="Strength"
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs"
                    />
                    <select
                      value={m.dosageForm}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({
                          ...p,
                          dosageForm: e.target.value,
                          doseUnit: getDefaultUnitForDosageForm(e.target.value),
                        }))
                      }
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs"
                    >
                      {DOSAGE_FORMS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.route}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({ ...p, route: e.target.value }))
                      }
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs"
                    >
                      {ADMINISTRATION_ROUTES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={m.doseAmount ?? ''}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({
                          ...p,
                          doseAmount: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="Dose"
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select
                      value={m.frequencyPreset}
                      onChange={(e) => {
                        const preset = e.target.value as FrequencyPreset;
                        const meta = FREQUENCY_PRESET_OPTIONS.find((o) => o.value === preset);
                        updateTemplateMed(idx, (p) => ({
                          ...p,
                          frequencyPreset: preset,
                          frequencyLabel: meta?.label || p.frequencyLabel,
                          dailyAdministrations: meta?.dailyFactor ?? null,
                          isVariableSchedule: preset === 'variable',
                          isPrn: preset === 'prn',
                        }));
                      }}
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs"
                    >
                      {FREQUENCY_PRESET_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={m.timing}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({ ...p, timing: e.target.value }))
                      }
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs"
                    >
                      {TIMING_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={m.durationDays ?? ''}
                      onChange={(e) => {
                        const days = e.target.value ? Number(e.target.value) : null;
                        updateTemplateMed(idx, (p) => ({
                          ...p,
                          durationDays: days,
                          durationText: days ? `${days} ${days === 1 ? 'day' : 'days'}` : p.durationText,
                        }));
                      }}
                      placeholder="Days"
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs tabular-nums"
                    />
                    <input
                      type="text"
                      value={m.quantityDisplay}
                      onChange={(e) =>
                        updateTemplateMed(idx, (p) => ({
                          ...p,
                          quantityOverridden: true,
                          quantityDisplay: e.target.value,
                        }))
                      }
                      placeholder="Qty (e.g., 10 tablets)"
                      className="min-h-[34px] rounded-lg border border-slate-200 px-2.5 text-xs tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Instructions & Follow-up */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  General Instructions
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={instrInput}
                    onChange={(e) => setInstrInput(e.target.value)}
                    placeholder="Add instruction"
                    className="flex-1 min-h-[36px] rounded-xl border border-slate-200 px-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!instrInput.trim()) return;
                      setGeneralInstructions((p) => [...p, instrInput.trim()]);
                      setInstrInput('');
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 px-3 text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {generalInstructions.map((g, i) => (
                  <div
                    key={`${g}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <span>{g}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGeneralInstructions((p) => p.filter((_, idx) => idx !== i))
                      }
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Default Follow-up Note
                </label>
                <input
                  type="text"
                  value={followUpRecommendation}
                  onChange={(e) => setFollowUpRecommendation(e.target.value)}
                  placeholder="e.g., Follow up after 5 days"
                  className="mt-2 w-full min-h-[38px] rounded-xl border border-slate-200 px-3 text-xs"
                />
              </div>
            </div>

            {modalError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                {modalError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h2>
            <p className="text-xs text-slate-600">
              Existing patient prescriptions created using this template are not affected.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white cursor-pointer"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Delete Template
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShellLayout>
  );
}
