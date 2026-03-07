# EAS v2 — Frontend README

**Employee Appraisal System v2 — React Frontend**

Location on server: `/var/www/appraisal-system/appraisal-v2/frontend/`

---

## Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | 5.x | Build tool + dev server |
| React | 18.x | UI framework |
| React Router | 6.x | Client-side routing |
| Zustand | 4.x | Global state management |
| Axios | 1.x | HTTP client |
| Tailwind CSS | 3.x | Utility-first styling |

---

## Quick Start

```bash
cd /var/www/appraisal-system/appraisal-v2/frontend

# Install dependencies (first time only)
npm install

# Start dev server (accessible on the network)
npm run dev
# → http://145.241.184.113:3000

# Production build
npm run build
# → outputs to dist/

# Run foundation test suite
node scripts/test-frontend-foundation.cjs
node scripts/test-frontend-foundation.cjs --full   # includes vite build (~60s)
```

**Default login:** `admin` / `Admin123!`

---

## File Structure

```
frontend/
├── index.html                        Entry point HTML
├── package.json                      Dependencies + npm scripts
├── vite.config.js                    Vite config — port 3000, host 0.0.0.0, API proxy
├── tailwind.config.js                Tailwind config
├── postcss.config.js                 PostCSS config (required by Tailwind)
│
└── src/
    ├── index.css                     Tailwind base/components/utilities
    ├── main.jsx                      ReactDOM root — wraps app in BrowserRouter
    ├── App.jsx                       All routes + ErrorBoundary + Protected helper
    │
    ├── services/
    │   └── api.js                    All HTTP calls — one named export per resource
    │
    ├── store/
    │   └── useAppStore.js            Zustand global store — auth, config, toasts
    │
    ├── hooks/
    │   ├── useApi.js                 Generic data-fetching hook
    │   └── useFormValidation.js      Form validation hook
    │
    ├── components/
    │   ├── ui/
    │   │   └── index.jsx             14 reusable UI primitives
    │   └── layout/
    │       ├── AppLayout.jsx         Navbar + tab nav + toast stack
    │       └── AuthGuard.jsx         Route protection + role checks
    │
    └── pages/
        ├── LoginPage.jsx             Login form
        ├── DashboardPage.jsx         Dashboard — stats, upcoming, activity, dept table
        ├── EmployeesPage.jsx         Employees — list, detail, create/edit form
        ├── MeetingsPage.jsx          Meetings — list, detail, create/edit form, last-meeting link
        └── Placeholder.jsx           Stubs for modules not yet built
```

---

## Routing

All routes are defined in `App.jsx`.

| Path | Component | Access |
|------|-----------|--------|
| `/login` | LoginPage | Public |
| `/dashboard` | DashboardPage | All roles |
| `/employees` | EmployeesPage | All roles |
| `/schedules` | SchedulesPage | All roles |
| `/incidents` | IncidentsPage | Manager + Admin |
| `/config` | ConfigPage | Admin only |
| `/` | Redirect | → `/dashboard` or `/login` |

Protected routes are wrapped in `<AuthGuard>` + `<AppLayout>` + `<ErrorBoundary>` via the `<Protected>` helper component in `App.jsx`.

**Adding a new module:** build the page component, then swap its `Placeholder` import in `App.jsx` for the real one:
```jsx
// Before
import { AppraisalsPage } from './pages/Placeholder';

// After
import AppraisalsPage from './pages/AppraisalsPage';
```

---

## API Service Layer (`src/services/api.js`)

Components **never** call Axios directly. Always use the named API exports.

### Available exports

```js
import { authAPI }      from '../services/api';  // login, logout, changePassword
import { employeeAPI }  from '../services/api';  // CRUD employees
import { meetingAPI }   from '../services/api';  // CRUD meetings, PDF upload
import { appraisalAPI } from '../services/api';  // CRUD appraisals, sections
import { incidentAPI }  from '../services/api';  // CRUD incidents
import { scheduleAPI }  from '../services/api';  // CRUD schedules, invite
import { configAPI }    from '../services/api';  // dropdown config values
import { dashboardAPI } from '../services/api';  // stats, upcoming, activity, dept stats
```

> **Note:** the export names use `API` (uppercase) — `dashboardAPI` not `dashboardApi`.

### How it works

- All calls go through a single Axios instance with `baseURL = /api`
- JWT token (`eas_token` from localStorage) is auto-attached to every request via a request interceptor
- `401` responses automatically fire a `eas:unauthorized` custom DOM event, which `AuthGuard` listens for and uses to log the user out
- In dev, Vite proxies `/api` and `/uploads` to `http://localhost:5001` — no CORS issues
- The API methods already unwrap the response: they return `res.data` (the parsed JSON body), **not** the raw Axios response. So in components, use `result.data` not `result.data.data`.

### Example usage

```js
import { employeeAPI } from '../services/api';

const res = await employeeAPI.getAll({ page: 1, limit: 20 });
// res.data?.employees → array of rows  (or res.employees as fallback)
// res.data?.pagination → { page, pages, total, limit }
```

---

## Global State (`src/store/useAppStore.js`)

Built with Zustand. Only truly global state lives here — everything else is local to the page.

### What's stored globally

| State | Description |
|-------|-------------|
| `user` | Logged-in user object (`id`, `username`, `role`, `full_name`) |
| `config` | Dropdown config values fetched after login |
| `toasts` | Active toast notifications (array) |

### Selectors (import these — don't read the store directly)

```js
import useAppStore, {
  useUser,        // → current user object or null
  useConfig,      // → config dropdowns object
  useToasts,      // → array of active toasts
  useIsAdmin,     // → boolean: role === 'admin'
  useIsManager,   // → boolean: role === 'admin' OR 'manager'
} from '../store/useAppStore';
```

### Actions

```js
const showToast   = useAppStore((s) => s.showToast);
const fetchConfig = useAppStore((s) => s.fetchConfig);

// Show a toast notification
showToast('Saved successfully!', 'success');        // type: success | error | warning | info
showToast('Something failed', 'error', 8000);       // optional duration in ms (default 4000)
```

### Persistence

- `eas_token` — JWT stored in `localStorage`
- `eas_user` — user object stored in `localStorage`
- Both are restored on page refresh automatically

---

## Hooks

### `useApi` (`src/hooks/useApi.js`)

Generic hook for data fetching with loading/error/data states and an unmount guard.

```js
import { useApi } from '../hooks/useApi';
import { employeeAPI } from '../services/api';

// Auto-fetch on mount
const { data, loading, error, refetch } = useApi(
  () => employeeAPI.getAll({ page: 1 }),
  []  // dependency array
);

// Manual mode (forms / submit handlers)
const { execute, loading } = useApi(null, [], { manual: true });
await execute(() => employeeAPI.create(formData));
```

### `useFormValidation` (`src/hooks/useFormValidation.js`)

Rule-based validation. Validates all fields on submit and individual fields on change.

```js
import { useFormValidation } from '../hooks/useFormValidation';

const rules = {
  first_name:      [{ type: 'required' }, { type: 'maxLength', value: 50 }],
  email:           [{ type: 'email' }],
  employee_number: [{ type: 'required' }],
};

const { errors, validateAll, validateField } = useFormValidation(rules);

// On field change
validateField('first_name', value);

// On submit — returns true if all pass
const valid = validateAll(formValues);
if (!valid) return;
```

**Available rule types:** `required`, `email`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `date`, `custom`

---

## UI Primitives (`src/components/ui/index.jsx`)

```js
import {
  Button, Badge, StatusBadge,
  Spinner, PageLoader,
  Card, CardHeader,
  Alert, EmptyState, ConfirmDialog, Modal,
  Field, Input, Select, Textarea,
  Pagination,
} from '../components/ui';
```

### Quick reference

```jsx
// Button — variant: primary | secondary | danger | ghost | success
<Button variant="primary" size="md" loading={saving} icon={Plus} onClick={fn}>Save</Button>

// Badge / StatusBadge
<Badge variant="green">Active</Badge>
<StatusBadge status="Active" />   // auto-colours: Active, Inactive, Draft, Completed, etc.

// Spinner / PageLoader
<Spinner size="sm" />   // xs | sm | md | lg | xl
<PageLoader />          // full-page centered spinner

// Card
<Card>
  <CardHeader title="Title" subtitle="Subtitle" action={<Button>...</Button>} />
  content
</Card>

// Alert
<Alert type="error" message="Something went wrong" onDismiss={() => {}} />

// EmptyState
<EmptyState icon={Users} title="No employees" message="Try adjusting filters."
  action={<Button size="sm">Add</Button>} />

// ConfirmDialog
<ConfirmDialog open={bool} danger title="Deactivate?" message="Are you sure?"
  onConfirm={fn} onCancel={fn} />

// Modal
<Modal open={bool} onClose={fn} title="Edit Employee" size="lg">...</Modal>

// Form fields — always wrap in Field for label + error
<Field label="First Name" required error={errors.first_name}>
  <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
    error={errors.first_name} placeholder="Jane" />
</Field>

<Field label="Department">
  <Select value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
    <option value="">Select…</option>
    {config.departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
  </Select>
</Field>

<Field label="Notes">
  <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
</Field>

// Pagination — shape from API: { page, pages, total, limit }
<Pagination pagination={pagination} onPageChange={(p) => setPage(p)} />
```

---

## Layout Components

### `AppLayout` (`src/components/layout/AppLayout.jsx`)

Wraps all protected pages. Provides sticky navbar, role-filtered tab nav, and toast stack.

**Nav tabs by role:**

| Tab | Employee | Manager | Admin |
|-----|----------|---------|-------|
| Dashboard | ✅ | ✅ | ✅ |
| Employees | ✅ | ✅ | ✅ |
| Schedules | ✅ | ✅ | ✅ |
| Incidents | ❌ | ✅ | ✅ |
| Config | ❌ | ❌ | ✅ |

### `AuthGuard` (`src/components/layout/AuthGuard.jsx`)

Redirects to `/login` if unauthenticated or below `requiredRole`. Listens for `eas:unauthorized` to auto-logout on 401.

**Role hierarchy:** `employee` < `manager` < `admin`

---

## Pages

### Dashboard (`src/pages/DashboardPage.jsx`) ✅

Read-only. All 4 sections fetch in parallel. Each handles its own loading/error independently.

```
GET /api/dashboard/stats
GET /api/dashboard/upcoming?days=60
GET /api/dashboard/recent-activity?limit=20
GET /api/dashboard/department-stats
```

---

### Employees (`src/pages/EmployeesPage.jsx`) ✅

Three internal views (no URL change), controlled by `view` state: `'list'` → `'detail'` or `'form'`.

**List view**
- Paginated table (PAGE_SIZE = 20), columns: Name + job title, Department, Status
- Sortable columns: Name, Department, Status
- Debounced search (350ms) by name / employee number
- Filter dropdowns: Department (from config), Status (Active / Inactive / All)
- Refresh button, "Add Employee" visible to Manager + Admin only

**Detail view**
- Breadcrumb: Employees › Name
- Profile header with avatar initials, status badge, avg rating (if available)
- Two info cards: Personal Information (employee number, ID, email, phone, start date) and Role & Reporting (job title, department, manager, last meeting, last/next appraisal)
- Notes card (if notes present)
- Edit button (Manager + Admin) · Deactivate button (Admin, active only) · Restore button (Admin, inactive only)
- Deactivate triggers ConfirmDialog before API call

**Form view** (create + edit, same component)
- Fields: First Name\*, Last Name\*, Employee Number\*, ID/Passport, Email, Phone, Department, Job Title, Manager, Start Date, Notes (\* = required)
- Manager dropdown populated from `employeeAPI.getAll({ status: 'active', limit: 200 })`, excludes self
- `validateAll()` called on submit — stops submission if any required field is empty or email is invalid
- On success: `showToast`, returns to list, increments `listKey` to force list re-fetch

**Role rules:**

| Action | Employee | Manager | Admin |
|--------|----------|---------|-------|
| View list + detail | ✅ | ✅ | ✅ |
| Create + edit | ❌ | ✅ | ✅ |
| Deactivate + restore | ❌ | ❌ | ✅ |

**API calls:**
```
GET    /api/employees?page=&limit=&sort=&dir=&search=&department=&status=
GET    /api/employees/:id
POST   /api/employees
PUT    /api/employees/:id
DELETE /api/employees/:id       (soft delete — sets is_active = false)
POST   /api/employees/:id/restore
```

---

### Meetings (`src/pages/MeetingsPage.jsx`) ✅

Three internal views (no URL change), controlled by `view` state: `'list'` → `'detail'` or `'form'`.

**List view**
- Paginated table (PAGE_SIZE = 20), columns: Date, Employee + Department, Type, Conclusion (truncated), Attachment indicator
- Client-side sort by Date or Employee Name
- Filter dropdowns: Employee (from active employees), Meeting Type (from config), Date From / Date To
- Clear filters button, Refresh button
- "New Meeting" button visible to Manager + Admin only

**Detail view**
- Breadcrumb: Meetings › Employee Name — Date
- Header card with meeting type badge and Edit / Delete buttons
- Two info cards: Meeting Details (date, employee, people present, recorded by) and Brief Note + attachment download link
- Conclusion card (full text)
- Detailed Summary card (if present)
- Delete requires ConfirmDialog — Admin only, hard delete, removes PDF from disk

**Form view** (create + edit, same component)
- Fields: Employee\*, Meeting Date\* (defaults to today), Meeting Type\*, People Present, Brief Note, Detailed Summary, Conclusion\*, PDF Attachment (\* = required)
- Employee selector **locked on edit** — cannot reassign a meeting to a different employee
- PDF file picker → multipart upload on create, `uploadAttachment` on edit
- Existing attachment preserved if no new file chosen on edit

**Last Meeting Link** (v2 required feature — was missing in v1)
- Appears automatically below the Employee selector whenever an employee is selected
- Fetches `GET /api/meetings?employee_id=X&limit=2` and shows the most recent previous meeting
- Displayed as a clickable blue banner: date + type + brief note preview
- Clicking navigates to that meeting's DetailView — Back button returns to the form, not the list
- On edit, excludes the meeting being edited from the lookup (won't link to itself)
- Shows "No previous meetings on record" if the employee has no prior meetings

**Role rules:**

| Action | Employee | Manager | Admin |
|--------|----------|---------|-------|
| View list + detail | ✅ | ✅ | ✅ |
| Create + edit | ❌ | ✅ | ✅ |
| Delete | ❌ | ❌ | ✅ |

**API calls:**
```
GET    /api/meetings?page=&limit=&employee_id=&meeting_type=&date_from=&date_to=
GET    /api/meetings/:id
POST   /api/meetings                        (JSON or multipart/form-data with attachment)
PUT    /api/meetings/:id                    (JSON — text fields only)
POST   /api/meetings/:id/attachment         (multipart — replace PDF)
DELETE /api/meetings/:id                    (hard delete — admin only)
```

All test scripts live in `frontend/scripts/`. Run from the `appraisal-v2/` directory:

```bash
node frontend/scripts/test-frontend-foundation.cjs          # ~50 checks
node frontend/scripts/test-frontend-foundation.cjs --full   # + npm install + vite build
node frontend/scripts/test-employees-frontend.cjs           # ~40 checks — Employees module
node frontend/scripts/test-meetings-frontend.cjs            # ~45 checks — Meetings module
```

---

## Modules Status

| Module | File | Status |
|--------|------|--------|
| Login | `src/pages/LoginPage.jsx` | ✅ Done |
| Dashboard | `src/pages/DashboardPage.jsx` | ✅ Done |
| Employees | `src/pages/EmployeesPage.jsx` | ✅ Done |
| Meetings | `src/pages/MeetingsPage.jsx` | ✅ Done |
| Appraisals | `src/pages/AppraisalsPage.jsx` | 🔄 Next |
| Incidents | `src/pages/IncidentsPage.jsx` | ⏳ Pending |
| Schedules | `src/pages/SchedulesPage.jsx` | ⏳ Pending |
| Config | `src/pages/ConfigPage.jsx` | ⏳ Pending |

---

## Known Gotchas

| Issue | Detail |
|-------|--------|
| `dashboardAPI` not `dashboardApi` | All API exports use uppercase `API` suffix |
| API already unwraps `.data` | Methods return `res.data` (the JSON body). Use `result.data`, not `result.data.data` |
| Vite needs `host: '0.0.0.0'` | Without this, Vite binds to localhost only — external connections refused |
| Token key is `eas_token` | Not `authToken` (used in v1). Must match everywhere |
| bcryptjs not bcrypt | Package installed is `bcryptjs`. Never use `require('bcrypt')` in any scripts |
| Shell `!` in passwords | Always use single quotes: `'Admin123!'` not `"Admin123!"` in bash |
| Test scripts location | All frontend tests live in `frontend/scripts/` — not `backend/scripts/` |
| `useFormValidation` is default export | `import useFormValidation from '../hooks/useFormValidation'` — no curly braces. Same for `useApi`. Always `grep "export"` on a hook file before importing it |
| employeeAPI response shape | `getAll()` returns `res.data` — access employees via `res.data?.employees \|\| res.data \|\| []` as the shape may vary |
