// =============================================================================
// FILE:    src/hooks/useFormValidation.js
// PURPOSE: Generic form validation hook.
//          Validates on submit; also exposes per-field validation on blur.
//
// USAGE:
//   const rules = {
//     first_name: [{ required: true }, { minLength: 2 }],
//     email:      [{ required: true }, { email: true }],
//   };
//   const { errors, validate, clearError } = useFormValidation(rules);
//
//   // On submit:
//   if (!validate(formData)) return;  // errors object will be populated
// =============================================================================

import { useState, useCallback } from 'react';

const VALIDATORS = {
  required:  (val)     => !val || String(val).trim() === '' ? 'This field is required.' : null,
  email:     (val)     => val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? 'Enter a valid email.' : null,
  minLength: (val, n)  => val && String(val).length < n ? `Must be at least ${n} characters.` : null,
  maxLength: (val, n)  => val && String(val).length > n ? `Must be ${n} characters or fewer.` : null,
  min:       (val, n)  => val !== '' && Number(val) < n ? `Must be at least ${n}.` : null,
  max:       (val, n)  => val !== '' && Number(val) > n ? `Must be ${n} or less.` : null,
  pattern:   (val, rx) => val && !rx.test(val) ? 'Invalid format.' : null,
  date:      (val)     => val && isNaN(Date.parse(val)) ? 'Enter a valid date.' : null,
  custom:    (val, fn) => fn(val),
};

const useFormValidation = (rules = {}) => {
  const [errors, setErrors] = useState({});

  // Validate a single field, return error string or null
  const validateField = useCallback((name, value) => {
    const fieldRules = rules[name];
    if (!fieldRules) return null;
    for (const rule of fieldRules) {
      for (const [type, param] of Object.entries(rule)) {
        if (type === 'message') continue;
        const validator = VALIDATORS[type];
        if (!validator) continue;
        const err = validator(value, param);
        if (err) return rule.message || err;
      }
    }
    return null;
  }, [rules]);

  // Validate all fields, update errors state, return true if valid
  const validate = useCallback((data) => {
    const newErrors = {};
    for (const name of Object.keys(rules)) {
      const err = validateField(name, data[name]);
      if (err) newErrors[name] = err;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [rules, validateField]);

  // Clear one field's error (call on change)
  const clearError = useCallback((name) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  // Validate one field on blur
  const validateOnBlur = useCallback((name, value) => {
    const err = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: err || undefined }));
  }, [validateField]);

  const clearAll = useCallback(() => setErrors({}), []);

  return { errors, validate, validateField, validateOnBlur, clearError, clearAll };
};

export default useFormValidation;
