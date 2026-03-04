import React, { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import useAppStore, { useEmployees, useConfig, useUI } from '../../store/useAppStore';

const IncidentLoggingForm = ({ onClose, onSave }) => {
  const employees = useEmployees();
  const config = useConfig();
  const incidentActions = useAppStore((s) => ({ createIncident: s.createIncident }));
  const ui = useUI();
  const preselected = ui.selectedEmployee;

  const [formData, setFormData] = useState({
    employee_number: preselected?.employee_number || '',
    incident_log_date: new Date().toISOString().split('T')[0],
    incident_log_type: '',
    incident_detail: '',
    severity: 'Medium',
    logged_by: '',
    follow_up_required: false,
    follow_up_date: '',
    witnesses: '',
    corrective_action: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const activeEmployees = (employees || []).filter(e => e.is_active !== false && e.is_active !== 0);
  const incidentTypes = [
    ...(config.generalMisconductTypes || []),
    ...(config.grossMisconductTypes || []),
    ...(config.achievementTypes || []),
    ...(config.incidentLogTypes || []),
  ];
  const defaultTypes = ['General Misconduct','Gross Misconduct','Achievement Recognition','Attendance Issue','Performance Concern','Policy Violation'];
  const allTypes = incidentTypes.length > 0 ? [...new Set(incidentTypes)] : defaultTypes;

  const validate = () => {
    const e = {};
    if (!formData.employee_number)        e.employee_number   = 'Employee is required';
    if (!formData.incident_log_date)      e.incident_log_date = 'Date is required';
    if (!formData.incident_log_type)      e.incident_log_type = 'Type is required';
    if (!formData.incident_detail.trim()) e.incident_detail   = 'Detail is required';
    if (!formData.logged_by.trim())       e.logged_by         = 'Logged by is required';
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
        follow_up_required: formData.follow_up_required ? 1 : 0,
        follow_up_date: formData.follow_up_date || null,
        witnesses: formData.witnesses || null,
        corrective_action: formData.corrective_action || null,
      };
      await incidentActions.createIncident(payload);
      if (onSave) onSave(payload);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to save incident' });
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

  const severities = ['Low','Medium','High','Critical'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Log Incident</h2>
              <p className="text-sm text-gray-500">Record an incident, achievement or conduct issue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {errors.submit && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors.submit}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Employee" error={errors.employee_number} required>
              <select value={formData.employee_number} onChange={e => handleChange('employee_number', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.employee_number ? 'border-red-300' : 'border-gray-300'}`}>
                <option value="">Select employee...</option>
                {activeEmployees.map(e => <option key={e.employee_number} value={e.employee_number}>{e.employee_name} {e.employee_surname}</option>)}
              </select>
            </Field>

            <Field label="Incident Date" error={errors.incident_log_date} required>
              <input type="date" value={formData.incident_log_date} onChange={e => handleChange('incident_log_date', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.incident_log_date ? 'border-red-300' : 'border-gray-300'}`} />
            </Field>

            <Field label="Incident Type" error={errors.incident_log_type} required>
              <select value={formData.incident_log_type} onChange={e => handleChange('incident_log_type', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.incident_log_type ? 'border-red-300' : 'border-gray-300'}`}>
                <option value="">Select type...</option>
                {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Severity">
              <select value={formData.severity} onChange={e => handleChange('severity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                {severities.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Logged By" error={errors.logged_by} required>
              <input type="text" value={formData.logged_by} onChange={e => handleChange('logged_by', e.target.value)} placeholder="Your name" className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.logged_by ? 'border-red-300' : 'border-gray-300'}`} />
            </Field>

            <Field label="Witnesses">
              <input type="text" value={formData.witnesses} onChange={e => handleChange('witnesses', e.target.value)} placeholder="Witness names" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>

          <Field label="Incident Detail" error={errors.incident_detail} required>
            <textarea rows={4} value={formData.incident_detail} onChange={e => handleChange('incident_detail', e.target.value)} placeholder="Describe the incident in detail..." className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none ${errors.incident_detail ? 'border-red-300' : 'border-gray-300'}`} />
          </Field>

          <Field label="Corrective Action">
            <textarea rows={2} value={formData.corrective_action} onChange={e => handleChange('corrective_action', e.target.value)} placeholder="Action taken or recommended..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </Field>

          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <input type="checkbox" id="follow_up" checked={formData.follow_up_required} onChange={e => handleChange('follow_up_required', e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            <label htmlFor="follow_up" className="text-sm font-medium text-gray-700">Follow-up required</label>
            {formData.follow_up_required && (
              <input type="date" value={formData.follow_up_date} onChange={e => handleChange('follow_up_date', e.target.value)} className="ml-4 px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white rounded-lg flex items-center text-sm">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Log Incident'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncidentLoggingForm;
