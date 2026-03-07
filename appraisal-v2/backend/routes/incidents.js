// =============================================================================
// FILE:    routes/incidents.js
// PURPOSE: CRUD for employee incident logs.
//
// ROLE ACCESS:
//   admin    — all incidents
//   manager  — incidents for own subordinates only
//   employee — own incidents only (read-only)
//
// ENDPOINTS:
//   GET    /api/incidents           — list with filters
//   GET    /api/incidents/:id       — single incident
//   POST   /api/incidents           — create (admin/manager)
//   PUT    /api/incidents/:id       — update (admin/manager)
//   DELETE /api/incidents/:id       — hard delete (admin only)
// =============================================================================

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router  = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole, getSubordinateIds } = require('../middleware/auth');
const { logAudit } = require('../utils/auditLogger');

// ---- Validation -------------------------------------------------------------
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({
        success: false, message: 'Validation failed',
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
    next();
};

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const createRules = [
    body('employee_id').isInt({ min: 1 }).withMessage('employee_id required'),
    body('incident_date').isISO8601().withMessage('incident_date must be YYYY-MM-DD'),
    body('incident_type').trim().notEmpty().withMessage('incident_type required'),
    body('detail').trim().notEmpty().withMessage('detail required'),
    body('severity').optional().isIn(SEVERITIES).withMessage(`severity must be one of: ${SEVERITIES.join(', ')}`),
];

// ---- Access scope -----------------------------------------------------------
const getAccessibleEmployeeIds = async (user) => {
    if (user.role === 'admin') return null;
    if (user.role === 'manager') {
        const ids = await getSubordinateIds(user.employee_id);
        return ids.length > 0 ? ids : [-1];
    }
    return user.employee_id ? [user.employee_id] : [-1];
};

const getIncidentInScope = async (id, user) => {
    const accessibleIds = await getAccessibleEmployeeIds(user);
    let sql = `
        SELECT i.*,
               CONCAT(e.first_name,' ',e.last_name) AS employee_name,
               e.department
        FROM   incident_logs i
        JOIN   employees e ON i.employee_id = e.id
        WHERE  i.id = ?`;
    const params = [id];
    if (accessibleIds !== null) {
        sql += ` AND i.employee_id IN (${accessibleIds.map(() => '?').join(',')})`;
        params.push(...accessibleIds);
    }
    return dbUtils.getOne(sql, params);
};

// =============================================================================
// GET /api/incidents
// =============================================================================
router.get('/', asyncHandler(async (req, res) => {
    const { employee_id, incident_type, severity, date_from, date_to, page = 1, limit = 20 } = req.query;
    const limitInt  = Math.min(parseInt(limit, 10) || 20, 100);
    const pageInt   = Math.max(parseInt(page,  10) || 1, 1);
    const offsetInt = (pageInt - 1) * limitInt;

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const conditions = ['1=1'];
    const params     = [];

    if (accessibleIds !== null) {
        conditions.push(`i.employee_id IN (${accessibleIds.map(() => '?').join(',')})`);
        params.push(...accessibleIds);
    }
    if (employee_id)   { conditions.push('i.employee_id = ?');    params.push(parseInt(employee_id, 10)); }
    if (incident_type) { conditions.push('i.incident_type = ?');  params.push(incident_type); }
    if (severity)      { conditions.push('i.severity = ?');       params.push(severity); }
    if (date_from)     { conditions.push('i.incident_date >= ?'); params.push(date_from); }
    if (date_to)       { conditions.push('i.incident_date <= ?'); params.push(date_to); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const countRow = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM incident_logs i ${where}`, params
    );

    const { rows: incidents } = await dbUtils.query(
        `SELECT i.id, i.employee_id, i.incident_date, i.incident_type, i.severity,
                i.detail, i.logged_by_user_id, i.created_at,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.department
         FROM   incident_logs i
         JOIN   employees e ON i.employee_id = e.id
         ${where}
         ORDER BY i.incident_date DESC
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
    );

    res.json({
        success: true,
        data: {
            incidents,
            pagination: { page: pageInt, limit: limitInt, total: countRow.total, pages: Math.ceil(countRow.total / limitInt) },
        },
    });
}));

// =============================================================================
// GET /api/incidents/:id
// =============================================================================
router.get('/:id',
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const incident = await getIncidentInScope(parseInt(req.params.id, 10), req.user);
        if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });
        res.json({ success: true, data: incident });
    })
);

// =============================================================================
// POST /api/incidents
// =============================================================================
router.post('/',
    requireRole(['admin', 'manager']),
    createRules, handleValidation,
    asyncHandler(async (req, res) => {
        const { employee_id, incident_date, incident_type, detail, severity = 'Medium' } = req.body;
        const empId = parseInt(employee_id, 10);

        // Scope check
        const accessibleIds = await getAccessibleEmployeeIds(req.user);
        if (accessibleIds !== null && !accessibleIds.includes(empId)) {
            return res.status(403).json({ success: false, message: 'You do not have access to this employee.' });
        }

        const employee = await dbUtils.getOne(
            'SELECT id FROM employees WHERE id = ? AND is_active = TRUE', [empId]
        );
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Look up incident_type_id from config table
        const typeRow = await dbUtils.getOne(
            'SELECT id FROM incident_types WHERE name = ? AND is_active = 1', [incident_type]
        );

        const result = await dbUtils.insert(
            `INSERT INTO incident_logs
                (employee_id, incident_date, incident_type_id, incident_type,
                 detail, severity, logged_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [empId, incident_date, typeRow?.id || null, incident_type, detail, severity, req.user.id]
        );

        const created = await getIncidentInScope(result.insertId, req.user);
        await logAudit({ table_name: 'incident_logs', record_id: result.insertId, action: 'INSERT', new_values: created, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.status(201).json({ success: true, message: 'Incident logged.', data: created });
    })
);

// =============================================================================
// PUT /api/incidents/:id
// =============================================================================
router.put('/:id',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    [
        body('incident_date').optional().isISO8601(),
        body('incident_type').optional().trim().notEmpty(),
        body('detail').optional().trim().notEmpty(),
        body('severity').optional().isIn(SEVERITIES),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const incident = await getIncidentInScope(id, req.user);
        if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

        const { incident_date, incident_type, detail, severity } = req.body;

        // Update incident_type_id if type is changing
        let typeId = incident.incident_type_id;
        if (incident_type && incident_type !== incident.incident_type) {
            const typeRow = await dbUtils.getOne(
                'SELECT id FROM incident_types WHERE name = ? AND is_active = 1', [incident_type]
            );
            typeId = typeRow?.id || null;
        }

        await dbUtils.update(
            `UPDATE incident_logs SET
                incident_date    = ?,
                incident_type_id = ?,
                incident_type    = ?,
                detail           = ?,
                severity         = ?
             WHERE id = ?`,
            [
                incident_date  ?? incident.incident_date,
                typeId,
                incident_type  ?? incident.incident_type,
                detail         ?? incident.detail,
                severity       ?? incident.severity,
                id,
            ]
        );

        const updated = await getIncidentInScope(id, req.user);
        await logAudit({ table_name: 'incident_logs', record_id: id, action: 'UPDATE', old_values: incident, new_values: updated, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Incident updated.', data: updated });
    })
);

// =============================================================================
// DELETE /api/incidents/:id  — admin only
// =============================================================================
router.delete('/:id',
    requireRole('admin'),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const incident = await getIncidentInScope(id, req.user);
        if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

        await dbUtils.update('DELETE FROM incident_logs WHERE id = ?', [id]);
        await logAudit({ table_name: 'incident_logs', record_id: id, action: 'DELETE', old_values: incident, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Incident deleted.' });
    })
);

module.exports = router;
