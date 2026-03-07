// =============================================================================
// FILE:    routes/config.js
// PURPOSE: CRUD for all dropdown/lookup tables used throughout the app.
//
// ROLE ACCESS RULES:
//   GET  (all)    — all authenticated roles (needed to populate dropdowns)
//   POST/PUT      — admin only (managers and employees cannot add/rename items)
//   DELETE        — admin only (soft deactivate — preserves historical records)
//
// CATEGORIES (maps frontend key → DB table + column):
//   departments              → departments.name
//   job_titles               → job_titles.name
//   meeting_types            → meeting_types.name
//   incident_types           → incident_types.name
//   appraisal_section_templates → appraisal_section_templates.name
//
// ENDPOINTS:
//   GET    /api/config                  — all categories in one response (for app startup)
//   GET    /api/config/:category        — single category with full detail (id, name, active)
//   POST   /api/config/:category        — add item (admin only)
//   PUT    /api/config/:category/:id    — rename item (admin only)
//   DELETE /api/config/:category/:id    — soft deactivate item (admin only)
//   POST   /api/config/:category/:id/restore — reactivate item (admin only)
// =============================================================================

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router  = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole }  = require('../middleware/auth');
const { logAudit }     = require('../utils/auditLogger');

// ---- Category map -----------------------------------------------------------
// Maps the URL :category param to its DB table and value column.
// Keeping this in one place means adding a new dropdown type is a one-line change.

const CATEGORIES = {
    departments: {
        table:       'departments',
        col:         'name',
        label:       'Department',
        maxLength:   100,
    },
    job_titles: {
        table:       'job_titles',
        col:         'name',
        label:       'Job Title',
        maxLength:   150,
    },
    meeting_types: {
        table:       'meeting_types',
        col:         'name',
        label:       'Meeting Type',
        maxLength:   100,
    },
    incident_types: {
        table:       'incident_types',
        col:         'name',
        label:       'Incident Type',
        maxLength:   150,
    },
    appraisal_sections: {
        table:       'appraisal_section_templates',
        col:         'name',
        label:       'Appraisal Section',
        maxLength:   150,
        hasWeight:   true,   // this category also has a default_weight column
    },
};

// ---- Validation helper ------------------------------------------------------
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

// ---- Category lookup middleware ---------------------------------------------
// Attaches category info to req.category or returns 404.
const resolveCategory = (req, res, next) => {
    const cat = CATEGORIES[req.params.category];
    if (!cat) {
        return res.status(404).json({
            success: false,
            message: `Unknown category '${req.params.category}'. Valid categories: ${Object.keys(CATEGORIES).join(', ')}`,
        });
    }
    req.category = cat;
    next();
};

// =============================================================================
// GET /api/config
// Returns ALL categories in one call — used at app startup to populate
// every dropdown in the frontend in a single request.
// =============================================================================

router.get('/', asyncHandler(async (req, res) => {
    const result = {};

    for (const [key, cat] of Object.entries(CATEGORIES)) {
        const { rows } = await dbUtils.query(
            `SELECT id, \`${cat.col}\` AS name, is_active
             ${cat.hasWeight ? ', default_weight' : ''}
             FROM \`${cat.table}\`
             WHERE is_active = 1
             ORDER BY \`${cat.col}\` ASC`
        );
        result[key] = rows;
    }

    res.json({ success: true, data: result });
}));

// =============================================================================
// GET /api/config/:category
// Returns all items (active and inactive) for admin management view.
// Active-only items are available via GET /api/config (above).
// =============================================================================

router.get('/:category',
    resolveCategory,
    asyncHandler(async (req, res) => {
        const { table, col, hasWeight } = req.category;

        const { rows } = await dbUtils.query(
            `SELECT id, \`${col}\` AS name, is_active, created_at
             ${hasWeight ? ', default_weight' : ''}
             FROM \`${table}\`
             ORDER BY \`${col}\` ASC`
        );

        res.json({
            success: true,
            data: rows,
            meta: {
                category: req.params.category,
                total:    rows.length,
                active:   rows.filter(r => r.is_active).length,
            },
        });
    })
);

// =============================================================================
// POST /api/config/:category
// Add a new item. Admin only.
// =============================================================================

router.post('/:category',
    requireRole('admin'),
    resolveCategory,
    [
        body('name')
            .trim().notEmpty().withMessage('Name is required'),
        body('default_weight')
            .optional()
            .isFloat({ min: 0, max: 100 }).withMessage('Weight must be between 0 and 100'),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const { table, col, label, maxLength, hasWeight } = req.category;
        const name = req.body.name.trim().substring(0, maxLength);

        // Check uniqueness (case-insensitive)
        const exists = await dbUtils.exists(
            `SELECT 1 FROM \`${table}\` WHERE LOWER(\`${col}\`) = LOWER(?)`,
            [name]
        );
        if (exists) {
            return res.status(409).json({
                success: false,
                message: `${label} '${name}' already exists.`,
            });
        }

        let insertId;
        if (hasWeight && req.body.default_weight !== undefined) {
            const result = await dbUtils.insert(
                `INSERT INTO \`${table}\` (\`${col}\`, default_weight, is_active) VALUES (?, ?, TRUE)`,
                [name, parseFloat(req.body.default_weight)]
            );
            insertId = result.insertId;
        } else {
            const result = await dbUtils.insert(
                `INSERT INTO \`${table}\` (\`${col}\`, is_active) VALUES (?, TRUE)`,
                [name]
            );
            insertId = result.insertId;
        }

        const newItem = await dbUtils.getOne(
            `SELECT id, \`${col}\` AS name, is_active FROM \`${table}\` WHERE id = ?`,
            [insertId]
        );

        await logAudit({
            table_name: table,
            record_id:  insertId,
            action:     'INSERT',
            new_values: newItem,
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.status(201).json({
            success: true,
            message: `${label} '${name}' added successfully.`,
            data: newItem,
        });
    })
);

// =============================================================================
// PUT /api/config/:category/:id
// Rename an existing item. Admin only.
// IMPORTANT: We also update the string copy in employees/meetings/etc. tables
// so existing records reflect the rename. This is safe because the string copy
// is for display/reporting — the FK id is the authoritative reference.
// =============================================================================

router.put('/:category/:id',
    requireRole('admin'),
    resolveCategory,
    param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('default_weight').optional().isFloat({ min: 0, max: 100 }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const { table, col, label, maxLength, hasWeight } = req.category;
        const id      = parseInt(req.params.id, 10);
        const newName = req.body.name.trim().substring(0, maxLength);

        // Confirm item exists
        const existing = await dbUtils.getOne(
            `SELECT id, \`${col}\` AS name, is_active FROM \`${table}\` WHERE id = ?`,
            [id]
        );
        if (!existing) {
            return res.status(404).json({ success: false, message: `${label} not found.` });
        }

        // Check new name not already taken by a different item
        const taken = await dbUtils.exists(
            `SELECT 1 FROM \`${table}\` WHERE LOWER(\`${col}\`) = LOWER(?) AND id != ?`,
            [newName, id]
        );
        if (taken) {
            return res.status(409).json({
                success: false,
                message: `${label} '${newName}' already exists.`,
            });
        }

        // Update the lookup table
        if (hasWeight && req.body.default_weight !== undefined) {
            await dbUtils.update(
                `UPDATE \`${table}\` SET \`${col}\` = ?, default_weight = ? WHERE id = ?`,
                [newName, parseFloat(req.body.default_weight), id]
            );
        } else {
            await dbUtils.update(
                `UPDATE \`${table}\` SET \`${col}\` = ? WHERE id = ?`,
                [newName, id]
            );
        }

        // Propagate rename to string copies in main tables
        // This keeps historical records readable without needing a JOIN
        const propagations = {
            departments:  [{ table: 'employees', col: 'department' }],
            job_titles:   [{ table: 'employees', col: 'job_title'  }],
            meeting_types:[{ table: 'meetings',  col: 'meeting_type'}],
            incident_types:[{ table: 'incident_logs', col: 'incident_type' }],
            appraisal_sections: [], // section names live in appraisal_sections rows, not a string copy
        };

        for (const prop of (propagations[req.params.category] || [])) {
            await dbUtils.update(
                `UPDATE \`${prop.table}\` SET \`${prop.col}\` = ? WHERE \`${prop.col}\` = ?`,
                [newName, existing.name]
            );
        }

        const updated = await dbUtils.getOne(
            `SELECT id, \`${col}\` AS name, is_active FROM \`${table}\` WHERE id = ?`,
            [id]
        );

        await logAudit({
            table_name: table,
            record_id:  id,
            action:     'UPDATE',
            old_values: existing,
            new_values: updated,
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.json({
            success: true,
            message: `${label} renamed to '${newName}' successfully.`,
            data: updated,
        });
    })
);

// =============================================================================
// DELETE /api/config/:category/:id
// Soft deactivate — sets is_active = FALSE. Admin only.
// Does NOT hard delete — preserves item for historical records that reference it.
// =============================================================================

router.delete('/:category/:id',
    requireRole('admin'),
    resolveCategory,
    param('id').isInt({ min: 1 }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const { table, col, label } = req.category;
        const id = parseInt(req.params.id, 10);

        const item = await dbUtils.getOne(
            `SELECT id, \`${col}\` AS name, is_active FROM \`${table}\` WHERE id = ?`,
            [id]
        );
        if (!item) {
            return res.status(404).json({ success: false, message: `${label} not found.` });
        }
        if (!item.is_active) {
            return res.status(400).json({ success: false, message: `${label} is already inactive.` });
        }

        await dbUtils.update(
            `UPDATE \`${table}\` SET is_active = FALSE WHERE id = ?`,
            [id]
        );

        await logAudit({
            table_name: table,
            record_id:  id,
            action:     'DELETE',
            old_values: item,
            new_values: { is_active: false },
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.json({
            success: true,
            message: `${label} '${item.name}' deactivated. It will no longer appear in dropdowns.`,
        });
    })
);

// =============================================================================
// POST /api/config/:category/:id/restore
// Reactivate a deactivated item. Admin only.
// =============================================================================

router.post('/:category/:id/restore',
    requireRole('admin'),
    resolveCategory,
    param('id').isInt({ min: 1 }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const { table, col, label } = req.category;
        const id = parseInt(req.params.id, 10);

        const item = await dbUtils.getOne(
            `SELECT id, \`${col}\` AS name, is_active FROM \`${table}\` WHERE id = ?`,
            [id]
        );
        if (!item) {
            return res.status(404).json({ success: false, message: `${label} not found.` });
        }
        if (item.is_active) {
            return res.status(400).json({ success: false, message: `${label} is already active.` });
        }

        await dbUtils.update(
            `UPDATE \`${table}\` SET is_active = TRUE WHERE id = ?`,
            [id]
        );

        await logAudit({
            table_name: table,
            record_id:  id,
            action:     'UPDATE',
            old_values: { is_active: false },
            new_values: { is_active: true },
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.json({
            success: true,
            message: `${label} '${item.name}' reactivated.`,
        });
    })
);

module.exports = router;
