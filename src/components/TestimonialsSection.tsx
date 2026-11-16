import { UserRound } from 'lucide-react';
import { TESTIMONIAL_PLACEHOLDERS } from '../data/clinicContent';

export function TestimonialsSection() {
  return (
    <section
      id="reviews"
      className="py-20 sm:py-24 border-y border-slate-200/60 bg-white/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-sky-700">
            Practitioner Feedback Placeholders
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Built around the needs of doctors.
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            These slots are intentionally marked as placeholders and will only be replaced with
            verified practitioner reviews after independent clinics complete onboarding.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TESTIMONIAL_PLACEHOLDERS.map((item) => (
            <article
              key={item.id}
              className="lucid-glass rounded-2xl p-6 sm:p-7 flex flex-col justify-between"
            >
              <div>
                <p className="text-xs font-mono text-slate-400">
                  Review Placeholder
                </p>
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-700">
                  {item.quote}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-3.5 border-t border-slate-200/70 pt-5">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100/80 text-slate-400"
                  aria-label="Doctor photo placeholder"
                >
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-[#0B192C] truncate">
                    [{item.doctorName}]
                  </p>
                  <p className="text-xs text-slate-500 truncate">{item.specialty}</p>
                  <p className="text-xs text-slate-500 truncate">[{item.clinicName}]</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
