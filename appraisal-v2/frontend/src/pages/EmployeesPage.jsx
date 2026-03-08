// =============================================================================
// FILE:    src/pages/EmployeesPage.jsx
// PURPOSE: Employees module — three views in one file:
//            'list'   — paginated table, search + dept/status filters
//            'detail' — read-only profile card with breadcrumb nav
//            'form'   — create OR edit form (mode-aware)
//
// EXPORTS: default EmployeesPage
//
// ROUTES:  /employees  (list)
//          State-driven sub-views: detail and form do not change the URL
//          because deeper routing is handled in a later phase.
//
// API:     employeeAPI.getAll / getById / create / update / deactivate / restore
// ROLES:   All roles can view the list and detail.
//          Admin + Manager can create and edit.
//          Only Admin can deactivate / restore.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Plus, ChevronRight, ChevronUp, ChevronDown,
  Edit2, UserX, UserCheck, ArrowLeft, Phone, Mail, Building2,
  Briefcase, User, Hash, Calendar, Star, RefreshCw,
} from 'lucide-react';

import {
  Button, StatusBadge, Card, CardHeader, Field, Input, Select,
  Textarea, Pagination, EmptyState, ConfirmDialog, Spinner,
  PageLoader, Alert, Badge,
} from '../components/ui';

import useAppStore, { useUser, useConfig, useIsAdmin, useIsManager } from '../store/useAppStore';
import useFormValidation from '../hooks/useFormValidation';
import { employeeAPI }       from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE   = 20;
const VIEWS       = { LIST: 'list', DETAIL: 'detail', FORM: 'form' };
const SORT_FIELDS = {
  employee_number: 'Emp #',
  full_name:       'Name',
  department_name: 'Department',
  status:          'Status',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (val) => {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ratingColor = (r) => {
  if (!r) return 'text-gray-400';
  if (r >= 4)   return 'text-green-600';
  if (r >= 2.5) return 'text-yellow-600';
  return 'text-red-600';
};

const initials = (name) =>
  (name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = ({ name, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' };
  return (
    <div className={`rounded-full bg-blue-100 text-blue-700 font-semibold
      flex items-center justify-center flex-shrink-0 ${sizes[size]}`}>
      {initials(name)}
    </div>
  );
};

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
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();

  // ── Filter + sort state ──────────────────────────────────────────────────
  const [search,     setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // default: active only
  const [sortField,  setSortField]  = useState('full_name');
  const [sortDir,    setSortDir]    = useState('asc');
  const [page,       setPage]       = useState(1);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const config = useConfig();
  const departments = config?.departments || [];

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        sort:  sortField,
        dir:   sortDir,
      };
      if (search.trim())   params.search     = search.trim();
      if (deptFilter)      params.department = deptFilter;
      if (statusFilter)    params.status     = statusFilter;

      const res = await employeeAPI.getAll(params);
      setData(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, sortField, sortDir, search, deptFilter, statusFilter]);

  // Re-fetch whenever filters change; reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter, sortField, sortDir]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Debounce search input so we don't fire on every keystroke
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const employees   = data?.employees  || data?.data || [];
  const pagination  = data?.pagination || null;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} total` : 'Loading…'}
          </p>
        </div>
        {isManager && (
          <Button icon={Plus} onClick={onOpenCreate}>
            Add Employee
          </Button>
        )}
      </div>

      {/* ── Filters ── */}
      <Card padding={false}>
        <div className="p-4 flex flex-wrap gap-3 items-center border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, employee number…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Department filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[130px]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchEmployees}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-300 text-gray-500
              hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── Table ── */}
        {error && (
          <div className="p-4">
            <Alert type="error" message={error} onDismiss={() => setError('')} />
          </div>
        )}

        {loading && !data ? (
          <PageLoader />
        ) : employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees found"
            message={search || deptFilter || statusFilter ? 'Try adjusting your filters.' : 'Add your first employee to get started.'}
            action={isManager && !search && !deptFilter ? (
              <Button icon={Plus} size="sm" onClick={onOpenCreate}>Add Employee</Button>
            ) : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="full_name" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Name
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="department_name" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Department
                    </SortButton>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="status" currentField={sortField} currentDir={sortDir} onSort={handleSort}>
                      Status
                    </SortButton>
                  </th>
                  {/* Spacer for action chevron */}
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => onOpenDetail(emp)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group"
                  >
                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.full_name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                            {emp.full_name}
                          </p>
                          {emp.job_title && (
                            <p className="text-xs text-gray-500">{emp.job_title}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {emp.department_name || '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={emp.is_active ? 'Active' : 'Inactive'} />
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
// VIEW 2 — DETAIL (read-only profile)
// =============================================================================

const DetailView = ({ employeeId, onBack, onEdit, onDeactivated }) => {
  const isAdmin   = useIsAdmin();
  const isManager = useIsManager();
  const showToast = useAppStore((s) => s.showToast);

  const [employee,   setEmployee]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [confirming, setConfirming] = useState(false); // deactivate confirm
  const [actioning,  setActioning]  = useState(false); // deactivate/restore in flight

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await employeeAPI.getById(employeeId);
      setEmployee(res.data ?? res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);

  const handleDeactivate = async () => {
    setConfirming(false);
    setActioning(true);
    try {
      await employeeAPI.deactivate(employeeId);
      showToast(`${employee.full_name} has been deactivated.`, 'success');
      onDeactivated?.();
    } catch (err) {
      showToast('Deactivate failed: ' + err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleRestore = async () => {
    setActioning(true);
    try {
      await employeeAPI.restore(employeeId);
      showToast(`${employee.full_name} has been restored.`, 'success');
      fetchEmployee(); // reload in-place
    } catch (err) {
      showToast('Restore failed: ' + err.message, 'error');
    } finally {
      setActioning(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error)   return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>
      <Alert type="error" message={error} />
    </div>
  );
  if (!employee) return null;

  const isActive = employee.is_active;

  // ── Info row helper ──────────────────────────────────────────────────────
  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5 break-words">{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Employees
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">{employee.full_name}</span>
      </div>

      {/* ── Profile header card ── */}
      <Card>
        <div className="flex items-start gap-4 flex-wrap">
          <Avatar name={employee.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{employee.full_name}</h2>
              <StatusBadge status={isActive ? 'Active' : 'Inactive'} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {employee.job_title || 'No job title'} · {employee.department_name || 'No department'}
            </p>
            {employee.average_rating != null && (
              <div className="flex items-center gap-1.5 mt-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span className={`text-sm font-semibold ${ratingColor(employee.average_rating)}`}>
                  {Number(employee.average_rating).toFixed(1)}
                </span>
                <span className="text-xs text-gray-400">avg rating</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {isManager && isActive && (
              <Button variant="secondary" size="sm" icon={Edit2} onClick={() => onEdit(employee)}>
                Edit
              </Button>
            )}
            {isAdmin && isActive && (
              <Button
                variant="danger" size="sm" icon={UserX}
                loading={actioning}
                onClick={() => setConfirming(true)}
              >
                Deactivate
              </Button>
            )}
            {isAdmin && !isActive && (
              <Button
                variant="success" size="sm" icon={UserCheck}
                loading={actioning}
                onClick={handleRestore}
              >
                Restore
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Personal info */}
        <Card>
          <CardHeader title="Personal Information" />
          <InfoRow icon={Hash}     label="Employee Number" value={employee.employee_number} />
          <InfoRow icon={User}     label="ID / Passport"   value={employee.id_number} />
          <InfoRow icon={Mail}     label="Email"           value={employee.email} />
          <InfoRow icon={Phone}    label="Phone"           value={employee.phone} />
          <InfoRow icon={Calendar} label="Start Date"      value={formatDate(employee.start_date)} />
        </Card>

        {/* Role info */}
        <Card>
          <CardHeader title="Role & Reporting" />
          <InfoRow icon={Briefcase}  label="Job Title"   value={employee.job_title} />
          <InfoRow icon={Building2}  label="Department"  value={employee.department_name} />
          <InfoRow icon={User}       label="Manager"     value={employee.manager_name} />
          <InfoRow icon={Calendar}   label="Last Meeting"    value={formatDate(employee.last_meeting_date)} />
          <InfoRow icon={Calendar}   label="Last Appraisal"  value={formatDate(employee.last_appraisal_date)} />
          <InfoRow icon={Calendar}   label="Next Appraisal"  value={formatDate(employee.next_appraisal_date)} />
        </Card>
      </div>

      {/* Notes */}
      {employee.notes && (
        <Card>
          <CardHeader title="Notes" />
          <p className="text-sm text-gray-700 whitespace-pre-line">{employee.notes}</p>
        </Card>
      )}

      {/* ── Deactivate confirm ── */}
      <ConfirmDialog
        open={confirming}
        danger
        title={`Deactivate ${employee.full_name}?`}
        message="This employee will be marked inactive and hidden from active lists. Their history is preserved. You can restore them at any time."
        onConfirm={handleDeactivate}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

// =============================================================================
// VIEW 3 — CREATE / EDIT FORM
// =============================================================================

const VALIDATION_RULES = {
  first_name:       [{ required: true }, { maxLength: 50 }],
  last_name:        [{ required: true }, { maxLength: 50 }],
  employee_number:  [{ required: true }, { maxLength: 20 }],
  email:            [{ email: true }],
  id_number:        [{ maxLength: 20 }],
  phone:            [{ maxLength: 20 }],
};

const EMPTY_FORM = {
  first_name:      '',
  last_name:       '',
  employee_number: '',
  email:           '',
  phone:           '',
  id_number:       '',
  department_id:   '',
  job_title_id:    '',
  manager_id:      '',
  start_date:      '',
  notes:           '',
};

const FormView = ({ employee, onBack, onSaved }) => {
  const isEdit    = !!employee;
  const showToast = useAppStore((s) => s.showToast);
  const config    = useConfig();

  const departments = config?.departments || [];
  const jobTitles   = config?.job_titles  || [];
  // managers list: ideally from a dedicated endpoint; we use employeeAPI.getAll
  const [managers, setManagers] = useState([]);

  // Fetch active employees to use as manager options
  useEffect(() => {
    employeeAPI.getAll({ status: 'active', limit: 200 })
      .then((res) => {
        const list = res.data?.employees || res.data || res.employees || [];
        setManagers(list);
      })
      .catch(() => { /* non-critical — just leave empty */ });
  }, []);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      first_name:      employee.first_name      || '',
      last_name:       employee.last_name       || '',
      employee_number: employee.employee_number || '',
      email:           employee.email           || '',
      phone:           employee.phone           || '',
      id_number:       employee.id_number       || '',
      department_id:   employee.department_id   ?? '',
      job_title_id:    employee.job_title_id    ?? '',
      manager_id:      employee.manager_id      ?? '',
      start_date:      employee.start_date
                         ? (employee.start_date instanceof Date
                             ? employee.start_date.toISOString().split('T')[0]
                             : String(employee.start_date).split('T')[0])
                         : '',
      notes:           employee.notes           || '',
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const { errors, validate, validateField } = useFormValidation(VALIDATION_RULES);

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleSubmit = async () => {
    const valid = validate(form);
    if (!valid) return;

    setSubmitting(true);
    setServerError('');

    // Build payload — omit empty optional strings to keep the body clean
    const payload = { ...form };
    ['email', 'phone', 'id_number', 'notes'].forEach((k) => {
      if (!payload[k]) delete payload[k];
    });
    ['department_id', 'job_title_id', 'manager_id'].forEach((k) => {
      if (!payload[k]) payload[k] = null;
    });

    try {
      if (isEdit) {
        await employeeAPI.update(employee.id, payload);
        showToast(`${form.first_name} ${form.last_name} updated successfully.`, 'success');
      } else {
        await employeeAPI.create(payload);
        showToast(`${form.first_name} ${form.last_name} added successfully.`, 'success');
      }
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Employees
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-700 font-medium">
          {isEdit ? `Edit — ${employee.full_name}` : 'Add Employee'}
        </span>
      </div>

      <Card>
        <CardHeader
          title={isEdit ? 'Edit Employee' : 'Add New Employee'}
          subtitle={isEdit ? 'Update the details below and save.' : 'Fill in the details to create a new employee record.'}
        />

        {serverError && (
          <div className="mb-4">
            <Alert type="error" message={serverError} onDismiss={() => setServerError('')} />
          </div>
        )}

        {/* ── Name row ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="First Name" required error={errors.first_name}>
            <Input
              value={form.first_name}
              onChange={(e) => set('first_name', e.target.value)}
              placeholder="Jane"
              error={errors.first_name}
            />
          </Field>
          <Field label="Last Name" required error={errors.last_name}>
            <Input
              value={form.last_name}
              onChange={(e) => set('last_name', e.target.value)}
              placeholder="Smith"
              error={errors.last_name}
            />
          </Field>
        </div>

        {/* ── Employee number + ID ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Employee Number" required error={errors.employee_number}
            hint="Unique identifier e.g. EMP-001">
            <Input
              value={form.employee_number}
              onChange={(e) => set('employee_number', e.target.value)}
              placeholder="EMP-001"
              error={errors.employee_number}
            />
          </Field>
          <Field label="ID / Passport Number" error={errors.id_number}>
            <Input
              value={form.id_number}
              onChange={(e) => set('id_number', e.target.value)}
              placeholder="Optional"
              error={errors.id_number}
            />
          </Field>
        </div>

        {/* ── Contact ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="jane@company.com"
              error={errors.email}
            />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+27 11 000 0000"
              error={errors.phone}
            />
          </Field>
        </div>

        {/* ── Role info ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Department">
            <Select
              value={form.department_id}
              onChange={(e) => set('department_id', e.target.value)}
            >
              <option value="">Select department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Job Title">
            <Select
              value={form.job_title_id}
              onChange={(e) => set('job_title_id', e.target.value)}
            >
              <option value="">Select job title…</option>
              {jobTitles.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ── Manager + Start date ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field label="Manager" hint="The employee's direct line manager">
            <Select
              value={form.manager_id}
              onChange={(e) => set('manager_id', e.target.value)}
            >
              <option value="">No manager assigned</option>
              {managers
                .filter((m) => m.id !== employee?.id) // can't manage yourself
                // TODO: confirm exact manager-eligible titles with client before go-live
                .filter((m) => {
                  const MANAGER_TITLES = ['manager', 'director', 'lead', 'head', 'supervisor', 'executive']; 
                  return MANAGER_TITLES.some((t) => m.job_title?.toLowerCase().includes(t));
                })
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
            </Select>
          </Field>
          <Field label="Start Date">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </Field>
        </div>

        {/* ── Notes ── */}
        <div className="mb-6">
          <Field label="Notes" hint="Any additional notes about this employee">
            <Textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Optional notes…"
              rows={3}
            />
          </Field>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
          >
            {isEdit ? 'Save Changes' : 'Add Employee'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// =============================================================================
// ROOT — EmployeesPage (view controller)
// =============================================================================

const EmployeesPage = () => {
  // view = 'list' | 'detail' | 'form'
  const [view,       setView]       = useState(VIEWS.LIST);
  const [selectedId, setSelectedId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);  // full employee obj for edit
  const [listKey,    setListKey]    = useState(0);     // increment to force list refresh

  // Navigate to detail
  const openDetail = (emp) => {
    setSelectedId(emp.id);
    setView(VIEWS.DETAIL);
  };

  // Navigate to create form
  const openCreate = () => {
    setEditTarget(null);
    setView(VIEWS.FORM);
  };

  // Navigate to edit form
  const openEdit = (emp) => {
    setEditTarget(emp);
    setView(VIEWS.FORM);
  };

  // Return to list (and force a refresh)
  const backToList = () => {
    setView(VIEWS.LIST);
    setSelectedId(null);
    setEditTarget(null);
  };

  // Called after successful save or deactivate
  const handleSaved = () => {
    setListKey((k) => k + 1); // force list re-fetch
    backToList();
  };

  // After deactivate from detail view — go back to list
  const handleDeactivated = () => {
    setListKey((k) => k + 1);
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
          employeeId={selectedId}
          onBack={backToList}
          onEdit={openEdit}
          onDeactivated={handleDeactivated}
        />
      )}
      {view === VIEWS.FORM && (
        <FormView
          employee={editTarget}
          onBack={backToList}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default EmployeesPage;
