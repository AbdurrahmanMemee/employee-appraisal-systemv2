# EAS v2 — Backend

Employee Appraisal System v2 — Express.js API backend.

## Quick Start

```bash
# Install dependencies
npm install

# Start server (production)
node server.js

# Start server (development — auto-restarts on file changes)
npm run dev

# Run database verification
node scripts/verify-db.js

# Run Phase 2 API tests
node scripts/test-api.js

# Run edge case tests
node scripts/test-edge-cases.js
```

## Folder Structure

```
backend/
├── server.js                   Entry point — starts Express, loads all middleware + routes
├── package.json                Dependencies and npm scripts
├── .env                        Environment config — never commit this file
│
├── config/
│   └── database.js             MySQL connection pool + query helper utilities
│
├── middleware/
│   ├── auth.js                 JWT authentication + role enforcement
│   └── errorHandler.js         Centralised error handling + asyncHandler wrapper
│
├── routes/
│   └── auth.js                 Login, logout, /me endpoints
│   (Phase 3 routes added here as each is built)
│
├── utils/
│   └── auditLogger.js          Writes to audit_trail table on every data change
│
└── scripts/
    ├── schema.sql              Creates the employee_appraisal_v2 database + all tables
    ├── seed.js                 Creates default admin and manager user accounts
    ├── verify-db.js            Checks all tables exist with correct row counts
    ├── test-api.js             Core API tests (Phase 2)
    └── test-edge-cases.js      Extended edge case tests (auth, rate limit, DB, concurrency)
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | Server port — defaults to 5001 |
| `FRONTEND_URL` | Yes (production) | Allowed CORS origin |
| `DB_HOST` | Yes | MySQL host — usually `localhost` |
| `DB_PORT` | No | MySQL port — defaults to 3306 |
| `DB_USER` | Yes | MySQL username |
| `DB_PASSWORD` | Yes | MySQL password |
| `DB_NAME` | Yes | Database name — `employee_appraisal_v2` |
| `JWT_SECRET` | Yes | Long random string — generate with command below |
| `JWT_EXPIRES_IN` | No | Token lifetime — defaults to `7d` |
| `BCRYPT_SALT_ROUNDS` | No | Password hashing strength — defaults to 12 |
| `RATE_LIMIT_MAX` | No | Max API requests per 15 min — defaults to 100 |

**Generate a secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — manage users, config, all data |
| `manager` | Create and manage appraisals, meetings, incidents |
| `viewer` | Read-only access to employee records |

## Request/Response Format

All API responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { },
  "message": "Optional message"
}
```

**Error:**
```json
{
  "success": false,
  "message": "Human readable error description"
}
```

## Security Notes

- All passwords are hashed with bcrypt (12 salt rounds)
- JWT tokens expire after 7 days
- Auth endpoint rate limited to 20 requests per 15 minutes per IP
- All other endpoints rate limited to 100 requests per 15 minutes per IP
- All SQL uses parameterised queries — no string concatenation
- Helmet sets security HTTP headers on all responses
- CORS locked to `FRONTEND_URL` in production
