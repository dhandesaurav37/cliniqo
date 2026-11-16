import { AlertTriangle, Building2, CheckCircle2, FileWarning } from 'lucide-react';
import type { ClinicRecord, UserProfileRecord } from '../lib/clinicService';
import type { ConsultationRecord, PrescriptionRecord } from '../lib/consultationService';
import type { PatientRecord } from '../lib/patientService';
import type { PrescriptionMedicineItem } from '../lib/prescriptionLogic';

interface PrescriptionDocumentPreviewProps {
  clinic: ClinicRecord;
  doctor: UserProfileRecord | null;
  patient: PatientRecord;
  consultation: Partial<ConsultationRecord>;
  prescription?: Partial<PrescriptionRecord> | null;
  draftMedicines?: PrescriptionMedicineItem[];
  draftGeneralInstructions?: string[];
  draftFollowUpRecommendation?: string;
  draftFollowUpDate?: string;
  draftDoctorAdvice?: string;
}

export function PrescriptionDocumentPreview({
  clinic,
  doctor,
  patient,
  consultation,
  prescription,
  draftMedicines,
  draftGeneralInstructions,
  draftFollowUpRecommendation,
  draftFollowUpDate,
  draftDoctorAdvice,
}: PrescriptionDocumentPreviewProps) {
  const status = prescription?.status || 'draft';
  const isFinalized = status === 'finalized';
  const medicines = draftMedicines ?? prescription?.medicines ?? [];
  const generalInstructions =
    draftGeneralInstructions ?? prescription?.generalInstructions ?? [];
  const followUpRecommendation =
    draftFollowUpRecommendation ?? prescription?.followUpRecommendation ?? '';
  const followUpDate = draftFollowUpDate ?? prescription?.followUpDate ?? '';
  const doctorAdvice = draftDoctorAdvice ?? consultation.doctorAdvice ?? '';

  const docName =
    doctor?.fullName || prescription?.doctorName || consultation.doctorName || 'Doctor';
  const displayDoctorName = `Dr. ${docName.replace(/^Dr\.?\s*/i, '')}`;

  const timestamp =
    prescription?.signedAt || prescription?.updatedAt || prescription?.createdAt;
  const formattedDate = timestamp
    ? timestamp.toDate().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

  const formatGender = (gender?: PatientRecord['gender']) => {
    if (!gender) return '—';
    if (gender === 'male') return 'Male';
    if (gender === 'female') return 'Female';
    return 'Other';
  };

  const obs = consultation.observations || {};
  const vitalsList = [
    obs.bloodPressure ? `BP: ${obs.bloodPressure}` : '',
    obs.pulseRate ? `Pulse: ${obs.pulseRate}` : '',
    obs.temperature ? `Temp: ${obs.temperature}` : '',
    obs.oxygenSaturation ? `SpO2: ${obs.oxygenSaturation}` : '',
    obs.weight ? `Wt: ${obs.weight}` : '',
    obs.height ? `Ht: ${obs.height}` : '',
  ].filter(Boolean);

  const diagList = [consultation.primaryDiagnosis, consultation.additionalDiagnosis]
    .map((d) => d?.trim())
    .filter(Boolean);

  return (
    <div className="a4-prescription-sheet mx-auto w-full max-w-[794px] rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 text-[#0B192C] shadow-sm">
      {/* Status Banner */}
      {isFinalized ? (
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Finalized Prescription · {prescription?.prescriptionNumber || 'Rx'} (v
              {prescription?.version || 1})
            </span>
          </div>
          {prescription?.signedAt && (
            <span className="text-emerald-800 tabular-nums">
              Confirmed {prescription.signedAt.toDate().toLocaleString('en-IN')}
            </span>
          )}
        </div>
      ) : (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <FileWarning className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>UNSIGNED DRAFT — NOT FINALIZED FOR CLINICAL DISPENSING</span>
        </div>
      )}

      {/* Clinic & Doctor Header */}
      <header className="flex flex-col gap-4 border-b-2 border-sky-600 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          {clinic.logoUrl ? (
            <img
              src={clinic.logoUrl}
              alt={`${clinic.name} logo`}
              className="h-14 w-14 rounded-xl border border-slate-200 object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
          )}
          <div className="space-y-0.5">
            <h2 className="font-display text-lg font-bold text-[#0B192C]">{clinic.name}</h2>
            <p className="text-xs text-slate-600 max-w-xs">
              {[clinic.address, clinic.city, clinic.state, clinic.pincode]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="text-xs text-slate-600 tabular-nums">
              Tel: {clinic.phone}
              {clinic.email ? ` · ${clinic.email}` : ''}
            </p>
          </div>
        </div>

        <div className="sm:text-right space-y-0.5">
          <p className="font-display text-base font-bold text-[#0B192C]">{displayDoctorName}</p>
          {(doctor?.qualification || doctor?.specialization) && (
            <p className="text-xs text-slate-600">
              {[doctor?.qualification, doctor?.specialization].filter(Boolean).join(' · ')}
            </p>
          )}
          {doctor?.registrationNumber && (
            <p className="text-xs text-slate-600 tabular-nums">
              Reg. No: {doctor.registrationNumber}
            </p>
          )}
          <p className="pt-1 font-mono text-xs font-semibold text-sky-800 tabular-nums">
            Rx: {prescription?.prescriptionNumber || 'DRAFT'} (v{prescription?.version || 1})
          </p>
        </div>
      </header>

      {/* Patient Demographics & Allergies */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#0B192C]">Patient: {patient.fullName}</p>
            <p className="text-slate-600 tabular-nums">
              ID: <span className="font-mono font-semibold text-[#0B192C]">{patient.patientId}</span>
              {' · '}
              {patient.age !== null && patient.age !== undefined ? `${patient.age} yrs` : 'Age —'}
              {' / '}
              {formatGender(patient.gender)}
              {' · '}
              Date: {formattedDate}
            </p>
          </div>
          {patient.allergies.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-semibold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Allergies: {patient.allergies.join(', ')}</span>
            </div>
          )}
        </div>
      </section>

      {/* Clinical Diagnosis & Observations */}
      {(diagList.length > 0 || vitalsList.length > 0) && (
        <section className="mt-4 space-y-1.5 border-b border-slate-200 pb-4 text-xs">
          {diagList.length > 0 && (
            <p className="text-[#0B192C]">
              <span className="font-bold">Diagnosis: </span>
              <span>{diagList.join(' · ')}</span>
            </p>
          )}
          {vitalsList.length > 0 && (
            <p className="text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-700">Observations: </span>
              <span>{vitalsList.join('  |  ')}</span>
            </p>
          )}
        </section>
      )}

      {/* Rx Medicine Table */}
      <section className="mt-5">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display text-xl font-bold text-sky-700">Rx</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Prescribed Medicines
          </span>
        </div>

        {medicines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">
            No medicines added yet. Select medicines from the prescription builder to preview them
            here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 pl-2 pr-2 w-8">#</th>
                  <th className="py-2.5 pr-3">Medicine &amp; Form</th>
                  <th className="py-2.5 pr-3">Dosage · Frequency · Timing</th>
                  <th className="py-2.5 pr-3">Duration</th>
                  <th className="py-2.5 pr-2 text-right">Dispense Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {medicines.map((med, idx) => (
                  <tr key={med.id} className="align-top">
                    <td className="py-3 pl-2 pr-2 font-mono text-slate-500 tabular-nums">
                      {idx + 1}.
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-[#0B192C]">
                        {med.medicineName || 'Unnamed Medicine'}
                        {med.strength ? ` (${med.strength})` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {[med.dosageForm, med.route].filter(Boolean).join(' · ')}
                        {med.genericName ? ` · ${med.genericName}` : ''}
                      </p>
                      {med.specialInstructions && (
                        <p className="mt-1 text-[11px] italic text-slate-600">
                          Note: {med.specialInstructions}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-[#0B192C]">
                        {med.dosageDisplay} — {med.frequencyLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{med.timing}</p>
                    </td>
                    <td className="py-3 pr-3 text-slate-700 tabular-nums">
                      {med.durationText || 'As directed'}
                    </td>
                    <td className="py-3 pr-2 text-right font-semibold text-[#0B192C] tabular-nums whitespace-nowrap">
                      {med.quantityDisplay || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Instructions & Follow-up */}
      {(generalInstructions.length > 0 ||
        doctorAdvice.trim() ||
        followUpRecommendation.trim() ||
        followUpDate.trim()) && (
        <section className="mt-6 space-y-3 border-t border-slate-200 pt-4 text-xs">
          {(generalInstructions.length > 0 || doctorAdvice.trim()) && (
            <div className="space-y-1.5">
              <p className="font-bold text-[#0B192C]">General Instructions &amp; Advice</p>
              {generalInstructions.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                  {generalInstructions.map((item, i) => (
                    <li key={`${item}-${i}`}>{item}</li>
                  ))}
                </ul>
              )}
              {doctorAdvice.trim() && (
                <p className="text-slate-700 whitespace-pre-wrap pt-1">{doctorAdvice.trim()}</p>
              )}
            </div>
          )}

          {(followUpRecommendation.trim() || followUpDate.trim()) && (
            <div className="rounded-lg bg-sky-50/70 border border-sky-200/70 px-3.5 py-2.5 text-sky-900">
              <span className="font-bold">Follow-up: </span>
              <span>
                {[
                  followUpRecommendation.trim(),
                  followUpDate.trim() ? `Recommended date: ${followUpDate.trim()}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Signature / Confirmation Footer */}
      <footer className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-end sm:justify-between text-[11px] text-slate-500">
        <div className="space-y-1">
          {isFinalized && prescription?.signedAt ? (
            <>
              <p className="font-semibold text-slate-700">
                Confirmed &amp; finalized in Cliniqo by {displayDoctorName} (UID:{' '}
                <span className="font-mono">{prescription.signedByUid || prescription.doctorId}</span>)
              </p>
              <p className="tabular-nums">
                Finalized at {prescription.signedAt.toDate().toLocaleString('en-IN')}
              </p>
            </>
          ) : (
            <p className="font-medium text-amber-800">
              Draft Prescription — requires doctor review and explicit confirmation before finalizing.
            </p>
          )}
          {prescription?.amendmentReason && (
            <p className="text-slate-600">
              Amendment note (v{prescription.version}): {prescription.amendmentReason}
            </p>
          )}
        </div>

        <div className="sm:text-right">
          <div className="inline-block border-t border-slate-300 pt-1.5 min-w-[180px]">
            <p className="font-display text-xs font-bold text-[#0B192C]">{displayDoctorName}</p>
            {doctor?.registrationNumber && (
              <p className="text-[11px] text-slate-600 tabular-nums">
                Reg. No: {doctor.registrationNumber}
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
