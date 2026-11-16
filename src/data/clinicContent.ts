export interface FeatureItem {
  id: string;
  title: string;
  summary: string;
  points: string[];
  iconName: 'Users' | 'ListOrdered' | 'Stethoscope' | 'FileText' | 'CalendarCheck' | 'UserCheck';
}

export interface WorkflowStep {
  step: string;
  title: string;
  description: string;
}

export interface PricingTier {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  recommended?: boolean;
  features: string[];
  ctaLabel: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface DemoPatient {
  id: string;
  token: string;
  name: string;
  age: number;
  gender: string;
  visitType: 'New Visit' | 'Follow-up';
  status: 'Waiting' | 'In Consultation' | 'Completed';
  arrivalTime: string;
  chiefComplaint: string;
}

export interface DemoAppointment {
  id: string;
  patientName: string;
  dateLabel: string;
  timeSlot: string;
  reason: string;
  whatsappStatus: 'Reminder Scheduled' | 'Confirmed via WhatsApp';
}

export interface MedicineTemplateItem {
  id: string;
  name: string;
  strength: string;
  defaultPattern: string;
  dosesPerDay: number;
  defaultDays: number;
  instruction: string;
}

export const TRUST_PLACEHOLDERS = [
  {
    label: 'Clinics Onboarded',
    value: 'Placeholder',
    note: 'Reserved for verified post-launch clinic count',
  },
  {
    label: 'Daily Consultations',
    value: 'Placeholder',
    note: 'To be published after initial clinic rollout',
  },
  {
    label: 'Avg. Setup Time',
    value: 'Placeholder',
    note: 'Measured during independent clinic trials',
  },
  {
    label: 'Practitioner Rating',
    value: 'Placeholder',
    note: 'Added once verified doctor reviews are collected',
  },
];

export const CORE_FEATURES: FeatureItem[] = [
  {
    id: 'patient-management',
    title: 'Patient Management',
    summary: 'Keep every patient chart organized and searchable from the front desk to the consultation room.',
    points: [
      'Register new patients',
      'Search patient records',
      'Access previous visit history',
    ],
    iconName: 'Users',
  },
  {
    id: 'smart-patient-queue',
    title: 'Smart Patient Queue',
    summary: 'Eliminate waiting room confusion with live token tracking shared between doctor and receptionist.',
    points: [
      'Automatic token generation',
      'Live waiting list',
      'Doctor can accept the next patient',
      'Receptionist sees real-time status',
    ],
    iconName: 'ListOrdered',
  },
  {
    id: 'doctor-consultation',
    title: 'Doctor Consultation',
    summary: 'Document clinical encounters cleanly without navigating complex hospital menus.',
    points: [
      'Record symptoms',
      'Add diagnosis',
      'Record observations and consultation notes',
    ],
    iconName: 'Stethoscope',
  },
  {
    id: 'smart-prescription-maker',
    title: 'Smart Prescription Maker',
    summary: 'Write accurate, legible digital prescriptions in seconds and print or share immediately.',
    points: [
      'Searchable medicine database',
      'Dosage and frequency selection',
      'Prescription templates',
      'Automatic quantity calculation',
      'PDF and print functionality',
    ],
    iconName: 'FileText',
  },
  {
    id: 'follow-up-appointments',
    title: 'Follow-up Appointments',
    summary: 'Keep continuity of care effortless with scheduled revisits and automated reminders.',
    points: [
      'Schedule next visits',
      'Reschedule appointments',
      'WhatsApp appointment confirmations and reminders',
    ],
    iconName: 'CalendarCheck',
  },
  {
    id: 'receptionist-management',
    title: 'Receptionist Management',
    summary: 'Give your front-desk staff dedicated access while keeping clinical notes protected.',
    points: [
      'Separate receptionist login',
      'Hospital/clinic unique code',
      'Doctor approval for joining requests',
      'Role-based permissions',
    ],
    iconName: 'UserCheck',
  },
];

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: '01',
    title: 'Create your doctor account',
    description: 'Sign up with your name, medical specialization, and clinic contact details in under two minutes.',
  },
  {
    step: '02',
    title: 'Set up your clinic profile',
    description: 'Add your clinic name, consultation timings, letterhead details, and generate your unique clinic code.',
  },
  {
    step: '03',
    title: 'Invite your receptionist',
    description: 'Share your clinic code with your front-desk staff and approve their join request with role-based permissions.',
  },
  {
    step: '04',
    title: 'Start managing patients',
    description: 'Register walk-in patients, call the next token, issue digital prescriptions, and schedule follow-ups.',
  },
];

export const TESTIMONIAL_PLACEHOLDERS = [
  {
    id: 'placeholder-1',
    doctorName: 'Doctor Name Placeholder',
    specialty: 'General Physician · Independent Clinic',
    clinicName: 'Clinic Name & City Placeholder',
    quote:
      'Placeholder for verified practitioner feedback. This space will feature real experiences from solo general practitioners once post-launch onboarding completes.',
  },
  {
    id: 'placeholder-2',
    doctorName: 'Doctor Name Placeholder',
    specialty: 'Pediatrician · 2-Doctor Practice',
    clinicName: 'Clinic Name & City Placeholder',
    quote:
      'Placeholder for verified practitioner feedback. Reserved for specialist clinic owners sharing how token queues and digital prescriptions fit their daily workflow.',
  },
  {
    id: 'placeholder-3',
    doctorName: 'Doctor Name Placeholder',
    specialty: 'Dermatologist · Outpatient Clinic',
    clinicName: 'Clinic Name & City Placeholder',
    quote:
      'Placeholder for verified practitioner feedback. Real doctor quotes, clinic names, and portraits will be published only after verified customer permission.',
  },
];

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For solo practitioners digitizing daily consultations and prescriptions.',
    monthlyPrice: 499,
    annualMonthlyPrice: 399,
    features: [
      'Patient registration',
      'Patient queue',
      'Basic consultations',
      'Prescription creation',
      'One doctor',
    ],
    ctaLabel: 'Choose Starter',
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'For independent clinics with a receptionist and regular follow-up care.',
    monthlyPrice: 999,
    annualMonthlyPrice: 799,
    recommended: true,
    features: [
      'Everything in Starter',
      'Follow-up appointments',
      'WhatsApp notifications',
      'Prescription templates',
      'Receptionist access',
    ],
    ctaLabel: 'Get Started Free',
  },
  {
    id: 'clinic-plus',
    name: 'Clinic Plus',
    tagline: 'For small group clinics with 2–5 doctors and extended front-desk staff.',
    monthlyPrice: 1999,
    annualMonthlyPrice: 1599,
    features: [
      'Everything in Professional',
      'Multiple doctors',
      'Advanced reports',
      'Additional staff access',
      'Priority support',
    ],
    ctaLabel: 'Choose Clinic Plus',
  },
];

export const SECURITY_PILLARS = [
  {
    title: 'Individual user accounts',
    description:
      'Every doctor and staff member signs in with their own credentials rather than sharing a single clinic password.',
  },
  {
    title: 'Role-based access',
    description:
      'Receptionists handle registrations, queues, and scheduling while clinical notes and prescriptions stay scoped to the doctor.',
  },
  {
    title: 'Secure authentication',
    description:
      'Session boundaries and encrypted transport protect account logins across clinic desktops, tablets, and mobile browsers.',
  },
  {
    title: 'Protected patient records',
    description:
      'Patient demographics, visit history, and prescription documents are isolated per clinic workspace.',
  },
  {
    title: 'Controlled receptionist access',
    description:
      'Staff join via your clinic’s unique code and cannot view clinic queues until you explicitly approve their request.',
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'suitable-for-small-clinics',
    question: 'Is this software suitable for small clinics?',
    answer:
      'Yes. Cliniqo is built specifically for solo doctors and small clinics with 1–5 doctors and 1–2 receptionists. Unlike heavy hospital ERPs, there are no inpatient bed modules, pharmacy billing trees, or complex departmental menus getting in the way of routine outpatient care.',
  },
  {
    id: 'receptionist-usage',
    question: 'Can my receptionist use the application?',
    answer:
      'Yes. Your receptionist receives a separate login linked to your clinic via a unique clinic code. Once you approve their joining request, they can register walk-in patients, issue queue tokens, and manage appointment rescheduling without accessing private doctor-only settings.',
  },
  {
    id: 'digital-prescriptions',
    question: 'Can I create digital prescriptions?',
    answer:
      'Yes. You can search medicines, pick dosage patterns and frequency, apply saved prescription templates for common cases, let the system calculate total tablet or bottle quantities automatically, and export a clean PDF or print on your clinic letterhead.',
  },
  {
    id: 'follow-up-appointments',
    question: 'Can I schedule follow-up appointments?',
    answer:
      'Yes. Directly from the consultation or front-desk screen, you can set a follow-up visit date (for example, in 5 days or 2 weeks) and easily reschedule if a patient calls ahead.',
  },
  {
    id: 'whatsapp-reminders',
    question: 'Will patients receive WhatsApp reminders?',
    answer:
      'Yes, on the Professional and Clinic Plus plans, patients receive automated WhatsApp appointment confirmations when booked and timely follow-up reminders ahead of their visit.',
  },
  {
    id: 'mobile-access',
    question: 'Can I access the application from my phone?',
    answer:
      'Yes. Cliniqo is designed as a responsive web platform so you can review your waiting queue, check past visit summaries, or confirm follow-up schedules from your smartphone, tablet, or clinic desktop.',
  },
  {
    id: 'how-to-start',
    question: 'How do I get started?',
    answer:
      'Click "Get Started Free" to request early access and reserve your clinic profile. Once your account is provisioned, you set up your clinic details, share your unique clinic code with your receptionist, and begin managing patients right away.',
  },
];

export const INITIAL_DEMO_QUEUE: DemoPatient[] = [
  {
    id: 'p-101',
    token: 'T-01',
    name: 'Aarav Kulkarni',
    age: 34,
    gender: 'M',
    visitType: 'New Visit',
    status: 'In Consultation',
    arrivalTime: '09:45 AM',
    chiefComplaint: 'Persistent dry cough and mild fever for 3 days',
  },
  {
    id: 'p-102',
    token: 'T-02',
    name: 'Meera Nair',
    age: 52,
    gender: 'F',
    visitType: 'Follow-up',
    status: 'Waiting',
    arrivalTime: '09:58 AM',
    chiefComplaint: 'Blood pressure review · 14-day follow-up',
  },
  {
    id: 'p-103',
    token: 'T-03',
    name: 'Rohan Deshmukh',
    age: 28,
    gender: 'M',
    visitType: 'New Visit',
    status: 'Waiting',
    arrivalTime: '10:06 AM',
    chiefComplaint: 'Seasonal allergic rhinitis & sinus congestion',
  },
  {
    id: 'p-104',
    token: 'T-04',
    name: 'Kavita Iyer',
    age: 41,
    gender: 'F',
    visitType: 'Follow-up',
    status: 'Waiting',
    arrivalTime: '10:14 AM',
    chiefComplaint: 'Thyroid lab report review',
  },
];

export const DEMO_APPOINTMENTS: DemoAppointment[] = [
  {
    id: 'a-1',
    patientName: 'Suresh Menon',
    dateLabel: 'Tomorrow',
    timeSlot: '10:30 AM',
    reason: 'Post-antibiotic review',
    whatsappStatus: 'Confirmed via WhatsApp',
  },
  {
    id: 'a-2',
    patientName: 'Ananya Verma',
    dateLabel: 'Tomorrow',
    timeSlot: '11:15 AM',
    reason: 'Fasting glucose follow-up',
    whatsappStatus: 'Reminder Scheduled',
  },
  {
    id: 'a-3',
    patientName: 'Prakash Joshi',
    dateLabel: 'Thu, 19 Nov',
    timeSlot: '05:45 PM',
    reason: 'Hypertension check-in',
    whatsappStatus: 'Confirmed via WhatsApp',
  },
];

export const MEDICINE_CATALOG: MedicineTemplateItem[] = [
  {
    id: 'med-1',
    name: 'Paracetamol',
    strength: '650 mg Tablet',
    defaultPattern: '1-0-1',
    dosesPerDay: 2,
    defaultDays: 5,
    instruction: 'After meals if fever > 100°F',
  },
  {
    id: 'med-2',
    name: 'Azithromycin',
    strength: '500 mg Tablet',
    defaultPattern: '1-0-0',
    dosesPerDay: 1,
    defaultDays: 3,
    instruction: 'Once daily 1 hour before lunch',
  },
  {
    id: 'med-3',
    name: 'Montelukast + Levocetirizine',
    strength: '10 mg / 5 mg Tablet',
    defaultPattern: '0-0-1',
    dosesPerDay: 1,
    defaultDays: 7,
    instruction: 'At bedtime after dinner',
  },
  {
    id: 'med-4',
    name: 'Pantoprazole',
    strength: '40 mg Tablet',
    defaultPattern: '1-0-0',
    dosesPerDay: 1,
    defaultDays: 7,
    instruction: '30 minutes before breakfast',
  },
];
