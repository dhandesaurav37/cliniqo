import { BrandMark } from './BrandMark';

interface FooterProps {
  onOpenLogin: () => void;
  onOpenGetStarted: (planName?: string) => void;
  onOpenContact: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export function Footer({
  onOpenLogin,
  onOpenGetStarted,
  onOpenContact,
  onOpenPrivacy,
  onOpenTerms,
}: FooterProps) {
  return (
    <footer className="border-t border-slate-200/80 bg-white/60 pt-14 pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-5 space-y-3">
            <a href="#home" className="inline-block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
              <BrandMark />
            </a>
            <p className="max-w-sm text-sm leading-relaxed text-slate-600">
              Simple clinic management software built specifically for independent doctors,
              solo practitioners, and 1–5 doctor outpatient clinics.
            </p>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-[#0B192C]">Product</h3>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <a href="#features" className="hover:text-[#0B192C] transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-[#0B192C] transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-[#0B192C] transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#preview" className="hover:text-[#0B192C] transition-colors">
                    Product Preview
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-[#0B192C]">Access</h3>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="hover:text-[#0B192C] transition-colors cursor-pointer text-left"
                  >
                    Login
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onOpenGetStarted()}
                    className="hover:text-[#0B192C] transition-colors cursor-pointer text-left"
                  >
                    Get Started
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onOpenContact}
                    className="hover:text-[#0B192C] transition-colors cursor-pointer text-left"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-display text-sm font-bold text-[#0B192C]">Legal</h3>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <button
                    type="button"
                    onClick={onOpenPrivacy}
                    className="hover:text-[#0B192C] transition-colors cursor-pointer text-left"
                  >
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onOpenTerms}
                    className="hover:text-[#0B192C] transition-colors cursor-pointer text-left"
                  >
                    Terms and Conditions
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-200/80 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Cliniqo. Built for independent medical clinics.</p>
          <p>Demonstration previews use sample patient data.</p>
        </div>
      </div>
    </footer>
  );
}
