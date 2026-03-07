// backend/routes/employees.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { logAuditTrail } = require('../utils/auditLogger');
const { employeeValidation, handleValidationErrors } = require('../utils/validation');

// GET /api/employees
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, department, manager, active = 'true' } = req.query;

  // FIX: cast to int — mysql2 rejects strings for LIMIT/OFFSET in prepared statements
  const limitInt  = parseInt(limit, 10) || 50;
  const pageInt   = parseInt(page,  10) || 1;
  const offsetInt = (pageInt - 1) * limitInt;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (active !== 'all') {
    whereClause += ' AND is_active = ?';
    params.push(active === 'true' ? 1 : 0);
  }

  if (search) {
    whereClause += ' AND (employee_name LIKE ? OR employee_surname LIKE ? OR employee_id LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (department) { whereClause += ' AND department = ?'; params.push(department); }
  if (manager)    { whereClause += ' AND manager = ?';    params.push(manager); }

  const [countResult] = (await dbUtils.query(
    `SELECT COUNT(*) AS total FROM employees ${whereClause}`, params
  )).rows;

  const { rows: employees } = await dbUtils.query(
    `SELECT * FROM employees ${whereClause} ORDER BY employee_name, employee_surname LIMIT ? OFFSET ?`,
    [...params, limitInt, offsetInt]
  );

  res.json({
    success: true,
    data: {
      employees,
      pagination: {
        page:  pageInt,
        limit: limitInt,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limitInt)
      }
    }
  });
}));

// GET /api/employees/stats/overview
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const { rows: stats } = await dbUtils.query(`
    SELECT
      COUNT(*) AS total_employees,
      SUM(is_active) AS active_employees,
      COUNT(*) - SUM(is_active) AS inactive_employees,
      AVG(average_employee_rating) AS avg_rating,
      SUM(CASE WHEN next_scheduled_appraisal < CURDATE() THEN 1 ELSE 0 END) AS overdue_appraisals,
      SUM(CASE WHEN next_scheduled_appraisal BETWEEN CURDATE()
               AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS upcoming_appraisals
    FROM employees
  `);
  res.json({ success: true, data: stats[0] });
}));

// GET /api/employees/:id/summary
router.get('/:id/summary', asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  if (!employeeId) return res.status(400).json({ success: false, message: 'Invalid employee ID' });

  const { rows: empRows } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?', [employeeId]
  );
  if (empRows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

  const { rows: meetings }  = await dbUtils.query(
    'SELECT * FROM meetings WHERE employee_number = ? ORDER BY meeting_date DESC LIMIT 5', [employeeId]
  );
  const { rows: appraisals } = await dbUtils.query(
    'SELECT * FROM appraisals WHERE employee_number = ? ORDER BY appraisal_date DESC LIMIT 5', [employeeId]
  );
  const { rows: incidents } = await dbUtils.query(
    'SELECT * FROM incident_logs WHERE employee_number = ? ORDER BY incident_log_date DESC LIMIT 5', [employeeId]
  );
  const { rows: schedules } = await dbUtils.query(
    'SELECT * FROM scheduled_appraisals WHERE employee_number = ? AND status = "Scheduled" ORDER BY scheduled_date',
    [employeeId]
  );

  res.json({
    success: true,
    data: {
      employee:         empRows[0],
      recentMeetings:   meetings,
      recentAppraisals: appraisals,
      recentIncidents:  incidents,
      upcomingSchedules: schedules
    }
  });
}));

// GET /api/employees/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?',
    [parseInt(req.params.id, 10)]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });
  res.json({ success: true, data: rows[0] });
}));

// POST /api/employees
router.post('/', [
  body('employee_number').isInt({ min: 1 }).withMessage('Employee number must be a positive integer'),
  ...employeeValidation.slice(0, -1),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  const {
    employee_number, employee_name, employee_surname, employee_id,
<<<<<<< HEAD
    department, job_description, manager, email, phone, address,
    start_date, emergency_contact, emergency_phone
=======
    department, job_description, manager, email, phone,
    start_date
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
  } = req.body;

  // FIX: ensure employee_number is stored as int
  const empNum = parseInt(employee_number, 10);

  await dbUtils.query(
    `INSERT INTO employees
       (employee_number, employee_name, employee_surname, employee_id,
<<<<<<< HEAD
        department, job_description, manager, email, phone, address, start_date,
        emergency_contact, emergency_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
=======
        department, job_description, manager, email, phone, start_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
    [empNum, employee_name, employee_surname, employee_id,
     department, job_description, manager,
     email             || null,
     phone             || null,
<<<<<<< HEAD
     address           || null,
     start_date        || null,
     emergency_contact || null,
     emergency_phone   || null]
=======
     start_date        || null]
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
  );

  const { rows } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?', [empNum]
  );

  await logAuditTrail({
    table_name: 'employees',
    record_id:  empNum,
    action:     'INSERT',
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.status(201).json({ success: true, data: rows[0], message: 'Employee created successfully' });
}));

// PUT /api/employees/:id
router.put('/:id', [...employeeValidation.slice(0, -1), handleValidationErrors], asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?', [employeeId]
  );
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

  const {
    employee_name, employee_surname, employee_id, department,
<<<<<<< HEAD
    job_description, manager, email, phone, address, start_date,
    emergency_contact, emergency_phone, is_active
=======
    job_description, manager, email, phone, start_date,
    is_active
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
  } = req.body;

  // FIX: is_active converted explicitly to 1/0 integer, not boolean/string
  const isActiveInt = is_active !== undefined
    ? (is_active ? 1 : 0)
    : null;

  await dbUtils.query(
    `UPDATE employees SET
       employee_name      = ?,
       employee_surname   = ?,
       employee_id        = ?,
       department         = ?,
       job_description    = ?,
       manager            = ?,
       email              = ?,
       phone              = ?,
<<<<<<< HEAD
       address            = ?,
       start_date         = ?,
       emergency_contact  = ?,
       emergency_phone    = ?,
=======
       start_date         = ?,
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
       is_active          = COALESCE(?, is_active)
     WHERE employee_number = ?`,
    [
      employee_name, employee_surname, employee_id,
      department, job_description, manager,
      email             || null,
      phone             || null,
<<<<<<< HEAD
      address           || null,
      start_date        || null,
      emergency_contact || null,
      emergency_phone   || null,
=======
      start_date        || null,
>>>>>>> c124706 (Restructure: v1 subfolder + v2 rebuild added (Phase 3 complete))
      isActiveInt,
      employeeId
    ]
  );

  const { rows } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?', [employeeId]
  );

  await logAuditTrail({
    table_name: 'employees',
    record_id:  employeeId,
    action:     'UPDATE',
    old_values: existing[0],
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.json({ success: true, data: rows[0], message: 'Employee updated successfully' });
}));

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const { rows } = await dbUtils.query(
    'SELECT * FROM employees WHERE employee_number = ?', [employeeId]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

  await dbUtils.query('UPDATE employees SET is_active = 0 WHERE employee_number = ?', [employeeId]);

  await logAuditTrail({
    table_name: 'employees',
    record_id:  employeeId,
    action:     'DELETE',
    old_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.json({ success: true, message: 'Employee deactivated successfully' });
}));

// POST /api/employees/:id/restore
router.post('/:id/restore', asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  await dbUtils.query('UPDATE employees SET is_active = 1 WHERE employee_number = ?', [employeeId]);
  res.json({ success: true, message: 'Employee restored successfully' });
}));

module.exports = router;
