// =============================================================================
// FILE:    src/components/layout/AppLayout.jsx
// PURPOSE: Main authenticated app shell.
//          Renders top navbar, tab navigation, page content, and toast stack.
// =============================================================================

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FileText, LayoutDashboard, Users, CalendarDays,
  AlertTriangle, Settings, LogOut, RefreshCw, X,
  CheckCircle, AlertCircle, Info, XCircle,
} from 'lucide-react';
import useAppStore, { useUser, useToasts, useIsAdmin, useIsManager } from '../../store/useAppStore';
import { Spinner } from '../ui';

// ---------------------------------------------------------------------------
// NAV ITEMS — role-filtered in the component
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { path: '/dashboard',   label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin','manager','employee'] },
  { path: '/employees',   label: 'Employees',    icon: Users,           roles: ['admin','manager','employee'] },
  { path: '/schedules',   label: 'Schedule',     icon: CalendarDays,    roles: ['admin','manager','employee'] },
  { path: '/incidents',   label: 'Incidents',    icon: AlertTriangle,   roles: ['admin','manager'] },
  { path: '/config',      label: 'Settings',     icon: Settings,        roles: ['admin'] },
];

// ---------------------------------------------------------------------------
// TOAST NOTIFICATION
// ---------------------------------------------------------------------------
const TOAST_STYLES = {
  success: { bg: 'bg-green-50 border-green-200', icon: CheckCircle, text: 'text-green-800', iconColor: 'text-green-500' },
  error:   { bg: 'bg-red-50 border-red-200',     icon: XCircle,     text: 'text-red-800',   iconColor: 'text-red-500'   },
  warning: { bg: 'bg-yellow-50 border-yellow-200', icon: AlertCircle, text: 'text-yellow-800', iconColor: 'text-yellow-500' },
  info:    { bg: 'bg-blue-50 border-blue-200',   icon: Info,        text: 'text-blue-800',  iconColor: 'text-blue-500'  },
};

const ToastStack = () => {
  const toasts = useToasts();
  const dismiss = useAppStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        const Icon  = style.icon;
        return (
          <div key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-in slide-in-from-right-2 ${style.bg}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
            <p className={`flex-1 text-sm font-medium ${style.text}`}>{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} className={`flex-shrink-0 ${style.text} hover:opacity-70`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// MAIN LAYOUT
// ---------------------------------------------------------------------------
const AppLayout = ({ children }) => {
  const user     = useUser();
  const navigate = useNavigate();
  const logout   = useAppStore((s) => s.logout);
  const globalLoading = useAppStore((s) => s.globalLoading);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── TOP BAR ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-900 hidden sm:block">
                Employee Appraisal System
              </span>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {globalLoading && <Spinner size="sm" />}
              <span className="text-sm text-gray-600 hidden sm:block">{user?.full_name || user?.username}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium capitalize">
                {user?.role}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── TAB NAVIGATION ─────────────────────────────────────────────── */}
        <div className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-1 overflow-x-auto">
              {visibleNav.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* ── PAGE CONTENT ───────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* ── TOAST STACK ────────────────────────────────────────────────── */}
      <ToastStack />
    </div>
  );
};

export default AppLayout;
