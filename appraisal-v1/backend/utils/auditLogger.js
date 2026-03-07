// backend/utils/auditLogger.js
const { dbUtils } = require('../config/database');

const logAuditTrail = async ({
  table_name,
  record_id,
  action,
  old_values = null,
  new_values = null,
  changed_by,
  ip_address = null,
  user_agent = null
}) => {
  try {
    await dbUtils.query(
      `INSERT INTO audit_trail 
        (table_name, record_id, action, old_values, new_values, changed_by, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        table_name,
        record_id,
        action,
        old_values ? JSON.stringify(old_values) : null,
        new_values ? JSON.stringify(new_values) : null,
        changed_by,
        ip_address,
        user_agent ? user_agent.substring(0, 500) : null // Truncate to prevent oversized entries
      ]
    );
  } catch (error) {
    // Audit failure must never break the main operation
    console.error('Audit logging error (non-fatal):', error.message);
  }
};

module.exports = { logAuditTrail };
