import { Check } from 'lucide-react';
import { useState } from 'react';
import { PRICING_TIERS } from '../data/clinicContent';

interface PricingSectionProps {
  onSelectPlan: (planName: string) => void;
}

export function PricingSection({ onSelectPlan }: PricingSectionProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  return (
    <section id="pricing" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-sky-700">Proposed Launch Pricing</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
              Simple pricing for independent clinics.
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              Predictable monthly and annual plans built for solo doctors and small multi-doctor
              clinics. No payment gateway is connected during early access.
            </p>
          </div>

          {/* Interactive Billing Cycle Segmented Control */}
          <div
            role="group"
            aria-label="Billing interval"
            className="inline-flex self-start rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              aria-pressed={billingCycle === 'monthly'}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                billingCycle === 'monthly'
                  ? 'bg-[#0B192C] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0B192C]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              aria-pressed={billingCycle === 'annual'}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                billingCycle === 'annual'
                  ? 'bg-[#0B192C] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0B192C]'
              }`}
            >
              Annual (Save 20%)
            </button>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
          {PRICING_TIERS.map((tier) => {
            const activePrice =
              billingCycle === 'monthly' ? tier.monthlyPrice : tier.annualMonthlyPrice;
            const annualTotal = tier.annualMonthlyPrice * 12;

            return (
              <div
                key={tier.id}
                className={`rounded-3xl p-7 sm:p-8 flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${
                  tier.recommended
                    ? 'bg-white/90 backdrop-blur-xl border-2 border-sky-500/80 shadow-[0_24px_54px_-18px_rgba(2,132,199,0.22)]'
                    : 'lucid-glass'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold text-[#0B192C]">
                      {tier.name}
                    </h3>
                    {tier.recommended && (
                      <span className="text-xs font-semibold text-sky-700">
                        Most Popular
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {tier.tagline}
                  </p>

                  <div className="mt-6 border-b border-slate-200/75 pb-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-4xl font-bold tracking-tight text-[#0B192C] tabular-nums">
                        ₹{activePrice.toLocaleString('en-IN')}
                      </span>
                      <span className="text-sm text-slate-500">/month</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                      {billingCycle === 'annual'
                        ? `₹${annualTotal.toLocaleString('en-IN')} billed annually · Proposed launch price`
                        : `Or ₹${tier.annualMonthlyPrice.toLocaleString('en-IN')}/month billed annually · Proposed launch price`}
                    </p>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"
                          aria-hidden="true"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onSelectPlan(
                      `${tier.name} (₹${activePrice.toLocaleString('en-IN')}/mo · ${billingCycle})`,
                    )
                  }
                  className={`mt-8 flex min-h-[46px] w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 ${
                    tier.recommended
                      ? 'bg-gradient-to-r from-[#0284C7] to-[#0891B2] text-white shadow-[0_12px_24px_-8px_rgba(2,132,199,0.5)] hover:brightness-105'
                      : 'border border-slate-200 bg-white/85 text-[#0B192C] hover:bg-white'
                  }`}
                >
                  {tier.ctaLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
