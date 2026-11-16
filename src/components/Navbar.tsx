import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { BrandMark } from './BrandMark';

interface NavbarProps {
  onOpenLogin: () => void;
  onOpenGetStarted: (planName?: string) => void;
}

const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'For Clinics', href: '#roles' },
];

export function Navbar({ onOpenLogin, onOpenGetStarted }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLinkClick = () => {
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 lucid-nav-glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <a
          href="#home"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 rounded-lg shrink-0"
          aria-label="Cliniqo Home"
        >
          <BrandMark />
        </a>

        <nav className="hidden lg:flex items-center gap-7" aria-label="Primary Navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative py-1 text-sm font-medium text-slate-700 transition-colors duration-150 hover:text-[#0B192C] whitespace-nowrap shrink-0 after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:scale-x-0 after:bg-sky-600 after:transition-transform after:duration-200 hover:after:scale-x-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenLogin}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 hover:text-[#0B192C] transition-colors duration-150 whitespace-nowrap shrink-0 rounded-lg hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 cursor-pointer"
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => onOpenGetStarted()}
            className="min-h-[40px] px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#0284C7] to-[#0891B2] rounded-xl shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)] hover:shadow-[0_10px_24px_-6px_rgba(2,132,199,0.6)] hover:brightness-105 active:scale-[0.99] transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 cursor-pointer"
          >
            Get Started Free
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/75 text-[#0B192C] hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 cursor-pointer"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200/70 bg-white/92 backdrop-blur-xl px-4 pb-5 pt-3 shadow-lg">
          <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleLinkClick}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-sky-50/80 hover:text-[#0B192C] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-200/70 pt-4">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenLogin();
              }}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-[#0B192C] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenGetStarted();
              }}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-sm font-semibold text-white shadow-sm cursor-pointer"
            >
              Get Started Free
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
