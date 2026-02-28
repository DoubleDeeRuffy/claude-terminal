#!/bin/bash
set -e

# Fix ownership of data directory (may be mounted from host as root)
if [ -d /app/data ]; then
  chown -R claude:claude /app/data 2>/dev/null || true
fi

# Drop privileges and run the main command as user 'claude'
exec gosu claude "$@"
