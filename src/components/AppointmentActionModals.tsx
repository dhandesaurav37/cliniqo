import { AlertTriangle, CalendarClock, Clock, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  formatDateHuman,
  formatTime12h,
  generateDoctorAvailableSlots,
  getClinicTodayDate,
} from '../lib/appointmentLogic';
import {
  fetchClinicAppointments,
  rescheduleAppointment,
  updateAppointmentStatus,
  type AppointmentRecord,
} from '../lib/appointmentService';
import type { ClinicRecord, MembershipRole } from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';

interface RescheduleModalProps {
  clinic: ClinicRecord;
  appointment: AppointmentRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  onClose: () => void;
  onCompleted: (message: string) => void;
}

export function RescheduleAppointmentModal({
  clinic,
  appointment,
  actorUid,
  actorName,
  actorRole,
  onClose,
  onCompleted,
}: RescheduleModalProps) {
  const timezone = clinic.timezone || 'Asia/Kolkata';
  const clinicToday = getClinicTodayDate(timezone);
  const [newDate, setNewDate] = useState(
    appointment.appointmentDate >= clinicToday ? appointment.appointmentDate : clinicToday,
  );
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [clinicAppointments, setClinicAppointments] = useState<AppointmentRecord[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    fetchClinicAppointments(clinic.id)
      .then((list) => {
        if (!cancelled) setClinicAppointments(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinic.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const slotData = useMemo(
    () =>
      generateDoctorAvailableSlots({
        clinic,
        dateStr: newDate,
        doctorId: appointment.doctorId,
        durationMinutes: appointment.durationMinutes || clinic.appointmentDuration || 15,
        existingAppointments: clinicAppointments,
        excludeAppointmentId: appointment.id,
      }),
    [clinic, newDate, appointment, clinicAppointments],
  );

  useEffect(() => {
    const valid = slotData.slots.some((s) => s.time === newTime && s.available);
    if (!valid) {
      const first = slotData.slots.find((s) => s.available);
      setNewTime(first ? first.time : '');
    }
  }, [slotData.slots, newTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime) {
      setError('Please choose an available time slot.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await rescheduleAppointment({
        clinic,
        appointment,
        newDate,
        newTime,
        reason,
        sendWhatsapp,
        actorUid,
        actorName,
        actorRole,
      });
      onCompleted(
        `Rescheduled ${appointment.patientName} to ${formatDateHuman(newDate)} at ${formatTime12h(newTime)}. ${res.whatsappMessage}`,
      );
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to reschedule appointment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reschedule appointment"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
      >
        <div className="flex items-center gap-3 text-[#0B192C]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Reschedule Appointment</h2>
            <p className="text-xs text-slate-600">
              {appointment.patientName} ({appointment.patientId}) · Current:{' '}
              {formatDateHuman(appointment.appointmentDate)} at{' '}
              {formatTime12h(appointment.appointmentTime)}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="resched-date" className="block text-xs font-semibold text-slate-700">
            New Appointment Date *
          </label>
          <input
            id="resched-date"
            type="date"
            min={clinicToday}
            required
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="mt-1.5 w-full min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-[#0B192C]">
              <Clock className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              Available Slots ({appointment.doctorName})
            </span>
            {loadingSlots && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />}
          </div>

          {!slotData.isWorkingDay ? (
            <p className="text-xs font-medium text-amber-800">
              Clinic is closed on {slotData.dayLabel}. Please select another date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 max-h-44 overflow-y-auto pr-1">
              {slotData.slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => setNewTime(slot.time)}
                  className={`min-h-[36px] rounded-xl border px-2 text-xs font-semibold tabular-nums ${
                    newTime === slot.time
                      ? 'border-sky-600 bg-sky-600 text-white cursor-pointer'
                      : slot.available
                        ? 'border-slate-200 bg-white text-[#0B192C] hover:border-sky-300 cursor-pointer'
                        : 'border-slate-200/70 bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="resched-reason" className="block text-xs font-semibold text-slate-700">
            Reschedule Reason (Optional)
          </label>
          <input
            id="resched-reason"
            type="text"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Requested via phone / WhatsApp reply"
            className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 px-3.5 text-sm text-[#0B192C]"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sendWhatsapp}
            onChange={(e) => setSendWhatsapp(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600"
          />
          Notify patient of updated schedule via WhatsApp (requires patient consent)
        </label>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200/70">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !newTime}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 text-xs font-semibold text-white disabled:opacity-55 cursor-pointer"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Confirm Reschedule
          </button>
        </div>
      </form>
    </div>
  );
}

interface CancelModalProps {
  clinic: ClinicRecord;
  appointment: AppointmentRecord;
  actorUid: string;
  actorName: string;
  actorRole: MembershipRole;
  onClose: () => void;
  onCompleted: (message: string) => void;
}

export function CancelAppointmentModal({
  clinic,
  appointment,
  actorUid,
  actorName,
  actorRole,
  onClose,
  onCompleted,
}: CancelModalProps) {
  const [cancelReason, setCancelReason] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancelReason.trim().length < 3) {
      setError('Please provide a brief cancellation reason (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAppointmentStatus({
        clinic,
        appointment,
        nextStatus: 'cancelled',
        cancelReason: cancelReason.trim(),
        sendWhatsappOnCancel: sendWhatsapp,
        actorUid,
        actorName,
        actorRole,
      });
      onCompleted(`Cancelled appointment for ${appointment.patientName}.`);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to cancel appointment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cancel appointment"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
      >
        <div className="flex items-center gap-3 text-[#0B192C]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Cancel Appointment?</h2>
            <p className="text-xs text-slate-600">
              {appointment.patientName} · {formatDateHuman(appointment.appointmentDate)} at{' '}
              {formatTime12h(appointment.appointmentTime)}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="cancel-reason" className="block text-xs font-semibold text-slate-700">
            Cancellation Reason *
          </label>
          <input
            id="cancel-reason"
            type="text"
            required
            minLength={3}
            maxLength={300}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g., Patient requested cancellation"
            className="mt-1.5 w-full min-h-[40px] rounded-xl border border-slate-200 px-3.5 text-sm text-[#0B192C]"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sendWhatsapp}
            onChange={(e) => setSendWhatsapp(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600"
          />
          Send WhatsApp cancellation update if patient has consented
        </label>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200/70">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Keep Appointment
          </button>
          <button
            type="submit"
            disabled={busy || cancelReason.trim().length < 3}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-55 cursor-pointer"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Confirm Cancellation
          </button>
        </div>
      </form>
    </div>
  );
}
