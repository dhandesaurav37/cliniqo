import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Loader2,
  Plus,
  ShieldAlert,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  cancelQueueEntry,
  DEFAULT_CLINIC_TIMEZONE,
  formatQueueDateHeading,
  formatQueueTime,
  formatWaitDuration,
  getClinicQueueDate,
  subscribeToDailyQueue,
  type DailyQueueEntryRecord,
} from '../lib/queueService';
import { QueueStatusLabel, QueueStatusLegend } from './QueueStatusLegend';
import { QuickAddToQueueModal } from './QuickAddToQueueModal';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

type ReceptionFilter = 'active' | 'waiting' | 'in_consultation' | 'completed' | 'all';

interface ReceptionQueueSectionProps {
  compact?: boolean;
}

export function ReceptionQueueSection({ compact = false }: ReceptionQueueSectionProps) {
  const { user, clinic, profile, membership } = useAuth();
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);

  const [entries, setEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReceptionFilter>('active');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DailyQueueEntryRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!clinic) return;
    setLoading(true);
    setError(null);
    const unsub = subscribeToDailyQueue(
      clinic.id,
      queueDate,
      (list) => {
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        setError(getUserFriendlyErrorMessage(err, 'Unable to connect to live queue.'));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clinic, queueDate]);

  const counts = useMemo(() => {
    const activeNonCancelled = entries.filter((e) => e.status !== 'cancelled');
    return {
      total: activeNonCancelled.length,
      waiting: entries.filter((e) => e.status === 'waiting' || e.status === 'called').length,
      inConsultation: entries.filter((e) => e.status === 'in_consultation').length,
      completed: entries.filter((e) => e.status === 'completed').length,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const list = entries.filter((entry) => {
      if (filter === 'active') {
        return entry.status !== 'cancelled' && entry.status !== 'completed';
      }
      if (filter === 'waiting') {
        return entry.status === 'waiting' || entry.status === 'called';
      }
      if (filter === 'in_consultation') {
        return entry.status === 'in_consultation';
      }
      if (filter === 'completed') {
        return entry.status === 'completed';
      }
      return true;
    });
    return compact ? list.slice(0, 6) : list;
  }, [entries, filter, compact]);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !user || !membership || !cancelTarget) return;
    setCancelling(true);
    setError(null);
    setFeedback(null);
    try {
      await cancelQueueEntry({
        clinicId: clinic.id,
        clinicOwnerId: clinic.ownerId,
        entry: cancelTarget,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Receptionist',
        actorRole: membership.role,
        reason: cancelReason,
      });
      setFeedback(
        `Removed Token #${cancelTarget.tokenLabel} (${cancelTarget.patientName}) from active queue with audit record.`,
      );
      setCancelTarget(null);
      setCancelReason('');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to cancel queue entry.'));
    } finally {
      setCancelling(false);
    }
  };

  const formatGender = (gender: DailyQueueEntryRecord['patientGender']) => {
    if (!gender) return '—';
    if (gender === 'male') return 'Male';
    if (gender === 'female') return 'Female';
    return 'Other';
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#0B192C]">
            Today&rsquo;s Queue
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
            {formatQueueDateHeading(queueDate)} · Live updates from consultation room
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />+ Add Patient to Queue
          </button>
          {compact && (
            <Link
              to="/app/reception/queue"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Open Full Queue
            </Link>
          )}
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Total Added Today</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-[#0B192C] tabular-nums">
            {counts.total}
          </p>
        </div>
        <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Waiting Patients</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-sky-700 tabular-nums">
            {counts.waiting}
          </p>
        </div>
        <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">In Consultation</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
            {counts.inConsultation}
          </p>
        </div>
        <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Completed Patients</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-teal-800 tabular-nums">
            {counts.completed}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Legend */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1 w-fit max-w-full overflow-x-auto">
          {(
            [
              { id: 'active', label: 'Active Queue' },
              { id: 'waiting', label: 'Waiting' },
              { id: 'in_consultation', label: 'In Consultation' },
              { id: 'completed', label: 'Completed' },
              { id: 'all', label: 'All Today' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[34px] rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white text-[#0B192C] shadow-sm'
                  : 'text-slate-600 hover:text-[#0B192C]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <QueueStatusLegend />
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
          className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="lucid-glass rounded-2xl p-6 space-y-3">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-20 rounded-xl bg-slate-100/90" />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="lucid-glass rounded-2xl px-6 py-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/70">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="font-display text-base font-bold text-[#0B192C]">
            {entries.length === 0 ? 'Queue is empty for today' : 'No matching entries in this filter'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            Add a registered patient or register a new walk-in patient to issue the next daily token.
          </p>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add First Patient to Queue
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const canCancel = ['waiting', 'called', 'on_hold', 'skipped'].includes(entry.status);
            const isTerminal = entry.status === 'completed' || entry.status === 'cancelled';

            return (
              <article
                key={entry.id}
                className="lucid-glass rounded-2xl p-4 sm:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-sky-200/80 bg-white/90 text-[#0B192C]">
                    <span className="text-[10px] font-semibold text-slate-500">TOKEN</span>
                    <span className="font-mono text-2xl font-bold tracking-tight text-sky-800 tabular-nums">
                      {entry.tokenLabel}
                    </span>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-display text-base font-bold text-[#0B192C] truncate">
                        {entry.patientName}
                      </h3>
                      <QueueStatusLabel status={entry.status} />
                      {entry.priority && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">
                          <Flag className="h-3 w-3" aria-hidden="true" />
                          Priority
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono font-semibold text-sky-800">{entry.patientId}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {entry.patientAge !== null && entry.patientAge !== undefined
                          ? `${entry.patientAge} yrs`
                          : 'Age —'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatGender(entry.patientGender)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Added {formatQueueTime(entry.arrivalTime, timezone)}</span>
                      {!isTerminal && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-[#0B192C]">
                            <Clock className="h-3 w-3 text-sky-700" aria-hidden="true" />
                            Wait {formatWaitDuration(entry.arrivalTime, nowMs)}
                          </span>
                        </>
                      )}
                    </p>

                    {entry.assignedDoctorName && (
                      <p className="text-xs font-medium text-emerald-700">
                        Attending Doctor: {entry.assignedDoctorName}
                      </p>
                    )}
                    {entry.status === 'cancelled' && entry.cancelReason && (
                      <p className="text-xs text-rose-700">Reason: {entry.cancelReason}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    to={`/app/patients/${entry.patientId}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    Profile
                  </Link>

                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelTarget(entry);
                        setCancelReason('');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <QuickAddToQueueModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        activeQueueEntries={entries}
        onAdded={({ patientName, tokenLabel }) => {
          setFeedback(`Added ${patientName} to today's queue with Token #${tokenLabel}.`);
        }}
      />

      {/* Cancel / Remove Confirmation Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelling) setCancelTarget(null);
          }}
        >
          <form
            onSubmit={handleConfirmCancel}
            className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center gap-3 text-[#0B192C]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">
                  Remove Token #{cancelTarget.tokenLabel} from queue?
                </h3>
                <p className="text-xs text-slate-500">
                  {cancelTarget.patientName} ({cancelTarget.patientId})
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-600">
              Mistakenly added entries are marked as Cancelled with an audit trail rather than
              deleted. The doctor will be notified immediately.
            </p>

            <div>
              <label htmlFor="cancel-reason" className="block text-xs font-semibold text-slate-700">
                Reason (optional)
              </label>
              <input
                id="cancel-reason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Added wrong patient, patient left"
                className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Keep in Queue
              </button>
              <button
                type="submit"
                disabled={cancelling}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Confirm Remove
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
