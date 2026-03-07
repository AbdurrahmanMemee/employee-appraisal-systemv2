# routes/

Each file in this folder handles all endpoints for one resource.
Routes are registered in `server.js` — see there for the URL prefix each file gets.

## Convention Used in All Route Files

```js
// Every route follows this pattern:
router.METHOD('/path', authenticate, requireRole('...'), asyncHandler(async (req, res) => {

  // 1. Validate input (express-validator or manual checks)
  // 2. Fetch old values if needed for audit log
  // 3. Execute the database query via dbUtils
  // 4. Write to audit_trail via logAudit()
  // 5. Return consistent JSON response

}));
```

## Standard Response Pattern

```js
// Success — single record
res.json({ success: true, data: record });

// Success — list of records
res.json({ success: true, data: records, total: records.length });

// Created
res.status(201).json({ success: true, data: newRecord, message: 'Created successfully.' });

// Not found
const error = new Error('Employee not found');
error.statusCode = 404;
throw error;

// Bad request
return res.status(400).json({ success: false, message: 'Employee number is required.' });
```

---

## auth.js — `/api/auth`

Handles user authentication.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Login — returns JWT token |
| GET | `/api/auth/me` | Required | Get current user profile |
| POST | `/api/auth/logout` | Required | Log out (records in audit trail) |

See `API_REFERENCE.md` for full request/response details.

---

## Phase 3 Routes (to be added)

| File | Prefix | Description |
|---|---|---|
| `employees.js` | `/api/employees` | Employee CRUD + soft delete |
| `meetings.js` | `/api/meetings` | Meeting records per employee |
| `appraisals.js` | `/api/appraisals` | Formal appraisals + section ratings |
| `incidents.js` | `/api/incidents` | Incident logging |
| `schedules.js` | `/api/schedules` | Appraisal scheduling + calendar feed |
| `config.js` | `/api/config` | Admin dropdown management |
| `dashboard.js` | `/api/dashboard` | Stats, trends, recent activity |

Each route file will be uncommented in `server.js` as it is built and tested.
