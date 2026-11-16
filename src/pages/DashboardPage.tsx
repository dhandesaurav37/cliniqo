import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  ListOrdered,
  Loader2,
  RotateCw,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { DoctorQueueSection } from '../components/DoctorQueueSection';
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
import { fetchPatientStats, type PatientRecord } from '../lib/patientService';
import {
  DEFAULT_CLINIC_TIMEZONE,
  getClinicQueueDate,
  subscribeToDailyQueue,
  type DailyQueueEntryRecord,
} from '../lib/queueService';

export function DashboardPage() {
  const { clinic, profile, membership } = useAuth();
  const [copied, setCopied] = useState(false);

  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const clinicToday = getClinicTodayDate(timezone);
  const queueDate = getClinicQueueDate(timezone);
  const startOfTodayUtcMs = useMemo(
    () => computeScheduledAtUtcMs(clinicToday, '00:00', timezone),
    [clinicToday, timezone],
  );

  const [queueEntries, setQueueEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentsRetryKey, setAppointmentsRetryKey] = useState(0);

  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [todayRegistered, setTodayRegistered] = useState<number>(0);
  const [recentPatients, setRecentPatients] = useState<PatientRecord[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const loadPatientsSummary = useCallback(async () => {
    if (!clinic) return;
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const stats = await fetchPatientStats(clinic.id, startOfTodayUtcMs);
      setTotalPatients(stats.totalActive);
      setTodayRegistered(stats.todayRegistered);
      setRecentPatients(stats.recentPatients);
    } catch (err: unknown) {
      setPatientsError(getUserFriendlyErrorMessage(err, 'Unable to load recent patients.'));
    } finally {
      setPatientsLoading(false);
    }
  }, [clinic, startOfTodayUtcMs]);

  useEffect(() => {
    void loadPatientsSummary();
  }, [loadPatientsSummary]);

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

  const queueCounts = useMemo(() => {
    const activeNonCancelled = queueEntries.filter((e) => e.status !== 'cancelled');
    return {
      todayPatients: activeNonCancelled.length,
      waiting: queueEntries.filter((e) => e.status === 'waiting' || e.status === 'called').length,
      inConsultation: queueEntries.filter((e) => e.status === 'in_consultation').length,
      completed: queueEntries.filter((e) => e.status === 'completed').length,
    };
  }, [queueEntries]);

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

  const handleCopyCode = async () => {
    if (!clinic?.joiningCode) return;
    try {
      await navigator.clipboard.writeText(clinic.joiningCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <AppShellLayout breadcrumb="Dashboard">
      <div className="space-y-8">
        {/* Top Greeting & Quick Actions */}
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
                {clinic?.name}
              </h1>
              <p className="text-sm text-slate-600">
                {clinic?.city}, {clinic?.state} · Signed in as{' '}
                <span className="font-medium text-[#0B192C]">{profile?.fullName}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/app/doctor/queue"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 whitespace-nowrap"
            >
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              View Queue
            </Link>
            <Link
              to="/app/patients/new"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add Patient
            </Link>
            <Link
              to="/app/appointments"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <CalendarClock className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Open Appointments
            </Link>
            <Link
              to="/app/doctor/prescriptions"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <FileText className="h-4 w-4 text-sky-700" aria-hidden="true" />
              View Prescriptions
            </Link>
            <Link
              to="/app/settings/clinic"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
            >
              <Settings className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Clinic Settings
            </Link>
          </div>
        </div>

        {/* Today's Clinical Snapshot */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Today&rsquo;s Patients</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-[#0B192C] tabular-nums">
              {queueCounts.todayPatients}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {todayRegistered} newly registered today · {totalPatients.toLocaleString('en-IN')} total
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Waiting Patients</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-amber-700 tabular-nums">
              {queueCounts.waiting}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {queueCounts.inConsultation} currently in consultation
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Completed Consultations</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
              {queueCounts.completed}
            </p>
            <p className="text-xs text-slate-500">Completed in today&rsquo;s queue</p>
          </div>

          <div className="lucid-glass rounded-2xl p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">Upcoming Appointments</p>
            <p className="font-display text-2xl sm:text-3xl font-bold text-sky-700 tabular-nums">
              {appointmentsLoading ? '—' : upcomingAppointments.length}
            </p>
            <p className="text-xs text-slate-500">Scheduled &amp; confirmed visits</p>
          </div>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lucid-glass rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Clinic Joining Code</p>
              <ShieldCheck className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xl font-bold tracking-wide text-[#0B192C] tabular-nums">
                {clinic?.joiningCodeActive && clinic.joiningCode
                  ? clinic.joiningCode
                  : 'Revoked'}
              </p>
              {clinic?.joiningCodeActive && clinic.joiningCode && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Share with staff and approve requests in Staff Management.
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Consultation Setup</p>
              <Clock className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <p className="font-display text-2xl font-bold text-[#0B192C] tabular-nums">
              ₹{(clinic?.consultationFee ?? 0).toLocaleString('en-IN')}{' '}
              <span className="text-xs font-medium text-slate-500">
                / {clinic?.appointmentDuration} min slot
              </span>
            </p>
            <p className="text-xs text-slate-600 tabular-nums">
              {clinic?.openingTime} – {clinic?.closingTime} ·{' '}
              {clinic?.workingDays?.join(', ')}
            </p>
          </div>

          <div className="lucid-glass rounded-2xl p-6 space-y-3 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Active Role &amp; License</p>
              <Stethoscope className="h-4 w-4 text-sky-600" aria-hidden="true" />
            </div>
            <p className="font-display text-base font-bold text-[#0B192C]">
              {membership?.role === 'owner' ? 'Clinic Owner / Admin' : membership?.role}
              {membership?.isPractisingDoctor ? ' & Doctor' : ''}
            </p>
            <p className="text-xs text-slate-600">
              {profile?.qualification} · {profile?.specialization}
            </p>
            <p className="font-mono text-xs text-slate-500">
              Reg: {profile?.registrationNumber || 'Not specified'}
            </p>
          </div>
        </div>

        {/* Today's Live Patient Queue */}
        <DoctorQueueSection compact />

        {/* Upcoming Appointments + Recent Patients */}
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
                Open Appointments &rarr;
              </Link>
            </div>

            {appointmentsLoading ? (
              <div className="flex items-center gap-2.5 py-6 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                Loading upcoming visits...
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

          <section className="lg:col-span-5 lucid-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B192C]">
                <Users className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Recent Patients
              </h2>
              <Link
                to="/app/patients"
                className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                All Patients &rarr;
              </Link>
            </div>

            {patientsLoading ? (
              <div className="flex items-center gap-2.5 py-6 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                Loading recent patients...
              </div>
            ) : patientsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-3">
                <span>{patientsError}</span>
                <button
                  type="button"
                  onClick={() => void loadPatientsSummary()}
                  className="inline-flex items-center gap-1 font-semibold text-rose-900 hover:underline shrink-0 cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : recentPatients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-5 text-center space-y-2">
                <p className="text-xs text-slate-600">No patients registered in this clinic yet.</p>
                <Link
                  to="/app/patients/new"
                  className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                >
                  Add First Patient
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {recentPatients.map((pat) => (
                  <Link
                    key={pat.id}
                    to={`/app/patients/${pat.patientId}`}
                    className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-sky-50/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B192C] truncate">
                        {pat.fullName}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums truncate">
                        <span className="font-mono text-sky-800">{pat.patientId}</span> ·{' '}
                        {pat.mobile}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Workspace Details + Clinic Operations Modules */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7 lucid-glass rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Clinic Workspace Profile
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm border-t border-slate-200/70 pt-4">
              <div>
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="mt-1 font-medium text-[#0B192C]">
                  {clinic?.address}, {clinic?.city}, {clinic?.state} – {clinic?.pincode}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="mt-1 font-medium text-[#0B192C] tabular-nums">{clinic?.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Doctor Timings</dt>
                <dd className="mt-1 font-medium text-[#0B192C]">
                  {profile?.consultationTimings || 'Configured per clinic schedule'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Experience</dt>
                <dd className="mt-1 font-medium text-[#0B192C] tabular-nums">
                  {profile?.experience ?? 0} years
                </dd>
              </div>
            </dl>
          </section>

          <section className="lg:col-span-5 lucid-glass-subtle rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B192C]">
              Clinic Operations Modules
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your multi-tenant clinic profile, staff access controls, patient registry, live token
              queue, and consultation prescription maker are active:
            </p>
            <ul className="space-y-2.5 text-xs text-slate-600 border-t border-slate-200/70 pt-4">
              <li>
                • Clinical consultations &amp; Smart Prescription Maker (Active in{' '}
                <Link
                  to="/app/doctor/prescriptions"
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Prescriptions
                </Link>
                ,{' '}
                <Link
                  to="/app/doctor/medicines"
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Medicines
                </Link>{' '}
                &amp;{' '}
                <Link
                  to="/app/doctor/prescription-templates"
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Rx Templates
                </Link>
                )
              </li>
              <li>
                • Follow-up appointments &amp; automated WhatsApp reminders (Active in{' '}
                <Link to="/app/appointments" className="font-semibold text-sky-700 hover:underline">
                  Appointments
                </Link>
                )
              </li>
              <li>
                • Live daily patient queue &amp; token controls (Active in{' '}
                <Link to="/app/doctor/queue" className="font-semibold text-sky-700 hover:underline">
                  Live Queue
                </Link>
                )
              </li>
              <li>
                • Patient registration, search &amp; clinical records (Active in{' '}
                <Link to="/app/patients" className="font-semibold text-sky-700 hover:underline">
                  Patients
                </Link>
                )
              </li>
              <li>
                • Staff &amp; receptionist joining approval workflow (Active in{' '}
                <Link
                  to="/app/settings/staff"
                  className="font-semibold text-sky-700 hover:underline"
                >
                  Staff Management
                </Link>
                )
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppShellLayout>
  );
}
