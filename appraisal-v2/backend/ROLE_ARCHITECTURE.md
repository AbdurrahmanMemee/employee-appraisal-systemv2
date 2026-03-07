# EAS v2 — Role Architecture

## Overview

Three roles with a strict access hierarchy.

| Role | Who | DB access pattern |
|---|---|---|
| `admin` | HR / system administrator | All employees, all data |
| `manager` | Team managers | Own direct reports + all subordinates recursively |
| `employee` | Individual staff members | Own record only, read-only |

---

## Access Rules by Resource

| Resource | admin | manager | employee |
|---|---|---|---|
| List employees | All | Own subordinates only | Own record only |
| Create employee | ✅ | ✅ | ❌ |
| Edit employee | ✅ | Own subordinates only | ❌ |
| Deactivate employee | ✅ | ❌ | ❌ |
| View meetings | All | Own subordinates | Own meetings |
| Create meeting | ✅ | Own subordinates | ❌ |
| Edit/delete meeting | ✅ | Own subordinates | ❌ |
| View appraisals | All | Own subordinates | Own appraisals |
| Create appraisal | ✅ | Own subordinates | ❌ |
| View incidents | All | Own subordinates | Own incidents |
| Create incident | ✅ | Own subordinates | ❌ |
| Schedule appraisals | ✅ | Own subordinates | ❌ |
| View dashboard stats | All stats | Own team stats | Own summary only |
| Manage config (dropdowns) | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ |

---

## Manager Hierarchy

Managers are employees. The `employees.manager_id` field points to another `employees.id`.

```
Alice (id:1, manager_id: NULL)         ← top of org, no manager above
  └── Bob (id:2, manager_id: 1)
        ├── Carol (id:3, manager_id: 2)
        │     ├── Dave  (id:4, manager_id: 3)
        │     └── Eve   (id:5, manager_id: 3)
        └── Frank (id:6, manager_id: 2)
```

Alice logs in → can see Bob, Carol, Dave, Eve, Frank (all 5 subordinates).
Bob logs in   → can see Carol, Dave, Eve, Frank (4 subordinates — not Alice).
Carol logs in → can see Dave, Eve only.
Dave logs in  → sees no subordinates (leaf node).

**Implementation:** MySQL 8 recursive CTE in `middleware/auth.js → getSubordinateIds()`.

---

## Token Invalidation

JWT tokens are stateless — normally valid until expiry (7 days). When a user is
deactivated, we need immediate revocation without waiting 7 days.

**How it works:**
1. User deactivated → insert `user_id` into `invalidated_tokens` table
2. Every authenticated request checks this table (60s memory cache, then DB lookup)
3. If found → 401 ACCOUNT_DEACTIVATED, regardless of JWT validity
4. User reactivated → delete from `invalidated_tokens`, call `clearInvalidationCache(userId)`

**Performance:** For active users, the cache means zero DB hits per request after
the first 60 seconds. The table stays small — only deactivated users have rows.

---

## users ↔ employees Link

Not every user is an employee in the employee table, and not every employee has a login.

| User type | `users.employee_id` | Notes |
|---|---|---|
| Admin (HR, system) | `NULL` | Not in employee list |
| Manager | The manager's `employees.id` | Linked so hierarchy works |
| Employee (self-service) | Their `employees.id` | Read-only access to own record |

When building the self-service employee portal (future phase), the route will use
`req.user.employee_id` to filter: `WHERE employees.id = req.user.employee_id`.

---

## Future: Admin Change Flagging (Post-Launch)

When an admin edits a meeting record or appraisal score, the change will be placed
in a `pending_changes` state and flagged for approval by the relevant manager before
becoming final. Not built yet — deferred to post-launch.
