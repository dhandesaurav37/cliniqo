import { ArrowLeft, CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OnboardingLayout } from '../components/OnboardingLayout';
import { useAuth } from '../context/AuthContext';
import { createClinicWithUniqueCode } from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  type OnboardingDraft,
} from '../lib/onboardingStorage';

export function OnboardingReviewPage() {
  const { user, refreshWorkspace } = useAuth();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDraft(loadOnboardingDraft(user.uid));
  }, [user]);

  const handleCreateClinic = async () => {
    if (!user || !draft) return;

    if (!draft.doctor.fullName.trim() || !draft.doctor.qualification.trim()) {
      setError('Doctor profile details are incomplete. Please edit Step 1 before continuing.');
      return;
    }
    if (!draft.clinic.name.trim() || !draft.clinic.address.trim() || !draft.clinic.city.trim()) {
      setError('Clinic details are incomplete. Please edit Step 2 before continuing.');
      return;
    }

    setError(null);
    setCreating(true);
    try {
      await createClinicWithUniqueCode({
        uid: user.uid,
        doctor: draft.doctor,
        clinic: draft.clinic,
      });

      clearOnboardingDraft(user.uid);
      await refreshWorkspace();
      navigate('/app/welcome', { replace: true });
    } catch (err: unknown) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          'Unable to create your clinic right now. Please try again.',
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  if (!draft) return null;

  return (
    <OnboardingLayout
      currentStep={4}
      title="Review & Create Clinic"
      subtitle="Verify your profile and clinic configuration before generating your unique clinic joining code."
    >
      <div className="space-y-8">
        {/* Section 1: Doctor Profile */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200/75 pb-3">
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              01. Doctor Profile
            </h2>
            <Link
              to="/onboarding/doctor"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Full Name</dt>
              <dd className="font-medium text-[#0B192C]">{draft.doctor.fullName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Qualification</dt>
              <dd className="font-medium text-[#0B192C]">{draft.doctor.qualification || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Specialization</dt>
              <dd className="font-medium text-[#0B192C]">{draft.doctor.specialization || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Registration Number</dt>
              <dd className="font-mono font-medium text-[#0B192C]">
                {draft.doctor.registrationNumber || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Experience</dt>
              <dd className="font-medium text-[#0B192C] tabular-nums">
                {draft.doctor.experience} years
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Consultation Timings</dt>
              <dd className="font-medium text-[#0B192C]">
                {draft.doctor.consultationTimings || '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Section 2: Clinic Details */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200/75 pb-3">
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              02. Clinic Details
            </h2>
            <Link
              to="/onboarding/clinic?stage=details"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Clinic Name</dt>
              <dd className="font-medium text-[#0B192C]">{draft.clinic.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Clinic Phone</dt>
              <dd className="font-medium text-[#0B192C] tabular-nums">
                {draft.clinic.phone || '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Address</dt>
              <dd className="font-medium text-[#0B192C]">
                {draft.clinic.address}, {draft.clinic.city}, {draft.clinic.state} –{' '}
                {draft.clinic.pincode}
              </dd>
            </div>
            {draft.clinic.email && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Clinic Email</dt>
                <dd className="font-medium text-[#0B192C]">{draft.clinic.email}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Section 3: Clinic Configuration */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200/75 pb-3">
            <h2 className="font-display text-base font-bold text-[#0B192C]">
              03. Clinic Configuration
            </h2>
            <Link
              to="/onboarding/clinic?stage=config"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Consultation Fee</dt>
              <dd className="font-medium text-[#0B192C] tabular-nums">
                ₹{draft.clinic.consultationFee.toLocaleString('en-IN')} INR
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Slot Duration</dt>
              <dd className="font-medium text-[#0B192C] tabular-nums">
                {draft.clinic.appointmentDuration} minutes
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Operating Hours</dt>
              <dd className="font-medium text-[#0B192C] tabular-nums">
                {draft.clinic.openingTime} – {draft.clinic.closingTime}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Working Days</dt>
              <dd className="font-medium text-[#0B192C]">
                {draft.clinic.workingDays.join(', ')}
              </dd>
            </div>
          </dl>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-relaxed text-rose-800"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={creating}
            onClick={() => navigate('/onboarding/clinic?stage=config')}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          <button
            type="button"
            disabled={creating}
            onClick={handleCreateClinic}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 disabled:opacity-60 cursor-pointer"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating clinic...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Create My Clinic
              </>
            )}
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
