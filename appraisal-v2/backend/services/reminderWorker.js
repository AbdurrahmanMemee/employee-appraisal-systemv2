'use strict';

const { dbUtils } = require('../config/database');

const POLL_MS = Math.max(parseInt(process.env.REMINDER_POLL_MS, 10) || 60000, 15000);
let timer = null;
let running = false;

const smtpConfigured = () => Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

const getTransporter = () => {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: parseInt(process.env.SMTP_PORT, 10) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
};

const processDueReminders = async () => {
    if (running) return;
    running = true;
    try {
        if (!smtpConfigured()) {
            console.log('[reminder-worker] SMTP is not configured; reminder delivery skipped.');
            return;
        }

        const { rows } = await dbUtils.query(`
            SELECT s.id, s.scheduled_date,
                   TIME_FORMAT(s.scheduled_time, '%H:%i') AS scheduled_time,
                   s.duration_minutes, s.appraisal_type, s.notes,
                   s.reminder_offset_minutes,
                   e.first_name, e.last_name, e.email
            FROM scheduled_appraisals s
            JOIN employees e ON e.id = s.employee_id
            WHERE s.status = 'Scheduled'
              AND s.reminder_sent = FALSE
              AND s.reminder_offset_minutes IS NOT NULL
              AND e.email IS NOT NULL
              AND TIMESTAMP(s.scheduled_date, s.scheduled_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 HOUR)
              AND DATE_SUB(
                    TIMESTAMP(s.scheduled_date, s.scheduled_time),
                    INTERVAL s.reminder_offset_minutes MINUTE
                  ) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 HOUR)
            ORDER BY s.scheduled_date, s.scheduled_time
            LIMIT 50
        `);

        if (rows.length === 0) return;
        const transporter = getTransporter();
        for (const item of rows) {
            try {
                await transporter.sendMail({
                    from: `"${process.env.SMTP_FROM_NAME || 'Employee Appraisal System'}" <${process.env.SMTP_USER}>`,
                    to: `"${item.first_name} ${item.last_name}" <${item.email}>`,
                    subject: `Reminder: ${item.appraisal_type} on ${item.scheduled_date} at ${item.scheduled_time}`,
                    text: [
                        `Hi ${item.first_name},`,
                        '',
                        `This is a reminder that your ${item.appraisal_type} is scheduled for ${item.scheduled_date} at ${item.scheduled_time}.`,
                        `Duration: ${item.duration_minutes || 60} minutes.`,
                        item.notes ? `Notes: ${item.notes}` : '',
                    ].filter(Boolean).join('\n'),
                });
                await dbUtils.update(
                    'UPDATE scheduled_appraisals SET reminder_sent = TRUE WHERE id = ? AND reminder_sent = FALSE',
                    [item.id]
                );
                console.log(`[reminder-worker] Reminder sent for schedule ${item.id} to ${item.email}.`);
            } catch (error) {
                console.error(`[reminder-worker] Schedule ${item.id} failed:`, error.message);
            }
        }
    } catch (error) {
        console.error('[reminder-worker] Poll failed:', error.message);
    } finally {
        running = false;
    }
};

const startReminderWorker = () => {
    if (timer) return;
    console.log(`[reminder-worker] Started; polling every ${POLL_MS}ms.`);
    processDueReminders();
    timer = setInterval(processDueReminders, POLL_MS);
    timer.unref?.();
};

const stopReminderWorker = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    console.log('[reminder-worker] Stopped.');
};

module.exports = { startReminderWorker, stopReminderWorker, processDueReminders };
