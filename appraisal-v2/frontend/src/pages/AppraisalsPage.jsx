// =============================================================================
// FILE:    src/pages/AppraisalsPage.jsx
// PURPOSE: Appraisals module — four views in one file:
//            'list'   — paginated table, filter by employee / status / date range
//            'detail' — read-only appraisal with all sections + print layout
//            'form'   — create OR edit (Draft/In Progress only)
//            (print is triggered from detail — no separate route)
//
// EXPORTS: default AppraisalsPage
//
// KEY RULES:
//   - overall_rating is NEVER sent to the server — it is server-calculated
//   - Sections always sent as a complete array (backend replaces all on PUT)
//   - previous_rating shown per section for comparison (read-only, from last appraisal)
//   - Status: Draft → In Progress → Completed | Cancelled
//   - Cannot edit a Completed or Cancelled appraisal
//   - Submit: admin + manager. Cancel: admin only. Delete: admin only (Draft only)
//
// API:     appraisalAPI.getAll / getById / create / update / submit / cancel / delete
//          employeeAPI.getAll — employee selector
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList, Plus, ArrowLeft, ChevronRight, ChevronUp, ChevronDown,
  Edit2, Trash2, CheckCircle, XCircle, Star, User, Users, Calendar,
  RefreshCw, Printer, AlertTriangle, Info, ChevronDown as Chevron,
} from 'lucide-react';

import {
  Button, Card, CardHeader, Field, Input, Select, Textarea,
  Pagination, EmptyState, ConfirmDialog, PageLoader, Alert,
  Badge, StatusBadge,
} from '../components/ui';

import useAppStore, { useUser, useConfig, useIsAdmin, useIsManager } from '../store/useAppStore';
import useFormValidation from '../hooks/useFormValidation';
import { appraisalAPI, employeeAPI } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VIEWS     = { LIST: 'list', DETAIL: 'detail', FORM: 'form' };

const STATUSES = ['Draft', 'In Progress', 'Completed', 'Cancelled'];

const STATUS_COLORS = {
  'Draft':       'gray',
  'In Progress': 'blue',
  'Completed':   'green',
  'Cancelled':   'red',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (val) => {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toInputDate = (val) => {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
};

const today = () => new Date().toISOString().split('T')[0];

// One year from today as YYYY-MM-DD
const nextYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

// Render star rating (read-only)
const StarRating = ({ value, max = 5 }) => {
  const pct = Math.round((parseFloat(value) / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= Math.round(value) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}`}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-gray-700">{parseFloat(value).toFixed(2)}</span>
    </div>
  );
};

// ─── StatusBadge for appraisal status ────────────────────────────────────────

const AppraisalStatusBadge = ({ status }) => (
  <Badge variant={STATUS_COLORS[status] || 'gray'}>{status}</Badge>
);

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

// =============================================================================
// VIEW 1 — LIST
// =============================================================================

const ListView = ({ onOpenDetail, onOpenCreate }) => {
  const isManager = useIsManager();
  const config    = useConfig();

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [page,           setPage]           = useState(1);
  const [sortField,      setSortField]      = useState('appraisal_date');
  const [sortDir,        setSortDir]        = useState('desc');

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchAppraisals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (employeeFilter) params.employee_id = employeeFilter;
      if (statusFilter)   params.status      = statusFilter;
      if (dateFrom)       params.date_from   = dateFrom;
      if (dateTo)         params.date_to     = dateTo;
      const res = await appraisalAPI.getAll(params);
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, employeeFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [employeeFilter, statusFilter, dateFrom, dateTo]);
  useEffect(() => { fetchAppraisals(); }, [fetchAppraisals]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const clearFilters = () => {
    setEmployeeFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters  = employeeFilter || statusFilter || dateFrom || dateTo;
  const appraisals  = data?.appraisals || [];
  const pagination  = data?.pagination || null;

  const sorted = [...appraisals].sort((a, b) => {
    const av = sortField === 'appraisal_date' ? a.appraisal_date : a.employee_name;
    const bv = sortField === 'appraisal_date' ? b.appraisal_date : b.employee_name;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appraisals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} total` : 'Loading…'}
          </p>
        </div>
        {isManager && (
          <Button icon={Plus} onClick={onOpenCreate}>New Appraisal</Button>
        )}
      </div>

      <Card padding={false}>
        {/* ── Filters ── */}
        <div className="p-4 flex flex-wrap gap-3 items-end border-b border-gray-100">
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

          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
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
            <button onClick={fetchAppraisals} disabled={loading}
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
            icon={ClipboardList}
            title="No appraisals found"
            message={hasFilters ? 'Try adjusting your filters.' : 'No appraisals have been recorded yet.'}
            action={isManager && !hasFilters ? (
              <Button icon={Plus} size="sm" onClick={onOpenCreate}>New Appraisal</Button>
            ) : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="appraisal_date" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Date
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="employee_name" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Employee
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Appraisal</span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(a => (
                  <tr key={a.id} onClick={() => onOpenDetail(a)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-800">
                          {formatDate(a.appraisal_date)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                        {a.employee_name}
                      </p>
                      {a.department && <p className="text-xs text-gray-500">{a.department}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {a.overall_rating != null
                        ? <StarRating value={a.overall_rating} />
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <AppraisalStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-600">
                        {formatDate(a.next_appraisal_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 group-hover:text-blue-500">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
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
// SECTION ROW — used in both DetailView and PrintView
// =============================================================================

const SectionRow = ({ section, index, print = false }) => {
  const hasPrev = section.previous_rating != null;
  const diff    = hasPrev
    ? (parseFloat(section.rating) - parseFloat(section.previous_rating)).toFixed(2)
    : null;
  const diffNum = parseFloat(diff);

  return (
    <div className={`${print ? '' : 'border border-gray-200 rounded-xl'} overflow-hidden`}>
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3
        ${print ? 'border-b border-gray-300' : 'bg-gray-50 border-b border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
            ${print ? 'border border-gray-400 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
            {index + 1}
          </span>
          <span className="font-semibold text-gray-800">{section.section_name}</span>
          {section.weight > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              Weight: {section.weight}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Previous rating */}
          {hasPrev && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Previous</p>
              <p className="text-sm text-gray-500">{parseFloat(section.previous_rating).toFixed(2)}</p>
            </div>
          )}
          {/* Change indicator */}
          {diff !== null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              diffNum > 0  ? 'bg-green-100 text-green-700' :
              diffNum < 0  ? 'bg-red-100 text-red-700' :
                             'bg-gray-100 text-gray-500'
            }`}>
              {diffNum > 0 ? '+' : ''}{diff}
            </span>
          )}
          {/* Current rating */}
          <div className="text-right">
            <p className="text-xs text-gray-400">Rating</p>
            <StarRating value={section.rating} />
          </div>
        </div>
      </div>
      {/* Comments */}
      {section.comments && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-600 whitespace-pre-line">{section.comments}</p>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// VIEW 2 — DETAIL
// =============================================================================

const DetailView = ({ appraisalId, onBack, onEdit, onDeleted }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const showToast = useAppStore(s => s.showToast);

  const [appraisal,  setAppraisal]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [confirming, setConfirming] = useState(null); // 'delete' | 'cancel' | 'submit'
  const [actioning,  setActioning]  = useState(false);

  const fetchAppraisal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await appraisalAPI.getById(appraisalId);
      setAppraisal(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [appraisalId]);

  useEffect(() => { fetchAppraisal(); }, [fetchAppraisal]);

  const handleAction = async (action) => {
    setConfirming(null);
    setActioning(true);
    try {
      if (action === 'submit') {
        await appraisalAPI.submit(appraisalId);
        showToast('Appraisal submitted and completed.', 'success');
        fetchAppraisal();
      } else if (action === 'cancel') {
        await appraisalAPI.cancel(appraisalId);
        showToast('Appraisal cancelled.', 'success');
        fetchAppraisal();
      } else if (action === 'delete') {
        await appraisalAPI.delete(appraisalId);
        showToast('Appraisal deleted.', 'success');
        onDeleted?.();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) return <PageLoader />;
  if (error)   return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Appraisals
      </button>
      <Alert type="error" message={error} />
    </div>
  );
  if (!appraisal) return null;

  const canEdit   = isManager && ['Draft', 'In Progress'].includes(appraisal.status);
  const canSubmit = isManager && ['Draft', 'In Progress'].includes(appraisal.status);
  const canCancel = isAdmin   && !['Completed', 'Cancelled'].includes(appraisal.status);
  const canDelete = isAdmin   && appraisal.status === 'Draft';

  const CONFIRM_MESSAGES = {
    submit: { title: 'Submit this appraisal?',  message: 'This will mark the appraisal as Completed. It cannot be edited after submission.', danger: false },
    cancel: { title: 'Cancel this appraisal?',  message: 'This will mark the appraisal as Cancelled. This action cannot be undone.',          danger: true  },
    delete: { title: 'Delete this appraisal?',  message: 'This will permanently delete the appraisal and all its sections.',                  danger: true  },
  };

  return (
    <>
      {/* ── Screen view ── */}
      <div className="space-y-4 max-w-3xl print:hidden">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
            <ArrowLeft className="w-4 h-4" /> Appraisals
          </button>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700 font-medium">
            {appraisal.employee_name} — {formatDate(appraisal.appraisal_date)}
          </span>
        </div>

        {/* Header card */}
        <Card>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{appraisal.employee_name}</h2>
                <AppraisalStatusBadge status={appraisal.status} />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {formatDate(appraisal.appraisal_date)}
                {appraisal.department ? ` · ${appraisal.department}` : ''}
                {appraisal.job_title  ? ` · ${appraisal.job_title}`  : ''}
              </p>
              {appraisal.overall_rating != null && (
                <div className="mt-2">
                  <StarRating value={appraisal.overall_rating} />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap flex-shrink-0">
              <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>
                Print
              </Button>
              {canEdit && (
                <Button variant="secondary" size="sm" icon={Edit2} onClick={() => onEdit(appraisal)}>
                  Edit
                </Button>
              )}
              {canSubmit && (
                <Button variant="primary" size="sm" icon={CheckCircle}
                  loading={actioning} onClick={() => setConfirming('submit')}>
                  Submit
                </Button>
              )}
              {canCancel && (
                <Button variant="warning" size="sm" icon={XCircle}
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

        {/* Meta info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Appraisal Details" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{formatDate(appraisal.appraisal_date)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Next Appraisal</span>
                <span className="font-medium">{formatDate(appraisal.next_appraisal_date)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Overall Rating</span>
                {appraisal.overall_rating != null
                  ? <StarRating value={appraisal.overall_rating} />
                  : <span className="text-gray-400">—</span>}
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Status</span>
                <AppraisalStatusBadge status={appraisal.status} />
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="People Present" />
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {appraisal.people_present || '—'}
            </p>
          </Card>
        </div>

        {/* Sections */}
        {appraisal.sections?.length > 0 && (
          <Card>
            <CardHeader
              title="Section Ratings"
              subtitle={`${appraisal.sections.length} section${appraisal.sections.length !== 1 ? 's' : ''} · Overall: ${parseFloat(appraisal.overall_rating).toFixed(2)}`}
            />
            <div className="space-y-3">
              {appraisal.sections.map((s, i) => (
                <SectionRow key={s.id || i} section={s} index={i} />
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ── Print layout (shown only when printing) ── */}
      <div className="hidden print:block print-layout">
        <PrintView appraisal={appraisal} />
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <ConfirmDialog
          open
          danger={CONFIRM_MESSAGES[confirming].danger}
          title={CONFIRM_MESSAGES[confirming].title}
          message={CONFIRM_MESSAGES[confirming].message}
          onConfirm={() => handleAction(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
};

// =============================================================================
// PRINT VIEW — clean A4 layout (visible only via @media print)
// =============================================================================

const PrintView = ({ appraisal }) => (
  <div className="p-8 max-w-[210mm] mx-auto text-gray-900 font-sans">
    {/* Company header */}
    <div className="border-b-2 border-gray-800 pb-4 mb-6">
      <h1 className="text-2xl font-bold">Employee Performance Appraisal</h1>
      <p className="text-sm text-gray-500 mt-1">Confidential — For internal use only</p>
    </div>

    {/* Employee + appraisal info */}
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
      {[
        ['Employee',       appraisal.employee_name],
        ['Department',     appraisal.department || '—'],
        ['Job Title',      appraisal.job_title   || '—'],
        ['Appraisal Date', formatDate(appraisal.appraisal_date)],
        ['Next Appraisal', formatDate(appraisal.next_appraisal_date)],
        ['Status',         appraisal.status],
        ['People Present', appraisal.people_present || '—'],
        ['Overall Rating', appraisal.overall_rating != null ? parseFloat(appraisal.overall_rating).toFixed(2) + ' / 5.00' : '—'],
      ].map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="font-semibold w-36 flex-shrink-0">{label}:</span>
          <span>{value}</span>
        </div>
      ))}
    </div>

    {/* Sections table */}
    {appraisal.sections?.length > 0 && (
      <>
        <h2 className="text-base font-bold border-b border-gray-400 pb-1 mb-3">Section Ratings</h2>
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">#</th>
              <th className="border border-gray-300 px-3 py-2 text-left">Section</th>
              <th className="border border-gray-300 px-3 py-2 text-center">Weight %</th>
              <th className="border border-gray-300 px-3 py-2 text-center">Previous</th>
              <th className="border border-gray-300 px-3 py-2 text-center">Current</th>
              <th className="border border-gray-300 px-3 py-2 text-center">Change</th>
            </tr>
          </thead>
          <tbody>
            {appraisal.sections.map((s, i) => {
              const hasPrev = s.previous_rating != null;
              const diff    = hasPrev
                ? (parseFloat(s.rating) - parseFloat(s.previous_rating)).toFixed(2)
                : '—';
              const diffNum = parseFloat(diff);
              return (
                <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-3 py-2 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-3 py-2">{s.section_name}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center">{s.weight || 0}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    {hasPrev ? parseFloat(s.previous_rating).toFixed(2) : '—'}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center font-semibold">
                    {parseFloat(s.rating).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    {diff === '—' ? '—' : (diffNum > 0 ? '+' : '') + diff}
                  </td>
                </tr>
              );
            })}
            {/* Overall row */}
            <tr className="bg-gray-200 font-bold">
              <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right">
                Overall Rating (weighted)
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center">
                {appraisal.overall_rating != null ? parseFloat(appraisal.overall_rating).toFixed(2) : '—'}
              </td>
              <td className="border border-gray-300 px-3 py-2" />
            </tr>
          </tbody>
        </table>
      </>
    )}

    {/* Section comments */}
    {appraisal.sections?.some(s => s.comments) && (
      <>
        <h2 className="text-base font-bold border-b border-gray-400 pb-1 mb-3">Section Comments</h2>
        <div className="space-y-3 mb-6">
          {appraisal.sections.filter(s => s.comments).map((s, i) => (
            <div key={i}>
              <p className="font-semibold text-sm">{s.section_name}</p>
              <p className="text-sm text-gray-700 ml-4 mt-1">{s.comments}</p>
            </div>
          ))}
        </div>
      </>
    )}

    {/* Signatures */}
    <div className="mt-12 pt-6 border-t border-gray-400 grid grid-cols-2 gap-12 text-sm">
      <div>
        <p className="font-semibold mb-8">Employee Signature</p>
        <div className="border-b border-gray-400 mb-1" />
        <p className="text-gray-500">{appraisal.employee_name}</p>
      </div>
      <div>
        <p className="font-semibold mb-8">Manager Signature</p>
        <div className="border-b border-gray-400 mb-1" />
        <p className="text-gray-500">Date: _______________</p>
      </div>
    </div>
  </div>
);

// =============================================================================
// SECTION EDITOR — used inside FormView
// =============================================================================

const DEFAULT_SECTION = { section_name: '', rating: '', weight: '', previous_rating: null, comments: '' };

const SectionEditor = ({ sections, onChange }) => {
  const addSection = () => onChange([...sections, { ...DEFAULT_SECTION }]);

  const updateSection = (index, field, value) => {
    const updated = sections.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onChange(updated);
  };

  const removeSection = (index) => {
    onChange(sections.filter((_, i) => i !== index));
  };

  const totalWeight = sections.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
  const weightOk    = totalWeight <= 100.01;

  return (
    <div className="space-y-3">
      {/* Weight summary */}
      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg
        ${totalWeight === 0   ? 'bg-gray-50 text-gray-500' :
          !weightOk           ? 'bg-red-50 text-red-700 border border-red-200' :
          totalWeight < 99.9  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                'bg-green-50 text-green-700 border border-green-200'}`}>
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>
          Total weight: <strong>{totalWeight.toFixed(1)}%</strong>
          {totalWeight === 0  ? ' — weights optional (simple average will be used)' :
           !weightOk          ? ' — must not exceed 100%' :
           totalWeight < 99.9 ? ' — weights do not sum to 100% (that is allowed)' :
                                ' — weights balanced ✓'}
        </span>
      </div>

      {sections.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          No sections yet — click "Add Section" to begin
        </div>
      )}

      {sections.map((s, index) => (
        <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Section header row */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center
              justify-center text-xs font-bold flex-shrink-0">
              {index + 1}
            </span>
            <input
              value={s.section_name}
              onChange={e => updateSection(index, 'section_name', e.target.value)}
              placeholder="Section name (e.g. Communication, Technical Skills)"
              className="flex-1 text-sm font-medium bg-transparent border-none outline-none
                placeholder-gray-400 text-gray-800"
            />
            <button
              type="button"
              onClick={() => removeSection(index)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
              title="Remove section"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Rating + weight + previous */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Rating (0–5) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0" max="5" step="0.1"
                value={s.rating}
                onChange={e => updateSection(index, 'rating', e.target.value)}
                placeholder="0.0"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Weight %
              </label>
              <input
                type="number"
                min="0" max="100" step="1"
                value={s.weight}
                onChange={e => updateSection(index, 'weight', e.target.value)}
                placeholder="0"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Previous Rating
              </label>
              <input
                type="number"
                min="0" max="5" step="0.1"
                value={s.previous_rating ?? ''}
                onChange={e => updateSection(index, 'previous_rating',
                  e.target.value === '' ? null : e.target.value)}
                placeholder="— optional"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Comments */}
          <div className="px-4 pb-3">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Comments</label>
            <textarea
              value={s.comments}
              onChange={e => updateSection(index, 'comments', e.target.value)}
              placeholder="Optional notes for this section…"
              rows={2}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="w-full py-2.5 border-2 border-dashed border-blue-300 rounded-xl
          text-sm font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-400
          transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add Section
      </button>
    </div>
  );
};

// =============================================================================
// VIEW 3 — CREATE / EDIT FORM
// =============================================================================

const VALIDATION_RULES = {
  employee_id:     [{ required: true }],
  appraisal_date:  [{ required: true }],
};

const EMPTY_FORM = {
  employee_id:        '',
  appraisal_date:     today(),
  next_appraisal_date: nextYear(),
  people_present:     '',
  status:             'Draft',
};

const FormView = ({ appraisal, onBack, onSaved }) => {
  const isEdit    = !!appraisal;
  const showToast = useAppStore(s => s.showToast);

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      employee_id:         String(appraisal.employee_id ?? ''),
      appraisal_date:      toInputDate(appraisal.appraisal_date),
      next_appraisal_date: toInputDate(appraisal.next_appraisal_date),
      people_present:      appraisal.people_present || '',
      status:              appraisal.status || 'Draft',
    };
  });

  // Sections state — separate from form because it's a complex array
  const [sections, setSections] = useState(() => {
    if (!isEdit || !appraisal.sections) return [];
    return appraisal.sections.map(s => ({
      section_name:    s.section_name    || '',
      rating:          s.rating          != null ? String(s.rating)          : '',
      weight:          s.weight          != null ? String(s.weight)          : '',
      previous_rating: s.previous_rating != null ? String(s.previous_rating) : null,
      comments:        s.comments        || '',
    }));
  });

  const [sectionsError, setSectionsError] = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [serverError,   setServerError]   = useState('');

  const { errors, validate, validateField } = useFormValidation(VALIDATION_RULES);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  // Live overall rating preview (mirrors backend formula)
  const previewRating = () => {
    const valid = sections.filter(s => s.rating !== '' && !isNaN(parseFloat(s.rating)));
    if (valid.length === 0) return null;
    const totalWeight = valid.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
    if (totalWeight === 0) {
      return valid.reduce((sum, s) => sum + parseFloat(s.rating), 0) / valid.length;
    }
    return valid.reduce((sum, s) => sum + parseFloat(s.rating) * (parseFloat(s.weight) || 0), 0) / totalWeight;
  };

  const ratingPreview = previewRating();

  const handleSubmit = async () => {
    const formValid = validate(form);

    // Validate sections
    let secError = '';
    if (sections.length === 0) {
      secError = 'At least one section is required.';
    } else {
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        if (!s.section_name.trim()) { secError = `Section ${i + 1}: name is required.`; break; }
        if (s.rating === '' || isNaN(parseFloat(s.rating))) { secError = `Section ${i + 1}: rating is required.`; break; }
        if (parseFloat(s.rating) < 0 || parseFloat(s.rating) > 5) { secError = `Section ${i + 1}: rating must be 0–5.`; break; }
        const w = parseFloat(s.weight) || 0;
        if (w < 0 || w > 100) { secError = `Section ${i + 1}: weight must be 0–100.`; break; }
      }
      const totalWeight = sections.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
      if (!secError && totalWeight > 100.01) {
        secError = `Section weights total ${totalWeight.toFixed(1)}% — must not exceed 100%.`;
      }
    }
    setSectionsError(secError);
    if (!formValid || secError) return;

    setSubmitting(true);
    setServerError('');

    try {
      // Build section payload — overall_rating NOT included (server calculates it)
      const sectionPayload = sections.map((s, i) => ({
        section_name:    s.section_name.trim(),
        rating:          parseFloat(s.rating),
        weight:          parseFloat(s.weight) || 0,
        previous_rating: s.previous_rating != null && s.previous_rating !== ''
          ? parseFloat(s.previous_rating) : null,
        comments:        s.comments || null,
        sort_order:      i,
      }));

      if (isEdit) {
        await appraisalAPI.update(appraisal.id, {
          appraisal_date:      form.appraisal_date,
          next_appraisal_date: form.next_appraisal_date || null,
          people_present:      form.people_present      || null,
          status:              form.status,
          sections:            sectionPayload,
        });
        showToast('Appraisal updated successfully.', 'success');
      } else {
        await appraisalAPI.create({
          employee_id:         parseInt(form.employee_id, 10),
          appraisal_date:      form.appraisal_date,
          next_appraisal_date: form.next_appraisal_date || null,
          people_present:      form.people_present      || null,
          status:              form.status,
          sections:            sectionPayload,
        });
        showToast('Appraisal created successfully.', 'success');
      }
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const editEmployeeName = isEdit ? appraisal.employee_name : null;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Appraisals
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit ? `Edit — ${editEmployeeName} · ${formatDate(appraisal.appraisal_date)}` : 'New Appraisal'}
        </span>
      </div>

      <Card>
        <CardHeader
          title={isEdit ? 'Edit Appraisal' : 'New Appraisal'}
          subtitle={isEdit
            ? 'Update appraisal details. Overall rating is calculated from sections.'
            : 'Create a new appraisal. Overall rating is calculated automatically from section ratings.'}
        />

        {serverError && (
          <div className="mb-4">
            <Alert type="error" message={serverError} onDismiss={() => setServerError('')} />
          </div>
        )}

        {/* Employee + Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Employee" required error={errors.employee_id}>
            {isEdit ? (
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

          <Field label="Appraisal Date" required error={errors.appraisal_date}>
            <Input
              type="date"
              value={form.appraisal_date}
              onChange={e => set('appraisal_date', e.target.value)}
              error={errors.appraisal_date}
            />
          </Field>
        </div>

        {/* Next appraisal date + People Present */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Next Appraisal Date" hint="Defaults to one year from today">
            <Input
              type="date"
              value={form.next_appraisal_date}
              onChange={e => set('next_appraisal_date', e.target.value)}
            />
          </Field>

          <Field label="People Present">
            <Input
              value={form.people_present}
              onChange={e => set('people_present', e.target.value)}
              placeholder="Names of all attendees"
            />
          </Field>
        </div>

        {/* Status (Draft / In Progress only) */}
        <div className="mb-6">
          <Field label="Status">
            <Select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="Draft">Draft</option>
              <option value="In Progress">In Progress</option>
            </Select>
          </Field>
        </div>

        {/* Overall rating preview */}
        {ratingPreview !== null && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-blue-600 font-medium">Calculated Overall Rating (preview)</p>
              <StarRating value={ratingPreview} />
            </div>
            <p className="text-xs text-blue-500 ml-auto">Server will recalculate on save</p>
          </div>
        )}
      </Card>

      {/* Sections editor */}
      <Card>
        <CardHeader
          title="Section Ratings"
          subtitle="Add one section per competency area. Overall rating is the weighted average."
        />
        {sectionsError && (
          <div className="mb-4">
            <Alert type="error" message={sectionsError} onDismiss={() => setSectionsError('')} />
          </div>
        )}
        <SectionEditor sections={sections} onChange={setSections} />
      </Card>

      {/* Actions */}
      <Card>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {isEdit ? 'Save Changes' : 'Save Appraisal'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// ROOT — AppraisalsPage (view controller)
// =============================================================================

const AppraisalsPage = () => {
  const [view,       setView]       = useState(VIEWS.LIST);
  const [selectedId, setSelectedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [listKey,    setListKey]    = useState(0);

  const openDetail = (appraisal) => {
    setSelectedId(appraisal.id);
    setView(VIEWS.DETAIL);
  };

  const openCreate = () => {
    setEditTarget(null);
    setView(VIEWS.FORM);
  };

  const openEdit = (appraisal) => {
    setEditTarget(appraisal);
    setView(VIEWS.DETAIL); // Stay in detail — form navigated from there
    setEditTarget(appraisal);
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
          appraisalId={selectedId}
          onBack={backToList}
          onEdit={openEdit}
          onDeleted={handleDeleted}
        />
      )}
      {view === VIEWS.FORM && (
        <FormView
          appraisal={editTarget}
          onBack={backToList}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default AppraisalsPage;
