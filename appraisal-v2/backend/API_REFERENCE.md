# EAS v2 — API Reference

Complete reference for all API endpoints.  
Base URL: `http://145.241.184.113:5001`

---

## Authentication

Most endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your_token>
```

Tokens are obtained via the login endpoint and expire after 7 days.

---

## Response Format

All responses use this consistent structure:

**Success (2xx)**
```json
{
  "success": true,
  "data": { },
  "message": "Optional description"
}
```

**Validation Error (400)**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "username", "message": "Username is required" }
  ]
}
```

**Auth Error (401)**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**Permission Error (403)**
```json
{
  "success": false,
  "message": "Access denied. Required role: admin.",
  "yourRole": "viewer"
}
```

**Not Found (404)**
```json
{
  "success": false,
  "message": "Route not found: GET /api/employees/999"
}
```

**Rate Limited (429)**
```json
{
  "success": false,
  "message": "Too many login attempts. Please try again in 15 minutes."
}
```

**Server Error (500)**
```json
{
  "success": false,
  "message": "An unexpected error occurred."
}
```

---

## System Endpoints

### GET /health

Check server and database status. No authentication required.

**Response 200**
```json
{
  "success": true,
  "message": "Server is healthy",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "environment": "production",
  "version": "2.0.0"
}
```

**Response 503** — database is unreachable
```json
{
  "success": false,
  "message": "Database unavailable",
  "error": "connect ECONNREFUSED"
}
```

---

### GET /api

API information. No authentication required.

**Response 200**
```json
{
  "message": "Employee Appraisal System v2 API",
  "version": "2.0.0",
  "status": "Phase 2 — Foundation complete."
}
```

---

## Auth Endpoints `/api/auth`

### POST /api/auth/login

Authenticate a user and receive a JWT token.

**Authentication:** None required

**Rate limit:** 20 requests per 15 minutes per IP

**Request body:**
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `username` | string | Yes | Max 50 characters |
| `password` | string | Yes | Any length |

**Response 200 — Login successful**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "full_name": "System Administrator"
  }
}
```

**Response 400 — Validation failed**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "password", "message": "Password is required" }]
}
```

**Response 401 — Bad credentials**
```json
{
  "success": false,
  "message": "Invalid username or password."
}
```

**Response 401 — Account deactivated**
```json
{
  "success": false,
  "message": "Account is deactivated. Contact your administrator."
}
```

**Response 429 — Rate limited**
```json
{
  "success": false,
  "message": "Too many login attempts. Please try again in 15 minutes."
}
```

---

### GET /api/auth/me

Return the current user's profile. Used by the frontend on page load to
verify the stored token is still valid.

**Authentication:** Required

**Response 200**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "full_name": "System Administrator",
    "role": "admin",
    "email": null,
    "is_active": true,
    "last_login_at": "2026-03-04T10:00:00.000Z"
  }
}
```

**Response 401 — No token**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**Response 401 — Expired token**
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "code": "TOKEN_EXPIRED"
}
```

**Response 401 — Invalid token**
```json
{
  "success": false,
  "message": "Invalid token. Please log in again.",
  "code": "TOKEN_INVALID"
}
```

---

### POST /api/auth/logout

Log out the current user. Because JWT is stateless, this does not
invalidate the token server-side — the frontend must delete its stored
token. This endpoint records the logout in the audit trail.

**Authentication:** Required

**Request body:** None required

**Response 200**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

---

## Phase 3 Endpoints (Coming)

The following endpoints will be added in Phase 3:

| Endpoint | Description |
|---|---|
| `GET /api/employees` | List all active employees |
| `POST /api/employees` | Create a new employee |
| `GET /api/employees/:id` | Get one employee with full history |
| `PUT /api/employees/:id` | Update employee details |
| `DELETE /api/employees/:id` | Deactivate employee (soft delete) |
| `GET /api/meetings` | List meetings (filterable by employee) |
| `POST /api/meetings` | Create a new meeting record |
| `PUT /api/meetings/:id` | Update a meeting record |
| `DELETE /api/meetings/:id` | Delete a meeting record |
| `GET /api/appraisals` | List appraisals (filterable by employee) |
| `POST /api/appraisals` | Create a new appraisal |
| `PUT /api/appraisals/:id` | Update an appraisal |
| `POST /api/appraisals/:id/submit` | Mark appraisal as completed |
| `GET /api/incidents` | List incident logs |
| `POST /api/incidents` | Create an incident log |
| `PUT /api/incidents/:id` | Update an incident log |
| `GET /api/schedules` | List scheduled appraisals |
| `POST /api/schedules` | Schedule an appraisal |
| `PUT /api/schedules/:id` | Update a schedule |
| `POST /api/schedules/:id/cancel` | Cancel a scheduled appraisal |
| `GET /api/config` | Get all dropdown configuration |
| `POST /api/config/:category` | Add a config item |
| `PUT /api/config/:category/:id` | Update a config item |
| `DELETE /api/config/:category/:id` | Deactivate a config item |
| `GET /api/dashboard/stats` | Summary stats for user dashboard |
| `GET /api/dashboard/department-stats` | Department breakdown for management |
| `GET /api/dashboard/performance-trends` | Rating trends over time |
| `GET /api/dashboard/recent-activity` | Recent meetings, appraisals, incidents |

---

## Error Codes Reference

| HTTP Code | Meaning | Common Cause |
|---|---|---|
| 400 | Bad Request | Missing required field, validation failed |
| 401 | Unauthorized | No token, expired token, invalid token |
| 403 | Forbidden | Valid token but insufficient role |
| 404 | Not Found | Record doesn't exist, route doesn't exist |
| 409 | Conflict | Duplicate record (e.g. username already taken) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected error — check server logs |
| 503 | Service Unavailable | Database is unreachable |
