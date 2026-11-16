import { ArrowLeft, ArrowRight, Building2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OnboardingLayout } from '../components/OnboardingLayout';
import { useAuth } from '../context/AuthContext';
import {
  WORKING_DAYS_OPTIONS,
  type ClinicOnboardingInput,
  type WorkingDay,
} from '../lib/clinicService';
import { compressImageToDataUrl } from '../lib/imageUtils';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  DEFAULT_CLINIC_DRAFT,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from '../lib/onboardingStorage';

export function OnboardingClinicPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const stage: 'details' | 'config' =
    searchParams.get('stage') === 'config' ? 'config' : 'details';

  const [form, setForm] = useState<ClinicOnboardingInput>({ ...DEFAULT_CLINIC_DRAFT });
  const [initialized, setInitialized] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || initialized) return;
    const draft = loadOnboardingDraft(user.uid);
    setForm({
      ...DEFAULT_CLINIC_DRAFT,
      ...draft.clinic,
      phone: draft.clinic.phone || profile?.mobile || '',
    });
    setInitialized(true);
  }, [user, profile, initialized]);

  const updateField = <K extends keyof ClinicOnboardingInput>(
    key: K,
    value: ClinicOnboardingInput[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (user) {
        const draft = loadOnboardingDraft(user.uid);
        saveOnboardingDraft(user.uid, { ...draft, clinic: next });
      }
      return next;
    });
  };

  const toggleDay = (day: WorkingDay) => {
    const exists = form.workingDays.includes(day);
    const nextDays = exists
      ? form.workingDays.filter((d) => d !== day)
      : WORKING_DAYS_OPTIONS.filter((d) => d === day || form.workingDays.includes(d));
    updateField('workingDays', nextDays);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 160, 0.8);
      updateField('logoUrl', dataUrl);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to process clinic logo.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDetailsNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setError('Please enter your clinic name.');
      return;
    }
    if (form.address.trim().length < 3) {
      setError('Please enter the clinic street address.');
      return;
    }
    if (form.city.trim().length < 2 || form.state.trim().length < 2) {
      setError('Please enter both city and state.');
      return;
    }
    if (!/^[a-zA-Z0-9\s-]{4,12}$/.test(form.pincode.trim())) {
      setError('Please enter a valid PIN code.');
      return;
    }
    if (!/^[+\d\s()-]{7,20}$/.test(form.phone.trim())) {
      setError('Please enter a valid clinic phone number.');
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid optional clinic email or leave it blank.');
      return;
    }
    setError(null);
    setSearchParams({ stage: 'config' });
  };

  const handleConfigNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(form.consultationFee) < 0 || Number(form.consultationFee) > 100000) {
      setError('Please enter a valid consultation fee in INR.');
      return;
    }
    if (!form.openingTime || !form.closingTime || form.openingTime >= form.closingTime) {
      setError('Clinic opening time must be earlier than closing time.');
      return;
    }
    if (form.workingDays.length === 0) {
      setError('Please select at least one working day.');
      return;
    }
    if (Number(form.appointmentDuration) < 5 || Number(form.appointmentDuration) > 180) {
      setError('Appointment duration must be between 5 and 180 minutes.');
      return;
    }

    setError(null);
    if (user) {
      const draft = loadOnboardingDraft(user.uid);
      saveOnboardingDraft(user.uid, { ...draft, clinic: form });
    }
    navigate('/onboarding/review');
  };

  if (stage === 'details') {
    return (
      <OnboardingLayout
        currentStep={2}
        title="Clinic Details"
        subtitle="Tell us where your clinic operates so patients and staff see accurate clinic details."
      >
        <form onSubmit={handleDetailsNext} className="space-y-6" noValidate>
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/70 pb-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-400">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt="Clinic logo preview"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Building2 className="h-7 w-7" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Clinic logo (optional)</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  {uploadingLogo ? 'Processing...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="sr-only"
                  />
                </label>
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={() => updateField('logoUrl', '')}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="clinic-name" className="block text-xs font-semibold text-slate-700">
                Clinic name
              </label>
              <input
                id="clinic-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="CareFirst Family Clinic"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="clinic-addr" className="block text-xs font-semibold text-slate-700">
                Clinic address
              </label>
              <input
                id="clinic-addr"
                type="text"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="204, Sapphire Arcade, MG Road"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label htmlFor="clinic-city" className="block text-xs font-semibold text-slate-700">
                City
              </label>
              <input
                id="clinic-city"
                type="text"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="Pune"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label htmlFor="clinic-state" className="block text-xs font-semibold text-slate-700">
                State
              </label>
              <input
                id="clinic-state"
                type="text"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
                placeholder="Maharashtra"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label htmlFor="clinic-pin" className="block text-xs font-semibold text-slate-700">
                PIN code
              </label>
              <input
                id="clinic-pin"
                type="text"
                value={form.pincode}
                onChange={(e) => updateField('pincode', e.target.value)}
                placeholder="411001"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label htmlFor="clinic-phone" className="block text-xs font-semibold text-slate-700">
                Clinic phone number
              </label>
              <input
                id="clinic-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+91 20 2612 4400"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="clinic-email" className="block text-xs font-semibold text-slate-700">
                Clinic email (optional)
              </label>
              <input
                id="clinic-email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="reception@carefirstclinic.in"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-5">
            <button
              type="button"
              onClick={() => navigate('/onboarding/doctor')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button
              type="submit"
              disabled={uploadingLogo}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
            >
              Continue to Configuration
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      currentStep={3}
      title="Clinic Configuration"
      subtitle="Set your standard consultation fee, daily hours, working days, and slot duration."
    >
      <form onSubmit={handleConfigNext} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="cfg-fee" className="block text-xs font-semibold text-slate-700">
              Consultation fee (INR)
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                ₹
              </span>
              <input
                id="cfg-fee"
                type="number"
                min={0}
                max={100000}
                value={form.consultationFee}
                onChange={(e) => updateField('consultationFee', Number(e.target.value))}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-8 pr-16 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                INR
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="cfg-duration" className="block text-xs font-semibold text-slate-700">
              Appointment duration
            </label>
            <select
              id="cfg-duration"
              value={form.appointmentDuration}
              onChange={(e) => updateField('appointmentDuration', Number(e.target.value))}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={20}>20 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
            </select>
          </div>

          <div>
            <label htmlFor="cfg-open" className="block text-xs font-semibold text-slate-700">
              Clinic opening time
            </label>
            <input
              id="cfg-open"
              type="time"
              value={form.openingTime}
              onChange={(e) => updateField('openingTime', e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="cfg-close" className="block text-xs font-semibold text-slate-700">
              Clinic closing time
            </label>
            <input
              id="cfg-close"
              type="time"
              value={form.closingTime}
              onChange={(e) => updateField('closingTime', e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <span className="block text-xs font-semibold text-slate-700">Working days</span>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAYS_OPTIONS.map((day) => {
                const selected = form.workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day)}
                    className={`min-h-[40px] min-w-[52px] rounded-xl border px-3 text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'border-sky-600 bg-sky-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-800"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-5">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSearchParams({ stage: 'details' });
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 cursor-pointer"
          >
            Review Details
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
