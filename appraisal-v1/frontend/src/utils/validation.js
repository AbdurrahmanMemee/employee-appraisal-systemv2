// frontend/src/utils/validation.js
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

export const sanitizeFormData = (data) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') sanitized[key] = sanitizeString(value);
    else if (Array.isArray(value)) sanitized[key] = value.map(i => typeof i === 'object' ? sanitizeFormData(i) : typeof i === 'string' ? sanitizeString(i) : i);
    else if (typeof value === 'object' && value !== null) sanitized[key] = sanitizeFormData(value);
    else sanitized[key] = value;
  }
  return sanitized;
};

export const validateField = (value, rules, fieldName) => {
  const errors = [];
  if (!rules) return errors;
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldName.replace(/_/g, ' ')} is required`);
    return errors;
  }
  if (value === undefined || value === null || value === '') return errors;
  const strValue = String(value);
  if (rules.type === 'email') {
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(strValue))
      errors.push(rules.message || 'Please enter a valid email address');
  }
  if (rules.minLength && strValue.length < rules.minLength) errors.push(`Must be at least ${rules.minLength} characters`);
  if (rules.maxLength && strValue.length > rules.maxLength) errors.push(`Must be no more than ${rules.maxLength} characters`);
  if (rules.pattern && !rules.pattern.test(strValue)) errors.push(rules.message || 'Invalid format');
  if (rules.type === 'number' || rules.type === 'integer') {
    const num = Number(value);
    if (isNaN(num)) errors.push('Must be a valid number');
    else {
      if (rules.min !== undefined && num < rules.min) errors.push(`Must be at least ${rules.min}`);
      if (rules.max !== undefined && num > rules.max) errors.push(`Must be no more than ${rules.max}`);
    }
  }
  if (rules.custom) { const ce = rules.custom(value); if (ce) errors.push(ce); }
  return errors;
};

export const validationRules = {
  employee: {
    employee_number: { required: true, type: 'integer', min: 1 },
    employee_name: { required: true, minLength: 1, maxLength: 100, pattern: /^[a-zA-Z\s'-]+$/, message: 'Name must contain only letters, spaces, hyphens and apostrophes' },
    employee_surname: { required: true, minLength: 1, maxLength: 100, pattern: /^[a-zA-Z\s'-]+$/, message: 'Surname must contain only letters, spaces, hyphens and apostrophes' },
    employee_id: { required: true, minLength: 1, maxLength: 50, pattern: /^[A-Z0-9\-]+$/, message: 'Employee ID must contain only uppercase letters, numbers and hyphens' },
    department: { required: true, maxLength: 100 },
    job_description: { required: true, maxLength: 150 },
    manager: { required: true, maxLength: 100 },
    email: { required: false, type: 'email', maxLength: 150 },
    phone: { required: false, pattern: /^[\+]?[0-9\s\-\(\)]{7,20}$/, message: 'Please enter a valid phone number' }
  },
  meeting: {
    employee_number: { required: true, type: 'integer', min: 1 },
    meeting_date: { required: true },
    meeting_type: { required: true },
    meeting_conclusion: { required: true, minLength: 1 }
  },
  appraisal: {
    employee_number: { required: true, type: 'integer', min: 1 },
    appraisal_date: { required: true },
    employee_rating: { required: true, type: 'number', min: 0, max: 5 }
  },
  appraisalSection: {
    section_name: { required: true, minLength: 1, maxLength: 150 },
    section_rating: { required: true, type: 'number', min: 0, max: 5 },
    weight: { required: false, type: 'number', min: 0, max: 100 }
  },
  incident: {
    employee_number: { required: true, type: 'integer', min: 1 },
    incident_log_date: { required: true },
    incident_log_type: { required: true },
    incident_detail: { required: true, minLength: 1 },
    logged_by: { required: true, minLength: 1, maxLength: 100 }
  },
  schedule: {
    employee_number: { required: true, type: 'integer', min: 1 },
    scheduled_date: { required: true },
    scheduled_by: { required: true, minLength: 1, maxLength: 100 }
  }
};

export const validateForm = (data, formType) => {
  const rules = validationRules[formType];
  if (!rules) return { isValid: true, errors: {} };
  const errors = {};
  for (const [fieldName, fieldRules] of Object.entries(rules)) {
    const fieldErrors = validateField(data[fieldName], fieldRules, fieldName);
    if (fieldErrors.length > 0) errors[fieldName] = fieldErrors;
  }
  return { isValid: Object.keys(errors).length === 0, errors };
};

export const hasFieldError = (errors, fieldName) => errors[fieldName] && errors[fieldName].length > 0;
export const getFieldError = (errors, fieldName) => errors[fieldName]?.[0] || '';
