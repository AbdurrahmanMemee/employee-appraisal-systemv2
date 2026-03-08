#!/bin/bash
set -e  # Stop immediately if a command fails

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"Feature Description\""
  exit 1
fi

# Sanitize the name: replace spaces and '+' with '-' 
CLEAN_NAME=$(echo "$1" | sed 's/[[:space:]]/ /g' | tr -s ' ' | tr ' +' '-' | tr -cd '[:alnum:]-')
BRANCH_NAME="feature-$CLEAN_NAME"

echo "--- Starting process for: $1 ---"

# Switch to main and make sure it's clean
git checkout main
git pull origin main

# Create the new branch with the cleaned name
git checkout -b "$BRANCH_NAME"

# Add and commit
git add .
git commit -m "$1"

# Push the new branch
git push -u origin "$BRANCH_NAME"

echo "--- SUCCESS! Your branch '$BRANCH_NAME' is now on GitHub. ---"