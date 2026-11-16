import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type {
  ClinicJoinRequestRecord,
  ClinicMembershipRecord,
  ClinicRecord,
} from '../lib/clinicService';

export function resolveAuthorizedRoute(params: {
  membership: ClinicMembershipRecord | null;
  clinic: ClinicRecord | null;
  joinRequest: ClinicJoinRequestRecord | null;
}): string {
  const { membership, clinic, joinRequest } = params;

  if (membership && membership.status === 'active' && clinic) {
    if (membership.role === 'receptionist') {
      return '/app/reception/dashboard';
    }
    return '/app/doctor/dashboard';
  }

  if (membership?.status === 'revoked' || joinRequest?.status === 'rejected') {
    return '/access-denied';
  }

  if (joinRequest?.status === 'pending') {
    return '/join-request-pending';
  }

  return '/onboarding/doctor';
}

function FullScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F8FD] text-[#0B192C]">
      <div className="flex items-center gap-3 lucid-glass rounded-2xl px-6 py-4 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
        <span>Loading clinic workspace...</span>
      </div>
    </div>
  );
}

export function RequireUnverifiedOrAuth({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, membership, clinic, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  return <>{children}</>;
}

export function RequireVerifiedOnboarding({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (
    (clinic && membership?.status === 'active') ||
    membership?.status === 'revoked' ||
    joinRequest?.status === 'pending' ||
    joinRequest?.status === 'rejected'
  ) {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  return <>{children}</>;
}

export function RequireClinicWorkspace({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!clinic || !membership || membership.status !== 'active') {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  return <>{children}</>;
}

export function RequireOwnerWorkspace({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!clinic || !membership || membership.status !== 'active') {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  if (membership.role === 'receptionist') {
    return <Navigate to="/app/reception/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireReceptionWorkspace({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!clinic || !membership || membership.status !== 'active') {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  if (membership.role !== 'receptionist') {
    return <Navigate to="/app/doctor/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequirePendingRequest({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (clinic && membership?.status === 'active') {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  if (membership?.status === 'revoked' || joinRequest?.status === 'rejected') {
    return <Navigate to="/access-denied" replace />;
  }
  if (joinRequest?.status !== 'pending') {
    return <Navigate to="/join-clinic" replace />;
  }
  return <>{children}</>;
}

export function RequireAccessDenied({ children }: { children: ReactNode }) {
  const { user, authReady, workspaceLoading, clinic, membership, joinRequest } = useAuth();
  if (!authReady || workspaceLoading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (clinic && membership?.status === 'active') {
    return <Navigate to={resolveAuthorizedRoute({ membership, clinic, joinRequest })} replace />;
  }
  if (joinRequest?.status === 'pending') {
    return <Navigate to="/join-request-pending" replace />;
  }
  if (membership?.status !== 'revoked' && joinRequest?.status !== 'rejected') {
    return <Navigate to="/onboarding/doctor" replace />;
  }
  return <>{children}</>;
}
