import { WORKFLOW_STEPS } from '../data/clinicContent';

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-24 border-y border-slate-200/60 bg-white/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-sky-700">Simple Onboarding</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Get your clinic running in minutes.
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            No server installations, hardware dependencies, or multi-day staff training required.
          </p>
        </div>

        {/* Desktop horizontal workflow & Mobile vertical timeline */}
        <div className="relative mt-12">
          {/* Desktop horizontal connector line */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-7 left-12 right-12 h-[1px] bg-gradient-to-r from-sky-200 via-cyan-300 to-sky-200"
          />

          <ol className="relative grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-6">
            {WORKFLOW_STEPS.map((item, idx) => (
              <li
                key={item.step}
                className="relative pl-12 lg:pl-0"
              >
                {/* Mobile vertical connector line */}
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="lg:hidden absolute left-[18px] top-10 bottom-[-24px] w-[1px] bg-sky-200"
                  />
                )}

                {/* Step Number Marker */}
                <div className="absolute left-0 top-0 lg:static flex h-10 w-10 lg:h-14 lg:w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0891B2] text-white font-display text-sm lg:text-base font-bold shadow-[0_10px_22px_-8px_rgba(2,132,199,0.5)] tabular-nums">
                  {item.step}
                </div>

                <div className="lucid-glass rounded-2xl p-6 lg:mt-6 h-full">
                  <h3 className="font-display text-lg font-bold text-[#0B192C]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
