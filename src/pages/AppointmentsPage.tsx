import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CancelAppointmentModal,
  RescheduleAppointmentModal,
} from '../components/AppointmentActionModals';
import { AppShellLayout } from '../components/AppShellLayout';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  APPOINTMENT_STATUS_META,
  formatDateHuman,
  formatTime12h,
  getAppointmentTypeLabel,
  getClinicTodayDate,
  WHATSAPP_STATUS_META,
  type AppointmentStatus,
} from '../lib/appointmentLogic';
import {
  isReceptionistAuthorizedToCancel,
  isReceptionistAuthorizedToCreate,
  subscribeToClinicAppointments,
  updateAppointmentStatus,
  type AppointmentRecord,
} from '../lib/appointmentService';

type AppointmentTab = 'today' | 'upcoming' | 'past';

export function AppointmentsPage() {
  const { user, clinic, profile, membership } = useAuth();
  const timezone = clinic?.timezone || 'Asia/Kolkata';
  const clinicToday = getClinicTodayDate(timezone);

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppointmentTab>('today');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');

  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentRecord | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCreate = isReceptionistAuthorizedToCreate(clinic, membership?.role);
  const canCancel = isReceptionistAuthorizedToCancel(clinic, membership?.role);

  useEffect(() => {
    if (!clinic) return;
    setLoading(true);
    const unsub = subscribeToClinicAppointments(
      clinic.id,
      (list) => {
        setAppointments(list);
        setLoading(false);
      },
      (err) => {
        setError(getUserFriendlyErrorMessage(err, 'Unable to load clinic appointments.'));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [clinic]);

  const counts = useMemo(() => {
    const todayActive = appointments.filter((a) => a.appointmentDate === clinicToday);
    const upcomingActive = appointments.filter(
      (a) =>
        a.appointmentDate > clinicToday &&
        ['scheduled', 'confirmed', 'reschedule_requested'].includes(a.status),
    );
    const rescheduleRequests = appointments.filter(
      (a) => a.status === 'reschedule_requested',
    ).length;
    const pastAll = appointments.filter(
      (a) =>
        a.appointmentDate < clinicToday ||
        ['completed', 'cancelled', 'no_show'].includes(a.status),
    );

    return {
      today: todayActive.length,
      upcoming: upcomingActive.length,
      past: pastAll.length,
      rescheduleRequests,
    };
  }, [appointments, clinicToday]);

  const filteredAppointments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return appointments
      .filter((a) => {
        if (activeTab === 'today') {
          if (a.appointmentDate !== clinicToday) return false;
        } else if (activeTab === 'upcoming') {
          if (a.appointmentDate <= clinicToday) return false;
          if (!['scheduled', 'confirmed', 'reschedule_requested'].includes(a.status)) return false;
        } else if (activeTab === 'past') {
          const isPast =
            a.appointmentDate < clinicToday ||
            ['completed', 'cancelled', 'no_show'].includes(a.status);
          if (!isPast) return false;
        }

        if (dateFilter && a.appointmentDate !== dateFilter) return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;

        if (q) {
          const match =
            a.patientName.toLowerCase().includes(q) ||
            a.patientId.toLowerCase().includes(q) ||
            a.patientMobile.toLowerCase().includes(q) ||
            a.doctorName.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) =>
        activeTab === 'past'
          ? b.scheduledAtUtcMs - a.scheduledAtUtcMs
          : a.scheduledAtUtcMs - b.scheduledAtUtcMs,
      );
  }, [appointments, activeTab, clinicToday, dateFilter, statusFilter, searchTerm]);

  // Group filtered appointments cleanly by YYYY-MM-DD
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, AppointmentRecord[]>();
    for (const appt of filteredAppointments) {
      const existing = groups.get(appt.appointmentDate) || [];
      existing.push(appt);
      groups.set(appt.appointmentDate, existing);
    }
    return Array.from(groups.entries());
  }, [filteredAppointments]);

  const handleQuickStatus = async (
    appointment: AppointmentRecord,
    nextStatus: 'confirmed' | 'completed' | 'no_show',
  ) => {
    if (!clinic || !user || !membership) return;
    setActionBusyId(appointment.id);
    setError(null);
    setFeedback(null);
    try {
      await updateAppointmentStatus({
        clinic,
        appointment,
        nextStatus,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Clinic Staff',
        actorRole: membership.role,
      });
      setFeedback(
        `Updated ${appointment.patientName}'s appointment to ${APPOINTMENT_STATUS_META[nextStatus].label}.`,
      );
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update appointment status.'));
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <AppShellLayout breadcrumb="Appointments">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
              Appointments &amp; Follow-ups
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Simple appointment scheduling, follow-up tracking, and WhatsApp reminder status for{' '}
              {clinic?.name}.
            </p>
          </div>

          {canCreate && (
            <Link
              to="/app/appointments/new"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 whitespace-nowrap"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Schedule Appointment
            </Link>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Today&rsquo;s Visits</p>
            <p className="font-display text-2xl font-bold text-[#0B192C] tabular-nums">
              {counts.today}
            </p>
            <p className="text-[11px] text-slate-500 tabular-nums">{formatDateHuman(clinicToday)}</p>
          </div>

          <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Upcoming Follow-ups</p>
            <p className="font-display text-2xl font-bold text-[#0B192C] tabular-nums">
              {counts.upcoming}
            </p>
            <p className="text-[11px] text-slate-500">Active future visits</p>
          </div>

          <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Reschedule Requests</p>
            <p
              className={`font-display text-2xl font-bold tabular-nums ${
                counts.rescheduleRequests > 0 ? 'text-amber-700' : 'text-[#0B192C]'
              }`}
            >
              {counts.rescheduleRequests}
            </p>
            <p className="text-[11px] text-slate-500">Patient WhatsApp requests</p>
          </div>

          <div className="lucid-glass rounded-2xl p-4 sm:p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Past / Closed</p>
            <p className="font-display text-2xl font-bold text-[#0B192C] tabular-nums">
              {counts.past}
            </p>
            <p className="text-[11px] text-slate-500">Completed, Cancelled, No Show</p>
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
            className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs & Filter Controls */}
        <section className="lucid-glass rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white/80 p-1 gap-1 self-start">
              {(
                [
                  { id: 'today', label: 'Today', count: counts.today },
                  { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
                  { id: 'past', label: 'Past', count: counts.past },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setDateFilter('');
                  }}
                  className={`min-h-[36px] rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                    activeTab === tab.id
                      ? 'bg-[#0B192C] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0B192C]'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 flex-1 md:justify-end">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search patient, PAT ID, doctor..."
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-[#0B192C]"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Filter by appointment date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C] tabular-nums"
                />
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C]"
              >
                <option value="all">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="reschedule_requested">Reschedule Requested</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            </div>
          </div>

          {/* Appointments List */}
          {loading ? (
            <div className="flex items-center gap-3 py-10 justify-center text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
              Loading clinic appointments...
            </div>
          ) : groupedByDate.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-10 text-center space-y-3">
              <CalendarClock className="h-8 w-8 text-slate-400 mx-auto" aria-hidden="true" />
              <p className="font-display text-base font-bold text-[#0B192C]">
                No {activeTab} appointments found
              </p>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                {activeTab === 'today'
                  ? 'No appointments are scheduled for today matching your current filters.'
                  : 'Schedule a follow-up visit from a doctor consultation or create a clinic appointment directly.'}
              </p>
              {canCreate && (
                <Link
                  to="/app/appointments/new"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
                >
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Schedule Appointment
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByDate.map(([dateStr, items]) => (
                <div key={dateStr} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2">
                    <Calendar className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    <h2 className="font-display text-sm font-bold text-[#0B192C] tabular-nums">
                      {dateStr === clinicToday ? `Today · ${formatDateHuman(dateStr)}` : formatDateHuman(dateStr)}
                    </h2>
                    <span className="text-xs text-slate-500 tabular-nums">
                      ({items.length} {items.length === 1 ? 'visit' : 'visits'})
                    </span>
                  </div>

                  <div className="space-y-3">
                    {items.map((appt) => {
                      const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                      const waMeta = WHATSAPP_STATUS_META[appt.whatsappNotificationStatus];
                      const isActive = ['scheduled', 'confirmed', 'reschedule_requested'].includes(
                        appt.status,
                      );
                      const busyHere = actionBusyId === appt.id;

                      return (
                        <article
                          key={appt.id}
                          className="rounded-2xl border border-slate-200/85 bg-white/90 p-4 sm:p-5 space-y-3"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2 py-0.5 tabular-nums">
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                  {formatTime12h(appt.appointmentTime)}
                                </span>
                                <h3 className="font-display text-base font-bold text-[#0B192C]">
                                  {appt.patientName}
                                </h3>
                                <span className="font-mono text-xs text-slate-500 tabular-nums">
                                  {appt.patientId}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`}
                                  />
                                  {statusMeta.label}
                                </span>
                              </div>

                              <p className="text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span>
                                  {appt.doctorName.startsWith('Dr.')
                                    ? appt.doctorName
                                    : `Dr. ${appt.doctorName}`}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{getAppointmentTypeLabel(appt.appointmentType)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{appt.durationMinutes} min</span>
                                <span aria-hidden="true">·</span>
                                <span>Mobile: {appt.patientMobile}</span>
                              </p>

                              {appt.reason && (
                                <p className="text-xs text-slate-700">
                                  <span className="font-semibold text-slate-500">Purpose:</span>{' '}
                                  {appt.reason}
                                </p>
                              )}

                              {appt.cancelReason && appt.status === 'cancelled' && (
                                <p className="text-xs text-rose-700">
                                  <span className="font-semibold">Cancelled reason:</span>{' '}
                                  {appt.cancelReason}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${waMeta.badgeClass}`}
                                title={appt.lastWhatsappError || waMeta.label}
                              >
                                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                                {waMeta.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/app/patients/${appt.patientId}`}
                                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                              >
                                <UserRound className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                                View Patient
                              </Link>
                              <Link
                                to={`/app/appointments/${appt.id}`}
                                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                                Details &amp; Logs
                              </Link>
                            </div>

                            {isActive && (
                              <div className="flex flex-wrap items-center gap-2">
                                {appt.status !== 'confirmed' && (
                                  <button
                                    type="button"
                                    disabled={busyHere}
                                    onClick={() => void handleQuickStatus(appt, 'confirmed')}
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer disabled:opacity-55"
                                  >
                                    <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    Confirm
                                  </button>
                                )}

                                {canCreate && (
                                  <button
                                    type="button"
                                    disabled={busyHere}
                                    onClick={() => setRescheduleTarget(appt)}
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reschedule
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={busyHere}
                                  onClick={() => void handleQuickStatus(appt, 'completed')}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-[#0B192C] px-3 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer disabled:opacity-55"
                                >
                                  {busyHere ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  Mark Completed
                                </button>

                                <button
                                  type="button"
                                  disabled={busyHere}
                                  onClick={() => void handleQuickStatus(appt, 'no_show')}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-100 cursor-pointer disabled:opacity-55"
                                >
                                  No Show
                                </button>

                                {canCancel && (
                                  <button
                                    type="button"
                                    disabled={busyHere}
                                    onClick={() => setCancelTarget(appt)}
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    Cancel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {rescheduleTarget && clinic && user && membership && (
        <RescheduleAppointmentModal
          clinic={clinic}
          appointment={rescheduleTarget}
          actorUid={user.uid}
          actorName={profile?.fullName || user.displayName || 'Clinic Staff'}
          actorRole={membership.role}
          onClose={() => setRescheduleTarget(null)}
          onCompleted={(msg) => {
            setRescheduleTarget(null);
            setFeedback(msg);
          }}
        />
      )}

      {cancelTarget && clinic && user && membership && (
        <CancelAppointmentModal
          clinic={clinic}
          appointment={cancelTarget}
          actorUid={user.uid}
          actorName={profile?.fullName || user.displayName || 'Clinic Staff'}
          actorRole={membership.role}
          onClose={() => setCancelTarget(null)}
          onCompleted={(msg) => {
            setCancelTarget(null);
            setFeedback(msg);
          }}
        />
      )}
    </AppShellLayout>
  );
}
