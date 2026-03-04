// backend/routes/incidents.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { logAuditTrail } = require('../utils/auditLogger');
const { incidentValidation } = require('../utils/validation');

// GET /api/incidents
router.get('/', asyncHandler(async (req, res) => {
  const { employee_id, incident_type, severity, page = 1, limit = 20 } = req.query;

  // FIX: explicitly cast to integer — mysql2 prepared statements reject strings for LIMIT/OFFSET
  const limitInt  = parseInt(limit,  10) || 20;
  const pageInt   = parseInt(page,   10) || 1;
  const offsetInt = (pageInt - 1) * limitInt;

  let where = 'WHERE 1=1';
  const params = [];
  if (employee_id)    { where += ' AND i.employee_number = ?';   params.push(parseInt(employee_id, 10)); }
  if (incident_type)  { where += ' AND i.incident_log_type = ?'; params.push(incident_type); }
  if (severity)       { where += ' AND i.severity = ?';          params.push(severity); }

  const { rows } = await dbUtils.query(
    `SELECT i.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM incident_logs i
     JOIN employees e ON i.employee_number = e.employee_number
     ${where}
     ORDER BY i.incident_log_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limitInt, offsetInt]
  );

  res.json({ success: true, data: { incidents: rows } });
}));

// GET /api/incidents/employee/:employeeId
router.get('/employee/:employeeId', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    'SELECT * FROM incident_logs WHERE employee_number = ? ORDER BY incident_log_date DESC',
    [parseInt(req.params.employeeId, 10)]
  );
  res.json({ success: true, data: rows });
}));

// GET /api/incidents/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    'SELECT * FROM incident_logs WHERE log_id = ?',
    [parseInt(req.params.id, 10)]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Incident not found' });
  res.json({ success: true, data: rows[0] });
}));

// POST /api/incidents
router.post('/', incidentValidation, asyncHandler(async (req, res) => {
  const {
    employee_number, incident_log_date, incident_log_type, incident_detail,
    severity = 'Medium', witnesses, corrective_action, follow_up_required = false,
    follow_up_date, logged_by
  } = req.body;

  const result = await dbUtils.query(
    `INSERT INTO incident_logs
       (employee_number, incident_log_date, incident_log_type, incident_detail,
        severity, witnesses, corrective_action, follow_up_required, follow_up_date, logged_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseInt(employee_number, 10),
      incident_log_date,
      incident_log_type,
      incident_detail,
      severity,
      witnesses          || null,
      corrective_action  || null,
      follow_up_required ? 1 : 0,
      follow_up_date     || null,
      logged_by
    ]
  );

  const newId = result.rows.insertId;
  const { rows } = await dbUtils.query('SELECT * FROM incident_logs WHERE log_id = ?', [newId]);

  await logAuditTrail({
    table_name: 'incident_logs',
    record_id:  newId,
    action:     'INSERT',
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.status(201).json({ success: true, data: rows[0], message: 'Incident logged successfully' });
}));

// PUT /api/incidents/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const logId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query('SELECT * FROM incident_logs WHERE log_id = ?', [logId]);
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Incident not found' });

  const {
    incident_log_type, incident_detail, severity,
    witnesses, corrective_action, follow_up_required, follow_up_date
  } = req.body;

  // FIX: follow_up_required was being passed as a potential boolean/string into COALESCE —
  //      convert explicitly so mysql2 doesn't see a mix of int and string params.
  const followUpInt = follow_up_required !== undefined
    ? (follow_up_required ? 1 : 0)
    : null;

  await dbUtils.query(
    `UPDATE incident_logs SET
       incident_log_type  = COALESCE(?, incident_log_type),
       incident_detail    = COALESCE(?, incident_detail),
       severity           = COALESCE(?, severity),
       witnesses          = ?,
       corrective_action  = ?,
       follow_up_required = COALESCE(?, follow_up_required),
       follow_up_date     = ?
     WHERE log_id = ?`,
    [
      incident_log_type || null,
      incident_detail   || null,
      severity          || null,
      witnesses         || null,
      corrective_action || null,
      followUpInt,
      follow_up_date    || null,
      logId
    ]
  );

  const { rows } = await dbUtils.query('SELECT * FROM incident_logs WHERE log_id = ?', [logId]);
  res.json({ success: true, data: rows[0], message: 'Incident updated' });
}));

module.exports = router;
