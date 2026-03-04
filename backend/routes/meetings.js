// backend/routes/meetings.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { logAuditTrail } = require('../utils/auditLogger');
const { meetingValidation } = require('../utils/validation');

// GET /api/meetings
router.get('/', asyncHandler(async (req, res) => {
  const { employee_id, meeting_type, page = 1, limit = 20 } = req.query;

  // FIX: cast to int — mysql2 rejects strings for LIMIT/OFFSET in prepared statements
  const limitInt  = parseInt(limit, 10) || 20;
  const pageInt   = parseInt(page,  10) || 1;
  const offsetInt = (pageInt - 1) * limitInt;

  let where = 'WHERE 1=1';
  const params = [];
  if (employee_id)  { where += ' AND m.employee_number = ?'; params.push(parseInt(employee_id, 10)); }
  if (meeting_type) { where += ' AND m.meeting_type = ?';    params.push(meeting_type); }

  const { rows: meetings } = await dbUtils.query(
    `SELECT m.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM meetings m
     JOIN employees e ON m.employee_number = e.employee_number
     ${where}
     ORDER BY m.meeting_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limitInt, offsetInt]
  );

  res.json({ success: true, data: { meetings } });
}));

// GET /api/meetings/employee/:employeeId
router.get('/employee/:employeeId', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    'SELECT * FROM meetings WHERE employee_number = ? ORDER BY meeting_date DESC',
    [parseInt(req.params.employeeId, 10)]
  );
  res.json({ success: true, data: rows });
}));

// GET /api/meetings/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    `SELECT m.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM meetings m
     JOIN employees e ON m.employee_number = e.employee_number
     WHERE m.meet_id = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Meeting not found' });
  res.json({ success: true, data: rows[0] });
}));

// POST /api/meetings
router.post('/', meetingValidation, asyncHandler(async (req, res) => {
  const {
    employee_number, meeting_date, meeting_type, people_present,
    brief_note, detailed_summary, meeting_conclusion
  } = req.body;

  const empNum = parseInt(employee_number, 10);

  const result = await dbUtils.query(
    `INSERT INTO meetings
       (employee_number, meeting_date, meeting_type, people_present,
        brief_note, detailed_summary, meeting_conclusion, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [empNum, meeting_date, meeting_type, people_present || null,
     brief_note || null, detailed_summary || null, meeting_conclusion, req.user.username]
  );

  const meetId = result.rows.insertId;

  await dbUtils.query(
    'UPDATE employees SET last_meeting_date = ? WHERE employee_number = ?',
    [meeting_date, empNum]
  );

  const { rows } = await dbUtils.query('SELECT * FROM meetings WHERE meet_id = ?', [meetId]);

  await logAuditTrail({
    table_name: 'meetings',
    record_id:  meetId,
    action:     'INSERT',
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.status(201).json({ success: true, data: rows[0], message: 'Meeting created successfully' });
}));

// PUT /api/meetings/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const meetId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query('SELECT * FROM meetings WHERE meet_id = ?', [meetId]);
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Meeting not found' });

  const { meeting_type, people_present, brief_note, detailed_summary, meeting_conclusion } = req.body;

  await dbUtils.query(
    `UPDATE meetings SET
       meeting_type      = ?,
       people_present    = ?,
       brief_note        = ?,
       detailed_summary  = ?,
       meeting_conclusion= ?
     WHERE meet_id = ?`,
    [
      meeting_type       || existing[0].meeting_type,
      people_present     || null,
      brief_note         || null,
      detailed_summary   || null,
      meeting_conclusion || existing[0].meeting_conclusion,
      meetId
    ]
  );

  const { rows } = await dbUtils.query('SELECT * FROM meetings WHERE meet_id = ?', [meetId]);

  await logAuditTrail({
    table_name: 'meetings',
    record_id:  meetId,
    action:     'UPDATE',
    old_values: existing[0],
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.json({ success: true, data: rows[0], message: 'Meeting updated successfully' });
}));

// DELETE /api/meetings/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const meetId = parseInt(req.params.id, 10);
  const { rows } = await dbUtils.query('SELECT * FROM meetings WHERE meet_id = ?', [meetId]);
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Meeting not found' });

  await dbUtils.query('DELETE FROM meetings WHERE meet_id = ?', [meetId]);

  await logAuditTrail({
    table_name: 'meetings',
    record_id:  meetId,
    action:     'DELETE',
    old_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.json({ success: true, message: 'Meeting deleted successfully' });
}));

module.exports = router;
