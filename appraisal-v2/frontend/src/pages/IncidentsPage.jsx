// =============================================================================
// FILE:    src/pages/IncidentsPage.jsx
// PURPOSE: Incidents module — three views controlled by internal state:
//            'list'   — paginated table, filter by employee/type/severity/date
//            'detail' — read-only incident record
//            'form'   — create OR edit (admin/manager only)
//
// EXPORTS: default IncidentsPage
//
// KEY RULES:
//   - incident_type sent as STRING name — backend resolves the ID
//   - Severities: Low | Medium | High | Critical
//   - No status workflow — incidents are logged facts
//   - Delete: admin only (hard delete)
//   - Role access: admin=all, manager=subordinates, employee=own (read-only)
//
// API:     incidentAPI.getAll / getById / create / update / delete
//          employeeAPI.getAll  — employee selector
//          useConfig()         — incident_types dropdown
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, ArrowLeft, ChevronRight,
  ChevronUp, ChevronDown, Edit2, Trash2,
  RefreshCw, User, Calendar, Shield,
} from 'lucide-react';

import {
  Button, Card, CardHeader, Field, Input, Select, Textarea,
  Pagination, EmptyState, ConfirmDialog, PageLoader, Alert, Badge,
} from '../components/ui';

import useAppStore, { useConfig, useIsAdmin, useIsManager } from '../store/useAppStore';
import useFormValidation from '../hooks/useFormValidation';
import { incidentAPI, employeeAPI } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const VIEWS     = { LIST: 'list', DETAIL: 'detail', FORM: 'form' };

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_COLORS = {
  Low:      'gray',
  Medium:   'blue',
  High:     'yellow',
  Critical: 'red',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const today = () => new Date().toISOString().split('T')[0];

// ─── SeverityBadge ───────────────────────────────────────────────────────────

const SeverityBadge = ({ severity }) => (
  <Badge variant={SEVERITY_COLORS[severity] || 'gray'}>{severity || '—'}</Badge>
);

// ─── SortButton ──────────────────────────────────────────────────────────────

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

  const incidentTypes = config?.incident_types || [];

  const [employeeFilter,  setEmployeeFilter]  = useState('');
  const [typeFilter,      setTypeFilter]      = useState('');
  const [severityFilter,  setSeverityFilter]  = useState('');
  const [dateFrom,        setDateFrom]        = useState('');
  const [dateTo,          setDateTo]          = useState('');
  const [page,            setPage]            = useState(1);
  const [sortField,       setSortField]       = useState('incident_date');
  const [sortDir,         setSortDir]         = useState('desc');

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (employeeFilter) params.employee_id   = employeeFilter;
      if (typeFilter)     params.incident_type = typeFilter;
      if (severityFilter) params.severity      = severityFilter;
      if (dateFrom)       params.date_from     = dateFrom;
      if (dateTo)         params.date_to       = dateTo;
      const res = await incidentAPI.getAll(params);
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, employeeFilter, typeFilter, severityFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [employeeFilter, typeFilter, severityFilter, dateFrom, dateTo]);
  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const clearFilters = () => {
    setEmployeeFilter('');
    setTypeFilter('');
    setSeverityFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = employeeFilter || typeFilter || severityFilter || dateFrom || dateTo;
  const incidents  = data?.incidents || [];
  const pagination = data?.pagination || null;

  const sorted = [...incidents].sort((a, b) => {
    const av = sortField === 'incident_date' ? a.incident_date : a.employee_name;
    const bv = sortField === 'incident_date' ? b.incident_date : b.employee_name;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} total` : 'Loading…'}
          </p>
        </div>
        {isManager && (
          <Button icon={Plus} onClick={onOpenCreate}>Log Incident</Button>
        )}
      </div>

      <Card padding={false}>
        {/* Filters */}
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

          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500">Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {incidentTypes.map(t => (
                <option key={t.id || t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-medium text-gray-500">Severity</label>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
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
            <button onClick={fetchIncidents} disabled={loading}
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
            icon={AlertTriangle}
            title="No incidents found"
            message={hasFilters ? 'Try adjusting your filters.' : 'No incidents have been logged yet.'}
            action={isManager && !hasFilters ? (
              <Button icon={Plus} size="sm" onClick={onOpenCreate}>Log Incident</Button>
            ) : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="incident_date" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
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
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detail</span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(inc => (
                  <tr key={inc.id} onClick={() => onOpenDetail(inc)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-800">
                          {formatDate(inc.incident_date)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                        {inc.employee_name}
                      </p>
                      {inc.department && (
                        <p className="text-xs text-gray-500">{inc.department}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{inc.incident_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-gray-600 truncate max-w-xs">
                        {inc.detail}
                      </p>
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
// VIEW 2 — DETAIL
// =============================================================================

const DetailView = ({ incidentId, onBack, onEdit, onDeleted }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const showToast = useAppStore(s => s.showToast);

  const [incident,   setIncident]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const fetchIncident = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await incidentAPI.getById(incidentId);
      setIncident(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => { fetchIncident(); }, [fetchIncident]);

  const handleDelete = async () => {
    setConfirming(false);
    setDeleting(true);
    try {
      await incidentAPI.delete(incidentId);
      showToast('Incident deleted.', 'success');
      onDeleted?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error)   return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Incidents
      </button>
      <Alert type="error" message={error} />
    </div>
  );
  if (!incident) return null;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Incidents
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {incident.employee_name} — {formatDate(incident.incident_date)}
        </span>
      </div>

      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
            ${incident.severity === 'Critical' ? 'bg-red-100' :
              incident.severity === 'High'     ? 'bg-yellow-100' :
              incident.severity === 'Medium'   ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <AlertTriangle className={`w-6 h-6
              ${incident.severity === 'Critical' ? 'text-red-600' :
                incident.severity === 'High'     ? 'text-yellow-600' :
                incident.severity === 'Medium'   ? 'text-blue-600' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{incident.employee_name}</h2>
              <SeverityBadge severity={incident.severity} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {incident.incident_type}
              {incident.department ? ` · ${incident.department}` : ''}
              {' · '}{formatDate(incident.incident_date)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            {isManager && (
              <Button variant="secondary" size="sm" icon={Edit2}
                onClick={() => onEdit(incident)}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button variant="danger" size="sm" icon={Trash2}
                loading={deleting} onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Incident Details" />
          <div className="space-y-2 text-sm">
            {[
              ['Date',     formatDate(incident.incident_date)],
              ['Type',     incident.incident_type],
              ['Severity', incident.severity],
              ['Employee', incident.employee_name],
              ['Department', incident.department || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-right">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Logged By" />
          <div className="flex items-center gap-3 py-2">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                User #{incident.logged_by_user_id}
              </p>
              <p className="text-xs text-gray-500">
                {formatDate(incident.created_at)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detail text */}
      <Card>
        <CardHeader title="Incident Detail" />
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
          {incident.detail}
        </p>
      </Card>

      {/* Confirm delete */}
      {confirming && (
        <ConfirmDialog
          open
          danger
          title="Delete this incident?"
          message="This will permanently delete the incident record. This action cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
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
  incident_date:  [{ required: true }],
  incident_type:  [{ required: true }],
  detail:         [{ required: true }],
};

const EMPTY_FORM = {
  employee_id:   '',
  incident_date: today(),
  incident_type: '',
  severity:      'Medium',
  detail:        '',
};

const FormView = ({ incident, onBack, onSaved }) => {
  const isEdit    = !!incident;
  const showToast = useAppStore(s => s.showToast);
  const config    = useConfig();

  const incidentTypes = config?.incident_types || [];

  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then(res => setEmployees(res.data?.employees || res.data || []))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      employee_id:   String(incident.employee_id ?? ''),
      incident_date: String(incident.incident_date ?? '').split('T')[0],
      incident_type: incident.incident_type || '',
      severity:      incident.severity      || 'Medium',
      detail:        incident.detail        || '',
    };
  });

  const [submitting,  setSubmitting]  = useState(false);
  const [serverError, setServerError] = useState('');

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
        await incidentAPI.update(incident.id, {
          incident_date: form.incident_date,
          incident_type: form.incident_type,
          severity:      form.severity,
          detail:        form.detail,
        });
        showToast('Incident updated.', 'success');
      } else {
        await incidentAPI.create({
          employee_id:   parseInt(form.employee_id, 10),
          incident_date: form.incident_date,
          incident_type: form.incident_type,
          severity:      form.severity,
          detail:        form.detail,
        });
        showToast('Incident logged.', 'success');
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
          <ArrowLeft className="w-4 h-4" /> Incidents
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit
            ? `Edit — ${incident.employee_name} · ${formatDate(incident.incident_date)}`
            : 'Log Incident'}
        </span>
      </div>

      <Card>
        <CardHeader
          title={isEdit ? 'Edit Incident' : 'Log Incident'}
          subtitle={isEdit ? 'Update the incident record.' : 'Record a new incident for an employee.'}
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
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50
                border border-gray-200 rounded-lg">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">{incident.employee_name}</span>
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

          <Field label="Incident Date" required error={errors.incident_date}>
            <Input
              type="date"
              value={form.incident_date}
              onChange={e => set('incident_date', e.target.value)}
              error={errors.incident_date}
            />
          </Field>
        </div>

        {/* Type + Severity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Incident Type" required error={errors.incident_type}>
            <Select
              value={form.incident_type}
              onChange={e => set('incident_type', e.target.value)}
              error={errors.incident_type}
            >
              <option value="">Select type…</option>
              {incidentTypes.map(t => (
                <option key={t.id || t.name} value={t.name}>{t.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Severity">
            <Select
              value={form.severity}
              onChange={e => set('severity', e.target.value)}
            >
              {SEVERITIES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Detail */}
        <div className="mb-6">
          <Field label="Detail" required error={errors.detail}
            hint="Describe the incident clearly and factually.">
            <Textarea
              value={form.detail}
              onChange={e => set('detail', e.target.value)}
              error={errors.detail}
              rows={5}
              placeholder="Provide a clear, factual description of the incident…"
            />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {isEdit ? 'Save Changes' : 'Log Incident'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// ROOT — IncidentsPage (view controller)
// =============================================================================

const IncidentsPage = () => {
  const [view,       setView]       = useState(VIEWS.LIST);
  const [selectedId, setSelectedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [listKey,    setListKey]    = useState(0);

  const openDetail = (incident) => {
    setSelectedId(incident.id);
    setView(VIEWS.DETAIL);
  };

  const openCreate = () => {
    setEditTarget(null);
    setView(VIEWS.FORM);
  };

  const openEdit = (incident) => {
    setEditTarget(incident);
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
          incidentId={selectedId}
          onBack={backToList}
          onEdit={openEdit}
          onDeleted={handleDeleted}
        />
      )}
      {view === VIEWS.FORM && (
        <FormView
          incident={editTarget}
          onBack={backToList}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default IncidentsPage;
