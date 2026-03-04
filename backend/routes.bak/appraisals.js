// backend/routes/appraisals.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { logAuditTrail } = require('../utils/auditLogger');
const { appraisalValidation } = require('../utils/validation');

// GET /api/appraisals
router.get('/', asyncHandler(async (req, res) => {
  const { employee_id, status, page = 1, limit = 20 } = req.query;

  // FIX: cast to int — mysql2 rejects strings for LIMIT/OFFSET in prepared statements
  const limitInt  = parseInt(limit, 10) || 20;
  const pageInt   = parseInt(page,  10) || 1;
  const offsetInt = (pageInt - 1) * limitInt;

  let where = 'WHERE 1=1';
  const params = [];
  if (employee_id) { where += ' AND a.employee_number = ?'; params.push(parseInt(employee_id, 10)); }
  if (status)      { where += ' AND a.appraisal_status = ?'; params.push(status); }

  const { rows } = await dbUtils.query(
    `SELECT a.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM appraisals a
     JOIN employees e ON a.employee_number = e.employee_number
     ${where}
     ORDER BY a.appraisal_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limitInt, offsetInt]
  );

  res.json({ success: true, data: { appraisals: rows } });
}));

// GET /api/appraisals/employee/:employeeId
router.get('/employee/:employeeId', asyncHandler(async (req, res) => {
  const employeeId = parseInt(req.params.employeeId, 10);

  const { rows: appraisals } = await dbUtils.query(
    'SELECT * FROM appraisals WHERE employee_number = ? ORDER BY appraisal_date DESC',
    [employeeId]
  );

  for (const appraisal of appraisals) {
    const { rows: sections } = await dbUtils.query(
      'SELECT * FROM appraisal_sections WHERE appr_id = ? ORDER BY section_order',
      [appraisal.appr_id]
    );
    appraisal.sections = sections;
  }

  res.json({ success: true, data: appraisals });
}));

// GET /api/appraisals/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(
    `SELECT a.*, CONCAT(e.employee_name, ' ', e.employee_surname) AS employee_full_name
     FROM appraisals a
     JOIN employees e ON a.employee_number = e.employee_number
     WHERE a.appr_id = ?`,
    [parseInt(req.params.id, 10)]
  );
  if (rows.length === 0) return res.status(404).json({ success: false, message: 'Appraisal not found' });

  const { rows: sections } = await dbUtils.query(
    'SELECT * FROM appraisal_sections WHERE appr_id = ? ORDER BY section_order',
    [rows[0].appr_id]
  );

  res.json({ success: true, data: { ...rows[0], sections } });
}));

// POST /api/appraisals
router.post('/', appraisalValidation, asyncHandler(async (req, res) => {
  const {
    employee_number, appraisal_date, people_present, employee_rating,
    next_appraisal_date, appraisal_status = 'Draft', overall_comments, sections = []
  } = req.body;

  const empNum = parseInt(employee_number, 10);
  // FIX: rating must be a float, not a string
  const ratingFloat = parseFloat(employee_rating);

  const result = await dbUtils.transaction(async (conn) => {
    const [appraisalResult] = await conn.execute(
      `INSERT INTO appraisals
         (employee_number, appraisal_date, people_present, employee_rating,
          next_appraisal_date, appraisal_status, overall_comments, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [empNum, appraisal_date, people_present || null, ratingFloat,
       next_appraisal_date || null, appraisal_status, overall_comments || null, req.user.username]
    );

    const appraisalId = appraisalResult.insertId;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      await conn.execute(
        `INSERT INTO appraisal_sections
           (appr_id, section_name, section_rating, previous_rating,
            section_comments, section_order, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          appraisalId,
          s.section_name,
          parseFloat(s.section_rating),
          s.previous_rating != null ? parseFloat(s.previous_rating) : null,
          s.section_comments || null,
          i,
          parseFloat(s.weight) || 10
        ]
      );
    }

    await conn.execute(
      'UPDATE employees SET last_appraisal_date = ?, next_scheduled_appraisal = ? WHERE employee_number = ?',
      [appraisal_date, next_appraisal_date || null, empNum]
    );

    if (appraisal_status === 'Completed') {
      await conn.execute(
        `UPDATE employees SET average_employee_rating = (
           SELECT COALESCE(AVG(employee_rating), 0) FROM appraisals
           WHERE employee_number = ? AND appraisal_status = 'Completed'
         ) WHERE employee_number = ?`,
        [empNum, empNum]
      );
    }

    return appraisalId;
  });

  const { rows }            = await dbUtils.query('SELECT * FROM appraisals WHERE appr_id = ?', [result]);
  const { rows: sections_saved } = await dbUtils.query(
    'SELECT * FROM appraisal_sections WHERE appr_id = ? ORDER BY section_order', [result]
  );

  await logAuditTrail({
    table_name: 'appraisals',
    record_id:  result,
    action:     'INSERT',
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.status(201).json({
    success: true,
    data:    { ...rows[0], sections: sections_saved },
    message: 'Appraisal created successfully'
  });
}));

// PUT /api/appraisals/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const appraisalId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query('SELECT * FROM appraisals WHERE appr_id = ?', [appraisalId]);
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Appraisal not found' });

  const { appraisal_status, employee_rating, next_appraisal_date, overall_comments, sections } = req.body;

  // FIX: parse numeric fields so COALESCE receives consistent types
  const ratingFloat = employee_rating != null ? parseFloat(employee_rating) : null;

  await dbUtils.transaction(async (conn) => {
    await conn.execute(
      `UPDATE appraisals SET
         appraisal_status   = COALESCE(?, appraisal_status),
         employee_rating     = COALESCE(?, employee_rating),
         next_appraisal_date = COALESCE(?, next_appraisal_date),
         overall_comments    = COALESCE(?, overall_comments)
       WHERE appr_id = ?`,
      [appraisal_status || null, ratingFloat, next_appraisal_date || null, overall_comments || null, appraisalId]
    );

    if (sections && sections.length > 0) {
      await conn.execute('DELETE FROM appraisal_sections WHERE appr_id = ?', [appraisalId]);
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        await conn.execute(
          `INSERT INTO appraisal_sections
             (appr_id, section_name, section_rating, previous_rating,
              section_comments, section_order, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            appraisalId,
            s.section_name,
            parseFloat(s.section_rating),
            s.previous_rating != null ? parseFloat(s.previous_rating) : null,
            s.section_comments || null,
            i,
            parseFloat(s.weight) || 10
          ]
        );
      }
    }

    if (appraisal_status === 'Completed' && existing[0].appraisal_status !== 'Completed') {
      await conn.execute(
        `UPDATE employees SET average_employee_rating = (
           SELECT COALESCE(AVG(employee_rating), 0) FROM appraisals
           WHERE employee_number = ? AND appraisal_status = 'Completed'
         ) WHERE employee_number = ?`,
        [existing[0].employee_number, existing[0].employee_number]
      );
    }
  });

  const { rows }            = await dbUtils.query('SELECT * FROM appraisals WHERE appr_id = ?', [appraisalId]);
  const { rows: updatedSections } = await dbUtils.query(
    'SELECT * FROM appraisal_sections WHERE appr_id = ? ORDER BY section_order', [appraisalId]
  );

  await logAuditTrail({
    table_name: 'appraisals',
    record_id:  appraisalId,
    action:     'UPDATE',
    old_values: existing[0],
    new_values: rows[0],
    changed_by: req.user.username,
    ip_address: req.ip,
    user_agent: req.get('user-agent')
  });

  res.json({ success: true, data: { ...rows[0], sections: updatedSections }, message: 'Appraisal updated' });
}));

// POST /api/appraisals/:id/submit
router.post('/:id/submit', asyncHandler(async (req, res) => {
  const appraisalId = parseInt(req.params.id, 10);
  const { rows: existing } = await dbUtils.query('SELECT * FROM appraisals WHERE appr_id = ?', [appraisalId]);
  if (existing.length === 0) return res.status(404).json({ success: false, message: 'Appraisal not found' });

  await dbUtils.transaction(async (conn) => {
    await conn.execute(
      "UPDATE appraisals SET appraisal_status = 'Completed' WHERE appr_id = ?",
      [appraisalId]
    );
    await conn.execute(
      `UPDATE employees SET average_employee_rating = (
         SELECT COALESCE(AVG(employee_rating), 0) FROM appraisals
         WHERE employee_number = ? AND appraisal_status = 'Completed'
       ) WHERE employee_number = ?`,
      [existing[0].employee_number, existing[0].employee_number]
    );
  });

  res.json({ success: true, message: 'Appraisal submitted successfully' });
}));

module.exports = router;
