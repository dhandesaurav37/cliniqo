import { ArrowLeft, CalendarClock, CalendarPlus, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { PatientCommPrefsCard } from '../components/PatientCommPrefsCard';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  APPOINTMENT_STATUS_META,
  formatDateHuman,
  formatTime12h,
  getAppointmentTypeLabel,
  WHATSAPP_STATUS_META,
} from '../lib/appointmentLogic';
import {
  fetchPatientAppointments,
  isReceptionistAuthorizedToCreate,
  type AppointmentRecord,
} from '../lib/appointmentService';
import { fetchPatientByIdOrCode, type PatientRecord } from '../lib/patientService';

export function PatientAppointmentsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { clinic, membership } = useAuth();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canCreate = isReceptionistAuthorizedToCreate(clinic, membership?.role);

  useEffect(() => {
    if (!clinic || !patientId) return;
    let cancelled = false;
    setLoading(true);
    fetchPatientByIdOrCode(clinic.id, patientId)
      .then(async (pat) => {
        if (cancelled) return;
        setPatient(pat);
        if (pat) {
          const list = await fetchPatientAppointments(clinic.id, pat.id);
          if (!cancelled) setAppointments(list);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getUserFriendlyErrorMessage(err, 'Unable to load patient appointments.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinic, patientId]);

  const upcoming = useMemo(
    () =>
      appointments.filter((a) =>
        ['scheduled', 'confirmed', 'reschedule_requested'].includes(a.status),
      ),
    [appointments],
  );
  const past = useMemo(
    () => appointments.filter((a) => ['completed', 'cancelled', 'no_show'].includes(a.status)),
    [appointments],
  );

  return (
    <AppShellLayout breadcrumb="Patient Appointments">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={patient ? `/app/patients/${patient.patientId}` : '/app/patients'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Patient Profile
          </Link>

          <Link
            to="/app/appointments"
            className="text-xs font-semibold text-[#0B192C] hover:text-sky-700 hover:underline"
          >
            All Clinic Appointments
          </Link>
        </div>

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading patient appointments...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : !patient || !clinic ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">Patient not found</h1>
            <Link
              to="/app/patients"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
            >
              Return to Patients
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-sky-800 tabular-nums">
                  {patient.patientId}
                </p>
                <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-[#0B192C]">
                  {patient.fullName} · Appointments
                </h1>
              </div>

              {canCreate && patient.status === 'active' && (
                <Link
                  to={`/app/appointments/new?patientId=${patient.patientId}`}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 whitespace-nowrap"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Schedule Follow-up
                </Link>
              )}
            </div>

            <PatientCommPrefsCard
              clinicId={clinic.id}
              patientDocId={patient.id}
              patientId={patient.patientId}
              patientName={patient.fullName}
              mobile={patient.mobile}
            />

            {[
              { title: `Upcoming Visits (${upcoming.length})`, items: upcoming },
              { title: `Past Appointments (${past.length})`, items: past },
            ].map((section) => (
              <section key={section.title} className="lucid-glass rounded-3xl p-6 space-y-4">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B192C]">
                  <CalendarClock className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  {section.title}
                </h2>

                {section.items.length === 0 ? (
                  <p className="text-xs text-slate-500">No records in this section.</p>
                ) : (
                  <div className="space-y-3">
                    {section.items.map((appt) => {
                      const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                      const waMeta = WHATSAPP_STATUS_META[appt.whatsappNotificationStatus];
                      return (
                        <div
                          key={appt.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-sm font-bold text-[#0B192C] tabular-nums">
                                {formatDateHuman(appt.appointmentDate)} ·{' '}
                                {formatTime12h(appt.appointmentTime)}
                              </span>
                              <span
                                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.label}
                              </span>
                              <span
                                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${waMeta.badgeClass}`}
                              >
                                {waMeta.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              {appt.doctorName.startsWith('Dr.')
                                ? appt.doctorName
                                : `Dr. ${appt.doctorName}`}{' '}
                              · {getAppointmentTypeLabel(appt.appointmentType)}
                              {appt.reason ? ` · ${appt.reason}` : ''}
                            </p>
                          </div>

                          <Link
                            to={`/app/appointments/${appt.id}`}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                            View Appointment
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </AppShellLayout>
  );
}
