import {
  Bell,
  BookmarkCheck,
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Settings,
  Sparkles,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { useAuth } from '../context/AuthContext';

interface AppShellLayoutProps {
  breadcrumb: string;
  children: ReactNode;
}

const DESKTOP_NAV_STORAGE_KEY = 'cliniqo_desktop_nav_open';

export function AppShellLayout({ breadcrumb, children }: AppShellLayoutProps) {
  const {
    clinic,
    profile,
    membership,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const [desktopNavOpen, setDesktopNavOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(DESKTOP_NAV_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragHandledRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(DESKTOP_NAV_STORAGE_KEY, String(desktopNavOpen));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }, [desktopNavOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const handleDragPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    dragStartXRef.current = e.clientX;
    dragHandledRef.current = false;
  };

  const handleDragPointerMove = (
    e: React.PointerEvent<HTMLElement>,
    mode: 'desktop' | 'mobile',
  ) => {
    if (dragStartXRef.current === null || dragHandledRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;
    if (deltaX >= 36) {
      dragHandledRef.current = true;
      dragStartXRef.current = null;
      if (mode === 'desktop') setDesktopNavOpen(true);
      else setMobileNavOpen(true);
    } else if (deltaX <= -36) {
      dragHandledRef.current = true;
      dragStartXRef.current = null;
      if (mode === 'desktop') setDesktopNavOpen(false);
      else setMobileNavOpen(false);
    }
  };

  const handleDragPointerEnd = () => {
    dragStartXRef.current = null;
  };

  const isReceptionist = membership?.role === 'receptionist';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navItems = isReceptionist
    ? [
        { to: '/app/reception/dashboard', label: 'Reception Dashboard', icon: LayoutDashboard },
        { to: '/app/reception/queue', label: 'Live Queue', icon: ListOrdered },
        { to: '/app/appointments', label: 'Appointments', icon: CalendarClock },
        { to: '/app/patients', label: 'Patients', icon: UserRoundCheck },
      ]
    : [
        { to: '/app/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/app/doctor/queue', label: 'Live Queue', icon: ListOrdered },
        { to: '/app/appointments', label: 'Appointments', icon: CalendarClock },
        { to: '/app/patients', label: 'Patients', icon: UserRoundCheck },
        { to: '/app/doctor/prescriptions', label: 'Prescriptions', icon: FileText },
        { to: '/app/doctor/medicines', label: 'Medicines', icon: Pill },
        { to: '/app/doctor/prescription-templates', label: 'Rx Templates', icon: BookmarkCheck },
        { to: '/app/settings/staff', label: 'Staff Management', icon: Users },
        { to: '/app/settings/clinic', label: 'Clinic Settings', icon: Settings },
        { to: '/app/welcome', label: 'Joining Code', icon: Sparkles },
      ];

  const roleLabel = isReceptionist
    ? 'Receptionist'
    : membership?.role === 'owner'
      ? membership.isPractisingDoctor
        ? 'Clinic Owner · Doctor'
        : 'Clinic Owner'
      : membership?.role || 'Member';

  const renderSidebarInner = (onNavSelect?: () => void) => (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/70 px-5">
        <Link to="/" aria-label="Cliniqo Home" onClick={onNavSelect}>
          <BrandMark />
        </Link>
        {onNavSelect && (
          <button
            type="button"
            onClick={onNavSelect}
            aria-label="Push navigation closed"
            className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0B192C] cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-4 py-5 border-b border-slate-200/70 shrink-0">
        <p className="text-xs font-medium text-slate-500">Active Clinic</p>
        <p className="mt-1 font-display text-sm font-bold text-[#0B192C] truncate">
          {clinic?.name || 'Clinic Workspace'}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 truncate">{roleLabel}</p>
      </div>

      <nav className="flex-1 space-y-1 p-4 overflow-y-auto" aria-label="Workspace Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavSelect}
              className={({ isActive }) =>
                `flex min-h-[42px] items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-50 text-sky-800 font-semibold border border-sky-200/70'
                    : 'text-slate-600 hover:bg-white/80 hover:text-[#0B192C]'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-200/70 p-4 space-y-3 shrink-0">
        <div className="px-2">
          <p className="text-xs font-semibold text-[#0B192C] truncate">
            {profile?.fullName || (isReceptionist ? 'Receptionist' : 'Doctor')}
          </p>
          <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F8FD] text-[#0B192C] overflow-x-clip">
      {/* Desktop Pull & Push Sidebar */}
      <div
        className="no-print hidden lg:block relative shrink-0 sticky top-0 h-screen z-30"
        onPointerDown={handleDragPointerDown}
        onPointerMove={(e) => handleDragPointerMove(e, 'desktop')}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
      >
        <aside
          aria-hidden={!desktopNavOpen}
          className={`h-full overflow-hidden border-slate-200/75 bg-white/70 backdrop-blur-xl transition-[width,opacity] duration-300 ease-out ${
            desktopNavOpen
              ? 'w-64 border-r opacity-100'
              : 'w-0 border-r-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-64 h-full flex flex-col">{renderSidebarInner()}</div>
        </aside>

        {/* Edge Pull / Push Handle (click or drag left/right) */}
        <button
          type="button"
          onClick={() => {
            if (dragHandledRef.current) {
              dragHandledRef.current = false;
              return;
            }
            setDesktopNavOpen((prev) => !prev);
          }}
          aria-expanded={desktopNavOpen}
          aria-label={desktopNavOpen ? 'Push navigation bar closed' : 'Pull navigation bar open'}
          title={desktopNavOpen ? 'Push navigation bar closed' : 'Pull navigation bar open'}
          className="absolute top-20 -right-5 z-40 flex h-12 w-5 items-center justify-center rounded-r-xl border border-l-0 border-slate-200/90 bg-white/90 text-slate-500 shadow-sm backdrop-blur-md transition-colors hover:bg-sky-50 hover:text-sky-700 cursor-ew-resize"
        >
          {desktopNavOpen ? (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile Pull & Push Drawer */}
      <aside
        aria-hidden={!mobileNavOpen}
        onPointerDown={handleDragPointerDown}
        onPointerMove={(e) => handleDragPointerMove(e, 'mobile')}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
        className={`no-print lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-out ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {renderSidebarInner(() => setMobileNavOpen(false))}
      </aside>

      {/* Main Column (pushed right when nav pulls out, expands when nav pushes shut) */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-transform duration-300 ease-out lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-64' : 'translate-x-0'
        }`}
      >
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Push navigation bar closed"
            onClick={() => setMobileNavOpen(false)}
            className="no-print lg:hidden fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] cursor-pointer"
          />
        )}

        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Push/Pull Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? 'Push navigation closed' : 'Pull navigation open'}
              className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {/* Desktop Push/Pull Toggle */}
            <button
              type="button"
              onClick={() => setDesktopNavOpen((prev) => !prev)}
              aria-expanded={desktopNavOpen}
              aria-label={desktopNavOpen ? 'Push navigation closed' : 'Pull navigation open'}
              title={desktopNavOpen ? 'Collapse navigation bar' : 'Expand navigation bar'}
              className="hidden lg:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              {desktopNavOpen ? (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <div className="text-xs sm:text-sm text-slate-500 truncate">
              <span>{clinic?.name || 'Workspace'}</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#0B192C]">{breadcrumb}</span>
            </div>
          </div>

          <div ref={notifContainerRef} className="flex items-center gap-2.5 shrink-0 relative">
            {/* Notifications Trigger */}
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0B192C] hover:bg-slate-50 cursor-pointer"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {!isReceptionist && (
              <Link
                to="/app/settings/staff"
                className="hidden sm:inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 whitespace-nowrap"
              >
                Staff Management
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="lg:hidden inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>

            {/* Notifications Popover */}
            {notifOpen && (
              <div
                role="dialog"
                aria-label="Workspace Notifications"
                className="absolute right-0 top-12 z-40 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
                  <p className="font-display text-sm font-bold text-[#0B192C]">Notifications</p>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                      >
                        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className="rounded-lg p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {notifications.slice(0, 12).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (!item.read) {
                            void markNotificationRead(item.id);
                          }
                          if (item.type === 'join_request_received' && !isReceptionist) {
                            setNotifOpen(false);
                            navigate('/app/settings/staff');
                          } else if (item.type.startsWith('queue_')) {
                            setNotifOpen(false);
                            navigate(isReceptionist ? '/app/reception/queue' : '/app/doctor/queue');
                          } else if (item.type.startsWith('appointment_')) {
                            setNotifOpen(false);
                            navigate('/app/appointments');
                          }
                        }}
                        className={`w-full text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                          item.read
                            ? 'border-slate-200/70 bg-white text-slate-600'
                            : 'border-sky-200 bg-sky-50/70 text-[#0B192C]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold leading-snug">{item.title}</p>
                          {!item.read && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-600" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {item.message}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
