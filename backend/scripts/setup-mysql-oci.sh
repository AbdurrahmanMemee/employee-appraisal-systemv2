#!/bin/bash
# =============================================================================
# setup-mysql-oci.sh
# MySQL setup script for OCI Ubuntu instances.
#
# On OCI/Ubuntu, MySQL root uses auth_socket (OS-level auth) — no password.
# This script uses `sudo mysql` to create a dedicated app user and database,
# then runs the Node.js seed to create tables and the default admin account.
#
# Usage:
#   chmod +x scripts/setup-mysql-oci.sh
#   ./scripts/setup-mysql-oci.sh
#
# Run from the backend/ directory.
# =============================================================================

set -e  # Exit on any error

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Config (edit if needed) ───────────────────────────────────────────────────
DB_NAME="employee_appraisals"
DB_USER="appraisal_user"
DB_PASS="YourSecurePassword123!"   # Change this to something strong
ENV_FILE=".env"

echo ""
echo "=============================================="
echo "  Employee Appraisal System — MySQL OCI Setup"
echo "=============================================="
echo ""

# ── Prereq checks ────────────────────────────────────────────────────────────
if ! command -v mysql &>/dev/null; then
  error "mysql client not found. Install with: sudo apt install mysql-client"
  exit 1
fi

if ! command -v node &>/dev/null; then
  error "node not found. Install Node.js 18+ before running this script."
  exit 1
fi

# Confirm we're in the backend directory
if [ ! -f "package.json" ]; then
  error "Run this script from the backend/ directory."
  exit 1
fi

# ── Step 1: Create DB and app user via sudo mysql ────────────────────────────
info "Creating database '${DB_NAME}' and user '${DB_USER}' via sudo mysql..."
echo "(You may be prompted for your sudo password)"
echo ""

sudo mysql <<SQL
-- Create database
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Drop user if it exists so we can recreate cleanly
DROP USER IF EXISTS '${DB_USER}'@'localhost';

-- Create app user with password auth (NOT auth_socket)
CREATE USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';

-- Grant all privileges on the app database only
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';


FLUSH PRIVILEGES;
SQL

success "Database and user created"

# ── Step 2: Update .env ───────────────────────────────────────────────────────
info "Updating ${ENV_FILE}..."

if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example "$ENV_FILE"
    info "Copied .env.example → .env"
  else
    error ".env file not found and no .env.example to copy from."
    exit 1
  fi
fi

# Use sed to replace DB_ values in .env
sed -i "s|^DB_USER=.*|DB_USER=${DB_USER}|"     "$ENV_FILE"
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" "$ENV_FILE"
sed -i "s|^DB_NAME=.*|DB_NAME=${DB_NAME}|"     "$ENV_FILE"
sed -i "s|^DB_HOST=.*|DB_HOST=localhost|"      "$ENV_FILE"

success ".env updated with app user credentials"

# ── Step 3: Install Node dependencies ────────────────────────────────────────
info "Installing Node.js dependencies..."
npm install --omit=dev 2>&1 | tail -5
success "Dependencies installed"

# ── Step 4: Run the Node seed script ─────────────────────────────────────────
info "Running seed script (creates tables + default admin user)..."
echo ""
node scripts/seed.js
echo ""

# ── Step 5: Print summary ────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo -e "${GREEN}  Setup complete!${NC}"
echo "=============================================="
echo ""
echo "  Database : ${DB_NAME}"
echo "  DB User  : ${DB_USER}"
echo "  DB Pass  : ${DB_PASS}"
echo ""
echo "  App login  →  admin / Admin123!"
echo ""
echo -e "${YELLOW}  IMPORTANT: Change both passwords after first login:${NC}"
echo "    - App admin password via the UI or /api/auth/change-password"
echo "    - DB password: sudo mysql -e \"ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY 'newpassword'; FLUSH PRIVILEGES;\""
echo ""
echo "  Start the server:"
echo "    npm run dev      # development"
echo "    npm start        # production"
echo ""
