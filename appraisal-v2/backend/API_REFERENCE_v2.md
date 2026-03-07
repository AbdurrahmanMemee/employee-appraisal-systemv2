# EAS v2 — API Reference (Phase 3 Update)

Complete reference for all implemented API endpoints.  
Base URL: `http://145.241.184.113:5001`  
Last updated: March 2026

---

## Authentication

All endpoints (except `/api/auth/login` and `/health`) require a JWT token:

```
Authorization: Bearer <your_token>
```

Tokens expire after 7 days. Tokens can be invalidated server-side (e.g. on deactivate).

---

## Response Format

**Success (2xx)**
```json
{ "success": true, "data": { }, "message": "Optional description" }
```

**Validation Error (400)**
```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "name", "message": "Name is required" } ] }
```

**Auth / Permission Errors**
```json
{ "success": false, "message": "Access denied." }
```

---

## Role Access Summary

| Role | Scope |
|---|---|
| `admin` | All records, all employees, full config management |
| `manager` | Own subordinates only (recursive hierarchy). Create/update. No delete. |
| `employee` | Own records only. Read-only. |

---

## GET /health

No auth required. Returns `{ status: "ok" }` with server uptime.

---

## Auth — `/api/auth`

### POST /api/auth/login
No token required.
```json
{ "username": "admin", "password": "password123" }
```
Returns: `{ token, user: { id, username, role, full_name, employee_id } }`

### GET /api/auth/me
Returns current user profile from JWT.

### POST /api/auth/logout
Invalidates the current token server-side.

### PUT /api/auth/change-password
```json
{ "current_password": "old", "new_password": "new" }
```

---

## Employees — `/api/employees`

All roles can read. Only admin and manager can write.

### GET /api/employees
Query params: `department`, `job_title`, `search`, `is_active`, `page`, `limit` (max 100)

Returns paginated list scoped by role (admin=all, manager=subordinates, employee=self only).

Response includes `pagination: { page, limit, total, pages }`.

### GET /api/employees/stats
**admin + manager only.** Returns counts: total, active, inactive, by department.

### GET /api/employees/:id
Returns single employee. 404 if outside caller's scope.

### GET /api/employees/:id/summary
Returns employee + last 5 meetings + last 3 appraisals + recent incidents + upcoming schedules.

### POST /api/employees
**admin + manager only.**
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@company.com",
  "department": "Engineering",
  "job_title": "Developer",
  "manager_id": 5,
  "start_date": "2026-01-15"
}
```
`employee_id` (e.g. `EMP-0042`) is auto-generated.

### PUT /api/employees/:id
**admin + manager only.** Partial update — only send fields to change.  
Circular hierarchy protection: cannot set manager_id to self or a subordinate.

### DELETE /api/employees/:id
**admin only.** Soft deactivate — sets `is_active = FALSE`. Also invalidates linked user token.

### POST /api/employees/:id/restore
**admin only.** Reactivates employee.

---

## Meetings — `/api/meetings`

### GET /api/meetings
Query params: `employee_id`, `meeting_type`, `date_from`, `date_to`, `page`, `limit`

Scoped by role. Returns `{ meetings: [...], pagination: {...} }`.

### GET /api/meetings/:id
Returns meeting + `employee_name`, `department`, `job_title`.

### POST /api/meetings
**admin + manager only.**

**Option A — JSON (no file):**
```json
{
  "employee_id": 12,
  "meeting_date": "2026-03-15",
  "meeting_type": "One-on-One",
  "people_present": "Jane, John",
  "brief_note": "Quarterly check-in",
  "detailed_summary": "Discussed Q1 goals...",
  "meeting_conclusion": "On track. No action required."
}
```

**Option B — multipart/form-data (with PDF):**  
Same fields as form fields, plus file field named `attachment` (PDF only, max 10 MB).

On success, `employees.last_meeting_date` is updated automatically.

### PUT /api/meetings/:id
**admin + manager only.** Text fields only — use `/attachment` endpoint for file changes.

### POST /api/meetings/:id/attachment
**admin + manager only.** `multipart/form-data`, field name `attachment`, PDF only, max 10 MB.  
Replaces existing attachment if present. Old file deleted from disk.

### DELETE /api/meetings/:id/attachment
**admin + manager only.** Removes PDF from meeting record and deletes file from disk.

### DELETE /api/meetings/:id
**admin only.** Hard delete. Also cleans up PDF file and refreshes `last_meeting_date` on employee.

---

## Appraisals — `/api/appraisals`

### GET /api/appraisals
Query params: `employee_id`, `status`, `date_from`, `date_to`, `page`, `limit`

Valid `status` values: `Draft`, `In Progress`, `Completed`, `Cancelled`

### GET /api/appraisals/:id
Returns appraisal + `sections` array.

### POST /api/appraisals
**admin + manager only.**
```json
{
  "employee_id": 12,
  "appraisal_date": "2026-03-01",
  "people_present": "Manager, Employee",
  "next_appraisal_date": "2027-03-01",
  "status": "Draft",
  "sections": [
    { "section_name": "Technical Skills", "rating": 4.0, "weight": 40, "previous_rating": 3.5, "comments": "Strong improvement" },
    { "section_name": "Communication",    "rating": 3.5, "weight": 30, "comments": "Good" },
    { "section_name": "Initiative",       "rating": 4.5, "weight": 30, "comments": "Excellent" }
  ]
}
```

**Important:**
- `overall_rating` is **server-calculated** — do not send it. Formula: `SUM(rating × weight) / SUM(weights)`
- Section `weight` values must total ≤ 100
- Section `rating` must be 0–5
- `status` defaults to `Draft`

On success, `employees.last_appraisal_date` and `next_scheduled_appraisal` are updated.

### PUT /api/appraisals/:id
**admin + manager only.** Cannot edit `Completed` or `Cancelled` appraisals.  
Sections are **replaced wholesale** — always send the full sections array.  
Cannot set `status = Completed` via PUT — use `/submit` endpoint instead.

### POST /api/appraisals/:id/submit
**admin + manager only.** Transitions status to `Completed`.  
Triggers: `employees.average_rating` recalculated from all Completed appraisals.  
Completed appraisals become **read-only**.

### POST /api/appraisals/:id/cancel
**admin only.** Cannot cancel a Completed appraisal.

### DELETE /api/appraisals/:id
**admin only. Draft status only.** Use cancel for non-Draft appraisals.  
Sections deleted automatically via FK cascade.

---

## Config (Dropdowns) — `/api/config`

Manages all lookup/dropdown tables. All roles can **read** (needed to populate UI dropdowns). Only **admin** can write.

### Valid category names

| Category key | Table | Description |
|---|---|---|
| `departments` | `departments` | Employee departments |
| `job_titles` | `job_titles` | Job title options |
| `meeting_types` | `meeting_types` | Meeting type dropdown |
| `incident_types` | `incident_types` | Incident type dropdown |
| `appraisal_sections` | `appraisal_section_templates` | Default appraisal section names + weights |

### GET /api/config
Returns all 5 categories in one call (active items only). Used at app startup.
```json
{
  "departments": [ { "id": 1, "name": "Engineering", "is_active": 1 } ],
  "job_titles": [...],
  ...
}
```

### GET /api/config/:category
Returns all items (active + inactive) for admin management view. Includes `meta: { total, active }`.

### POST /api/config/:category
**admin only.**
```json
{ "name": "New Department" }
```
For `appraisal_sections`, optionally include `default_weight` (0–100).

Returns 409 if name already exists (case-insensitive check).

### PUT /api/config/:category/:id
**admin only.** Rename an item. Also propagates rename to string copies in `employees`, `meetings`, and `incident_logs` tables.
```json
{ "name": "Renamed Department" }
```

### DELETE /api/config/:category/:id
**admin only.** Soft deactivate — item disappears from active dropdown list but historical records are preserved.

### POST /api/config/:category/:id/restore
**admin only.** Reactivate a deactivated item.

---

## Error Codes Reference

| HTTP | Meaning | Common Cause |
|---|---|---|
| 400 | Bad Request | Missing field, validation failed, invalid state (e.g. editing Completed appraisal) |
| 401 | Unauthorized | No token, expired token, token invalidated |
| 403 | Forbidden | Valid token but insufficient role, or record outside scope |
| 404 | Not Found | Record doesn't exist, or outside caller's scope |
| 409 | Conflict | Duplicate (e.g. config name already exists) |
| 429 | Too Many Requests | Rate limit exceeded (100 req / 15 min) |
| 500 | Server Error | Unexpected — check server logs |
| 503 | Service Unavailable | Database unreachable |

---

## Pagination

List endpoints return:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "pages": 8
  }
}
```

Default `limit` is 20. Maximum is 100. Use `?page=2&limit=50` to paginate.

---

## File Uploads (PDF)

- Field name: `attachment`
- Accepted types: PDF only (checked by both MIME type and file extension)
- Max size: 10 MB
- Storage: `uploads/meetings/YYYY-MM/<timestamp>-<random>.pdf`
- Served at: `http://145.241.184.113:5001/uploads/meetings/...`
- On meeting delete: file is also deleted from disk
- Send as: `multipart/form-data` — all other fields become text form fields (not JSON body)

---

## Endpoints Not Yet Built (Phase 3 — Remaining)

| Endpoint | Status |
|---|---|
| `GET /api/incidents` | ⏳ Pending |
| `POST /api/incidents` | ⏳ Pending |
| `PUT /api/incidents/:id` | ⏳ Pending |
| `DELETE /api/incidents/:id` | ⏳ Pending |
| `GET /api/schedules` | ⏳ Pending |
| `POST /api/schedules` | ⏳ Pending |
| `PUT /api/schedules/:id` | ⏳ Pending |
| `POST /api/schedules/:id/cancel` | ⏳ Pending |
| `GET /api/dashboard/stats` | ⏳ Pending |
| `GET /api/dashboard/department-stats` | ⏳ Pending |
| `GET /api/dashboard/performance-trends` | ⏳ Pending |
| `GET /api/dashboard/recent-activity` | ⏳ Pending |
