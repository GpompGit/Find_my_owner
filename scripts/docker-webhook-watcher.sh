#!/bin/bash

# scripts/docker-webhook-watcher.sh — Host-Side Deploy Watcher
#
# When using Docker, the webhook endpoint runs INSIDE the container,
# but docker-compose commands must run on the HOST (the NAS).
#
# Solution: the webhook writes a "deploy trigger" file to a shared volume.
# This script watches for that file and runs docker-compose when it appears.
#
# How it works:
# 1. Webhook handler (inside container) creates /app/uploads/.deploy-trigger
# 2. This script (on the host) detects the file via the shared volume
# 3. This script runs: git pull + docker-compose up -d --build
# 4. This script deletes the trigger file
#
# Setup:
#   On the NAS, run this as a PM2 process:
#     pm2 start scripts/docker-webhook-watcher.sh --name deploy-watcher --interpreter bash
#     pm2 save
#
# Or as a cron job that runs every minute:
#   * * * * * /volume1/docker/quartier-bike-id/scripts/docker-webhook-watcher.sh

PROJECT_DIR="/volume1/docker/quartier-bike-id"
TRIGGER_FILE="$PROJECT_DIR/uploads/.deploy-trigger"

# If the trigger file exists, a deploy was requested
if [ -f "$TRIGGER_FILE" ]; then
  echo "$(date): Deploy trigger detected!"

  # Remove the trigger file first (prevent re-triggering)
  rm -f "$TRIGGER_FILE"

  # Change to project directory
  cd "$PROJECT_DIR" || exit 1

  # Pull latest code
  echo "Pulling latest code..."
  git pull origin main --ff-only

  if [ $? -ne 0 ]; then
    echo "ERROR: git pull failed"
    exit 1
  fi

  # Rebuild and restart the app container
  echo "Rebuilding app container..."
  docker-compose up -d --build app

  if [ $? -ne 0 ]; then
    echo "ERROR: docker-compose rebuild failed"
    exit 2
  fi

  echo "$(date): Deploy completed successfully!"
  docker-compose ps
fi
