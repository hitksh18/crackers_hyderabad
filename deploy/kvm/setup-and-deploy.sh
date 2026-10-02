#!/bin/bash
# Crackers Hyderabad — fresh-Ubuntu KVM setup + deploy.
# Usage:
#   sudo DOMAIN=crackershyderabad.com bash deploy/kvm/setup-and-deploy.sh
#   # or copy the repo to the server first and run from the repo root.
#
# Safe by design:
#   - never overwrites an existing /root/crackers-deploy/.env (use UPDATE_ENV=1 to refresh template only)
#   - never deletes /var/www/crackershyderabad-media (uploads)
#   - never touches Firestore data (the database lives in Firebase, not on this box)
set -euo pipefail

DOMAIN="${DOMAIN:-your-domain.com}"
APP_DIR="${APP_DIR:-/var/www/crackershyderabad}"
ADMIN_APP_DIR="${ADMIN_APP_DIR:-/var/www/crackershyderabad-admin}"
BILLING_APP_DIR="${BILLING_APP_DIR:-/var/www/crackershyderabad-billing}"
MEDIA_DIR="${MEDIA_DIR:-/var/www/crackershyderabad-media}"
DEPLOY_DIR="${DEPLOY_DIR:-/root/crackers-deploy}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> 1/16 Verify Ubuntu environment"
if [ ! -f /etc/os-release ]; then echo "ERROR: /etc/os-release missing — not Ubuntu?"; exit 1; fi
. /etc/os-release
echo "    $PRETTY_NAME ($(uname -m))"

echo "==> 2/16 Install system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git nginx tar gzip build-essential python3

echo "==> 3/16 Install Node.js 22 LTS if necessary"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v; npm -v

echo "==> 4/16 Nginx already installed (step 2). Version:"
nginx -v

echo "==> 5/16 Install PM2 if necessary"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund
fi
pm2 -v

echo "==> 6/16 Prepare application directories"
mkdir -p "$APP_DIR" "$ADMIN_APP_DIR" "$BILLING_APP_DIR" "$MEDIA_DIR" "$DEPLOY_DIR" ./logs
chmod 755 "$APP_DIR" "$ADMIN_APP_DIR" "$BILLING_APP_DIR" "$MEDIA_DIR" || true

echo "==> 7/16 Install API dependencies"
cd "$REPO_DIR/api"
npm ci --omit=dev --no-audit --no-fund

echo "==> 8/16 Create required directories"
mkdir -p "$MEDIA_DIR"/products "$MEDIA_DIR"/general "$MEDIA_DIR"/categories "$MEDIA_DIR"/brands \
  "$MEDIA_DIR"/canvas/hero "$MEDIA_DIR"/canvas/side-promos "$MEDIA_DIR"/canvas/banners "$MEDIA_DIR"/canvas/product-banners
chmod -R 755 "$MEDIA_DIR" || true

echo "==> 9/16 Build frontends (customer + admin + billing)"
cd "$REPO_DIR/client"
npm ci --no-audit --no-fund
npm run build
test -f dist/index.html || { echo "ERROR: client/dist/index.html missing after build"; exit 1; }
cd "$REPO_DIR/admin"
npm ci --no-audit --no-fund
npm run build
test -f dist/index.html || { echo "ERROR: admin/dist/index.html missing after build"; exit 1; }
cd "$REPO_DIR/billing"
npm ci --no-audit --no-fund
npm run build
test -f dist/index.html || { echo "ERROR: billing/dist/index.html missing after build"; exit 1; }

echo "==> 10/16 Configure environment (never overwrite existing .env)"
mkdir -p "$DEPLOY_DIR"
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$DEPLOY_DIR/.env"
  chmod 600 "$DEPLOY_DIR/.env"
  echo "    Wrote $DEPLOY_DIR/.env from template — EDIT IT NOW with real secrets,"
  echo "    then re-run this script. Required: FIREBASE_SERVICE_ACCOUNT_KEY."
else
  echo "    Keeping existing $DEPLOY_DIR/.env (not overwritten)."
fi
if [ -z "${FIREBASE_SERVICE_ACCOUNT_KEY:-}" ] && ! grep -q '^FIREBASE_SERVICE_ACCOUNT_KEY=.\+' "$DEPLOY_DIR/.env" 2>/dev/null; then
  echo "WARNING: FIREBASE_SERVICE_ACCOUNT_KEY is empty in $DEPLOY_DIR/.env."
  echo "         The API will start (GET /api/health = ok) but auth/orders/users return 503 until you set it."
fi

echo "==> 11/16 Publish frontend builds + backend to deploy dir"
# Copy into <dest>.new, rotate the old copy to <dest>.old, then swap — one
# broken copy can never leave a subdomain with no files on disk.
publish_app() {
  src="$1"
  dest="$2"
  rm -rf "${dest}.new" && mkdir -p "${dest}.new"
  cp -a "$src/." "${dest}.new/"
  rm -rf "${dest}.old" || true
  if [ -d "$dest" ]; then
    if [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then mv "$dest" "${dest}.old"; else rm -rf "$dest"; fi
  fi
  mv "${dest}.new" "$dest"
  chown -R www-data:www-data "$dest" || true
}
publish_app "$REPO_DIR/client/dist"  "$APP_DIR"
publish_app "$REPO_DIR/admin/dist"   "$ADMIN_APP_DIR"
publish_app "$REPO_DIR/billing/dist" "$BILLING_APP_DIR"
rm -rf "$DEPLOY_DIR/api" && cp -a "$REPO_DIR/api" "$DEPLOY_DIR/api"
cp -a "$REPO_DIR/ecosystem.config.cjs" "$DEPLOY_DIR/ecosystem.config.cjs" 2>/dev/null || true
ln -sfn "$DEPLOY_DIR/.env" "$DEPLOY_DIR/api/.env" 2>/dev/null || cp "$DEPLOY_DIR/.env" "$DEPLOY_DIR/api/.env"
ln -sfn "$DEPLOY_DIR/.env" "$REPO_DIR/.env" 2>/dev/null || true

echo "==> 12/16 Configure PM2 (crackers-api, port 3001)"
cd "$DEPLOY_DIR"
if [ -f ecosystem.config.cjs ]; then
  pm2 startOrRestart ecosystem.config.cjs --env production
else
  PORT=3001 NODE_ENV=production pm2 startOrRestart "$DEPLOY_DIR/api/server.js" --name crackers-api
fi
pm2 save

echo "==> 13/16 Configure Nginx"
NGINX_CONF="/etc/nginx/sites-available/crackershyderabad"
cp "$REPO_DIR/deploy/nginx/crackershyderabad.conf" "$NGINX_CONF"
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" "$NGINX_CONF"
ln -sfn "$NGINX_CONF" /etc/nginx/sites-enabled/crackershyderabad
rm -f /etc/nginx/sites-enabled/default || true

echo "==> 14/16 Test Nginx configuration"
nginx -t
systemctl reload nginx || service nginx reload || nginx -s reload

echo "==> 15/16 Enable PM2 startup"
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save

echo "==> 16/16 Health check"
sleep 3
for i in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:3001/api/health" | grep -q '"status":"ok"'; then
    echo "    API health: OK"
    break
  fi
  if [ "$i" = 6 ]; then echo "ERROR: API health check failed"; pm2 logs crackers-api --lines 30 --nostream || true; exit 1; fi
  sleep 3
done
curl -fsS -o /dev/null -w "    Storefront / -> %{http_code}\n" "http://127.0.0.1/"
curl -fsS -o /dev/null -w "    Admin /      -> %{http_code}\n" -H "Host: admin.$DOMAIN" "http://127.0.0.1/" || true
curl -fsS -o /dev/null -w "    Billing /    -> %{http_code}\n" -H "Host: billing.$DOMAIN" "http://127.0.0.1/" || true

echo ""
echo "DEPLOY DONE. Next steps:"
echo "  1. Point DNS: $DOMAIN, www.$DOMAIN, admin.$DOMAIN and billing.$DOMAIN -> this server IP."
echo "  2. SSL: certbot --nginx -d $DOMAIN -d www.$DOMAIN -d admin.$DOMAIN -d billing.$DOMAIN"
echo "  3. Verify: https://$DOMAIN/  +  https://admin.$DOMAIN/dashboard  +  https://billing.$DOMAIN/"
