import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Printer,
  RotateCcw,
  Search,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DEMO_APPOINTMENTS,
  INITIAL_DEMO_QUEUE,
  MEDICINE_CATALOG,
  type DemoAppointment,
  type DemoPatient,
} from '../data/clinicContent';

type PreviewTab = 'dashboard' | 'queue' | 'appointments' | 'registration' | 'prescription';

interface RxEntry {
  id: string;
  name: string;
  strength: string;
  pattern: string;
  dosesPerDay: number;
  days: number;
  instruction: string;
}

const PREVIEW_TABS: Array<{ id: PreviewTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Doctor Dashboard', icon: LayoutDashboard },
  { id: 'queue', label: "Today's Queue", icon: ClipboardList },
  { id: 'appointments', label: 'Upcoming Appointments', icon: CalendarClock },
  { id: 'registration', label: 'Patient Registration', icon: UserPlus },
  { id: 'prescription', label: 'Prescription Preview', icon: FileText },
];

export function ProductPreviewSection() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('dashboard');
  const [queue, setQueue] = useState<DemoPatient[]>(INITIAL_DEMO_QUEUE);
  const [appointments, setAppointments] = useState<DemoAppointment[]>(DEMO_APPOINTMENTS);

  // Patient registration demo state
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('32');
  const [patientGender, setPatientGender] = useState('F');
  const [visitType, setVisitType] = useState<'New Visit' | 'Follow-up'>('New Visit');
  const [complaint, setComplaint] = useState('');
  const [regFeedback, setRegFeedback] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  // Prescription maker demo state
  const [medSearch, setMedSearch] = useState('');
  const [rxItems, setRxItems] = useState<RxEntry[]>([
    {
      id: 'med-1',
      name: 'Paracetamol',
      strength: '650 mg Tablet',
      pattern: '1-0-1',
      dosesPerDay: 2,
      days: 5,
      instruction: 'After meals if fever > 100°F',
    },
    {
      id: 'med-3',
      name: 'Montelukast + Levocetirizine',
      strength: '10 mg / 5 mg Tablet',
      pattern: '0-0-1',
      dosesPerDay: 1,
      days: 7,
      instruction: 'At bedtime after dinner',
    },
  ]);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const currentPatient = queue.find((p) => p.status === 'In Consultation') || null;
  const waitingPatients = queue.filter((p) => p.status === 'Waiting');
  const completedCount = queue.filter((p) => p.status === 'Completed').length;

  const filteredCatalog = useMemo(() => {
    const q = medSearch.trim().toLowerCase();
    if (!q) return MEDICINE_CATALOG;
    return MEDICINE_CATALOG.filter(
      (m) => m.name.toLowerCase().includes(q) || m.strength.toLowerCase().includes(q),
    );
  }, [medSearch]);

  const handleAcceptNext = () => {
    setQueue((prev) => {
      const nextWaiting = prev.find((p) => p.status === 'Waiting');
      if (!nextWaiting) {
        return prev.map((p) =>
          p.status === 'In Consultation' ? { ...p, status: 'Completed' } : p,
        );
      }
      return prev.map((p) => {
        if (p.status === 'In Consultation') return { ...p, status: 'Completed' };
        if (p.id === nextWaiting.id) return { ...p, status: 'In Consultation' };
        return p;
      });
    });
  };

  const handleResetQueue = () => {
    setQueue(INITIAL_DEMO_QUEUE);
  };

  const handleRegisterDemoPatient = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = patientName.trim();
    const parsedAge = Number(patientAge);

    if (trimmedName.length < 2) {
      setRegError('Please enter a patient full name.');
      setRegFeedback(null);
      return;
    }
    if (!Number.isFinite(parsedAge) || parsedAge < 1 || parsedAge > 115) {
      setRegError('Please enter a valid age between 1 and 115.');
      setRegFeedback(null);
      return;
    }

    const nextNum = queue.length + 1;
    const token = `T-${String(nextNum).padStart(2, '0')}`;
    const newEntry: DemoPatient = {
      id: `p-demo-${Date.now()}`,
      token,
      name: trimmedName,
      age: parsedAge,
      gender: patientGender,
      visitType,
      status: 'Waiting',
      arrivalTime: 'Just now',
      chiefComplaint: complaint.trim() || 'General outpatient consultation',
    };

    setQueue((prev) => [...prev, newEntry]);
    setRegError(null);
    setRegFeedback(`Registered ${trimmedName} under ${token} and added to today's waiting list.`);
    setPatientName('');
    setComplaint('');
  };

  const handleToggleWhatsapp = (id: string) => {
    setAppointments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              whatsappStatus:
                item.whatsappStatus === 'Confirmed via WhatsApp'
                  ? 'Reminder Scheduled'
                  : 'Confirmed via WhatsApp',
            }
          : item,
      ),
    );
  };

  const handleRescheduleDemo = (id: string) => {
    setAppointments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              dateLabel: item.dateLabel === 'Tomorrow' ? 'Fri, 20 Nov' : 'Tomorrow',
              timeSlot: item.timeSlot === '10:30 AM' ? '04:45 PM' : '10:30 AM',
            }
          : item,
      ),
    );
  };

  const handleAddMedicine = (medId: string) => {
    const med = MEDICINE_CATALOG.find((m) => m.id === medId);
    if (!med) return;
    if (rxItems.some((item) => item.id === med.id)) return;
    setRxItems((prev) => [
      ...prev,
      {
        id: med.id,
        name: med.name,
        strength: med.strength,
        pattern: med.defaultPattern,
        dosesPerDay: med.dosesPerDay,
        days: med.defaultDays,
        instruction: med.instruction,
      },
    ]);
  };

  const handleUpdateRxDays = (id: string, delta: number) => {
    setRxItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, days: Math.min(30, Math.max(1, item.days + delta)) }
          : item,
      ),
    );
  };

  const handleUpdateRxPattern = (id: string, pattern: string) => {
    const dosesPerDay = pattern
      .split('-')
      .map((n) => Number(n) || 0)
      .reduce((acc, n) => acc + n, 0);
    setRxItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, pattern, dosesPerDay: Math.max(1, dosesPerDay) }
          : item,
      ),
    );
  };

  const handleRemoveRxItem = (id: string) => {
    setRxItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <section id="preview" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-sky-700">
              Interactive Product Preview · Demonstration Data
            </p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
              See your daily clinic workspace in action.
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              Explore the doctor dashboard, live queue, follow-up schedule, front-desk
              registration, and digital prescription builder using realistic sample records.
            </p>
          </div>
          <p className="text-xs font-mono text-slate-500 whitespace-nowrap">
            Sample Clinic Workspace · Demonstration Only
          </p>
        </div>

        {/* Lucid Glass Application Window */}
        <div className="mt-10 lucid-glass rounded-3xl overflow-hidden">
          {/* App Window Top Chrome */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/75 bg-white/70 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              </div>
              <span className="text-xs font-medium text-slate-600">
                Sample Clinic Workspace (Demo)
                <span className="mx-2 text-slate-300" aria-hidden="true">/</span>
                Clinic Code: <span className="font-mono text-[#0B192C]">CLQ-4821</span>
              </span>
            </div>

            <div className="text-xs text-slate-500 tabular-nums">
              Doctor &amp; Receptionist Sync Preview
            </div>
          </div>

          {/* Interactive View Switcher */}
          <div className="border-b border-slate-200/70 bg-slate-50/60 px-4 py-2.5 overflow-x-auto">
            <div
              role="tablist"
              aria-label="Product preview views"
              className="flex items-center gap-1.5 min-w-max"
            >
              {PREVIEW_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                      isActive
                        ? 'bg-white text-[#0B192C] shadow-sm border border-slate-200/80'
                        : 'text-slate-600 hover:text-[#0B192C] hover:bg-white/60'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? 'text-sky-600' : 'text-slate-500'}`}
                      aria-hidden="true"
                    />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Body */}
          <div className="p-5 sm:p-8 bg-white/45 min-h-[440px]">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* Summary Row */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-b border-slate-200/70 pb-7">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Waiting in Queue (Sample)
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-[#0B192C] tabular-nums">
                      {waitingPatients.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Consultations Completed (Sample)
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-[#0B192C] tabular-nums">
                      {completedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Upcoming Follow-ups (Sample)
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-[#0B192C] tabular-nums">
                      {appointments.length}
                    </p>
                  </div>
                </div>

                {/* Split: Active Consultation + Quick Queue Snapshot */}
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display text-lg font-bold text-[#0B192C]">
                        Active Consultation Room
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAcceptNext}
                          className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 transition-all cursor-pointer whitespace-nowrap"
                        >
                          {currentPatient ? 'Complete & Accept Next Patient' : 'Accept Next Patient'}
                        </button>
                        <button
                          type="button"
                          onClick={handleResetQueue}
                          aria-label="Reset demonstration queue"
                          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:text-[#0B192C] cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {currentPatient ? (
                      <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                              {currentPatient.token}
                            </span>
                            <span className="mx-2 text-slate-300" aria-hidden="true">·</span>
                            <span className="font-display text-base font-bold text-[#0B192C]">
                              {currentPatient.name}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {currentPatient.age} yrs · {currentPatient.gender} ·{' '}
                            {currentPatient.visitType}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                          <div>
                            <p className="text-xs font-medium text-slate-500">Recorded Symptoms</p>
                            <p className="mt-1 text-slate-700">{currentPatient.chiefComplaint}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-500">Clinical Notes</p>
                            <p className="mt-1 text-slate-700">
                              Afebrile at check-in · Chest clear on auscultation
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('prescription')}
                            className="text-xs font-semibold text-sky-700 hover:text-sky-800 underline underline-offset-4 cursor-pointer"
                          >
                            Open Prescription Maker →
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('appointments')}
                            className="text-xs font-semibold text-slate-600 hover:text-[#0B192C] underline underline-offset-4 cursor-pointer"
                          >
                            Schedule Follow-up
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-6 text-sm text-slate-600">
                        All sample patients in the demonstration queue have been seen. Click the
                        reset icon above to replay the queue flow.
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg font-bold text-[#0B192C]">
                        Next in Waiting Room
                      </h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('queue')}
                        className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                      >
                        Full Queue
                      </button>
                    </div>
                    <div className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/80 bg-white/80">
                      {waitingPatients.length === 0 ? (
                        <p className="p-5 text-sm text-slate-500">
                          Waiting list is currently empty in this demo.
                        </p>
                      ) : (
                        waitingPatients.slice(0, 3).map((patient) => (
                          <div
                            key={patient.id}
                            className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-[#0B192C] truncate">
                                <span className="font-mono text-xs text-sky-700 mr-2 tabular-nums">
                                  {patient.token}
                                </span>
                                {patient.name}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {patient.visitType} · Arrived {patient.arrivalTime}
                              </p>
                            </div>
                            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                              Waiting
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'queue' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0B192C]">
                      Today&apos;s Patient Queue (Sample Data)
                    </h3>
                    <p className="text-sm text-slate-600">
                      Receptionists register walk-ins and see live token updates as the doctor calls
                      the next patient.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleAcceptNext}
                      className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer whitespace-nowrap"
                    >
                      Accept Next Patient
                    </button>
                    <button
                      type="button"
                      onClick={handleResetQueue}
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      Reset Demo
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/85">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Token</th>
                        <th className="px-4 py-3">Patient</th>
                        <th className="px-4 py-3">Visit Type</th>
                        <th className="px-4 py-3">Check-in</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {queue.map((patient) => (
                        <tr key={patient.id} className="hover:bg-sky-50/35 transition-colors">
                          <td className="px-4 py-3.5 font-mono text-xs font-semibold text-sky-700 tabular-nums whitespace-nowrap">
                            {patient.token}
                          </td>
                          <td className="px-4 py-3.5 font-medium text-[#0B192C] whitespace-nowrap">
                            {patient.name}{' '}
                            <span className="text-xs font-normal text-slate-500 tabular-nums">
                              ({patient.age} {patient.gender})
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                            {patient.visitType}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 tabular-nums whitespace-nowrap">
                            {patient.arrivalTime}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                            {patient.chiefComplaint}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                patient.status === 'In Consultation'
                                  ? 'text-sky-700'
                                  : patient.status === 'Completed'
                                    ? 'text-emerald-700'
                                    : 'text-slate-600'
                              }`}
                            >
                              {patient.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'appointments' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#0B192C]">
                    Upcoming Follow-up Appointments (Sample Data)
                  </h3>
                  <p className="text-sm text-slate-600">
                    Reschedule follow-up slots or toggle sample WhatsApp confirmation reminders.
                  </p>
                </div>

                <div className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/80 bg-white/85">
                  {appointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-display text-base font-bold text-[#0B192C]">
                          {appt.patientName}
                        </p>
                        <p className="text-xs text-slate-600 tabular-nums">
                          {appt.dateLabel} · {appt.timeSlot}
                          <span className="mx-2 text-slate-300" aria-hidden="true">|</span>
                          {appt.reason}
                        </p>
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          {appt.whatsappStatus}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleRescheduleDemo(appt.id)}
                          className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                        >
                          Reschedule Slot
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleWhatsapp(appt.id)}
                          className="min-h-[40px] rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100/70 cursor-pointer whitespace-nowrap"
                        >
                          {appt.whatsappStatus === 'Confirmed via WhatsApp'
                            ? 'Mark Pending'
                            : 'Send WhatsApp Reminder'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'registration' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                <form
                  onSubmit={handleRegisterDemoPatient}
                  className="lg:col-span-7 space-y-4 rounded-2xl border border-slate-200/80 bg-white/85 p-5 sm:p-6"
                  noValidate
                >
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0B192C]">
                      Front-Desk Patient Registration (Demo)
                    </h3>
                    <p className="text-sm text-slate-600">
                      Add a sample walk-in patient to see automatic token generation in the queue tab.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="demo-patient-name"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Patient Full Name
                      </label>
                      <input
                        id="demo-patient-name"
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="e.g., Priya Sharma"
                        className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="demo-patient-age"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Age
                      </label>
                      <input
                        id="demo-patient-age"
                        type="number"
                        min={1}
                        max={115}
                        value={patientAge}
                        onChange={(e) => setPatientAge(e.target.value)}
                        className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="demo-patient-gender"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Gender
                      </label>
                      <select
                        id="demo-patient-gender"
                        value={patientGender}
                        onChange={(e) => setPatientGender(e.target.value)}
                        className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      >
                        <option value="F">Female</option>
                        <option value="M">Male</option>
                        <option value="O">Other</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="demo-visit-type"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Visit Type
                      </label>
                      <select
                        id="demo-visit-type"
                        value={visitType}
                        onChange={(e) =>
                          setVisitType(e.target.value as 'New Visit' | 'Follow-up')
                        }
                        className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      >
                        <option value="New Visit">New Visit</option>
                        <option value="Follow-up">Follow-up</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="demo-complaint"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Reason for Visit
                      </label>
                      <input
                        id="demo-complaint"
                        type="text"
                        value={complaint}
                        onChange={(e) => setComplaint(e.target.value)}
                        placeholder="e.g., Throat pain for 2 days"
                        className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>

                  {regError && (
                    <p className="text-xs font-medium text-rose-600" role="alert">
                      {regError}
                    </p>
                  )}
                  {regFeedback && (
                    <p
                      className="flex items-center gap-2 text-xs font-medium text-emerald-700"
                      role="status"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {regFeedback}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Register &amp; Issue Token
                  </button>
                </form>

                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 space-y-3">
                    <h4 className="font-display text-base font-bold text-[#0B192C]">
                      How Receptionist Sync Works
                    </h4>
                    <ul className="space-y-2.5 text-sm text-slate-600">
                      <li>1. Receptionist signs in using their own staff account and clinic code.</li>
                      <li>2. Each registration automatically generates the next sequential token.</li>
                      <li>3. Doctor immediately sees the updated waiting list without phone calls.</li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => setActiveTab('queue')}
                      className="pt-2 text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                    >
                      View Live Demo Queue ({queue.length} entries) →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'prescription' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                {/* Left: Medicine Search & Builder */}
                <div className="lg:col-span-6 space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0B192C]">
                      Smart Prescription Maker (Demo)
                    </h3>
                    <p className="text-sm text-slate-600">
                      Search medicines, adjust dosage frequency or duration, and watch quantities
                      calculate automatically.
                    </p>
                  </div>

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={medSearch}
                      onChange={(e) => setMedSearch(e.target.value)}
                      placeholder="Search sample medicines (e.g., Paracetamol, Pantoprazole)"
                      aria-label="Search sample medicines"
                      className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>

                  <div className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/80 bg-white/85">
                    {filteredCatalog.map((med) => {
                      const alreadyAdded = rxItems.some((item) => item.id === med.id);
                      return (
                        <div
                          key={med.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#0B192C]">
                              {med.name}{' '}
                              <span className="font-normal text-slate-500">{med.strength}</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              Default: {med.defaultPattern} · {med.defaultDays} days
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => handleAddMedicine(med.id)}
                            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                              alreadyAdded
                                ? 'bg-slate-100 text-slate-400 cursor-default'
                                : 'bg-sky-50 text-sky-700 hover:bg-sky-100 cursor-pointer'
                            }`}
                          >
                            {alreadyAdded ? 'Added' : 'Add to Rx'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Printable Digital Prescription Sheet */}
                <div className="lg:col-span-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                      <div>
                        <p className="font-display text-base font-bold text-[#0B192C]">
                          Sample Clinic Letterhead
                        </p>
                        <p className="text-xs text-slate-500">
                          Patient: Aarav Kulkarni · 34 yrs / M · Sample Rx Preview
                        </p>
                      </div>
                      <span className="font-display text-2xl font-extrabold text-sky-700">Rx</span>
                    </div>

                    <div className="mt-4 divide-y divide-slate-100">
                      {rxItems.length === 0 ? (
                        <p className="py-6 text-sm text-slate-500">
                          Select a medicine on the left to build a sample prescription.
                        </p>
                      ) : (
                        rxItems.map((item, idx) => {
                          const totalQty = item.dosesPerDay * item.days;
                          return (
                            <div key={item.id} className="py-3.5 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#0B192C]">
                                    {idx + 1}. {item.name}{' '}
                                    <span className="font-normal text-slate-500">
                                      {item.strength}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-500">{item.instruction}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRxItem(item.id)}
                                  className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2">
                                  <label
                                    htmlFor={`rx-pattern-${item.id}`}
                                    className="text-slate-500"
                                  >
                                    Dosage:
                                  </label>
                                  <select
                                    id={`rx-pattern-${item.id}`}
                                    value={item.pattern}
                                    onChange={(e) =>
                                      handleUpdateRxPattern(item.id, e.target.value)
                                    }
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-[#0B192C]"
                                  >
                                    <option value="1-0-0">1-0-0 (1/day)</option>
                                    <option value="0-0-1">0-0-1 (1/day)</option>
                                    <option value="1-0-1">1-0-1 (2/day)</option>
                                    <option value="1-1-1">1-1-1 (3/day)</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">Duration:</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRxDays(item.id, -1)}
                                    aria-label={`Decrease days for ${item.name}`}
                                    className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-medium text-[#0B192C] tabular-nums">
                                    {item.days}d
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRxDays(item.id, 1)}
                                    aria-label={`Increase days for ${item.name}`}
                                    className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>

                                <div className="font-mono font-semibold text-sky-700 tabular-nums">
                                  Qty: {totalQty} Tabs
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                      <p className="text-xs text-slate-500">
                        Automatic quantity calculation · Print &amp; PDF ready
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setPrintNotice(
                            'Sample PDF/print layout ready. Live PDF export activates inside your clinic workspace.',
                          )
                        }
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-100 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                        Print / PDF Preview
                      </button>
                    </div>

                    {printNotice && (
                      <p className="mt-3 text-xs font-medium text-sky-700" role="status">
                        {printNotice}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
