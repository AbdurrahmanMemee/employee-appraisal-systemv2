import React, { useState } from 'react';
import { X, Save, Calendar } from 'lucide-react';
import useAppStore, { useEmployees, useConfig, useUI } from '../../store/useAppStore';

const NewMeetingForm = ({ onClose, onSave }) => {
  const employees = useEmployees();
  const config = useConfig();
  const meetingActions = useAppStore((s) => ({ createMeeting: s.createMeeting }));
  const ui = useUI();
  const preselected = ui.selectedEmployee;

  const [formData, setFormData] = useState({
    employee_number: preselected?.employee_number || '',
    meeting_date: new Date().toISOString().split('T')[0],
    meeting_type: '',
    people_present: preselected ? `${preselected.employee_name} ${preselected.employee_surname}` : '',
    brief_note: '',
    detailed_summary: '',
    meeting_conclusion: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const meetingTypes = config.meetingTypes || [];
  const activeEmployees = (employees || []).filter(e => e.is_active !== false && e.is_active !== 0);

  const validate = () => {
    const e = {};
    if (!formData.employee_number)           e.employee_number    = 'Employee is required';
    if (!formData.meeting_date)              e.meeting_date       = 'Date is required';
    if (!formData.meeting_type)              e.meeting_type       = 'Meeting type is required';
    if (!formData.meeting_conclusion.trim()) e.meeting_conclusion = 'Conclusion is required';
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
      const payload = { ...formData, employee_number: parseInt(formData.employee_number, 10) };
      await meetingActions.createMeeting(payload);
      if (onSave) onSave(payload);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to save meeting' });
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

  const defaultTypes = ['One-on-One','Performance Review','Goal Setting','Disciplinary Meeting','Career Development'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <Calendar className="w-6 h-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">New Meeting Record</h2>
              <p className="text-sm text-gray-500">Record a meeting or one-on-one session</p>
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
            <Field label="Meeting Date" error={errors.meeting_date} required>
              <input type="date" value={formData.meeting_date} onChange={e => handleChange('meeting_date', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.meeting_date ? 'border-red-300' : 'border-gray-300'}`} />
            </Field>
            <Field label="Meeting Type" error={errors.meeting_type} required>
              <select value={formData.meeting_type} onChange={e => handleChange('meeting_type', e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${errors.meeting_type ? 'border-red-300' : 'border-gray-300'}`}>
                <option value="">Select type...</option>
                {(meetingTypes.length > 0 ? meetingTypes : defaultTypes).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="People Present">
              <input type="text" value={formData.people_present} onChange={e => handleChange('people_present', e.target.value)} placeholder="Names of attendees" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </Field>
          </div>
          <Field label="Brief Note">
            <textarea rows={2} value={formData.brief_note} onChange={e => handleChange('brief_note', e.target.value)} placeholder="Short summary..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </Field>
          <Field label="Detailed Summary">
            <textarea rows={4} value={formData.detailed_summary} onChange={e => handleChange('detailed_summary', e.target.value)} placeholder="Full meeting notes..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </Field>
          <Field label="Conclusion / Action Items" error={errors.meeting_conclusion} required>
            <textarea rows={3} value={formData.meeting_conclusion} onChange={e => handleChange('meeting_conclusion', e.target.value)} placeholder="Outcomes and next steps..." className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none ${errors.meeting_conclusion ? 'border-red-300' : 'border-gray-300'}`} />
          </Field>
        </div>
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center text-sm">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewMeetingForm;
