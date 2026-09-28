#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="/opt/eas-v2"
DEPLOY_DIR="$ROOT_DIR/deploy"
BACKUP_SCRIPT="$ROOT_DIR/scripts/db-backup.sh"
REMOTE_NAME="origin"
EXPECTED_BRANCH="main"
HEALTH_URL="http://localhost/api/health"
EXECUTE=false

info() {
    printf '\033[36mINFO:\033[0m %s\n' "$*"
}

pass() {
    printf '\033[32mPASS:\033[0m %s\n' "$*"
}

fail() {
    printf '\033[31mERROR:\033[0m %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'USAGE'
Usage:
  ./scripts/promote-production.sh
      Run all read-only preflight checks.

  ./scripts/promote-production.sh --execute
      Back up the database, build production images, recreate services,
      and verify production health.
USAGE
}

case "${1:-}" in
    "")
        ;;
    --execute)
        EXECUTE=true
        ;;
    -h|--help)
        usage
        exit 0
        ;;
    *)
        usage
        fail "Unknown argument: $1"
        ;;
esac

cd "$ROOT_DIR"

command -v git >/dev/null 2>&1 ||
    fail "Git is not installed."

command -v docker >/dev/null 2>&1 ||
    fail "Docker is not installed."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fail "$ROOT_DIR is not a Git working tree."

current_branch="$(git branch --show-current)"

[ "$current_branch" = "$EXPECTED_BRANCH" ] ||
    fail "Production promotion requires branch '$EXPECTED_BRANCH'; current branch is '$current_branch'."

if [ -n "$(git status --porcelain)" ]; then
    git status --short
    fail "Working tree is not clean."
fi

info "Fetching current remote references."
git fetch --prune "$REMOTE_NAME"

local_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "$REMOTE_NAME/$EXPECTED_BRANCH")"

[ "$local_commit" = "$remote_commit" ] ||
    fail "Local main does not exactly match $REMOTE_NAME/$EXPECTED_BRANCH."

pass "Git branch and working-tree checks passed."

(
    cd "$DEPLOY_DIR"
    docker compose config --quiet
) || fail "Production Compose configuration is invalid."

pass "Production Compose configuration is valid."

if [ "$EXECUTE" != true ]; then
    echo
    pass "Dry-run preflight completed."
    echo "No backup, build, container recreation, or deployment was performed."
    echo
    echo "To execute the approved production promotion:"
    echo "  ./scripts/promote-production.sh --execute"
    exit 0
fi

[ -x "$BACKUP_SCRIPT" ] ||
    fail "Backup script is missing or not executable: $BACKUP_SCRIPT"

info "Creating production database backup."
"$BACKUP_SCRIPT"

latest_backup="$(
    find "$ROOT_DIR/backups" \
        -maxdepth 1 \
        -type f \
        -name 'eas-*.sql' \
        -printf '%T@ %p\n' |
    sort -nr |
    head -1 |
    cut -d' ' -f2-
)"

[ -n "$latest_backup" ] ||
    fail "No database backup was found after backup execution."

[ -s "$latest_backup" ] ||
    fail "Latest database backup is empty: $latest_backup"

pass "Database backup created: $latest_backup"

info "Building production images using locked dependencies."
(
    cd "$DEPLOY_DIR"
    docker compose build
) || fail "Production image build failed."

info "Starting production services."
(
    cd "$DEPLOY_DIR"
    docker compose up -d
) || fail "Production Compose startup failed."

info "Waiting for production health."

for attempt in $(seq 1 36); do
    if curl -fsS "$HEALTH_URL" >/tmp/eas-production-health.json 2>/dev/null; then
        pass "Production health check passed."
        cat /tmp/eas-production-health.json
        echo
        break
    fi

    if [ "$attempt" -eq 36 ]; then
        (
            cd "$DEPLOY_DIR"
            docker compose ps
            docker compose logs --tail=150 mysql backend frontend
        )
        fail "Production did not become healthy within 180 seconds."
    fi

    sleep 5
done

(
    cd "$DEPLOY_DIR"
    docker compose ps
)

echo
pass "Production promotion completed successfully."
echo "Commit : $local_commit"
echo "Backup : $latest_backup"
