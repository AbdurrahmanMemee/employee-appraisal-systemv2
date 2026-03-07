// =============================================================================
// FILE:    routes/dashboard.js
// PURPOSE: Aggregated read-only stats for the user and management dashboards.
//
// ROLE ACCESS:
//   All authenticated roles can call these endpoints.
//   Data returned is scoped to the caller's role exactly as other routes:
//     admin    — org-wide stats
//     manager  — stats for own subordinates only
//     employee — own stats only
//
// ENDPOINTS:
//   GET /api/dashboard/stats              — headline numbers (cards at top of dashboard)
//   GET /api/dashboard/upcoming           — upcoming appraisals due in next N days
//   GET /api/dashboard/recent-activity    — last N meetings/appraisals/incidents
//   GET /api/dashboard/department-stats   — per-department breakdown (admin + manager)
//   GET /api/dashboard/performance-trends — avg ratings over last N months (admin + manager)
// =============================================================================

const express = require('express');
const router  = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { getSubordinateIds } = require('../middleware/auth');

// ---- Access scope (shared helper) ------------------------------------------
const getAccessibleEmployeeIds = async (user) => {
    if (user.role === 'admin') return null;
    if (user.role === 'manager') {
        const ids = await getSubordinateIds(user.employee_id);
        return ids.length > 0 ? ids : [-1];
    }
    return user.employee_id ? [user.employee_id] : [-1];
};

// Build IN clause and params for employee_id scope
const scopeClause = (accessibleIds, alias = 'e') => {
    if (accessibleIds === null) return { clause: '', params: [] };
    const placeholders = accessibleIds.map(() => '?').join(',');
    return { clause: `AND ${alias}.id IN (${placeholders})`, params: [...accessibleIds] };
};

// =============================================================================
// GET /api/dashboard/stats
// Headline numbers: total employees, overdue appraisals, avg rating, open incidents
// =============================================================================
router.get('/stats', asyncHandler(async (req, res) => {
    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const { clause: empClause, params: empParams } = scopeClause(accessibleIds, 'e');

    // Total active employees in scope
    const empCount = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM employees e WHERE e.is_active = TRUE ${empClause}`,
        empParams
    );

    // Overdue scheduled appraisals (Scheduled status, date < today)
    const overdueCount = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM scheduled_appraisals sa
         JOIN employees e ON sa.employee_id = e.id
         WHERE sa.status = 'Scheduled' AND sa.scheduled_date < CURDATE()
         AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    // Upcoming in next 30 days
    const upcomingCount = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM scheduled_appraisals sa
         JOIN employees e ON sa.employee_id = e.id
         WHERE sa.status = 'Scheduled'
         AND sa.scheduled_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    // Average rating from completed appraisals
    const avgRating = await dbUtils.getOne(
        `SELECT ROUND(AVG(a.overall_rating), 2) AS avg FROM appraisals a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.status = 'Completed' AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    // Incidents logged this month
    const incidentsThisMonth = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM incident_logs il
         JOIN employees e ON il.employee_id = e.id
         WHERE YEAR(il.incident_date) = YEAR(CURDATE()) AND MONTH(il.incident_date) = MONTH(CURDATE())
         AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    // High/Critical incidents open (no resolution — just recent in last 90 days)
    const highSeverityCount = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM incident_logs il
         JOIN employees e ON il.employee_id = e.id
         WHERE il.severity IN ('High','Critical')
         AND il.incident_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
         AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    // Completed appraisals this year
    const appraisalsThisYear = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM appraisals a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.status = 'Completed' AND YEAR(a.appraisal_date) = YEAR(CURDATE())
         AND e.is_active = TRUE ${empClause}`,
        empParams
    );

    res.json({
        success: true,
        data: {
            total_employees:         empCount.total,
            overdue_appraisals:      overdueCount.total,
            upcoming_appraisals_30d: upcomingCount.total,
            average_rating:          avgRating.avg || null,
            incidents_this_month:    incidentsThisMonth.total,
            high_severity_incidents: highSeverityCount.total,
            appraisals_this_year:    appraisalsThisYear.total,
        },
    });
}));

// =============================================================================
// GET /api/dashboard/upcoming?days=30&limit=10
// Employees with scheduled appraisals coming up
// =============================================================================
router.get('/upcoming', asyncHandler(async (req, res) => {
    const days  = Math.min(parseInt(req.query.days,  10) || 30, 365);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const { clause: empClause, params: empParams } = scopeClause(accessibleIds, 'e');

    const { rows } = await dbUtils.query(
        `SELECT sa.id, sa.scheduled_date, sa.appraisal_type, sa.status,
                sa.reminder_date, sa.notes,
                e.id AS employee_id,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name,
                e.department, e.job_title,
                DATEDIFF(sa.scheduled_date, CURDATE()) AS days_until
         FROM   scheduled_appraisals sa
         JOIN   employees e ON sa.employee_id = e.id
         WHERE  sa.status = 'Scheduled'
         AND    sa.scheduled_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND    e.is_active = TRUE
         ${empClause}
         ORDER BY sa.scheduled_date ASC
         LIMIT ${limit}`,
        [days, ...empParams]
    );

    res.json({ success: true, data: rows });
}));

// =============================================================================
// GET /api/dashboard/recent-activity?limit=15
// Last N events across meetings, appraisals, incidents (unified feed)
// =============================================================================
router.get('/recent-activity', asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const inClause = accessibleIds !== null
        ? `AND employee_id IN (${accessibleIds.map(() => '?').join(',')})`
        : '';
    const scopeParams = accessibleIds !== null ? accessibleIds : [];

    // Fetch last N of each type, then merge and sort in JS
    const [meetings, appraisals, incidents] = await Promise.all([
        dbUtils.query(
            `SELECT id, employee_id, meeting_date AS event_date, meeting_type AS event_type,
                    brief_note AS summary, 'meeting' AS kind
             FROM meetings WHERE 1=1 ${inClause}
             ORDER BY meeting_date DESC LIMIT ${limit}`,
            scopeParams
        ),
        dbUtils.query(
            `SELECT id, employee_id, appraisal_date AS event_date, status AS event_type,
                    CONCAT('Rating: ', overall_rating) AS summary, 'appraisal' AS kind
             FROM appraisals WHERE 1=1 ${inClause}
             ORDER BY appraisal_date DESC LIMIT ${limit}`,
            scopeParams
        ),
        dbUtils.query(
            `SELECT id, employee_id, incident_date AS event_date, incident_type AS event_type,
                    severity AS summary, 'incident' AS kind
             FROM incident_logs WHERE 1=1 ${inClause}
             ORDER BY incident_date DESC LIMIT ${limit}`,
            scopeParams
        ),
    ]);

    // Merge employee names in one query
    const allEmpIds = [...new Set([
        ...meetings.rows.map(r => r.employee_id),
        ...appraisals.rows.map(r => r.employee_id),
        ...incidents.rows.map(r => r.employee_id),
    ])];

    let nameMap = {};
    if (allEmpIds.length > 0) {
        const { rows: empRows } = await dbUtils.query(
            `SELECT id, CONCAT(first_name,' ',last_name) AS name FROM employees WHERE id IN (${allEmpIds.map(() => '?').join(',')})`,
            allEmpIds
        );
        empRows.forEach(e => { nameMap[e.id] = e.name; });
    }

    const combined = [
        ...meetings.rows,
        ...appraisals.rows,
        ...incidents.rows,
    ]
    .map(r => ({ ...r, employee_name: nameMap[r.employee_id] || '' }))
    .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
    .slice(0, limit);

    res.json({ success: true, data: combined });
}));

// =============================================================================
// GET /api/dashboard/department-stats
// Per-department headcount + avg rating + overdue appraisals (admin + manager)
// =============================================================================
router.get('/department-stats', asyncHandler(async (req, res) => {
    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const { clause: empClause, params: empParams } = scopeClause(accessibleIds, 'e');

    const { rows } = await dbUtils.query(
        `SELECT
            e.department,
            COUNT(DISTINCT e.id)                                        AS headcount,
            ROUND(AVG(e.average_rating), 2)                            AS avg_rating,
            SUM(CASE WHEN sa.status = 'Scheduled'
                     AND sa.scheduled_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_appraisals,
            SUM(CASE WHEN il.severity IN ('High','Critical')
                     AND il.incident_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS high_incidents
         FROM employees e
         LEFT JOIN scheduled_appraisals sa ON sa.employee_id = e.id
         LEFT JOIN incident_logs il        ON il.employee_id  = e.id
         WHERE e.is_active = TRUE AND e.department IS NOT NULL
         ${empClause}
         GROUP BY e.department
         ORDER BY headcount DESC`,
        empParams
    );

    res.json({ success: true, data: rows });
}));

// =============================================================================
// GET /api/dashboard/performance-trends?months=12
// Average appraisal rating per month for the last N months (admin + manager)
// =============================================================================
router.get('/performance-trends', asyncHandler(async (req, res) => {
    const months = Math.min(parseInt(req.query.months, 10) || 12, 36);

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const { clause: empClause, params: empParams } = scopeClause(accessibleIds, 'e');

    const { rows } = await dbUtils.query(
        `SELECT
            DATE_FORMAT(a.appraisal_date, '%Y-%m') AS month,
            ROUND(AVG(a.overall_rating), 2)        AS avg_rating,
            COUNT(*)                                AS appraisal_count
         FROM appraisals a
         JOIN employees e ON a.employee_id = e.id
         WHERE a.status = 'Completed'
         AND   a.appraisal_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
         AND   e.is_active = TRUE
         ${empClause}
         GROUP BY DATE_FORMAT(a.appraisal_date, '%Y-%m')
         ORDER BY month ASC`,
        [months, ...empParams]
    );

    res.json({ success: true, data: rows });
}));

module.exports = router;
