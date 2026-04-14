import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  Button, Card, CardHeader, Field, Input, Select, Textarea, Alert,
} from '../ui';
import useAppStore, { useConfig } from '../../store/useAppStore';
import useFormValidation from '../../hooks/useFormValidation';
import { employeeAPI } from '../../services/api';

const VALIDATION_RULES = {
  first_name: [{ required: true }, { maxLength: 50 }],
  last_name: [{ required: true }, { maxLength: 50 }],
  employee_number: [{ required: true }, { maxLength: 20 }],
  email: [{ email: true }],
  id_number: [{ maxLength: 20 }],
  phone: [{ maxLength: 20 }],
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  employee_number: '',
  email: '',
  phone: '',
  id_number: '',
  department_id: '',
  job_title_id: '',
  manager_id: '',
  start_date: '',
  notes: '',
};

export default function EmployeeForm({ employee, onBack, onSaved }) {
  const isEdit = !!employee;
  const showToast = useAppStore((s) => s.showToast);
  const config = useConfig();

  const departments = config?.departments || [];
  const jobTitles = config?.job_titles || [];
  const [managers, setManagers] = useState([]);

  // Fetch active employees to use as manager options
  useEffect(() => {
    employeeAPI
      .getAll({ status: 'active', limit: 200 })
      .then((res) => {
        const list = res.data?.employees || res.data || res.employees || [];
        setManagers(list);
      })
      .catch(() => {
        /* non-critical */
      });
  }, []);

  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM };
    return {
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      employee_number: employee.employee_number || '',
      email: employee.email || '',
      phone: employee.phone || '',
      id_number: employee.id_number || '',
      department_id: employee.department_id ?? '',
      job_title_id: employee.job_title_id ?? '',
      manager_id: employee.manager_id ?? '',
      start_date: employee.start_date
        ? employee.start_date instanceof Date
          ? employee.start_date.toISOString().split('T')[0]
          : String(employee.start_date).split('T')[0]
        : '',
      notes: employee.notes || '',
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

    // Build payload — map IDs to names for backend
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      employee_number: form.employee_number,
    };

    // Add optional fields
    if (form.email) payload.email = form.email;
    if (form.phone) payload.phone = form.phone;
    if (form.id_number) payload.id_number = form.id_number;
    if (form.start_date) payload.start_date = form.start_date;
    if (form.notes) payload.notes = form.notes;

    // Map IDs to names for department and job_title
    if (form.department_id) {
      const dept = departments.find((d) => d.id === parseInt(form.department_id));
      if (dept) payload.department = dept.name;
    }
    if (form.job_title_id) {
      const title = jobTitles.find((j) => j.id === parseInt(form.job_title_id));
      if (title) payload.job_title = title.name;
    }
    if (form.manager_id) {
      payload.manager_id = parseInt(form.manager_id);
    }

    try {
      if (isEdit) {
        await employeeAPI.update(employee.id, payload);
        showToast(
          `${form.first_name} ${form.last_name} updated successfully.`,
          'success'
        );
      } else {
        await employeeAPI.create(payload);
        showToast(
          `${form.first_name} ${form.last_name} added successfully.`,
          'success'
        );
      }
      onSaved();
    } catch (err) {
      setServerError(err.message || 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium"
        >
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
          subtitle={
            isEdit
              ? 'Update the details below and save.'
              : 'Fill in the details to create a new employee record.'
          }
        />

        {serverError && (
          <div className="mb-4">
            <Alert
              type="error"
              message={serverError}
              onDismiss={() => setServerError('')}
            />
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
          <Field
            label="Employee Number"
            required
            error={errors.employee_number}
            hint="Unique identifier e.g. EMP-001"
          >
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
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
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
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ── Manager + Start date ── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Field
            label="Manager"
            hint="The employee's direct line manager"
          >
            <Select
              value={form.manager_id}
              onChange={(e) => set('manager_id', e.target.value)}
            >
              <option value="">No manager assigned</option>
              {managers
                .filter((m) => m.id !== employee?.id)
                .filter((m) => {
                  const MANAGER_TITLES = [
                    'manager',
                    'director',
                    'lead',
                    'head',
                    'supervisor',
                    'executive',
                  ];
                  return MANAGER_TITLES.some((t) =>
                    m.job_title?.toLowerCase().includes(t)
                  );
                })
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
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
          <Field
            label="Notes"
            hint="Any additional notes about this employee"
          >
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
}