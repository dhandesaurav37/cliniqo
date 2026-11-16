import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { Building2, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resolveAuthorizedRoute } from '../components/RouteGuards';
import { useAuth } from '../context/AuthContext';
import { createInitialUserProfile } from '../lib/clinicService';
import { getUserFriendlyErrorMessage } from '../lib/errorUtils';
import { auth } from '../lib/firebase';

function formatRegisterError(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with letters and numbers.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-up is not enabled in Firebase Console yet. Enable it under Firebase Console → Authentication → Sign-in method → Email/Password, or register with Google below.';
    default:
      return 'Could not create your account right now. Please try again.';
  }
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { refreshWorkspace } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanMobile = mobile.trim();

    if (cleanName.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!/^[+\d\s()-]{7,20}$/.test(cleanMobile)) {
      setError('Please enter a valid mobile number.');
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

    setError(null);
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });

      await createInitialUserProfile({
        uid: cred.user.uid,
        fullName: cleanName,
        email: (cred.user.email || cleanEmail).toLowerCase(),
        mobile: cleanMobile,
      });

      await sendEmailVerification(cred.user);
      await refreshWorkspace();
      navigate('/verify-email', { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(
        code?.startsWith('auth/')
          ? formatRegisterError(code)
          : getUserFriendlyErrorMessage(err, 'Could not create your account right now. Please try again.'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (!acceptTerms) {
      setError('Please accept the Terms of Service and Privacy Policy first.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      const workspace = await refreshWorkspace();
      navigate(resolveAuthorizedRoute(workspace), { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(
        code?.startsWith('auth/')
          ? formatRegisterError(code)
          : getUserFriendlyErrorMessage(err, 'Could not complete Google registration. Please try again.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      kicker="Get Started with Cliniqo"
      title="Choose how you want to register"
      subtitle="Create a new clinic as a doctor, or join an existing clinic as invited reception staff."
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
        {/* Two Clearly Separated Registration Options */}
        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          role="navigation"
          aria-label="Registration type"
        >
          <div className="rounded-2xl border-2 border-sky-600 bg-sky-50/75 p-3.5 text-left">
            <div className="flex items-center gap-2 text-sky-800">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-display text-xs font-bold">Create a Clinic</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">
              For doctors setting up their own clinic.
            </p>
          </div>

          <Link
            to="/join-clinic"
            className="rounded-2xl border border-slate-200 bg-white/85 p-3.5 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-[#0B192C]">
              <UserPlus className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
              <span className="font-display text-xs font-bold">Join Existing Clinic</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">
              For receptionists with a clinic code.
            </p>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-200/70 pt-4" noValidate>
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700">
              Full name
            </label>
            <input
              id="reg-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Ananya Deshmukh"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700">
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@clinic.in"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="reg-mobile" className="block text-xs font-semibold text-slate-700">
              Mobile number
            </label>
            <input
              id="reg-mobile"
              type="tel"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98200 12345"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 pl-3.5 pr-11 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-[#0B192C] cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-xs font-semibold text-slate-700">
              Confirm password
            </label>
            <input
              id="reg-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3.5 text-sm text-[#0B192C] placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>
              I accept the Terms and Conditions and Privacy Policy for clinic workspace setup.
            </span>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-relaxed text-rose-800"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creating account...
              </>
            ) : (
              'Create Doctor Account'
            )}
          </button>

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
            disabled={loading}
            onClick={handleGoogleRegister}
            className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
