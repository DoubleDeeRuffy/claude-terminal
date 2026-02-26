#!/bin/bash
# Claude Terminal Cloud — Auto-Update Script
# Checks for updates and rebuilds the container if needed.
# Designed to run via cron or manually.

set -e

INSTALL_DIR="/opt/ct-cloud"
LOG_FILE="/var/log/ct-cloud-update.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true
}

# Ensure we're in the right directory
if [ ! -d "$INSTALL_DIR" ]; then
  log "ERROR: Install directory not found at $INSTALL_DIR"
  exit 1
fi

cd "$INSTALL_DIR"

# Fetch latest changes without merging
git fetch origin --quiet 2>/dev/null

# Compare local vs remote
LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  log "Up to date ($LOCAL_HASH)"
  exit 0
fi

log "Update available: $LOCAL_HASH → $REMOTE_HASH"

# Pull changes
git pull --quiet 2>/dev/null
log "Pulled latest changes"

# Rebuild and restart container
cd cloud
docker compose up -d --build --quiet-pull 2>/dev/null
log "Container rebuilt and restarted"

# Get new version
NEW_VERSION=$(docker exec ct-cloud node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")
log "Updated to v$NEW_VERSION"
