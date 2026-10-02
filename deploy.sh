#!/bin/bash
set -e
T=/root/deploy-incoming
rm -rf $T && mkdir -p $T
tar -xzf /root/deploy-latest.tar.gz --no-same-permissions -C $T
find $T -type d -exec chmod 755 {} +
find $T -type f -exec chmod 644 {} +

# Atomic swap of one frontend build into its document root. The previous copy
# is kept once as *.old for rollback; uploads (/var/www/...-media) and
# Firestore are never touched here. A missing index.html means the tarball
# came from an older workflow — skip that app instead of failing the deploy.
publish_app() {
  src="$1"
  dest="$2"
  [ -f "$src/index.html" ] || return 0
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

# Three subdomains, three doc roots (see deploy/nginx/crackershyderabad.conf):
publish_app "$T/dist"         /var/www/crackershyderabad
publish_app "$T/dist-admin"   /var/www/crackershyderabad-admin
publish_app "$T/dist-billing" /var/www/crackershyderabad-billing

if [ -f "$T/deploy.sh" ]; then
  cp -a "$T/deploy.sh" /root/crackers-deploy/deploy.sh
  chmod 755 /root/crackers-deploy/deploy.sh
fi
if [ -d "$T/api" ]; then
  cp -a $T/api/. /root/crackers-deploy/api/
  cd /root/crackers-deploy/api && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || true
  pm2 restart crackers-api >/dev/null || true
fi
if [ -d "$T/scripts" ]; then
  rm -rf /root/crackers-deploy/scripts
  cp -a $T/scripts /root/crackers-deploy/scripts
fi
rm -rf $T /root/deploy-latest.tar.gz
echo DEPLOY-DONE
