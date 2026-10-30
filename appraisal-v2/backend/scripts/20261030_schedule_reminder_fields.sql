-- =============================================================================
-- FILE:    20261030_schedule_reminder_fields.sql
-- PURPOSE: Add schedule time, duration, reminder offset and reminder polling
--          index required by the EAS v2 schedule reminder worker.
--
-- SAFETY:
--   - Forward-only and additive.
--   - Preserves existing scheduled_appraisals records.
--   - Does not remove the legacy reminder_date column.
--   - Does not recreate or truncate the table.
-- =============================================================================

ALTER TABLE scheduled_appraisals
    ADD COLUMN scheduled_time TIME NOT NULL DEFAULT '09:00:00'
        AFTER scheduled_date,
    ADD COLUMN duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60
        AFTER scheduled_time,
    ADD COLUMN reminder_offset_minutes INT UNSIGNED NULL DEFAULT 1440
        AFTER reminder_date,
    ADD INDEX idx_reminder_pending (
        reminder_sent,
        scheduled_date,
        scheduled_time
    );
