import {
  ArrowLeft,
  Download,
  FilePlus2,
  History,
  Loader2,
  Printer,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShellLayout } from '../components/AppShellLayout';
import { PrescriptionDocumentPreview } from '../components/PrescriptionDocumentPreview';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  createAmendedPrescriptionDraft,
  fetchConsultationById,
  fetchPrescriptionAuditLogs,
  fetchPrescriptionById,
  fetchPrescriptionsForConsultation,
  recordPrescriptionPdfAction,
  type ConsultationRecord,
  type PrescriptionAuditLogRecord,
  type PrescriptionRecord,
} from '../lib/consultationService';
import { fetchPatientByIdOrCode, type PatientRecord } from '../lib/patientService';
import { generatePrescriptionA4Pdf } from '../lib/prescriptionPdf';

export function PrescriptionDetailPage() {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const navigate = useNavigate();
  const { user, clinic, profile, membership } = useAuth();

  const [loading, setLoading] = useState(true);
  const [prescription, setPrescription] = useState<PrescriptionRecord | null>(null);
  const [consultation, setConsultation] = useState<ConsultationRecord | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [allVersions, setAllVersions] = useState<PrescriptionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<PrescriptionAuditLogRecord[]>([]);

  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [creatingAmendment, setCreatingAmendment] = useState(false);
  const [amendError, setAmendError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actorName = profile?.fullName || user?.displayName || 'Doctor';

  const loadDetail = useCallback(async () => {
    if (!clinic || !prescriptionId) return;
    setLoading(true);
    setError(null);
    try {
      const rx = await fetchPrescriptionById(clinic.id, prescriptionId);
      setPrescription(rx);
      if (!rx) {
        setLoading(false);
        return;
      }

      const [consult, pat, versions, logs] = await Promise.all([
        fetchConsultationById(clinic.id, rx.consultationId),
        fetchPatientByIdOrCode(clinic.id, rx.patientDocumentId || rx.patientId),
        fetchPrescriptionsForConsultation(clinic.id, rx.consultationId),
        fetchPrescriptionAuditLogs(clinic.id, rx.id),
      ]);

      setConsultation(consult);
      setPatient(pat);
      setAllVersions(versions);
      setAuditLogs(logs);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to load prescription document.'));
    } finally {
      setLoading(false);
    }
  }, [clinic, prescriptionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!showAmendModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creatingAmendment) setShowAmendModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAmendModal, creatingAmendment]);

  const handleDownloadPdf = async () => {
    if (!clinic || !patient || !consultation || !prescription || !user || !membership) return;
    setError(null);
    try {
      generatePrescriptionA4Pdf({
        clinic,
        doctor: profile,
        patient,
        consultation,
        prescription,
      });
      await recordPrescriptionPdfAction({
        clinicId: clinic.id,
        prescription,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        mode: 'download',
      });
      const logs = await fetchPrescriptionAuditLogs(clinic.id, prescription.id);
      setAuditLogs(logs);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to generate or record prescription PDF.'));
    }
  };

  const handlePrint = async () => {
    if (!clinic || !prescription || !user || !membership) return;
    setError(null);
    try {
      window.print();
      await recordPrescriptionPdfAction({
        clinicId: clinic.id,
        prescription,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        mode: 'print',
      });
      const logs = await fetchPrescriptionAuditLogs(clinic.id, prescription.id);
      setAuditLogs(logs);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to log print action.'));
    }
  };

  const handleCreateAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !prescription || !user || !membership) return;
    if (amendReason.trim().length < 3) {
      setAmendError('Please enter a brief amendment reason (at least 3 characters).');
      return;
    }
    setCreatingAmendment(true);
    setAmendError(null);
    try {
      await createAmendedPrescriptionDraft({
        clinicId: clinic.id,
        parentPrescription: prescription,
        doctorUid: user.uid,
        doctorName: actorName,
        actorRole: membership.role,
        reason: amendReason.trim(),
      });
      setShowAmendModal(false);
      navigate(`/app/doctor/consultation/${prescription.consultationId}`);
    } catch (err: unknown) {
      setAmendError(getUserFriendlyErrorMessage(err, 'Unable to create amendment.'));
      setCreatingAmendment(false);
    }
  };

  return (
    <AppShellLayout breadcrumb={prescription ? prescription.prescriptionNumber : 'Prescription'}>
      <div className="space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/app/doctor/prescriptions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Prescriptions
          </Link>

          {prescription && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/app/doctor/consultation/${prescription.consultationId}`}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50"
              >
                <Stethoscope className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                Open Consultation
              </Link>
              <button
                type="button"
                onClick={() => void handlePrint()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                Print A4
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download A4 PDF
              </button>
              {prescription.status === 'finalized' && (
                <button
                  type="button"
                  onClick={() => {
                    setAmendError(null);
                    setShowAmendModal(true);
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Amend (v{prescription.version + 1})
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="no-print rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs sm:text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="lucid-glass rounded-3xl p-8 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
            Loading prescription document...
          </div>
        ) : !prescription || !patient || !consultation || !clinic ? (
          <div className="lucid-glass rounded-3xl p-8 text-center space-y-3">
            <h1 className="font-display text-xl font-bold text-[#0B192C]">
              Prescription not found
            </h1>
            <Link
              to="/app/doctor/prescriptions"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white"
            >
              Return to Prescriptions
            </Link>
          </div>
        ) : (
          <>
            {allVersions.length > 1 && (
              <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-xs">
                <span className="font-semibold text-slate-600">All Versions:</span>
                {allVersions.map((ver) => (
                  <Link
                    key={ver.id}
                    to={`/app/doctor/prescriptions/${ver.id}`}
                    className={`rounded-lg border px-2.5 py-1 font-semibold tabular-nums ${
                      ver.id === prescription.id
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    v{ver.version} ({ver.status === 'finalized' ? 'Finalized' : 'Draft'})
                  </Link>
                ))}
              </div>
            )}

            <PrescriptionDocumentPreview
              clinic={clinic}
              doctor={profile}
              patient={patient}
              consultation={consultation}
              prescription={prescription}
            />

            {/* Audit History */}
            <section className="no-print lucid-glass-subtle rounded-3xl p-6 space-y-3">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-[#0B192C]">
                <History className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Prescription Audit Trail
              </h2>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No prescription events logged yet.</p>
              ) : (
                <div className="divide-y divide-slate-200/70 text-xs">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-[#0B192C]">
                          {log.summary} · <span className="text-slate-600">{log.actorName}</span>
                        </p>
                        {log.reason && (
                          <p className="text-[11px] text-slate-500">Reason: {log.reason}</p>
                        )}
                      </div>
                      <span className="text-slate-500 tabular-nums">
                        {log.createdAt?.toDate().toLocaleString('en-IN') || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showAmendModal && prescription && (
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
              Create Amended Prescription (v{prescription.version + 1})
            </h3>
            <p className="text-xs text-slate-600">
              Original {prescription.prescriptionNumber} remains locked and immutable. Creating an
              amendment opens an editable draft v{prescription.version + 1} inside the consultation
              workspace.
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
                placeholder="e.g., Adjusted dosage duration per follow-up assessment"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3 text-sm text-[#0B192C]"
              />
            </div>

            {amendError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                {amendError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={creatingAmendment}
                onClick={() => setShowAmendModal(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingAmendment || amendReason.trim().length < 3}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white cursor-pointer"
              >
                {creatingAmendment && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                Create Draft v{prescription.version + 1}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShellLayout>
  );
}
