// backend/routes/schedules.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { logAuditTrail } = require('../utils/auditLogger');
const { scheduleValidation } = require('../utils/validation');

// GET /api/schedules
router.get('/', asyncHandler(async (req, res) => {
  const { status, employee_id, from_date, to_date } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (status)      { where += ' AND s.status = ?';           params.push(status); }
  if (employee_id) { where += ' AND s.employee_number = ?';  params.push(parseInt(employee_id, 10)); }
  if (from_date)   { where += ' AND s.scheduled_date >= ?';  params.push(from_date); }
  if (to_date)     { where += ' AND s.scheduled_date <= ?';  params.push(to_date); }

  const { rows } = await dbUtils.query(
    `SELECT s.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name,
       e.department, e.manager
     FROM scheduled_appraisals s
     JOIN employees e ON s.employee_number = e.employee_number
     ${where}
     ORDER BY s.scheduled_date`,
    params
  );

  res.json({ success: true, data: { schedules: rows } });
}));

// GET /api/schedules/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    `SELECT s.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM scheduled_appraisals s
     JOIN employees e ON s.employee_number = e.employee_number
     WHERE s.schedule_id = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Schedule not found' });
  res.json({ success: true, data: rows[0] });
}));

// POST /api/schedules
router.post('/', scheduleValidation, asyncHandler(async (req, res) => {
  const {
    employee_number, scheduled_date, scheduled_by,
    appraisal_type = 'Annual Review', notes, reminder_date
  } = req.body;

  const empNum = parseInt(employee_number, 10);

  const result = await dbUtils.query(
    `INSERT INTO scheduled_appraisals
       (employee_number, scheduled_date, scheduled_by, appraisal_type, notes, reminder_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [empNum, scheduled_date, scheduled_by, appraisal_type, notes || null, reminder_date || null]
  );

  await dbUtils.query(
    'UPDATE employees SET next_scheduled_appraisal = ? WHERE employee_number = ?',
    [scheduled_date, empNum]
  );

  const { rows } = await dbUtils.query(
    'SELECT * FROM scheduled_appraisals WHERE schedule_id = ?',
    [result.rows.insertId]
  );

  await logAuditTrail({
    table_name: 'scheduled_appraisals',
    record_id:  result.rows.insertId,
    action:     'INSERT',
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.status(201).json({ success: true, data: rows[0], message: 'Appraisal scheduled successfully' });
}));

// PUT /api/schedules/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const scheduleId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query(
    'SELECT * FROM scheduled_appraisals WHERE schedule_id = ?', [scheduleId]
  );
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Schedule not found' });

  const { status, scheduled_date, appraisal_type, notes, reminder_date } = req.body;

  await dbUtils.query(
    `UPDATE scheduled_appraisals SET
       status          = COALESCE(?, status),
       scheduled_date  = COALESCE(?, scheduled_date),
       appraisal_type  = COALESCE(?, appraisal_type),
       notes           = ?,
       reminder_date   = ?
     WHERE schedule_id = ?`,
    [
      status         || null,
      scheduled_date || null,
      appraisal_type || null,
      notes          || null,
      reminder_date  || null,
      scheduleId
    ]
  );

  const { rows } = await dbUtils.query(
    'SELECT * FROM scheduled_appraisals WHERE schedule_id = ?', [scheduleId]
  );
  res.json({ success: true, data: rows[0], message: 'Schedule updated' });
}));

// POST /api/schedules/:id/cancel
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const scheduleId = parseInt(req.params.id, 10);
  await dbUtils.query(
    "UPDATE scheduled_appraisals SET status = 'Cancelled' WHERE schedule_id = ?",
    [scheduleId]
  );
  res.json({ success: true, message: 'Schedule cancelled' });
}));

module.exports = router;
