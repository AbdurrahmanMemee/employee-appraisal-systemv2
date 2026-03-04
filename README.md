# Employee Appraisal System

Full-stack web app for managing employee performance appraisals, meetings, and incidents.

## Tech Stack
- **Frontend**: React 18, Zustand, Tailwind CSS, Axios
- **Backend**: Node.js, Express.js, MySQL 8.0
- **Auth**: JWT + bcrypt
- **Security**: Helmet, rate limiting, CORS, parameterized SQL, input validation & sanitization, audit trail

## Quick Start

### 1. Database
```bash
mysql -u root -p < backend/database.sql
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env          # Edit with your DB credentials + JWT_SECRET
npm run dev                   # Tables auto-created on first start
```
Default login: **admin / Admin@1234!** — change immediately after first login!

### 3. Frontend
```bash
cd frontend
npm install
npm start                     # http://localhost:3000
```

## Key Files
| File | Purpose |
|------|---------|
| `backend/server.js` | Express entry point, all middleware |
| `backend/config/database.js` | MySQL pool + auto table init |
| `backend/routes/*.js` | REST API routes |
| `backend/middleware/authMiddleware.js` | JWT verification |
| `backend/utils/validation.js` | Server-side validation rules |
| `backend/utils/auditLogger.js` | Audit trail |
| `frontend/src/App.js` | Main app with auth |
| `frontend/src/store/useAppStore.js` | Zustand global state |
| `frontend/src/services/api.js` | All API calls |
| `frontend/src/utils/validation.js` | Client-side validation |
| `frontend/src/hooks/useFormValidation.js` | Form validation hook |

## Security Features
- JWT authentication on all routes
- Auth rate limiting (20 req/15min), global rate limiting (100 req/15min)
- Helmet security headers (CSP, HSTS, etc.)
- Parameterized SQL queries (no injection possible)
- Input validation client + server side
- Input sanitization (strip angle brackets)
- Audit trail on all data changes
- Soft delete (employees deactivated, not destroyed)
- RBAC (admin/manager/user roles)
- CORS locked to configured frontend URL in production

## Production Deployment
```bash
# Frontend build
cd frontend && npm run build

# Backend .env for production:
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
JWT_SECRET=<64+ char random string>
DB_SSL=true

# Start
cd backend && npm start
```
