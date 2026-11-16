import {
  AlertTriangle,
  ArrowUpDown,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Loader2,
  PauseCircle,
  Play,
  RotateCcw,
  SkipForward,
  Stethoscope,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { openOrCreateConsultationForQueueEntry } from '../lib/consultationService';
import {
  acceptQueuePatient,
  callQueuePatient,
  completeQueueConsultation,
  DEFAULT_CLINIC_TIMEZONE,
  formatQueueDateHeading,
  formatQueueTime,
  formatWaitDuration,
  getClinicQueueDate,
  holdQueuePatient,
  resumeQueuePatient,
  skipQueuePatient,
  subscribeToDailyQueue,
  toggleQueuePriority,
  type DailyQueueEntryRecord,
} from '../lib/queueService';
import { QueueStatusLabel, QueueStatusLegend } from './QueueStatusLegend';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

type DoctorFilter = 'active' | 'waiting' | 'in_consultation' | 'deferred' | 'completed' | 'all';

interface DoctorQueueSectionProps {
  compact?: boolean;
}

export function DoctorQueueSection({ compact = false }: DoctorQueueSectionProps) {
  const { user, clinic, profile, membership } = useAuth();
  const navigate = useNavigate();
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);

  const [entries, setEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DoctorFilter>('active');
  const [sortMode, setSortMode] = useState<'token' | 'priority'>('token');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [priorityTarget, setPriorityTarget] = useState<DailyQueueEntryRecord | null>(null);
  const [priorityReason, setPriorityReason] = useState('');
  const [savingPriority, setSavingPriority] = useState(false);

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
    const base = entries.filter((entry) => {
      if (filter === 'active') {
        return ['waiting', 'called', 'in_consultation', 'on_hold', 'skipped'].includes(entry.status);
      }
      if (filter === 'waiting') {
        return entry.status === 'waiting' || entry.status === 'called';
      }
      if (filter === 'in_consultation') {
        return entry.status === 'in_consultation';
      }
      if (filter === 'deferred') {
        return entry.status === 'on_hold' || entry.status === 'skipped';
      }
      if (filter === 'completed') {
        return entry.status === 'completed';
      }
      return true;
    });

    const sorted = [...base].sort((a, b) => {
      if (sortMode === 'priority' && a.priority !== b.priority) {
        return a.priority ? -1 : 1;
      }
      return a.tokenNumber - b.tokenNumber;
    });

    return compact ? sorted.slice(0, 6) : sorted;
  }, [entries, filter, sortMode, compact]);

  const actorName = profile?.fullName || user?.displayName || 'Doctor';

  const runAction = async (
    entry: DailyQueueEntryRecord,
    fn: () => Promise<void>,
    successMsg: string,
  ) => {
    setBusyId(entry.id);
    setError(null);
    setFeedback(null);
    try {
      await fn();
      setFeedback(successMsg);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update queue status.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenConsultation = async (entry: DailyQueueEntryRecord) => {
    if (!clinic || !user) return;
    setBusyId(entry.id);
    setError(null);
    try {
      const consultationId = await openOrCreateConsultationForQueueEntry({
        clinicId: clinic.id,
        patient: {
          id: entry.patientDocumentId,
          patientId: entry.patientId,
        },
        queueEntryId: entry.id,
        queueDate: entry.queueDate,
        doctorUid: user.uid,
        doctorName: actorName,
      });
      navigate(`/app/doctor/consultation/${consultationId}`);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to open consultation.'));
      setBusyId(null);
    }
  };

  const handleSavePriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !user || !membership || !priorityTarget) return;
    const nextPriority = !priorityTarget.priority;
    if (nextPriority && priorityReason.trim().length < 2) {
      setError('Please enter a brief clinical reason when assigning priority.');
      return;
    }

    setSavingPriority(true);
    setError(null);
    try {
      await toggleQueuePriority({
        clinicId: clinic.id,
        entry: priorityTarget,
        nextPriority,
        reason: nextPriority ? priorityReason : 'Priority cleared',
        actorUid: user.uid,
        actorName,
        actorRole: membership.role,
      });
      setFeedback(
        nextPriority
          ? `Token #${priorityTarget.tokenLabel} marked as Priority.`
          : `Priority removed from Token #${priorityTarget.tokenLabel}.`,
      );
      setPriorityTarget(null);
      setPriorityReason('');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update priority.'));
    } finally {
      setSavingPriority(false);
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#0B192C]">
            Today&rsquo;s Patient Queue
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
            {formatQueueDateHeading(queueDate)} · Timezone: {timezone}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSortMode((prev) => (prev === 'token' ? 'priority' : 'token'))}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
            {sortMode === 'token' ? 'Order: Token # (Default)' : 'Order: Priority First'}
          </button>

          {compact && (
            <Link
              to="/app/doctor/queue"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Open Full Queue
            </Link>
          )}
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1">
          <p className="text-xs font-medium text-slate-500">Total Patients Today</p>
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

      {/* Filter Tabs + Status Legend */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1 w-fit max-w-full overflow-x-auto">
          {(
            [
              { id: 'active', label: 'Active Queue' },
              { id: 'waiting', label: 'Waiting' },
              { id: 'in_consultation', label: 'In Consultation' },
              { id: 'deferred', label: 'Hold & Skipped' },
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

      {/* Live Queue List */}
      {loading ? (
        <div className="lucid-glass rounded-2xl p-6 space-y-3">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-20 rounded-xl bg-slate-100/90" />
          ))}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="lucid-glass rounded-2xl px-6 py-12 text-center space-y-2.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/70">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="font-display text-base font-bold text-[#0B192C]">
            {entries.length === 0 ? 'No patients in today’s queue yet' : 'No entries in this view'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            {entries.length === 0
              ? 'Patients added by your receptionist or from the Patients directory will appear here instantaneously.'
              : 'Switch queue filter tabs above to view completed, on-hold, or skipped patients.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const isBusy = busyId === entry.id;
            const canAccept = entry.status === 'waiting' || entry.status === 'called';
            const canCall = entry.status === 'waiting';
            const canHold = ['waiting', 'called', 'in_consultation'].includes(entry.status);
            const canSkip = ['waiting', 'called', 'on_hold'].includes(entry.status);
            const canResume = entry.status === 'on_hold' || entry.status === 'skipped';
            const canComplete = entry.status === 'in_consultation';
            const isTerminal = entry.status === 'completed' || entry.status === 'cancelled';

            return (
              <article
                key={entry.id}
                className="lucid-glass rounded-2xl p-4 sm:p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  {/* Large Token Box */}
                  <div className="flex h-16 w-16 sm:h-18 sm:w-18 shrink-0 flex-col items-center justify-center rounded-2xl border border-sky-200/80 bg-white/90 text-[#0B192C]">
                    <span className="text-[10px] font-semibold text-slate-500">TOKEN</span>
                    <span className="font-mono text-2xl font-bold tracking-tight text-sky-800 tabular-nums">
                      {entry.tokenLabel}
                    </span>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-display text-base sm:text-lg font-bold text-[#0B192C] truncate">
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
                      <span>Arrived {formatQueueTime(entry.arrivalTime, timezone)}</span>
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

                    {entry.priority && entry.priorityReason && (
                      <p className="text-xs text-rose-700">
                        Priority note: {entry.priorityReason} (by{' '}
                        {entry.priorityChangedByName || 'Doctor'})
                      </p>
                    )}
                    {entry.assignedDoctorName && entry.status === 'in_consultation' && (
                      <p className="text-xs text-emerald-700 font-medium">
                        In consultation with {entry.assignedDoctorName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Doctor Action Bar */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canAccept && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            acceptQueuePatient({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Accepted Token #${entry.tokenLabel} (${entry.patientName}) into consultation.`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Accept Patient
                    </button>
                  )}

                  {(entry.status === 'in_consultation' || entry.status === 'completed') &&
                    clinic &&
                    user && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleOpenConsultation(entry)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                      >
                        <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                        {entry.status === 'completed' ? 'View Consultation' : 'Open Consultation'}
                      </button>
                    )}

                  {canComplete && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            completeQueueConsultation({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Consultation completed for Token #${entry.tokenLabel} (${entry.patientName}).`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Complete Consultation
                    </button>
                  )}

                  {canCall && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            callQueuePatient({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Called Token #${entry.tokenLabel} (${entry.patientName}).`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                      Call
                    </button>
                  )}

                  {canResume && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            resumeQueuePatient({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Token #${entry.tokenLabel} (${entry.patientName}) returned to waiting queue.`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-3.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Resume
                    </button>
                  )}

                  {canHold && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            holdQueuePatient({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Token #${entry.tokenLabel} placed on hold.`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <PauseCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      Hold
                    </button>
                  )}

                  {canSkip && clinic && user && membership && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          entry,
                          () =>
                            skipQueuePatient({
                              clinicId: clinic.id,
                              clinicOwnerId: clinic.ownerId,
                              entry,
                              actorUid: user.uid,
                              actorName,
                              actorRole: membership.role,
                            }),
                          `Token #${entry.tokenLabel} skipped (record retained).`,
                        )
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <SkipForward className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      Skip
                    </button>
                  )}

                  {!isTerminal && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setPriorityTarget(entry);
                        setPriorityReason(entry.priorityReason || '');
                      }}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        entry.priority
                          ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      {entry.priority ? 'Clear Priority' : 'Priority'}
                    </button>
                  )}

                  <Link
                    to={`/app/patients/${entry.patientId}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    View Profile
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Priority Modal */}
      {priorityTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingPriority) setPriorityTarget(null);
          }}
        >
          <form
            onSubmit={handleSavePriority}
            className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                <Flag className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-[#0B192C]">
                  {priorityTarget.priority
                    ? 'Remove Clinical Priority?'
                    : `Mark Token #${priorityTarget.tokenLabel} as Priority`}
                </h3>
                <p className="text-xs text-slate-500">
                  {priorityTarget.patientName} ({priorityTarget.patientId})
                </p>
              </div>
            </div>

            {!priorityTarget.priority ? (
              <div>
                <label htmlFor="priority-reason" className="block text-xs font-semibold text-slate-700">
                  Clinical reason (recorded in audit log)
                </label>
                <input
                  id="priority-reason"
                  type="text"
                  required
                  value={priorityReason}
                  onChange={(e) => setPriorityReason(e.target.value)}
                  placeholder="e.g., Acute chest discomfort, high fever in infant"
                  className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                This will clear the priority flag and log the update under {actorName}.
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={savingPriority}
                onClick={() => setPriorityTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPriority}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {savingPriority && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {priorityTarget.priority ? 'Confirm Clear' : 'Confirm Priority'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
