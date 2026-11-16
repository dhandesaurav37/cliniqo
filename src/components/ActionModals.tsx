import { CheckCircle2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ActiveModalType =
  | null
  | { type: 'get-started'; planName?: string }
  | { type: 'login' }
  | { type: 'contact' }
  | { type: 'privacy' }
  | { type: 'terms' };

interface ActionModalsProps {
  modal: ActiveModalType;
  onClose: () => void;
}

export function ActionModals({ modal, onClose }: ActionModalsProps) {
  const [doctorName, setDoctorName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clinicSize, setClinicSize] = useState('1 Doctor (Solo Practice)');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Login form state
  const [loginRole, setLoginRole] = useState<'doctor' | 'receptionist'>('doctor');
  const [loginEmail, setLoginEmail] = useState('');
  const [clinicCode, setClinicCode] = useState('');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  // Contact form state
  const [contactMessage, setContactMessage] = useState('');

  useEffect(() => {
    setFormError(null);
    setSubmitted(false);
    setLoginNotice(null);
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, onClose]);

  if (!modal) return null;

  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const handleGetStartedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (doctorName.trim().length < 2) {
      setFormError('Please enter your name.');
      return;
    }
    if (clinicName.trim().length < 2) {
      setFormError('Please enter your clinic name.');
      return;
    }
    if (!isValidEmail(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (phone.trim().length < 7) {
      setFormError('Please enter a valid contact number.');
      return;
    }
    setFormError(null);
    setSubmitted(true);
  };

  const handleLoginPreviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(loginEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (loginRole === 'receptionist' && clinicCode.trim().length < 4) {
      setFormError('Please enter your clinic’s unique code.');
      return;
    }
    setFormError(null);
    setLoginNotice(
      'This marketing preview does not connect to an authentication backend. Request early access via "Get Started Free" to receive clinic workspace onboarding.',
    );
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (contactMessage.trim().length < 8) {
      setFormError('Please write a brief message so we can assist you.');
      return;
    }
    setFormError(null);
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white/95 backdrop-blur-xl border border-white shadow-[0_28px_70px_-18px_rgba(11,25,44,0.28)] p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#0B192C] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {modal.type === 'get-started' && (
          <div>
            <p className="text-xs font-medium text-sky-700">Early Access Onboarding</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#0B192C]">
              Get started with Cliniqo
            </h2>
            {modal.planName && (
              <p className="mt-1 text-xs font-medium text-slate-600">
                Selected plan: {modal.planName}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">
              Leave your clinic details to reserve your workspace. No payment card is required.
            </p>

            {submitted ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  Early access request recorded
                </div>
                <p className="text-sm text-emerald-900/80">
                  Thank you, Dr. {doctorName.trim()}. This preview captured your interest for{' '}
                  <span className="font-semibold">{clinicName.trim()}</span> ({clinicSize}).
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  Return to Page
                </button>
              </div>
            ) : (
              <form onSubmit={handleGetStartedSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="gs-doctor" className="block text-xs font-semibold text-slate-700">
                    Doctor Name
                  </label>
                  <input
                    id="gs-doctor"
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g., Dr. Kavita Rao"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="gs-clinic" className="block text-xs font-semibold text-slate-700">
                    Clinic Name
                  </label>
                  <input
                    id="gs-clinic"
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="e.g., CareFirst Family Clinic"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gs-email" className="block text-xs font-semibold text-slate-700">
                      Email Address
                    </label>
                    <input
                      id="gs-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="doctor@clinic.in"
                      className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="gs-phone" className="block text-xs font-semibold text-slate-700">
                      Phone / WhatsApp
                    </label>
                    <input
                      id="gs-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98XXXXXXXX"
                      className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="gs-size" className="block text-xs font-semibold text-slate-700">
                    Clinic Size
                  </label>
                  <select
                    id="gs-size"
                    value={clinicSize}
                    onChange={(e) => setClinicSize(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option>1 Doctor (Solo Practice)</option>
                    <option>2–3 Doctors</option>
                    <option>4–5 Doctors</option>
                  </select>
                </div>

                {formError && (
                  <p className="text-xs font-medium text-rose-600" role="alert">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
                >
                  Request Early Access
                </button>
              </form>
            )}
          </div>
        )}

        {modal.type === 'login' && (
          <div>
            <p className="text-xs font-medium text-sky-700">Role-Separated Access</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#0B192C]">
              Clinic Sign In
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Doctors and receptionists sign in with separate role accounts linked by clinic code.
            </p>

            <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setLoginRole('doctor')}
                className={`min-h-[36px] rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  loginRole === 'doctor' ? 'bg-white text-[#0B192C] shadow-sm' : 'text-slate-600'
                }`}
              >
                Doctor Login
              </button>
              <button
                type="button"
                onClick={() => setLoginRole('receptionist')}
                className={`min-h-[36px] rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  loginRole === 'receptionist'
                    ? 'bg-white text-[#0B192C] shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Receptionist Login
              </button>
            </div>

            <form onSubmit={handleLoginPreviewSubmit} className="mt-5 space-y-4" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700">
                  Work Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@clinic.in"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {loginRole === 'receptionist' && (
                <div>
                  <label htmlFor="login-code" className="block text-xs font-semibold text-slate-700">
                    Unique Clinic Code
                  </label>
                  <input
                    id="login-code"
                    type="text"
                    value={clinicCode}
                    onChange={(e) => setClinicCode(e.target.value)}
                    placeholder="e.g., CLQ-4821"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              )}

              {formError && (
                <p className="text-xs font-medium text-rose-600" role="alert">
                  {formError}
                </p>
              )}
              {loginNotice && (
                <p
                  className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs leading-relaxed text-sky-900"
                  role="status"
                >
                  {loginNotice}
                </p>
              )}

              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#0B192C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Continue as {loginRole === 'doctor' ? 'Doctor' : 'Receptionist'}
              </button>
            </form>
          </div>
        )}

        {modal.type === 'contact' && (
          <div>
            <p className="text-xs font-medium text-sky-700">Clinic Inquiries</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#0B192C]">Contact Cliniqo</h2>
            <p className="mt-2 text-sm text-slate-600">
              Questions about onboarding a 1–5 doctor clinic or migrating from paper registers?
            </p>

            {submitted ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-2">
                <p className="text-sm font-semibold text-emerald-800">Message captured</p>
                <p className="text-sm text-emerald-900/80">
                  Thank you for reaching out. Our onboarding team will respond to {email}.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-semibold text-slate-700">
                    Your Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@clinic.in"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C]"
                  />
                </div>
                <div>
                  <label htmlFor="contact-msg" className="block text-xs font-semibold text-slate-700">
                    How can we help?
                  </label>
                  <textarea
                    id="contact-msg"
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Tell us about your clinic workflow or questions..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-[#0B192C]"
                  />
                </div>
                {formError && (
                  <p className="text-xs font-medium text-rose-600" role="alert">
                    {formError}
                  </p>
                )}
                <button
                  type="submit"
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-2.5 text-sm font-semibold text-white cursor-pointer"
                >
                  Send Message
                </button>
              </form>
            )}
          </div>
        )}

        {modal.type === 'privacy' && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-[#0B192C]">Privacy Policy</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Cliniqo treats clinic and patient information as strictly private to the authorized
              clinic workspace. Receptionist accounts are scoped to front-desk tasks and require
              explicit approval from the clinic doctor using a unique clinic code.
            </p>
            <p className="text-sm leading-relaxed text-slate-600">
              This marketing website demonstration uses only sample fictional patient records and
              does not collect or transmit real patient health information.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        )}

        {modal.type === 'terms' && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-[#0B192C]">
              Terms and Conditions
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Cliniqo provides workflow software for outpatient patient queues, digital
              prescriptions, and follow-up scheduling for independent clinics. All clinical
              decisions and prescriptions remain solely under the licensed practitioner&apos;s
              medical responsibility.
            </p>
            <p className="text-sm leading-relaxed text-slate-600">
              Pricing shown on this site reflects proposed launch tiers in INR and is subject to
              confirmation prior to paid workspace activation.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
