#!/bin/bash
set -e

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "  ${BOLD}Claude Terminal Cloud — Installer${NC}"
echo -e "  ${DIM}────────────────────────────────────${NC}"
echo ""

# ── Install Docker if missing ──
if ! command -v docker &>/dev/null; then
  echo -e "  ${YELLOW}Docker not found — installing...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
  echo -e "  ${GREEN}Docker installed${NC}"
  echo ""
fi

# ── Install Docker Compose plugin if missing ──
if ! docker compose version &>/dev/null; then
  echo -e "  ${YELLOW}Docker Compose not found — installing plugin...${NC}"
  COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  DOCKER_CLI_DIR=${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins
  mkdir -p "$DOCKER_CLI_DIR"
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CLI_DIR/docker-compose"
  chmod +x "$DOCKER_CLI_DIR/docker-compose"
  echo -e "  ${GREEN}Docker Compose installed${NC}"
  echo ""
fi

# ── Install git if missing ──
if ! command -v git &>/dev/null; then
  echo -e "  ${YELLOW}Git not found — installing...${NC}"
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq git
  elif command -v yum &>/dev/null; then
    yum install -y -q git
  elif command -v apk &>/dev/null; then
    apk add --quiet git
  fi
  echo -e "  ${GREEN}Git installed${NC}"
  echo ""
fi

# ── Clone cloud server ──
INSTALL_DIR="/opt/ct-cloud"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "  ${YELLOW}Existing installation found at $INSTALL_DIR${NC}"
  echo -e "  ${DIM}Pulling latest changes...${NC}"
  cd "$INSTALL_DIR" && git pull --quiet 2>/dev/null || true
  cd cloud
else
  echo -e "  ${CYAN}Cloning cloud server...${NC}"
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/Sterll/claude-terminal.git "$INSTALL_DIR" 2>/dev/null
  cd "$INSTALL_DIR" && git sparse-checkout set cloud 2>/dev/null
  cd cloud
fi

# ── Setup .env ──
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  read -p "  Your domain (e.g., cloud.example.com): " DOMAIN
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env
  fi
fi

# ── Create data dirs ──
mkdir -p data/users

# ── Build and start ──
echo ""
echo -e "  ${CYAN}Building and starting containers...${NC}"
docker compose up -d --build

# ── Wait for container to be ready ──
echo -e "  ${DIM}Waiting for server to start...${NC}"
sleep 3

# ── Create first user ──
echo ""
read -p "  Create a user — enter username: " USERNAME
if [ -n "$USERNAME" ]; then
  echo ""
  docker exec ct-cloud node dist/cli.js user add "$USERNAME"
fi

echo ""
echo -e "  ${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo -e "  ${DIM}Server running on port 3800${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    1. Setup a reverse proxy (nginx/caddy) for HTTPS"
echo -e "    2. Paste the server URL and API key in"
echo -e "       ${CYAN}Claude Terminal > Settings > Remote > Cloud relay${NC}"
echo ""
echo -e "  ${DIM}Manage users:  docker exec ct-cloud node dist/cli.js user add <name>${NC}"
echo -e "  ${DIM}View logs:     docker compose -f $INSTALL_DIR/cloud/docker-compose.yml logs -f${NC}"
echo ""
