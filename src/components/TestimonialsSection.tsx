import { Stethoscope, UserCheck, Users } from 'lucide-react';
import { CLINIC_ROLE_HIGHLIGHTS } from '../data/clinicContent';

const ROLE_ICONS = [Stethoscope, UserCheck, Users];

export function TestimonialsSection() {
  return (
    <section
      id="roles"
      className="py-20 sm:py-24 border-y border-slate-200/60 bg-white/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-sky-700">
            Designed Around Clinic Roles
          </p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
            Built around the needs of doctors and front-desk staff.
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Whether you practice solo or coordinate across a small outpatient team, every screen
            stays focused on fast daily patient care.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {CLINIC_ROLE_HIGHLIGHTS.map((item, idx) => {
            const Icon = ROLE_ICONS[idx % ROLE_ICONS.length];
            return (
              <article
                key={item.id}
                className="lucid-glass rounded-2xl p-6 sm:p-7 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold text-[#0B192C]">
                        {item.roleTitle}
                      </h3>
                      <p className="text-xs font-medium text-sky-700">{item.subtitle}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-700">
                    {item.note}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
