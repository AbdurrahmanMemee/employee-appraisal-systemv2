// components/ui/FormField.js - Reusable Form Input Component
import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export const FormField = ({
  label,
  required = false,
  error = false,
  helperText = '',
  helpText = '',
  multiline = false,
  rows = 3,
  className = '',
  ...props
}) => {
  const inputClasses = `
    w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 transition-colors
    ${error 
      ? 'border-red-300 focus:border-red-500 bg-red-50' 
      : 'border-gray-300 focus:border-blue-500 bg-white'
    }
    ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
  `;

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <InputComponent
          {...props}
          {...(multiline ? { rows } : { type: props.type || 'text' })}
          className={inputClasses}
        />
        
        {error && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        )}
        
        {!error && props.value && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
        )}
      </div>
      
      {(helperText || helpText) && (
        <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {helperText || helpText}
        </p>
      )}
    </div>
  );
};

// components/ui/FormSelect.js - Reusable Form Select Component
export const FormSelect = ({
  label,
  required = false,
  error = false,
  helperText = '',
  helpText = '',
  options = [],
  placeholder = 'Please select...',
  className = '',
  ...props
}) => {
  const selectClasses = `
    w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 transition-colors
    ${error 
      ? 'border-red-300 focus:border-red-500 bg-red-50' 
      : 'border-gray-300 focus:border-blue-500 bg-white'
    }
    ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
  `;

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <select {...props} className={selectClasses}>
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option 
              key={option.value} 
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        {error && (
          <div className="absolute inset-y-0 right-8 pr-3 flex items-center pointer-events-none">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        )}
      </div>
      
      {(helperText || helpText) && (
        <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {helperText || helpText}
        </p>
      )}
    </div>
  );
};

// components/ui/FormCheckbox.js - Reusable Form Checkbox Component
export const FormCheckbox = ({
  label,
  error = false,
  helperText = '',
  helpText = '',
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center">
        <input
          {...props}
          type="checkbox"
          className={`
            w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2
            ${error ? 'border-red-300' : ''}
            ${props.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
        />
        <label className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">
          {label}
        </label>
      </div>
      
      {(helperText || helpText) && (
        <p className={`text-sm ml-6 ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {helperText || helpText}
        </p>
      )}
    </div>
  );
};

// components/ui/FormRadio.js - Reusable Form Radio Component
export const FormRadio = ({
  label,
  options = [],
  error = false,
  helperText = '',
  helpText = '',
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center">
            <input
              {...props}
              type="radio"
              value={option.value}
              checked={props.value === option.value}
              className={`
                w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2
                ${error ? 'border-red-300' : ''}
                ${props.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
              `}
            />
            <label className="ml-2 text-sm text-gray-700 cursor-pointer">
              {option.label}
            </label>
          </div>
        ))}
      </div>
      
      {(helperText || helpText) && (
        <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {helperText || helpText}
        </p>
      )}
    </div>
  );
};

// components/ui/ValidationSummary.js - Validation Error Summary Component
export const ValidationSummary = ({ 
  errors = {}, 
  title = "Please fix the following errors:",
  className = '' 
}) => {
  const errorList = [];
  Object.keys(errors).forEach(field => {
    if (errors[field] && errors[field].length > 0) {
      errors[field].forEach(error => {
        errorList.push({ field, message: error });
      });
    }
  });

  if (errorList.length === 0) return null;

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
      <div className="flex">
        <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <div className="mt-2">
            <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
              {errorList.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// components/ui/FormSection.js - Form Section Component
export const FormSection = ({ 
  title, 
  description, 
  children, 
  className = '',
  collapsible = false,
  defaultExpanded = true 
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div 
        className={`p-6 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={collapsible ? () => setExpanded(!expanded) : undefined}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
          {collapsible && (
            <button type="button" className="text-gray-400 hover:text-gray-600">
              {expanded ? '−' : '+'}
            </button>
          )}
        </div>
      </div>
      
      {(!collapsible || expanded) && (
        <div className="px-6 pb-6">
          {children}
        </div>
      )}
    </div>
  );
};

// components/ui/FormActions.js - Form Action Buttons Component
export const FormActions = ({ 
  onSubmit, 
  onCancel, 
  isSubmitting = false,
  canSubmit = true,
  submitText = 'Submit',
  cancelText = 'Cancel',
  showCancel = true,
  additionalActions = [],
  className = '' 
}) => {
  return (
    <div className={`flex justify-between items-center pt-6 border-t ${className}`}>
      <div className="flex space-x-3">
        <button
          type="submit"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className={`px-6 py-3 rounded-md flex items-center font-medium transition-colors ${
            canSubmit && !isSubmitting
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </>
          ) : (
            submitText
          )}
        </button>
        
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-md font-medium transition-colors"
            disabled={isSubmitting}
          >
            {cancelText}
          </button>
        )}
      </div>
      
      {additionalActions.length > 0 && (
        <div className="flex space-x-2">
          {additionalActions.map((action, index) => (
            <button
              key={index}
              type="button"
              onClick={action.onClick}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${action.className || 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              disabled={isSubmitting || action.disabled}
            >
              {action.icon && <action.icon className="w-4 h-4 mr-2" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// components/ui/FormProgress.js - Form Progress Indicator
export const FormProgress = ({ 
  steps = [], 
  currentStep = 0, 
  className = '' 
}) => {
  return (
    <div className={`mb-6 ${className}`}>
      <nav aria-label="Progress">
        <ol className="flex items-center">
          {steps.map((step, index) => (
            <li key={step.name} className={`relative ${index !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
              <div className="flex items-center">
                <div className={`
                  relative w-8 h-8 flex items-center justify-center rounded-full border-2 
                  ${index < currentStep 
                    ? 'bg-blue-600 border-blue-600' 
                    : index === currentStep
                      ? 'border-blue-600 bg-white'
                      : 'border-gray-300 bg-white'
                  }
                `}>
                  {index < currentStep ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <span className={`text-sm font-medium ${
                      index === currentStep ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      {index + 1}
                    </span>
                  )}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  index <= currentStep ? 'text-gray-900' : 'text-gray-500'
                }`}>
                  {step.name}
                </span>
              </div>
              {index !== steps.length - 1 && (
                <div className="absolute top-4 left-8 w-full h-0.5 bg-gray-300" />
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

// Export all components as named exports
export default {
  FormField,
  FormSelect,
  FormCheckbox,
  FormRadio,
  ValidationSummary,
  FormSection,
  FormActions,
  FormProgress
};