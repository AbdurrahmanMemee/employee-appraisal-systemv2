# middleware/

## auth.js

Provides two middleware functions for protecting API routes.

### `authenticate`

Verifies the JWT token in the `Authorization: Bearer <token>` header.

- If valid → populates `req.user` and calls `next()`
- If missing → returns `401` with "No token provided"
- If expired → returns `401` with "Session expired" and `code: TOKEN_EXPIRED`
- If invalid → returns `401` with "Invalid token" and `code: TOKEN_INVALID`

After `authenticate` runs successfully, `req.user` contains:
```js
{
  id:        1,
  username:  'admin',
  role:      'admin',
  full_name: 'System Administrator'
}
```

**Usage:**
```js
const { authenticate } = require('../middleware/auth');

// Protect a single route
router.get('/employees', authenticate, handler);

// Protect all routes in a router (done in server.js)
app.use('/api/employees', authenticate, employeeRoutes);
```

### `requireRole(allowedRoles)`

Must be used **after** `authenticate`. Restricts a route to specific roles.

```js
const { authenticate, requireRole } = require('../middleware/auth');

// Admin only
router.delete('/users/:id', authenticate, requireRole('admin'), handler);

// Admin or manager
router.post('/appraisals', authenticate, requireRole(['admin', 'manager']), handler);
```

Returns `403 Forbidden` if the user's role is not in `allowedRoles`.

---

## errorHandler.js

Provides three exports for consistent error handling across the app.

### `asyncHandler(fn)`

Wraps an async route handler so thrown errors are automatically forwarded to the error handler. Use this on every route to avoid repetitive try/catch blocks.

```js
const { asyncHandler } = require('../middleware/errorHandler');

// Without asyncHandler — you must remember try/catch + next(error) every time
router.get('/employees', async (req, res, next) => {
  try {
    const data = await getEmployees();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// With asyncHandler — thrown errors are forwarded automatically
router.get('/employees', asyncHandler(async (req, res) => {
  const data = await getEmployees();
  res.json(data);
}));
```

### `notFound`

Registered in `server.js` after all routes. Returns `404` for any request that didn't match a route.

### `errorHandler`

Registered in `server.js` as the last middleware. Catches all errors, logs them server-side, and returns a consistent JSON response.

Special handling for MySQL errors:
- `ER_DUP_ENTRY` → `409 Conflict` with "A record with this value already exists"
- `ER_ROW_IS_REFERENCED_2` → `409 Conflict` with "Cannot delete — other records depend on it"

**How to throw a custom error from a route:**
```js
// Throw a 404
const error = new Error('Employee not found');
error.statusCode = 404;
throw error;

// Or just throw naturally — unhandled errors become 500s
throw new Error('Something went wrong');
```
