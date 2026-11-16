import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileText,
  History,
  ListPlus,
  Loader2,
  Lock,
  Pencil,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { PatientCommPrefsCard } from '../components/PatientCommPrefsCard';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  APPOINTMENT_STATUS_META,
  formatDateHuman,
  formatTime12h,
} from '../lib/appointmentLogic';
import {
  fetchPatientAppointments,
  isReceptionistAuthorizedToCreate,
  type AppointmentRecord,
} from '../lib/appointmentService';
import {
  createStandaloneConsultation,
  fetchPatientConsultations,
  fetchPatientPrescriptions,
  type ConsultationRecord,
  type PrescriptionRecord,
} from '../lib/consultationService';
import {
  fetchDoctorClinicalNote,
  fetchPatientAuditLogs,
  fetchPatientByIdOrCode,
  setPatientArchiveStatus,
  type DoctorClinicalNoteRecord,
  type PatientAuditLogRecord,
  type PatientRecord,
} from '../lib/patientService';
import {
  addPatientToTodayQueue,
  DEFAULT_CLINIC_TIMEZONE,
  getClinicQueueDate,
  QUEUE_STATUS_META,
  subscribeToDailyQueue,
  type DailyQueueEntryRecord,
} from '../lib/queueService';

export function PatientProfilePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { user, clinic, profile, membership } = useAuth();

  const isDoctorOrOwner = membership?.role === 'owner' || membership?.role === 'doctor';
  const queuePath = isDoctorOrOwner ? '/app/doctor/queue' : '/app/reception/queue';
  const timezone = clinic?.timezone || DEFAULT_CLINIC_TIMEZONE;
  const queueDate = getClinicQueueDate(timezone);

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [doctorNote, setDoctorNote] = useState<DoctorClinicalNoteRecord | null>(null);
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [startingConsultation, setStartingConsultation] = useState(false);
  const [auditLogs, setAuditLogs] = useState<PatientAuditLogRecord[]>([]);
  const [queueEntries, setQueueEntries] = useState<DailyQueueEntryRecord[]>([]);
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!clinic || !patientId) return;
    setLoading(true);
    setError(null);
    try {
      const record = await fetchPatientByIdOrCode(clinic.id, patientId);
      setPatient(record);
      if (record) {
        const [logs, patAppointments] = await Promise.all([
          fetchPatientAuditLogs(clinic.id, record.id),
          fetchPatientAppointments(clinic.id, record.id),
        ]);
        setAuditLogs(logs);
        setAppointments(patAppointments);
        if (isDoctorOrOwner) {
          const [note, patConsultations, patPrescriptions] = await Promise.all([
            fetchDoctorClinicalNote(clinic.id, record.id),
            fetchPatientConsultations(clinic.id, record.id),
            fetchPatientPrescriptions(clinic.id, record.id),
          ]);
          setDoctorNote(note);
          setConsultations(patConsultations);
          setPrescriptions(patPrescriptions);
        }
      }
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load patient profile.'));
    } finally {
      setLoading(false);
    }
  }, [clinic, patientId, isDoctorOrOwner]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!clinic) return;
    const unsub = subscribeToDailyQueue(clinic.id, queueDate, setQueueEntries);
    return () => unsub();
  }, [clinic, queueDate]);

  const activeQueueEntry = useMemo(() => {
    if (!patient) return null;
    return (
      queueEntries.find(
        (e) =>
          e.patientDocumentId === patient.id &&
          ['waiting', 'called', 'in_consultation', 'on_hold'].includes(e.status),
      ) || null
    );
  }, [queueEntries, patient]);

  const handleAddPatientToQueue = async () => {
    if (!clinic || !patient || !user || !membership) return;
    setAddingToQueue(true);
    setError(null);
    setFeedback(null);
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
      setFeedback(`Added ${patient.fullName} to today's queue (Token #${res.tokenLabel}).`);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to add patient to queue.'));
    } finally {
      setAddingToQueue(false);
    }
  };

  const handleStartStandaloneConsultation = async () => {
    if (!clinic || !patient || !user || !isDoctorOrOwner) return;
    setStartingConsultation(true);
    setError(null);
    try {
      const consultationId = await createStandaloneConsultation({
        clinicId: clinic.id,
        patient: { id: patient.id, patientId: patient.patientId },
        doctorUid: user.uid,
        doctorName: profile?.fullName || user.displayName || 'Doctor',
      });
      navigate(`/app/doctor/consultation/${consultationId}`);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to start consultation.'));
      setStartingConsultation(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!clinic || !patient || !user || !membership) return;
    const nextStatus = patient.status === 'active' ? 'archived' : 'active';
    setArchiving(true);
    setError(null);
    try {
      await setPatientArchiveStatus({
        clinicId: clinic.id,
        patient,
        nextStatus,
        actorUid: user.uid,
        actorName: profile?.fullName || user.displayName || 'Clinic Staff',
        actorRole: membership.role,
      });
      setConfirmArchive(false);
      setFeedback(
        nextStatus === 'archived'
          ? `Patient ${patient.patientId} has been archived safely.`
          : `Patient ${patient.patientId} has been restored to active records.`,
      );
      await loadProfile();
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to update patient status.'));
    } finally {
      setArchiving(false);
    }
  };

  const formatTimestamp = (ts?: { toDate: () => Date } | null) =>
    ts
      ? ts.toDate().toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  const formatGender = (gender: PatientRecord['gender']) => {
    if (!gender) return 'Not specified';
    if (gender === 'male') return 'Male';
    if (gender === 'female') return 'Female';
    return 'Other';
  };

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((a) => ['scheduled', 'confirmed', 'reschedule_requested'].includes(a.status))
        .sort((a, b) => a.scheduledAtUtcMs - b.scheduledAtUtcMs),
    [appointments],
  );

  const completedAppointments = useMemo(
    () =>
      appointments
        .filter((a) => ['completed', 'cancelled', 'no_show'].includes(a.status))
        .sort((a, b) => b.scheduledAtUtcMs - a.scheduledAtUtcMs),
    [appointments],
  );

  const canScheduleFollowUp = isReceptionistAuthorizedToCreate(clinic, membership?.role);

  return (
    <AppShellLayout breadcrumb={patient ? patient.patientId : 'Patient Profile'}>
      <div className="space-y-7">
        <div>
          <Link
            to="/app/patients"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Patients
          </Link>
        </div>

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading patient profile...
          </div>
        ) : !patient ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">Patient not found</h1>
            <p className="text-sm text-slate-600">
              No patient record matching &ldquo;{patientId}&rdquo; exists in {clinic?.name}.
            </p>
            <Link
              to="/app/patients"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-[#0B192C] px-5 text-xs font-semibold text-white"
            >
              Return to Patient List
            </Link>
          </div>
        ) : (
          <>
            {feedback && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {feedback}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800"
              >
                {error}
              </div>
            )}

            {/* Profile Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-sky-800 tabular-nums">
                    {patient.patientId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      patient.status === 'active'
                        ? 'font-semibold text-emerald-700'
                        : 'font-semibold text-amber-700'
                    }
                  >
                    {patient.status === 'active' ? 'Active Record' : 'Archived Record'}
                  </span>
                </div>
                <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
                  {patient.fullName}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {patient.status === 'active' && isDoctorOrOwner && (
                  <button
                    type="button"
                    disabled={startingConsultation}
                    onClick={() => void handleStartStandaloneConsultation()}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    {startingConsultation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Start Consultation
                  </button>
                )}
                {patient.status === 'active' && (
                  activeQueueEntry ? (
                    <Link
                      to={queuePath}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap tabular-nums"
                    >
                      In Queue · Token #{activeQueueEntry.tokenLabel} (
                      {QUEUE_STATUS_META[activeQueueEntry.status]?.label})
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={addingToQueue}
                      onClick={() => void handleAddPatientToQueue()}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {addingToQueue ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Add to Today&rsquo;s Queue
                    </button>
                  )
                )}
                {patient.status === 'active' && canScheduleFollowUp && (
                  <Link
                    to={`/app/appointments/new?patientId=${patient.patientId}`}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-semibold text-sky-900 hover:bg-sky-100 whitespace-nowrap"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    Schedule Follow-up
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  {patient.status === 'active' ? (
                    <>
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archive Record
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                      Restore Record
                    </>
                  )}
                </button>
                <Link
                  to={`/app/patients/${patient.patientId}/edit`}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white shadow-sm hover:brightness-105 whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit Information
                </Link>
              </div>
            </div>

            {/* Patient Overview & Medical Information */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className="lg:col-span-6 lucid-glass rounded-3xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#0B192C]">Patient Overview</h2>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-slate-200/70 pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Patient ID</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-[#0B192C] tabular-nums">
                      {patient.patientId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Age &amp; Gender</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                      {patient.age !== null && patient.age !== undefined
                        ? `${patient.age} years`
                        : 'Age not set'}{' '}
                      · {formatGender(patient.gender)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Date of Birth</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                      {patient.dateOfBirth || 'Not provided'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Mobile Number</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                      {patient.mobile}
                    </dd>
                  </div>
                  {patient.alternateMobile && (
                    <div>
                      <dt className="text-xs text-slate-500">Alternate Mobile</dt>
                      <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                        {patient.alternateMobile}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-500">Registration Date</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C] tabular-nums">
                      {formatTimestamp(patient.registrationDate || patient.createdAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Address</dt>
                    <dd className="mt-0.5 font-medium text-[#0B192C]">
                      {[patient.address, patient.city, patient.pincode].filter(Boolean).join(', ') ||
                        'No address provided'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="lg:col-span-6 lucid-glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#0B192C]">
                    Medical Information
                  </h2>
                  {!isDoctorOrOwner && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Doctor-managed
                    </span>
                  )}
                </div>

                <dl className="space-y-4 border-t border-slate-200/70 pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Known Allergies</dt>
                    <dd className="mt-1 font-medium text-[#0B192C]">
                      {patient.allergies.length > 0
                        ? patient.allergies.join(' · ')
                        : 'No known allergies recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Existing Medical Conditions</dt>
                    <dd className="mt-1 font-medium text-[#0B192C]">
                      {patient.existingConditions.length > 0
                        ? patient.existingConditions.join(' · ')
                        : 'None recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Current Medications</dt>
                    <dd className="mt-1 font-medium text-[#0B192C]">
                      {patient.currentMedications.length > 0
                        ? patient.currentMedications.join(' · ')
                        : 'None recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Emergency Contact</dt>
                    <dd className="mt-1 font-medium text-[#0B192C] tabular-nums">
                      {patient.emergencyContact
                        ? `${patient.emergencyContact.name} · ${patient.emergencyContact.mobile}`
                        : 'Not provided'}
                    </dd>
                  </div>
                  {isDoctorOrOwner && (
                    <div>
                      <dt className="text-xs text-slate-500">Additional Medical Notes</dt>
                      <dd className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                        {patient.medicalNotes || 'No intake notes recorded.'}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>

            {clinic && (
              <PatientCommPrefsCard
                compact
                clinicId={clinic.id}
                patientDocId={patient.id}
                patientId={patient.patientId}
                patientName={patient.fullName}
                mobile={patient.mobile}
              />
            )}

            {/* Doctor-Only Clinical Notes (Strictly Hidden & Blocked from Receptionists) */}
            {isDoctorOrOwner && (
              <section className="lucid-glass rounded-3xl p-6 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#0B192C]">
                      Doctor-Only Clinical Notes
                    </h2>
                    <p className="text-xs text-slate-500">
                      Private practitioner observations. Receptionists cannot read or edit these
                      notes.
                    </p>
                  </div>
                  <Link
                    to={`/app/patients/${patient.patientId}/edit`}
                    className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
                  >
                    Update Clinical Notes
                  </Link>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                  {doctorNote?.clinicalNotes || 'No doctor clinical observations recorded yet.'}
                </div>
              </section>
            )}

            {/* Patient History (Structured 4-Module Clinical Timeline) */}
            <section className="lucid-glass rounded-3xl p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-[#0B192C]">Patient History</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Clinical consultations, prescriptions, and appointment timeline for{' '}
                  {patient.fullName}.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Previous Consultations */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[#0B192C]">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-sky-700 shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold">Previous Consultations</h3>
                    </div>
                    {!isDoctorOrOwner && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Doctor-only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Clinical visit notes, diagnosis, and vitals recorded during consultations.
                  </p>
                  {!isDoctorOrOwner ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      Restricted to clinic doctors.
                    </p>
                  ) : consultations.length === 0 ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      No consultations recorded yet.
                    </p>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/60 space-y-2">
                      {consultations.slice(0, 5).map((c) => (
                        <Link
                          key={c.id}
                          to={`/app/doctor/consultation/${c.id}`}
                          className="block rounded-xl border border-slate-200/80 bg-white px-3 py-2 hover:border-sky-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-[#0B192C] truncate">
                              {c.primaryDiagnosis || c.chiefComplaint || 'Clinical Consultation'}
                            </span>
                            <span className="text-[11px] font-semibold text-sky-700 shrink-0">
                              {c.status === 'completed' ? 'Completed' : 'Draft'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            {formatTimestamp(c.completedAt || c.createdAt)} · Dr.{' '}
                            {c.doctorName.replace(/^Dr\.?\s*/i, '')}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Previous Prescriptions */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[#0B192C]">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-sky-700 shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold">Previous Prescriptions</h3>
                    </div>
                    {!isDoctorOrOwner && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Doctor-only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Prescribed medications, versions, and printable A4 Rx documents.
                  </p>
                  {!isDoctorOrOwner ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      Restricted to clinic doctors.
                    </p>
                  ) : prescriptions.length === 0 ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      No prescriptions recorded yet.
                    </p>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/60 space-y-2">
                      {prescriptions.slice(0, 5).map((rx) => (
                        <Link
                          key={rx.id}
                          to={`/app/doctor/prescriptions/${rx.id}`}
                          className="block rounded-xl border border-slate-200/80 bg-white px-3 py-2 hover:border-sky-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono font-semibold text-[#0B192C] tabular-nums">
                              {rx.prescriptionNumber} (v{rx.version})
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                rx.status === 'finalized' ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {rx.status === 'finalized' ? 'Finalized' : 'Draft'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {rx.medicines.length} medicine(s) ·{' '}
                            {formatTimestamp(rx.signedAt || rx.updatedAt || rx.createdAt)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upcoming Appointments */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[#0B192C]">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-sky-700 shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold">Upcoming Appointments</h3>
                    </div>
                    <Link
                      to={`/app/patients/${patient.patientId}/appointments`}
                      className="text-[11px] font-semibold text-sky-700 hover:underline"
                    >
                      View all ({appointments.length})
                    </Link>
                  </div>
                  <p className="text-xs text-slate-500">
                    Scheduled follow-ups, confirmations, and future clinic visits.
                  </p>
                  {upcomingAppointments.length === 0 ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      No upcoming appointments scheduled.
                    </p>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/60 space-y-2">
                      {upcomingAppointments.slice(0, 5).map((appt) => {
                        const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                        return (
                          <Link
                            key={appt.id}
                            to={`/app/appointments/${appt.id}`}
                            className="block rounded-xl border border-slate-200/80 bg-white px-3 py-2 hover:border-sky-300 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-[#0B192C] tabular-nums">
                                {formatDateHuman(appt.appointmentDate)} ·{' '}
                                {formatTime12h(appt.appointmentTime)}
                              </span>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              Dr. {appt.doctorName.replace(/^Dr\.?\s*/i, '')}
                              {appt.reason ? ` · ${appt.reason}` : ''}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Completed / Past Appointments */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[#0B192C]">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-sky-700 shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold">Completed Appointments</h3>
                    </div>
                    <Link
                      to={`/app/patients/${patient.patientId}/appointments`}
                      className="text-[11px] font-semibold text-sky-700 hover:underline"
                    >
                      History
                    </Link>
                  </div>
                  <p className="text-xs text-slate-500">
                    Past completed clinic visits, cancellations, and attendance logs.
                  </p>
                  {completedAppointments.length === 0 ? (
                    <p className="pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-500">
                      No past appointment records yet.
                    </p>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/60 space-y-2">
                      {completedAppointments.slice(0, 5).map((appt) => {
                        const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                        return (
                          <Link
                            key={appt.id}
                            to={`/app/appointments/${appt.id}`}
                            className="block rounded-xl border border-slate-200/80 bg-white px-3 py-2 hover:border-sky-300 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-[#0B192C] tabular-nums">
                                {formatDateHuman(appt.appointmentDate)} ·{' '}
                                {formatTime12h(appt.appointmentTime)}
                              </span>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              Dr. {appt.doctorName.replace(/^Dr\.?\s*/i, '')}
                              {appt.reason ? ` · ${appt.reason}` : ''}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Patient Audit Trail */}
            <section className="lucid-glass-subtle rounded-3xl p-6 space-y-4">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B192C]">
                <History className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Record Audit History
              </h2>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No record activity logged yet.</p>
              ) : (
                <div className="divide-y divide-slate-200/70 text-xs">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-[#0B192C] font-medium">
                        {log.summary} · <span className="text-slate-600">{log.actorName}</span> (
                        {log.actorRole})
                      </p>
                      <span className="text-slate-500 tabular-nums">
                        {formatTimestamp(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Archive / Restore Confirmation Modal */}
      {confirmArchive && patient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !archiving) setConfirmArchive(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-[#0B192C]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-bold">
                {patient.status === 'active'
                  ? 'Archive patient record?'
                  : 'Restore patient record?'}
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">
              {patient.status === 'active'
                ? `${patient.fullName} (${patient.patientId}) will be moved to Archived Records. Audit history is preserved and permanent deletion is disabled.`
                : `${patient.fullName} (${patient.patientId}) will be restored to active clinic patient lists.`}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={archiving}
                onClick={() => setConfirmArchive(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={handleToggleArchive}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {archiving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {patient.status === 'active' ? 'Confirm Archive' : 'Restore Patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShellLayout>
  );
}
