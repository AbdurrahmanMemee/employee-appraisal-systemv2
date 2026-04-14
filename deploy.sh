#!/bin/bash
set -e  # Stop immediately if a command fails

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"Feature Description\""
  exit 1
fi

# 1. Sanitize the branch name
CLEAN_NAME=$(echo "$1" | sed 's/[[:space:]]/ /g' | tr -s ' ' | tr ' +' '-' | tr -cd '[:alnum:]-')
BRANCH_NAME="feature-$CLEAN_NAME"

echo "--- Starting process for: $1 ---"

# 2. Pre-flight Check: Commit any "in-progress" work before switching
if [[ -n $(git status -s) ]]; then
  echo "Changes detected. Saving current work..."
  git add .
  git commit -m "Auto-save: work in progress before switching to $BRANCH_NAME"
fi

# 3. Pull latest main
git checkout main
git pull origin main

# 4. Create and push new branch
git checkout -b "$BRANCH_NAME"
git add .
git commit -m "$1"
git push -u origin "$BRANCH_NAME"

echo "--- SUCCESS! Your branch '$BRANCH_NAME' is now on GitHub. ---"