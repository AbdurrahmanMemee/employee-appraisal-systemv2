import React, { useState } from 'react';
import { X, Save, CalendarDays } from 'lucide-react';
import useAppStore, { useEmployees, useUI } from '../../store/useAppStore';

const ScheduleAppraisalForm = ({ onClose, onSave }) => {
  const employees = useEmployees();
  const scheduleActions = useAppStore((s) => ({ createScheduledAppraisal: s.createScheduledAppraisal }));
  const ui = useUI();
  const preselected = ui.selectedEmployee;

  const [formData, setFormData] = useState({
    employee_number: preselected?.employee_number || '',
    scheduled_date: '',
    scheduled_by: '',
    appraisal_type: 'Annual Review',
    notes: '',
    reminder_date: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const activeEmployees = (employees || []).filter(e => e.is_active !== false && e.is_active !== 0);
  const appraisalTypes = ['Annual Review','Mid-Year Review','Probation Review','Performance Improvement','Promotion Review'];

  const validate = () => {
    const e = {};
    if (!formData.employee_number)  e.employee_number  = 'Employee is required';
    if (!formData.scheduled_date)   e.scheduled_date   = 'Date is required';
    if (!formData.scheduled_by.trim()) e.scheduled_by  = 'Scheduled by is required';
    if (formData.scheduled_date && new Date(formData.scheduled_date) < new Date(new Date().toDateString()))
      e.scheduled_date = 'Date must be today or in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        employee_number: parseInt(formData.employee_number, 10),
        reminder_date: formData.reminder_date || null,
      };
      await scheduleActions.createScheduledAppraisal(payload);
      if (onSave) onSave(payload);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to schedule appraisal' });
      setSaving(false);
    }
  };

  const Field = ({ label, error, children, required }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <CalendarDays className="w-6 h-6 text-green-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Schedule Appraisal</h2>
              <p className="text-sm text-gray-500">Set a future appraisal date</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {errors.submit && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors.submit}</div>}

          <Field label="Employee" error={errors.employee_number} required>
            <select value={formData.employee_number} onChange={e => handleChange('employee_number', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.employee_number ? 'border-red-300' : 'border-gray-300'}`}>
              <option value="">Select employee...</option>
              {activeEmployees.map(e => <option key={e.employee_number} value={e.employee_number}>{e.employee_name} {e.employee_surname}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Scheduled Date" error={errors.scheduled_date} required>
              <input type="date" value={formData.scheduled_date} onChange={e => handleChange('scheduled_date', e.target.value)} min={new Date().toISOString().split('T')[0]} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.scheduled_date ? 'border-red-300' : 'border-gray-300'}`} />
            </Field>

            <Field label="Appraisal Type">
              <select value={formData.appraisal_type} onChange={e => handleChange('appraisal_type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                {appraisalTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Scheduled By" error={errors.scheduled_by} required>
              <input type="text" value={formData.scheduled_by} onChange={e => handleChange('scheduled_by', e.target.value)} placeholder="Your name" className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.scheduled_by ? 'border-red-300' : 'border-gray-300'}`} />
            </Field>

            <Field label="Reminder Date">
              <input type="date" value={formData.reminder_date} onChange={e => handleChange('reminder_date', e.target.value)} max={formData.scheduled_date || undefined} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea rows={3} value={formData.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Additional notes..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </Field>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg flex items-center text-sm">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Scheduling...' : 'Schedule Appraisal'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleAppraisalForm;
