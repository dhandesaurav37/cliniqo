import {
  CheckCircle2,
  Eye,
  FileText,
  FileWarning,
  Loader2,
  Search,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { fetchClinicPrescriptions, type PrescriptionRecord } from '../lib/consultationService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

type RxFilter = 'all' | 'finalized' | 'draft';

export function PrescriptionsListPage() {
  const { clinic } = useAuth();
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RxFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const loadPrescriptions = useCallback(async () => {
    if (!clinic) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchClinicPrescriptions(clinic.id);
      setPrescriptions(list);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load prescriptions.'));
    } finally {
      setLoading(false);
    }
  }, [clinic]);

  useEffect(() => {
    void loadPrescriptions();
  }, [loadPrescriptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prescriptions
      .filter((rx) => (filter === 'all' ? true : rx.status === filter))
      .filter((rx) => {
        if (!q) return true;
        const medMatch = rx.medicines.some((m) =>
          m.medicineName.toLowerCase().includes(q),
        );
        return (
          rx.prescriptionNumber.toLowerCase().includes(q) ||
          rx.patientId.toLowerCase().includes(q) ||
          rx.doctorName.toLowerCase().includes(q) ||
          medMatch
        );
      });
  }, [prescriptions, filter, search]);

  const formatTs = (rx: PrescriptionRecord) => {
    const ts = rx.signedAt || rx.updatedAt || rx.createdAt;
    if (!ts) return '—';
    return ts.toDate().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <AppShellLayout breadcrumb="Prescriptions">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Prescriptions
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Doctor-only archive of finalized prescriptions and in-progress drafts across your
              clinic.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/doctor/medicines"
              className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
            >
              Medicines Catalog
            </Link>
            <Link
              to="/app/doctor/prescription-templates"
              className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
            >
              Rx Templates
            </Link>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
          >
            {error}
          </div>
        )}

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
              placeholder="Search Rx number, patient ID, or medicine..."
              className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-[#0B192C]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 w-fit">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'finalized', label: 'Finalized' },
                { id: 'draft', label: 'Drafts' },
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

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading prescriptions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="lucid-glass rounded-3xl px-6 py-12 text-center space-y-2.5">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              No prescriptions found
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
              Accept a patient from Today&rsquo;s Queue and open a Consultation to create and sign
              prescriptions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((rx) => (
              <article
                key={rx.id}
                className="lucid-glass rounded-2xl p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#0B192C] tabular-nums">
                      {rx.prescriptionNumber}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                      v{rx.version}
                    </span>
                    {rx.status === 'finalized' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Finalized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        <FileWarning className="h-3 w-3" aria-hidden="true" />
                        Unsigned Draft
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 tabular-nums">
                    Patient:{' '}
                    <Link
                      to={`/app/patients/${rx.patientId}`}
                      className="font-mono font-semibold text-sky-800 hover:underline"
                    >
                      {rx.patientId}
                    </Link>
                    {' · '}
                    {rx.medicines.length} medicine(s)
                    {' · '}
                    Dr. {rx.doctorName.replace(/^Dr\.?\s*/i, '')}
                    {' · '}
                    {formatTs(rx)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    to={`/app/doctor/consultation/${rx.consultationId}`}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                  >
                    <Stethoscope className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    Consultation
                  </Link>
                  <Link
                    to={`/app/doctor/prescriptions/${rx.id}`}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    View &amp; Print
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShellLayout>
  );
}
