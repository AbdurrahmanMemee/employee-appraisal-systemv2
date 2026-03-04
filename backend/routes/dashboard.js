// backend/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { dbUtils } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/dashboard/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const [employees, meetings, appraisals, incidents, schedules] = await Promise.all([
    dbUtils.query(`SELECT COUNT(*) as total, SUM(is_active) as active,
      AVG(average_employee_rating) as avg_rating FROM employees`),
    dbUtils.query('SELECT COUNT(*) as total FROM meetings'),
    dbUtils.query(`SELECT COUNT(*) as total,
      SUM(CASE WHEN appraisal_status='Completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN appraisal_status='In Progress' THEN 1 ELSE 0 END) as in_progress
      FROM appraisals`),
    dbUtils.query('SELECT COUNT(*) as total FROM incident_logs'),
    dbUtils.query(`SELECT COUNT(*) as total,
      SUM(CASE WHEN scheduled_date < CURDATE() AND status='Scheduled' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN scheduled_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status='Scheduled' THEN 1 ELSE 0 END) as upcoming
      FROM scheduled_appraisals`)
  ]);

  res.json({
    success: true,
    data: {
      employees: employees.rows[0],
      meetings: meetings.rows[0],
      appraisals: appraisals.rows[0],
      incidents: incidents.rows[0],
      schedules: schedules.rows[0]
    }
  });
}));

// GET /api/dashboard/recent-activities
router.get('/recent-activities', asyncHandler(async (req, res) => {
  const { rows: recentMeetings } = await dbUtils.query(
    `SELECT 'meeting' as type, m.meet_id as id, m.meeting_date as date, m.meeting_type as subtype,
      CONCAT(e.employee_name, ' ', e.employee_surname) as employee_name
     FROM meetings m JOIN employees e ON m.employee_number = e.employee_number
     ORDER BY m.created_date DESC LIMIT 5`
  );

  const { rows: recentAppraisals } = await dbUtils.query(
    `SELECT 'appraisal' as type, a.appr_id as id, a.appraisal_date as date,
      a.appraisal_status as subtype,
      CONCAT(e.employee_name, ' ', e.employee_surname) as employee_name,
      a.employee_rating as rating
     FROM appraisals a JOIN employees e ON a.employee_number = e.employee_number
     ORDER BY a.created_date DESC LIMIT 5`
  );

  const { rows: recentIncidents } = await dbUtils.query(
    `SELECT 'incident' as type, i.log_id as id, i.incident_log_date as date,
      i.incident_log_type as subtype, i.severity,
      CONCAT(e.employee_name, ' ', e.employee_surname) as employee_name
     FROM incident_logs i JOIN employees e ON i.employee_number = e.employee_number
     ORDER BY i.created_date DESC LIMIT 5`
  );

  // Combine and sort by date
  const activities = [...recentMeetings, ...recentAppraisals, ...recentIncidents]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  res.json({ success: true, data: activities });
}));

// GET /api/dashboard/performance-trends
router.get('/performance-trends', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(`
    SELECT 
      DATE_FORMAT(appraisal_date, '%Y-%m') as month,
      AVG(employee_rating) as avg_rating,
      COUNT(*) as appraisal_count
    FROM appraisals
    WHERE appraisal_status = 'Completed'
      AND appraisal_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(appraisal_date, '%Y-%m')
    ORDER BY month
  `);

  res.json({ success: true, data: rows });
}));

// GET /api/dashboard/department-stats
router.get('/department-stats', asyncHandler(async (req, res) => {
  const { rows } = await dbUtils.query(`
    SELECT 
      e.department,
      COUNT(*) as employee_count,
      AVG(e.average_employee_rating) as avg_rating,
      SUM(CASE WHEN e.next_scheduled_appraisal < CURDATE() THEN 1 ELSE 0 END) as overdue_appraisals
    FROM employees e
    WHERE e.is_active = 1
    GROUP BY e.department
    ORDER BY e.department
  `);

  res.json({ success: true, data: rows });
}));

module.exports = router;
