import { LogOut, ShieldOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

export function AccessDeniedPage() {
  const navigate = useNavigate();
  const { membership, joinRequest, logout } = useAuth();

  const isRevoked = membership?.status === 'revoked';
  const clinicName = joinRequest?.clinicName || 'this clinic';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AuthLayout
      kicker="Access Unavailable"
      title={isRevoked ? 'Clinic access has been revoked' : 'Joining request was declined'}
      subtitle={
        isRevoked
          ? `Your receptionist access for ${clinicName} was revoked by the clinic administrator.`
          : `Your access request for ${clinicName} was not approved by the clinic administrator.`
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 flex items-start gap-3">
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-rose-900">
            {isRevoked
              ? 'If you believe this was done in error, please contact your clinic owner directly. Clinic records and historical actions remain safely preserved.'
              : 'You cannot access clinic records without administrator approval. Contact your clinic owner if you need a new invitation.'}
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>

          <Link
            to="/"
            className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Return to Cliniqo Homepage
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
