import type { ClinicRecord, WorkingDay } from './clinicService';

export type AppointmentType = 'follow_up' | 'general' | 'review_reports' | 'routine_checkup';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'reschedule_requested'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type WhatsAppNotificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped_no_consent'
  | 'skipped_not_configured';

export type NotificationLogDeliveryStatus =
  | 'pending_backend_dispatch'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped_no_consent'
  | 'skipped_not_configured';

export type ReminderStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped_no_consent'
  | 'skipped_not_configured'
  | 'not_applicable';

export type PreferredCommMethod = 'whatsapp' | 'phone' | 'none';

export const APPOINTMENT_TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
  { value: 'follow_up', label: 'Follow-up visit' },
  { value: 'general', label: 'General consultation' },
  { value: 'review_reports', label: 'Review reports' },
  { value: 'routine_checkup', label: 'Routine check-up' },
];

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  scheduled: {
    label: 'Scheduled',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
    dotClass: 'bg-sky-600',
  },
  confirmed: {
    label: 'Confirmed',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotClass: 'bg-emerald-600',
  },
  reschedule_requested: {
    label: 'Reschedule Requested',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    dotClass: 'bg-amber-500',
  },
  completed: {
    label: 'Completed',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
    dotClass: 'bg-slate-500',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    dotClass: 'bg-rose-500',
  },
  no_show: {
    label: 'No Show',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-800',
    dotClass: 'bg-orange-500',
  },
};

export const WHATSAPP_STATUS_META: Record<
  WhatsAppNotificationStatus | NotificationLogDeliveryStatus,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: 'WhatsApp Pending',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  pending_backend_dispatch: {
    label: 'Awaiting Backend Dispatch',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  sent: {
    label: 'WhatsApp Sent',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  delivered: {
    label: 'WhatsApp Delivered',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  read: {
    label: 'WhatsApp Read',
    badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  },
  failed: {
    label: 'WhatsApp Failed',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  skipped_no_consent: {
    label: 'No WhatsApp Consent',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  skipped_not_configured: {
    label: 'WhatsApp Not Active',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

export function getAppointmentTypeLabel(type: AppointmentType): string {
  return APPOINTMENT_TYPE_OPTIONS.find((item) => item.value === type)?.label || 'Follow-up visit';
}

export function getClinicTodayDate(timezone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function getClinicCurrentMinutes(timezone = 'Asia/Kolkata'): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (hh === 24 ? 0 : hh) * 60 + mm;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getWeekdayInTimezone(dateStr: string, timezone = 'Asia/Kolkata'): WorkingDay {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    weekday: 'short',
  })
    .format(dt)
    .slice(0, 3);
  const valid: WorkingDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return valid.includes(short as WorkingDay) ? (short as WorkingDay) : 'Mon';
}

export function getTimezoneOffsetMinutes(timezone: string, utcDate: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(utcDate);
    const val = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
      val('year'),
      val('month') - 1,
      val('day'),
      val('hour') === 24 ? 0 : val('hour'),
      val('minute'),
      val('second'),
    );
    return (asUtc - utcDate.getTime()) / 60000;
  } catch {
    return 330;
  }
}

export function computeScheduledAtUtcMs(
  dateStr: string,
  timeStr: string,
  timezone = 'Asia/Kolkata',
): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offsetMin = getTimezoneOffsetMinutes(timezone, new Date(naiveUtc));
  return naiveUtc - offsetMin * 60000;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return -1;
  return hh * 60 + mm;
}

export function minutesToTimeStr(totalMinutes: number): string {
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatTime12h(timeStr: string): string {
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function formatDateHuman(dateStr: string): string {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildSlotLockKey(
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
): string {
  return `${doctorId}_${appointmentDate}_${appointmentTime.replace(':', '')}`;
}

export interface AvailableSlotOption {
  time: string;
  label: string;
  available: boolean;
  isPast: boolean;
  conflictReason: string | null;
}

export function validateClinicSlotAvailability(params: {
  clinic: Pick<ClinicRecord, 'workingDays' | 'openingTime' | 'closingTime' | 'appointmentDuration' | 'timezone'>;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
}): string | null {
  const { clinic, appointmentDate, appointmentTime, durationMinutes } = params;
  const timezone = clinic.timezone || 'Asia/Kolkata';

  if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(appointmentDate)) {
    return 'Please choose a valid appointment date.';
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(appointmentTime)) {
    return 'Please choose a valid appointment time.';
  }

  const today = getClinicTodayDate(timezone);
  if (appointmentDate < today) {
    return 'Appointments cannot be scheduled in the past.';
  }

  const day = getWeekdayInTimezone(appointmentDate, timezone);
  if (clinic.workingDays?.length && !clinic.workingDays.includes(day)) {
    return `Clinic is closed on ${day}. Working days: ${clinic.workingDays.join(', ')}.`;
  }

  const openMin = parseTimeToMinutes(clinic.openingTime || '09:00');
  const closeMin = parseTimeToMinutes(clinic.closingTime || '20:00');
  const startMin = parseTimeToMinutes(appointmentTime);
  const endMin = startMin + durationMinutes;

  if (openMin >= 0 && closeMin > openMin && (startMin < openMin || endMin > closeMin)) {
    return `Time must be within clinic hours (${formatTime12h(clinic.openingTime)} – ${formatTime12h(clinic.closingTime)}).`;
  }

  if (appointmentDate === today && startMin <= getClinicCurrentMinutes(timezone)) {
    return 'Selected time has already passed for today. Choose an upcoming time slot.';
  }

  return null;
}

export function generateDoctorAvailableSlots(params: {
  clinic: Pick<ClinicRecord, 'workingDays' | 'openingTime' | 'closingTime' | 'appointmentDuration' | 'timezone'>;
  dateStr: string;
  doctorId: string;
  durationMinutes?: number;
  existingAppointments: Array<{
    id: string;
    doctorId: string;
    appointmentDate: string;
    appointmentTime: string;
    durationMinutes: number;
    status: AppointmentStatus;
    patientName?: string;
  }>;
  excludeAppointmentId?: string;
}): {
  isWorkingDay: boolean;
  dayLabel: WorkingDay;
  slots: AvailableSlotOption[];
} {
  const { clinic, dateStr, doctorId, existingAppointments, excludeAppointmentId } = params;
  const timezone = clinic.timezone || 'Asia/Kolkata';
  const dayLabel = getWeekdayInTimezone(dateStr, timezone);
  const isWorkingDay = !clinic.workingDays?.length || clinic.workingDays.includes(dayLabel);

  if (!isWorkingDay) {
    return { isWorkingDay: false, dayLabel, slots: [] };
  }

  const step = Math.min(60, Math.max(5, Number(clinic.appointmentDuration || 15)));
  const duration = Math.min(180, Math.max(5, Number(params.durationMinutes || step)));
  const openMin = parseTimeToMinutes(clinic.openingTime || '09:00');
  const closeMin = parseTimeToMinutes(clinic.closingTime || '20:00');
  const today = getClinicTodayDate(timezone);
  const nowMin = getClinicCurrentMinutes(timezone);

  const activeForDoctor = existingAppointments.filter(
    (appt) =>
      appt.id !== excludeAppointmentId &&
      appt.doctorId === doctorId &&
      appt.appointmentDate === dateStr &&
      !['cancelled', 'no_show', 'completed'].includes(appt.status),
  );

  const slots: AvailableSlotOption[] = [];
  for (let m = openMin; m + duration <= closeMin; m += step) {
    const time = minutesToTimeStr(m);
    const isPast = dateStr < today || (dateStr === today && m <= nowMin);

    const conflict = activeForDoctor.find((appt) => {
      const exStart = parseTimeToMinutes(appt.appointmentTime);
      const exEnd = exStart + Number(appt.durationMinutes || step);
      return m < exEnd && exStart < m + duration;
    });

    slots.push({
      time,
      label: formatTime12h(time),
      available: !isPast && !conflict,
      isPast,
      conflictReason: conflict
        ? `Booked (${conflict.patientName || formatTime12h(conflict.appointmentTime)})`
        : isPast
          ? 'Past time'
          : null,
    });
  }

  return { isWorkingDay: true, dayLabel, slots };
}
