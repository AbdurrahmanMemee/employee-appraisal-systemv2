# Employee Appraisal System (EAS v2)

## Project Session Log v21

Date: 2026-09-28

---

# Session Summary

This session focused on repository hygiene, infrastructure hardening, deployment safety, backup validation, upload persistence validation, and production workflow control.

All P0 and P1 hardening objectives were completed.

---

# Completed Work

## Repository Hygiene

Completed:

- Resolved root `.gitignore` merge conflict.
- Replaced `.gitignore` with Docker-aware version.
- Added protection for:
  - `.env`
  - `.env.*`
  - uploads
  - backups
  - build artefacts
  - node_modules
- Removed tracked legacy `appraisal-v1/.env`.
- Introduced backup-file ignore rules.

---

## Git Workflow Hardening

Created branch:

```text
chore/docker-repository-baseline-20260928
```

Published to GitHub.

Replaced legacy deploy workflow.

Old deploy.sh:

- auto-added all files
- auto-created commits
- switched branches automatically
- pulled main automatically

New deploy.sh:

- refuses dirty working tree
- refuses detached HEAD
- refuses protected branches
- performs repository safety checks
- publishes only the current branch
- does not commit
- does not deploy

---

## Docker Improvements

Added to source control:

- backend Dockerfile
- frontend Dockerfile
- dev docker-compose.yml
- production docker-compose.yml
- dev nginx.conf
- production nginx.conf

---

## Build Reproducibility

Backend:

```text
npm install --omit=dev
→
npm ci --omit=dev
```

Frontend:

```text
npm install
→
npm ci
```

Validation:

- backend image build successful
- frontend image build successful

---

## Health Check Hardening

Removed:

```text
GET /health
```

Standardised:

```text
GET /api/health
```

New behaviour:

- executes SELECT 1
- returns 200 only if DB reachable
- returns 503 if DB unavailable
- hides internal SQL errors

Validated:

- MySQL stopped → 503
- MySQL restarted → 200

---

## Nginx Hardening

Added:

```nginx
client_max_body_size 20M;
```

Validated:

- dev nginx syntax valid
- production nginx syntax valid

---

## Docker Log Rotation

Added:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
```

Applied to:

- mysql
- backend
- frontend

In:

- dev/docker-compose.yml
- deploy/docker-compose.yml

---

## Frontend Routing Fix

Removed duplicate:

```text
/incidents
```

Result:

- exactly one incident route
- route behaviour aligns with role architecture

---

## Environment Validation

Development:

```text
FRONTEND_URL=http://145.241.184.113:8080
```

Production:

```text
FRONTEND_URL=http://145.241.184.113
```

Validated against actual deployment endpoints.

---

## Upload Persistence Validation

Test file:

```text
/app/uploads/meetings/2026-09/1790556683087-0weuxmdo.pdf
```

Validated:

- file exists before restart
- survives backend restart
- survives backend recreation
- application remains healthy

Conclusion:

```text
Docker upload volume functioning correctly
```

---

## Database Backup Restore Validation

Backup:

```text
backups/eas-2026-09-27_23-32-37.sql
```

Restore target:

```text
employee_appraisal_v2_restore_test
```

Restore successful.

Validated:

- tables restored
- schema restored
- users restored
- employees restored

Row counts:

```text
users       = 2
employees   = 15
meetings    = 0
appraisals  = 0
incidents   = 0
```

Conclusion:

```text
Backup recovery confirmed working
```

---

## Production Promotion Workflow

Created:

```text
scripts/promote-production.sh
```

Features:

- clean-tree enforcement
- main-branch enforcement
- compose validation
- backup validation
- health verification
- dry-run mode

---

# Current Deployment Model

Development:

```text
/opt/eas-v2/appraisal-v2-dev
        ↓
dev docker stack
        ↓
http://145.241.184.113:8080
```

Production:

```text
/opt/eas-v2/appraisal-v2
        ↓
deploy docker stack
        ↓
http://145.241.184.113
```

---

# Current Workflow

Development:

```text
appraisal-v2-dev
→ test
→ validate
```

Promotion:

```text
copy approved changes
→ appraisal-v2
→ git commit
→ ./deploy.sh
→ GitHub PR
→ merge
```

Production:

```text
main
→ ./scripts/promote-production.sh
```

---

# Status

## P0

Complete.

## P1

Complete.

## Remaining Work

P2 Documentation

- update README
- update architecture diagrams
- document promotion workflow

P3 Future Enhancements

- SMTP calendar invitations
- audit viewer
- CSV exports
- enhancement backlog

---

# Platform State

Repository Hygiene: ✅ Complete

Docker Hardening: ✅ Complete

Health Monitoring: ✅ Complete

Build Reproducibility: ✅ Complete

Upload Persistence: ✅ Complete

Backup Recovery: ✅ Complete

Promotion Workflow: ✅ Complete

Production Readiness: ✅ High
