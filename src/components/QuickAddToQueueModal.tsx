import { CheckCircle2, Loader2, Plus, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { queryPatientsPage, type PatientRecord } from '../lib/patientService';
import { addPatientToTodayQueue, type DailyQueueEntryRecord } from '../lib/queueService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

interface QuickAddToQueueModalProps {
  open: boolean;
  onClose: () => void;
  activeQueueEntries: DailyQueueEntryRecord[];
  onAdded?: (summary: { patientName: string; tokenLabel: string }) => void;
}

export function QuickAddToQueueModal({
  open,
  onClose,
  activeQueueEntries,
  onAdded,
}: QuickAddToQueueModalProps) {
  const { user, clinic, profile, membership } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingPatientId, setAddingPatientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clinic) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await queryPatientsPage(clinic.id, {
          searchText: searchInput.trim(),
          statusFilter: 'active',
          pageSize: 8,
        });
        if (active) {
          setPatients(res.patients);
        }
      } catch (err: unknown) {
        if (active) {
          setError(getUserFriendlyErrorMessage(err, 'Unable to search patients.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, clinic, searchInput]);

  if (!open) return null;

  const activeMap = new Map<string, DailyQueueEntryRecord>();
  activeQueueEntries.forEach((entry) => {
    if (['waiting', 'called', 'in_consultation', 'on_hold'].includes(entry.status)) {
      activeMap.set(entry.patientDocumentId, entry);
    }
  });

  const handleAdd = async (patient: PatientRecord) => {
    if (!clinic || !user || !membership) return;
    setAddingPatientId(patient.id);
    setError(null);
    try {
      const res = await addPatientToTodayQueue({
        clinicId: clinic.id,
        clinicOwnerId: clinic.ownerId,
        timezone: clinic.timezone,
        patient,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Clinic Staff',
        actorRole: membership.role,
      });
      onAdded?.({ patientName: patient.fullName, tokenLabel: res.tokenLabel });
      onClose();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Could not add patient to queue.'));
    } finally {
      setAddingPatientId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add patient to today's queue"
      onClick={(e) => {
        if (e.target === e.currentTarget && !addingPatientId) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Add Patient to Today&rsquo;s Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Search an existing patient by name, mobile, or ID—or register a new walk-in patient.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              autoFocus
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, mobile, or PAT-2026-0001..."
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
          <Link
            to="/app/patients/new?queue=1"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-semibold text-sky-800 hover:bg-sky-100 whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Register New &amp; Queue
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
          >
            {error}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-200/70 border border-slate-200/80 rounded-2xl">
          {loading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
              Searching clinic patients...
            </div>
          ) : patients.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs text-slate-600">
                No active patient records matched your search.
              </p>
              <Link
                to="/app/patients/new?queue=1"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
              >
                Register new patient and add to today&rsquo;s queue &rarr;
              </Link>
            </div>
          ) : (
            patients.map((patient) => {
              const existingEntry = activeMap.get(patient.id);
              const isAdding = addingPatientId === patient.id;
              return (
                <div
                  key={patient.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sky-50/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B192C] truncate">
                      {patient.fullName}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums truncate">
                      <span className="font-mono font-semibold text-sky-800">
                        {patient.patientId}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>{patient.mobile}</span>
                      {patient.age !== null && patient.age !== undefined && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span>{patient.age} yrs</span>
                        </>
                      )}
                    </p>
                  </div>

                  {existingEntry ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0 tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Token #{existingEntry.tokenLabel}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(addingPatientId)}
                      onClick={() => void handleAdd(patient)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-3.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isAdding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Add to Queue
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
