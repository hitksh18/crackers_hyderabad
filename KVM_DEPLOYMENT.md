# KVM Deployment — Crackers Hyderabad

Production topology:

```
Internet → Nginx :80/:443 → Vite build (client/dist) + /api → Express :3001 (PM2)
→ Firestore + Firebase Auth (Admin SDK)  |  uploads: /var/www/crackershyderabad-media
```

> **Database note:** this project uses **Firestore** (Firebase), not PostgreSQL.
> There is no `DATABASE_URL`, no `pg` dependency, no SQL migration. All data
> (products, orders, roles, users, analytics) lives in Firestore collections
> accessed via the Firebase Admin SDK. Do not install PostgreSQL for this app.

---

## 1. Fresh Ubuntu KVM requirements

- Ubuntu 22.04/24.04 LTS, 2 vCPU / 4 GB RAM minimum, 25 GB disk.
- Root (or sudo) SSH access. The scripts assume root paths
  (`/root/crackers-deploy`, `/var/www/...`); with a sudo user, run with `sudo -E`.
- Node 22 LTS (script installs it via NodeSource if missing), Nginx, PM2
  (both installed by the script), Git.

## 2. DNS configuration

In your registrar/DNS panel:

| Host | Type | Value |
|---|---|---|
| `YOUR_DOMAIN` (e.g. `crackershyderabad.com`) | A | `<server public IP>` |
| `www.YOUR_DOMAIN` | A | `<server public IP>` |
| `admin.YOUR_DOMAIN` (staff console) | A | `<server public IP>` |
| `billing.YOUR_DOMAIN` (counter register) | A | `<server public IP>` |

Verify: `dig +short YOUR_DOMAIN` returns the server IP before continuing to SSL.

## 3. Upload / clone project

```bash
# On the KVM:
mkdir -p /root/crackers-deploy
cd /root/crackers-deploy
git clone <your-repo-url> repo
cd repo
git log --oneline -3   # confirm you have the production-ready tree
```

## 4. Install dependencies

Handled by the script (steps 7 + 9), or manually:

```bash
cd /root/crackers-deploy/repo/api && npm ci --omit=dev --no-audit --no-fund
cd /root/crackers-deploy/repo/client && npm ci --no-audit --no-fund
cd /root/crackers-deploy/repo/admin && npm ci --no-audit --no-fund
cd /root/crackers-deploy/repo/billing && npm ci --no-audit --no-fund
```

## 5. Configure .env

```bash
cp /root/crackers-deploy/repo/.env.example /root/crackers-deploy/.env
chmod 600 /root/crackers-deploy/.env
nano /root/crackers-deploy/.env
```

Required values:

| Variable | Where to get it |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Console → Project Settings → Service accounts → Generate new private key → paste the **whole JSON on one line**. Keep the `\n` inside `private_key` as literal backslash-n. |
| `FIREBASE_PROJECT_ID` | `standard-crackers-store` (already the default) |
| `EMAIL_HOST/PORT/USER/PASS` | Gmail: 2-Step Verification → App Password (16 chars). |
| `MSG91_AUTH_KEY/SENDER_ID/ROUTE` | https://control.msg91.com → API key. Optional — orders work without it; SMS endpoint returns `setupRequired: true`. |
| `ALLOWED_ORIGINS` | Only if you serve a preview domain too. Production apex+www and localhost are already allowed. |
| `MEDIA_ROOT` / `MEDIA_PUBLIC_BASE` | Leave empty — defaults (`/var/www/crackershyderabad-media`, `https://crackershyderabad.com/uploads`) are correct. |
| `GOOGLE_GEOCODING_API_KEY` | Optional — empty = OpenStreetMap Nominatim for the checkout picker. |

Browser build vars (`VITE_FIREBASE_*`) are baked in at build time from the
committed public web config (`client/.env.production`, `admin/.env`,
`billing/.env`) — no server config needed. The three builds are served on
three subdomains: `crackershyderabad.com`, `admin.crackershyderabad.com`
and `billing.crackershyderabad.com`.

## 6. Configure database (Firestore)

Nothing to install. Two one-time Firebase Console steps:

1. **Firestore rules:** `firebase deploy --only firestore:rules --project standard-crackers-store`
   (rules source: `firestore.rules` in this repo).
2. **Admin role:** after the first user signs in, create
   `roles/{uid}` = `{ role: "admin" }` in Firestore (or e-mail login
   `nikshit647garje@gmail.com`, which the rules bootstrap as admin).

## 7. Run deployment script

```bash
cd /root/crackers-deploy/repo
sudo DOMAIN=crackershyderabad.com bash deploy/kvm/setup-and-deploy.sh
```

What it does: installs Node 22/Nginx/PM2 → `npm ci` ×4 → `vite build` ×3
(customer, admin, billing) → writes `/root/crackers-deploy/.env` from
template **only if absent** → atomically swaps
`/var/www/crackershyderabad{,-admin,-billing}` →
`pm2 startOrRestart ecosystem.config.cjs --env production` →
installs Nginx site (with your `DOMAIN`, all three hostnames) → `nginx -t` →
reload → `pm2 startup` → health check.

The script never deletes `/var/www/crackershyderabad-media` or Firestore data.

## 8. Configure Nginx

Done by the script from `deploy/nginx/crackershyderabad.conf`. One config,
three `server` blocks keyed by hostname (host-based routing):

| Hostname | `root` | App |
|---|---|---|
| `YOUR_DOMAIN`, `www.YOUR_DOMAIN` | `/var/www/crackershyderabad` | customer storefront |
| `admin.YOUR_DOMAIN` | `/var/www/crackershyderabad-admin` | staff console |
| `billing.YOUR_DOMAIN` | `/var/www/crackershyderabad-billing` | counter register |

Key behaviors, on **each** block:

- `try_files $uri $uri/ /index.html;`
  → SPA refresh works on every route (see §12).
- `location /api/` → `proxy_pass http://127.0.0.1:3001;` with
  `X-Forwarded-Proto` so Express (`trust proxy`) sees HTTPS correctly —
  one API behind all three domains (same-origin `/api` on each).
- `location /uploads/` → `alias /var/www/crackershyderabad-media/;`
  (30-day cache, never executes code).
- `/assets/` cached 1 year (hashed), `index.html` never cached.
- On the storefront block only: the single-domain era paths `/admin`,
  `/billing` and `/price-list` 301-redirect to their subdomain homes so
  old bookmarks keep working (frontend paths, never API paths).

Manual check: `sudo nginx -t && sudo systemctl reload nginx`.

## 9. Configure SSL

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crackershyderabad.com -d www.crackershyderabad.com \
  -d admin.crackershyderabad.com -d billing.crackershyderabad.com
```

Certbot adds the `:443` block for every name; the app needs no code change
(`X-Forwarded-Proto` is already honored). Renewal is automatic via systemd timer.

Firebase Authentication → Settings → Authorized domains must list
`crackershyderabad.com`, `admin.crackershyderabad.com` and
`billing.crackershyderabad.com` so sign-in works on all three hosts.

## 10. Start PM2

```bash
cd /root/crackers-deploy
pm2 startOrRestart ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u root --hp /root   # run the printed command
pm2 status
pm2 logs crackers-api --lines 30
```

Policy: 1 fork instance (rate limiters are in-memory), auto-restart,
512 MB memory restart, logs in `./logs/`.

## 11. Verify health endpoint

```bash
curl -s http://127.0.0.1:3001/api/health
# {"status":"ok"}
curl -sk https://crackershyderabad.com/api/health
# {"status":"ok"}
```

`GET /api/health` is public and exposes nothing (no versions, paths, env).
Admin-deep health: `GET /api/admin/firebase-health` (Bearer admin token) checks
Auth + Firestore + media writes.

## 12. Verify website

Open and hard-refresh each (all must survive refresh — Nginx serves `index.html`):

Customer (`https://YOUR_DOMAIN/`): `/`, `/products`, `/product/:slug`, `/cart`,
`/checkout`, `/order-success`, `/track-order`, `/login`, `/profile`,
`/my-orders`.

Admin (`https://admin.YOUR_DOMAIN/`): `/` (→ role landing), `/dashboard`,
`/analytics`, `/orders`, `/orders/:orderId`, `/products`, `/products/add`,
`/products/edit/:id`, `/categories`, `/users`, `/price-list`, `/canvas`,
`/login`.

Billing (`https://billing.YOUR_DOMAIN/`): `/` (counter register), `/login`.

Legacy single-domain paths on the storefront (`/admin/...`, `/billing`,
`/price-list`) must 301 to the matching subdomain.

Check DevTools Network: JS/CSS/fonts load from `/assets/` (200, long cache),
`index.html` returns `no-store`.

## 13. Verify admin

Sign in as the admin user → `https://admin.YOUR_DOMAIN/dashboard` loads
KPIs/orders. Landing per role after login: admin → `/dashboard`,
sales → forwarded to `billing.YOUR_DOMAIN`; on the storefront customers stay
on `/` and staff are handed to their console subdomain (sign in again there —
Firebase sessions are per-origin). Negative test: sign in as a normal customer →
direct-GET an admin API, e.g.

```bash
curl -s -H "Authorization: Bearer <CUSTOMER_ID_TOKEN>" \
  https://crackershyderabad.com/api/admin/users
# {"error":"..."} with HTTP 403 — never user data
```

All `/api/admin/*`, `/api/upload`, `DELETE /api/media` enforce
`verifyIdToken(revoked) + roles/{uid}` **server-side**; hiding buttons is UI only.

## 14. Verify authentication

Flow: browser Firebase Web SDK sign-in → `auth.currentUser.getIdToken()` →
`Authorization: Bearer` → Admin SDK `verifyIdToken(token, checkRevoked=true)` →
`roles/{uid}` lookup → route role gate (`admin` / `admin,sales` /
staff). Guests can place orders + `POST /api/orders/track` (phone-last-4 check);
everything else needs a token.

Test: place a test order as guest → track it → sign in → order appears in
`/my-orders` → admin sees it in `admin.YOUR_DOMAIN/orders`.

## 15. Verify uploads

As admin: Products → upload image (≤ 6 MB, JPEG/PNG/WebP/GIF).
Expect a URL like `https://crackershyderabad.com/uploads/products/…webp`,
image loads publicly, file exists under
`/var/www/crackershyderabad-media/products/`. Traversal names, `.svg`/`.php`,
and oversize files are rejected (400). Upload dir is configurable via
`MEDIA_ROOT` (alias `UPLOAD_DIR`).

## 16. Backup procedure

Firestore (database — lives in Google Cloud, not on disk):

```bash
# One-time: gcloud auth login && gcloud config set project standard-crackers-store
gcloud firestore export gs://<your-bucket>/firestore-backup-$(date +%F)
```

Uploads (the only stateful disk data):

```bash
tar -czf /root/uploads-backup-$(date +%F).tar.gz -C /var/www crackershyderabad-media
ls -lh /root/uploads-backup-*.tar.gz
```

Server env:

```bash
cp -a /root/crackers-deploy/.env /root/env-backup-$(date +%F).env
chmod 600 /root/env-backup-*.env
```

Recommended: weekly Firestore export + daily uploads tar via cron, copied off-box.

## 17. Update procedure

```bash
sudo bash /root/crackers-deploy/update.sh   # from deploy/kvm/update.sh
```

Pull → install → rebuild all three frontends → atomic swap of all three doc
roots → PM2 restart → health check. Preserves `.env`, uploads, Firestore.
Nginx config is never auto-overwritten (the script diffs and tells you to review).

## 18. Troubleshooting

| Symptom | Check |
|---|---|
| `502` on `/api/*` | `pm2 status`; `pm2 logs crackers-api --lines 50`; `curl localhost:3001/api/health`; `ss -ltnp \| grep 3001`. API binds **127.0.0.1 only** — external `:3001` connections are refused by design; go through Nginx. |
| SPA route 404 on refresh | Nginx site installed? `nginx -t`; `try_files … /index.html` present? |
| `/uploads/*` 404 | `ls /var/www/crackershyderabad-media`; Nginx `alias` trailing slashes; `MEDIA_PUBLIC_BASE` matches domain. |
| Auth 401/503 on admin APIs | `FIREBASE_SERVICE_ACCOUNT_KEY` set in `/root/crackers-deploy/.env`? Private-key `\n` intact? `pm2 restart crackers-api --update-env`. |
| CORS errors in browser | Shouldn't happen same-origin (`VITE_BACKEND_API_URL=/api`). If calling API cross-origin, add domain to `ALLOWED_ORIGINS` and restart API. |
| Old bundle after deploy | `index.html` is `no-store`, but hard-refresh / purge CDN. Check `dist` timestamp in `/var/www/crackershyderabad`. |
| Sharp/multer errors | `pm2 logs`; 6 MB limit; JPEG/PNG/WebP/GIF only; content validated by decoding, not extension. |
| Deploy webhook `/api/deploy` | Legacy CI path (tarball + `DEPLOY_TOKEN`); KVM scripts above don't use it. Keep `DEPLOY_TOKEN` unset unless you use the GitHub workflow. |

## 19. What must still be configured manually (not in git)

1. `FIREBASE_SERVICE_ACCOUNT_KEY` in `/root/crackers-deploy/.env` (secret).
2. `EMAIL_*` + `MSG91_*` in the same file (secrets).
3. DNS A records for all four hostnames (`apex`, `www`, `admin`, `billing`) + `certbot --nginx`.
4. Firestore rules deploy + first admin `roles/{uid}` document.
5. `DOMAIN=` value when running the setup script (no domain is hardcoded in deploy scripts; `crackershyderabad.com` defaults inside code comments/CORS allow-list are safe).

## UNVERIFIED on this machine (must confirm on the KVM)

- `nginx -t` against the real host (Nginx isn't installed on Windows).
- `certbot --nginx` TLS issuance.
- `pm2 startup` systemd unit + reboot survival.
- `storeMedia` production writes (`NODE_ENV=production` gate blocks writes in dev by design).
- Real Gmail/MSG91 delivery and Google Geocoding key.
- Firebase Admin `verifyIdToken` against the real project clock.
