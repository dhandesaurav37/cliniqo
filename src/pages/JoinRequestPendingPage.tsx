import { Bell, Clock, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resolveAuthorizedRoute } from '../components/RouteGuards';
import { useAuth } from '../context/AuthContext';

export function JoinRequestPendingPage() {
  const navigate = useNavigate();
  const { joinRequest, notifications, refreshWorkspace, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const next = await refreshWorkspace();
      const target = resolveAuthorizedRoute(next);
      if (target !== '/join-request-pending') {
        navigate(target, { replace: true });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const requestedDate = joinRequest?.requestedAt
    ? joinRequest.requestedAt.toDate().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Just now';

  return (
    <AuthLayout
      kicker="Approval Pending"
      title="Waiting for clinic approval"
      subtitle="Your request has been sent to the clinic administrator. You will receive access after approval."
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/75 p-4 flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-slate-700 space-y-1">
            <p className="font-semibold text-[#0B192C]">
              Clinic: {joinRequest?.clinicName || 'Assigned Clinic'}
            </p>
            <p>Requested Role: Receptionist</p>
            <p>Submitted: {requestedDate}</p>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Bell className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
              Recent Updates
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {notifications.slice(0, 3).map((notif) => (
                <div
                  key={notif.id}
                  className="rounded-xl border border-slate-200/80 bg-white/85 px-3.5 py-2.5 text-xs"
                >
                  <p className="font-semibold text-[#0B192C]">{notif.title}</p>
                  <p className="mt-0.5 text-slate-600">{notif.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0891B2] px-4 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60 cursor-pointer"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Check Approval Status
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
