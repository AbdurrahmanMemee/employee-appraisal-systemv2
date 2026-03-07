// components/forms/ValidatedEmployeeMasterForm.js - Employee Form with Validation
import React, { useEffect } from 'react';
import { X, Save, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { useFormValidation } from '../../hooks/useFormValidation';
import useAppStore from '../../store/useAppStore';
import FormField from '../ui/FormField';
import FormSelect from '../ui/FormSelect';
import FormCheckbox from '../ui/FormCheckbox';
import ValidationSummary from '../ui/ValidationSummary';

const ValidatedEmployeeMasterForm = ({ 
  employee, 
  onClose, 
  onSave 
}) => {
  const isEditing = !!employee;
  const { createEmployee, updateEmployee, employees, config } = useAppStore((s) => ({
    createEmployee: s.createEmployee,
    updateEmployee: s.updateEmployee,
    employees: s.employees || [],
    config: s.config || { departments: [], jobDescriptions: [], managers: [] }
  }));

  // Initialize form with validation
  const {
    data,
    errors,
    isSubmitting,
    hasErrors,
    isDirty,
    canSubmit,
    submitForm,
    updateField,
    getFieldProps,
    getSelectProps,
    getCheckboxProps,
    clearErrors
  } = useFormValidation(
    employee || {
      employee_number: '',
      employee_name: '',
      employee_surname: '',
      employee_id: '',
      department: '',
      job_description: '',
      manager: '',
      is_active: true,
      start_date: '',
      phone: '',
      email: '',
      address: '',
      emergency_contact: '',
      emergency_phone: ''
    },
    'employee',
    {
      validateOnChange: true,
      validateOnBlur: true,
      sanitizeOnSubmit: true
    }
  );

  // Auto-generate employee number for new employees
  useEffect(() => {
    if (!isEditing && !data.employee_number) {
      const maxNumber = Math.max(...employees.map(e => e.employee_number), 1000);
      updateField('employee_number', maxNumber + 1);
    }
  }, [isEditing, data.employee_number, employees, updateField]);

  // Auto-generate employee ID
  const generateEmployeeId = () => {
    const existingIds = employees.map(e => e.employee_id);
    let counter = 1;
    let newId;
    do {
      newId = `EMP${counter.toString().padStart(3, '0')}`;
      counter++;
    } while (existingIds.includes(newId));
    
    updateField('employee_id', newId);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Additional custom validation
    const customValidation = await validateEmployeeData(data, employees, isEditing);
    if (!customValidation.isValid) {
      return;
    }

    const result = await submitForm(async (formData) => {
      if (isEditing) {
        return await updateEmployee(employee.employee_number, formData);
      } else {
        return await createEmployee(formData);
      }
    });

    if (result.success) {
      onSave?.(result.data);
      onClose();
    }
  };

  // Custom validation for employee data
  const validateEmployeeData = async (formData, existingEmployees, isEdit) => {
    const customErrors = {};

    // Check for duplicate employee number
    if (existingEmployees.some(emp => 
      emp.employee_number === parseInt(formData.employee_number) && 
      (!isEdit || emp.employee_number !== employee?.employee_number)
    )) {
      customErrors.employee_number = ['Employee number already exists'];
    }

    // Check for duplicate employee ID
    if (existingEmployees.some(emp => 
      emp.employee_id === formData.employee_id && 
      (!isEdit || emp.employee_number !== employee?.employee_number)
    )) {
      customErrors.employee_id = ['Employee ID already exists'];
    }

    // Validate email uniqueness if provided
    if (formData.email && existingEmployees.some(emp => 
      emp.email === formData.email && 
      (!isEdit || emp.employee_number !== employee?.employee_number)
    )) {
      customErrors.email = ['Email address already exists'];
    }

    return {
      isValid: Object.keys(customErrors).length === 0,
      errors: customErrors
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Employee' : 'Add New Employee'}
          </h2>
          <p className="text-gray-600">
            {isEditing ? 'Update employee information' : 'Create a new employee record'}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Validation Summary */}
      {hasErrors && (
        <ValidationSummary 
          errors={errors} 
          title="Please fix the following errors:" 
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <FormField
              label="Employee Number"
              required
              disabled={isEditing}
              {...getFieldProps('employee_number')}
              type="number"
              helpText={isEditing ? "Cannot be changed after creation" : "Auto-generated if left empty"}
            />

            <div className="flex space-x-2">
              <FormField
                label="Employee ID"
                required
                {...getFieldProps('employee_id')}
                placeholder="EMP001"
                className="flex-1"
              />
              <button
                type="button"
                onClick={generateEmployeeId}
                className="mt-6 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
              >
                Auto
              </button>
            </div>

            <FormCheckbox
              label="Active Employee"
              {...getCheckboxProps('is_active')}
              helpText="Inactive employees won't appear in most lists"
            />

            <FormField
              label="First Name"
              required
              {...getFieldProps('employee_name')}
              autoComplete="given-name"
            />

            <FormField
              label="Last Name"
              required
              {...getFieldProps('employee_surname')}
              autoComplete="family-name"
            />

            <FormField
              label="Start Date"
              {...getFieldProps('start_date')}
              type="date"
              helpText="Employee's first day of work"
            />
          </div>
        </div>

        {/* Work Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Work Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <FormSelect
              label="Department"
              required
              {...getSelectProps('department')}
              options={config.departments.map(dept => ({ value: dept, label: dept }))}
              placeholder="Select Department"
            />

            <FormSelect
              label="Job Title"
              required
              {...getSelectProps('job_description')}
              options={config.jobDescriptions.map(job => ({ value: job, label: job }))}
              placeholder="Select Job Title"
            />

            <FormSelect
              label="Manager"
              required
              {...getSelectProps('manager')}
              options={config.managers.map(manager => ({ value: manager, label: manager }))}
              placeholder="Select Manager"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <FormField
              label="Email"
              {...getFieldProps('email')}
              type="email"
              placeholder="john.doe@company.com"
              autoComplete="email"
            />

            <FormField
              label="Phone"
              {...getFieldProps('phone')}
              type="tel"
              placeholder="+1 (555) 123-4567"
              autoComplete="tel"
            />

            <FormField
              label="Address"
              {...getFieldProps('address')}
              multiline
              rows={2}
              placeholder="123 Main St, City, State, ZIP"
              className="md:col-span-2"
              autoComplete="street-address"
            />

            <FormField
              label="Emergency Contact"
              {...getFieldProps('emergency_contact')}
              placeholder="Contact name and relationship"
            />

            <FormField
              label="Emergency Phone"
              {...getFieldProps('emergency_phone')}
              type="tel"
              placeholder="+1 (555) 987-6543"
            />
          </div>
        </div>

        {/* Status Warning */}
        {!data.is_active && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
              <p className="text-yellow-800">
                <strong>Warning:</strong> This employee is marked as inactive. 
                Inactive employees will not appear in most lists and cannot be assigned new appraisals or meetings.
              </p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {isDirty && !hasErrors && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              <p className="text-green-800">Form is valid and ready to submit!</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-6 border-t">
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`px-6 py-3 rounded-md flex items-center font-medium ${
                canSubmit
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-5 h-5 mr-2" />
              {isSubmitting 
                ? (isEditing ? 'Updating...' : 'Creating...') 
                : (isEditing ? 'Update Employee' : 'Create Employee')
              }
            </button>
            
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-md"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>

          {/* Form Status Indicator */}
          <div className="flex items-center space-x-4 text-sm">
            {isDirty && (
              <span className="text-yellow-600">
                • Unsaved changes
              </span>
            )}
            {hasErrors && (
              <span className="text-red-600">
                • {Object.keys(errors).length} error{Object.keys(errors).length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={clearErrors}
              className="text-blue-600 hover:text-blue-800 text-sm underline"
            >
              Clear Errors
            </button>
          </div>

          {isEditing && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to deactivate this employee? This action can be reversed later.')) {
                  updateField('is_active', false);
                }
              }}
              className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-md text-sm flex items-center"
              disabled={isSubmitting}
            >
              <User className="w-4 h-4 mr-2" />
              Deactivate Employee
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ValidatedEmployeeMasterForm;