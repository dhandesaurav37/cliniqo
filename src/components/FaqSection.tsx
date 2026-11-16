import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { FAQ_ITEMS } from '../data/clinicContent';

interface FaqSectionProps {
  onOpenGetStarted: (planName?: string) => void;
}

export function FaqSection({ onOpenGetStarted }: FaqSectionProps) {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section id="faq" className="py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-sky-700">Common Questions</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Answers before you set up your clinic.
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Everything independent practitioners and receptionists ask before getting started.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openId === item.id;
            const panelId = `faq-panel-${item.id}`;
            const buttonId = `faq-button-${item.id}`;

            return (
              <div key={item.id} className="lucid-glass rounded-2xl overflow-hidden">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleItem(item.id)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-4 px-6 py-4 text-left font-display text-base font-semibold text-[#0B192C] hover:bg-white/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-sky-700' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="px-6 pb-5 pt-1 text-sm sm:text-base leading-relaxed text-slate-600 border-t border-slate-200/60"
                >
                  {item.answer}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Conversion Band */}
        <div className="mt-14 lucid-glass rounded-3xl p-8 sm:p-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h3 className="font-display text-2xl font-bold text-[#0B192C] [text-wrap:balance]">
              Ready to simplify daily OPD operations at your clinic?
            </h3>
            <p className="mt-2 text-sm sm:text-base text-slate-600">
              Reserve your clinic profile in minutes and invite your receptionist when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenGetStarted()}
            className="inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_-8px_rgba(2,132,199,0.5)] hover:brightness-105 cursor-pointer whitespace-nowrap"
          >
            Get Started Free
          </button>
        </div>
      </div>
    </section>
  );
}
