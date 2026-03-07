// =============================================================================
// FILE:    utils/auditLogger.js
// PURPOSE: Writes a record to the audit_trail table whenever data changes.
//          Call this after every INSERT, UPDATE, or DELETE on important tables.
//
// WHY AN AUDIT TRAIL?
//   In an HR system you must be able to answer: "Who changed this record,
//   what did it look like before, and when did it happen?"
//   The audit_trail table is append-only — we never update or delete its rows.
//
// USAGE:
//   const { logAudit } = require('../utils/auditLogger');
//
//   await logAudit({
//     table_name: 'employees',
//     record_id:  newEmployee.id,
//     action:     'INSERT',
//     new_values: newEmployee,
//     changed_by: req.user.username,
//     ip_address: req.ip,
//     user_agent: req.get('user-agent'),
//   });
// =============================================================================

const { pool } = require('../config/database');

// ---- logAudit ---------------------------------------------------------------
// Writes one row to audit_trail.
// Silently ignores errors — a logging failure should never break the main operation.

const logAudit = async ({
  table_name,
  record_id,
  action,
  old_values = null,
  new_values = null,
  changed_by,
  ip_address = null,
  user_agent = null,
}) => {
  try {
    await pool.execute(
      `INSERT INTO audit_trail
         (table_name, record_id, action, old_values, new_values, changed_by, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        table_name,
        record_id,
        action,
        // JSON.stringify converts objects to strings for storage
        // We strip sensitive fields like password_hash before logging
        old_values ? JSON.stringify(stripSensitiveFields(old_values)) : null,
        new_values ? JSON.stringify(stripSensitiveFields(new_values)) : null,
        changed_by,
        ip_address,
        user_agent,
      ]
    );
  } catch (error) {
    // Log to console but don't throw — audit failure must not break the request
    console.error('⚠️  Audit log failed:', error.message, {
      table_name, record_id, action, changed_by,
    });
  }
};

// ---- stripSensitiveFields ---------------------------------------------------
// Removes fields we should never store in audit logs (e.g. password hashes).
const SENSITIVE_FIELDS = ['password_hash', 'password', 'token', 'secret'];

const stripSensitiveFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = { ...obj };
  SENSITIVE_FIELDS.forEach(field => {
    if (field in cleaned) {
      cleaned[field] = '[REDACTED]';
    }
  });
  return cleaned;
};

module.exports = { logAudit };
