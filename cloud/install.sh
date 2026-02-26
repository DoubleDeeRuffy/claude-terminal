#!/bin/bash
set -e

# When piped (curl | bash), stdin is the script content, not the terminal.
# Save to a temp file and re-exec so `read` can use the terminal.
if [ ! -t 0 ]; then
  TMPSCRIPT=$(mktemp /tmp/ct-cloud-install.XXXXXX.sh)
  cat > "$TMPSCRIPT"
  exec bash "$TMPSCRIPT" "$@" </dev/tty
fi

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

INSTALL_DIR="/opt/ct-cloud"

echo ""
echo -e "  ${BOLD}Claude Terminal Cloud — Installer${NC}"
echo -e "  ${DIM}────────────────────────────────────${NC}"
echo ""

# ══════════════════════════════════════════════
# 1. Dependencies
# ══════════════════════════════════════════════

install_pkg() {
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq "$@"
  elif command -v yum &>/dev/null; then
    yum install -y -q "$@"
  elif command -v apk &>/dev/null; then
    apk add --quiet "$@"
  elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm "$@"
  else
    echo -e "  ${RED}Cannot install $* — unknown package manager${NC}"
    echo -e "  ${DIM}Install manually and re-run this script${NC}"
    exit 1
  fi
}

# Docker
if ! command -v docker &>/dev/null; then
  echo -e "  ${YELLOW}Docker not found — installing...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
  echo -e "  ${GREEN}✓ Docker installed${NC}"
fi

# Docker Compose
if ! docker compose version &>/dev/null; then
  echo -e "  ${YELLOW}Docker Compose not found — installing plugin...${NC}"
  COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  DOCKER_CLI_DIR=${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins
  mkdir -p "$DOCKER_CLI_DIR"
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CLI_DIR/docker-compose"
  chmod +x "$DOCKER_CLI_DIR/docker-compose"
  echo -e "  ${GREEN}✓ Docker Compose installed${NC}"
fi

# Git
if ! command -v git &>/dev/null; then
  echo -e "  ${YELLOW}Git not found — installing...${NC}"
  install_pkg git
  echo -e "  ${GREEN}✓ Git installed${NC}"
fi

echo ""

# ══════════════════════════════════════════════
# 2. Clone / Update
# ══════════════════════════════════════════════

if [ -d "$INSTALL_DIR" ]; then
  echo -e "  ${YELLOW}Existing installation found at $INSTALL_DIR${NC}"
  echo -e "  ${DIM}Pulling latest changes...${NC}"
  cd "$INSTALL_DIR" && git pull --quiet 2>/dev/null || true
  cd cloud
else
  echo -e "  ${CYAN}Cloning cloud server...${NC}"
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/Sterll/claude-terminal.git "$INSTALL_DIR" 2>/dev/null
  cd "$INSTALL_DIR" && git sparse-checkout set cloud remote-ui 2>/dev/null
  cd cloud
fi

echo -e "  ${GREEN}✓ Source ready${NC}"
echo ""

# ══════════════════════════════════════════════
# 3. Domain name
# ══════════════════════════════════════════════

DOMAIN=""
while [ -z "$DOMAIN" ]; do
  read -p "  Domain name (e.g. cloud.example.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then
    echo -e "  ${RED}Domain is required${NC}"
  fi
done

# Setup .env
if [ ! -f .env ]; then
  cp .env.example .env
fi
sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|" .env

echo -e "  ${GREEN}✓ Domain set to ${BOLD}$DOMAIN${NC}"
echo ""

# ══════════════════════════════════════════════
# 4. Create data dirs & build
# ══════════════════════════════════════════════

mkdir -p data/users

echo -e "  ${CYAN}Building and starting containers...${NC}"
docker compose up -d --build
echo -e "  ${DIM}Waiting for server to start...${NC}"
sleep 3
echo -e "  ${GREEN}✓ Server running on port 3800${NC}"
echo ""

# ══════════════════════════════════════════════
# 5. Create user
# ══════════════════════════════════════════════

USERNAME=""
while [ -z "$USERNAME" ]; do
  read -p "  Username (a-z, 0-9, _, -): " USERNAME
  if [ -z "$USERNAME" ]; then
    echo -e "  ${RED}Username is required${NC}"
  elif ! echo "$USERNAME" | grep -qE '^[a-zA-Z0-9_-]+$'; then
    echo -e "  ${RED}Invalid characters — use only a-z, 0-9, _, -${NC}"
    USERNAME=""
  fi
done

echo ""
API_OUTPUT=$(docker exec ct-cloud node dist/cli.js user add "$USERNAME" 2>&1)
echo "$API_OUTPUT"

# Extract API key from output
API_KEY=$(echo "$API_OUTPUT" | grep -oP 'API Key: \K.*' || true)

echo ""

# ══════════════════════════════════════════════
# 6. Reverse proxy
# ══════════════════════════════════════════════

echo -e "  ${BOLD}Reverse proxy setup${NC}"
echo ""
echo -e "  ${DIM}1${NC}) Nginx   ${DIM}(recommended)${NC}"
echo -e "  ${DIM}2${NC}) Apache2"
echo -e "  ${DIM}3${NC}) Skip    ${DIM}(I'll configure it myself)${NC}"
echo ""
read -p "  Choice [1/2/3]: " PROXY_CHOICE

setup_nginx() {
  # Install nginx if missing
  if ! command -v nginx &>/dev/null; then
    echo -e "  ${YELLOW}Nginx not found — installing...${NC}"
    install_pkg nginx
    systemctl enable nginx 2>/dev/null || true
    echo -e "  ${GREEN}✓ Nginx installed${NC}"
  fi

  NGINX_CONF="/etc/nginx/sites-available/ct-cloud"
  cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3800;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINXEOF

  # Enable site
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/ct-cloud

  # Remove default if it conflicts
  if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  fi

  nginx -t 2>/dev/null && systemctl reload nginx
  echo -e "  ${GREEN}✓ Nginx configured for ${BOLD}$DOMAIN${NC}"
}

setup_apache() {
  # Install apache2 if missing
  if ! command -v apache2 &>/dev/null && ! command -v httpd &>/dev/null; then
    echo -e "  ${YELLOW}Apache not found — installing...${NC}"
    if command -v apt-get &>/dev/null; then
      install_pkg apache2
      systemctl enable apache2 2>/dev/null || true
    else
      install_pkg httpd
      systemctl enable httpd 2>/dev/null || true
    fi
    echo -e "  ${GREEN}✓ Apache installed${NC}"
  fi

  # Enable required modules
  if command -v a2enmod &>/dev/null; then
    a2enmod proxy proxy_http proxy_wstunnel rewrite headers 2>/dev/null || true
  fi

  APACHE_CONF="/etc/apache2/sites-available/ct-cloud.conf"
  [ ! -d /etc/apache2/sites-available ] && APACHE_CONF="/etc/httpd/conf.d/ct-cloud.conf"

  cat > "$APACHE_CONF" <<APACHEEOF
<VirtualHost *:80>
    ServerName $DOMAIN

    ProxyPreserveHost On
    ProxyRequests Off

    # HTTP
    ProxyPass / http://127.0.0.1:3800/
    ProxyPassReverse / http://127.0.0.1:3800/

    # WebSocket
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule /(.*) ws://127.0.0.1:3800/\$1 [P,L]

    # Timeouts
    ProxyTimeout 86400
</VirtualHost>
APACHEEOF

  if command -v a2ensite &>/dev/null; then
    a2ensite ct-cloud 2>/dev/null || true
    a2dissite 000-default 2>/dev/null || true
    systemctl reload apache2
  else
    systemctl reload httpd 2>/dev/null || true
  fi

  echo -e "  ${GREEN}✓ Apache configured for ${BOLD}$DOMAIN${NC}"
}

case "$PROXY_CHOICE" in
  1) setup_nginx ;;
  2) setup_apache ;;
  3|"")
    echo -e "  ${DIM}Skipped — configure your reverse proxy to forward to 127.0.0.1:3800${NC}"
    echo -e "  ${DIM}Don't forget WebSocket support (Upgrade headers)${NC}"
    ;;
esac

echo ""

# ══════════════════════════════════════════════
# 7. SSL with Let's Encrypt
# ══════════════════════════════════════════════

if [ "$PROXY_CHOICE" = "1" ] || [ "$PROXY_CHOICE" = "2" ]; then
  echo -e "  ${BOLD}SSL Certificate${NC}"
  echo ""
  read -p "  Setup free SSL with Let's Encrypt? (Y/n): " SSL_CHOICE
  SSL_CHOICE=${SSL_CHOICE:-Y}

  if [ "$SSL_CHOICE" = "Y" ] || [ "$SSL_CHOICE" = "y" ]; then
    # Install certbot
    if ! command -v certbot &>/dev/null; then
      echo -e "  ${YELLOW}Certbot not found — installing...${NC}"
      if command -v apt-get &>/dev/null; then
        install_pkg certbot
        if [ "$PROXY_CHOICE" = "1" ]; then
          install_pkg python3-certbot-nginx
        else
          install_pkg python3-certbot-apache
        fi
      elif command -v yum &>/dev/null; then
        install_pkg certbot
        if [ "$PROXY_CHOICE" = "1" ]; then
          install_pkg python3-certbot-nginx
        else
          install_pkg python3-certbot-apache
        fi
      fi
      echo -e "  ${GREEN}✓ Certbot installed${NC}"
    fi

    echo ""
    read -p "  Email for Let's Encrypt (optional, press Enter to skip): " LE_EMAIL

    CERTBOT_FLAGS="--non-interactive --agree-tos -d $DOMAIN"
    if [ -n "$LE_EMAIL" ]; then
      CERTBOT_FLAGS="$CERTBOT_FLAGS --email $LE_EMAIL"
    else
      CERTBOT_FLAGS="$CERTBOT_FLAGS --register-unsafely-without-email"
    fi

    echo ""
    echo -e "  ${CYAN}Requesting certificate...${NC}"

    if [ "$PROXY_CHOICE" = "1" ]; then
      certbot --nginx $CERTBOT_FLAGS 2>&1 && SSL_OK=true || SSL_OK=false
    else
      certbot --apache $CERTBOT_FLAGS 2>&1 && SSL_OK=true || SSL_OK=false
    fi

    if [ "$SSL_OK" = "true" ]; then
      echo -e "  ${GREEN}✓ SSL certificate installed for ${BOLD}$DOMAIN${NC}"
      echo -e "  ${DIM}Auto-renewal is enabled via certbot timer${NC}"
    else
      echo -e "  ${RED}SSL setup failed — make sure $DOMAIN points to this server${NC}"
      echo -e "  ${DIM}You can retry later: certbot --nginx -d $DOMAIN${NC}"
    fi
  else
    echo -e "  ${DIM}Skipped — you can add SSL later with:${NC}"
    if [ "$PROXY_CHOICE" = "1" ]; then
      echo -e "  ${DIM}  certbot --nginx -d $DOMAIN${NC}"
    else
      echo -e "  ${DIM}  certbot --apache -d $DOMAIN${NC}"
    fi
  fi

  echo ""
fi

# ══════════════════════════════════════════════
# Done
# ══════════════════════════════════════════════

echo -e "  ${GREEN}${BOLD}════════════════════════════════════${NC}"
echo -e "  ${GREEN}${BOLD}  Installation complete!${NC}"
echo -e "  ${GREEN}${BOLD}════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Server:${NC}    https://$DOMAIN"
echo -e "  ${BOLD}User:${NC}      $USERNAME"
if [ -n "$API_KEY" ]; then
  echo -e "  ${BOLD}API Key:${NC}   $API_KEY"
fi
echo ""
echo -e "  ${BOLD}Next step:${NC}"
echo -e "    Paste the URL and API key in"
echo -e "    ${CYAN}Claude Terminal > Settings > Cloud${NC}"
echo ""
echo -e "  ${DIM}────────────────────────────────────${NC}"
echo -e "  ${DIM}Manage users:  docker exec ct-cloud node dist/cli.js user add <name>${NC}"
echo -e "  ${DIM}View logs:     docker compose -f $INSTALL_DIR/cloud/docker-compose.yml logs -f${NC}"
echo -e "  ${DIM}Update:        cd $INSTALL_DIR && git pull && cd cloud && docker compose up -d --build${NC}"
echo ""
