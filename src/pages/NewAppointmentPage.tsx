import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { ScheduleAppointmentForm } from '../components/ScheduleAppointmentForm';
import { useAuth } from '../context/AuthContext';
import { isReceptionistAuthorizedToCreate } from '../lib/appointmentService';
import { fetchPatientByIdOrCode, type PatientRecord } from '../lib/patientService';

export function NewAppointmentPage() {
  const { clinic, membership } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const patientParam = searchParams.get('patientId') || '';
  const consultationId = searchParams.get('consultationId') || null;
  const defaultDate = searchParams.get('date') || undefined;
  const defaultReason = searchParams.get('reason') || '';

  const [initialPatient, setInitialPatient] = useState<PatientRecord | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(Boolean(patientParam));

  const authorized = isReceptionistAuthorizedToCreate(clinic, membership?.role);

  useEffect(() => {
    if (!clinic || !patientParam) {
      setLoadingPatient(false);
      return;
    }
    let cancelled = false;
    setLoadingPatient(true);
    fetchPatientByIdOrCode(clinic.id, patientParam)
      .then((res) => {
        if (!cancelled) setInitialPatient(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingPatient(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinic, patientParam]);

  return (
    <AppShellLayout breadcrumb="Schedule Appointment">
      <div className="space-y-6 max-w-4xl">
        <div>
          <Link
            to="/app/appointments"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Appointments
          </Link>
        </div>

        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
            {consultationId ? 'Schedule Follow-up Appointment' : 'Schedule Appointment'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Select a clinic working slot for {clinic?.name}. Availability and doctor schedule
            conflicts are checked automatically.
          </p>
        </div>

        {!authorized ? (
          <div className="lucid-glass rounded-3xl p-8 space-y-4">
            <div className="flex items-center gap-3 text-amber-800">
              <ShieldAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold">
                Receptionist Scheduling Disabled
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              The clinic owner has restricted appointment creation to Doctors. Please ask your
              doctor or clinic administrator to enable receptionist appointment scheduling in Clinic
              Settings.
            </p>
            <Link
              to="/app/appointments"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
            >
              Return to Appointments
            </Link>
          </div>
        ) : loadingPatient ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading patient details...
          </div>
        ) : (
          <section className="lucid-glass rounded-3xl p-6 sm:p-8">
            <ScheduleAppointmentForm
              initialPatient={initialPatient}
              consultationId={consultationId}
              defaultDate={defaultDate}
              defaultReason={defaultReason}
              defaultType={consultationId || initialPatient ? 'follow_up' : 'general'}
              onCancel={() => navigate('/app/appointments')}
              onSuccess={(res) => {
                navigate(`/app/appointments/${res.appointmentId}`);
              }}
            />
          </section>
        )}
      </div>
    </AppShellLayout>
  );
}
