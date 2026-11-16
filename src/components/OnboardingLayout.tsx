import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { useAuth } from '../context/AuthContext';

interface OnboardingLayoutProps {
  currentStep: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  children: ReactNode;
}

const STEPS = [
  { num: 1, label: 'Doctor Profile' },
  { num: 2, label: 'Clinic Details' },
  { num: 3, label: 'Configuration' },
  { num: 4, label: 'Review & Create' },
] as const;

export function OnboardingLayout({
  currentStep,
  title,
  subtitle,
  children,
}: OnboardingLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F8FD] text-[#0B192C] relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_75%_65%_at_50%_0%,rgba(186,230,253,0.48),rgba(244,248,253,0)_72%)]"
      />

      <header className="w-full border-b border-slate-200/70 bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        {/* 4-Step Progress Indicator */}
        <nav aria-label="Onboarding progress" className="mb-8">
          <ol className="grid grid-cols-4 gap-2 sm:gap-4">
            {STEPS.map((s) => {
              const isCompleted = s.num < currentStep;
              const isCurrent = s.num === currentStep;
              return (
                <li key={s.num} className="space-y-2">
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      isCompleted || isCurrent
                        ? 'bg-gradient-to-r from-[#0284C7] to-[#0891B2]'
                        : 'bg-slate-200'
                    }`}
                  />
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        isCurrent
                          ? 'text-sky-700'
                          : isCompleted
                            ? 'text-[#0B192C]'
                            : 'text-slate-400'
                      }`}
                    >
                      0{s.num}
                    </span>
                    <span
                      className={`hidden sm:inline truncate ${
                        isCurrent
                          ? 'font-semibold text-[#0B192C]'
                          : isCompleted
                            ? 'text-slate-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mb-6 space-y-1.5">
          <p className="text-xs font-semibold text-sky-700 tabular-nums">
            Step {currentStep} of 4
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C]">
            {title}
          </h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="lucid-glass rounded-3xl p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
