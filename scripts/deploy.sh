#!/bin/bash

# scripts/deploy.sh — Auto-Deploy Script
#
# Called by the GitHub webhook handler (routes/deploy.js) when code
# is pushed to the main branch.
#
# Supports TWO deployment modes:
# 1. Docker mode (recommended): rebuilds the container image and restarts
# 2. Direct mode (legacy): npm install + pm2 restart
#
# The script auto-detects which mode to use:
# - If docker-compose is available AND docker-compose.yml exists → Docker mode
# - Otherwise → Direct mode (PM2)
#
# Exit codes:
#   0 = success
#   1 = git pull failed
#   2 = build/install failed
#   3 = restart failed

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

# ── Step 2 & 3: Build and restart (mode-dependent) ──
# Check if we're running in Docker mode or Direct mode.

if command -v docker-compose &> /dev/null && [ -f "docker-compose.yml" ]; then
  # ════════════════════════════════════════════════════════════
  # DOCKER MODE
  # ════════════════════════════════════════════════════════════
  echo ""
  echo "Detected: Docker mode"

  # Rebuild the app container with the new code.
  # --build forces a rebuild of the image (picks up code changes).
  # -d runs in the background (detached).
  # Only the 'app' service is rebuilt — the database stays running.
  echo ""
  echo "Step 2: Rebuilding app container..."
  docker-compose up -d --build app

  if [ $? -ne 0 ]; then
    echo "ERROR: docker-compose build failed"
    exit 2
  fi

  echo ""
  echo "Step 3: Verifying container health..."
  # Wait a few seconds for the container to start
  sleep 5

  # Check if the container is running
  docker-compose ps app | grep -q "Up"
  if [ $? -ne 0 ]; then
    echo "ERROR: App container is not running"
    echo "Logs:"
    docker-compose logs --tail 20 app
    exit 3
  fi

  echo ""
  echo "Deploy completed successfully! (Docker mode)"
  echo "Container status:"
  docker-compose ps

else
  # ════════════════════════════════════════════════════════════
  # DIRECT MODE (PM2)
  # ════════════════════════════════════════════════════════════
  echo ""
  echo "Detected: Direct mode (PM2)"

  # Install dependencies
  echo ""
  echo "Step 2: Installing dependencies..."
  npm install --production

  if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed"
    exit 2
  fi

  # Restart the application
  echo ""
  echo "Step 3: Restarting application..."
  pm2 restart quartier-bike-id

  if [ $? -ne 0 ]; then
    echo "ERROR: pm2 restart failed"
    exit 3
  fi

  echo ""
  echo "Deploy completed successfully! (Direct mode)"
  echo "App status:"
  pm2 show quartier-bike-id --no-color 2>/dev/null | head -20
fi
