// =============================================================================
// FILE:    src/components/ui/index.jsx
// PURPOSE: Reusable UI primitives used throughout the app.
//          Import from this file: import { Button, Badge, Spinner } from '../ui';
// =============================================================================

import React from 'react';
import { Loader2, AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// BUTTON
// ---------------------------------------------------------------------------
const VARIANTS = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-sm',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  ghost:     'hover:bg-gray-100 text-gray-600',
  success:   'bg-green-600 hover:bg-green-700 text-white shadow-sm',
};
const SIZES = {
  xs: 'px-2.5 py-1.5 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Button = ({
  children, variant = 'primary', size = 'md',
  loading = false, disabled = false,
  className = '', icon: Icon, ...props
}) => (
  <button
    {...props}
    disabled={disabled || loading}
    className={`
      inline-flex items-center justify-center gap-2 font-medium rounded-lg
      transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
      disabled:opacity-50 disabled:cursor-not-allowed
      ${VARIANTS[variant]} ${SIZES[size]} ${className}
    `}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// BADGE
// ---------------------------------------------------------------------------
const BADGE_VARIANTS = {
  blue:   'bg-blue-100 text-blue-800',
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray:   'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
};

export const Badge = ({ children, variant = 'gray', className = '' }) => (
  <span className={`
    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
    ${BADGE_VARIANTS[variant] || BADGE_VARIANTS.gray} ${className}
  `}>
    {children}
  </span>
);

// Convenience: map status strings to badge colours
export const StatusBadge = ({ status }) => {
  const map = {
    'Draft':       'gray',
    'In Progress': 'blue',
    'Completed':   'green',
    'Cancelled':   'red',
    'Scheduled':   'blue',
    'Postponed':   'yellow',
    'Low':         'green',
    'Medium':      'yellow',
    'High':        'orange',
    'Critical':    'red',
    'Active':      'green',
    'Inactive':    'gray',
  };
  return <Badge variant={map[status] || 'gray'}>{status}</Badge>;
};

// ---------------------------------------------------------------------------
// SPINNER
// ---------------------------------------------------------------------------
export const Spinner = ({ size = 'md', className = '' }) => {
  const s = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8', xl: 'w-12 h-12' };
  return <Loader2 className={`animate-spin text-blue-600 ${s[size] || s.md} ${className}`} />;
};

export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <Spinner size="xl" className="mx-auto mb-4" />
      <p className="text-gray-500 text-sm">Loading…</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// CARD
// ---------------------------------------------------------------------------
export const Card = ({ children, className = '', padding = true }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${padding ? 'p-6' : ''} ${className}`}>
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between mb-6">
    <div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="ml-4 flex-shrink-0">{action}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// ALERT / INLINE ERROR
// ---------------------------------------------------------------------------
const ALERT_STYLES = {
  error:   { bg: 'bg-red-50 border-red-200',   icon: XCircle,      text: 'text-red-800',   iconColor: 'text-red-500'   },
  success: { bg: 'bg-green-50 border-green-200', icon: CheckCircle, text: 'text-green-800', iconColor: 'text-green-500' },
  warning: { bg: 'bg-yellow-50 border-yellow-200', icon: AlertCircle, text: 'text-yellow-800', iconColor: 'text-yellow-500' },
  info:    { bg: 'bg-blue-50 border-blue-200',  icon: Info,         text: 'text-blue-800',  iconColor: 'text-blue-500'  },
};

export const Alert = ({ type = 'info', message, onDismiss }) => {
  if (!message) return null;
  const { bg, icon: Icon, text, iconColor } = ALERT_STYLES[type] || ALERT_STYLES.info;
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bg}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <p className={`flex-1 text-sm font-medium ${text}`}>{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className={`flex-shrink-0 ${text} hover:opacity-70`}>
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// EMPTY STATE
// ---------------------------------------------------------------------------
export const EmptyState = ({ icon: Icon, title, message, action }) => (
  <div className="text-center py-12 px-4">
    {Icon && (
      <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>
    )}
    <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
    {message && <p className="text-sm text-gray-500 mb-4">{message}</p>}
    {action}
  </div>
);

// ---------------------------------------------------------------------------
// CONFIRM DIALOG
// ---------------------------------------------------------------------------
export const ConfirmDialog = ({ open, title, message, onConfirm, onCancel, danger = true }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MODAL WRAPPER
// ---------------------------------------------------------------------------
export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${widths[size] || widths.md} mb-8`}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FORM FIELD WRAPPER
// ---------------------------------------------------------------------------
export const Field = ({ label, error, required, hint, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    {label && (
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
    )}
    {children}
    {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// INPUT / SELECT / TEXTAREA — styled consistently
// ---------------------------------------------------------------------------
const inputBase = (error) =>
  `w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors
   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
   disabled:bg-gray-50 disabled:text-gray-500
   ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}`;

export const Input = ({ error, className = '', ...props }) => (
  <input className={`${inputBase(error)} ${className}`} {...props} />
);

export const Select = ({ error, className = '', children, ...props }) => (
  <select className={`${inputBase(error)} ${className}`} {...props}>
    {children}
  </select>
);

export const Textarea = ({ error, rows = 4, className = '', ...props }) => (
  <textarea rows={rows} className={`${inputBase(error)} resize-none ${className}`} {...props} />
);

// ---------------------------------------------------------------------------
// PAGINATION
// ---------------------------------------------------------------------------
export const Pagination = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between py-3 border-t border-gray-200 mt-4">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium">{from}–{to}</span> of{' '}
        <span className="font-medium">{total}</span> results
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary" size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >Previous</Button>
        <Button
          variant="secondary" size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >Next</Button>
      </div>
    </div>
  );
};
