# middleware/

## auth.js (Updated — Phase 2b)

### What Changed in Phase 2b

| Item | Before | After |
|---|---|---|
| Token invalidation | None — deactivated users kept access for up to 7 days | `invalidated_tokens` DB table + 60s memory cache |
| Role names | `admin / manager / viewer` | `admin / manager / employee` |
| JWT payload | `id, username, role, full_name` | Added `employee_id` (null for admin users) |
| New export | — | `getSubordinateIds(employeeId)` |
| New export | — | `clearInvalidationCache(userId)` |

---

### `authenticate`

Verifies the JWT token. Now also checks `invalidated_tokens` table.

**Fast path (active users):** JWT verified locally → cache hit → no DB query at all.
**Deactivation path:** JWT verified → cache miss → DB lookup → 401 ACCOUNT_DEACTIVATED.
**Cache TTL:** 60 seconds. Deactivation takes effect within 1 minute.

After this runs successfully, `req.user` contains:
```js
{
  id:          1,           // users.id
  username:    'jsmith',
  role:        'manager',   // 'admin' | 'manager' | 'employee'
  full_name:   'John Smith',
  employee_id: 42           // employees.id — null for admin users not in employee table
}
```

### `requireRole(allowedRoles)`

Unchanged from Phase 2. Use after `authenticate`.

```js
requireRole('admin')                    // admin only
requireRole(['admin', 'manager'])       // admin or manager
```

### `getSubordinateIds(managerEmployeeId)`

**New in Phase 2b.** Returns all `employees.id` values a manager can access, walking the org chart recursively to any depth using a MySQL 8 recursive CTE.

```js
const { getSubordinateIds } = require('../middleware/auth');

// In a route handler:
if (req.user.role === 'manager') {
    const ids = await getSubordinateIds(req.user.employee_id);
    // ids = [3, 7, 12, 15] — all employees below this manager
    
    const { rows } = await dbUtils.query(
        `SELECT * FROM employees WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
    );
}

// admin sees everyone — no filter needed
if (req.user.role === 'admin') {
    const { rows } = await dbUtils.query('SELECT * FROM employees WHERE is_active = 1');
}

// employee sees only themselves
if (req.user.role === 'employee') {
    const { rows } = await dbUtils.query(
        'SELECT * FROM employees WHERE id = ?',
        [req.user.employee_id]
    );
}
```

Returns `[]` if `managerEmployeeId` is null (safe to use without null-checking in routes).

### `clearInvalidationCache(userId)`

**New in Phase 2b.** Call this when reactivating a user so they are not blocked by a stale cache entry.

```js
const { clearInvalidationCache } = require('../middleware/auth');

// In the users route, when reactivating a user:
await dbUtils.update('UPDATE users SET is_active = TRUE WHERE id = ?', [id]);
await conn.execute('DELETE FROM invalidated_tokens WHERE user_id = ?', [id]);
clearInvalidationCache(id);  // flush the 60s memory cache immediately
```

---

## errorHandler.js

Unchanged from Phase 2. See original README.
