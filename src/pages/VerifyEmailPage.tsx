import { sendEmailVerification } from 'firebase/auth';
import { CheckCircle2, Loader2, MailCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resolveAuthorizedRoute } from '../components/RouteGuards';
import { useAuth } from '../context/AuthContext';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, reloadVerificationState, refreshWorkspace, logout } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckVerification = async () => {
    setError(null);
    setStatusMessage(null);
    setChecking(true);
    try {
      const verified = await reloadVerificationState();
      if (verified) {
        const workspace = await refreshWorkspace();
        navigate(resolveAuthorizedRoute(workspace), { replace: true });
      } else {
        setError(
          'Your email is not verified yet. Please click the verification link in your inbox (check spam if needed) and try again.',
        );
      }
    } catch {
      setError('Unable to check verification status right now. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResendEmail = async () => {
    if (!user) return;
    setError(null);
    setStatusMessage(null);
    setResending(true);
    try {
      await sendEmailVerification(user);
      setStatusMessage(`A new verification email has been sent to ${user.email}.`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/too-many-requests') {
        setError('Please wait a moment before requesting another verification email.');
      } else {
        setError('Failed to send verification email. Please try again shortly.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AuthLayout
      kicker="Step 1 · Email Verification"
      title="Verify your email address"
      subtitle={`We sent a verification link to ${user?.email || 'your email'}. Verify your inbox to continue.`}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3.5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-slate-700">
            Open the verification email from Cliniqo and click the confirmation link. Once
            confirmed, return here and click <strong>I&apos;ve Verified My Email</strong>.
          </div>
        </div>

        {statusMessage && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
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

        <div className="space-y-3">
          <button
            type="button"
            disabled={checking}
            onClick={handleCheckVerification}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 disabled:opacity-60 cursor-pointer"
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking status...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                I&apos;ve Verified My Email
              </>
            )}
          </button>

          <button
            type="button"
            disabled={resending}
            onClick={handleResendEmail}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#0B192C] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            {resending ? 'Sending email...' : 'Resend Verification Email'}
          </button>
        </div>

        <div className="border-t border-slate-200/70 pt-4 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-medium text-slate-500 hover:text-[#0B192C] underline cursor-pointer"
          >
            Sign out and use another account
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
