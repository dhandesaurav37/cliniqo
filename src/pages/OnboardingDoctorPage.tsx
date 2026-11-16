import { ArrowRight, Loader2, Upload, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OnboardingLayout } from '../components/OnboardingLayout';
import { useAuth } from '../context/AuthContext';
import { updateDoctorProfile, type DoctorOnboardingInput } from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import { compressImageToDataUrl } from '../lib/imageUtils';
import { loadOnboardingDraft, saveOnboardingDraft } from '../lib/onboardingStorage';

export function OnboardingDoctorPage() {
  const { user, profile, refreshWorkspace } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<DoctorOnboardingInput>({
    fullName: '',
    photoURL: '',
    qualification: '',
    specialization: '',
    registrationNumber: '',
    experience: 0,
    consultationTimings: '09:30 AM – 01:30 PM, 05:00 PM – 08:30 PM',
  });
  const [initialized, setInitialized] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || initialized) return;
    const draft = loadOnboardingDraft(user.uid);
    setForm({
      fullName: draft.doctor.fullName || profile?.fullName || user.displayName || '',
      photoURL: draft.doctor.photoURL || profile?.photoURL || '',
      qualification: draft.doctor.qualification || profile?.qualification || '',
      specialization: draft.doctor.specialization || profile?.specialization || '',
      registrationNumber: draft.doctor.registrationNumber || profile?.registrationNumber || '',
      experience:
        draft.doctor.experience || (typeof profile?.experience === 'number' ? profile.experience : 0),
      consultationTimings:
        draft.doctor.consultationTimings ||
        profile?.consultationTimings ||
        '09:30 AM – 01:30 PM, 05:00 PM – 08:30 PM',
    });
    setInitialized(true);
  }, [user, profile, initialized]);

  const updateField = <K extends keyof DoctorOnboardingInput>(
    key: K,
    value: DoctorOnboardingInput[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (user) {
        const draft = loadOnboardingDraft(user.uid);
        saveOnboardingDraft(user.uid, { ...draft, doctor: next });
      }
      return next;
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 160, 0.78);
      updateField('photoURL', dataUrl);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to process image.'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (form.fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (form.qualification.trim().length < 2) {
      setError('Please enter your medical qualification (e.g., MBBS, MD).');
      return;
    }
    if (form.specialization.trim().length < 2) {
      setError('Please enter your primary specialization.');
      return;
    }
    if (form.registrationNumber.trim().length < 3) {
      setError('Please enter your medical registration number.');
      return;
    }
    if (Number(form.experience) < 0 || Number(form.experience) > 80) {
      setError('Years of experience must be between 0 and 80.');
      return;
    }
    if (form.consultationTimings.trim().length < 3) {
      setError('Please provide your typical consultation timings.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const draft = loadOnboardingDraft(user.uid);
      saveOnboardingDraft(user.uid, { ...draft, doctor: form });
      await updateDoctorProfile(user.uid, form);
      await refreshWorkspace();
      navigate('/onboarding/clinic');
    } catch (err: unknown) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          'Could not save your doctor profile. Please verify your email and try again.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      currentStep={1}
      title="Doctor Profile"
      subtitle="Add your medical credentials. These details appear on your clinic workspace and letterhead."
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2.5 text-xs text-slate-700">
        <span>Invited to an existing clinic as a receptionist?</span>
        <Link to="/join-clinic" className="font-semibold text-sky-700 hover:underline">
          Join with a clinic code &rarr;
        </Link>
      </div>
      <form onSubmit={handleContinue} className="space-y-6" noValidate>
        {/* Profile Photo Upload */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/70 pb-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-400">
            {form.photoURL ? (
              <img
                src={form.photoURL}
                alt="Doctor profile preview"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserRound className="h-7 w-7" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-700">Profile photo (optional)</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer">
                <Upload className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                {uploadingPhoto ? 'Processing...' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoSelect}
                  className="sr-only"
                />
              </label>
              {form.photoURL && (
                <button
                  type="button"
                  onClick={() => updateField('photoURL', '')}
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
            <label htmlFor="doc-name" className="block text-xs font-semibold text-slate-700">
              Full name
            </label>
            <input
              id="doc-name"
              type="text"
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              placeholder="Dr. Ananya Deshmukh"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="doc-qual" className="block text-xs font-semibold text-slate-700">
              Medical qualification
            </label>
            <input
              id="doc-qual"
              type="text"
              value={form.qualification}
              onChange={(e) => updateField('qualification', e.target.value)}
              placeholder="MBBS, MD (Medicine)"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="doc-spec" className="block text-xs font-semibold text-slate-700">
              Specialization
            </label>
            <input
              id="doc-spec"
              type="text"
              value={form.specialization}
              onChange={(e) => updateField('specialization', e.target.value)}
              placeholder="General Physician"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="doc-reg" className="block text-xs font-semibold text-slate-700">
              Medical registration number
            </label>
            <input
              id="doc-reg"
              type="text"
              value={form.registrationNumber}
              onChange={(e) => updateField('registrationNumber', e.target.value)}
              placeholder="MMC-2016/04/1842"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm text-[#0B192C] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="doc-exp" className="block text-xs font-semibold text-slate-700">
              Years of experience
            </label>
            <input
              id="doc-exp"
              type="number"
              min={0}
              max={80}
              value={form.experience}
              onChange={(e) => updateField('experience', Number(e.target.value))}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B192C] tabular-nums focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="doc-timings" className="block text-xs font-semibold text-slate-700">
              Consultation timings
            </label>
            <input
              id="doc-timings"
              type="text"
              value={form.consultationTimings}
              onChange={(e) => updateField('consultationTimings', e.target.value)}
              placeholder="09:30 AM – 01:30 PM, 05:00 PM – 08:30 PM"
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
          <p className="text-xs text-slate-500">Progress is saved automatically.</p>
          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                Continue to Clinic Details
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
