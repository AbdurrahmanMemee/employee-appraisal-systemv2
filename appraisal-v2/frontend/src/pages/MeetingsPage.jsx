// =============================================================================
// FILE:    src/pages/MeetingsPage.jsx
// PURPOSE: Meetings module — three views in one file:
//            'list'   — paginated table, filter by employee / type / date range
//            'detail' — read-only meeting record with PDF download link
//            'form'   — create OR edit form (mode-aware)
//
// EXPORTS: default MeetingsPage
//
// ROUTES:  /meetings  (list)
//          Sub-views are state-driven — no URL change in this phase.
//
// API:     meetingAPI.getAll / getById / create / update / delete
//          meetingAPI.uploadAttachment / deleteAttachment
//          employeeAPI.getAll  — to populate employee selector + last-meeting link
//
// ROLES:
//   All roles  — view list + detail
//   Manager+   — create, edit
//   Admin only — delete
//
// SPECIAL FEATURE — Last Meeting Link:
//   When creating a new meeting, we fetch the most recent previous meeting for
//   the selected employee and show it as a clickable link. This was MISSING in
//   v1 and is a required feature in v2.
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare, Search, Plus, ChevronRight, ArrowLeft,
  Calendar, User, Users, FileText, Paperclip, Trash2,
  Edit2, Download, AlertTriangle, RefreshCw, Link,
  ChevronDown, ChevronUp, Clock,
} from 'lucide-react';

import {
  Button, StatusBadge, Card, CardHeader, Field, Input, Select,
  Textarea, Pagination, EmptyState, ConfirmDialog, PageLoader,
  Alert, Badge,
} from '../components/ui';

import useAppStore, { useUser, useConfig, useIsAdmin, useIsManager } from '../store/useAppStore';
import useFormValidation from '../hooks/useFormValidation';
import { meetingAPI, employeeAPI } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VIEWS     = { LIST: 'list', DETAIL: 'detail', FORM: 'form' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (val) => {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Returns YYYY-MM-DD string safe for <input type="date">
const toInputDate = (val) => {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
};

// Today as YYYY-MM-DD
const today = () => new Date().toISOString().split('T')[0];

// ─── SortButton ───────────────────────────────────────────────────────────────

const SortButton = ({ field, currentField, currentDir, onSort, children }) => {
  const active = currentField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold text-gray-500
        uppercase tracking-wide hover:text-gray-800 transition-colors"
    >
      {children}
      <span className="flex flex-col">
        <ChevronUp   className={`w-2.5 h-2.5 -mb-0.5 ${active && currentDir === 'asc'  ? 'text-blue-600' : 'text-gray-300'}`} />
        <ChevronDown className={`w-2.5 h-2.5 ${active && currentDir === 'desc' ? 'text-blue-600' : 'text-gray-300'}`} />
      </span>
    </button>
  );
};

// ─── MeetingTypeBadge ─────────────────────────────────────────────────────────

const TYPE_COLORS = {
  'Performance Review': 'blue',
  'Disciplinary':       'red',
  'Check-in':           'green',
  'Onboarding':         'purple',
  'Exit Interview':     'orange',
};

const MeetingTypeBadge = ({ type }) => (
  <Badge variant={TYPE_COLORS[type] || 'gray'}>{type || '—'}</Badge>
);

// =============================================================================
// VIEW 1 — LIST
// =============================================================================

const ListView = ({ onOpenDetail, onOpenCreate }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const config    = useConfig();
  const meetingTypes = config?.meeting_types || [];

  // ── Filter state ─────────────────────────────────────────────────────────
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [typeFilter,     setTypeFilter]     = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [page,           setPage]           = useState(1);
  const [sortField,      setSortField]      = useState('meeting_date');
  const [sortDir,        setSortDir]        = useState('desc');
  const [searchInput,    setSearchInput]    = useState('');

  // Employee list for filter dropdown
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (employeeFilter) params.employee_id  = employeeFilter;
      if (typeFilter)     params.meeting_type  = typeFilter;
      if (dateFrom)       params.date_from     = dateFrom;
      if (dateTo)         params.date_to       = dateTo;

      const res = await meetingAPI.getAll(params);
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, employeeFilter, typeFilter, dateFrom, dateTo]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [employeeFilter, typeFilter, dateFrom, dateTo]);
  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const clearFilters = () => {
    setEmployeeFilter('');
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = employeeFilter || typeFilter || dateFrom || dateTo;
  const meetings   = data?.meetings || [];
  const pagination = data?.pagination || null;

  // Client-side sort (backend doesn't support sort param on meetings)
  const sorted = [...meetings].sort((a, b) => {
    const av = sortField === 'meeting_date' ? a.meeting_date : a.employee_name;
    const bv = sortField === 'meeting_date' ? b.meeting_date : b.employee_name;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} total` : 'Loading…'}
          </p>
        </div>
        {isManager && (
          <Button icon={Plus} onClick={onOpenCreate}>
            New Meeting
          </Button>
        )}
      </div>

      {/* ── Filters ── */}
      <Card padding={false}>
        <div className="p-4 flex flex-wrap gap-3 items-end border-b border-gray-100">
          {/* Employee filter */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500">Employee</label>
            <select
              value={employeeFilter}
              onChange={e => setEmployeeFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>

          {/* Meeting type filter */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500">Meeting Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {meetingTypes.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pb-0.5">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:underline px-2"
              >
                Clear
              </button>
            )}
            <button
              onClick={fetchMeetings}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 text-gray-500
                hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="p-4">
            <Alert type="error" message={error} onDismiss={() => setError('')} />
          </div>
        )}

        {/* ── Table ── */}
        {loading && !data ? (
          <PageLoader />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No meetings found"
            message={hasFilters ? 'Try adjusting your filters.' : 'No meetings have been recorded yet.'}
            action={isManager && !hasFilters ? (
              <Button icon={Plus} size="sm" onClick={onOpenCreate}>New Meeting</Button>
            ) : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="meeting_date" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Date
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="employee_name" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Employee
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conclusion</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachment</span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(meeting => (
                  <tr
                    key={meeting.id}
                    onClick={() => onOpenDetail(meeting)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group"
                  >
                    {/* Date */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-800">
                          {formatDate(meeting.meeting_date)}
                        </span>
                      </div>
                    </td>

                    {/* Employee */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                        {meeting.employee_name}
                      </p>
                      {meeting.department && (
                        <p className="text-xs text-gray-500">{meeting.department}</p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <MeetingTypeBadge type={meeting.meeting_type} />
                    </td>

                    {/* Conclusion (truncated) */}
                    <td className="px-4 py-3 hidden md:table-cell max-w-[240px]">
                      <p className="text-sm text-gray-600 truncate">
                        {meeting.meeting_conclusion || '—'}
                      </p>
                    </td>

                    {/* Attachment */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {meeting.pdf_attachment_path
                        ? <Paperclip className="w-4 h-4 text-blue-500" title="PDF attached" />
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>

                    {/* Chevron */}
                    <td className="px-4 py-3 text-gray-400 group-hover:text-blue-500">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
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

const DetailView = ({ meetingId, onBack, onEdit, onDeleted }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const showToast = useAppStore(s => s.showToast);

  const [meeting,    setMeeting]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const fetchMeeting = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await meetingAPI.getById(meetingId);
      setMeeting(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const handleDelete = async () => {
    setConfirming(false);
    setDeleting(true);
    try {
      await meetingAPI.delete(meetingId);
      showToast('Meeting deleted.', 'success');
      onDeleted?.();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error)   return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Meetings
      </button>
      <Alert type="error" message={error} />
    </div>
  );
  if (!meeting) return null;

  // ── Field row helper ──────────────────────────────────────────────────────
  const InfoRow = ({ icon: Icon, label, value, pre = false }) => (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      {pre
        ? <p className="text-sm text-gray-800 whitespace-pre-line pl-5">{value || '—'}</p>
        : <p className="text-sm text-gray-800 pl-5">{value || '—'}</p>
      }
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Meetings
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {meeting.employee_name} — {formatDate(meeting.meeting_date)}
        </span>
      </div>

      {/* ── Header card ── */}
      <Card>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{meeting.employee_name}</h2>
              <MeetingTypeBadge type={meeting.meeting_type} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(meeting.meeting_date)}
              {meeting.department ? ` · ${meeting.department}` : ''}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            {isManager && (
              <Button variant="secondary" size="sm" icon={Edit2} onClick={() => onEdit(meeting)}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="danger" size="sm" icon={Trash2}
                loading={deleting}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Meeting details ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left — meta */}
        <Card>
          <CardHeader title="Meeting Details" />
          <InfoRow icon={Calendar} label="Date"           value={formatDate(meeting.meeting_date)} />
          <InfoRow icon={User}     label="Employee"       value={meeting.employee_name} />
          <InfoRow icon={Users}    label="People Present" value={meeting.people_present} />
          <InfoRow icon={Clock}    label="Recorded By"    value={`User #${meeting.created_by_user_id}`} />
        </Card>

        {/* Right — brief note + attachment */}
        <Card>
          <CardHeader title="Brief Note" />
          <InfoRow icon={FileText} label="Note" value={meeting.brief_note} pre />
          {meeting.pdf_attachment_path && (
            <div className="pt-3 border-t border-gray-100 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachment</span>
              </div>
              <a
                href={`/uploads/${meeting.pdf_attachment_path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            </div>
          )}
        </Card>
      </div>

      {/* ── Conclusion ── */}
      <Card>
        <CardHeader title="Conclusion" />
        <p className="text-sm text-gray-800 whitespace-pre-line">
          {meeting.meeting_conclusion || '—'}
        </p>
      </Card>

      {/* ── Detailed summary ── */}
      {meeting.detailed_summary && (
        <Card>
          <CardHeader title="Detailed Summary" />
          <p className="text-sm text-gray-800 whitespace-pre-line">
            {meeting.detailed_summary}
          </p>
        </Card>
      )}

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={confirming}
        danger
        title="Delete this meeting?"
        message="This will permanently delete the meeting record and any attached PDF. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

// =============================================================================
// LAST MEETING LINK — shown on form when an employee is selected
// =============================================================================

const LastMeetingLink = ({ employeeId, currentMeetingId, onView }) => {
  const [lastMeeting, setLastMeeting] = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    if (!employeeId) { setLastMeeting(null); return; }
    setLoading(true);
    meetingAPI.getAll({ employee_id: employeeId, limit: 2, page: 1 })
      .then(res => {
        const meetings = res.data?.meetings || [];
        // If editing an existing meeting, skip itself
        const prev = meetings.find(m => m.id !== currentMeetingId);
        setLastMeeting(prev || null);
      })
      .catch(() => setLastMeeting(null))
      .finally(() => setLoading(false));
  }, [employeeId, currentMeetingId]);

  if (!employeeId) return null;
  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
      <Clock className="w-3.5 h-3.5 animate-pulse" /> Checking previous meetings…
    </div>
  );
  if (!lastMeeting) return (
    <p className="text-xs text-gray-400 mt-1">No previous meetings on record for this employee.</p>
  );

  return (
    <div className="mt-2 flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
      <Link className="w-4 h-4 text-blue-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-blue-700 font-medium">Last meeting: </span>
        <button
          type="button"
          onClick={() => onView(lastMeeting)}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          {formatDate(lastMeeting.meeting_date)} — {lastMeeting.meeting_type}
        </button>
        {lastMeeting.brief_note && (
          <p className="text-xs text-blue-600 truncate mt-0.5 opacity-75">
            {lastMeeting.brief_note}
          </p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// VIEW 3 — CREATE / EDIT FORM
// =============================================================================

const VALIDATION_RULES = {
  employee_id:         [{ required: true }],
  meeting_date:        [{ required: true }, { date: true }],
  meeting_type:        [{ required: true }],
  meeting_conclusion:  [{ required: true }],
};

const EMPTY_FORM = {
  employee_id:        '',
  meeting_date:       today(),
  meeting_type:       '',
  people_present:     '',
  brief_note:         '',
  detailed_summary:   '',
  meeting_conclusion: '',
};

const FormView = ({ meeting, onBack, onSaved, onViewMeeting }) => {
  const isEdit    = !!meeting;
  const showToast = useAppStore(s => s.showToast);
  const config    = useConfig();
  const meetingTypes = config?.meeting_types || [];

  // Active employees for the employee selector
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      employee_id:        String(meeting.employee_id ?? ''),
      meeting_date:       toInputDate(meeting.meeting_date),
      meeting_type:       meeting.meeting_type       || '',
      people_present:     meeting.people_present     || '',
      brief_note:         meeting.brief_note         || '',
      detailed_summary:   meeting.detailed_summary   || '',
      meeting_conclusion: meeting.meeting_conclusion || '',
    };
  });

  const [attachment,   setAttachment]   = useState(null);   // File object for new upload
  const [submitting,   setSubmitting]   = useState(false);
  const [serverError,  setServerError]  = useState('');
  const fileInputRef = useRef(null);

  const { errors, validate, validateField } = useFormValidation(VALIDATION_RULES);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async () => {
    const valid = validate(form);
    if (!valid) return;

    setSubmitting(true);
    setServerError('');

    try {
      if (isEdit) {
        // ── Edit: PUT text fields, then POST attachment if a new file was chosen
        const payload = {
          meeting_date:       form.meeting_date,
          meeting_type:       form.meeting_type,
          people_present:     form.people_present     || null,
          brief_note:         form.brief_note         || null,
          detailed_summary:   form.detailed_summary   || null,
          meeting_conclusion: form.meeting_conclusion,
        };
        await meetingAPI.update(meeting.id, payload);

        if (attachment) {
          await meetingAPI.uploadAttachment(meeting.id, attachment);
        }

        showToast('Meeting updated successfully.', 'success');
      } else {
        // ── Create: POST with optional attachment via multipart
        const data = {
          employee_id:        parseInt(form.employee_id, 10),
          meeting_date:       form.meeting_date,
          meeting_type:       form.meeting_type,
          people_present:     form.people_present     || null,
          brief_note:         form.brief_note         || null,
          detailed_summary:   form.detailed_summary   || null,
          meeting_conclusion: form.meeting_conclusion,
        };
        if (attachment) data.attachment = attachment;
        await meetingAPI.create(data);
        showToast('Meeting created successfully.', 'success');
      }
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Employee name for display when editing ────────────────────────────────
  const editEmployeeName = isEdit ? meeting.employee_name : null;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Meetings
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit ? `Edit — ${editEmployeeName} · ${formatDate(meeting.meeting_date)}` : 'New Meeting'}
        </span>
      </div>

      <Card>
        <CardHeader
          title={isEdit ? 'Edit Meeting' : 'New Meeting'}
          subtitle={isEdit
            ? 'Update the meeting details below.'
            : 'Record a new meeting. Fields marked * are required.'}
        />

        {serverError && (
          <div className="mb-4">
            <Alert type="error" message={serverError} onDismiss={() => setServerError('')} />
          </div>
        )}

        {/* ── Employee + Date ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <Field label="Employee" required error={errors.employee_id}>
              {isEdit ? (
                // Can't change the employee on an existing meeting
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{editEmployeeName}</span>
                </div>
              ) : (
                <Select
                  value={form.employee_id}
                  onChange={e => set('employee_id', e.target.value)}
                  error={errors.employee_id}
                >
                  <option value="">Select employee…</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </Select>
              )}
            </Field>

            {/* ── Last Meeting Link ── */}
            <LastMeetingLink
              employeeId={isEdit ? meeting.employee_id : parseInt(form.employee_id) || null}
              currentMeetingId={isEdit ? meeting.id : null}
              onView={onViewMeeting}
            />
          </div>

          <Field label="Meeting Date" required error={errors.meeting_date}>
            <Input
              type="date"
              value={form.meeting_date}
              onChange={e => set('meeting_date', e.target.value)}
              error={errors.meeting_date}
            />
          </Field>
        </div>

        {/* ── Meeting Type + People Present ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Meeting Type" required error={errors.meeting_type}>
            <Select
              value={form.meeting_type}
              onChange={e => set('meeting_type', e.target.value)}
              error={errors.meeting_type}
            >
              <option value="">Select type…</option>
              {meetingTypes.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="People Present" hint="Names of all attendees">
            <Input
              value={form.people_present}
              onChange={e => set('people_present', e.target.value)}
              placeholder="e.g. John Smith, Jane Doe"
            />
          </Field>
        </div>

        {/* ── Brief Note ── */}
        <div className="mb-4">
          <Field label="Brief Note" hint="A short summary visible in lists">
            <Textarea
              value={form.brief_note}
              onChange={e => set('brief_note', e.target.value)}
              placeholder="One or two sentences…"
              rows={2}
            />
          </Field>
        </div>

        {/* ── Detailed Summary ── */}
        <div className="mb-4">
          <Field label="Detailed Summary" hint="Full notes from the meeting">
            <Textarea
              value={form.detailed_summary}
              onChange={e => set('detailed_summary', e.target.value)}
              placeholder="Detailed notes, discussion points, action items…"
              rows={5}
            />
          </Field>
        </div>

        {/* ── Conclusion ── */}
        <div className="mb-4">
          <Field label="Conclusion" required error={errors.meeting_conclusion}
            hint="The agreed outcome or next steps">
            <Textarea
              value={form.meeting_conclusion}
              onChange={e => set('meeting_conclusion', e.target.value)}
              placeholder="What was agreed? What happens next?"
              rows={3}
              error={errors.meeting_conclusion}
            />
          </Field>
        </div>

        {/* ── PDF Attachment ── */}
        <div className="mb-6">
          <Field label="PDF Attachment" hint="Optional — max 10MB">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={e => setAttachment(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300
                  rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                {attachment ? attachment.name : 'Choose PDF…'}
              </button>
              {attachment && (
                <button
                  type="button"
                  onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              )}
              {isEdit && meeting.pdf_attachment_path && !attachment && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" /> Existing attachment kept
                </span>
              )}
            </div>
          </Field>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {isEdit ? 'Save Changes' : 'Save Meeting'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// ROOT — MeetingsPage (view controller)
// =============================================================================

const MeetingsPage = () => {
  const [view,       setView]       = useState(VIEWS.LIST);
  const [selectedId, setSelectedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [listKey,    setListKey]    = useState(0);

  // Navigate to detail
  const openDetail = (meeting) => {
    setSelectedId(meeting.id);
    setView(VIEWS.DETAIL);
  };

  // Navigate to create form
  const openCreate = () => {
    setEditTarget(null);
    setView(VIEWS.FORM);
  };

  // Navigate to edit form
  const openEdit = (meeting) => {
    setEditTarget(meeting);
    setView(VIEWS.FORM);
  };

  // Return to list (and force a refresh)
  const backToList = () => {
    setView(VIEWS.LIST);
    setSelectedId(null);
    setEditTarget(null);
  };

  // Called after successful save or delete
  const handleSaved = () => {
    setListKey(k => k + 1);
    backToList();
  };

  // "View last meeting" link clicked from form — navigate to that meeting's detail
  // We save where we came from so Back works correctly
  const [formContext, setFormContext] = useState(null); // saved form state when jumping to detail

  const handleViewMeetingFromForm = (meeting) => {
    // Save current form context so we can return
    setFormContext({ editTarget });
    setSelectedId(meeting.id);
    setView(VIEWS.DETAIL);
  };

  // Back from a "last meeting" detail view — return to form
  const handleBackFromLinkedDetail = () => {
    if (formContext !== null) {
      setEditTarget(formContext.editTarget);
      setFormContext(null);
      setView(VIEWS.FORM);
    } else {
      backToList();
    }
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
          meetingId={selectedId}
          onBack={formContext !== null ? handleBackFromLinkedDetail : backToList}
          onEdit={openEdit}
          onDeleted={() => {
            setListKey(k => k + 1);
            if (formContext !== null) {
              // Deleted the "last meeting" we linked to — just go back to form
              setEditTarget(formContext.editTarget);
              setFormContext(null);
              setView(VIEWS.FORM);
            } else {
              backToList();
            }
          }}
        />
      )}
      {view === VIEWS.FORM && (
        <FormView
          meeting={editTarget}
          onBack={backToList}
          onSaved={handleSaved}
          onViewMeeting={handleViewMeetingFromForm}
        />
      )}
    </div>
  );
};

export default MeetingsPage;
