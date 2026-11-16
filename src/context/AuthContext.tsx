import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ensureUserProfileOnLogin,
  fetchUserWorkspace,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  syncClinicCodePublicInfo,
  type ClinicJoinRequestRecord,
  type ClinicMembershipRecord,
  type ClinicRecord,
  type NotificationRecord,
  type UserProfileRecord,
} from '../lib/clinicService';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  workspaceLoading: boolean;
  profile: UserProfileRecord | null;
  membership: ClinicMembershipRecord | null;
  clinic: ClinicRecord | null;
  joinRequest: ClinicJoinRequestRecord | null;
  notifications: NotificationRecord[];
  unreadCount: number;
  refreshWorkspace: () => Promise<{
    profile: UserProfileRecord | null;
    membership: ClinicMembershipRecord | null;
    clinic: ClinicRecord | null;
    joinRequest: ClinicJoinRequestRecord | null;
  }>;
  reloadVerificationState: () => Promise<boolean>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [membership, setMembership] = useState<ClinicMembershipRecord | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [joinRequest, setJoinRequest] = useState<ClinicJoinRequestRecord | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const loadWorkspaceForUser = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setMembership(null);
      setClinic(null);
      setJoinRequest(null);
      setNotifications([]);
      setWorkspaceLoading(false);
      return { profile: null, membership: null, clinic: null, joinRequest: null };
    }

    setWorkspaceLoading(true);
    try {
      await ensureUserProfileOnLogin({
        uid: currentUser.uid,
        fullName: currentUser.displayName || 'Clinic User',
        email: currentUser.email || '',
      });

      if (!currentUser.emailVerified) {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const unverifiedProfile = snap.exists()
          ? { uid: snap.id, ...(snap.data() as Omit<UserProfileRecord, 'uid'>) }
          : null;
        setProfile(unverifiedProfile);
        setMembership(null);
        setClinic(null);
        setJoinRequest(null);
        setNotifications([]);
        return { profile: unverifiedProfile, membership: null, clinic: null, joinRequest: null };
      }

      const data = await fetchUserWorkspace(currentUser.uid);
      setProfile(data.profile);
      setMembership(data.membership);
      setClinic(data.clinic);
      setJoinRequest(data.joinRequest);
      return data;
    } catch (error) {
      console.error('Failed to load clinic workspace:', error);
      return { profile: null, membership: null, clinic: null, joinRequest: null };
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      await loadWorkspaceForUser(nextUser);
    });
    return () => unsubscribe();
  }, [loadWorkspaceForUser]);

  // Real-time listeners for verified sessions: notifications, memberships (immediate revocation), joinRequests (immediate approval)
  useEffect(() => {
    if (!user || !user.emailVerified) {
      return;
    }

    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', user.uid),
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationRecord, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setNotifications(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'notifications');
        } catch {
          // Handled via structured log
        }
      },
    );

    const memQuery = query(
      collection(db, 'clinicMemberships'),
      where('userId', '==', user.uid),
    );
    const unsubMemberships = onSnapshot(
      memQuery,
      async (snap) => {
        const activeDoc =
          snap.docs.find((d) => d.data().status === 'active') || snap.docs[0] || null;
        if (!activeDoc) {
          setMembership(null);
          setClinic(null);
          return;
        }
        const nextMem: ClinicMembershipRecord = {
          id: activeDoc.id,
          ...(activeDoc.data() as Omit<ClinicMembershipRecord, 'id'>),
        };
        setMembership(nextMem);

        if (nextMem.status === 'active') {
          try {
            const clinicSnap = await getDoc(doc(db, 'clinics', nextMem.clinicId));
            if (clinicSnap.exists()) {
              const nextClinic: ClinicRecord = {
                id: clinicSnap.id,
                ...(clinicSnap.data() as Omit<ClinicRecord, 'id'>),
              };
              setClinic(nextClinic);
              if (nextMem.role === 'owner') {
                void syncClinicCodePublicInfo(nextClinic);
              }
            } else {
              setClinic(null);
            }
          } catch {
            setClinic(null);
          }
        } else {
          setClinic(null);
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'clinicMemberships');
        } catch {
          // Handled via structured log
        }
      },
    );

    const reqQuery = query(
      collection(db, 'clinicJoinRequests'),
      where('userId', '==', user.uid),
    );
    const unsubRequests = onSnapshot(
      reqQuery,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ClinicJoinRequestRecord, 'id'>) }))
          .sort((a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0));
        setJoinRequest(sorted.find((r) => r.status === 'pending') || sorted[0] || null);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'clinicJoinRequests');
        } catch {
          // Handled via structured log
        }
      },
    );

    return () => {
      unsubNotifs();
      unsubMemberships();
      unsubRequests();
    };
  }, [user]);

  const refreshWorkspace = useCallback(async () => {
    if (auth.currentUser) {
      return loadWorkspaceForUser(auth.currentUser);
    }
    return { profile: null, membership: null, clinic: null, joinRequest: null };
  }, [loadWorkspaceForUser]);

  const reloadVerificationState = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const verified = Boolean(auth.currentUser.emailVerified);
    setUser(auth.currentUser);
    if (verified) {
      await loadWorkspaceForUser(auth.currentUser);
    }
    return verified;
  }, [loadWorkspaceForUser]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    await markNotificationAsRead(notificationId);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await markAllNotificationsAsRead(unreadIds);
    }
  }, [notifications]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setMembership(null);
    setClinic(null);
    setJoinRequest(null);
    setNotifications([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        workspaceLoading,
        profile,
        membership,
        clinic,
        joinRequest,
        notifications,
        unreadCount,
        refreshWorkspace,
        reloadVerificationState,
        markNotificationRead,
        markAllNotificationsRead,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
