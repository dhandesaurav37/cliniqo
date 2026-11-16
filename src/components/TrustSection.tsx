import { Building2, ShieldCheck } from 'lucide-react';
import { TRUST_PLACEHOLDERS } from '../data/clinicContent';

export function TrustSection() {
  return (
    <section className="py-16 sm:py-20 border-y border-slate-200/60 bg-white/35">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-sky-700">Built for Everyday Practice</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Technology that makes clinic management simpler.
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Independent practices don’t need enterprise hospital committees or multi-month IT
            rollouts. Metrics below are reserved for verified customer data following launch.
          </p>
        </div>

        {/* Clean 4-column placeholder metrics strip */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_PLACEHOLDERS.map((item) => (
            <div key={item.label} className="lucid-glass rounded-2xl p-6">
              <p className="text-xs font-medium text-slate-500">{item.label}</p>
              <p className="mt-2 font-display text-xl font-bold text-[#0B192C] tabular-nums">
                {item.value}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>

        {/* Clinic-focused + Security & Privacy + Testimonial Placeholder */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lucid-glass-subtle rounded-2xl p-6">
            <div className="flex items-center gap-2.5 text-[#0B192C]">
              <Building2 className="h-5 w-5 text-sky-600 shrink-0" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold">
                Sized for 1–5 Doctor Clinics
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Focused strictly on outpatient consultations, token queues, digital prescriptions,
              and follow-up reminders—without inpatient beds, lab LIS, or hospital ERP clutter.
            </p>
          </div>

          <div className="lucid-glass-subtle rounded-2xl p-6">
            <div className="flex items-center gap-2.5 text-[#0B192C]">
              <ShieldCheck className="h-5 w-5 text-sky-600 shrink-0" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold">
                Privacy &amp; Role Separation
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Doctors approve receptionist access through a private clinic code. Patient clinical
              notes stay separated from front-desk registration and scheduling screens.
            </p>
          </div>

          <div className="lucid-glass-subtle rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Doctor Testimonial Placeholder
              </p>
              <p className="mt-2.5 text-sm italic leading-relaxed text-slate-700">
                “[Verified practitioner quote placeholder — will be populated after independent
                clinics complete onboarding and grant publication consent.]”
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/70 text-xs text-slate-500">
              <span className="font-medium text-[#0B192C]">[Doctor Name Placeholder]</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>[Clinic Name Placeholder]</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
