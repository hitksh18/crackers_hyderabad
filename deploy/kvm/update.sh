#!/bin/bash
# Crackers Hyderabad — safe update on an already-deployed KVM.
# Usage: sudo bash /root/crackers-deploy/update.sh
#   (or: sudo bash deploy/kvm/update.sh from the repo checkout on the server)
#
# Pulls latest source -> installs deps -> rebuilds all three frontends
# (customer / admin / billing) -> restarts API -> reloads Nginx if the site
# config changed -> health check.
# NEVER touches: $DEPLOY_DIR/.env, /var/www/crackershyderabad-media, Firestore data.
#
# $DEPLOY_DIR/.env is the single source of truth for production secrets
# (including the Gmail app password) and is the file api/server.js loads as
# <api>/../.env. It is never created or rewritten here — only verified.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/root/crackers-deploy}"
APP_DIR="${APP_DIR:-/var/www/crackershyderabad}"
ADMIN_APP_DIR="${ADMIN_APP_DIR:-/var/www/crackershyderabad-admin}"
BILLING_APP_DIR="${BILLING_APP_DIR:-/var/www/crackershyderabad-billing}"
SRC_DIR="${SRC_DIR:-$DEPLOY_DIR/repo}"

if [ ! -d "$SRC_DIR/.git" ]; then
  echo "ERROR: no git checkout at $SRC_DIR."
  echo "Clone once: git clone <repo-url> $SRC_DIR"
  exit 1
fi

echo "==> 1/6 Update source"
cd "$SRC_DIR"
git pull --ff-only
echo "    $(git log --oneline -1)"

echo "==> 2/6 Install dependencies"
cd "$SRC_DIR/api" && npm ci --omit=dev --no-audit --no-fund
cd "$SRC_DIR/client" && npm ci --no-audit --no-fund
cd "$SRC_DIR/admin" && npm ci --no-audit --no-fund
cd "$SRC_DIR/billing" && npm ci --no-audit --no-fund

echo "==> 3/6 Build frontends (customer + admin + billing)"
cd "$SRC_DIR/client" && npm run build
test -f dist/index.html || { echo "ERROR: client build produced no dist/index.html"; exit 1; }
cd "$SRC_DIR/admin" && npm run build
test -f dist/index.html || { echo "ERROR: admin build produced no dist/index.html"; exit 1; }
cd "$SRC_DIR/billing" && npm run build
test -f dist/index.html || { echo "ERROR: billing build produced no dist/index.html"; exit 1; }

# Atomic swap of one build into its document root (uploads untouched).
publish_app() {
  src="$1"
  dest="$2"
  if [ -d "$dest" ]; then
    rm -rf "${dest}.old" || true
    if [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
      mv "$dest" "${dest}.old"
    else
      rm -rf "$dest"
    fi
  fi
  mv "$src" "$dest"
  chown -R www-data:www-data "$dest"
}

echo "==> 4/6 Publish builds (atomic swap, uploads untouched)"
publish_app "$SRC_DIR/client/dist"  "$APP_DIR"
publish_app "$SRC_DIR/admin/dist"   "$ADMIN_APP_DIR"
publish_app "$SRC_DIR/billing/dist" "$BILLING_APP_DIR"
rm -rf "$DEPLOY_DIR/api" && cp -a "$SRC_DIR/api" "$DEPLOY_DIR/api"

# The API reads its environment as <api>/../.env, i.e. $DEPLOY_DIR/.env — which
# sits OUTSIDE the directory we just recreated above. Never keep a copy or a
# symlink of the secret file inside $DEPLOY_DIR/api: this line proves the
# directory we just rebuilt holds no credentials.
rm -f "$DEPLOY_DIR/api/.env" "$DEPLOY_DIR/api/.env.email"
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "ERROR: $DEPLOY_DIR/.env is missing."
  echo "       It is the single source of truth for production secrets and is"
  echo "       never created by this script. Restore it from backup, e.g."
  echo "         ls -1t $DEPLOY_DIR/.env.bak-* | head -1"
  exit 1
fi
chmod 600 "$DEPLOY_DIR/.env"

# Report email config as set/missing only. Never echoes a value.
echo "    Email configuration in $DEPLOY_DIR/.env:"
for key in EMAIL_ENABLED SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASSWORD \
           EMAIL_FROM_NAME EMAIL_FROM_ADDRESS ADMIN_NOTIFICATION_EMAIL TRACK_BASE_URL; do
  if grep -qE "^${key}=.+" "$DEPLOY_DIR/.env" 2>/dev/null; then
    printf '      %-26s set\n' "$key"
  else
    printf '      %-26s MISSING\n' "$key"
  fi
done

echo "==> 5/6 Restart backend + reload Nginx if site config changed"
cd "$DEPLOY_DIR"
if [ -f ecosystem.config.cjs ]; then
  pm2 startOrRestart ecosystem.config.cjs --env production --update-env
else
  pm2 restart crackers-api --update-env || PORT=3001 NODE_ENV=production pm2 start "$DEPLOY_DIR/api/server.js" --name crackers-api
fi
pm2 save
if ! cmp -s "$SRC_DIR/deploy/nginx/crackershyderabad.conf" /etc/nginx/sites-available/crackershyderabad 2>/dev/null; then
  echo "    Nginx site config differs — review manually, NOT auto-overwritten (domain is baked in)."
  echo "    Diff: diff $SRC_DIR/deploy/nginx/crackershyderabad.conf /etc/nginx/sites-available/crackershyderabad"
else
  echo "    Nginx config unchanged."
fi

echo "==> 6/6 Health check"
sleep 3
curl -fsS "http://127.0.0.1:3001/api/health" | grep -q '"status":"ok"' \
  && echo "    API health: OK" \
  || { echo "ERROR: API health check failed"; pm2 logs crackers-api --lines 30 --nostream || true; exit 1; }

echo ""
echo "UPDATE DONE. Verify all three apps:"
echo "  https://$(hostname -f)/              (customer)"
echo "  https://admin.$(hostname -f)/        (staff console)"
echo "  https://billing.$(hostname -f)/      (counter register)"
