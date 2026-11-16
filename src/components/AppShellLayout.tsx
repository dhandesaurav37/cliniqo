import {
  Bell,
  BookmarkCheck,
  CalendarClock,
  CheckCheck,
  FileText,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Pill,
  Settings,
  Sparkles,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { useAuth } from '../context/AuthContext';

interface AppShellLayoutProps {
  breadcrumb: string;
  children: ReactNode;
}

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

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

  return (
    <div className="min-h-screen flex bg-[#F4F8FD] text-[#0B192C]">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200/75 lg:bg-white/65 lg:backdrop-blur-xl">
        <div className="flex h-16 items-center border-b border-slate-200/70 px-6">
          <Link to="/" aria-label="Cliniqo Home">
            <BrandMark />
          </Link>
        </div>

        <div className="px-4 py-5 border-b border-slate-200/70">
          <p className="text-xs font-medium text-slate-500">Active Clinic</p>
          <p className="mt-1 font-display text-sm font-bold text-[#0B192C] truncate">
            {clinic?.name || 'Clinic Workspace'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 truncate">{roleLabel}</p>
        </div>

        <nav className="flex-1 space-y-1 p-4" aria-label="Workspace Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
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

        <div className="border-t border-slate-200/70 p-4 space-y-3">
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
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label="Toggle workspace navigation"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0B192C] cursor-pointer"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="text-xs sm:text-sm text-slate-500 truncate">
              <span>{clinic?.name || 'Workspace'}</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#0B192C]">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 relative">
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

        {mobileNavOpen && (
          <div className="lg:hidden border-b border-slate-200 bg-white/95 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-[42px] items-center gap-2.5 rounded-xl px-3 text-sm font-medium ${
                      isActive ? 'bg-sky-50 text-sky-800 font-semibold' : 'text-slate-700'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
