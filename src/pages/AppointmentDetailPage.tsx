import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Stethoscope,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CancelAppointmentModal,
  RescheduleAppointmentModal,
} from '../components/AppointmentActionModals';
import { AppShellLayout } from '../components/AppShellLayout';
import { PatientCommPrefsCard } from '../components/PatientCommPrefsCard';
import { useAuth } from '../context/AuthContext';
import {
  APPOINTMENT_STATUS_META,
  formatDateHuman,
  formatTime12h,
  getAppointmentTypeLabel,
  WHATSAPP_STATUS_META,
} from '../lib/appointmentLogic';
import {
  fetchAppointmentById,
  fetchAppointmentLogs,
  fetchAppointmentNotificationLogs,
  isReceptionistAuthorizedToCancel,
  isReceptionistAuthorizedToCreate,
  updateAppointmentStatus,
  type AppointmentLogRecord,
  type AppointmentRecord,
  type NotificationLogRecord,
} from '../lib/appointmentService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

export function AppointmentDetailPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { user, clinic, profile, membership } = useAuth();

  const isDoctorOrOwner = membership?.role === 'owner' || membership?.role === 'doctor';
  const canCreate = isReceptionistAuthorizedToCreate(clinic, membership?.role);
  const canCancel = isReceptionistAuthorizedToCancel(clinic, membership?.role);

  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [logs, setLogs] = useState<AppointmentLogRecord[]>([]);
  const [notifLogs, setNotifLogs] = useState<NotificationLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyStatus, setBusyStatus] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!clinic || !appointmentId) return;
    setLoading(true);
    setError(null);
    try {
      const appt = await fetchAppointmentById(clinic.id, appointmentId);
      setAppointment(appt);
      if (appt) {
        const [aLogs, wLogs] = await Promise.all([
          fetchAppointmentLogs(clinic.id, appt.id),
          fetchAppointmentNotificationLogs(clinic.id, appt.id),
        ]);
        setLogs(aLogs);
        setNotifLogs(wLogs);
      }
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load appointment details.'));
    } finally {
      setLoading(false);
    }
  }, [clinic, appointmentId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleStatusChange = async (nextStatus: 'confirmed' | 'completed' | 'no_show') => {
    if (!clinic || !appointment || !user || !membership) return;
    setBusyStatus(true);
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
      setFeedback(`Updated status to ${APPOINTMENT_STATUS_META[nextStatus].label}.`);
      await loadDetails();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update appointment status.'));
    } finally {
      setBusyStatus(false);
    }
  };

  const formatTs = (ts?: { toDate: () => Date } | null) =>
    ts
      ? ts.toDate().toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  return (
    <AppShellLayout breadcrumb="Appointment Details">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/app/appointments"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Appointments
          </Link>

          {appointment && (
            <Link
              to={`/app/patients/${appointment.patientId}/appointments`}
              className="text-xs font-semibold text-[#0B192C] hover:text-sky-700 hover:underline"
            >
              View All Visits for {appointment.patientName}
            </Link>
          )}
        </div>

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading appointment record...
          </div>
        ) : !appointment || !clinic ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">
              Appointment not found
            </h1>
            <p className="text-sm text-slate-600">
              This appointment record could not be located in {clinic?.name}.
            </p>
            <Link
              to="/app/appointments"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
            >
              Return to Appointments
            </Link>
          </div>
        ) : (
          <>
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

            {/* Main Appointment Summary Card */}
            <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        APPOINTMENT_STATUS_META[appointment.status].badgeClass
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          APPOINTMENT_STATUS_META[appointment.status].dotClass
                        }`}
                      />
                      {APPOINTMENT_STATUS_META[appointment.status].label}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        WHATSAPP_STATUS_META[appointment.whatsappNotificationStatus].badgeClass
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {WHATSAPP_STATUS_META[appointment.whatsappNotificationStatus].label}
                    </span>

                    {appointment.rescheduleCount > 0 && (
                      <span className="text-xs font-semibold text-amber-700 tabular-nums">
                        Rescheduled {appointment.rescheduleCount}x
                      </span>
                    )}
                  </div>

                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B192C]">
                    {appointment.patientName}{' '}
                    <span className="font-mono text-base font-semibold text-sky-800 tabular-nums">
                      ({appointment.patientId})
                    </span>
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#0B192C]">
                      <Calendar className="h-4 w-4 text-sky-700" aria-hidden="true" />
                      {formatDateHuman(appointment.appointmentDate)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#0B192C]">
                      <Clock className="h-4 w-4 text-sky-700" aria-hidden="true" />
                      {formatTime12h(appointment.appointmentTime)} ({appointment.durationMinutes} min)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {appointment.doctorName.startsWith('Dr.')
                        ? appointment.doctorName
                        : `Dr. ${appointment.doctorName}`}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/app/patients/${appointment.patientId}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                  >
                    <UserRound className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    View Patient Profile
                  </Link>

                  {isDoctorOrOwner && appointment.consultationId && (
                    <Link
                      to={`/app/doctor/consultation/${appointment.consultationId}`}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
                    >
                      <Stethoscope className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                      Open Consultation
                    </Link>
                  )}

                  {['scheduled', 'confirmed', 'reschedule_requested'].includes(
                    appointment.status,
                  ) && (
                    <>
                      {appointment.status !== 'confirmed' && (
                        <button
                          type="button"
                          disabled={busyStatus}
                          onClick={() => void handleStatusChange('confirmed')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                        >
                          <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Confirm
                        </button>
                      )}
                      {canCreate && (
                        <button
                          type="button"
                          disabled={busyStatus}
                          onClick={() => setShowReschedule(true)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reschedule
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyStatus}
                        onClick={() => void handleStatusChange('completed')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        disabled={busyStatus}
                        onClick={() => void handleStatusChange('no_show')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-4 text-xs font-semibold text-orange-800 hover:bg-orange-100 cursor-pointer"
                      >
                        No Show
                      </button>
                      {canCancel && (
                        <button
                          type="button"
                          disabled={busyStatus}
                          onClick={() => setShowCancel(true)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 border-t border-slate-200/70 pt-5 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Appointment Type</dt>
                  <dd className="mt-0.5 font-semibold text-[#0B192C]">
                    {getAppointmentTypeLabel(appointment.appointmentType)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Patient Mobile</dt>
                  <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                    {appointment.patientMobile}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">24h Reminder Status</dt>
                  <dd className="mt-0.5 font-medium text-[#0B192C] capitalize">
                    {appointment.reminder24hStatus.replace(/_/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">2h Reminder Status</dt>
                  <dd className="mt-0.5 font-medium text-[#0B192C] capitalize">
                    {appointment.reminder2hStatus.replace(/_/g, ' ')}
                  </dd>
                </div>

                {appointment.reason && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Follow-up Reason</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C]">{appointment.reason}</dd>
                  </div>
                )}

                {appointment.additionalInstructions && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Preparation Instructions</dt>
                    <dd className="mt-0.5 text-slate-700 whitespace-pre-wrap">
                      {appointment.additionalInstructions}
                    </dd>
                  </div>
                )}

                {appointment.internalNotes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Internal Clinic Notes</dt>
                    <dd className="mt-0.5 text-slate-700 whitespace-pre-wrap">
                      {appointment.internalNotes}
                    </dd>
                  </div>
                )}

                {appointment.cancelReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-rose-600 font-semibold">Cancellation Reason</dt>
                    <dd className="mt-0.5 text-rose-800 font-medium">{appointment.cancelReason}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Patient Consent Controls */}
            <PatientCommPrefsCard
              clinicId={clinic.id}
              patientDocId={appointment.patientDocId}
              patientId={appointment.patientId}
              patientName={appointment.patientName}
              mobile={appointment.patientMobile}
            />

            {/* Audit History & WhatsApp Delivery Log */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B192C]">
                  <History className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  Schedule &amp; Status History
                </h2>

                {logs.length === 0 ? (
                  <p className="text-xs text-slate-500">No schedule activity logged yet.</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#0B192C]">{log.summary}</span>
                          <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                            {formatTs(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          By {log.actorName} ({log.actorRole})
                          {log.reason ? ` · Reason: ${log.reason}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B192C]">
                  <MessageSquare className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  WhatsApp Delivery &amp; Reminder Log
                </h2>

                {notifLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No WhatsApp dispatch logs recorded yet for this appointment.
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    {notifLogs.map((item) => {
                      const meta = WHATSAPP_STATUS_META[item.deliveryStatus];
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-[#0B192C] capitalize">
                              {item.messageType.replace('_', ' ')} ({item.recipientMobile})
                            </span>
                            <span
                              className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Slot: {item.scheduleSlotKey.replace('_', ' ')} · Template:{' '}
                            <span className="font-mono">{item.templateName || 'default'}</span>
                          </p>

                          {item.providerMessageId && (
                            <p className="font-mono text-[11px] text-emerald-800 break-all">
                              Meta Message ID: {item.providerMessageId}
                            </p>
                          )}

                          {item.errorMessage && (
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              {item.errorMessage}
                            </p>
                          )}

                          <p className="text-[11px] text-slate-400 tabular-nums">
                            Logged: {formatTs(item.createdAt)}
                            {item.sentAt ? ` · Sent: ${formatTs(item.sentAt)}` : ''}
                            {item.deliveredAt ? ` · Delivered: ${formatTs(item.deliveredAt)}` : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      {showReschedule && appointment && clinic && user && membership && (
        <RescheduleAppointmentModal
          clinic={clinic}
          appointment={appointment}
          actorUid={user.uid}
          actorName={profile?.fullName || user.displayName || 'Clinic Staff'}
          actorRole={membership.role}
          onClose={() => setShowReschedule(false)}
          onCompleted={(msg) => {
            setShowReschedule(false);
            setFeedback(msg);
            void loadDetails();
          }}
        />
      )}

      {showCancel && appointment && clinic && user && membership && (
        <CancelAppointmentModal
          clinic={clinic}
          appointment={appointment}
          actorUid={user.uid}
          actorName={profile?.fullName || user.displayName || 'Clinic Staff'}
          actorRole={membership.role}
          onClose={() => setShowCancel(false)}
          onCompleted={(msg) => {
            setShowCancel(false);
            setFeedback(msg);
            void loadDetails();
          }}
        />
      )}
    </AppShellLayout>
  );
}
