// =============================================================================
// FILE:    routes/meetings.js
// PURPOSE: CRUD for meeting records with PDF attachment support.
//
// ROLE ACCESS RULES:
//   admin    — all meetings for all employees
//   manager  — meetings for own subordinates only
//   employee — own meetings only (read-only)
//
// ENDPOINTS:
//   GET    /api/meetings                    — list (filtered by role)
//   GET    /api/meetings/:id                — single meeting
//   POST   /api/meetings                    — create + optional PDF upload
//   PUT    /api/meetings/:id                — update text fields
//   POST   /api/meetings/:id/attachment     — upload/replace PDF on existing meeting
//   DELETE /api/meetings/:id/attachment     — remove PDF from meeting
//   DELETE /api/meetings/:id                — delete meeting (admin only)
//
// PDF UPLOAD:
//   Use multipart/form-data with field name 'attachment'.
//   All other fields sent as regular form fields (not JSON) when uploading.
//   When not uploading a file, use application/json as normal.
// =============================================================================

const express  = require('express');
const { body, param, validationResult } = require('express-validator');
const path     = require('path');
const router   = express.Router();
const { dbUtils } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireRole, getSubordinateIds } = require('../middleware/auth');
const { uploadPdf, handleUploadError, deleteUploadedFile, buildAttachmentPath } = require('../middleware/upload');
const { logAudit } = require('../utils/auditLogger');

// ---- Validation -------------------------------------------------------------
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        if (req.file) deleteUploadedFile(req.file.path);
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

const meetingBodyRules = [
    body('employee_id').isInt({ min: 1 }).withMessage('employee_id must be a positive integer'),
    body('meeting_date').notEmpty().withMessage('meeting_date is required').isISO8601().withMessage('meeting_date must be YYYY-MM-DD'),
    body('meeting_type').trim().notEmpty().withMessage('meeting_type is required').isLength({ max: 100 }),
    body('meeting_conclusion').trim().notEmpty().withMessage('meeting_conclusion is required'),
    body('people_present').optional({ nullable: true, checkFalsy: true }).isLength({ max: 500 }),
    body('brief_note').optional({ nullable: true, checkFalsy: true }),
];

// ---- Access scope -----------------------------------------------------------
const getAccessibleEmployeeIds = async (user) => {
    if (user.role === 'admin') return null;
    if (user.role === 'manager') {
        const ids = await getSubordinateIds(user.employee_id);
        return ids.length > 0 ? ids : [-1];
    }
    if (user.role === 'employee') {
        return user.employee_id ? [user.employee_id] : [-1];
    }
    return [-1];
};

// ---- Scoped single meeting fetch --------------------------------------------
const getMeetingInScope = async (meetingId, user) => {
    const accessibleIds = await getAccessibleEmployeeIds(user);
    let sql = `
        SELECT m.*,
               CONCAT(e.first_name,' ',e.last_name) AS employee_name,
               e.department, e.job_title
        FROM   meetings m
        JOIN   employees e ON m.employee_id = e.id
        WHERE  m.id = ?`;
    const params = [meetingId];
    if (accessibleIds !== null) {
        const placeholders = accessibleIds.map(() => '?').join(',');
        sql += ` AND m.employee_id IN (${placeholders})`;
        params.push(...accessibleIds);
    }
    return dbUtils.getOne(sql, params);
};

// =============================================================================
// GET /api/meetings
// =============================================================================
router.get('/', asyncHandler(async (req, res) => {
    const { employee_id, meeting_type, date_from, date_to, page = 1, limit = 20 } = req.query;
    const limitInt  = Math.min(parseInt(limit, 10) || 20, 100);
    const pageInt   = Math.max(parseInt(page,  10) || 1, 1);
    const offsetInt = (pageInt - 1) * limitInt;

    const accessibleIds = await getAccessibleEmployeeIds(req.user);
    const conditions = ['1=1'];
    const params     = [];

    if (accessibleIds !== null) {
        const placeholders = accessibleIds.map(() => '?').join(',');
        conditions.push(`m.employee_id IN (${placeholders})`);
        params.push(...accessibleIds);
    }
    if (employee_id)  { conditions.push('m.employee_id = ?');   params.push(parseInt(employee_id, 10)); }
    if (meeting_type) { conditions.push('m.meeting_type = ?');   params.push(meeting_type); }
    if (date_from)    { conditions.push('m.meeting_date >= ?');  params.push(date_from); }
    if (date_to)      { conditions.push('m.meeting_date <= ?');  params.push(date_to); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const countRow = await dbUtils.getOne(
        `SELECT COUNT(*) AS total FROM meetings m ${where}`, params
    );

    const { rows: meetings } = await dbUtils.query(
        `SELECT m.id, m.employee_id, m.meeting_date, m.meeting_type,
                m.people_present, m.brief_note, m.meeting_conclusion,
                m.pdf_attachment_path, m.created_by_user_id, m.created_at,
                CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.department
         FROM   meetings m
         JOIN   employees e ON m.employee_id = e.id
         ${where}
         ORDER BY m.meeting_date DESC
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
    );

    res.json({
        success: true,
        data: {
            meetings,
            pagination: { page: pageInt, limit: limitInt, total: countRow.total, pages: Math.ceil(countRow.total / limitInt) },
        },
    });
}));

// =============================================================================
// GET /api/meetings/:id
// =============================================================================
router.get('/:id',
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const meeting = await getMeetingInScope(parseInt(req.params.id, 10), req.user);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });
        res.json({ success: true, data: meeting });
    })
);

// =============================================================================
// POST /api/meetings
// =============================================================================
router.post('/',
    requireRole(['admin', 'manager']),
    uploadPdf, handleUploadError,
    meetingBodyRules, handleValidation,
    asyncHandler(async (req, res) => {
        const { employee_id, meeting_date, meeting_type, people_present, brief_note, detailed_summary, meeting_conclusion } = req.body;
        const empId = parseInt(employee_id, 10);

        const accessibleIds = await getAccessibleEmployeeIds(req.user);
        if (accessibleIds !== null && !accessibleIds.includes(empId)) {
            if (req.file) deleteUploadedFile(req.file.path);
            return res.status(403).json({ success: false, message: 'You do not have access to this employee.' });
        }

        const employee = await dbUtils.getOne('SELECT id FROM employees WHERE id = ? AND is_active = TRUE', [empId]);
        if (!employee) {
            if (req.file) deleteUploadedFile(req.file.path);
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const typeRow = await dbUtils.getOne('SELECT id FROM meeting_types WHERE name = ? AND is_active = 1', [meeting_type]);
        const attachmentPath = req.file ? buildAttachmentPath(req.file.path) : null;

        let insertId;
        try {
            const result = await dbUtils.insert(
                `INSERT INTO meetings (employee_id, meeting_date, meeting_type_id, meeting_type, people_present, brief_note, detailed_summary, meeting_conclusion, pdf_attachment_path, created_by_user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [empId, meeting_date, typeRow?.id || null, meeting_type, people_present || null, brief_note || null, detailed_summary || null, meeting_conclusion, attachmentPath, req.user.id]
            );
            insertId = result.insertId;
        } catch (err) {
            if (req.file) deleteUploadedFile(req.file.path);
            throw err;
        }

        // Update employee last_meeting_date cache
        await dbUtils.update(
            `UPDATE employees SET last_meeting_date = GREATEST(COALESCE(last_meeting_date, '1970-01-01'), ?) WHERE id = ?`,
            [meeting_date, empId]
        );

        const newMeeting = await dbUtils.getOne('SELECT * FROM meetings WHERE id = ?', [insertId]);

        await logAudit({ table_name: 'meetings', record_id: insertId, action: 'INSERT', new_values: newMeeting, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.status(201).json({ success: true, message: 'Meeting created successfully.', data: newMeeting });
    })
);

// =============================================================================
// PUT /api/meetings/:id
// =============================================================================
router.put('/:id',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }),
    [
        body('meeting_date').optional().isISO8601().withMessage('meeting_date must be YYYY-MM-DD'),
        body('meeting_type').optional().trim().notEmpty(),
        body('meeting_conclusion').optional().trim().notEmpty(),
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
        const id      = parseInt(req.params.id, 10);
        const meeting = await getMeetingInScope(id, req.user);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });

        const { meeting_date, meeting_type, people_present, brief_note, detailed_summary, meeting_conclusion } = req.body;

        let typeId = meeting.meeting_type_id;
        if (meeting_type && meeting_type !== meeting.meeting_type) {
            const typeRow = await dbUtils.getOne('SELECT id FROM meeting_types WHERE name = ? AND is_active = 1', [meeting_type]);
            typeId = typeRow?.id || null;
        }

        await dbUtils.update(
            `UPDATE meetings SET meeting_date=?, meeting_type_id=?, meeting_type=?, people_present=?, brief_note=?, detailed_summary=?, meeting_conclusion=? WHERE id=?`,
            [
                meeting_date       ?? meeting.meeting_date,
                typeId,
                meeting_type       ?? meeting.meeting_type,
                people_present     !== undefined ? (people_present     || null) : meeting.people_present,
                brief_note         !== undefined ? (brief_note         || null) : meeting.brief_note,
                detailed_summary   !== undefined ? (detailed_summary   || null) : meeting.detailed_summary,
                meeting_conclusion ?? meeting.meeting_conclusion,
                id,
            ]
        );

        if (meeting_date && meeting_date !== meeting.meeting_date) {
            await dbUtils.update(
                `UPDATE employees e SET last_meeting_date = (SELECT MAX(meeting_date) FROM meetings WHERE employee_id = e.id) WHERE id = ?`,
                [meeting.employee_id]
            );
        }

        const updated = await dbUtils.getOne('SELECT * FROM meetings WHERE id = ?', [id]);
        await logAudit({ table_name: 'meetings', record_id: id, action: 'UPDATE', old_values: meeting, new_values: updated, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Meeting updated.', data: updated });
    })
);

// =============================================================================
// POST /api/meetings/:id/attachment — upload/replace PDF
// =============================================================================
router.post('/:id/attachment',
    requireRole(['admin', 'manager']),
    uploadPdf, handleUploadError,
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded. Send a PDF as field name "attachment".' });

        const id      = parseInt(req.params.id, 10);
        const meeting = await getMeetingInScope(id, req.user);
        if (!meeting) { deleteUploadedFile(req.file.path); return res.status(404).json({ success: false, message: 'Meeting not found.' }); }

        if (meeting.pdf_attachment_path) {
            deleteUploadedFile(path.join(__dirname, '..', meeting.pdf_attachment_path));
        }

        const newPath = buildAttachmentPath(req.file.path);
        await dbUtils.update('UPDATE meetings SET pdf_attachment_path = ? WHERE id = ?', [newPath, id]);
        await logAudit({ table_name: 'meetings', record_id: id, action: 'UPDATE', old_values: { pdf_attachment_path: meeting.pdf_attachment_path }, new_values: { pdf_attachment_path: newPath }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Attachment uploaded.', data: { pdf_attachment_path: newPath } });
    })
);

// =============================================================================
// DELETE /api/meetings/:id/attachment — remove PDF
// =============================================================================
router.delete('/:id/attachment',
    requireRole(['admin', 'manager']),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id      = parseInt(req.params.id, 10);
        const meeting = await getMeetingInScope(id, req.user);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });
        if (!meeting.pdf_attachment_path) return res.status(400).json({ success: false, message: 'Meeting has no attachment.' });

        deleteUploadedFile(path.join(__dirname, '..', meeting.pdf_attachment_path));
        await dbUtils.update('UPDATE meetings SET pdf_attachment_path = NULL WHERE id = ?', [id]);
        await logAudit({ table_name: 'meetings', record_id: id, action: 'UPDATE', old_values: { pdf_attachment_path: meeting.pdf_attachment_path }, new_values: { pdf_attachment_path: null }, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Attachment removed.' });
    })
);

// =============================================================================
// DELETE /api/meetings/:id — hard delete (admin only)
// =============================================================================
router.delete('/:id',
    requireRole('admin'),
    param('id').isInt({ min: 1 }), handleValidation,
    asyncHandler(async (req, res) => {
        const id      = parseInt(req.params.id, 10);
        const meeting = await getMeetingInScope(id, req.user);
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });

        if (meeting.pdf_attachment_path) deleteUploadedFile(path.join(__dirname, '..', meeting.pdf_attachment_path));
        await dbUtils.update('DELETE FROM meetings WHERE id = ?', [id]);
        await dbUtils.update(
            `UPDATE employees e SET last_meeting_date = (SELECT MAX(meeting_date) FROM meetings WHERE employee_id = e.id) WHERE id = ?`,
            [meeting.employee_id]
        );

        await logAudit({ table_name: 'meetings', record_id: id, action: 'DELETE', old_values: meeting, changed_by: req.user.username, ip_address: req.ip, user_agent: req.get('user-agent') });

        res.json({ success: true, message: 'Meeting deleted.' });
    })
);

module.exports = router;
