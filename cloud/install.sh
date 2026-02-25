#!/bin/bash
set -e

echo ""
echo "  Claude Terminal Cloud - Install"
echo ""

# Check docker
if ! command -v docker &>/dev/null; then
  echo "  Error: docker is not installed"
  echo "  Install it: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "  Error: docker compose is not available"
  exit 1
fi

# Clone only cloud/ folder
echo "  Cloning cloud server..."
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/Sterll/claude-terminal.git ct-cloud 2>/dev/null
cd ct-cloud && git sparse-checkout set cloud 2>/dev/null
cd cloud

# Setup .env
cp .env.example .env
echo ""
read -p "  Your domain (e.g., cloud.example.com): " DOMAIN
if [ -n "$DOMAIN" ]; then
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
fi

# Create data dirs
mkdir -p data/users

# Build and start
echo ""
echo "  Building and starting..."
docker compose up -d --build

echo ""
echo "  Done! Server running on port 3800"
echo ""
echo "  Next steps:"
echo "    1. Create a user:"
echo "       docker exec -it ct-cloud node dist/cli.js user add <name>"
echo ""
echo "    2. Setup reverse proxy (nginx/caddy) for HTTPS"
echo ""
echo "    3. Paste the API key in Claude Terminal > Settings > Cloud"
echo ""
