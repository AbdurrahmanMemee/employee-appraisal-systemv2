// hooks/useFormValidation.js - React Form Validation Hook
import { useState, useCallback, useEffect } from 'react';
import { validateForm, validateField, sanitizeFormData, hasFieldError, getFieldError } from '../utils/validation';

export const useFormValidation = (initialData = {}, formType, options = {}) => {
  const {
    validateOnChange = true,
    validateOnBlur = true,
    sanitizeOnSubmit = true,
    showErrorsOnMount = false
  } = options;

  // Form state
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValid, setIsValid] = useState(true);

  // Validate single field
  const validateSingleField = useCallback((fieldName, value, showError = true) => {
    try {
      const { validationRules } = require('../utils/validation');
      const rules = validationRules[formType];
      
      if (!rules || !rules[fieldName]) {
        return [];
      }

      const fieldErrors = validateField(value, rules[fieldName], fieldName);
      
      if (showError) {
        setErrors(prev => ({
          ...prev,
          [fieldName]: fieldErrors
        }));
      }
      
      return fieldErrors;
    } catch (error) {
      console.error('Validation error:', error);
      return [];
    }
  }, [formType]);

  // Validate entire form
  const validateEntireForm = useCallback((formData = data, showErrors = true) => {
    try {
      const validation = validateForm(formData, formType);
      
      if (showErrors) {
        setErrors(validation.errors);
      }
      
      setIsValid(validation.isValid);
      return validation;
    } catch (error) {
      console.error('Form validation error:', error);
      return { isValid: false, errors: {} };
    }
  }, [data, formType]);

  // Update form data
  const updateField = useCallback((fieldName, value) => {
    setData(prev => ({
      ...prev,
      [fieldName]: value
    }));

    // Validate on change if enabled
    if (validateOnChange && (touched[fieldName] || showErrorsOnMount)) {
      setTimeout(() => {
        validateSingleField(fieldName, value);
      }, 0);
    }
  }, [validateOnChange, touched, showErrorsOnMount, validateSingleField]);

  // Update multiple fields at once
  const updateFields = useCallback((updates) => {
    setData(prev => ({
      ...prev,
      ...updates
    }));

    // Validate changed fields if enabled
    if (validateOnChange) {
      Object.keys(updates).forEach(fieldName => {
        if (touched[fieldName] || showErrorsOnMount) {
          setTimeout(() => {
            validateSingleField(fieldName, updates[fieldName]);
          }, 0);
        }
      });
    }
  }, [validateOnChange, touched, showErrorsOnMount, validateSingleField]);

  // Mark field as touched
  const touchField = useCallback((fieldName) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));

    // Validate on blur if enabled
    if (validateOnBlur) {
      setTimeout(() => {
        validateSingleField(fieldName, data[fieldName]);
      }, 0);
    }
  }, [validateOnBlur, data, validateSingleField]);

  // Handle input change with automatic field detection
  const handleInputChange = useCallback((event) => {
    const { name, value, type, checked } = event.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    
    updateField(name, fieldValue);
  }, [updateField]);

  // Handle input blur
  const handleInputBlur = useCallback((event) => {
    const { name } = event.target;
    touchField(name);
  }, [touchField]);

  // Reset form
  const resetForm = useCallback((newData = initialData) => {
    setData(newData);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setIsValid(true);
  }, [initialData]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors({});
    setIsValid(true);
  }, []);

  // Clear specific field error
  const clearFieldError = useCallback((fieldName) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  // Submit form with validation
  const submitForm = useCallback(async (onSubmit, options = {}) => {
    const { 
      skipValidation = false,
      sanitize = sanitizeOnSubmit 
    } = options;

    setIsSubmitting(true);

    try {
      // Mark all fields as touched
      const allFieldNames = Object.keys(data);
      const touchedFields = {};
      allFieldNames.forEach(field => {
        touchedFields[field] = true;
      });
      setTouched(touchedFields);

      // Sanitize data if enabled
      const formData = sanitize ? sanitizeFormData(data) : data;

      // Validate if not skipped
      if (!skipValidation) {
        const validation = validateEntireForm(formData, true);
        
        if (!validation.isValid) {
          setIsSubmitting(false);
          return {
            success: false,
            errors: validation.errors,
            message: 'Please fix the validation errors before submitting'
          };
        }
      }

      // Submit the form
      const result = await onSubmit(formData);
      
      return {
        success: true,
        data: result,
        message: 'Form submitted successfully'
      };
      
    } catch (error) {
      console.error('Form submission error:', error);
      
      // Handle API validation errors
      if (error.response && error.response.data && error.response.data.errors) {
        const apiErrors = {};
        error.response.data.errors.forEach(err => {
          const field = err.param || err.field;
          if (field) {
            apiErrors[field] = [err.msg || err.message];
          }
        });
        setErrors(prev => ({ ...prev, ...apiErrors }));
      }
      
      return {
        success: false,
        error: error.message || 'Form submission failed',
        message: 'An error occurred while submitting the form'
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [data, sanitizeOnSubmit, validateEntireForm]);

  // Get field props for input components
  const getFieldProps = useCallback((fieldName) => ({
    name: fieldName,
    value: data[fieldName] || '',
    onChange: handleInputChange,
    onBlur: handleInputBlur,
    error: hasFieldError(errors, fieldName) && (touched[fieldName] || showErrorsOnMount),
    helperText: (touched[fieldName] || showErrorsOnMount) ? getFieldError(errors, fieldName) : ''
  }), [data, errors, touched, showErrorsOnMount, handleInputChange, handleInputBlur]);

  // Get checkbox props
  const getCheckboxProps = useCallback((fieldName) => ({
    name: fieldName,
    checked: Boolean(data[fieldName]),
    onChange: handleInputChange,
    onBlur: handleInputBlur,
    error: hasFieldError(errors, fieldName) && (touched[fieldName] || showErrorsOnMount)
  }), [data, errors, touched, showErrorsOnMount, handleInputChange, handleInputBlur]);

  // Get select props
  const getSelectProps = useCallback((fieldName) => ({
    name: fieldName,
    value: data[fieldName] || '',
    onChange: handleInputChange,
    onBlur: handleInputBlur,
    error: hasFieldError(errors, fieldName) && (touched[fieldName] || showErrorsOnMount),
    helperText: (touched[fieldName] || showErrorsOnMount) ? getFieldError(errors, fieldName) : ''
  }), [data, errors, touched, showErrorsOnMount, handleInputChange, handleInputBlur]);

  // Check if form has any errors
  const hasErrors = Object.keys(errors).some(field => 
    errors[field] && errors[field].length > 0
  );

  // Check if form is dirty (changed from initial)
  const isDirty = JSON.stringify(data) !== JSON.stringify(initialData);

  // Check if form can be submitted
  const canSubmit = !isSubmitting && (!hasErrors || !Object.keys(touched).length);

  // Update validity when errors change
  useEffect(() => {
    setIsValid(!hasErrors);
  }, [hasErrors]);

  // Validate on mount if required
  useEffect(() => {
    if (showErrorsOnMount) {
      validateEntireForm(data, true);
    }
  }, [showErrorsOnMount, validateEntireForm, data]);

  return {
    // Form state
    data,
    errors,
    touched,
    isSubmitting,
    isValid,
    hasErrors,
    isDirty,
    canSubmit,

    // Actions
    updateField,
    updateFields,
    touchField,
    resetForm,
    clearErrors,
    clearFieldError,
    submitForm,
    validateSingleField,
    validateEntireForm,

    // Event handlers
    handleInputChange,
    handleInputBlur,

    // Helper functions
    getFieldProps,
    getCheckboxProps,
    getSelectProps,

    // Utilities
    hasFieldError: (fieldName) => hasFieldError(errors, fieldName) && (touched[fieldName] || showErrorsOnMount),
    getFieldError: (fieldName) => (touched[fieldName] || showErrorsOnMount) ? getFieldError(errors, fieldName) : '',
    getFieldValue: (fieldName) => data[fieldName]
  };
};

// Custom hook for array field validation (for appraisal sections)
export const useArrayFieldValidation = (initialArray = [], fieldType, options = {}) => {
  const [arrayData, setArrayData] = useState(initialArray);
  const [arrayErrors, setArrayErrors] = useState({});

  const validateArrayItem = useCallback((index, itemData) => {
    try {
      const validation = validateForm(itemData, fieldType);
      
      setArrayErrors(prev => ({
        ...prev,
        [index]: validation.errors
      }));
      
      return validation;
    } catch (error) {
      console.error('Array item validation error:', error);
      return { isValid: false, errors: {} };
    }
  }, [fieldType]);

  const updateArrayItem = useCallback((index, updates) => {
    setArrayData(prev => {
      const newArray = [...prev];
      newArray[index] = { ...newArray[index], ...updates };
      return newArray;
    });

    // Validate the updated item
    setTimeout(() => {
      const updatedItem = { ...arrayData[index], ...updates };
      validateArrayItem(index, updatedItem);
    }, 0);
  }, [arrayData, validateArrayItem]);

  const addArrayItem = useCallback((newItem) => {
    setArrayData(prev => [...prev, newItem]);
  }, []);

  const removeArrayItem = useCallback((index) => {
    setArrayData(prev => prev.filter((_, i) => i !== index));
    setArrayErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[index];
      
      // Reindex remaining errors
      const reindexedErrors = {};
      Object.keys(newErrors).forEach(key => {
        const keyIndex = parseInt(key);
        if (keyIndex > index) {
          reindexedErrors[keyIndex - 1] = newErrors[key];
        } else if (keyIndex < index) {
          reindexedErrors[keyIndex] = newErrors[key];
        }
      });
      
      return reindexedErrors;
    });
  }, []);

  const validateAllArrayItems = useCallback(() => {
    const allValid = arrayData.every((item, index) => {
      const validation = validateArrayItem(index, item);
      return validation.isValid;
    });
    
    return allValid;
  }, [arrayData, validateArrayItem]);

  return {
    arrayData,
    arrayErrors,
    updateArrayItem,
    addArrayItem,
    removeArrayItem,
    validateAllArrayItems,
    hasArrayErrors: Object.keys(arrayErrors).length > 0,
    getArrayItemError: (index, fieldName) => arrayErrors[index]?.[fieldName]?.[0] || ''
  };
};

export default useFormValidation;