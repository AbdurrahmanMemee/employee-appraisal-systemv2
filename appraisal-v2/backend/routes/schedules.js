// =============================================================================
// FILE:    routes/schedules.js
// PURPOSE: CRUD for scheduled appraisals (future appraisal bookings).
//
// ROLE ACCESS:
//   admin    — all schedules
//   manager  — schedules for own subordinates only
//   employee — own schedules (read-only)
//
// STATUS MACHINE:
//   Scheduled → Completed (when a real appraisal is linked)
//   Scheduled → Postponed → Scheduled (rescheduled)
//   Scheduled → Cancelled
//
// ENDPOINTS:
//   GET    /api/schedules              — list with filters
//   GET    /api/schedules/:id          — single schedule
//   POST   /api/schedules              — create (admin/manager)
//   PUT    /api/schedules/:id          — update date/notes/reminder (admin/manager)
//   POST   /api/schedules/:id/postpone — change date, mark Postponed (admin/manager)
//   POST   /api/schedules/:id/cancel   — cancel (admin/manager)
//   DELETE /api/schedules/:id          — hard delete (admin only)
// =============================================================================

const express  = require('express');
const { body, param, validationResult } = require('express-validator');
const router   = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole, getSubordinateIds } = require('../middleware/auth');
const { logAudit } = require('../utils/auditLogger');

// =============================================================================
// DATE HELPERS
// mysql2 returns DATE columns as JS Date objects, not strings.
// Always normalise to "YYYY-MM-DD" before string comparisons or JSON responses.
// =============================================================================
const toDateStr = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'string') return val.split('T')[0];
    return String(val);
};

// Normalise all date fields on a schedule row in-place
const normaliseDates = (s) => {
    s.scheduled_date  = toDateStr(s.scheduled_date);
    s.reminder_date   = toDateStr(s.reminder_date);
    s.created_at      = s.created_at  instanceof Date ? s.created_at.toISOString()  : s.created_at;
    s.updated_at      = s.updated_at  instanceof Date ? s.updated_at.toISOString()  : s.updated_at;
    return s;
};

// =============================================================================
// iCALENDAR INVITE HELPER
// Generates a standard .ics file string.  Works with Outlook, Google Calendar,
// Apple Calendar — recipient sees Accept / Tentative / Decline buttons.
// Usage: attach the returned string as "invite.ics" to a Nodemailer email.
// =============================================================================
const buildIcsInvite = ({ uid, summary, description, location, startDate, durationMins, organizerEmail, organizerName, attendeeEmail, attendeeName }) => {
    const pad  = (n) => String(n).padStart(2, '0');
    const fmtDate = (iso) => {
        // Convert YYYY-MM-DD to YYYYMMDD for iCal (all-day event format)
        return iso.replace(/-/g, '');
    };
    const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//EAS v2//Employee Appraisal System//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${uid}@eas-v2`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${fmtDate(startDate)}`,
        `DTEND;VALUE=DATE:${fmtDate(startDate)}`,   // all-day
        `SUMMARY:${summary}`,
        `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
        location ? `LOCATION:${location}` : null,
        `ORGANIZER;CN="${organizerName}":mailto:${organizerEmail}`,
        `ATTENDEE;CN="${attendeeName}";RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${attendeeEmail}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'BEGIN:VALARM',
        'TRIGGER:-P1D',          // remind 1 day before
        'ACTION:DISPLAY',
        'DESCRIPTION:Upcoming appraisal reminder',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
};

// ---- Validation -------------------------------------------------------------
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({
        success: false, message: 'Validation failed',
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
    next();
};

const STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'Postponed'];

// ---- Access scope -----------------------------------------------------------
const getAccessibleEmployeeIds = async (user) => {
    if (user.role === 'admin') return null;
    if (user.role === 'manager') {
        const ids = await getSubordinateIds(user.employee_id);
        return ids.length > 0 ? ids : [-1];
    }
    return user.employee_id ? [user.employee_id] : [-1];
};

const getScheduleInScope = async (id, user) => {
    const accessibleIds = await getAccessibleEmployeeIds(user);
    let sql = `
        SELECT s.*,
               CONCAT(e.first_name,' ',e.last_name) AS employee_name,
               e.department, e.job_title
        FROM   scheduled_appraisals s
        JOIN   employees e ON s.employee_id = e.id
        WHERE  s.id = ?`;
    const params = [id];
    if (accessibleIds !== null) {
        sql += ` AND s.employee_id IN (${accessibleIds.map(() => '?').join(',')})`;
        params.push(...accessibleIds);
    }
    return dbUtils.getOne(sql, params);
};

// =============================================================================
// GET /api/schedules
// =============================================================================
router.get('/', asyncHandler(async (req, res) => {
    const { employee_id, status, date_from, date_to, upcoming, page = 1, limit = 20 } = req.query;
    const limitInt  = Math.min(parseInt(limit, 10) || 20, 100);
    const pageInt   = Math.max(parseInt(page,  10) || 1, 1);
    const offsetInt = (pageInt - 1) * limitInt;

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const conditions = ['1=1'];
    const params     = [];

    if (accessibleIds !== null) {
        conditions.push(`s.employee_id IN (${accessibleIds.map(() => '?').join(',')})`);
        params.push(...accessibleIds);
    }
    if (employee_id) { conditions.push('s.employee_id = ?');    params.push(parseInt(employee_id, 10)); }
    if (status)      { conditions.push('s.status = ?');         params.push(status); }
    if (date_from)   { conditions.push('s.scheduled_date >= ?');params.push(date_from); }
    if (date_to)     { conditions.push('s.scheduled_date <= ?');params.push(date_to); }
    // Convenience: ?upcoming=true → Scheduled status from today onward
    if (upcoming === 'true') {
        conditions.push("s.status = 'Scheduled'");
        conditions.push('s.scheduled_date >= CURDATE()');
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const countRow = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM scheduled_appraisals s ${where}`, params
    );

    const { rows: schedules } = await dbUtils.query(
        `SELECT s.id, s.employee_id, s.scheduled_date, s.appraisal_type,
                s.status, s.notes, s.reminder_date, s.reminder_sent,
                s.scheduled_by_user_id, s.created_at,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name,
                e.department, e.job_title
         FROM   scheduled_appraisals s
         JOIN   employees e ON s.employee_id = e.id
         ${where}
         ORDER BY s.scheduled_date ASC
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
    );

    // Normalise dates and flag overdue (Scheduled but date has passed)
    const today = new Date().toISOString().split('T')[0];
    schedules.forEach(s => {
        normaliseDates(s);
        s.is_overdue = s.status === 'Scheduled' && s.scheduled_date < today;
    });

    res.json({
        success: true,
        data: {
            schedules,
            pagination: { page: pageInt, limit: limitInt, total: countRow.total, pages: Math.ceil(countRow.total / limitInt) },
        },
    });
}));

// =============================================================================
// GET /api/schedules/:id
// =============================================================================
router.get('/:id',
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const schedule = await getScheduleInScope(parseInt(req.params.id, 10), req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });
        normaliseDates(schedule);
        const today = new Date().toISOString().split('T')[0];
        schedule.is_overdue = schedule.status === 'Scheduled' && schedule.scheduled_date < today;
        res.json({ success: true, data: schedule });
    })
);

// =============================================================================
// POST /api/schedules
// =============================================================================
router.post('/',
    requireRole(['admin', 'manager']),
    [
        body('employee_id').isInt({ min: 1 }).withMessage('employee_id required'),
        body('scheduled_date').isISO8601().withMessage('scheduled_date must be YYYY-MM-DD'),
        body('appraisal_type').optional().trim().isLength({ max: 100 }),
        body('reminder_date').optional({ nullable: true }).isISO8601(),
        body('notes').optional({ nullable: true }),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const { employee_id, scheduled_date, appraisal_type = 'Annual Review', notes, reminder_date } = req.body;
        const empId = parseInt(employee_id, 10);

        const accessibleIds = await getAccessibleEmployeeIds(req.user);
        if (accessibleIds !== null && !accessibleIds.includes(empId)) {
            return res.status(403).json({ success: false, message: 'You do not have access to this employee.' });
        }

        const employee = await dbUtils.getOne(
            'SELECT id FROM employees WHERE id = ? AND is_active = TRUE', [empId]
        );
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Warn if another Scheduled appraisal already exists for this employee
        const existing = await dbUtils.getOne(
            "SELECT id FROM scheduled_appraisals WHERE employee_id = ? AND status = 'Scheduled'",
            [empId]
        );
        // We allow duplicates (manager may want two) but surface the warning
        const warning = existing
            ? 'Note: this employee already has a Scheduled appraisal.'
            : null;

        const result = await dbUtils.insert(
            `INSERT INTO scheduled_appraisals
                (employee_id, scheduled_date, appraisal_type, notes, reminder_date, scheduled_by_user_id, status)
             VALUES (?, ?, ?, ?, ?, ?, 'Scheduled')`,
            [empId, scheduled_date, appraisal_type, notes || null, reminder_date || null, req.user.id]
        );

        // Update employee's next_scheduled_appraisal cache field
        await dbUtils.update(
            `UPDATE employees e
             SET next_scheduled_appraisal = (
                 SELECT MIN(scheduled_date) FROM scheduled_appraisals
                 WHERE employee_id = e.id AND status = 'Scheduled'
             )
             WHERE id = ?`,
            [empId]
        );

        const created = await getScheduleInScope(result.insertId, req.user);
        normaliseDates(created);
        await logAudit({ table_name: 'scheduled_appraisals', record_id: result.insertId, action: 'INSERT', new_values: created, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.status(201).json({
            success: true,
            message: 'Appraisal scheduled.' + (warning ? ' ' + warning : ''),
            data: created,
        });
    })
);

// =============================================================================
// PUT /api/schedules/:id  — update date / notes / reminder
// =============================================================================
router.put('/:id',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    [
        body('scheduled_date').optional().isISO8601(),
        body('appraisal_type').optional().trim().notEmpty(),
        body('reminder_date').optional({ nullable: true }).isISO8601(),
        body('notes').optional({ nullable: true }),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const schedule = await getScheduleInScope(id, req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

        if (['Cancelled', 'Completed'].includes(schedule.status)) {
            return res.status(400).json({ success: false, message: `Cannot edit a ${schedule.status} schedule.` });
        }

        const { scheduled_date, appraisal_type, notes, reminder_date } = req.body;

        await dbUtils.update(
            `UPDATE scheduled_appraisals SET
                scheduled_date = ?,
                appraisal_type = ?,
                notes          = ?,
                reminder_date  = ?
             WHERE id = ?`,
            [
                scheduled_date  ?? schedule.scheduled_date,
                appraisal_type  ?? schedule.appraisal_type,
                notes           !== undefined ? (notes || null) : schedule.notes,
                reminder_date   !== undefined ? (reminder_date || null) : schedule.reminder_date,
                id,
            ]
        );

        // Refresh next_scheduled_appraisal cache on employee
        await dbUtils.update(
            `UPDATE employees e
             SET next_scheduled_appraisal = (
                 SELECT MIN(scheduled_date) FROM scheduled_appraisals
                 WHERE employee_id = e.id AND status = 'Scheduled'
             )
             WHERE id = ?`,
            [schedule.employee_id]
        );

        const updated = await getScheduleInScope(id, req.user);
        normaliseDates(updated);
        await logAudit({ table_name: 'scheduled_appraisals', record_id: id, action: 'UPDATE', old_values: schedule, new_values: updated, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Schedule updated.', data: updated });
    })
);

// =============================================================================
// POST /api/schedules/:id/postpone
// Moves date + sets status to Postponed.
// =============================================================================
router.post('/:id/postpone',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    body('new_date').isISO8601().withMessage('new_date (YYYY-MM-DD) is required'),
    body('reason').optional({ nullable: true }),
    handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const schedule = await getScheduleInScope(id, req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

        if (!['Scheduled', 'Postponed'].includes(schedule.status)) {
            return res.status(400).json({ success: false, message: `Cannot postpone a ${schedule.status} schedule.` });
        }

        const { new_date, reason } = req.body;
        const notes = reason
            ? `Postponed to ${new_date}. Reason: ${reason}${schedule.notes ? '\n' + schedule.notes : ''}`
            : schedule.notes;

        await dbUtils.update(
            `UPDATE scheduled_appraisals SET scheduled_date = ?, status = 'Postponed', notes = ? WHERE id = ?`,
            [new_date, notes, id]
        );

        await dbUtils.update(
            `UPDATE employees e SET next_scheduled_appraisal = (SELECT MIN(scheduled_date) FROM scheduled_appraisals WHERE employee_id = e.id AND status IN ('Scheduled','Postponed')) WHERE id = ?`,
            [schedule.employee_id]
        );

        const updated = await getScheduleInScope(id, req.user);
        normaliseDates(updated);
        await logAudit({ table_name: 'scheduled_appraisals', record_id: id, action: 'UPDATE', old_values: { status: schedule.status, scheduled_date: toDateStr(schedule.scheduled_date) }, new_values: { status: 'Postponed', scheduled_date: new_date }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: `Schedule postponed to ${new_date}.`, data: updated });
    })
);

// =============================================================================
// POST /api/schedules/:id/cancel
// =============================================================================
router.post('/:id/cancel',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const schedule = await getScheduleInScope(id, req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

        if (['Cancelled', 'Completed'].includes(schedule.status)) {
            return res.status(400).json({ success: false, message: `Schedule is already ${schedule.status}.` });
        }

        await dbUtils.update("UPDATE scheduled_appraisals SET status = 'Cancelled' WHERE id = ?", [id]);

        // Refresh employee cache
        await dbUtils.update(
            `UPDATE employees e SET next_scheduled_appraisal = (SELECT MIN(scheduled_date) FROM scheduled_appraisals WHERE employee_id = e.id AND status = 'Scheduled') WHERE id = ?`,
            [schedule.employee_id]
        );

        await logAudit({ table_name: 'scheduled_appraisals', record_id: id, action: 'UPDATE', old_values: { status: schedule.status }, new_values: { status: 'Cancelled' }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Schedule cancelled.' });
    })
);

// =============================================================================
// DELETE /api/schedules/:id  — admin only, hard delete
// =============================================================================
router.delete('/:id',
    requireRole('admin'),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const schedule = await getScheduleInScope(id, req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

        await dbUtils.update('DELETE FROM scheduled_appraisals WHERE id = ?', [id]);

        await dbUtils.update(
            `UPDATE employees e SET next_scheduled_appraisal = (SELECT MIN(scheduled_date) FROM scheduled_appraisals WHERE employee_id = e.id AND status = 'Scheduled') WHERE id = ?`,
            [schedule.employee_id]
        );

        await logAudit({ table_name: 'scheduled_appraisals', record_id: id, action: 'DELETE', old_values: schedule, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Schedule deleted.' });
    })
);

// =============================================================================
// POST /api/schedules/:id/invite
// Sends a calendar invite (.ics) to the employee's email.
//
// Requirements: SMTP settings in .env (see below). If not configured, returns
// the .ics file contents as JSON so the frontend can offer a manual download.
//
// Required .env variables for email sending:
//   SMTP_HOST=smtp.yourprovider.com
//   SMTP_PORT=587
//   SMTP_USER=noreply@yourcompany.com
//   SMTP_PASS=yourpassword
//   SMTP_FROM_NAME=Employee Appraisal System
//
// RBAC: admin + manager only
// =============================================================================
router.post('/:id/invite',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id       = parseInt(req.params.id, 10);
        const schedule = await getScheduleInScope(id, req.user);
        if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

        if (schedule.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Cannot send invite for a cancelled schedule.' });
        }

        normaliseDates(schedule);

        // Look up employee email
        const employee = await dbUtils.getOne(
            'SELECT id, first_name, last_name, email FROM employees WHERE id = ?',
            [schedule.employee_id]
        );
        if (!employee?.email) {
            return res.status(400).json({ success: false, message: 'Employee has no email address on record.' });
        }

        // Look up organiser (sender) details from users table
        const organiser = await dbUtils.getOne(
            'SELECT full_name, email FROM users WHERE id = ?',
            [req.user.id]
        );
        const organiserEmail = organiser?.email || process.env.SMTP_USER || 'noreply@company.com';
        const organiserName  = organiser?.full_name || req.user.username;

        const icsContent = buildIcsInvite({
            uid:            `schedule-${id}-${Date.now()}`,
            summary:        `${schedule.appraisal_type} — ${employee.first_name} ${employee.last_name}`,
            description:    schedule.notes || `Your ${schedule.appraisal_type} has been scheduled.`,
            location:       req.body.location || '',
            startDate:      schedule.scheduled_date,
            organizerEmail: organiserEmail,
            organizerName:  organiserName,
            attendeeEmail:  employee.email,
            attendeeName:   `${employee.first_name} ${employee.last_name}`,
        });

        // If SMTP is configured, send the email with .ics attachment
        const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

        if (smtpConfigured) {
            try {
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                    host:   process.env.SMTP_HOST,
                    port:   parseInt(process.env.SMTP_PORT) || 587,
                    secure: parseInt(process.env.SMTP_PORT) === 465,
                    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
                });

                await transporter.sendMail({
                    from:    `"${process.env.SMTP_FROM_NAME || 'Appraisal System'}" <${process.env.SMTP_USER}>`,
                    to:      `"${employee.first_name} ${employee.last_name}" <${employee.email}>`,
                    subject: `Calendar Invite: ${schedule.appraisal_type} on ${schedule.scheduled_date}`,
                    text:    `Hi ${employee.first_name},\n\nYour ${schedule.appraisal_type} has been scheduled for ${schedule.scheduled_date}.\n\nPlease find your calendar invite attached.\n\n${schedule.notes || ''}`,
                    attachments: [{
                        filename:    'appraisal-invite.ics',
                        content:     icsContent,
                        contentType: 'text/calendar; method=REQUEST',
                    }],
                });

                await logAudit({ table_name: 'scheduled_appraisals', record_id: id, action: 'UPDATE', old_values: null, new_values: { invite_sent_to: employee.email }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

                return res.json({
                    success: true,
                    message: `Calendar invite sent to ${employee.email}.`,
                    data: { sent_to: employee.email, scheduled_date: schedule.scheduled_date },
                });
            } catch (emailErr) {
                // Email failed — fall through and return .ics for manual download
                console.error('[invite] Email send failed:', emailErr.message);
                return res.status(500).json({
                    success: false,
                    message: `Email delivery failed: ${emailErr.message}. Use the ics_content to offer a manual download.`,
                    data: { ics_content: icsContent },
                });
            }
        }

        // SMTP not configured — return the .ics content for the frontend to download
        return res.json({
            success: true,
            message: 'SMTP not configured. Use ics_content to offer a manual .ics download.',
            data: {
                ics_content:    icsContent,
                filename:       'appraisal-invite.ics',
                scheduled_date: schedule.scheduled_date,
                employee_email: employee.email,
            },
        });
    })
);

module.exports = router;
