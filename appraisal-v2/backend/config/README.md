# config/database.js

## Purpose
Creates and manages the MySQL connection pool. All database access in the application goes through this module.

## Exports

### `pool`
The raw mysql2 connection pool. Use this when you need direct pool access (rare).

### `dbUtils`
Helper object with five methods that cover every query pattern in the app:

| Method | Use For | Returns |
|---|---|---|
| `query(sql, params)` | SELECT statements | `{ rows, fields }` |
| `insert(sql, params)` | INSERT statements | `{ insertId, affectedRows }` |
| `update(sql, params)` | UPDATE / DELETE statements | `{ affectedRows, changedRows }` |
| `transaction(callback)` | Multiple queries that must all succeed together | Result of callback |
| `getOne(sql, params)` | SELECT expecting one row | Row object or `null` |
| `exists(sql, params)` | Check if a row exists | `true` or `false` |

### `testConnection()`
Tests the database connection. Called once at server startup. Returns `true` if connected, `false` if not.

## Usage Examples

```js
const { dbUtils } = require('../config/database');

// Get all active employees
const { rows } = await dbUtils.query(
  'SELECT * FROM employees WHERE is_active = ?', [true]
);

// Get one employee by internal id
const employee = await dbUtils.getOne(
  'SELECT * FROM employees WHERE id = ?', [id]
);
// employee is null if not found — always check before using

// Check if employee number is already taken
const taken = await dbUtils.exists(
  'SELECT 1 FROM employees WHERE employee_number = ?', [empNumber]
);

// Insert a new meeting
const { insertId } = await dbUtils.insert(
  'INSERT INTO meetings (employee_id, meeting_date, ...) VALUES (?, ?, ...)',
  [employeeId, date, ...]
);

// Update + audit in a single transaction (both succeed or both roll back)
await dbUtils.transaction(async (conn) => {
  await conn.execute('UPDATE employees SET department = ? WHERE id = ?', [dept, id]);
  await conn.execute('INSERT INTO audit_trail (...) VALUES (...)', [...]);
});
```

## Important Rules
- **Never** use string concatenation in SQL — always use `?` placeholders
- **Always** check that `getOne()` result is not `null` before accessing its properties
- Use `transaction()` whenever two or more tables must change together
