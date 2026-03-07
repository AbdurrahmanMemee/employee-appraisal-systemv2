#!/bin/bash

# Check if a feature name was provided
if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"Feature Name Here\""
  exit 1
fi

FEATURE_NAME=$1
BRANCH_NAME="feature-$FEATURE_NAME"

echo "--- Starting process for: $FEATURE_NAME ---"

# 1. Ensure we are up to date
git checkout main
git pull origin main

# 2. Create and switch to new branch
git checkout -b "$BRANCH_NAME"

# 3. Add, commit, and push
git add .
git commit -m "$FEATURE_NAME"
git push -u origin "$BRANCH_NAME"

echo "--- Done! Your branch '$BRANCH_NAME' is now on GitHub. ---"
