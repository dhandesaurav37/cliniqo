import { ArrowRight, Check, CheckCircle2, Copy, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';

export function ClinicWelcomePage() {
  const { clinic, profile } = useAuth();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const joiningCode = clinic?.joiningCode || '';

  const handleCopyCode = async () => {
    if (!joiningCode) return;
    try {
      await navigator.clipboard.writeText(joiningCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const inviteText = `Join ${clinic?.name || 'our clinic'} on Cliniqo as Receptionist using our clinic joining code: ${joiningCode || 'See Clinic Settings'}`;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteText);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2200);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F8FD] text-[#0B192C] relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_75%_65%_at_50%_0%,rgba(186,230,253,0.52),rgba(244,248,253,0)_72%)]"
      />

      <header className="w-full border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <span className="text-xs font-medium text-slate-500">Onboarding Complete</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-xl lucid-glass rounded-3xl p-7 sm:p-10 space-y-8">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0891B2] text-white shadow-[0_12px_26px_-8px_rgba(2,132,199,0.5)]">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C]">
              Your clinic is ready!
            </h1>
            <p className="text-sm sm:text-base text-slate-600">
              Your multi-tenant clinic profile and unique joining code are saved securely.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-b border-slate-200/70 pb-5">
              <div>
                <p className="text-xs text-slate-500">Clinic Name</p>
                <p className="mt-1 font-display text-base font-bold text-[#0B192C]">
                  {clinic?.name || 'Your Clinic'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Doctor &amp; Owner</p>
                <p className="mt-1 font-display text-base font-bold text-[#0B192C]">
                  {profile?.fullName || 'Doctor'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-600">Clinic Joining Code</p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-3">
                <span className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-[#0B192C] tabular-nums">
                  {clinic?.joiningCodeActive && joiningCode ? joiningCode : 'Revoked'}
                </span>
                {clinic?.joiningCodeActive && joiningCode && (
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copy Code
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Share this human-readable code only with staff members you want to invite to your
                clinic. You can regenerate or revoke it anytime in Clinic Settings.
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              <UserPlus className="h-4 w-4 text-sky-700" aria-hidden="true" />
              Invite Receptionist
            </button>

            <button
              type="button"
              onClick={() => navigate('/app/doctor/dashboard')}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 cursor-pointer"
            >
              Continue to Dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </main>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInviteOpen(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              aria-label="Close invite dialog"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-[#0B192C] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-xl font-bold text-[#0B192C]">
              Invite Your Receptionist
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Share your unique joining code with your receptionist. Once they submit a request via
              &ldquo;Join Existing Clinic&rdquo;, you can approve or decline them in{' '}
              <strong>Settings &rarr; Staff Management</strong>.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs text-[#0B192C] break-words">
              {inviteText}
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {inviteCopied ? 'Copied Message' : 'Copy Invite Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
