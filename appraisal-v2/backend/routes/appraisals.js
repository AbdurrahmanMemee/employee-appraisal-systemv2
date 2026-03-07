// =============================================================================
// FILE:    routes/appraisals.js
// PURPOSE: CRUD for appraisals and their section ratings.
//
// KEY DESIGN:
//   - Sections are always written as a full replace (DELETE + INSERT) on update
//     so the client sends the complete section array every time.
//   - overall_rating is auto-calculated from weighted sections on create/update,
//     not accepted from the client (prevents manipulation).
//   - Status transitions: Draft → In Progress → Completed | Cancelled
//     Only admin can cancel. Completed appraisals are read-only.
//   - On Completed: employees.average_rating and last/next appraisal dates updated.
//
// ROLE ACCESS:
//   admin    — all appraisals
//   manager  — appraisals for own subordinates
//   employee — own appraisals (read-only)
//
// ENDPOINTS:
//   GET    /api/appraisals              — list with filters
//   GET    /api/appraisals/:id          — single appraisal + sections
//   POST   /api/appraisals              — create (admin/manager)
//   PUT    /api/appraisals/:id          — update (admin/manager; not if Completed)
//   POST   /api/appraisals/:id/submit   — mark Completed (admin/manager)
//   POST   /api/appraisals/:id/cancel   — cancel (admin only)
//   DELETE /api/appraisals/:id          — hard delete Draft only (admin only)
// =============================================================================

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router  = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole, getSubordinateIds } = require('../middleware/auth');
const { logAudit } = require('../utils/auditLogger');

// ---- Validation helpers -----------------------------------------------------
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({
        success: false, message: 'Validation failed',
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
    next();
};

const createRules = [
    body('employee_id').isInt({ min: 1 }).withMessage('employee_id required'),
    body('appraisal_date').isISO8601().withMessage('appraisal_date must be YYYY-MM-DD'),
    body('sections').isArray({ min: 1 }).withMessage('sections array required (min 1)'),
    body('sections.*.section_name').trim().notEmpty().withMessage('Each section needs a name'),
    body('sections.*.rating')
        .isFloat({ min: 0, max: 5 }).withMessage('Section rating must be 0–5'),
    body('sections.*.weight')
        .isFloat({ min: 0, max: 100 }).withMessage('Section weight must be 0–100'),
    body('status').optional().isIn(['Draft','In Progress','Completed','Cancelled']),
    body('next_appraisal_date').optional({ nullable: true }).isISO8601(),
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

// ---- Weighted rating calc ---------------------------------------------------
// overall_rating = SUM(section.rating * section.weight) / SUM(section.weight)
// Falls back to simple average if total weight == 0.
const calcOverallRating = (sections) => {
    const totalWeight = sections.reduce((s, sec) => s + parseFloat(sec.weight || 0), 0);
    if (totalWeight === 0) {
        const avg = sections.reduce((s, sec) => s + parseFloat(sec.rating), 0) / sections.length;
        return Math.round(avg * 100) / 100;
    }
    const weighted = sections.reduce(
        (s, sec) => s + parseFloat(sec.rating) * parseFloat(sec.weight || 0), 0
    );
    return Math.round((weighted / totalWeight) * 100) / 100;
};

// ---- Fetch appraisal + sections (scoped) ------------------------------------
const getAppraisalInScope = async (appraisalId, user) => {
    const accessibleIds = await getAccessibleEmployeeIds(user);
    let sql = `
        SELECT a.*,
               CONCAT(e.first_name,' ',e.last_name) AS employee_name,
               e.department, e.job_title
        FROM   appraisals a
        JOIN   employees e ON a.employee_id = e.id
        WHERE  a.id = ?`;
    const params = [appraisalId];
    if (accessibleIds !== null) {
        sql += ` AND a.employee_id IN (${accessibleIds.map(()=>'?').join(',')})`;
        params.push(...accessibleIds);
    }
    const appraisal = await dbUtils.getOne(sql, params);
    if (!appraisal) return null;

    const { rows: sections } = await dbUtils.query(
        'SELECT * FROM appraisal_sections WHERE appraisal_id = ? ORDER BY sort_order ASC',
        [appraisalId]
    );
    appraisal.sections = sections;
    return appraisal;
};

// ---- Update employee cached fields after Completed -------------------------
const updateEmployeeAppraisalCache = async (employeeId, appraisalDate, nextAppraisalDate) => {
    // Recalculate average from all Completed appraisals
    await dbUtils.update(
        `UPDATE employees e SET
            average_rating = (
                SELECT ROUND(AVG(overall_rating), 2)
                FROM appraisals
                WHERE employee_id = e.id AND status = 'Completed'
            ),
            last_appraisal_date      = ?,
            next_scheduled_appraisal = ?
         WHERE id = ?`,
        [appraisalDate, nextAppraisalDate || null, employeeId]
    );
};

// =============================================================================
// GET /api/appraisals
// =============================================================================
router.get('/', asyncHandler(async (req, res) => {
    const { employee_id, status, date_from, date_to, page = 1, limit = 20 } = req.query;
    const limitInt  = Math.min(parseInt(limit,  10) || 20, 100);
    const pageInt   = Math.max(parseInt(page,   10) || 1, 1);
    const offsetInt = (pageInt - 1) * limitInt;

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const conditions = ['1=1'];
    const params     = [];

    if (accessibleIds !== null) {
        conditions.push(`a.employee_id IN (${accessibleIds.map(()=>'?').join(',')})`);
        params.push(...accessibleIds);
    }
    if (employee_id) { conditions.push('a.employee_id = ?');   params.push(parseInt(employee_id, 10)); }
    if (status)      { conditions.push('a.status = ?');        params.push(status); }
    if (date_from)   { conditions.push('a.appraisal_date >= ?'); params.push(date_from); }
    if (date_to)     { conditions.push('a.appraisal_date <= ?'); params.push(date_to); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const countRow = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM appraisals a ${where}`, params
    );

    const { rows: appraisals } = await dbUtils.query(
        `SELECT a.id, a.employee_id, a.appraisal_date, a.overall_rating,
                a.status, a.next_appraisal_date, a.people_present,
                a.created_by_user_id, a.created_at,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.department
         FROM   appraisals a
         JOIN   employees e ON a.employee_id = e.id
         ${where}
         ORDER BY a.appraisal_date DESC
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
    );

    res.json({
        success: true,
        data: {
            appraisals,
            pagination: { page: pageInt, limit: limitInt, total: countRow.total, pages: Math.ceil(countRow.total / limitInt) },
        },
    });
}));

// =============================================================================
// GET /api/appraisals/:id
// =============================================================================
router.get('/:id',
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const appraisal = await getAppraisalInScope(parseInt(req.params.id, 10), req.user);
        if (!appraisal) return res.status(404).json({ success: false, message: 'Appraisal not found.' });
        res.json({ success: true, data: appraisal });
    })
);

// =============================================================================
// POST /api/appraisals
// =============================================================================
router.post('/',
    requireRole(['admin', 'manager']),
    createRules, handleValidation,
    asyncHandler(async (req, res) => {
        const {
            employee_id, appraisal_date, people_present, sections,
            status = 'Draft', next_appraisal_date, overall_comments,
        } = req.body;

        const empId = parseInt(employee_id, 10);

        // Scope check
        const accessibleIds = await getAccessibleEmployeeIds(req.user);
        if (accessibleIds !== null && !accessibleIds.includes(empId)) {
            return res.status(403).json({ success: false, message: 'You do not have access to this employee.' });
        }

        // Employee must exist and be active
        const employee = await dbUtils.getOne(
            'SELECT id FROM employees WHERE id = ? AND is_active = TRUE', [empId]
        );
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Validate section weights sum ≤ 100 (warn if not 100, but allow)
        const totalWeight = sections.reduce((s, sec) => s + parseFloat(sec.weight || 0), 0);
        if (totalWeight > 100.01) {
            return res.status(400).json({ success: false, message: `Section weights total ${totalWeight.toFixed(1)} — must not exceed 100.` });
        }

        const overallRating = calcOverallRating(sections);

        // Transaction: insert appraisal + sections atomically
        const insertId = await dbUtils.transaction(async (conn) => {
            const [result] = await conn.execute(
                `INSERT INTO appraisals
                    (employee_id, appraisal_date, people_present, overall_rating,
                     next_appraisal_date, status, created_by_user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [empId, appraisal_date, people_present || null, overallRating,
                 next_appraisal_date || null, status, req.user.id]
            );
            const appraisalId = result.insertId;

            for (let i = 0; i < sections.length; i++) {
                const s = sections[i];
                await conn.execute(
                    `INSERT INTO appraisal_sections
                        (appraisal_id, section_name, rating, weight, previous_rating, comments, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [appraisalId, s.section_name.trim(), parseFloat(s.rating),
                     parseFloat(s.weight || 0), s.previous_rating != null ? parseFloat(s.previous_rating) : null,
                     s.comments || null, i]
                );
            }

            return appraisalId;
        });

        // If created as Completed, update employee cache immediately
        if (status === 'Completed') {
            await updateEmployeeAppraisalCache(empId, appraisal_date, next_appraisal_date);
        } else {
            // Still update last_appraisal_date and next even for non-completed if dates provided
            await dbUtils.update(
                `UPDATE employees SET last_appraisal_date = ?, next_scheduled_appraisal = ? WHERE id = ?`,
                [appraisal_date, next_appraisal_date || null, empId]
            );
        }

        const created = await getAppraisalInScope(insertId, req.user);
        await logAudit({ table_name: 'appraisals', record_id: insertId, action: 'INSERT', new_values: created, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.status(201).json({ success: true, message: 'Appraisal created.', data: created });
    })
);

// =============================================================================
// PUT /api/appraisals/:id
// Full update — sections always replaced wholesale.
// Cannot edit a Completed or Cancelled appraisal.
// =============================================================================
router.put('/:id',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    [
        body('appraisal_date').optional().isISO8601(),
        body('sections').optional().isArray({ min: 1 }),
        body('sections.*.section_name').optional().trim().notEmpty(),
        body('sections.*.rating').optional().isFloat({ min: 0, max: 5 }),
        body('sections.*.weight').optional().isFloat({ min: 0, max: 100 }),
        body('status').optional().isIn(['Draft', 'In Progress']),
        body('next_appraisal_date').optional({ nullable: true }).isISO8601(),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const id         = parseInt(req.params.id, 10);
        const appraisal  = await getAppraisalInScope(id, req.user);
        if (!appraisal) return res.status(404).json({ success: false, message: 'Appraisal not found.' });

        if (['Completed', 'Cancelled'].includes(appraisal.status)) {
            return res.status(400).json({ success: false, message: `Cannot edit a ${appraisal.status} appraisal.` });
        }

        const { appraisal_date, people_present, sections, status, next_appraisal_date, overall_comments } = req.body;

        // Recalculate overall rating if sections provided
        let overallRating = appraisal.overall_rating;
        if (sections && sections.length > 0) {
            const totalWeight = sections.reduce((s, sec) => s + parseFloat(sec.weight || 0), 0);
            if (totalWeight > 100.01) {
                return res.status(400).json({ success: false, message: `Section weights total ${totalWeight.toFixed(1)} — must not exceed 100.` });
            }
            overallRating = calcOverallRating(sections);
        }

        await dbUtils.transaction(async (conn) => {
            await conn.execute(
                `UPDATE appraisals SET
                    appraisal_date      = ?,
                    people_present      = ?,
                    overall_rating      = ?,
                    next_appraisal_date = ?,
                    status              = ?
                 WHERE id = ?`,
                [
                    appraisal_date      ?? appraisal.appraisal_date,
                    people_present      !== undefined ? (people_present || null) : appraisal.people_present,
                    overallRating,
                    next_appraisal_date !== undefined ? (next_appraisal_date || null) : appraisal.next_appraisal_date,
                    status              ?? appraisal.status,
                    id,
                ]
            );

            if (sections && sections.length > 0) {
                await conn.execute('DELETE FROM appraisal_sections WHERE appraisal_id = ?', [id]);
                for (let i = 0; i < sections.length; i++) {
                    const s = sections[i];
                    await conn.execute(
                        `INSERT INTO appraisal_sections
                            (appraisal_id, section_name, rating, weight, previous_rating, comments, sort_order)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [id, s.section_name.trim(), parseFloat(s.rating),
                         parseFloat(s.weight || 0), s.previous_rating != null ? parseFloat(s.previous_rating) : null,
                         s.comments || null, i]
                    );
                }
            }
        });

        const updated = await getAppraisalInScope(id, req.user);
        await logAudit({ table_name: 'appraisals', record_id: id, action: 'UPDATE', old_values: appraisal, new_values: updated, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Appraisal updated.', data: updated });
    })
);

// =============================================================================
// POST /api/appraisals/:id/submit  — mark as Completed
// =============================================================================
router.post('/:id/submit',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id        = parseInt(req.params.id, 10);
        const appraisal = await getAppraisalInScope(id, req.user);
        if (!appraisal) return res.status(404).json({ success: false, message: 'Appraisal not found.' });

        if (appraisal.status === 'Completed') return res.status(400).json({ success: false, message: 'Already completed.' });
        if (appraisal.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Cannot submit a cancelled appraisal.' });
        if (appraisal.sections.length === 0)  return res.status(400).json({ success: false, message: 'Cannot submit: appraisal has no sections.' });

        await dbUtils.update("UPDATE appraisals SET status = 'Completed' WHERE id = ?", [id]);
        await updateEmployeeAppraisalCache(appraisal.employee_id, appraisal.appraisal_date, appraisal.next_appraisal_date);

        await logAudit({ table_name: 'appraisals', record_id: id, action: 'UPDATE', old_values: { status: appraisal.status }, new_values: { status: 'Completed' }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        const updated = await getAppraisalInScope(id, req.user);
        res.json({ success: true, message: 'Appraisal submitted and completed.', data: updated });
    })
);

// =============================================================================
// POST /api/appraisals/:id/cancel  — admin only
// =============================================================================
router.post('/:id/cancel',
    requireRole('admin'),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id        = parseInt(req.params.id, 10);
        const appraisal = await getAppraisalInScope(id, req.user);
        if (!appraisal) return res.status(404).json({ success: false, message: 'Appraisal not found.' });
        if (appraisal.status === 'Completed') return res.status(400).json({ success: false, message: 'Cannot cancel a completed appraisal.' });
        if (appraisal.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Already cancelled.' });

        await dbUtils.update("UPDATE appraisals SET status = 'Cancelled' WHERE id = ?", [id]);
        await logAudit({ table_name: 'appraisals', record_id: id, action: 'UPDATE', old_values: { status: appraisal.status }, new_values: { status: 'Cancelled' }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Appraisal cancelled.' });
    })
);

// =============================================================================
// DELETE /api/appraisals/:id  — admin only, Draft status only
// =============================================================================
router.delete('/:id',
    requireRole('admin'),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id        = parseInt(req.params.id, 10);
        const appraisal = await getAppraisalInScope(id, req.user);
        if (!appraisal) return res.status(404).json({ success: false, message: 'Appraisal not found.' });
        if (appraisal.status !== 'Draft') {
            return res.status(400).json({ success: false, message: `Cannot delete a ${appraisal.status} appraisal. Cancel it first.` });
        }

        // Sections deleted via ON DELETE CASCADE from FK
        await dbUtils.update('DELETE FROM appraisals WHERE id = ?', [id]);
        await logAudit({ table_name: 'appraisals', record_id: id, action: 'DELETE', old_values: appraisal, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Appraisal deleted.' });
    })
);

module.exports = router;
