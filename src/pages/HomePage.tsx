import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionModals, type ActiveModalType } from '../components/ActionModals';
import { FaqSection } from '../components/FaqSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { Footer } from '../components/Footer';
import { HeroSection } from '../components/HeroSection';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { Navbar } from '../components/Navbar';
import { PricingSection } from '../components/PricingSection';
import { ProductPreviewSection } from '../components/ProductPreviewSection';
import { SecuritySection } from '../components/SecuritySection';
import { TestimonialsSection } from '../components/TestimonialsSection';
import { TrustSection } from '../components/TrustSection';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLoginNav = () => {
    if (user) {
      navigate('/app/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleGetStartedNav = () => {
    if (user) {
      navigate('/app/dashboard');
    } else {
      navigate('/register');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F8FD] text-[#0B192C] overflow-x-clip">
      <Navbar
        onOpenLogin={handleLoginNav}
        onOpenGetStarted={handleGetStartedNav}
      />

      <main className="flex-1">
        <HeroSection onOpenGetStarted={handleGetStartedNav} />
        <TrustSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ProductPreviewSection />
        <TestimonialsSection />
        <PricingSection onSelectPlan={handleGetStartedNav} />
        <SecuritySection />
        <FaqSection onOpenGetStarted={handleGetStartedNav} />
      </main>

      <Footer
        onOpenLogin={handleLoginNav}
        onOpenGetStarted={handleGetStartedNav}
        onOpenContact={() => setActiveModal({ type: 'contact' })}
        onOpenPrivacy={() => setActiveModal({ type: 'privacy' })}
        onOpenTerms={() => setActiveModal({ type: 'terms' })}
      />

      <ActionModals modal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
