#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="/opt/eas-v2"
REMOTE_NAME="origin"
PROTECTED_BRANCHES="main master production"

cd "$ROOT_DIR"

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

command -v git >/dev/null 2>&1 ||
    fail "Git is not installed or is not on PATH."

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fail "$ROOT_DIR is not a Git working tree."

current_branch="$(git branch --show-current)"

[ -n "$current_branch" ] ||
    fail "Detached HEAD detected. Switch to a named feature branch first."

for protected_branch in $PROTECTED_BRANCHES; do
    if [ "$current_branch" = "$protected_branch" ]; then
        fail "Refusing to publish directly from protected branch '$current_branch'."
    fi
done

git remote get-url "$REMOTE_NAME" >/dev/null 2>&1 ||
    fail "Git remote '$REMOTE_NAME' is not configured."

if [ -n "$(git status --porcelain)" ]; then
    echo
    git status --short
    echo
    fail "Working tree is not clean. Review, test, stage, and commit changes explicitly before publishing."
fi

info "Fetching latest remote references."
git fetch --prune "$REMOTE_NAME"

if git show-ref --verify --quiet "refs/remotes/$REMOTE_NAME/main"; then
    if ! git merge-base --is-ancestor "$REMOTE_NAME/main" HEAD; then
        fail "This branch does not contain the latest $REMOTE_NAME/main. Rebase or merge main after reviewing the changes."
    fi
fi

info "Running repository safety checks."

if grep -RInE \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=uploads \
    --exclude-dir=backups \
    --exclude-dir=appraisal-v2-dev \
    --exclude='*.backup-*' \
    '^(<{7}|={7}|>{7})( |$)' \
    . >/tmp/eas-conflict-markers.txt
then
    cat /tmp/eas-conflict-markers.txt
    fail "Unresolved merge-conflict markers were found."
fi

tracked_sensitive="$(
    git ls-files |
    grep -E '(^|/)\.env($|\.)|(^|/)uploads/|(^|/)backups/.*\.(sql|sql\.gz)$' |
    grep -vE '(^|/)\.env\.(example|template)$' ||
    true
)"

if [ -n "$tracked_sensitive" ]; then
    printf '%s\n' "$tracked_sensitive"
    fail "Sensitive or runtime files are tracked by Git."
fi

pass "Repository safety checks passed."

info "Pushing branch '$current_branch' to '$REMOTE_NAME'."
git push --set-upstream "$REMOTE_NAME" "$current_branch"

echo
pass "Branch published successfully."
echo "Branch : $current_branch"
echo "Remote : $REMOTE_NAME"
echo
echo "This script did not:"
echo "  - stage files"
echo "  - create commits"
echo "  - switch branches"
echo "  - merge into main"
echo "  - rebuild Docker containers"
echo "  - deploy production"
