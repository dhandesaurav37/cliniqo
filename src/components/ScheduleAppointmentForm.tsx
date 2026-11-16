import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  addDaysToDateStr,
  APPOINTMENT_TYPE_OPTIONS,
  formatDateHuman,
  generateDoctorAvailableSlots,
  getClinicTodayDate,
  type AppointmentType,
  type PreferredCommMethod,
} from '../lib/appointmentLogic';
import {
  createAppointment,
  fetchClinicAppointments,
  fetchClinicDoctors,
  fetchPatientCommPrefs,
  upsertPatientCommPrefs,
  type AppointmentRecord,
  type ClinicDoctorOption,
} from '../lib/appointmentService';
import { queryPatientsPage, type PatientRecord } from '../lib/patientService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

interface ScheduleAppointmentFormProps {
  initialPatient?: PatientRecord | null;
  consultationId?: string | null;
  defaultDate?: string;
  defaultReason?: string;
  defaultType?: AppointmentType;
  onSuccess?: (result: {
    appointmentId: string;
    appointmentDate: string;
    appointmentTime: string;
    whatsappMessage: string;
  }) => void;
  onCancel?: () => void;
}

export function ScheduleAppointmentForm({
  initialPatient = null,
  consultationId = null,
  defaultDate,
  defaultReason = '',
  defaultType,
  onSuccess,
  onCancel,
}: ScheduleAppointmentFormProps) {
  const { user, clinic, profile, membership } = useAuth();
  const timezone = clinic?.timezone || 'Asia/Kolkata';
  const clinicToday = getClinicTodayDate(timezone);

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(initialPatient);

  const [doctors, setDoctors] = useState<ClinicDoctorOption[]>([]);
  const [doctorId, setDoctorId] = useState<string>(user?.uid || clinic?.ownerId || '');
  const [clinicAppointments, setClinicAppointments] = useState<AppointmentRecord[]>([]);
  const [loadingSetup, setLoadingSetup] = useState(true);

  const [appointmentDate, setAppointmentDate] = useState<string>(
    defaultDate && defaultDate >= clinicToday ? defaultDate : addDaysToDateStr(clinicToday, 7),
  );
  const [appointmentTime, setAppointmentTime] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(
    clinic?.appointmentDuration || 15,
  );
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    defaultType || (consultationId ? 'follow_up' : 'general'),
  );
  const [reason, setReason] = useState<string>(defaultReason);
  const [additionalInstructions, setAdditionalInstructions] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState<string>('');

  // Inline consent state for the selected patient
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [preferredMethod, setPreferredMethod] = useState<PreferredCommMethod>('whatsapp');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPatient(initialPatient);
  }, [initialPatient]);

  useEffect(() => {
    if (!clinic || !user || !membership) return;
    let cancelled = false;
    setLoadingSetup(true);

    Promise.all([
      fetchClinicDoctors(clinic, user.uid, membership.role),
      fetchClinicAppointments(clinic.id),
      initialPatient
        ? Promise.resolve({ patients: [] as PatientRecord[] })
        : queryPatientsPage(clinic.id, { statusFilter: 'active', pageSize: 20 }),
    ])
      .then(([docList, appts, patPage]) => {
        if (cancelled) return;
        setDoctors(docList);
        const preferredDoc =
          docList.find((d: ClinicDoctorOption) => d.uid === user.uid)?.uid ||
          docList[0]?.uid ||
          clinic.ownerId;
        setDoctorId(preferredDoc);
        setClinicAppointments(appts);
        if (!initialPatient) {
          setPatients(patPage.patients);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load clinic schedule or doctors.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSetup(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clinic, user, membership, initialPatient]);

  useEffect(() => {
    if (!clinic || initialPatient) return;
    const trimmed = patientSearch.trim();
    if (!trimmed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      queryPatientsPage(clinic.id, {
        searchText: trimmed,
        statusFilter: 'active',
        pageSize: 12,
      })
        .then((res) => {
          if (!cancelled) setPatients(res.patients);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clinic, initialPatient, patientSearch]);

  useEffect(() => {
    if (!clinic || !selectedPatient) return;
    let cancelled = false;
    setLoadingPrefs(true);
    fetchPatientCommPrefs(clinic.id, selectedPatient.id)
      .then((prefs) => {
        if (cancelled) return;
        if (prefs) {
          setWhatsappConsent(prefs.whatsappConsent);
          setPreferredMethod(prefs.preferredMethod);
          setSendWhatsapp(
            prefs.whatsappConsent && prefs.whatsappEnabled && prefs.preferredMethod !== 'none',
          );
        } else {
          setWhatsappConsent(false);
          setPreferredMethod('whatsapp');
          setSendWhatsapp(false);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingPrefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinic, selectedPatient]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.patientId.toLowerCase().includes(q) ||
          p.mobile.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [patients, patientSearch]);

  const selectedDoctor = useMemo(
    () =>
      doctors.find((d) => d.uid === doctorId) || {
        uid: clinic?.ownerId || doctorId,
        name: profile?.fullName || 'Clinic Doctor',
        role: 'owner' as const,
      },
    [doctors, doctorId, clinic, profile],
  );

  const slotData = useMemo(() => {
    if (!clinic || !doctorId) {
      return { isWorkingDay: true, dayLabel: 'Mon', slots: [] };
    }
    return generateDoctorAvailableSlots({
      clinic,
      dateStr: appointmentDate,
      doctorId,
      durationMinutes,
      existingAppointments: clinicAppointments,
    });
  }, [clinic, appointmentDate, doctorId, durationMinutes, clinicAppointments]);

  // Auto-select first available slot when current selected slot isn't available
  useEffect(() => {
    const stillValid = slotData.slots.some((s) => s.time === appointmentTime && s.available);
    if (!stillValid) {
      const firstOpen = slotData.slots.find((s) => s.available);
      setAppointmentTime(firstOpen ? firstOpen.time : '');
    }
  }, [slotData.slots, appointmentTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic || !user || !membership) return;
    if (!selectedPatient) {
      setError('Please select a patient first.');
      return;
    }
    if (!appointmentTime) {
      setError('Please select an available clinic appointment slot.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const actorName = profile?.fullName || user.displayName || 'Clinic Staff';

      // Save updated patient communication consent prior to scheduling
      await upsertPatientCommPrefs({
        clinicId: clinic.id,
        patientDocId: selectedPatient.id,
        patientId: selectedPatient.patientId,
        mobile: selectedPatient.mobile,
        whatsappConsent,
        preferredMethod: whatsappConsent ? 'whatsapp' : preferredMethod === 'whatsapp' ? 'phone' : preferredMethod,
        whatsappEnabled: whatsappConsent && sendWhatsapp,
        actorUid: user.uid,
        actorName,
      });

      const res = await createAppointment({
        clinic,
        patient: selectedPatient,
        doctorId: selectedDoctor.uid,
        doctorName: selectedDoctor.name,
        consultationId,
        appointmentDate,
        appointmentTime,
        durationMinutes,
        appointmentType,
        reason,
        additionalInstructions,
        internalNotes,
        sendWhatsapp: whatsappConsent && sendWhatsapp,
        actorUid: user.uid,
        actorName,
        actorRole: membership.role,
      });

      onSuccess?.({
        appointmentId: res.appointmentId,
        appointmentDate,
        appointmentTime,
        whatsappMessage: res.whatsappMessage,
      });
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to save appointment.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!clinic) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Patient Card or Patient Picker */}
      {selectedPatient ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-sky-50/70 px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0891B2] text-white shrink-0">
              <UserRound className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-[#0B192C] truncate">
                {selectedPatient.fullName}{' '}
                <span className="font-mono text-xs font-semibold text-sky-800">
                  ({selectedPatient.patientId})
                </span>
              </p>
              <p className="text-xs text-slate-600 tabular-nums">
                Mobile: {selectedPatient.mobile} · Clinic: {clinic.name}
                {consultationId && ' · Linked to Consultation'}
              </p>
            </div>
          </div>

          {!initialPatient && (
            <button
              type="button"
              onClick={() => setSelectedPatient(null)}
              className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Change Patient
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-700">
            Select Patient *
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search active patients by name, PAT ID, or mobile..."
              className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 text-sm text-[#0B192C]"
            />
          </div>

          {loadingSetup ? (
            <p className="text-xs text-slate-500">Loading clinic patients...</p>
          ) : filteredPatients.length === 0 ? (
            <p className="text-xs text-slate-500">
              No matching active patients found. Register the patient first on the Patients page.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
              {filteredPatients.map((pat) => (
                <button
                  key={pat.id}
                  type="button"
                  onClick={() => setSelectedPatient(pat)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50/50 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#0B192C] truncate">{pat.fullName}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums truncate">
                      {pat.patientId} · {pat.mobile}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-sky-700 shrink-0">Select</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Doctor, Date, Type & Duration */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="appt-doctor" className="block text-xs font-semibold text-slate-700">
            Consulting Doctor
          </label>
          <select
            id="appt-doctor"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
          >
            {doctors.length === 0 ? (
              <option value={doctorId}>{profile?.fullName || 'Clinic Doctor'}</option>
            ) : (
              doctors.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.name.startsWith('Dr.') ? d.name : `Dr. ${d.name}`}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label htmlFor="appt-type" className="block text-xs font-semibold text-slate-700">
            Appointment Type
          </label>
          <select
            id="appt-type"
            value={appointmentType}
            onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
            className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
          >
            {APPOINTMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="appt-date" className="block text-xs font-semibold text-slate-700">
            Appointment Date *
          </label>
          <input
            id="appt-date"
            type="date"
            min={clinicToday}
            required
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {formatDateHuman(appointmentDate)} ({timezone})
          </p>
        </div>

        <div>
          <label htmlFor="appt-duration" className="block text-xs font-semibold text-slate-700">
            Slot Duration
          </label>
          <select
            id="appt-duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
          >
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={20}>20 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select>
        </div>
      </div>

      {/* Available Time Slot Picker */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-700" aria-hidden="true" />
            <span className="text-xs font-semibold text-[#0B192C]">
              Select Available Time Slot *
            </span>
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">
            Clinic Hours: {clinic.openingTime} – {clinic.closingTime}
          </span>
        </div>

        {!slotData.isWorkingDay ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
            Clinic is closed on {slotData.dayLabel}. Working days are{' '}
            {clinic.workingDays.join(', ')}. Please choose a different date.
          </div>
        ) : slotData.slots.length === 0 ? (
          <p className="text-xs text-slate-500">No slots configured within clinic hours.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 max-h-52 overflow-y-auto pr-1">
            {slotData.slots.map((slot) => {
              const isSelected = appointmentTime === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  title={slot.conflictReason || slot.label}
                  onClick={() => setAppointmentTime(slot.time)}
                  className={`min-h-[38px] rounded-xl border px-2 py-1.5 text-xs font-semibold transition-colors tabular-nums ${
                    isSelected
                      ? 'border-sky-600 bg-sky-600 text-white shadow-sm cursor-pointer'
                      : slot.available
                        ? 'border-slate-200 bg-white text-[#0B192C] hover:border-sky-300 hover:bg-sky-50 cursor-pointer'
                        : 'border-slate-200/70 bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Follow-up Reason & Instructions */}
      <div className="space-y-4">
        <div>
          <label htmlFor="appt-reason" className="block text-xs font-semibold text-slate-700">
            Follow-up Reason / Visit Purpose
          </label>
          <input
            id="appt-reason"
            type="text"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Post-medication review, Blood report evaluation"
            className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="appt-instructions"
              className="block text-xs font-semibold text-slate-700"
            >
              Patient Preparation Instructions
            </label>
            <textarea
              id="appt-instructions"
              rows={2}
              maxLength={1000}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="e.g., Bring previous lab reports; fasting not required"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
            />
          </div>

          <div>
            <label htmlFor="appt-internal" className="block text-xs font-semibold text-slate-700">
              Internal Reception / Clinic Notes (Not sent to patient)
            </label>
            <textarea
              id="appt-internal"
              rows={2}
              maxLength={1000}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Front-desk scheduling notes..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0B192C]"
            />
          </div>
        </div>
      </div>

      {/* Patient WhatsApp Consent & Notification Toggle */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-[#0B192C]">
            <MessageSquare className="h-4 w-4 text-sky-700" aria-hidden="true" />
            <span>WhatsApp Confirmation &amp; Automatic Reminders</span>
          </div>
          {loadingPrefs && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" aria-hidden="true" />
          )}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={whatsappConsent}
            onChange={(e) => {
              const checked = e.target.checked;
              setWhatsappConsent(checked);
              if (checked) {
                setSendWhatsapp(true);
                setPreferredMethod('whatsapp');
              } else {
                setSendWhatsapp(false);
              }
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
          />
          <span className="text-slate-700 leading-relaxed">
            Patient has opted in to receive WhatsApp appointment confirmation &amp; reminders (24h
            and 2h prior) on{' '}
            <strong className="text-[#0B192C] tabular-nums">
              {selectedPatient?.mobile || 'their registered mobile'}
            </strong>
            .
          </span>
        </label>

        {whatsappConsent && (
          <label className="flex items-center gap-2.5 pl-6 cursor-pointer">
            <input
              type="checkbox"
              checked={sendWhatsapp}
              onChange={(e) => setSendWhatsapp(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600"
            />
            <span className="font-medium text-[#0B192C]">
              Send WhatsApp confirmation &amp; enable scheduled reminders for this visit
            </span>
          </label>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
          Privacy-safe templates only include Clinic name, Doctor name, Patient name, Date &amp; Time.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200/70 pt-4">
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !selectedPatient || !appointmentTime}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-55 cursor-pointer"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : consultationId ? (
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting
            ? 'Saving Appointment...'
            : consultationId
              ? 'Save Follow-up Appointment'
              : 'Schedule Appointment'}
        </button>
      </div>
    </form>
  );
}
