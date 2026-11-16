import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resolveAuthorizedRoute } from '../components/RouteGuards';
import { useAuth } from '../context/AuthContext';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import {
  createInitialUserProfile,
  normalizeClinicCode,
  resolveClinicCode,
  submitClinicJoinRequest,
  updateBasicStaffProfile,
  type PublicClinicPreview,
} from '../lib/clinicService';
import { auth } from '../lib/firebase';

type JoinStep = 1 | 2 | 3 | 4;

function formatJoinAuthError(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in first to join this clinic with your existing account without creating duplicates.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-up is not enabled in Firebase Console yet. Enable it in Firebase Console or continue with Google below.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completion.';
    default:
      return 'Unable to complete authentication right now. Please try again.';
  }
}

export function JoinClinicPage() {
  const navigate = useNavigate();
  const {
    user,
    profile,
    membership,
    clinic,
    joinRequest,
    refreshWorkspace,
    reloadVerificationState,
  } = useAuth();

  const [step, setStep] = useState<JoinStep>(1);
  const [codeInput, setCodeInput] = useState('');
  const [foundClinic, setFoundClinic] = useState<PublicClinicPreview | null>(null);
  const [findingClinic, setFindingClinic] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill existing authenticated user details so we never create duplicate Auth accounts
  useEffect(() => {
    if (user) {
      setFullName((prev) => prev || profile?.fullName || user.displayName || '');
      setEmail((prev) => prev || profile?.email || user.email || '');
      if (profile?.mobile && profile.mobile !== 'Not provided') {
        setMobile((prev) => prev || profile.mobile);
      }
    }
  }, [user, profile]);

  // If user already has an active/pending/revoked clinic relationship, guide them appropriately
  useEffect(() => {
    if (submittedSuccess) return;
    if (user && user.emailVerified) {
      if ((membership?.status === 'active' && clinic) || joinRequest?.status === 'pending') {
        navigate(resolveAuthorizedRoute({ membership, clinic, joinRequest }), { replace: true });
      }
    }
  }, [user, membership, clinic, joinRequest, navigate, submittedSuccess]);

  const handleFindClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    const normalized = normalizeClinicCode(codeInput);
    if (!normalized) {
      setError('Please enter the clinic joining code shared by your doctor.');
      return;
    }

    setFindingClinic(true);
    try {
      const preview = await resolveClinicCode(normalized);
      setCodeInput(preview.code);
      setFoundClinic(preview);
    } catch (err: unknown) {
      setFoundClinic(null);
      setError(getUserFriendlyErrorMessage(err, 'Unable to find clinic for that code.'));
    } finally {
      setFindingClinic(false);
    }
  };

  const handleContinueFromStep1 = () => {
    if (!foundClinic) return;
    setError(null);
    setStatusMessage(null);
    if (user && user.uid === foundClinic.clinicOwnerId) {
      setError('You are the owner of this clinic and already manage it.');
      return;
    }
    setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanMobile = mobile.trim();

    if (cleanName.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[+\d\s()-]{7,20}$/.test(cleanMobile)) {
      setError('Please enter a valid mobile number.');
      return;
    }

    // Case A: Reuse existing authenticated Firebase account (no duplicate user creation)
    if (user) {
      setBusy(true);
      try {
        await updateBasicStaffProfile({
          uid: user.uid,
          fullName: cleanName,
          mobile: cleanMobile,
        });
        await refreshWorkspace();
        if (user.emailVerified) {
          setStep(4);
        } else {
          setStep(3);
        }
      } catch (err: unknown) {
        setError(getUserFriendlyErrorMessage(err, 'Could not update your profile.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Case B: New receptionist account creation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      await createInitialUserProfile({
        uid: cred.user.uid,
        fullName: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
      });
      await sendEmailVerification(cred.user);
      await refreshWorkspace();
      setStep(3);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(formatJoinAuthError(code));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (!acceptTerms && !user) {
      setError('Please accept the Terms of Service and Privacy Policy first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await refreshWorkspace();
      setFullName((prev) => prev || cred.user.displayName || '');
      setEmail(cred.user.email || '');
      if (cred.user.emailVerified) {
        setStep(2);
      } else {
        setStep(3);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(formatJoinAuthError(code));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const verified = await reloadVerificationState();
      if (verified) {
        setStep(4);
      } else {
        setError(
          'Your email is not verified yet. Click the link sent to your inbox and try again.',
        );
      }
    } catch {
      setError('Unable to check verification status right now.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setError(null);
    setStatusMessage(null);
    setResending(true);
    try {
      await sendEmailVerification(user);
      setStatusMessage(`A verification email was sent to ${user.email}.`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(
        code === 'auth/too-many-requests'
          ? 'Please wait a moment before requesting another verification email.'
          : 'Unable to send verification email right now.',
      );
    } finally {
      setResending(false);
    }
  };

  const handleSubmitJoinRequest = async () => {
    if (!user || !foundClinic) return;
    setError(null);
    setBusy(true);
    try {
      await submitClinicJoinRequest({
        uid: user.uid,
        clinic: foundClinic,
        applicantName: fullName.trim() || profile?.fullName || user.displayName || 'Receptionist',
        applicantEmail: user.email || email.trim(),
        applicantMobile: mobile.trim() || profile?.mobile || 'Not provided',
      });
      await refreshWorkspace();
      setSubmittedSuccess(true);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err, 'Unable to submit joining request.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      kicker={`Join Existing Clinic · Step ${step} of 4`}
      title="Join your clinic team"
      subtitle="Enter your clinic joining code, verify your account, and request receptionist access from the clinic administrator."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-sky-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {/* Top Switcher between Option 1 and Option 2 */}
        {!submittedSuccess && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Link
              to="/register"
              className="rounded-2xl border border-slate-200 bg-white/85 p-3.5 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-[#0B192C]">
                <Building2 className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                <span className="font-display text-xs font-bold">Create a Clinic</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                For doctors setting up their own clinic.
              </p>
            </Link>

            <div className="rounded-2xl border-2 border-sky-600 bg-sky-50/75 p-3.5 text-left">
              <div className="flex items-center gap-2 text-sky-800">
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-display text-xs font-bold">Join Existing Clinic</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                For receptionists with a clinic code.
              </p>
            </div>
          </div>
        )}

        {/* Step Progress Bar */}
        {!submittedSuccess && (
          <div className="flex items-center gap-2 border-t border-slate-200/70 pt-4" aria-hidden="true">
            {[1, 2, 3, 4].map((num) => (
              <div
                key={num}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  step >= num ? 'bg-sky-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        )}

        {/* STEP 1: Enter Clinic Code & Verify Public Clinic Name/Address */}
        {step === 1 && !submittedSuccess && (
          <div className="space-y-4">
            <form onSubmit={handleFindClinic} className="space-y-3" noValidate>
              <div>
                <label htmlFor="join-code" className="block text-xs font-semibold text-slate-700">
                  Clinic joining code
                </label>
                <div className="mt-1.5 flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="join-code"
                      type="text"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="CLINIC-XXXXX"
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 pl-9 pr-3.5 font-mono text-sm uppercase tracking-wider text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={findingClinic}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0B192C] px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    {findingClinic ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      'Find Clinic'
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Ask your doctor for their clinic joining code. Entering a code only verifies the
                  clinic and never grants automatic access.
                </p>
              </div>
            </form>

            {foundClinic && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-sky-200 text-sky-700">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-sky-800">Verified Clinic</p>
                    <h2 className="font-display text-base font-bold text-[#0B192C]">
                      {foundClinic.clinicName}
                    </h2>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>{foundClinic.publicAddress}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleContinueFromStep1}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 cursor-pointer"
                >
                  Continue with This Clinic
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Receptionist Profile */}
        {step === 2 && foundClinic && !submittedSuccess && (
          <form onSubmit={handleStep2Submit} className="space-y-4" noValidate>
            <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between gap-2">
              <span className="truncate">
                Joining <strong className="text-[#0B192C]">{foundClinic.clinicName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sky-700 font-semibold hover:underline shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>

            {user && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs text-sky-900">
                Signed in as <strong>{user.email}</strong>. Your existing verified account will be
                reused—no duplicate account will be created.
              </div>
            )}

            <div>
              <label htmlFor="staff-name" className="block text-xs font-semibold text-slate-700">
                Full name
              </label>
              <input
                id="staff-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Priya Kulkarni"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            <div>
              <label htmlFor="staff-email" className="block text-xs font-semibold text-slate-700">
                Email address
              </label>
              <input
                id="staff-email"
                type="email"
                autoComplete="email"
                disabled={Boolean(user)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reception@clinic.in"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="staff-mobile" className="block text-xs font-semibold text-slate-700">
                Mobile number
              </label>
              <input
                id="staff-mobile"
                type="tel"
                autoComplete="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+91 98200 12345"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C]"
              />
            </div>

            {!user && (
              <>
                <div>
                  <label htmlFor="staff-pass" className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="staff-pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 pl-3.5 pr-11 text-sm text-[#0B192C]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="staff-confirm"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Confirm password
                  </label>
                  <input
                    id="staff-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C]"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  <span>
                    I accept the Terms and Conditions and Privacy Policy for receptionist access.
                  </span>
                </label>
              </>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </div>

            {!user && (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200/80" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white/90 px-2.5 text-slate-500">or</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleContinue}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#0B192C] hover:bg-slate-50 cursor-pointer"
                >
                  Continue with Google
                </button>
              </>
            )}
          </form>
        )}

        {/* STEP 3: Email Verification */}
        {step === 3 && foundClinic && !submittedSuccess && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/75 p-4">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
              <div className="text-xs leading-relaxed text-slate-700">
                We sent a verification email to <strong>{user?.email || email}</strong>. Click the
                confirmation link in your inbox, then press <strong>I&apos;ve Verified My Email</strong>.
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleCheckVerification}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              I&apos;ve Verified My Email
            </button>

            <button
              type="button"
              disabled={resending}
              onClick={handleResendVerification}
              className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              {resending ? 'Sending email...' : 'Resend Verification Email'}
            </button>
          </div>
        )}

        {/* STEP 4: Submit Joining Request */}
        {step === 4 && foundClinic && !submittedSuccess && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-sky-800 font-semibold">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Ready to request receptionist access
              </div>
              <dl className="grid grid-cols-1 gap-2.5 border-t border-slate-200/70 pt-3">
                <div>
                  <dt className="text-slate-500">Target Clinic</dt>
                  <dd className="font-semibold text-[#0B192C]">{foundClinic.clinicName}</dd>
                  <dd className="text-slate-600">{foundClinic.publicAddress}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Applicant</dt>
                  <dd className="font-semibold text-[#0B192C]">{fullName || user?.displayName}</dd>
                  <dd className="text-slate-600">
                    {user?.email || email} · {mobile || profile?.mobile}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Requested Role</dt>
                  <dd className="font-semibold text-[#0B192C]">Receptionist (Pending Doctor Approval)</dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleSubmitJoinRequest}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting request...
                </>
              ) : (
                'Submit Access Request'
              )}
            </button>
          </div>
        )}

        {/* Submission Confirmation */}
        {submittedSuccess && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold text-[#0B192C]">Request Submitted</h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Your request has been sent to the clinic administrator. You will receive access
                after approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/join-request-pending', { replace: true })}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              View Request Status
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-emerald-800"
          >
            {statusMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-relaxed text-rose-800"
          >
            {error}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
