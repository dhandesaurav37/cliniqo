import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  Pencil,
  Pill,
  Plus,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  createClinicMedicine,
  fetchClinicMedicines,
  filterClinicMedicines,
  seedStarterSampleMedicines,
  setMedicineStatus,
  toggleMedicineFavorite,
  updateClinicMedicine,
  type MedicineFormInput,
  type MedicineRecord,
} from '../lib/medicineService';
import {
  ADMINISTRATION_ROUTES,
  DOSAGE_FORMS,
  getDefaultUnitForDosageForm,
} from '../lib/prescriptionLogic';

type MedFilter = 'active' | 'favorites' | 'inactive' | 'all';

const EMPTY_FORM: MedicineFormInput = {
  medicineName: '',
  genericName: '',
  brandName: '',
  strength: '',
  dosageForm: 'Tablet',
  route: 'Oral',
  packagingInfo: '',
  defaultUnit: 'tablet',
  isFavorite: false,
  isSampleData: false,
};

export function MedicinesManagementPage() {
  const { user, clinic } = useAuth();
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MedFilter>('active');
  const [seeding, setSeeding] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineRecord | null>(null);
  const [form, setForm] = useState<MedicineFormInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMedicines = useCallback(async () => {
    if (!clinic) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchClinicMedicines(clinic.id);
      setMedicines(list);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load medicines.'));
    } finally {
      setLoading(false);
    }
  }, [clinic]);

  useEffect(() => {
    void loadMedicines();
  }, [loadMedicines]);

  const filtered = useMemo(() => {
    const base = filterClinicMedicines(medicines, search, {
      includeInactive: filter === 'inactive' || filter === 'all',
      favoritesOnly: filter === 'favorites',
    });
    if (filter === 'inactive') {
      return base.filter((m) => m.status === 'inactive');
    }
    if (filter === 'active') {
      return base.filter((m) => m.status === 'active');
    }
    return base;
  }, [medicines, search, filter]);

  const openCreateModal = () => {
    setEditingMed(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (med: MedicineRecord) => {
    setEditingMed(med);
    setForm({
      medicineName: med.medicineName,
      genericName: med.genericName,
      brandName: med.brandName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      route: med.route,
      packagingInfo: med.packagingInfo,
      defaultUnit: med.defaultUnit,
      isFavorite: med.isFavorite,
      isSampleData: med.isSampleData,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !user) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      if (editingMed) {
        await updateClinicMedicine({
          clinicId: clinic.id,
          medicineId: editingMed.id,
          input: form,
        });
        setFeedback(`Updated "${form.medicineName}".`);
      } else {
        await createClinicMedicine({
          clinicId: clinic.id,
          actorUid: user.uid,
          input: form,
        });
        setFeedback(`Added "${form.medicineName}" to clinic medicine catalog.`);
      }
      setModalOpen(false);
      await loadMedicines();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save medicine.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSeedSamples = async () => {
    if (!clinic || !user) return;
    setSeeding(true);
    setError(null);
    setFeedback(null);
    try {
      const added = await seedStarterSampleMedicines({
        clinicId: clinic.id,
        actorUid: user.uid,
      });
      await loadMedicines();
      setFeedback(
        added > 0
          ? `Added ${added} sample starter medicines (tagged as sample data for testing).`
          : 'All sample starter medicines are already present in your catalog.',
      );
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load sample medicines.'));
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleFavorite = async (med: MedicineRecord) => {
    if (!clinic) return;
    try {
      await toggleMedicineFavorite({
        clinicId: clinic.id,
        medicineId: med.id,
        isFavorite: !med.isFavorite,
      });
      await loadMedicines();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update favorite status.'));
    }
  };

  const handleToggleStatus = async (med: MedicineRecord) => {
    if (!clinic) return;
    const nextStatus = med.status === 'active' ? 'inactive' : 'active';
    try {
      await setMedicineStatus({
        clinicId: clinic.id,
        medicineId: med.id,
        status: nextStatus,
      });
      setFeedback(
        nextStatus === 'inactive'
          ? `Marked "${med.medicineName}" inactive.`
          : `Reactivated "${med.medicineName}".`,
      );
      await loadMedicines();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update medicine status.'));
    }
  };

  return (
    <AppShellLayout breadcrumb="Medicines">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Clinic Medicine Database
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage predefined clinic medicines, strengths, forms, and favorites used in the Smart
              Prescription Maker.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeedSamples()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {seeding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              )}
              Load Sample Starter Set
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Medicine
            </button>
          </div>
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

        {/* Search & Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, generic, brand, strength..."
              className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-[#0B192C]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1 w-fit">
            {(
              [
                { id: 'active', label: 'Active' },
                { id: 'favorites', label: 'Favorites' },
                { id: 'inactive', label: 'Inactive' },
                { id: 'all', label: 'All' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-[#0B192C] shadow-sm'
                    : 'text-slate-600 hover:text-[#0B192C]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Medicines List */}
        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading clinic medicine catalog...
          </div>
        ) : filtered.length === 0 ? (
          <div className="lucid-glass rounded-3xl px-6 py-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200">
              <Pill className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              {medicines.length === 0
                ? 'No medicines added to your clinic catalog yet'
                : 'No medicines match the current search or filter'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              Add your clinic&rsquo;s commonly prescribed medicines or click &ldquo;Load Sample
              Starter Set&rdquo; to populate 10 tagged sample records.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((med) => (
              <article
                key={med.id}
                className="lucid-glass rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-bold text-[#0B192C]">
                        {med.medicineName}
                      </h2>
                      {med.strength && (
                        <span className="rounded-lg bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-semibold text-sky-800">
                          {med.strength}
                        </span>
                      )}
                      {med.isSampleData && (
                        <span className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Sample Starter Data
                        </span>
                      )}
                      {med.status === 'inactive' && (
                        <span className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Inactive
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      {[med.dosageForm, med.route, med.genericName, med.brandName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {med.packagingInfo && (
                      <p className="text-[11px] text-slate-500">Packaging: {med.packagingInfo}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleFavorite(med)}
                    aria-label={med.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        med.isFavorite
                          ? 'text-amber-500 fill-amber-400'
                          : 'text-slate-400'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 pt-3">
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(med)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {med.status === 'active' ? (
                      <>
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        Mark Inactive
                      </>
                    ) : (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                        Reactivate
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(med)}
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

      {/* Add / Edit Medicine Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#0B192C]">
                {editingMed ? 'Edit Clinic Medicine' : 'Add Medicine to Clinic Catalog'}
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
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Medicine Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.medicineName}
                  onChange={(e) => setForm((p) => ({ ...p, medicineName: e.target.value }))}
                  placeholder="e.g., Amoxicillin + Clavulanic Acid"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Generic Name</label>
                <input
                  type="text"
                  value={form.genericName}
                  onChange={(e) => setForm((p) => ({ ...p, genericName: e.target.value }))}
                  placeholder="e.g., Amoxicillin Clavulanate"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Brand Name</label>
                <input
                  type="text"
                  value={form.brandName}
                  onChange={(e) => setForm((p) => ({ ...p, brandName: e.target.value }))}
                  placeholder="e.g., Augmentin 625"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Strength</label>
                <input
                  type="text"
                  value={form.strength}
                  onChange={(e) => setForm((p) => ({ ...p, strength: e.target.value }))}
                  placeholder="e.g., 625 mg"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Dosage Form</label>
                <select
                  value={form.dosageForm}
                  onChange={(e) => {
                    const df = e.target.value;
                    setForm((p) => ({
                      ...p,
                      dosageForm: df,
                      defaultUnit: getDefaultUnitForDosageForm(df),
                    }));
                  }}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                >
                  {DOSAGE_FORMS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Default Route</label>
                <select
                  value={form.route}
                  onChange={(e) => setForm((p) => ({ ...p, route: e.target.value }))}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                >
                  {ADMINISTRATION_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Packaging Info
                </label>
                <input
                  type="text"
                  value={form.packagingInfo}
                  onChange={(e) => setForm((p) => ({ ...p, packagingInfo: e.target.value }))}
                  placeholder="e.g., Strip of 10 tablets"
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
                />
              </div>

              <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(form.isFavorite)}
                  onChange={(e) => setForm((p) => ({ ...p, isFavorite: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                Pin as favorite medicine (appears first in prescription search)
              </label>
            </div>

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
                {editingMed ? 'Save Changes' : 'Add Medicine'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShellLayout>
  );
}
