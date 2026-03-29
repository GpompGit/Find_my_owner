#!/bin/bash

# scripts/deploy.sh — Auto-Deploy Script
#
# Called by the GitHub webhook handler (routes/deploy.js) when code
# is pushed to the main branch.
#
# What it does:
# 1. Pull the latest code from GitHub
# 2. Install any new npm dependencies
# 3. Restart the application via PM2
#
# This script runs as a child process of the Node.js app.
# It inherits the working directory from the caller (project root).
#
# Exit codes:
#   0 = success
#   1 = git pull failed
#   2 = npm install failed
#   3 = pm2 restart failed

echo "Starting deploy..."
echo "Working directory: $(pwd)"
echo "Date: $(date)"

# ── Step 1: Pull latest code from main ──
# --ff-only ensures we only do fast-forward merges.
# If there's a conflict (shouldn't happen with webhook deploys),
# the pull will fail safely instead of creating a merge commit.
echo ""
echo "Step 1: Pulling latest code..."
git pull origin main --ff-only

if [ $? -ne 0 ]; then
  echo "ERROR: git pull failed"
  exit 1
fi

# ── Step 2: Install dependencies ──
# npm install checks package.json for any new or updated packages.
# --production skips devDependencies (test tools, etc.) on the server.
# If nothing changed in package.json, this finishes instantly.
echo ""
echo "Step 2: Installing dependencies..."
npm install --production

if [ $? -ne 0 ]; then
  echo "ERROR: npm install failed"
  exit 2
fi

# ── Step 3: Restart the application ──
# PM2 restart gracefully stops the old process and starts a new one.
# The app reloads with the new code.
# Users experience at most a 1-2 second interruption.
echo ""
echo "Step 3: Restarting application..."
pm2 restart quartier-bike-id

if [ $? -ne 0 ]; then
  echo "ERROR: pm2 restart failed"
  exit 3
fi

echo ""
echo "Deploy completed successfully!"
echo "App status:"
pm2 show quartier-bike-id --no-color 2>/dev/null | head -20
