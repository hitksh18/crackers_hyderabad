#!/usr/bin/env node
/**
 * Build-time sitemap generator — runs OUTSIDE the browser (Node), so Google
 * never depends on client JavaScript to discover URLs and the client bundle
 * stays untouched (no sitemap library in frontend code).
 *
 * Source of truth: Firestore `products` (slug + updatedAt/createdAt) and the
 * canonical 12 categories from client/src/config/categories.js.
 *
 * Emits: homepage, /products, 12 category URLs (/products?category=<value> —
 * the intentional canonical structure), every slugged product, /about,
 * /contact. Utility/private pages (login, cart, checkout, orders, profile,
 * track-order, order-success) are NEVER included.
 *
 * Timestamps: products use their real updatedAt || createdAt; collection
 * pages reuse the newest product timestamp; static pages carry no lastmod
 * rather than an invented date.
 *
 * Safety: any Firestore failure, zero products, or zero total URLs aborts
 * with exit 2 WITHOUT touching the existing sitemap.xml.
 *
 * Usage (repo root):
 *   node scripts/generate-sitemap.js [--out client/public/sitemap.xml] [--dry-run]
 * Workflow: run before `npm run build --prefix client` on releases, or add
 * `"sitemap": "node scripts/generate-sitemap.js"` and run `npm run sitemap`.
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_KEY env (JSON string) or ./service-account.json
 * (same convention as api/server.js).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SITE = 'https://crackershyderabad.com';

function args() {
  const out = { dryRun: false, outFile: path.join(REPO_ROOT, 'client', 'public', 'sitemap.xml') };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--out') out.outFile = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node scripts/generate-sitemap.js [--out client/public/sitemap.xml] [--dry-run]');
      process.exit(0);
    }
  }
  return out;
}

function loadCreds() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const p = path.join(REPO_ROOT, 'service-account.json');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  console.error('Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_KEY or provide ./service-account.json');
  process.exit(2);
}

function dayOf(value) {
  try {
    let d = null;
    if (!value) return null;
    if (typeof value.toDate === 'function') d = value.toDate();
    else if (typeof value.seconds === 'number') d = new Date(value.seconds * 1000);
    else if (value instanceof Date) d = value;
    else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const opt = args();
  const { createRequire } = require('module');
  const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
  const { initializeApp, cert } = apiRequire('firebase-admin/app');
  const { getFirestore } = apiRequire('firebase-admin/firestore');
  try {
    initializeApp({ credential: cert(JSON.parse(loadCreds())) });
  } catch (e) { /* already initialized */ }
  const db = getFirestore();

  const { PRODUCT_CATEGORIES } = await import(
    'file:///' + path.join(REPO_ROOT, 'client', 'src', 'config', 'categories.js').replace(/\\/g, '/')
  );
  if (!Array.isArray(PRODUCT_CATEGORIES) || PRODUCT_CATEGORIES.length === 0) {
    console.error('No categories found — refusing to write a sitemap.');
    process.exit(2);
  }

  let snap;
  try {
    snap = await db.collection('products').get();
  } catch (e) {
    console.error('Firestore products read failed — sitemap untouched: ' + (e && e.message));
    process.exit(2);
  }
  if (snap.empty) {
    console.error('Zero products — refusing to write an empty sitemap.');
    process.exit(2);
  }

  const seen = new Set();
  const urls = [];
  const add = (loc, lastmod, changefreq, priority) => {
    if (!loc || seen.has(loc)) return false;
    seen.add(loc);
    urls.push({ loc, lastmod, changefreq, priority });
    return true;
  };

  const productDays = [];
  let skipped = 0;
  snap.forEach((d) => {
    const p = d.data();
    if (!p || typeof p.slug !== 'string' || !p.slug.trim() || !p.name) { skipped++; return; }
    const day = dayOf(p.updatedAt) || dayOf(p.createdAt);
    if (day) productDays.push(day);
    add(`${SITE}/product/${p.slug.trim()}`, day, 'weekly', '0.7');
  });
  if (productDays.length === 0) {
    console.error('No usable product timestamps — refusing to write a sitemap with zero dated URLs.');
    process.exit(2);
  }
  const newest = productDays.sort().reverse()[0];

  const home = [];
  home.push({ loc: `${SITE}/`, lastmod: newest, changefreq: 'daily', priority: '1.0' });
  home.push({ loc: `${SITE}/products`, lastmod: newest, changefreq: 'daily', priority: '0.9' });
  for (const c of PRODUCT_CATEGORIES) {
    if (!c || !c.value) continue;
    home.push({
      loc: `${SITE}/products?category=${encodeURIComponent(c.value)}`,
      lastmod: newest,
      changefreq: 'daily',
      priority: '0.8',
    });
  }
  home.push({ loc: `${SITE}/about`, lastmod: null, changefreq: 'monthly', priority: '0.5' });
  home.push({ loc: `${SITE}/contact`, lastmod: null, changefreq: 'monthly', priority: '0.5' });
  // Static pages first (homepage canonical order), then products.
  for (const u of home) add(u.loc, u.lastmod, u.changefreq, u.priority);

  if (urls.length === 0) {
    console.error('Refusing to write an empty sitemap.');
    process.exit(2);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          '  <url>\n' +
          `    <loc>${esc(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '') +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          '  </url>'
      )
      .join('\n') +
    '\n</urlset>\n';

  const counts = {
    total: urls.length,
    homepage: 1,
    productsPage: 1,
    categories: PRODUCT_CATEGORIES.length,
    products: urls.filter((u) => u.loc.includes('/product/')).length,
    about: 1,
    contact: 1,
    skippedDocs: skipped,
  };
  console.log(JSON.stringify(counts));

  if (opt.dryRun) {
    console.log('DRY-RUN: sitemap not written.');
    return;
  }
  const tmp = `${opt.outFile}.tmp`;
  fs.writeFileSync(tmp, xml, 'utf8');
  fs.renameSync(tmp, opt.outFile);
  console.log(`Wrote ${opt.outFile} (${urls.length} URLs)`);
}

main().catch((e) => {
  console.error('SITEMAP FAILED — existing file untouched: ' + (e && e.message));
  process.exit(1);
});
