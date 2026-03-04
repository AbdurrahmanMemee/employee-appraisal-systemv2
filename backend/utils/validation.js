// backend/utils/validation.js - Server-side validation helpers
const { body, param, query, validationResult } = require('express-validator');

// Middleware to check validation results
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Reusable validation chains
const commonValidations = {
  employeeNumber: body('employee_number')
    .isInt({ min: 1 })
    .withMessage('Employee number must be a positive integer'),

  employeeName: body('employee_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Employee name must contain only letters, spaces, hyphens and apostrophes'),

  employeeSurname: body('employee_surname')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Employee surname must contain only letters, spaces, hyphens and apostrophes'),

  employeeId: body('employee_id')
    .trim()
    .isLength({ min: 1, max: 50 })
    .matches(/^[A-Z0-9\-]+$/)
    .withMessage('Employee ID must contain only uppercase letters, numbers and hyphens'),

  email: body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 150 })
    .withMessage('Invalid email format'),

  phone: body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^[\+]?[0-9\s\-\(\)]{7,20}$/)
    .withMessage('Invalid phone number format'),

  date: (fieldName) => body(fieldName)
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .toDate()
    .withMessage(`${fieldName} must be a valid date (YYYY-MM-DD)`),

  rating: body('employee_rating')
    .isFloat({ min: 0, max: 5 })
    .withMessage('Rating must be between 0 and 5'),

  idParam: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
};

// Employee create/update validation rules
const employeeValidation = [
  commonValidations.employeeName,
  commonValidations.employeeSurname,
  commonValidations.employeeId,
  body('department').trim().isLength({ min: 1, max: 100 }).withMessage('Department is required'),
  body('job_description').trim().isLength({ min: 1, max: 150 }).withMessage('Job description is required'),
  body('manager').trim().isLength({ min: 1, max: 100 }).withMessage('Manager is required'),
  commonValidations.email,
  commonValidations.phone,
  commonValidations.date('start_date'),
  handleValidationErrors
];

// Meeting validation rules
const meetingValidation = [
  body('employee_number').isInt({ min: 1 }).withMessage('Valid employee number required'),
  body('meeting_date').isISO8601().toDate().withMessage('Valid meeting date required'),
  body('meeting_type').trim().isLength({ min: 1, max: 100 }).withMessage('Meeting type is required'),
  body('meeting_conclusion').trim().isLength({ min: 1 }).withMessage('Meeting conclusion is required'),
  handleValidationErrors
];

// Appraisal validation rules
const appraisalValidation = [
  body('employee_number').isInt({ min: 1 }).withMessage('Valid employee number required'),
  body('appraisal_date').isISO8601().toDate().withMessage('Valid appraisal date required'),
  body('employee_rating').isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('appraisal_status')
    .optional()
    .isIn(['Draft', 'In Progress', 'Completed', 'Cancelled'])
    .withMessage('Invalid appraisal status'),
  handleValidationErrors
];

// Incident validation rules
const incidentValidation = [
  body('employee_number').isInt({ min: 1 }).withMessage('Valid employee number required'),
  body('incident_log_date').isISO8601().toDate().withMessage('Valid incident date required'),
  body('incident_log_type').trim().isLength({ min: 1, max: 100 }).withMessage('Incident type is required'),
  body('incident_detail').trim().isLength({ min: 1 }).withMessage('Incident detail is required'),
  body('severity').optional().isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid severity'),
  body('logged_by').trim().isLength({ min: 1, max: 100 }).withMessage('Logged by is required'),
  handleValidationErrors
];

// Schedule validation rules
const scheduleValidation = [
  body('employee_number').isInt({ min: 1 }).withMessage('Valid employee number required'),
  body('scheduled_date').isISO8601().toDate().withMessage('Valid scheduled date required'),
  body('scheduled_by').trim().isLength({ min: 1, max: 100 }).withMessage('Scheduled by is required'),
  body('appraisal_type').optional().trim().isLength({ max: 100 }),
  handleValidationErrors
];

// Auth validation
const loginValidation = [
  body('username').trim().isLength({ min: 1, max: 50 }).withMessage('Username is required'),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  commonValidations,
  employeeValidation,
  meetingValidation,
  appraisalValidation,
  incidentValidation,
  scheduleValidation,
  loginValidation
};
