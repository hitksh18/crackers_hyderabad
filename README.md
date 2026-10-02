# Crackers Hyderabad — E-Commerce Platform

Premium fireworks storefront for Standard Fireworks: product catalogue, cart,
checkout with order tracking, PDF invoices, and separate staff applications
(staff console + billing/POS) — one Express API behind them.

## Architecture

One repository, three frontends, one backend — split by **hostname**
(host-based routing in Nginx, not path-based):

| Part | Tech | Served at | Runs on |
|---|---|---|---|
| `client/` | Vite 7 + React 19 SPA, Firebase client SDK (Auth + Firestore), React Router, TailwindCSS | `crackershyderabad.com` (customers) | Vercel (static) **and** Hostinger (Nginx static) |
| `admin/` | Vite + React staff console (orders, products, users, analytics, price list, canvas) | `admin.crackershyderabad.com` (admin/packer/mod/sales) | Hostinger KVM (Nginx static) |
| `billing/` | Vite + React counter register (POS) | `billing.crackershyderabad.com` (counter) | Hostinger KVM (Nginx static) |
| `api/` | Express 5 + Firebase Admin SDK (auth, orders, users, notifications, media) | same-origin `/api` on **all three** domains | Hostinger KVM only (PM2 on port 3001, behind Nginx `/api` reverse proxy) |

Each frontend is its own Vite app (own dev port: client 5000, admin 5001,
billing 5002) sharing the same stack, API, Firebase project and Nginx server.
Firebase sessions are per-origin, so each console asks for its own sign-in;
login lands each role on its home (customers → storefront, admin → dashboard,
packer/mod → orders, sales/billing → billing).

There is intentionally **no** Vercel serverless backend: `api/server.js` is a
long-lived Express process (file uploads, Nodemailer, local media writes) that
cannot run as serverless functions. On Vercel the frontend's same-origin
`/api/*` and `/uploads/*` calls are rewritten to the production Hostinger
server (see `vercel.json`), so one build works on both hosts; legacy
`/admin`, `/billing` and `/price-list` paths redirect to the new subdomains.

Other pieces:

- **Firebase** — Auth + Firestore. The browser reads the public catalogue
  directly; all writes/pricing go through `api/` with the Admin SDK.
  Rules live in `firestore.rules` (deploy with
  `firebase deploy --only firestore:rules --project standard-crackers-store`).
- **Media** — permanent files live on the KVM at
  `/var/www/crackershyderabad-media`, served as
  `https://crackershyderabad.com/uploads/...` by Nginx.
- `scripts/` — one-off maintenance/migration scripts (run manually, never shipped).
- `tests/` — Firestore rules suite (needs the Firebase emulator, see file header).

## Project structure

```
crackers-hyderabad/
├── client/            # Vite + React storefront (src/, public/, package.json, vite.config.js)
├── admin/             # Vite + React staff console (port 5001)
├── billing/           # Vite + React counter register (port 5002)
├── api/               # Express API (server.js, lib/) — Hostinger KVM only
├── scripts/           # maintenance / migration scripts (dev-only)
├── tests/             # Firestore rules tests (emulator)
├── deploy.sh          # runs ON the KVM to install a deploy tarball
├── vercel.json        # Vercel build config + SPA rewrites + subdomain redirects
├── firebase.json      # points at firestore.rules
├── firestore.rules    # Firestore security rules
├── .env.example       # server + deploy + browser variable template (no secrets)
└── README.md
```

## Local development

Prerequisites: Node.js 22.

```bash
npm --prefix client install     # storefront deps
npm --prefix admin install      # staff console deps
npm --prefix billing install    # counter register deps
npm --prefix api install        # backend deps (needs sharp build tools)
```

```bash
npm run dev          # storefront on http://localhost:5000 (proxies /api → :3001)
npm run dev:admin    # staff console on http://localhost:5001
npm run dev:billing  # counter register on http://localhost:5002
npm run dev:api      # Express API on http://localhost:3001 (NODE_ENV unset = dev)
```

Cross-console login links follow `VITE_ADMIN_URL` / `VITE_BILLING_URL`
(`*.env.local` points them at the localhost dev servers; production builds
fall back to the real subdomains).

> Uploads only persist when the API runs with `NODE_ENV=production` against a
> real `MEDIA_ROOT`. In dev, uploads are rejected by design so throwaway files
> never become production content.

## Environment variables

Copy `.env.example` → `.env` for the server. Browser variables are `VITE_*`
in `client/.env*`:

| Variable | Where | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` (+ `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`) | browser, build time | Public web config; committed in `client/.env.production`, `admin/.env`, `billing/.env` as the CI fallback, overridable via secrets |
| `VITE_BACKEND_API_URL` | browser, build time | Always `/api` (same-origin; Nginx on Hostinger, rewrite on Vercel) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server only | Full service-account JSON; never in browser code |
| `PORT`, `ALLOWED_ORIGINS` | server only | `PORT` honoured (KVM uses 3001) |
| `EMAIL_HOST/PORT/USER/PASS` | server only | SMTP for order invoices |
| `MSG91_AUTH_KEY/SENDER_ID/ROUTE` | server only | Order SMS |
| `MEDIA_ROOT`, `MEDIA_PUBLIC_BASE` | server only | KVM media path + public base URL |
| `DEPLOY_TOKEN`, `DEPLOY_HOST` | CI only | GitHub Secrets for the Hostinger deploy step |

## Build & verify

```bash
npm run lint          # eslint over client/
npm run lint:admin    # + admin/
npm run lint:billing  # + billing/
npm run build         # vite build → client/dist/
npm run build:admin   # vite build → admin/dist/
npm run build:billing # vite build → billing/dist/
npm run preview       # serve the storefront bundle locally
```

CI (`.github/workflows/ci.yml`) runs install → lint → build for all three
frontends on every push/PR using the committed public web config
(`client/.env.production`, `admin/.env`, `billing/.env`), so it needs no
secrets.

## Deploy — Vercel

`vercel.json` pins everything; no dashboard tweaks required:

- `installCommand`: `npm ci --prefix client --no-audit --no-fund`
  (the previous failure: Vercel installed only root deps, so `vite` was missing)
- `buildCommand`: `npm run build --prefix client`
- `outputDirectory`: `client/dist`
- Redirects: `/admin/*`, `/billing/*`, `/price-list` → the admin/billing
  subdomains (parity with the Nginx redirects)
- Rewrites: `/api/*` and `/uploads/*` → `https://crackershyderabad.com/...`,
  everything else → `/index.html` (SPA deep links: `/products`, `/my-orders`, …)

Optional: set the six `VITE_FIREBASE_*` vars in the Vercel dashboard to
override the committed fallback.

## Deploy — Hostinger (KVM)

`.github/workflows/deploy-hostinger.yml` runs on every push to `main`:

1. `node scripts/generate-sitemap.mjs` refreshes `client/public/sitemap.xml`
2. Firebase secrets overlay `*.env.production.local` in **all three** apps
   **only when set** (unset secrets previously blanked the committed
   fallback — fixed)
3. `npm ci` + `vite build` in `client/`, `admin/` and `billing/`
4. Tarball (`dist/`, `dist-admin/`, `dist-billing/`, `api/`, `scripts/`,
   `deploy.sh`) POSTed to `https://$DEPLOY_HOST/api/deploy` with `DEPLOY_TOKEN`
5. `deploy.sh` on the KVM atomically swaps `/var/www/crackershyderabad`,
   `/var/www/crackershyderabad-admin` and `/var/www/crackershyderabad-billing`,
   reinstalls `api/` deps, and restarts the `crackers-api` PM2 process

Required GitHub Secrets: `DEPLOY_TOKEN`, `DEPLOY_HOST`
(`VITE_FIREBASE_*` optional — committed fallback covers them).
Server env (on the KVM, never in git): `FIREBASE_SERVICE_ACCOUNT_KEY`,
`EMAIL_*`, `MSG91_*`. `service-account.json` is git-ignored; keep it out of git.

## Security notes

See `SECURITY.md` before deploying (rules deploy order matters). Never commit
`.env`, `service-account*.json`, `*.zip` deploy archives, or `node_modules` —
all are git-ignored.
#   c r a c k e r s h y d e r a b a d  
 