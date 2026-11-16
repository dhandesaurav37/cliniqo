import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { lazy, Suspense } from 'react';

const Hero3DScene = lazy(() =>
  import('./Hero3DScene').then((mod) => ({ default: mod.Hero3DScene })),
);

interface HeroSectionProps {
  onOpenGetStarted: (planName?: string) => void;
}

export function HeroSection({ onOpenGetStarted }: HeroSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="home"
      className="relative overflow-hidden pt-10 pb-16 sm:pt-14 sm:pb-24 lg:pt-16 lg:pb-28"
    >
      {/* Subtle ice-blue atmospheric radial backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(ellipse_75%_65%_at_68%_32%,rgba(186,230,253,0.48),rgba(244,248,253,0)_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-24 -z-10 h-80 w-80 rounded-full bg-cyan-100/45 blur-3xl"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Proposition & Primary Action */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 space-y-6"
          >
            <p className="text-sm font-medium text-sky-700 tracking-wide">
              Independent Clinics · 1–5 Doctors · Front-Desk Sync
            </p>

            <h1 className="font-display text-[clamp(2.35rem,4.4vw,3.9rem)] font-bold leading-[1.08] tracking-tight text-[#0B192C] [text-wrap:balance]">
              Your Clinic, Simplified.
            </h1>

            <p className="max-w-xl text-base sm:text-lg leading-relaxed text-slate-600">
              Manage patients, consultations, prescriptions and follow-up appointments from one
              simple platform. Spend less time managing your clinic and more time caring for
              patients.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                type="button"
                onClick={() => onOpenGetStarted()}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-3 text-sm sm:text-base font-semibold text-white shadow-[0_14px_28px_-10px_rgba(2,132,199,0.55)] hover:shadow-[0_18px_34px_-10px_rgba(2,132,199,0.65)] hover:brightness-105 active:scale-[0.99] transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 cursor-pointer"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <a
                href="#features"
                className="inline-flex min-h-[46px] items-center justify-center rounded-xl lucid-glass-subtle px-6 py-3 text-sm sm:text-base font-semibold text-[#0B192C] hover:bg-white/85 transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
              >
                Explore Features
              </a>
            </div>

            <div className="pt-2 border-t border-slate-200/70 max-w-md">
              <p className="text-sm font-medium text-slate-600">
                Designed for independent doctors and growing clinics.
              </p>
            </div>
          </motion.div>

          {/* Right Column: Interactive 3D Medical Composition */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 relative"
          >
            <div className="relative rounded-3xl border border-white/80 bg-gradient-to-br from-white/55 via-sky-50/45 to-cyan-50/40 shadow-[0_24px_60px_-20px_rgba(11,25,44,0.12)] overflow-hidden">
              <Suspense
                fallback={
                  <div
                    aria-hidden="true"
                    className="h-[380px] sm:h-[460px] lg:h-[520px] w-full flex items-center justify-center bg-gradient-to-br from-sky-50/60 via-white/40 to-cyan-50/60"
                  >
                    <div className="h-24 w-24 rounded-3xl border border-sky-200/80 bg-white/70 shadow-sm animate-pulse" />
                  </div>
                }
              >
                <Hero3DScene />
              </Suspense>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 bg-white/75 px-5 py-3 text-xs text-slate-600">
                <span>Interactive 3D Workspace · Move pointer to inspect</span>
                <span className="font-mono tabular-nums text-slate-500">
                  Queue · Rx · Follow-up
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
