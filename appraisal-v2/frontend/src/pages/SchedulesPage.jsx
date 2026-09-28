// =============================================================================
// FILE:    src/pages/SchedulesPage.jsx
// PURPOSE: Scheduled appraisals module — four views controlled by internal state:
//            'list'   — paginated table, filter by employee/status/date, overdue highlight
//            'detail' — read-only schedule record with actions
//            'form'   — create OR edit (admin/manager only)
//            (postpone handled via modal dialog inside DetailView)
//
// KEY RULES:
//   - appraisal_type is free text — offer common options via datalist
//   - statuses: Scheduled | Completed | Postponed | Cancelled
//   - is_overdue flag from backend — highlight prominently
//   - postpone requires new_date + optional reason (separate endpoint)
//   - cancel: admin/manager. delete: admin only (hard)
//   - calendar invite: POST /:id/invite — if SMTP not set returns ics_content for download
//   - upcoming=true convenience param for Scheduled from today onward
//
// API:     scheduleAPI.getAll / getById / create / update / postpone / cancel / delete / invite
//          employeeAPI.getAll  — employee selector
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, ArrowLeft, ChevronRight, ChevronUp, ChevronDown,
  Edit2, Trash2, RefreshCw, User, Clock, AlertTriangle,
  CheckCircle, XCircle, Calendar, Download, Mail, SkipForward,
} from 'lucide-react';

import {
  Button, Card, CardHeader, Field, Input, Select, Textarea,
  Pagination, EmptyState, ConfirmDialog, PageLoader, Alert, Badge,
} from '../components/ui';

import useAppStore, { useIsAdmin, useIsManager } from '../store/useAppStore';
import useFormValidation from '../hooks/useFormValidation';
import { scheduleAPI, employeeAPI } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VIEWS     = { LIST: 'list', DETAIL: 'detail', FORM: 'form' };

const STATUSES = ['Scheduled', 'Postponed', 'Completed', 'Cancelled'];

const APPRAISAL_TYPES = [
  'Annual Review',
  'Mid-Year Review',
  'Probation Review',
  'Performance Improvement Review',
  'Promotion Review',
  'End of Probation',
];

const STATUS_COLORS = {
  Scheduled:  'blue',
  Postponed:  'yellow',
  Completed:  'green',
  Cancelled:  'gray',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today     = () => new Date().toISOString().split('T')[0];
const dayAfter = (val) => {
  const date = new Date(`${String(val).split('T')[0]}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
};

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.round((new Date(dateStr) - new Date(today())) / 86400000);
  return diff;
};

const daysLabel = (dateStr, isOverdue) => {
  const diff = daysUntil(dateStr);
  if (diff === null) return null;
  if (isOverdue || diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `In ${diff} days`;
  return null;
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status, isOverdue }) => {
  if (isOverdue && status === 'Scheduled') {
    return <Badge variant="red">Overdue</Badge>;
  }
  return <Badge variant={STATUS_COLORS[status] || 'gray'}>{status}</Badge>;
};

// ─── SortButton ──────────────────────────────────────────────────────────────

const SortButton = ({ field, currentField, currentDir, onSort, children }) => {
  const active = currentField === field;
  return (
    <button onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold text-gray-500
        uppercase tracking-wide hover:text-gray-800 transition-colors">
      {children}
      <span className="flex flex-col">
        <ChevronUp   className={`w-2.5 h-2.5 -mb-0.5 ${active && currentDir === 'asc'  ? 'text-blue-600' : 'text-gray-300'}`} />
        <ChevronDown className={`w-2.5 h-2.5 ${active && currentDir === 'desc' ? 'text-blue-600' : 'text-gray-300'}`} />
      </span>
    </button>
  );
};

// =============================================================================
// POSTPONE DIALOG — modal for rescheduling
// =============================================================================

const PostponeDialog = ({ schedule, onConfirm, onCancel }) => {
  const [newDate, setNewDate] = useState('');
  const [reason,  setReason]  = useState('');
  const [error,   setError]   = useState('');

  const handleConfirm = () => {
    if (!newDate) { setError('New date is required.'); return; }
    if (newDate <= String(schedule.scheduled_date).split('T')[0]) { setError('New date must be later than the current scheduled date.'); return; }
    onConfirm({ new_date: newDate, reason: reason || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Postpone Appraisal</h3>
        <p className="text-sm text-gray-500 mb-4">
          Rescheduling <strong>{schedule.employee_name}</strong> from{' '}
          <strong>{formatDate(schedule.scheduled_date)}</strong>
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="space-y-3 mb-6">
          <Field label="New Date" required>
            <Input type="date" value={newDate}
              onChange={e => { setNewDate(e.target.value); setError(''); }}
              min={dayAfter(schedule.scheduled_date)} />
          </Field>
          <Field label="Reason" hint="Optional — will be appended to notes">
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              rows={2} placeholder="e.g. Employee unavailable, manager travel…" />
          </Field>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm}>Postpone</Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// VIEW 1 — LIST
// =============================================================================

const ListView = ({ onOpenDetail, onOpenCreate }) => {
  const isManager = useIsManager();

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('Scheduled');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [page,           setPage]           = useState(1);
  const [sortField,      setSortField]      = useState('scheduled_date');
  const [sortDir,        setSortDir]        = useState('asc');

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ active: 'true', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (employeeFilter) params.employee_id = employeeFilter;
      if (statusFilter)   params.status      = statusFilter;
      if (dateFrom)       params.date_from   = dateFrom;
      if (dateTo)         params.date_to     = dateTo;
      const res = await scheduleAPI.getAll(params);
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, employeeFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [employeeFilter, statusFilter, dateFrom, dateTo]);
  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const clearFilters = () => {
    setEmployeeFilter('');
    setStatusFilter('Scheduled');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = employeeFilter || statusFilter !== 'Scheduled' || dateFrom || dateTo;
  const schedules  = data?.schedules || [];
  const pagination = data?.pagination || null;

  const sorted = [...schedules].sort((a, b) => {
    const av = sortField === 'scheduled_date' ? a.scheduled_date : a.employee_name;
    const bv = sortField === 'scheduled_date' ? b.scheduled_date : b.employee_name;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // Count overdue for the banner
  const overdueCount = schedules.filter(s => s.is_overdue).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Appraisals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} total` : 'Loading…'}
          </p>
        </div>
        {isManager && (
          <Button icon={Plus} onClick={onOpenCreate}>Schedule Appraisal</Button>
        )}
      </div>

      {/* Overdue banner */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200
          rounded-xl text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {overdueCount} appraisal{overdueCount > 1 ? 's are' : ' is'} overdue —
            please reschedule or follow up.
          </p>
        </div>
      )}

      <Card padding={false}>
        {/* Filters */}
        <div className="p-4 flex flex-wrap gap-3 items-end border-b border-gray-100">
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500">Employee</label>
            <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-2 pb-0.5">
            {hasFilters && (
              <button onClick={clearFilters}
                className="text-sm text-blue-600 hover:underline px-2">
                Clear
              </button>
            )}
            <button onClick={fetchSchedules} disabled={loading}
              className="p-2 rounded-lg border border-gray-300 text-gray-500
                hover:bg-gray-50 disabled:opacity-50 transition-colors" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4">
            <Alert type="error" message={error} onDismiss={() => setError('')} />
          </div>
        )}

        {loading && !data ? (
          <PageLoader />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No schedules found"
            message={hasFilters ? 'Try adjusting your filters.' : 'No appraisals have been scheduled yet.'}
            action={isManager && !hasFilters ? (
              <Button icon={Plus} size="sm" onClick={onOpenCreate}>Schedule Appraisal</Button>
            ) : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="scheduled_date" currentField={sortField}
                      currentDir={sortDir} onSort={handleSort}>Date</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="employee_name" currentField={sortField}
                      currentDir={sortDir} onSort={handleSort}>Employee</SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Type
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due
                    </span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(sch => {
                  const label = daysLabel(sch.scheduled_date, sch.is_overdue);
                  return (
                    <tr key={sch.id} onClick={() => onOpenDetail(sch)}
                      className={`cursor-pointer transition-colors group
                        ${sch.is_overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-blue-50'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-4 h-4 flex-shrink-0
                            ${sch.is_overdue ? 'text-red-400' : 'text-gray-400'}`} />
                          <span className={`text-sm font-medium
                            ${sch.is_overdue ? 'text-red-700' : 'text-gray-800'}`}>
                            {formatDate(sch.scheduled_date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-sm font-medium group-hover:text-blue-700
                          ${sch.is_overdue ? 'text-red-800' : 'text-gray-900'}`}>
                          {sch.employee_name}
                        </p>
                        {sch.department && (
                          <p className="text-xs text-gray-500">{sch.department}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">{sch.appraisal_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={sch.status} isOverdue={sch.is_overdue} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {label && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                            ${sch.is_overdue
                              ? 'bg-red-100 text-red-700'
                              : daysUntil(sch.scheduled_date) <= 7
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'}`}>
                            {label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 group-hover:text-blue-500">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && (
          <div className="px-4">
            <Pagination pagination={pagination} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
};

// =============================================================================
// VIEW 2 — DETAIL
// =============================================================================

const DetailView = ({ scheduleId, onBack, onEdit, onDeleted }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const showToast = useAppStore(s => s.showToast);

  const [schedule,    setSchedule]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [actioning,   setActioning]   = useState(false);
  const [confirming,  setConfirming]  = useState(null); // 'cancel' | 'delete'
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await scheduleAPI.getById(scheduleId);
      setSchedule(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const handleCancel = async () => {
    setConfirming(null);
    setActioning(true);
    try {
      await scheduleAPI.cancel(scheduleId);
      showToast('Schedule cancelled.', 'success');
      fetchSchedule();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleDelete = async () => {
    setConfirming(null);
    setActioning(true);
    try {
      await scheduleAPI.delete(scheduleId);
      showToast('Schedule deleted.', 'success');
      onDeleted?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handlePostpone = async ({ new_date, reason }) => {
    setPostponeOpen(false);
    setActioning(true);
    try {
      await scheduleAPI.postpone(scheduleId, { new_date, reason });
      showToast(`Appraisal postponed to ${formatDate(new_date)}.`, 'success');
      fetchSchedule();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleInvite = async () => {
    setInviteLoading(true);
    try {
      const res = await scheduleAPI.sendInvite(scheduleId);
      const data = res.data ?? res;

      // If SMTP not configured, offer .ics download
      if (data?.ics_content) {
        const blob = new Blob([data.ics_content], { type: 'text/calendar' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = data.filename || 'appraisal-invite.ics';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Calendar invite downloaded — add to your calendar app.', 'info');
      } else {
        showToast(res.message || 'Invite sent.', 'success');
      }
    } catch (err) {
      const message = String(err.message || '');
      showToast(
        message.toLowerCase().includes('email')
          ? 'This employee does not have an email address. Add an email to the employee profile before sending an invite.'
          : message || 'Unable to create the calendar invite.',
        'error'
      );
    } finally {
      setInviteLoading(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error)   return (
    <div className="space-y-4">
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Schedules
      </button>
      <Alert type="error" message={error} />
    </div>
  );
  if (!schedule) return null;

  const canEdit     = isManager && ['Scheduled', 'Postponed'].includes(schedule.status);
  const canPostpone = isManager && ['Scheduled', 'Postponed'].includes(schedule.status);
  const canCancel   = isManager && !['Cancelled', 'Completed'].includes(schedule.status);
  const canDelete   = isAdmin;
  const canInvite = isManager && schedule.status !== 'Cancelled';

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Schedules
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {schedule.employee_name} — {formatDate(schedule.scheduled_date)}
        </span>
      </div>

      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
            ${schedule.is_overdue ? 'bg-red-100' :
              schedule.status === 'Completed' ? 'bg-green-100' :
              schedule.status === 'Cancelled' ? 'bg-gray-100' :
              schedule.status === 'Postponed' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
            <CalendarDays className={`w-6 h-6
              ${schedule.is_overdue ? 'text-red-600' :
                schedule.status === 'Completed' ? 'text-green-600' :
                schedule.status === 'Cancelled' ? 'text-gray-500' :
                schedule.status === 'Postponed' ? 'text-yellow-600' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{schedule.employee_name}</h2>
              <StatusBadge status={schedule.status} isOverdue={schedule.is_overdue} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {schedule.appraisal_type}
              {schedule.department ? ` · ${schedule.department}` : ''}
              {' · '}{formatDate(schedule.scheduled_date)}
              {schedule.is_overdue && (
                <span className="ml-2 text-red-600 font-medium">
                  ({Math.abs(daysUntil(schedule.scheduled_date))} days overdue)
                </span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="w-full flex flex-wrap justify-end gap-2 pt-3 mt-1 border-t border-gray-100">
            {canInvite && (
              <Button variant="secondary" size="sm" icon={Download}
                loading={inviteLoading} onClick={handleInvite}>
                .ics Invite
              </Button>
            )}
            {canPostpone && (
              <Button variant="secondary" size="sm" icon={SkipForward}
                onClick={() => setPostponeOpen(true)} loading={actioning}>
                Postpone
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" size="sm" icon={Edit2}
                onClick={() => onEdit(schedule)}>
                Edit
              </Button>
            )}
            {canCancel && (
              <Button variant="secondary" size="sm" icon={XCircle}
                loading={actioning} onClick={() => setConfirming('cancel')}>
                Cancel
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" icon={Trash2}
                loading={actioning} onClick={() => setConfirming('delete')}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Schedule Details" />
          <div className="space-y-0 text-sm">
            {[
              ['Scheduled Date', formatDate(schedule.scheduled_date)],
              ['Appraisal Type', schedule.appraisal_type],
              ['Status',         schedule.status],
              ['Employee',       schedule.employee_name],
              ['Department',     schedule.department   || '—'],
              ['Job Title',      schedule.job_title    || '—'],
            ].map(([label, value]) => (
              <div key={label}
                className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-right">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Reminders & Tracking" />
          <div className="space-y-0 text-sm">
            {[
              ['Reminder Date',  schedule.reminder_date ? formatDate(schedule.reminder_date) : '—'],
              ['Reminder Sent',  schedule.reminder_sent ? 'Yes' : 'No'],
              ['Scheduled By',   `User #${schedule.scheduled_by_user_id}`],
              ['Created',        formatDate(schedule.created_at)],
            ].map(([label, value]) => (
              <div key={label}
                className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-right">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Notes */}
      {schedule.notes && (
        <Card>
          <CardHeader title="Notes" />
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            {schedule.notes}
          </p>
        </Card>
      )}

      {/* Postpone dialog */}
      {postponeOpen && (
        <PostponeDialog
          schedule={schedule}
          onConfirm={handlePostpone}
          onCancel={() => setPostponeOpen(false)}
        />
      )}

      {/* Confirm dialogs */}
      {confirming === 'cancel' && (
        <ConfirmDialog open danger
          title="Cancel this schedule?"
          message="This will mark the scheduled appraisal as Cancelled. You can still delete it afterward if needed."
          onConfirm={handleCancel}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'delete' && (
        <ConfirmDialog open danger
          title="Delete this schedule?"
          message="This will permanently delete the scheduled appraisal record. This action cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
};

// =============================================================================
// VIEW 3 — FORM (create / edit)
// =============================================================================

const VALIDATION_RULES = {
  employee_id:    [{ required: true }],
  scheduled_date: [{ required: true }],
  appraisal_type: [{ required: true }],
};

const EMPTY_FORM = {
  employee_id:    '',
  scheduled_date: '',
  appraisal_type: 'Annual Review',
  reminder_date:  '',
  notes:          '',
};

const FormView = ({ schedule, onBack, onSaved }) => {
  const isEdit    = !!schedule;
  const showToast = useAppStore(s => s.showToast);

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ active: 'true', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      employee_id:    String(schedule.employee_id ?? ''),
      scheduled_date: schedule.scheduled_date?.split('T')[0] || '',
      appraisal_type: schedule.appraisal_type || 'Annual Review',
      reminder_date:  schedule.reminder_date?.split('T')[0]  || '',
      notes:          schedule.notes          || '',
    };
  });

  const [submitting,  setSubmitting]  = useState(false);
  const [serverError, setServerError] = useState('');
  const [customType,  setCustomType]  = useState(
    isEdit && !APPRAISAL_TYPES.includes(schedule?.appraisal_type)
  );

  const { errors, validate, validateField } = useFormValidation(VALIDATION_RULES);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async () => {
    if (!validate(form)) return;

    setSubmitting(true);
    setServerError('');
    try {
      if (isEdit) {
        await scheduleAPI.update(schedule.id, {
          scheduled_date: form.scheduled_date,
          appraisal_type: form.appraisal_type,
          reminder_date:  form.reminder_date  || null,
          notes:          form.notes          || null,
        });
        showToast('Schedule updated.', 'success');
      } else {
        await scheduleAPI.create({
          employee_id:    parseInt(form.employee_id, 10),
          scheduled_date: form.scheduled_date,
          appraisal_type: form.appraisal_type,
          reminder_date:  form.reminder_date  || null,
          notes:          form.notes          || null,
        });
        showToast('Appraisal scheduled.', 'success');
      }
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Schedules
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit ? `Edit — ${schedule.employee_name}` : 'Schedule Appraisal'}
        </span>
      </div>

      <Card>
        <CardHeader
          title={isEdit ? 'Edit Schedule' : 'Schedule Appraisal'}
          subtitle={isEdit
            ? 'Update the scheduled date, type, or notes.'
            : 'Book a future appraisal for an employee.'}
        />

        {serverError && (
          <div className="mb-4">
            <Alert type="error" message={serverError} onDismiss={() => setServerError('')} />
          </div>
        )}

        {/* Employee (locked on edit) + Scheduled Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Employee" required error={errors.employee_id}>
            {isEdit ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50
                border border-gray-200 rounded-lg">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">{schedule.employee_name}</span>
              </div>
            ) : (
              <Select value={form.employee_id}
                onChange={e => set('employee_id', e.target.value)}
                error={errors.employee_id}>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Scheduled Date" required error={errors.scheduled_date}>
            <Input type="date" value={form.scheduled_date}
              onChange={e => set('scheduled_date', e.target.value)}
              error={errors.scheduled_date}
              min={dayAfter(schedule.scheduled_date)} />
          </Field>
        </div>

        {/* Appraisal Type */}
        <div className="mb-4">
          <Field label="Appraisal Type" required error={errors.appraisal_type}>
            {customType ? (
              <div className="flex gap-2">
                <Input
                  value={form.appraisal_type}
                  onChange={e => set('appraisal_type', e.target.value)}
                  placeholder="Enter appraisal type…"
                  error={errors.appraisal_type}
                />
                <button onClick={() => {
                  setCustomType(false);
                  set('appraisal_type', 'Annual Review');
                }}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap px-2">
                  Use list
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={form.appraisal_type}
                  onChange={e => set('appraisal_type', e.target.value)}
                  error={errors.appraisal_type}>
                  {APPRAISAL_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <button onClick={() => setCustomType(true)}
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap px-2">
                  Custom…
                </button>
              </div>
            )}
          </Field>
        </div>

        {/* Reminder Date */}
        <div className="mb-4">
          <Field label="Reminder Date"
            hint="Optional — send a reminder before the appraisal date">
            <Input type="date" value={form.reminder_date}
              onChange={e => set('reminder_date', e.target.value)}
              max={form.scheduled_date || undefined} />
          </Field>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <Field label="Notes" hint="Any context, preparation notes, or special instructions">
            <Textarea value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="e.g. Focus on Q1 targets, review KPIs from last appraisal…" />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {isEdit ? 'Save Changes' : 'Schedule Appraisal'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// ROOT — SchedulesPage (view controller)
// =============================================================================

const SchedulesPage = () => {
  const [view,       setView]       = useState(VIEWS.LIST);
  const [selectedId, setSelectedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [listKey,    setListKey]    = useState(0);

  const openDetail = (schedule) => {
    setSelectedId(schedule.id);
    setView(VIEWS.DETAIL);
  };

  const openCreate = () => {
    setEditTarget(null);
    setView(VIEWS.FORM);
  };

  const openEdit = (schedule) => {
    setEditTarget(schedule);
    setView(VIEWS.FORM);
  };

  const backToList = () => {
    setView(VIEWS.LIST);
    setSelectedId(null);
    setEditTarget(null);
  };

  const handleSaved = () => {
    setListKey(k => k + 1);
    backToList();
  };

  const handleDeleted = () => {
    setListKey(k => k + 1);
    backToList();
  };

  return (
    <div className="p-6">
      {view === VIEWS.LIST && (
        <ListView
          key={listKey}
          onOpenDetail={openDetail}
          onOpenCreate={openCreate}
        />
      )}
      {view === VIEWS.DETAIL && selectedId && (
        <DetailView
          scheduleId={selectedId}
          onBack={backToList}
          onEdit={openEdit}
          onDeleted={handleDeleted}
        />
      )}
      {view === VIEWS.FORM && (
        <FormView
          schedule={editTarget}
          onBack={backToList}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default SchedulesPage;
