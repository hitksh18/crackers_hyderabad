#!/usr/bin/env bash

set -Eeuo pipefail

REPO="/root/crackershyderabad"
DEPLOY="/root/crackers-deploy"

CUSTOMER_LIVE="/var/www/crackershyderabad"
ADMIN_LIVE="/var/www/crackershyderabad-admin"
BILLING_LIVE="/var/www/crackershyderabad-billing"

MEDIA="/var/www/crackershyderabad-media"
BACKUP_ROOT="/root/crackers-backups"

echo "======================================"
echo " Crackers Hyderabad Deployment"
echo "======================================"

cd "$REPO"

echo "[1/9] Updating repository..."
git fetch origin main
git checkout main
git reset --hard origin/main

echo "[2/9] Loading Node 22..."
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

echo "[3/9] Installing dependencies..."

cd "$REPO/client"
npm ci --no-audit --no-fund

cd "$REPO/admin"
npm ci --no-audit --no-fund

cd "$REPO/billing"
npm ci --no-audit --no-fund

echo "[4/9] Building customer..."
cd "$REPO/client"
npm run build
test -f dist/index.html

echo "[5/9] Building admin..."
cd "$REPO/admin"
npm run build
test -f dist/index.html

echo "[6/9] Building billing..."
cd "$REPO/billing"
npm run build
test -f dist/index.html

echo "[7/9] Creating backup..."

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/frontend-$TIMESTAMP"

mkdir -p "$BACKUP"

cp -a "$CUSTOMER_LIVE" "$BACKUP/customer" 2>/dev/null || true
cp -a "$ADMIN_LIVE" "$BACKUP/admin" 2>/dev/null || true
cp -a "$BILLING_LIVE" "$BACKUP/billing" 2>/dev/null || true

echo "Backup: $BACKUP"

echo "[8/9] Publishing frontends..."

rm -rf "$CUSTOMER_LIVE"/*
rm -rf "$ADMIN_LIVE"/*
rm -rf "$BILLING_LIVE"/*

cp -a "$REPO/client/dist/." "$CUSTOMER_LIVE/"
cp -a "$REPO/admin/dist/." "$ADMIN_LIVE/"
cp -a "$REPO/billing/dist/." "$BILLING_LIVE/"

echo "[9/9] Updating API..."

rm -rf "$DEPLOY/api"
cp -a "$REPO/api" "$DEPLOY/api"

rm -f "$DEPLOY/api/.env"
ln -s "$DEPLOY/.env" "$DEPLOY/api/.env"

cd "$DEPLOY/api"
npm ci --omit=dev --no-audit --no-fund

echo "Restarting API..."

pm2 restart crackers-api --update-env

echo "Checking API..."

sleep 2

curl -fsS http://127.0.0.1:3001/api/health

echo
echo "Checking frontend files..."

test -f "$CUSTOMER_LIVE/index.html"
test -f "$ADMIN_LIVE/index.html"
test -f "$BILLING_LIVE/index.html"

echo "Checking media directory..."

test -d "$MEDIA"

echo
echo "======================================"
echo " DEPLOYMENT SUCCESSFUL"
echo "======================================"

echo "Commit:"
git -C "$REPO" rev-parse --short HEAD

echo "Backup:"
echo "$BACKUP"
