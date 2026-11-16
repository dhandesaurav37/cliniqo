import {
  CalendarCheck,
  Check,
  FileText,
  ListOrdered,
  Stethoscope,
  UserCheck,
  Users,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { CORE_FEATURES, type FeatureItem } from '../data/clinicContent';

const ICON_MAP: Record<FeatureItem['iconName'], typeof Users> = {
  Users,
  ListOrdered,
  Stethoscope,
  FileText,
  CalendarCheck,
  UserCheck,
};

export function FeaturesSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="features" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-sky-700">Core Clinic Capabilities</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Everything your clinic needs. Nothing you don&apos;t.
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Six focused tools designed around how an independent doctor and receptionist actually
            run morning and evening OPD hours.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CORE_FEATURES.map((feature, index) => {
            const Icon = ICON_MAP[feature.iconName];
            return (
              <motion.article
                key={feature.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{
                  duration: 0.35,
                  delay: prefersReducedMotion ? 0 : index * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group lucid-glass rounded-2xl p-6 sm:p-7 transition-transform duration-200 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-700 transition-colors duration-200 group-hover:from-[#0284C7] group-hover:to-[#0891B2] group-hover:text-white">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-xs font-medium text-slate-400 tabular-nums">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="mt-5 font-display text-xl font-bold text-[#0B192C]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.summary}
                  </p>
                </div>

                <ul className="mt-5 space-y-2.5 border-t border-slate-200/70 pt-5">
                  {feature.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-sm text-slate-700"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
