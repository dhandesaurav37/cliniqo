import { KeyRound, Lock, Shield, UserCheck, Users } from 'lucide-react';
import { SECURITY_PILLARS } from '../data/clinicContent';

const PILLAR_ICONS = [Users, Shield, KeyRound, Lock, UserCheck];

export function SecuritySection() {
  return (
    <section
      id="security"
      className="py-20 sm:py-24 border-y border-slate-200/60 bg-white/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5 space-y-4">
            <p className="text-sm font-medium text-sky-700">Access Control &amp; Privacy</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
              Your clinic&apos;s information deserves protection.
            </h2>
            <p className="text-base leading-relaxed text-slate-600">
              Patient consultations and clinic schedules should never sit behind shared passwords
              or unprotected spreadsheets. Every clinic workspace enforces clear separation between
              doctors and front-desk staff.
            </p>
            <p className="text-xs leading-relaxed text-slate-500 pt-2">
              Note: Cliniqo is built with role-based access controls and account isolation. We do
              not publish third-party regulatory badges until formal external audits are completed.
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SECURITY_PILLARS.map((pillar, idx) => {
              const Icon = PILLAR_ICONS[idx % PILLAR_ICONS.length];
              return (
                <div
                  key={pillar.title}
                  className={`lucid-glass rounded-2xl p-6 ${
                    idx === SECURITY_PILLARS.length - 1 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100 text-sky-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-base font-bold text-[#0B192C]">
                      {pillar.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {pillar.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
