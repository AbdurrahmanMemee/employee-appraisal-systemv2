// =============================================================================
// FILE:    routes/employees.js
// PURPOSE: All CRUD operations for employees with role-based access control.
//
// ROLE ACCESS RULES (enforced on every endpoint):
//   admin    — sees and edits all employees
//   manager  — sees/edits own direct reports + all subordinates (recursive)
//   employee — sees own record only, cannot edit anything
//
// ENDPOINTS:
//   GET    /api/employees              — list with search/filter/pagination
//   GET    /api/employees/stats        — overview stats (admin + manager only)
//   GET    /api/employees/:id          — single employee
//   GET    /api/employees/:id/summary  — employee + recent meetings/appraisals/incidents
//   POST   /api/employees              — create (admin + manager only)
//   PUT    /api/employees/:id          — update (admin + manager only)
//   DELETE /api/employees/:id          — soft deactivate (admin only)
//   POST   /api/employees/:id/restore  — reactivate (admin only)
// =============================================================================

const express    = require('express');
const { body, param, validationResult } = require('express-validator');
const router     = express.Router();
const { dbUtils, pool } = require('../config/database');
const { asyncHandler }  = require('../middleware/errorHandler');
const { requireRole, getSubordinateIds, clearInvalidationCache } = require('../middleware/auth');
const { logAudit }      = require('../utils/auditLogger');

// ---- Validation helpers -----------------------------------------------------

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

// Reusable validation rules for create/update
const employeeBodyRules = [
    body('first_name')
        .trim().notEmpty().withMessage('First name is required')
        .isLength({ max: 100 }).withMessage('First name max 100 characters')
        .matches(/^[a-zA-Z\s'-]+$/).withMessage('First name: letters, spaces, hyphens and apostrophes only'),

    body('last_name')
        .trim().notEmpty().withMessage('Last name is required')
        .isLength({ max: 100 }).withMessage('Last name max 100 characters')
        .matches(/^[a-zA-Z\s'-]+$/).withMessage('Last name: letters, spaces, hyphens and apostrophes only'),

    body('employee_id')
        .optional()
        .trim()
        .isLength({ max: 20 }).withMessage('Employee ID max 20 characters'),

    body('department')
        .trim().notEmpty().withMessage('Department is required')
        .isLength({ max: 100 }),

    body('job_title')
        .trim().notEmpty().withMessage('Job title is required')
        .isLength({ max: 150 }),

    body('email')
        .optional({ nullable: true, checkFalsy: true })
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 150 }),

    body('phone')
        .optional({ nullable: true, checkFalsy: true })
        .matches(/^[\+]?[0-9\s\-\(\)]{7,30}$/).withMessage('Invalid phone number'),

    body('start_date')
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601().withMessage('Start date must be YYYY-MM-DD'),

    body('manager_id')
        .optional({ nullable: true })
        .isInt({ min: 1 }).withMessage('manager_id must be a positive integer'),

    body('employee_number')
        .optional({ nullable: true })
        .isInt({ min: 1 }).withMessage('Employee number must be a positive integer'),
];

// ---- Access scope helper -----------------------------------------------------
// Returns a WHERE clause fragment + params array scoped to what this user can see.
// admin    → no filter (sees all)
// manager  → WHERE e.id IN (subordinate ids)
// employee → WHERE e.id = their own employee_id

const buildAccessScope = async (user) => {
    if (user.role === 'admin') {
        return { clause: '', params: [] };
    }

    if (user.role === 'manager') {
        const ids = await getSubordinateIds(user.employee_id);
        if (ids.length === 0) {
            // Manager with no subordinates yet — return impossible condition
            return { clause: 'AND e.id = -1', params: [] };
        }
        const placeholders = ids.map(() => '?').join(',');
        return { clause: `AND e.id IN (${placeholders})`, params: ids };
    }

    if (user.role === 'employee') {
        if (!user.employee_id) {
            return { clause: 'AND e.id = -1', params: [] };
        }
        return { clause: 'AND e.id = ?', params: [user.employee_id] };
    }

    return { clause: 'AND e.id = -1', params: [] };
};

// ---- Auto-generate employee_id display code ---------------------------------
const generateEmployeeId = async () => {
    // Find the highest existing numeric suffix e.g. EMP-0042 → next is EMP-0043
    const latest = await dbUtils.getOne(
        `SELECT employee_id FROM employees
         WHERE employee_id REGEXP '^EMP-[0-9]+$'
         ORDER BY CAST(SUBSTRING(employee_id, 5) AS UNSIGNED) DESC
         LIMIT 1`
    );
    if (!latest) return 'EMP-0001';
    const num = parseInt(latest.employee_id.split('-')[1], 10) + 1;
    return `EMP-${String(num).padStart(4, '0')}`;
};

// =============================================================================
// GET /api/employees
// Lists employees visible to the requesting user.
// Supports: search, department, active filter, pagination.
// =============================================================================

router.get('/', asyncHandler(async (req, res) => {
    const {
        page       = 1,
        limit      = 50,
        search,
        department,
        manager_id,
        active     = 'true',
    } = req.query;

    const limitInt  = Math.min(parseInt(limit,  10) || 50, 200); // cap at 200
    const pageInt   = Math.max(parseInt(page,   10) || 1, 1);
    const offsetInt = (pageInt - 1) * limitInt;

    // Build access scope based on role
    const scope = await buildAccessScope(req.user);

    // Build WHERE clause
    // Note: scope.clause is empty string for admin (no filter needed).
    // Only add it to conditions if non-empty to avoid invalid SQL: "WHERE 1=1 AND "
    const conditions = ['1=1'];
    if (scope.clause) conditions.push(scope.clause.replace(/^AND /, ''));
    const params     = [...scope.params];

    if (active !== 'all') {
        conditions.push('e.is_active = ?');
        params.push(active === 'true' ? 1 : 0);
    }

    if (search) {
        conditions.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_id LIKE ? OR e.department LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }

    if (department) {
        conditions.push('e.department = ?');
        params.push(department);
    }

    if (manager_id) {
        conditions.push('e.manager_id = ?');
        params.push(parseInt(manager_id, 10));
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Count total matching rows
    const countRow = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM employees e ${where}`,
        params
    );

    // Fetch page
    // NOTE: LIMIT and OFFSET are interpolated directly (not bound params) because
    // mysql2's pool.execute() prepared statement protocol does not accept JS integers
    // for LIMIT/OFFSET — it throws "Incorrect arguments to mysqld_stmt_execute".
    // This is safe because limitInt and offsetInt are always parseInt'd integers above.
    const { rows: employees } = await dbUtils.query(
        `SELECT
            e.id,
            e.employee_number,
            e.employee_id,
            e.first_name,
            e.last_name,
            CONCAT(e.first_name, ' ', e.last_name)  AS full_name,
            e.email,
            e.phone,
            e.department,
            e.job_title,
            e.start_date,
            e.manager_id,
            CONCAT(m.first_name, ' ', m.last_name)  AS manager_name,
            e.last_meeting_date,
            e.last_appraisal_date,
            e.next_scheduled_appraisal,
            e.average_rating,
            e.is_active,
            CASE
                WHEN e.next_scheduled_appraisal IS NULL                              THEN 'Not Scheduled'
                WHEN e.next_scheduled_appraisal < CURDATE()                          THEN 'Overdue'
                WHEN e.next_scheduled_appraisal <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Due Soon'
                ELSE 'Scheduled'
            END AS appraisal_status
         FROM employees e
         LEFT JOIN employees m ON e.manager_id = m.id
         ${where}
         ORDER BY e.last_name, e.first_name
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
    );

    res.json({
        success: true,
        data: {
            employees,
            pagination: {
                page:  pageInt,
                limit: limitInt,
                total: countRow.total,
                pages: Math.ceil(countRow.total / limitInt),
            },
        },
    });
}));

// =============================================================================
// GET /api/employees/stats
// Summary statistics. Admin sees all, manager sees their team only.
// Employee role blocked — they have no need for team stats.
// =============================================================================

router.get('/stats', requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
    const scope = await buildAccessScope(req.user);
    const where = scope.clause ? `WHERE ${scope.clause.replace(/^AND /, '')}` : '';

    const stats = await dbUtils.getOne(
        `SELECT
            COUNT(*)                                                                    AS total_employees,
            SUM(e.is_active)                                                            AS active_employees,
            COUNT(*) - SUM(e.is_active)                                                 AS inactive_employees,
            ROUND(AVG(e.average_rating), 2)                                             AS avg_rating,
            SUM(CASE WHEN e.next_scheduled_appraisal < CURDATE()
                      AND e.is_active = 1 THEN 1 ELSE 0 END)                           AS overdue_appraisals,
            SUM(CASE WHEN e.next_scheduled_appraisal BETWEEN CURDATE()
                      AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
                      AND e.is_active = 1 THEN 1 ELSE 0 END)                           AS upcoming_appraisals,
            SUM(CASE WHEN e.last_meeting_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                      AND e.is_active = 1 THEN 1 ELSE 0 END)                           AS meetings_last_30_days
         FROM employees e
         ${where}`,
        scope.params
    );

    res.json({ success: true, data: stats });
}));

// =============================================================================
// GET /api/employees/:id
// Single employee. Access check: is this employee in the user's visible scope?
// =============================================================================

router.get('/:id',
    param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer'),
    handleValidation,
    asyncHandler(async (req, res) => {
        const id    = parseInt(req.params.id, 10);
        const scope = await buildAccessScope(req.user);

        const employee = await dbUtils.getOne(
            `SELECT
                e.*,
                CONCAT(e.first_name, ' ', e.last_name)  AS full_name,
                CONCAT(m.first_name, ' ', m.last_name)  AS manager_name
             FROM employees e
             LEFT JOIN employees m ON e.manager_id = m.id
             WHERE e.id = ? ${scope.clause}`,
            [id, ...scope.params]
        );

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        res.json({ success: true, data: employee });
    })
);

// =============================================================================
// GET /api/employees/:id/summary
// Employee record + last 5 of each: meetings, appraisals, incidents, schedules.
// =============================================================================

router.get('/:id/summary',
    param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer'),
    handleValidation,
    asyncHandler(async (req, res) => {
        const id    = parseInt(req.params.id, 10);
        const scope = await buildAccessScope(req.user);

        const employee = await dbUtils.getOne(
            `SELECT e.*, CONCAT(e.first_name,' ',e.last_name) AS full_name,
                    CONCAT(m.first_name,' ',m.last_name) AS manager_name
             FROM employees e
             LEFT JOIN employees m ON e.manager_id = m.id
             WHERE e.id = ? ${scope.clause}`,
            [id, ...scope.params]
        );

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Fetch recent activity in parallel
        const [meetings, appraisals, incidents, schedules] = await Promise.all([
            dbUtils.query(
                'SELECT id, meeting_date, meeting_type, brief_note, meeting_conclusion FROM meetings WHERE employee_id = ? ORDER BY meeting_date DESC LIMIT 5',
                [id]
            ),
            dbUtils.query(
                'SELECT id, appraisal_date, overall_rating, status FROM appraisals WHERE employee_id = ? ORDER BY appraisal_date DESC LIMIT 5',
                [id]
            ),
            dbUtils.query(
                'SELECT id, incident_date, incident_type, severity FROM incident_logs WHERE employee_id = ? ORDER BY incident_date DESC LIMIT 5',
                [id]
            ),
            dbUtils.query(
                `SELECT id, scheduled_date, appraisal_type, status
                 FROM scheduled_appraisals
                 WHERE employee_id = ? AND status = 'Scheduled'
                 ORDER BY scheduled_date ASC LIMIT 5`,
                [id]
            ),
        ]);

        res.json({
            success: true,
            data: {
                employee,
                recentMeetings:    meetings.rows,
                recentAppraisals:  appraisals.rows,
                recentIncidents:   incidents.rows,
                upcomingSchedules: schedules.rows,
            },
        });
    })
);

// =============================================================================
// POST /api/employees
// Create a new employee. Admin and manager only.
// Manager can only set manager_id to themselves or one of their subordinates.
// =============================================================================

router.post('/',
    requireRole(['admin', 'manager']),
    employeeBodyRules,
    handleValidation,
    asyncHandler(async (req, res) => {
        const {
            first_name, last_name, employee_number,
            department, job_title, email, phone, start_date,
            manager_id,
        } = req.body;

        // If manager role, validate they can only assign employees under their tree
        if (req.user.role === 'manager' && manager_id) {
            const subordinateIds = await getSubordinateIds(req.user.employee_id);
            const allowedIds = [req.user.employee_id, ...subordinateIds];
            if (!allowedIds.includes(parseInt(manager_id, 10))) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only assign employees to managers within your team.',
                });
            }
        }

        // Check employee_number uniqueness if provided
        if (employee_number) {
            const taken = await dbUtils.exists(
                'SELECT 1 FROM employees WHERE employee_number = ?',
                [employee_number]
            );
            if (taken) {
                return res.status(409).json({
                    success: false,
                    message: `Employee number ${employee_number} is already in use.`,
                });
            }
        }

        // Auto-generate display code
        let employeeId = req.body.employee_id;
        if (!employeeId) {
            employeeId = await generateEmployeeId();
        } else {
            // Check uniqueness of provided code
            const taken = await dbUtils.exists(
                'SELECT 1 FROM employees WHERE employee_id = ?',
                [employeeId]
            );
            if (taken) {
                return res.status(409).json({
                    success: false,
                    message: `Employee ID '${employeeId}' is already in use.`,
                });
            }
        }

        // Look up department_id and job_title_id for FK columns
        const deptRow  = await dbUtils.getOne('SELECT id FROM departments WHERE name = ? AND is_active = 1', [department]);
        const titleRow = await dbUtils.getOne('SELECT id FROM job_titles WHERE name = ? AND is_active = 1', [job_title]);

        const { insertId } = await dbUtils.insert(
            `INSERT INTO employees
                (first_name, last_name, employee_id, employee_number,
                 department, department_id, job_title, job_title_id,
                 email, phone, start_date, manager_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                first_name.trim(),
                last_name.trim(),
                employeeId,
                employee_number || null,
                department,
                deptRow?.id  || null,
                job_title,
                titleRow?.id || null,
                email      || null,
                phone      || null,
                start_date || null,
                manager_id || null,
            ]
        );

        const newEmployee = await dbUtils.getOne(
            'SELECT * FROM employees WHERE id = ?', [insertId]
        );

        await logAudit({
            table_name: 'employees',
            record_id:  insertId,
            action:     'INSERT',
            new_values: newEmployee,
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.status(201).json({
            success: true,
            message: 'Employee created successfully.',
            data: newEmployee,
        });
    })
);

// =============================================================================
// PUT /api/employees/:id
// Update an employee. Admin and manager only.
// Manager cannot move an employee outside their own team.
// =============================================================================

router.put('/:id',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    employeeBodyRules,
    handleValidation,
    asyncHandler(async (req, res) => {
        const id    = parseInt(req.params.id, 10);
        const scope = await buildAccessScope(req.user);

        // Fetch existing — scoped so manager can't edit outside their tree
        const existing = await dbUtils.getOne(
            `SELECT * FROM employees e WHERE e.id = ? ${scope.clause}`,
            [id, ...scope.params]
        );

        if (!existing) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const {
            first_name, last_name, employee_number,
            department, job_title, email, phone,
            start_date, manager_id,
        } = req.body;

        // Validate new employee_number uniqueness (if changing it)
        if (employee_number && employee_number !== existing.employee_number) {
            const taken = await dbUtils.exists(
                'SELECT 1 FROM employees WHERE employee_number = ? AND id != ?',
                [employee_number, id]
            );
            if (taken) {
                return res.status(409).json({
                    success: false,
                    message: `Employee number ${employee_number} is already in use.`,
                });
            }
        }

        // Prevent circular manager reference (assigning someone as their own manager)
        if (manager_id && parseInt(manager_id, 10) === id) {
            return res.status(400).json({
                success: false,
                message: 'An employee cannot be their own manager.',
            });
        }

        // Prevent assigning a subordinate as manager (would create a cycle)
        if (manager_id) {
            const subordinateIds = await getSubordinateIds(id);
            if (subordinateIds.includes(parseInt(manager_id, 10))) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot assign a subordinate as a manager — this would create a circular hierarchy.',
                });
            }
        }

        // Look up FK ids
        const newDept  = department || existing.department;
        const newTitle = job_title  || existing.job_title;
        const deptRow  = await dbUtils.getOne('SELECT id FROM departments WHERE name = ? AND is_active = 1', [newDept]);
        const titleRow = await dbUtils.getOne('SELECT id FROM job_titles WHERE name = ? AND is_active = 1', [newTitle]);

        await dbUtils.update(
            `UPDATE employees SET
                first_name    = ?,
                last_name     = ?,
                employee_number = ?,
                department    = ?,
                department_id = ?,
                job_title     = ?,
                job_title_id  = ?,
                email         = ?,
                phone         = ?,
                start_date    = ?,
                manager_id    = ?
             WHERE id = ?`,
            [
                (first_name  || existing.first_name).trim(),
                (last_name   || existing.last_name).trim(),
                employee_number !== undefined ? employee_number : existing.employee_number,
                newDept,
                deptRow?.id  || existing.department_id,
                newTitle,
                titleRow?.id || existing.job_title_id,
                email      !== undefined ? (email      || null) : existing.email,
                phone      !== undefined ? (phone      || null) : existing.phone,
                start_date !== undefined ? (start_date || null) : existing.start_date,
                manager_id !== undefined ? (manager_id || null) : existing.manager_id,
                id,
            ]
        );

        const updated = await dbUtils.getOne('SELECT * FROM employees WHERE id = ?', [id]);

        await logAudit({
            table_name: 'employees',
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
            message: 'Employee updated successfully.',
            data: updated,
        });
    })
);

// =============================================================================
// DELETE /api/employees/:id — soft deactivate (admin only)
// Sets is_active = FALSE. Does not delete the record or any linked history.
// =============================================================================

router.delete('/:id',
    requireRole('admin'),
    param('id').isInt({ min: 1 }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        const employee = await dbUtils.getOne(
            'SELECT * FROM employees WHERE id = ?', [id]
        );

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        if (!employee.is_active) {
            return res.status(400).json({ success: false, message: 'Employee is already inactive.' });
        }

        await dbUtils.update(
            'UPDATE employees SET is_active = FALSE WHERE id = ?', [id]
        );

        // If this employee has a user account, invalidate their token too
        const userAccount = await dbUtils.getOne(
            'SELECT id FROM users WHERE employee_id = ? AND is_active = TRUE', [id]
        );
        if (userAccount) {
            await pool.execute(
                `INSERT INTO invalidated_tokens (user_id, reason)
                 VALUES (?, 'employee_deactivated')
                 ON DUPLICATE KEY UPDATE invalidated_at = NOW()`,
                [userAccount.id]
            );
            clearInvalidationCache(userAccount.id);
        }

        await logAudit({
            table_name: 'employees',
            record_id:  id,
            action:     'DELETE',
            old_values: employee,
            new_values: { is_active: false },
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.json({ success: true, message: 'Employee deactivated successfully.' });
    })
);

// =============================================================================
// POST /api/employees/:id/restore — reactivate (admin only)
// =============================================================================

router.post('/:id/restore',
    requireRole('admin'),
    param('id').isInt({ min: 1 }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        const employee = await dbUtils.getOne(
            'SELECT * FROM employees WHERE id = ?', [id]
        );

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        if (employee.is_active) {
            return res.status(400).json({ success: false, message: 'Employee is already active.' });
        }

        await dbUtils.update(
            'UPDATE employees SET is_active = TRUE WHERE id = ?', [id]
        );

        // Remove from invalidated_tokens if present and flush cache
        const userAccount = await dbUtils.getOne(
            'SELECT id FROM users WHERE employee_id = ?', [id]
        );
        if (userAccount) {
            await pool.execute(
                'DELETE FROM invalidated_tokens WHERE user_id = ?',
                [userAccount.id]
            );
            clearInvalidationCache(userAccount.id);
        }

        await logAudit({
            table_name: 'employees',
            record_id:  id,
            action:     'UPDATE',
            old_values: { is_active: false },
            new_values: { is_active: true },
            changed_by: req.user.username,
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
        });

        res.json({ success: true, message: 'Employee reactivated successfully.' });
    })
);

module.exports = router;
