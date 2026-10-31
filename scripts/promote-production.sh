#!/usr/bin/env bash
set -Eeuo pipefail

# =============================================================================
# FILE:    scripts/promote-production.sh
# PURPOSE: Controlled EAS v2 promotion workflow.
#
# SOURCE:
#   /opt/eas-v2/appraisal-v2-dev/
#
# TRACKED PRODUCTION SOURCE:
#   /opt/eas-v2/appraisal-v2/
#
# ENVIRONMENTS:
#   Dev:        /opt/eas-v2/dev/     port 8080
#   Production: /opt/eas-v2/deploy/  port 80
#
# MODES:
#   No arguments:
#     Read-only preflight and rsync preview.
#
#   --execute:
#     1. Verify dev health
#     2. Synchronize dev source into tracked production source
#     3. Validate synchronized source and Compose configuration
#     4. Commit and push the production-source change on main
#     5. Back up the production database
#     6. Build and restart production
#     7. Verify production health
#
# IMPORTANT:
#   - Dev source remains Git-ignored.
#   - No Git commits are created during dev iteration.
#   - Promotion must start from clean, synchronized main.
#   - Runtime files, secrets, dependencies and build outputs are excluded.
# =============================================================================

ROOT_DIR="/opt/eas-v2"
DEV_SOURCE_DIR="$ROOT_DIR/appraisal-v2-dev"
PROD_SOURCE_DIR="$ROOT_DIR/appraisal-v2"
DEV_ENV_DIR="$ROOT_DIR/dev"
DEPLOY_DIR="$ROOT_DIR/deploy"
BACKUP_SCRIPT="$ROOT_DIR/scripts/db-backup.sh"

REMOTE_NAME="origin"
EXPECTED_BRANCH="main"

DEV_HEALTH_URL="${DEV_HEALTH_URL:-http://localhost:8080/api/health}"
PROD_HEALTH_URL="${PROD_HEALTH_URL:-http://localhost/api/health}"

COMMIT_MESSAGE="${EAS_RELEASE_MESSAGE:-chore: promote verified dev source to production}"
SESSION_LOG_INPUT="${EAS_SESSION_LOG:-}"
SESSION_LOG_SOURCE=""
SESSION_LOG_RELATIVE=""
SESSION_LOG_DESTINATION=""
EXECUTE=false

info() {
    printf '\033[36mINFO:\033[0m %s\n' "$*"
}

pass() {
    printf '\033[32mPASS:\033[0m %s\n' "$*"
}

warn() {
    printf '\033[33mWARN:\033[0m %s\n' "$*" >&2
}

fail() {
    printf '\033[31mERROR:\033[0m %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'USAGE'
Usage:
  bash /opt/eas-v2/scripts/promote-production.sh

      Run read-only preflight checks and show the files that would be
      synchronized from appraisal-v2-dev to appraisal-v2.

  bash /opt/eas-v2/scripts/promote-production.sh --execute

      Synchronize verified dev source, commit and push the release on main,
      back up the production database, rebuild production, and verify health.

Required session log:
  EAS_SESSION_LOG="docs/session-logs/PROJECT_SESSION_LOG_v22.md" \
    bash /opt/eas-v2/scripts/promote-production.sh

Execute with a release message:
  EAS_RELEASE_MESSAGE="fix: expose employee ID in employee forms" \
  EAS_SESSION_LOG="docs/session-logs/PROJECT_SESSION_LOG_v22.md" \
    bash /opt/eas-v2/scripts/promote-production.sh --execute

The session-log path must be relative to:
  /opt/eas-v2/appraisal-v2-dev/
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

require_command() {
    local command_name="$1"

    command -v "$command_name" >/dev/null 2>&1 ||
        fail "Required command is not installed: $command_name"
}

validate_session_log() {
    local dev_source_real
    local session_log_real
    local session_log_dir
    local session_log_name

    [ -n "$SESSION_LOG_INPUT" ] ||
        fail "EAS_SESSION_LOG is required. Provide a path relative to $DEV_SOURCE_DIR."

    case "$SESSION_LOG_INPUT" in
        /*)
            fail "EAS_SESSION_LOG must be relative to $DEV_SOURCE_DIR, not an absolute path."
            ;;
    esac

    case "$SESSION_LOG_INPUT" in
        *.md)
            ;;
        *)
            fail "EAS_SESSION_LOG must identify a Markdown file ending in .md."
            ;;
    esac

    SESSION_LOG_SOURCE="$DEV_SOURCE_DIR/$SESSION_LOG_INPUT"

    [ -e "$SESSION_LOG_SOURCE" ] ||
        fail "Session log does not exist: $SESSION_LOG_SOURCE"

    [ ! -L "$SESSION_LOG_SOURCE" ] ||
        fail "Session log must not be a symbolic link: $SESSION_LOG_SOURCE"

    [ -f "$SESSION_LOG_SOURCE" ] ||
        fail "Session log is not a regular file: $SESSION_LOG_SOURCE"

    [ -s "$SESSION_LOG_SOURCE" ] ||
        fail "Session log is empty: $SESSION_LOG_SOURCE"

    session_log_dir="$(dirname "$SESSION_LOG_SOURCE")"
    session_log_name="$(basename "$SESSION_LOG_SOURCE")"

    dev_source_real="$(cd "$DEV_SOURCE_DIR" && pwd -P)"
    session_log_real="$(cd "$session_log_dir" && pwd -P)/$session_log_name"

    case "$session_log_real" in
        "$dev_source_real"/*)
            ;;
        *)
            fail "Session log resolves outside the approved dev source: $session_log_real"
            ;;
    esac

    SESSION_LOG_SOURCE="$session_log_real"
    SESSION_LOG_RELATIVE="${SESSION_LOG_SOURCE#"$dev_source_real"/}"
    SESSION_LOG_DESTINATION="$PROD_SOURCE_DIR/$SESSION_LOG_RELATIVE"

    case "$SESSION_LOG_RELATIVE" in
        docs/session-logs/PROJECT_SESSION_LOG_v*.md)
            ;;
        *)
            fail "Session log must match docs/session-logs/PROJECT_SESSION_LOG_v*.md"
            ;;
    esac

    if grep -Eq 'MYSQL_.*PASSWORD|JWT_SECRET|BEGIN (RSA |OPENSSH )?PRIVATE KEY' \
        "$SESSION_LOG_SOURCE"; then
        fail "Session log appears to contain a secret or private key."
    fi

    pass "Session log validation passed."
    info "Session log: $SESSION_LOG_RELATIVE"
}

wait_for_health() {
    local url="$1"
    local output_file="$2"
    local description="$3"
    local compose_dir="$4"
    local attempts="${5:-36}"

    info "Waiting for $description health: $url"

    for attempt in $(seq 1 "$attempts"); do
        if curl -fsS "$url" >"$output_file" 2>/dev/null; then
            pass "$description health check passed."
            cat "$output_file"
            echo
            return 0
        fi

        if [ "$attempt" -eq "$attempts" ]; then
            (
                cd "$compose_dir"
                docker compose ps
                docker compose logs --tail=150
            ) || true

            fail "$description did not become healthy within $((attempts * 5)) seconds."
        fi

        sleep 5
    done
}

rsync_source() {
    local dry_run_flag=()

    if [ "$EXECUTE" != true ]; then
        dry_run_flag=(--dry-run)
    fi

    rsync \
        -a \
        --delete \
        --itemize-changes \
        "${dry_run_flag[@]}" \
        --exclude='.git/' \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='node_modules/' \
        --exclude='dist/' \
        --exclude='build/' \
        --exclude='coverage/' \
        --exclude='uploads/' \
        --exclude='logs/' \
        --exclude='*.log' \
        --exclude='*.pid' \
        --exclude='*.tmp' \
        --exclude='.DS_Store' \
        "$DEV_SOURCE_DIR/" \
        "$PROD_SOURCE_DIR/"
}

cd "$ROOT_DIR"

require_command git
require_command docker
require_command curl
require_command rsync
require_command find
require_command sort
require_command head
require_command cut
require_command grep
require_command cmp
require_command dirname
require_command basename

[ -d "$DEV_SOURCE_DIR" ] ||
    fail "Dev source directory does not exist: $DEV_SOURCE_DIR"

[ -d "$PROD_SOURCE_DIR" ] ||
    fail "Production source directory does not exist: $PROD_SOURCE_DIR"

[ -d "$DEV_ENV_DIR" ] ||
    fail "Dev Compose directory does not exist: $DEV_ENV_DIR"

[ -d "$DEPLOY_DIR" ] ||
    fail "Production Compose directory does not exist: $DEPLOY_DIR"

validate_session_log

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fail "$ROOT_DIR is not a Git working tree."

current_branch="$(git branch --show-current)"

[ "$current_branch" = "$EXPECTED_BRANCH" ] ||
    fail "Promotion must start on '$EXPECTED_BRANCH'; current branch is '$current_branch'."

if [ -n "$(git status --porcelain)" ]; then
    git status --short
    fail "Working tree must be clean before promotion."
fi

info "Fetching current remote references."
git fetch --prune "$REMOTE_NAME"

local_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "$REMOTE_NAME/$EXPECTED_BRANCH")"

[ "$local_commit" = "$remote_commit" ] ||
    fail "Local main does not exactly match $REMOTE_NAME/$EXPECTED_BRANCH."

pass "Git branch, remote synchronization, and working-tree checks passed."

info "Validating Dev Compose configuration."
(
    cd "$DEV_ENV_DIR"
    docker compose config --quiet
) || fail "Dev Compose configuration is invalid."

pass "Dev Compose configuration is valid."

info "Checking current dev container status."
(
    cd "$DEV_ENV_DIR"
    docker compose ps
)

if ! curl -fsS "$DEV_HEALTH_URL" >/tmp/eas-dev-health.json 2>/dev/null; then
    (
        cd "$DEV_ENV_DIR"
        docker compose ps
        docker compose logs --tail=150 backend frontend
    ) || true

    fail "Dev health check failed: $DEV_HEALTH_URL"
fi

pass "Dev health check passed."
cat /tmp/eas-dev-health.json
echo

info "Validating production Compose configuration."
(
    cd "$DEPLOY_DIR"
    docker compose config --quiet
) || fail "Production Compose configuration is invalid."

pass "Production Compose configuration is valid."

echo
info "Dev-to-production source synchronization preview:"
rsync_source
echo
info "Required release session log:"
echo "  Source      : $SESSION_LOG_SOURCE"
echo "  Destination : $SESSION_LOG_DESTINATION"
echo

if [ "$EXECUTE" != true ]; then
    pass "Promotion preflight completed."
    echo "No files were copied, committed, pushed, built, or deployed."
    echo
    echo "Review the synchronization preview above."
    echo
    echo "To execute the controlled promotion:"
    echo "  EAS_RELEASE_MESSAGE=\"fix: describe the verified change\" \\"
    echo "  EAS_SESSION_LOG=\"$SESSION_LOG_RELATIVE\" \\"
    echo "    bash /opt/eas-v2/scripts/promote-production.sh --execute"
    exit 0
fi

info "Synchronizing verified dev source into tracked production source."
rsync_source

[ -f "$SESSION_LOG_DESTINATION" ] ||
    fail "Session log was not synchronized into production source: $SESSION_LOG_DESTINATION"

[ ! -L "$SESSION_LOG_DESTINATION" ] ||
    fail "Synchronized session log must not be a symbolic link: $SESSION_LOG_DESTINATION"

if ! cmp -s "$SESSION_LOG_SOURCE" "$SESSION_LOG_DESTINATION"; then
    fail "Synchronized session log does not match the approved dev session log."
fi

pass "Session log synchronized and verified: $SESSION_LOG_RELATIVE"

if [ -z "$(git status --porcelain -- "$PROD_SOURCE_DIR")" ]; then
    warn "Dev and tracked production source are already identical."
    warn "No release commit is required."
else
    info "Checking synchronized source for whitespace errors."

    if ! git diff --check -- "$PROD_SOURCE_DIR"; then
        fail "Synchronized source contains whitespace errors."
    fi

    info "Changed production-source files:"
    git status --short -- "$PROD_SOURCE_DIR"

    info "Staging synchronized production source."
    git add -A -- "$PROD_SOURCE_DIR"

    if git diff --cached --quiet -- "$PROD_SOURCE_DIR"; then
        fail "No staged production-source changes were found after synchronization."
    fi

    if ! git diff --cached --check; then
        git reset -- "$PROD_SOURCE_DIR"
        fail "Staged release contains whitespace errors."
    fi

    echo
    info "Release summary:"
    git diff --cached --stat
    echo

    info "Creating release commit."
    git commit -m "$COMMIT_MESSAGE"

    release_commit="$(git rev-parse HEAD)"
    pass "Release commit created: $release_commit"

    info "Pushing release commit to $REMOTE_NAME/$EXPECTED_BRANCH."
    git push "$REMOTE_NAME" "$EXPECTED_BRANCH"

    git fetch "$REMOTE_NAME" "$EXPECTED_BRANCH"

    pushed_commit="$(git rev-parse "$REMOTE_NAME/$EXPECTED_BRANCH")"

    [ "$release_commit" = "$pushed_commit" ] ||
        fail "Pushed main does not match the local release commit."

    pass "Release commit pushed successfully."
fi

if [ -n "$(git status --porcelain)" ]; then
    git status --short
    fail "Working tree is not clean after release synchronization."
fi

current_commit="$(git rev-parse HEAD)"
current_remote_commit="$(git rev-parse "$REMOTE_NAME/$EXPECTED_BRANCH")"

[ "$current_commit" = "$current_remote_commit" ] ||
    fail "Local main no longer matches $REMOTE_NAME/$EXPECTED_BRANCH."

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

info "Revalidating production Compose configuration after source synchronization."
(
    cd "$DEPLOY_DIR"
    docker compose config --quiet
) || fail "Production Compose configuration is invalid after synchronization."

info "Building production images using locked container dependencies."
(
    cd "$DEPLOY_DIR"
    docker compose build
) || fail "Production image build failed."

info "Starting production services."
(
    cd "$DEPLOY_DIR"
    docker compose up -d
) || fail "Production Compose startup failed."

wait_for_health \
    "$PROD_HEALTH_URL" \
    "/tmp/eas-production-health.json" \
    "Production" \
    "$DEPLOY_DIR" \
    36

(
    cd "$DEPLOY_DIR"
    docker compose ps
)

echo
pass "Production promotion completed successfully."
echo "Commit : $(git rev-parse HEAD)"
echo "Backup : $latest_backup"
