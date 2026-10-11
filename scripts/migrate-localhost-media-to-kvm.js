#!/usr/bin/env node
/**
 * SAFE, NON-DESTRUCTIVE media migration: localhost-recorded product images
 * → KVM single source of truth.
 *
 * Context: some Firestore products carry imageURL/imageURL2 values like
 * http://localhost:3001/uploads/products/<file> whose bytes only exist on a
 * dev machine. On production those URLs 404. This script copies the exact
 * files (same names, same bytes) into the KVM media directory and rewrites
 * ONLY the affected URL fields to the production base — after verification.
 *
 * Guarantees:
 * - DRY-RUN by default: reports without copying anything or writing Firestore.
 * - Never overwrites an existing KVM file.
 * - Never renames files or modifies image bytes.
 * - Firestore field is updated ONLY after the destination file is verified
 *   on disk (and, with --verify-http, reachable over HTTP).
 * - Missing local sources are reported, never fabricated.
 *
 * WHERE TO RUN: on the KVM (it needs the KVM media dir + Firestore creds).
 *   1. Copy the local files up first:
 *        scp -r api/uploads/products <kvm-user>@<kvm-host>:/root/media-migrate/
 *   2. SSH in and dry-run:
 *        node scripts/migrate-localhost-media-to-kvm.js --source-dir /root/media-migrate/products
 *   3. Canary one product, then commit:
 *        node scripts/migrate-localhost-media-to-kvm.js --source-dir /root/media-migrate/products --product <id> --commit
 *        node scripts/migrate-localhost-media-to-kvm.js --source-dir /root/media-migrate/products --commit
 *
 * Auth: FIREBASE_SERVICE_ACCOUNT_KEY env (JSON string) or ./service-account.json
 * (same convention as api/server.js). MEDIA_ROOT / MEDIA_PUBLIC_BASE envs are
 * honoured; MEDIA_PUBLIC_BASE must NOT be loopback/LAN (refused, like the API).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
let adminApp;
let adminFirestore;
try {
  // Prefer the API's installed firebase-admin (present on KVM after deploy).
  const { createRequire } = require('module');
  const apiRequire = createRequire(path.join(REPO_ROOT, 'api', 'package.json'));
  adminApp = apiRequire('firebase-admin/app');
  adminFirestore = apiRequire('firebase-admin/firestore');
} catch (e) {
  console.error('firebase-admin (api/node_modules) is required: ' + e.message);
  process.exit(2);
}

const DEFAULT_MEDIA_ROOT = '/var/www/crackershyderabad-media';
const DEFAULT_PUBLIC_BASE = 'https://crackershyderabad.com/uploads';
const IMAGE_FIELDS = ['imageURL', 'imageURL2'];
const FILENAME_RE = /^[A-Za-z0-9._-]+\.(jpg|png|webp|gif)$/i;

function args() {
  const out = { commit: false, limit: 0, product: null, verifyHttp: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') out.commit = true;
    else if (a === '--verify-http') out.verifyHttp = true;
    else if (a === '--source-dir') out.sourceDir = argv[++i];
    else if (a === '--media-root') out.mediaRoot = argv[++i];
    else if (a === '--public-base') out.publicBase = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--product') out.product = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/migrate-localhost-media-to-kvm.js --source-dir DIR [--commit] [--verify-http] [--media-root DIR] [--public-base URL] [--limit N] [--product ID]');
      process.exit(0);
    }
  }
  if (!out.sourceDir) out.sourceDir = '/root/media-migrate/products';
  if (!out.mediaRoot) out.mediaRoot = process.env.MEDIA_ROOT || process.env.UPLOAD_DIR || process.env.KVM_MEDIA_ROOT || DEFAULT_MEDIA_ROOT;
  if (!out.publicBase) out.publicBase = (process.env.MEDIA_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '');
  return out;
}

function hostOf(u) {
  try { return new URL(u.trim()).hostname.toLowerCase(); } catch { return ''; }
}

function isLocalNetUrl(u) {
  if (typeof u !== 'string' || !u.trim() || /^(blob|data):/i.test(u.trim())) return false;
  const h = hostOf(u);
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' ||
    h.endsWith('.local') || h.endsWith('.localhost') || h.startsWith('192.168.') ||
    h.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function splitUploadsPath(u) {
  // Returns { dir, filename } for .../uploads/<dir>/<file>, else null.
  try {
    const parts = new URL(u.trim()).pathname.split('/').filter(Boolean);
    const i = parts.indexOf('uploads');
    if (i < 0 || parts.length < i + 3) return null;
    const dir = parts.slice(i + 1, -1).join('/');
    const filename = decodeURIComponent(parts[parts.length - 1]);
    if (!/^[A-Za-z0-9._/-]+$/.test(dir + '/' + filename) || filename.includes('..')) return null;
    if (!FILENAME_RE.test(filename)) return null;
    return { dir, filename };
  } catch { return null; }
}

async function httpOk(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ctl.signal });
    clearTimeout(t);
    return r.status >= 200 && r.status < 300;
  } catch { return false; }
}

function loadCreds() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const p = path.join(REPO_ROOT, 'service-account.json');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  console.error('Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_KEY or provide ./service-account.json');
  process.exit(2);
}

async function main() {
  const opt = args();
  if (isLocalNetUrl(opt.publicBase)) {
    console.error(`Refusing: --public-base resolves to a non-public origin (${opt.publicBase}).`);
    process.exit(2);
  }

  const { initializeApp, cert } = adminApp;
  const { getFirestore } = adminFirestore;
  try { initializeApp({ credential: cert(JSON.parse(loadCreds())) }); } catch (e) { /* already init */ }
  const db = getFirestore();

  console.log(`mode=${opt.commit ? 'COMMIT' : 'DRY-RUN'} source=${opt.sourceDir} media=${opt.mediaRoot} base=${opt.publicBase}`);
  const snap = await db.collection('products').get();
  const rows = [];
  snap.forEach((d) => {
    if (opt.product && d.id !== opt.product) return;
    const p = d.data();
    for (const field of IMAGE_FIELDS) {
      const v = p[field];
      if (typeof v === 'string' && v.trim() && isLocalNetUrl(v)) {
        rows.push({ id: d.id, name: p.name || '', field, oldUrl: v.trim() });
      }
    }
  });
  const work = opt.limit > 0 ? rows.slice(0, opt.limit) : rows;
  if (opt.limit > 0) console.log(`limited to first ${work.length} of ${rows.length} rows`);

  const report = [];
  const summary = { rows: work.length, copied: 0, firestoreUpdated: 0, alreadyOnKvm: 0, missingSource: 0, skipped: 0 };
  for (const r of work) {
    const parsed = splitUploadsPath(r.oldUrl);
    const rec = { ...r, source: null, dest: null, destExists: false, upload: 'NO', newUrl: null, note: '' };
    if (!parsed) { rec.note = 'SKIP: URL path not in /uploads/<dir>/<file> form'; summary.skipped++; report.push(rec); continue; }
    rec.source = path.join(opt.sourceDir, parsed.filename);
    rec.dest = path.join(opt.mediaRoot, ...parsed.dir.split('/'), parsed.filename);
    rec.newUrl = `${opt.publicBase}/${parsed.dir}/${encodeURIComponent(parsed.filename)}`;

    let destStat = null;
    try { const st = fs.statSync(rec.dest); destStat = st.isFile() ? st : null; } catch { destStat = null; }
    rec.destExists = !!destStat;

    let sourceStat = null;
    try { const st = fs.statSync(rec.source); sourceStat = st.isFile() ? st : null; } catch { sourceStat = null; }

    if (destStat) {
      summary.alreadyOnKvm++;
      let ok = true;
      if (opt.verifyHttp) ok = await httpOk(rec.newUrl);
      if (!ok) { rec.note = 'DEST EXISTS but HTTP check failed — Firestore left unchanged'; report.push(rec); continue; }
      rec.upload = 'EXISTS';
      if (opt.commit) {
        await db.collection('products').doc(r.id).update({ [r.field]: rec.newUrl });
        summary.firestoreUpdated++;
        rec.note = 'Firestore URL corrected to verified existing file';
      } else {
        rec.note = 'DRY-RUN: would update Firestore URL (file already on KVM)';
      }
      report.push(rec);
      continue;
    }

    if (!sourceStat) {
      summary.missingSource++;
      rec.note = 'MISSING SOURCE: local file absent — nothing copied, Firestore unchanged';
      report.push(rec);
      continue;
    }

    if (!opt.commit) {
      rec.note = `DRY-RUN: would copy ${sourceStat.size}B then update Firestore URL`;
      report.push(rec);
      continue;
    }

    await fs.promises.mkdir(path.dirname(rec.dest), { recursive: true });
    await fs.promises.copyFile(rec.source, rec.dest);
    try { await fs.promises.chmod(rec.dest, 0o644); } catch { /* non-fatal */ }
    const after = fs.statSync(rec.dest);
    if (!after.isFile() || after.size !== sourceStat.size) {
      rec.note = 'VERIFY FAILED after copy — Firestore left unchanged';
      report.push(rec);
      continue;
    }
    let ok = true;
    if (opt.verifyHttp) ok = await httpOk(rec.newUrl);
    if (!ok && opt.verifyHttp) {
      rec.note = 'Copied + stat-verified, but HTTP check failed — Firestore left unchanged (re-run with --verify-http after Nginx check)';
      report.push(rec);
      continue;
    }
    await db.collection('products').doc(r.id).update({ [r.field]: rec.newUrl });
    summary.copied++;
    summary.firestoreUpdated++;
    rec.upload = 'OK';
    rec.note = `Copied ${after.size}B + verified + Firestore updated`;
    report.push(rec);
  }

  console.log('--- rows: PRODUCT NAME | ID | FIELD | OLD URL | SOURCE | DEST | DEST-EXISTS | UPLOAD | NEW URL | NOTE ---');
  for (const rec of report) {
    console.log([rec.name.slice(0, 44), rec.id, rec.field, rec.oldUrl, rec.source, rec.dest, rec.destExists, rec.upload, rec.newUrl, rec.note].join(' | '));
  }
  console.log('--- summary ---');
  console.log(JSON.stringify(summary));
}

main().catch((e) => { console.error('MIGRATION FAILED: ' + (e && e.message)); process.exit(1); });
