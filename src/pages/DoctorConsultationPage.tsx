import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  History,
  Loader2,
  Plus,
  Save,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { ScheduleAppointmentForm } from '../components/ScheduleAppointmentForm';
import { SmartPrescriptionBuilder } from '../components/SmartPrescriptionBuilder';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  APPOINTMENT_STATUS_META,
  formatDateHuman,
  formatTime12h,
} from '../lib/appointmentLogic';
import {
  fetchConsultationAppointments,
  type AppointmentRecord,
} from '../lib/appointmentService';
import {
  createAmendedPrescriptionDraft,
  fetchConsultationById,
  fetchPatientConsultations,
  fetchPrescriptionsForConsultation,
  fetchPrescriptionTemplates,
  finalizeAndSignPrescription,
  recordPrescriptionPdfAction,
  saveConsultationDraft,
  savePrescriptionDraft,
  savePrescriptionTemplate,
  type ClinicalObservations,
  type ConsultationRecord,
  type PrescriptionRecord,
  type PrescriptionTemplateRecord,
} from '../lib/consultationService';
import { fetchClinicMedicines, type MedicineRecord } from '../lib/medicineService';
import { fetchPatientByIdOrCode, type PatientRecord } from '../lib/patientService';
import {
  evaluatePrescriptionSafety,
  type PrescriptionMedicineItem,
} from '../lib/prescriptionLogic';
import { generatePrescriptionA4Pdf } from '../lib/prescriptionPdf';
import { completeQueueConsultation, fetchQueueEntryById } from '../lib/queueService';

export function DoctorConsultationPage() {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const { user, clinic, profile, membership } = useAuth();

  const [loading, setLoading] = useState(true);
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [previousConsultations, setPreviousConsultations] = useState<ConsultationRecord[]>([]);
  const [clinicMedicines, setClinicMedicines] = useState<MedicineRecord[]>([]);
  const [templates, setTemplates] = useState<PrescriptionTemplateRecord[]>([]);
  const [rxVersions, setRxVersions] = useState<PrescriptionRecord[]>([]);
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);

  // Consultation form state (Sections A - D)
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomInput, setSymptomInput] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('');
  const [additionalSymptoms, setAdditionalSymptoms] = useState('');

  const [observations, setObservations] = useState<ClinicalObservations>({});

  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [additionalDiagnosis, setAdditionalDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const [examinationFindings, setExaminationFindings] = useState('');
  const [doctorAdvice, setDoctorAdvice] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Active prescription state
  const [rxMedicines, setRxMedicines] = useState<PrescriptionMedicineItem[]>([]);
  const [generalInstructions, setGeneralInstructions] = useState<string[]>([]);
  const [followUpRecommendation, setFollowUpRecommendation] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Status & Modals
  const [savingConsultation, setSavingConsultation] = useState(false);
  const [completingConsultation, setCompletingConsultation] = useState(false);
  const [savingRxDraft, setSavingRxDraft] = useState(false);
  const [signingRx, setSigningRx] = useState(false);

  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [creatingAmendment, setCreatingAmendment] = useState(false);

  const [linkedAppointments, setLinkedAppointments] = useState<AppointmentRecord[]>([]);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actorName = profile?.fullName || user?.displayName || 'Doctor';

  const activePrescription = useMemo(
    () => rxVersions.find((r) => r.id === selectedRxId) || rxVersions[0] || null,
    [rxVersions, selectedRxId],
  );

  const syncPrescriptionEditorState = useCallback((rx: PrescriptionRecord | null) => {
    if (!rx) {
      setRxMedicines([]);
      setGeneralInstructions([]);
      setFollowUpRecommendation('');
      setFollowUpDate('');
      return;
    }
    setRxMedicines(rx.medicines || []);
    setGeneralInstructions(rx.generalInstructions || []);
    setFollowUpRecommendation(rx.followUpRecommendation || '');
    setFollowUpDate(rx.followUpDate || '');
  }, []);

  const reloadMedicines = useCallback(async () => {
    if (!clinic) return;
    const meds = await fetchClinicMedicines(clinic.id);
    setClinicMedicines(meds);
  }, [clinic]);

  const loadAll = useCallback(async () => {
    if (!clinic || !consultationId) return;
    setLoading(true);
    setError(null);
    try {
      const record = await fetchConsultationById(clinic.id, consultationId);
      if (!record) {
        setConsultation(null);
        setLoading(false);
        return;
      }
      setConsultation(record);

      // Hydrate form inputs
      setChiefComplaint(record.chiefComplaint || '');
      setSymptoms(record.symptoms || []);
      setSymptomDuration(record.symptomDuration || '');
      setAdditionalSymptoms(record.additionalSymptoms || '');
      setObservations(record.observations || {});
      setPrimaryDiagnosis(record.primaryDiagnosis || '');
      setAdditionalDiagnosis(record.additionalDiagnosis || '');
      setClinicalNotes(record.clinicalNotes || '');
      setExaminationFindings(record.examinationFindings || '');
      setDoctorAdvice(record.doctorAdvice || '');
      setAdditionalInstructions(record.additionalInstructions || '');

      const [pat, history, meds, tpls, prescriptions, linkedAppts] = await Promise.all([
        fetchPatientByIdOrCode(clinic.id, record.patientDocumentId || record.patientId),
        fetchPatientConsultations(clinic.id, record.patientDocumentId),
        fetchClinicMedicines(clinic.id),
        fetchPrescriptionTemplates(clinic.id),
        fetchPrescriptionsForConsultation(clinic.id, record.id),
        fetchConsultationAppointments(clinic.id, record.id),
      ]);

      setPatient(pat);
      setPreviousConsultations(history.filter((c) => c.id !== record.id));
      setClinicMedicines(meds);
      setTemplates(tpls);
      setRxVersions(prescriptions);
      setLinkedAppointments(linkedAppts);

      if (prescriptions.length > 0) {
        const latest = prescriptions[0];
        setSelectedRxId(latest.id);
        syncPrescriptionEditorState(latest);
      } else {
        setSelectedRxId(null);
        syncPrescriptionEditorState(null);
      }
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load consultation workspace.'));
    } finally {
      setLoading(false);
    }
  }, [clinic, consultationId, syncPrescriptionEditorState]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const previousVisitDate = useMemo(() => {
    const prior = previousConsultations.find((c) => c.completedAt || c.createdAt);
    const ts = prior?.completedAt || prior?.createdAt;
    if (!ts) return 'First visit';
    return ts.toDate().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [previousConsultations]);

  const handleSelectVersion = (rx: PrescriptionRecord) => {
    setSelectedRxId(rx.id);
    syncPrescriptionEditorState(rx);
  };

  const handleAddSymptomTag = () => {
    const clean = symptomInput.trim();
    if (!clean) return;
    if (!symptoms.includes(clean)) {
      setSymptoms((prev) => [...prev, clean]);
    }
    setSymptomInput('');
  };

  const buildConsultationInput = () => ({
    chiefComplaint,
    symptoms,
    symptomDuration,
    additionalSymptoms,
    observations,
    primaryDiagnosis,
    additionalDiagnosis,
    diagnoses: primaryDiagnosis.trim() ? [primaryDiagnosis.trim()] : [],
    clinicalNotes,
    examinationFindings,
    doctorAdvice,
    additionalInstructions,
  });

  const handleSaveConsultation = async (markCompleted: boolean) => {
    if (!clinic || !consultation) return;
    await saveConsultationDraft({
      clinicId: clinic.id,
      consultationId: consultation.id,
      input: buildConsultationInput(),
      markCompleted,
    });
    const updated = await fetchConsultationById(clinic.id, consultation.id);
    if (updated) setConsultation(updated);
  };

  const handleSaveConsultationDraftClick = async () => {
    setSavingConsultation(true);
    setError(null);
    setFeedback(null);
    try {
      await handleSaveConsultation(consultation?.status === 'completed');
      setFeedback('Clinical consultation notes saved.');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save consultation.'));
    } finally {
      setSavingConsultation(false);
    }
  };

  const handleSavePrescriptionDraft = async (): Promise<string | null> => {
    if (!clinic || !consultation || !user || !membership || !patient) return null;
    if (activePrescription?.status === 'finalized') return activePrescription.id;

    setSavingRxDraft(true);
    setError(null);
    setFeedback(null);
    try {
      const warnings = evaluatePrescriptionSafety({
        medicines: rxMedicines,
        patientAllergies: patient.allergies,
        generalInstructions,
      }).map((w) => w.message);

      const savedId = await savePrescriptionDraft({
        clinicId: clinic.id,
        prescriptionId: activePrescription?.id || null,
        consultation,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        medicines: rxMedicines,
        generalInstructions,
        followUpRecommendation,
        followUpDate,
        allergyWarningsSnapshot: warnings,
      });

      const refreshed = await fetchPrescriptionsForConsultation(clinic.id, consultation.id);
      setRxVersions(refreshed);
      setSelectedRxId(savedId);
      const latest = refreshed.find((r) => r.id === savedId) || refreshed[0] || null;
      syncPrescriptionEditorState(latest);
      setFeedback('Prescription draft saved.');
      return savedId;
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save prescription draft.'));
      return null;
    } finally {
      setSavingRxDraft(false);
    }
  };

  const handleFinalizeAndSign = async () => {
    if (!clinic || !consultation || !user || !membership || !patient) return;
    setSigningRx(true);
    setError(null);
    setFeedback(null);
    try {
      // Save consultation context too so preview/PDF captures diagnosis & observations
      await handleSaveConsultation(consultation.status === 'completed');

      const warnings = evaluatePrescriptionSafety({
        medicines: rxMedicines,
        patientAllergies: patient.allergies,
        generalInstructions,
      }).map((w) => w.message);

      let targetRxId = activePrescription?.id || null;
      if (!targetRxId) {
        targetRxId = await savePrescriptionDraft({
          clinicId: clinic.id,
          prescriptionId: null,
          consultation,
          doctorUid: user.uid,
          doctorName: actorName,
          actorRole: membership.role,
          medicines: rxMedicines,
          generalInstructions,
          followUpRecommendation,
          followUpDate,
          allergyWarningsSnapshot: warnings,
        });
      }

      await finalizeAndSignPrescription({
        clinicId: clinic.id,
        prescriptionId: targetRxId,
        consultation,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        medicines: rxMedicines,
        generalInstructions,
        followUpRecommendation,
        followUpDate,
        allergyWarningsSnapshot: warnings,
      });

      const refreshed = await fetchPrescriptionsForConsultation(clinic.id, consultation.id);
      setRxVersions(refreshed);
      setSelectedRxId(targetRxId);
      const finalizedRx = refreshed.find((r) => r.id === targetRxId) || null;
      syncPrescriptionEditorState(finalizedRx);
      setFeedback('Prescription signed, finalized, and locked cleanly.');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to finalize prescription.'));
    } finally {
      setSigningRx(false);
    }
  };

  const handleSaveAsTemplate = async (name: string, description: string) => {
    if (!clinic || !user) return;
    setError(null);
    try {
      await savePrescriptionTemplate({
        clinicId: clinic.id,
        name,
        description,
        medicines: rxMedicines,
        generalInstructions,
        followUpRecommendation,
        doctorUid: user.uid,
        doctorName: actorName,
      });
      const nextTpls = await fetchPrescriptionTemplates(clinic.id);
      setTemplates(nextTpls);
      setFeedback(`Saved reusable template "${name}".`);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save template.'));
    }
  };

  const handleDownloadPdf = async () => {
    if (!clinic || !patient || !consultation || !activePrescription || !user || !membership) return;
    generatePrescriptionA4Pdf({
      clinic,
      doctor: profile,
      patient,
      consultation: {
        ...consultation,
        ...buildConsultationInput(),
      },
      prescription: activePrescription,
    });
    await recordPrescriptionPdfAction({
      clinicId: clinic.id,
      prescription: activePrescription,
      doctorUid: user.uid,
      doctorName: actorName,
      actorRole: membership.role,
      mode: 'download',
    });
  };

  const handlePrint = async () => {
    if (!clinic || !activePrescription || !user || !membership) return;
    window.print();
    await recordPrescriptionPdfAction({
      clinicId: clinic.id,
      prescription: activePrescription,
      doctorUid: user.uid,
      doctorName: actorName,
      actorRole: membership.role,
      mode: 'print',
    });
  };

  const handleCreateAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !consultation || !activePrescription || !user || !membership) return;
    setCreatingAmendment(true);
    setError(null);
    try {
      const newDraftId = await createAmendedPrescriptionDraft({
        clinicId: clinic.id,
        parentPrescription: activePrescription,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        reason: amendReason,
      });
      const refreshed = await fetchPrescriptionsForConsultation(clinic.id, consultation.id);
      setRxVersions(refreshed);
      setSelectedRxId(newDraftId);
      const nextDraft = refreshed.find((r) => r.id === newDraftId) || null;
      syncPrescriptionEditorState(nextDraft);
      setShowAmendModal(false);
      setAmendReason('');
      setFeedback(
        `Created editable amendment draft v${nextDraft?.version || activePrescription.version + 1}. Original v${activePrescription.version} remains locked.`,
      );
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to create amendment.'));
    } finally {
      setCreatingAmendment(false);
    }
  };

  const handleCompleteConsultation = async () => {
    if (!clinic || !consultation || !user || !membership) return;
    setCompletingConsultation(true);
    setError(null);
    setFeedback(null);
    try {
      // Save latest clinical consultation inputs and mark consultation completed
      await handleSaveConsultation(true);

      // Persist draft prescription changes if there's an un-finalized draft with content
      if (
        (!activePrescription || activePrescription.status === 'draft') &&
        (rxMedicines.length > 0 || generalInstructions.length > 0) &&
        patient
      ) {
        const warnings = evaluatePrescriptionSafety({
          medicines: rxMedicines,
          patientAllergies: patient.allergies,
          generalInstructions,
        }).map((w) => w.message);
        const savedId = await savePrescriptionDraft({
          clinicId: clinic.id,
          prescriptionId: activePrescription?.id || null,
          consultation,
          doctorUid: user.uid,
          doctorName: actorName,
          actorRole: membership.role,
          medicines: rxMedicines,
          generalInstructions,
          followUpRecommendation,
          followUpDate,
          allergyWarningsSnapshot: warnings,
        });
        const refreshed = await fetchPrescriptionsForConsultation(clinic.id, consultation.id);
        setRxVersions(refreshed);
        setSelectedRxId(savedId);
      }

      // Sync linked daily queue item to Completed if it is currently In Consultation
      if (consultation.queueEntryId && consultation.queueDate) {
        const queueEntry = await fetchQueueEntryById(
          clinic.id,
          consultation.queueDate,
          consultation.queueEntryId,
        );
        if (queueEntry && queueEntry.status === 'in_consultation') {
          await completeQueueConsultation({
            clinicId: clinic.id,
            clinicOwnerId: clinic.ownerId,
            entry: queueEntry,
            actorUid: user.uid,
            actorName,
            actorRole: membership.role,
          });
        }
      }

      setFeedback('Consultation marked as Completed and queue status updated.');
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to complete consultation.'));
    } finally {
      setCompletingConsultation(false);
    }
  };

  const formatGender = (gender?: PatientRecord['gender'] | null) => {
    if (!gender) return '—';
    if (gender === 'male') return 'Male';
    if (gender === 'female') return 'Female';
    return 'Other';
  };

  return (
    <AppShellLayout breadcrumb="Consultation">
      <div className="space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/app/doctor/queue"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Today&rsquo;s Queue
          </Link>

          {patient && (
            <Link
              to={`/app/patients/${patient.patientId}`}
              className="text-xs font-semibold text-[#0B192C] hover:text-sky-700 hover:underline"
            >
              Open Full Patient Profile ({patient.patientId})
            </Link>
          )}
        </div>

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading clinical consultation workspace...
          </div>
        ) : !consultation || !patient || !clinic ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">
              Consultation record not found
            </h1>
            <p className="text-sm text-slate-600">
              This consultation could not be found in your clinic workspace.
            </p>
            <button
              type="button"
              onClick={() => navigate('/app/doctor/queue')}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white cursor-pointer"
            >
              Return to Live Queue
            </button>
          </div>
        ) : (
          <>
            {/* Top Patient Clinical Banner */}
            <section className="no-print lucid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0891B2] text-white shrink-0">
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B192C]">
                        {patient.fullName}
                      </h1>
                      <span className="font-mono text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2 py-0.5 tabular-nums">
                        {patient.patientId}
                      </span>
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                          consultation.status === 'completed'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {consultation.status === 'completed' ? 'Completed' : 'In Progress (Draft)'}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span>
                        {patient.age !== null && patient.age !== undefined
                          ? `${patient.age} years`
                          : 'Age —'}{' '}
                        · {formatGender(patient.gender)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Mobile: {patient.mobile}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-sky-700" aria-hidden="true" />
                        Previous visit: <strong className="text-[#0B192C]">{previousVisitDate}</strong>
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingConsultation || completingConsultation}
                    onClick={() => void handleSaveConsultationDraftClick()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    {savingConsultation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    )}
                    Save Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-semibold text-sky-900 hover:bg-sky-100 cursor-pointer"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    Schedule Follow-up
                  </button>

                  <button
                    type="button"
                    disabled={completingConsultation || savingConsultation}
                    onClick={() => void handleCompleteConsultation()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {completingConsultation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Complete Consultation
                  </button>
                </div>
              </div>

              {/* Allergies + Background Conditions Strip */}
              <div className="grid grid-cols-1 gap-3 border-t border-slate-200/70 pt-3.5 md:grid-cols-3 text-xs">
                <div
                  className={`rounded-xl border px-3.5 py-2.5 ${
                    patient.allergies.length > 0
                      ? 'border-rose-200 bg-rose-50 text-rose-900'
                      : 'border-slate-200/70 bg-white/80 text-slate-600'
                  }`}
                >
                  <p className="font-semibold flex items-center gap-1.5">
                    {patient.allergies.length > 0 && (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-700" aria-hidden="true" />
                    )}
                    Known Allergies
                  </p>
                  <p className="mt-0.5 font-medium">
                    {patient.allergies.length > 0
                      ? patient.allergies.join(', ')
                      : 'No known allergies recorded'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/70 bg-white/80 px-3.5 py-2.5 text-slate-700">
                  <p className="font-semibold text-slate-500">Existing Medical Conditions</p>
                  <p className="mt-0.5 font-medium text-[#0B192C]">
                    {patient.existingConditions.length > 0
                      ? patient.existingConditions.join(', ')
                      : 'None recorded'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/70 bg-white/80 px-3.5 py-2.5 text-slate-700">
                  <p className="font-semibold text-slate-500">Current Medications</p>
                  <p className="mt-0.5 font-medium text-[#0B192C]">
                    {patient.currentMedications.length > 0
                      ? patient.currentMedications.join(', ')
                      : 'None recorded'}
                  </p>
                </div>
              </div>

              {linkedAppointments.length > 0 && (
                <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#0B192C]">
                      <CalendarClock className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                      Scheduled Follow-up Appointments ({linkedAppointments.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFollowUpModal(true)}
                      className="text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                    >
                      + Schedule another
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {linkedAppointments.map((appt) => {
                      const statusMeta = APPOINTMENT_STATUS_META[appt.status];
                      return (
                        <Link
                          key={appt.id}
                          to={`/app/appointments/${appt.id}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#0B192C] hover:border-sky-300 tabular-nums"
                        >
                          <span>
                            {formatDateHuman(appt.appointmentDate)} · {formatTime12h(appt.appointmentTime)}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {previousConsultations.length > 0 && (
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/75 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-[#0B192C]">
                    <History className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                    <span>Recent Previous Consultations ({previousConsultations.length})</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {previousConsultations.slice(0, 2).map((prev) => {
                      const d = (prev.completedAt || prev.createdAt)
                        ?.toDate()
                        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                      return (
                        <Link
                          key={prev.id}
                          to={`/app/doctor/consultation/${prev.id}`}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-sky-300 transition-colors"
                        >
                          <p className="font-semibold text-[#0B192C] tabular-nums">
                            {d || 'Visit'} · {prev.primaryDiagnosis || prev.chiefComplaint || 'Consultation'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {prev.clinicalNotes || prev.doctorAdvice || 'Click to view visit record'}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {feedback && (
              <div
                role="status"
                className="no-print flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{feedback}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="no-print flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Consultation Clinical Sections A - D */}
            <div className="no-print grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* A. Chief Complaints */}
              <section className="lg:col-span-6 lucid-glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-[#0B192C]">
                    A. Chief Complaints &amp; Symptoms
                  </h2>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Main Complaint
                  </label>
                  <input
                    type="text"
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="e.g., Fever and sore throat"
                    className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Duration</label>
                  <input
                    type="text"
                    value={symptomDuration}
                    onChange={(e) => setSymptomDuration(e.target.value)}
                    placeholder="e.g., 3 days"
                    className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Recorded Symptom Tags
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      value={symptomInput}
                      onChange={(e) => setSymptomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSymptomTag();
                        }
                      }}
                      placeholder="Add symptom and press Enter (e.g., Dry cough)"
                      className="flex-1 min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0B192C]"
                    />
                    <button
                      type="button"
                      onClick={handleAddSymptomTag}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add
                    </button>
                  </div>
                  {symptoms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {symptoms.map((sym, idx) => (
                        <span
                          key={`${sym}-${idx}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900"
                        >
                          {sym}
                          <button
                            type="button"
                            onClick={() =>
                              setSymptoms((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`Remove ${sym}`}
                            className="text-sky-700 hover:text-rose-700 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Additional Symptoms
                  </label>
                  <textarea
                    rows={2}
                    value={additionalSymptoms}
                    onChange={(e) => setAdditionalSymptoms(e.target.value)}
                    placeholder="Additional symptom details or patient narrative..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
                  />
                </div>
              </section>

              {/* B. Clinical Observations */}
              <section className="lg:col-span-6 lucid-glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-[#0B192C]">
                    B. Clinical Observations (Optional Vitals)
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Blood Pressure
                    </label>
                    <input
                      type="text"
                      value={observations.bloodPressure || ''}
                      onChange={(e) =>
                        setObservations((p) => ({ ...p, bloodPressure: e.target.value }))
                      }
                      placeholder="120/80 mmHg"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Pulse Rate
                    </label>
                    <input
                      type="text"
                      value={observations.pulseRate || ''}
                      onChange={(e) =>
                        setObservations((p) => ({ ...p, pulseRate: e.target.value }))
                      }
                      placeholder="76 bpm"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Temperature
                    </label>
                    <input
                      type="text"
                      value={observations.temperature || ''}
                      onChange={(e) =>
                        setObservations((p) => ({ ...p, temperature: e.target.value }))
                      }
                      placeholder="98.6 °F"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Oxygen Saturation
                    </label>
                    <input
                      type="text"
                      value={observations.oxygenSaturation || ''}
                      onChange={(e) =>
                        setObservations((p) => ({ ...p, oxygenSaturation: e.target.value }))
                      }
                      placeholder="99%"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Weight</label>
                    <input
                      type="text"
                      value={observations.weight || ''}
                      onChange={(e) => setObservations((p) => ({ ...p, weight: e.target.value }))}
                      placeholder="68 kg"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Height</label>
                    <input
                      type="text"
                      value={observations.height || ''}
                      onChange={(e) => setObservations((p) => ({ ...p, height: e.target.value }))}
                      placeholder="172 cm"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0B192C] tabular-nums"
                    />
                  </div>
                </div>

                {/* C. Diagnosis inside right column */}
                <div className="border-t border-slate-200/70 pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    <h2 className="font-display text-base font-bold text-[#0B192C]">
                      C. Diagnosis
                    </h2>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Primary Diagnosis
                    </label>
                    <input
                      type="text"
                      value={primaryDiagnosis}
                      onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                      placeholder="e.g., Acute Viral Pharyngitis"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Additional Diagnosis (Optional)
                    </label>
                    <input
                      type="text"
                      value={additionalDiagnosis}
                      onChange={(e) => setAdditionalDiagnosis(e.target.value)}
                      placeholder="Secondary or differential note"
                      className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                    />
                  </div>
                </div>
              </section>

              {/* D. Doctor's Notes */}
              <section className="lg:col-span-12 lucid-glass rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-sky-700" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-[#0B192C]">
                    D. Examination Findings, Clinical Notes &amp; Doctor Advice
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Examination Findings
                    </label>
                    <textarea
                      rows={3}
                      value={examinationFindings}
                      onChange={(e) => setExaminationFindings(e.target.value)}
                      placeholder="Physical exam findings (throat, chest auscultation, etc.)"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Clinical Notes (Doctor-Only)
                    </label>
                    <textarea
                      rows={3}
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="Private clinical assessment notes..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Doctor Advice (Printed on Prescription)
                    </label>
                    <textarea
                      rows={2}
                      value={doctorAdvice}
                      onChange={(e) => setDoctorAdvice(e.target.value)}
                      placeholder="e.g., Warm saline gargles twice daily; avoid cold beverages"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Additional Internal Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={additionalInstructions}
                      onChange={(e) => setAdditionalInstructions(e.target.value)}
                      placeholder="Follow-up context or internal reminders..."
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* Prescription Version Switcher (if multiple versions exist) */}
            {rxVersions.length > 0 && (
              <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Prescription Versions:
                  </span>
                  {rxVersions.map((ver) => (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => handleSelectVersion(ver)}
                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold cursor-pointer tabular-nums ${
                        activePrescription?.id === ver.id
                          ? 'border-sky-300 bg-sky-50 text-sky-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>v{ver.version}</span>
                      <span>·</span>
                      <span>{ver.status === 'finalized' ? 'Finalized' : 'Draft'}</span>
                    </button>
                  ))}
                </div>

                {activePrescription && (
                  <Link
                    to={`/app/doctor/prescriptions/${activePrescription.id}`}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Open Prescription Document ({activePrescription.prescriptionNumber})
                  </Link>
                )}
              </div>
            )}

            {/* Embedded Smart Prescription Builder */}
            <SmartPrescriptionBuilder
              clinic={clinic}
              doctor={profile}
              actorUid={user?.uid || ''}
              patient={patient}
              consultation={{
                ...consultation,
                ...buildConsultationInput(),
              }}
              activePrescription={activePrescription}
              clinicMedicines={clinicMedicines}
              onMedicinesCatalogReload={reloadMedicines}
              templates={templates}
              medicines={rxMedicines}
              onChangeMedicines={setRxMedicines}
              generalInstructions={generalInstructions}
              onChangeGeneralInstructions={setGeneralInstructions}
              followUpRecommendation={followUpRecommendation}
              onChangeFollowUpRecommendation={setFollowUpRecommendation}
              followUpDate={followUpDate}
              onChangeFollowUpDate={setFollowUpDate}
              doctorAdvice={doctorAdvice}
              savingDraft={savingRxDraft}
              signingPrescription={signingRx}
              onSaveDraft={async () => {
                await handleSavePrescriptionDraft();
              }}
              onFinalizeAndSign={handleFinalizeAndSign}
              onSaveAsTemplate={handleSaveAsTemplate}
              onDownloadPdf={handleDownloadPdf}
              onPrint={handlePrint}
              onOpenAmendmentModal={() => setShowAmendModal(true)}
            />
          </>
        )}
      </div>

      {/* Create Amendment Modal */}
      {showAmendModal && activePrescription && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creatingAmendment) setShowAmendModal(false);
          }}
        >
          <form
            onSubmit={handleCreateAmendment}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-[#0B192C]">
              Create Amended Prescription (v{activePrescription.version + 1})
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Original prescription <strong>{activePrescription.prescriptionNumber}</strong> remains
              permanently locked. This creates an editable draft v{activePrescription.version + 1}{' '}
              linked to the original record and logs the change in the audit trail.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Amendment Reason *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                placeholder="e.g., Adjusted antibiotic strength based on follow-up tolerance"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={creatingAmendment}
                onClick={() => setShowAmendModal(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingAmendment || amendReason.trim().length < 3}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {creatingAmendment && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                Create Draft v{activePrescription.version + 1}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule Follow-up Appointment Modal */}
      {showFollowUpModal && patient && consultation && clinic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Schedule Follow-up Appointment"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFollowUpModal(false);
          }}
        >
          <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 border border-sky-200 text-sky-700">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0B192C]">
                    Schedule Follow-up Appointment
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pre-filled from consultation for {patient.fullName} ({patient.patientId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFollowUpModal(false)}
                aria-label="Close follow-up form"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ScheduleAppointmentForm
              initialPatient={patient}
              consultationId={consultation.id}
              defaultDate={followUpDate || undefined}
              defaultReason={followUpRecommendation || primaryDiagnosis || chiefComplaint}
              defaultType="follow_up"
              onCancel={() => setShowFollowUpModal(false)}
              onSuccess={async (res) => {
                setShowFollowUpModal(false);
                if (!followUpDate) {
                  setFollowUpDate(res.appointmentDate);
                }
                const refreshed = await fetchConsultationAppointments(clinic.id, consultation.id);
                setLinkedAppointments(refreshed);
                setFeedback(
                  `Follow-up scheduled for ${formatDateHuman(res.appointmentDate)} at ${formatTime12h(res.appointmentTime)}. ${res.whatsappMessage}`,
                );
              }}
            />
          </div>
        </div>
      )}
    </AppShellLayout>
  );
}
