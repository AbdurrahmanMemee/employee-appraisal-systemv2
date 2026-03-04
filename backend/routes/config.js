// backend/routes/config.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { authorize } = require('../middleware/authMiddleware');

// Map category names to table/column info
const CONFIG_TABLES = {
  departments: { table: 'departments', col: 'department_name' },
  managers: { table: 'managers', col: 'manager_name' },
  jobDescriptions: { table: 'job_descriptions', col: 'job_title' },
  meetingTypes: { table: 'meeting_types', col: 'meeting_type' },
  generalMisconductTypes: { table: 'general_misconduct_types', col: 'misconduct_type' },
  grossMisconductTypes: { table: 'gross_misconduct_types', col: 'misconduct_type' },
  achievementTypes: { table: 'achievement_types', col: 'achievement_type' },
  incidentLogTypes: { table: 'incident_log_types', col: 'incident_type' }
};

// GET /api/config - get all config
router.get('/', asyncHandler(async (req, res) => {
  const result = {};
  for (const [key, { table, col }] of Object.entries(CONFIG_TABLES)) {
    const { rows } = await dbUtils.query(
      `SELECT id, \`${col}\` as value, active FROM \`${table}\` WHERE active = 1 ORDER BY \`${col}\``
    );
    result[key] = rows.map(r => r.value);
  }
  res.json({ success: true, data: result });
}));

// GET /api/config/:category
router.get('/:category', asyncHandler(async (req, res) => {
  const info = CONFIG_TABLES[req.params.category];
  if (!info) return res.status(404).json({ success: false, message: 'Configuration category not found' });

  const { rows } = await dbUtils.query(
    `SELECT id, \`${info.col}\` as value, active FROM \`${info.table}\` ORDER BY \`${info.col}\``
  );
  res.json({ success: true, data: rows });
}));

// POST /api/config/:category - add item (admin/manager only)
router.post('/:category', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const info = CONFIG_TABLES[req.params.category];
  if (!info) return res.status(404).json({ success: false, message: 'Configuration category not found' });

  const { value } = req.body;
  if (!value || !value.trim()) {
    return res.status(400).json({ success: false, message: 'Value is required' });
  }

  const sanitizedValue = value.trim().substring(0, 150);

  await dbUtils.query(
    `INSERT INTO \`${info.table}\` (\`${info.col}\`) VALUES (?)`, [sanitizedValue]
  );

  res.status(201).json({ success: true, message: `${req.params.category} item added`, data: { value: sanitizedValue } });
}));

// PUT /api/config/:category/:id
router.put('/:category/:id', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const info = CONFIG_TABLES[req.params.category];
  if (!info) return res.status(404).json({ success: false, message: 'Configuration category not found' });

  const { value, active } = req.body;
  const id = parseInt(req.params.id, 10);

  if (value !== undefined) {
    await dbUtils.query(
      `UPDATE \`${info.table}\` SET \`${info.col}\` = ? WHERE id = ?`,
      [value.trim().substring(0, 150), id]
    );
  }
  if (active !== undefined) {
    await dbUtils.query(
      `UPDATE \`${info.table}\` SET active = ? WHERE id = ?`, [active ? 1 : 0, id]
    );
  }

  res.json({ success: true, message: 'Configuration updated' });
}));

// DELETE /api/config/:category/:id (admin only)
router.delete('/:category/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const info = CONFIG_TABLES[req.params.category];
  if (!info) return res.status(404).json({ success: false, message: 'Configuration category not found' });

  // Soft delete by setting active = false rather than destroying data
  await dbUtils.query(
    `UPDATE \`${info.table}\` SET active = 0 WHERE id = ?`, [parseInt(req.params.id, 10)]
  );
  res.json({ success: true, message: 'Configuration item removed' });
}));

module.exports = router;
