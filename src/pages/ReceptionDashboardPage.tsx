import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListOrdered,
  ListPlus,
  Loader2,
  RotateCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { QuickAddToQueueModal } from '../components/QuickAddToQueueModal';
import { ReceptionQueueSection } from '../components/ReceptionQueueSection';
import { useAuth } from '../context/AuthContext';
import {
  APPOINTMENT_STATUS_META,
  computeScheduledAtUtcMs,
  formatDateHuman,
  formatTime12h,
  getAppointmentTypeLabel,
  getClinicTodayDate,
} from '../lib/appointmentLogic';
import { subscribeToClinicAppointments, type AppointmentRecord } from '../lib/appointmentService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import { fetchPatientStats } from '../lib/patientService';
import {
  DEFAULT_CLINIC_TIMEZONE,
  getClinicQueueDate,
  subscribeToDailyQueue,
  type DailyQueueEntryRecord,
} from '../lib/queueService';

export function ReceptionDashboardPage() {
  const { clinic, profile, notifications } = useAuth();
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const clinicToday = getClinicTodayDate(timezone);
  const queueDate = getClinicQueueDate(timezone);
  const startOfTodayUtcMs = useMemo(
    () => computeScheduledAtUtcMs(clinicToday, '00:00', timezone),
    [clinicToday, timezone],
  );

  const [queueEntries, setQueueEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [todayRegistered, setTodayRegistered] = useState<number>(0);
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentsRetryKey, setAppointmentsRetryKey] = useState(0);

  const [quickQueueOpen, setQuickQueueOpen] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);

  const loadPatientMetrics = useCallback(async () => {
    if (!clinic) return;
    setStatsLoading(true);
    try {
      const stats = await fetchPatientStats(clinic.id, startOfTodayUtcMs);
      setTodayRegistered(stats.todayRegistered);
      setTotalPatients(stats.totalActive);
    } catch {
      // Non-blocking card metric fallback
    } finally {
      setStatsLoading(false);
    }
  }, [clinic, startOfTodayUtcMs]);

  useEffect(() => {
    void loadPatientMetrics();
  }, [loadPatientMetrics]);

  useEffect(() => {
    if (!clinic) return;
    const unsub = subscribeToDailyQueue(
      clinic.id,
      queueDate,
      (list) => setQueueEntries(list),
      () => undefined,
    );
    return () => unsub();
  }, [clinic, queueDate]);

  useEffect(() => {
    if (!clinic) return;
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    const unsub = subscribeToClinicAppointments(
      clinic.id,
      (list) => {
        setAppointments(list);
        setAppointmentsLoading(false);
      },
      (err) => {
        setAppointmentsError(
          getUserFriendlyErrorMessage(err, 'Unable to load upcoming appointments.'),
        );
        setAppointmentsLoading(false);
      },
    );
    return () => unsub();
  }, [clinic, appointmentsRetryKey]);

  const queueCounts = useMemo(
    () => ({
      waiting: queueEntries.filter((e) => e.status === 'waiting' || e.status === 'called').length,
      inConsultation: queueEntries.filter((e) => e.status === 'in_consultation').length,
      completed: queueEntries.filter((e) => e.status === 'completed').length,
    }),
    [queueEntries],
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            a.appointmentDate >= clinicToday &&
            ['scheduled', 'confirmed', 'reschedule_requested'].includes(a.status),
        )
        .sort((a, b) => a.scheduledAtUtcMs - b.scheduledAtUtcMs)
        .slice(0, 5),
    [appointments, clinicToday],
  );

  return (
    <AppShellLayout breadcrumb="Reception Dashboard">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {clinic?.logoUrl ? (
              <img
                src={clinic.logoUrl}
                alt={`${clinic.name} logo`}
                className="h-14 w-14 rounded-2xl border border-slate-200 bg-white object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0891B2] text-white shadow-sm">
                <Building2 className="h-6 w-6" aria-hidden="true" />
              </div>
            )}
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
                {clinic?.name || 'Reception Workspace'}
              </h1>
              <p className="text-sm text-slate-600">
                {clinic?.city}, {clinic?.state} · Receptionist:{' '}
                <span className="font-medium text-[#0B192C]">{profile?.fullName}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/app/patients/new?queue=1"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Register Patient
            </Link>
            <button
              type="button"
              onClick={() => setQuickQueueOpen(true)}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Add Patient to Queue
            </button>
            <Link
              to="/app/patients?focus=search"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <Search className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Search Patients
            </Link>
            <Link
              to="/app/appointments"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <CalendarClock className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Manage Appointments
            </Link>
            <Link
              to="/app/reception/queue"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <ListOrdered className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Live Queue
            </Link>
          </div>
        </div>

        {queueFeedback && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{queueFeedback}</span>
          </div>
        )}

        {/* Front-Desk Live Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Today&rsquo;s Registered Patients</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-[#0B192C] tabular-nums">
              {statsLoading ? '—' : todayRegistered}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {totalPatients.toLocaleString('en-IN')} active clinic records
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Waiting Patients</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-amber-700 tabular-nums">
              {queueCounts.waiting}
            </p>
            <p className="text-xs text-slate-500">Waiting or called in queue</p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">In Consultation</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-sky-700 tabular-nums">
              {queueCounts.inConsultation}
            </p>
            <p className="text-xs text-slate-500">Active with doctor now</p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Completed Patients</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
              {queueCounts.completed}
            </p>
            <p className="text-xs text-slate-500">Consultations finished today</p>
          </div>
        </div>

        {/* Clinic Identity Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lucid-glass rounded-2xl p-6 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Access Status</p>
              <UserCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="font-display text-xl font-bold text-[#0B192C]">Approved Receptionist</p>
            <p className="text-xs text-slate-600">
              Authorized by clinic administrator for front-desk operations.
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-6 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Clinic Timings &amp; Fee</p>
              <Clock className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <p className="font-display text-xl font-bold text-[#0B192C] tabular-nums">
              {clinic?.openingTime} – {clinic?.closingTime}
            </p>
            <p className="text-xs text-slate-600 tabular-nums">
              Standard fee ₹{(clinic?.consultationFee ?? 0).toLocaleString('en-IN')} ·{' '}
              {clinic?.workingDays?.join(', ')}
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-6 space-y-2.5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Clinic Contact</p>
              <ShieldCheck className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <p className="font-display text-base font-bold text-[#0B192C] tabular-nums">
              {clinic?.phone}
            </p>
            <p className="text-xs text-slate-600">
              {clinic?.address}, {clinic?.city} – {clinic?.pincode}
            </p>
          </div>
        </div>

        {/* Today's Live Queue */}
        <ReceptionQueueSection compact />

        {/* Upcoming Appointments + Notifications */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7 lucid-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B192C]">
                <CalendarClock className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Upcoming Appointments
              </h2>
              <Link
                to="/app/appointments"
                className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                Manage Appointments &rarr;
              </Link>
            </div>

            {appointmentsLoading ? (
              <div className="flex items-center gap-2.5 py-6 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                Loading upcoming appointments...
              </div>
            ) : appointmentsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {appointmentsError}
                </span>
                <button
                  type="button"
                  onClick={() => setAppointmentsRetryKey((k) => k + 1)}
                  className="inline-flex items-center gap-1 font-semibold text-rose-900 hover:underline shrink-0 cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-5 text-center space-y-2">
                <p className="text-xs text-slate-600">
                  No upcoming follow-up appointments scheduled yet.
                </p>
                <Link
                  to="/app/appointments/new"
                  className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                >
                  Schedule Appointment
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {upcomingAppointments.map((appt) => {
                  const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                  return (
                    <Link
                      key={appt.id}
                      to={`/app/appointments/${appt.id}`}
                      className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-sky-50/50 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#0B192C] truncate">
                            {appt.patientName}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 tabular-nums truncate">
                          {formatDateHuman(appt.appointmentDate)} ·{' '}
                          {formatTime12h(appt.appointmentTime)} ·{' '}
                          {getAppointmentTypeLabel(appt.appointmentType)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="lg:col-span-5 lucid-glass-subtle rounded-2xl p-6 space-y-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B192C]">
              <Bell className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Recent Notifications
            </h2>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500">No recent notifications.</p>
            ) : (
              <div className="space-y-2.5">
                {notifications.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200/80 bg-white/85 px-4 py-3 text-xs"
                  >
                    <p className="font-semibold text-[#0B192C]">{item.title}</p>
                    <p className="mt-0.5 text-slate-600">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-[#0B192C]">Role Permissions</p>
              <p>• Register patients, search clinic records, add to queue, and manage follow-ups</p>
              <p>• Doctor consultations and clinic settings remain restricted to Doctors/Owners</p>
            </div>
          </section>
        </div>
      </div>

      <QuickAddToQueueModal
        open={quickQueueOpen}
        onClose={() => setQuickQueueOpen(false)}
        activeQueueEntries={queueEntries}
        onAdded={(summary) =>
          setQueueFeedback(
            `${summary.patientName} added to today's queue with Token ${summary.tokenLabel}.`,
          )
        }
      />
    </AppShellLayout>
  );
}
