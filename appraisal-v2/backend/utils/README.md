# utils/auditLogger.js

## Purpose
Writes an immutable record to the `audit_trail` table every time data changes in the system. Provides the answer to "who changed what, and when?" which is essential for an HR system.

## How It Works
Every INSERT, UPDATE, or DELETE on an important table should call `logAudit()` after the change is made. The function stores the old values, new values, the username who made the change, their IP address, and a timestamp.

Audit log rows are **never updated or deleted** — they are append-only.

## Exports

### `logAudit(options)`

Writes one row to `audit_trail`. Never throws — if logging fails it prints a warning to console but does not interrupt the request.

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `table_name` | string | Yes | Which table was changed e.g. `'employees'` |
| `record_id` | int | Yes | The `id` of the record that changed |
| `action` | string | Yes | `'INSERT'`, `'UPDATE'`, or `'DELETE'` |
| `old_values` | object | No | The record before the change (omit for INSERT) |
| `new_values` | object | No | The record after the change (omit for DELETE) |
| `changed_by` | string | Yes | Username from `req.user.username` |
| `ip_address` | string | No | From `req.ip` |
| `user_agent` | string | No | From `req.get('user-agent')` |

**Sensitive fields are automatically redacted** — `password_hash`, `password`, `token`, and `secret` are replaced with `[REDACTED]` before storage.

## Usage Example

```js
const { logAudit } = require('../utils/auditLogger');

// After creating a new employee
const { insertId } = await dbUtils.insert('INSERT INTO employees ...', [...]);

await logAudit({
  table_name: 'employees',
  record_id:  insertId,
  action:     'INSERT',
  new_values: req.body,
  changed_by: req.user.username,
  ip_address: req.ip,
  user_agent: req.get('user-agent'),
});

// After updating an employee — capture old values first
const existing = await dbUtils.getOne('SELECT * FROM employees WHERE id = ?', [id]);

await dbUtils.update('UPDATE employees SET department = ? WHERE id = ?', [dept, id]);

await logAudit({
  table_name: 'employees',
  record_id:  id,
  action:     'UPDATE',
  old_values: existing,        // what it looked like before
  new_values: { department: dept },  // what changed
  changed_by: req.user.username,
  ip_address: req.ip,
  user_agent: req.get('user-agent'),
});

// After soft-deleting an employee
await logAudit({
  table_name: 'employees',
  record_id:  id,
  action:     'DELETE',
  old_values: existing,
  changed_by: req.user.username,
  ip_address: req.ip,
  user_agent: req.get('user-agent'),
});
```

## Important Rules
- Call `logAudit()` **after** the database change, not before
- Always pass `old_values` for UPDATE and DELETE so history is meaningful
- Never wrap `logAudit()` calls in a way that lets their failure stop the main operation — the function handles this internally
- Do not log passwords, tokens, or secrets — they are auto-redacted but avoid passing them in the first place
