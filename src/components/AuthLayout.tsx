import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';

interface AuthLayoutProps {
  kicker: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ kicker, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F8FD] text-[#0B192C] relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_75%_65%_at_50%_0%,rgba(186,230,253,0.5),rgba(244,248,253,0)_72%)]"
      />

      <header className="w-full border-b border-slate-200/60 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            aria-label="Back to Cliniqo homepage"
          >
            <BrandMark />
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-slate-600 hover:text-[#0B192C] transition-colors whitespace-nowrap"
          >
            Back to Website
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <p className="text-xs font-semibold tracking-wide text-sky-700">{kicker}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B192C] [text-wrap:balance]">
              {title}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">{subtitle}</p>
          </div>

          <div className="lucid-glass rounded-3xl p-6 sm:p-8">{children}</div>

          {footer && <div className="text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
