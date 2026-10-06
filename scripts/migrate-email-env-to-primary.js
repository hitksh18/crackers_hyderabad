/**
 * Migrate email configuration from the legacy .env.email into the primary .env.
 *
 * WHY: on KVM the deployment system creates and preserves exactly one file,
 * /root/crackers-deploy/.env. The API reads it as <api>/../.env. The legacy
 * .env.email is git-ignored, created by no deploy script and destroyed by
 * `rm -rf $DEPLOY_DIR/api` — so production email config must not live only
 * there. This script copies the keys across, safely:
 *
 *   - never prints a value, not even a length or a prefix
 *   - backs up the target before writing, so a mistake is reversible
 *   - preserves every other key already in the target
 *   - idempotent: re-running changes nothing
 *   - refuses to run in production mode without --write, so it is safe to
 *     inspect on a live box
 *
 * USAGE (on the server, as root):
 *   node scripts/migrate-email-env-to-primary.js              # dry run
 *   node scripts/migrate-email-env-to-primary.js --write      # apply
 *
 * Then: pm2 restart crackers-api --update-env && pm2 save
 *
 * Flags:
 *   --write          actually write (default is a dry run)
 *   --source=FILE    legacy file      (default <root>/.env.email)
 *   --target=FILE    primary file     (default <root>/.env)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const valueOf = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : fallback;
};

const WRITE = hasFlag('--write');
const SOURCE = valueOf('source', path.join(ROOT, '.env.email'));
const TARGET = valueOf('target', path.join(ROOT, '.env'));

// Keys the mail subsystem needs. Order is the documented order.
const EMAIL_KEYS = [
  'EMAIL_ENABLED',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM_NAME',
  'EMAIL_FROM_ADDRESS',
  'ADMIN_NOTIFICATION_EMAIL',
  'TRACK_BASE_URL',
];

/** Parse KEY=VALUE, stripping surrounding quotes. Values stay in memory only. */
function parse(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out.set(match[1], value);
  }
  return out;
}

const setOrMissing = (v) =>
  v === undefined || String(v).trim() === '' ? 'missing' : 'set';

/**
 * Applied with --write when a key is absent from BOTH files. Not secrets — the
 * documented production values. SMTP_PASSWORD is never seeded; if it is missing
 * the script says so rather than inventing one.
 */
const SEED_DEFAULTS = {
  ADMIN_NOTIFICATION_EMAIL: 'admin.crackershyderabad@gmail.com',
};

console.log('\n=========================================================');
console.log(' MIGRATE EMAIL ENV  ->  PRIMARY .env');
console.log(WRITE ? ' MODE: WRITE' : ' MODE: DRY RUN (nothing will change)');
console.log('=========================================================');
console.log(`source: ${SOURCE}`);
console.log(`target: ${TARGET}`);

if (!fs.existsSync(SOURCE)) {
  console.log('\nNothing to do: the source file does not exist.');
  console.log('If the values are already in the target, you are done.');
  process.exit(0);
}

const sourceMap = parse(fs.readFileSync(SOURCE, 'utf8'));
const targetExists = fs.existsSync(TARGET);
const targetText = targetExists ? fs.readFileSync(TARGET, 'utf8') : '';
const targetMap = parse(targetText);

console.log('\nEMAIL KEYS IN SOURCE (.env.email)');
console.log('---------------------------------------------------------');
const toWrite = [];
const seeds = new Map();
for (const key of EMAIL_KEYS) {
  const inSource = sourceMap.has(key) && String(sourceMap.get(key)).trim() !== '';
  const inTarget = targetMap.has(key) && String(targetMap.get(key)).trim() !== '';
  let action = 'nothing to do';
  if (inSource && !inTarget) {
    action = 'WILL ADD to .env';
    toWrite.push(key);
  } else if (inSource && inTarget) action = 'already in .env (kept)';
  else if (!inSource && inTarget) action = 'only in .env (kept)';
  else if (SEED_DEFAULTS[key]) {
    action = 'absent everywhere -> will seed documented default';
    seeds.set(key, SEED_DEFAULTS[key]);
  } else action = 'absent everywhere';
  console.log(
    `  ${key.padEnd(24)} source=${setOrMissing(sourceMap.get(key))}  target=${setOrMissing(targetMap.get(key))}  -> ${action}`
  );
}

const otherKeys = [...targetMap.keys()].filter((k) => !EMAIL_KEYS.includes(k));
console.log(`\nOther keys already in .env (preserved): ${otherKeys.length}`);

if (!toWrite.length && !seeds.size) {
  console.log('\nNo changes required — .env already carries every email key.');
  console.log('Next: pm2 restart crackers-api --update-env && pm2 save');
  process.exit(0);
}

const planned = [...toWrite, ...seeds.keys()];
if (!WRITE) {
  console.log(`\nDRY RUN: ${planned.length} key(s) would be added to ${TARGET}:`);
  console.log(`  from .env.email: ${toWrite.join(', ') || '(none)'}`);
  console.log(`  documented default: ${[...seeds.keys()].join(', ') || '(none)'}`);
  if (!toWrite.includes('SMTP_PASSWORD') && !targetMap.get('SMTP_PASSWORD')) {
    console.log('\n  NOTE: SMTP_PASSWORD is not set anywhere. The script will NOT invent it.');
    console.log('        Add it to .env by hand before restarting PM2.');
  }
  console.log('\nRe-run with --write to apply. No value was printed and nothing changed.');
  process.exit(0);
}

// --- write ------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${TARGET}.bak-${stamp}`;
fs.writeFileSync(backup, targetText, { mode: 0o600 });
console.log(`\nBackup written: ${backup}`);

const block = [
  ...EMAIL_KEYS.filter((k) => toWrite.includes(k)).map((k) => `${k}=${sourceMap.get(k)}`),
  ...[...seeds.entries()].map(([k, v]) => `${k}=${v}`),
].join('\n');

const needsNewline = targetText.length && !targetText.endsWith('\n');
const addition = [
  needsNewline ? '' : null,
  '',
  '# --- Email configuration (migrated from .env.email by',
  '# scripts/migrate-email-env-to-primary.js). Primary source of truth:',
  '# this file. Do NOT put these in api/ — update.sh deletes that directory. ---',
  block,
  '',
]
  .filter((line) => line !== null)
  .join('\n');

fs.writeFileSync(TARGET, `${targetText}${addition}`, { mode: 0o600 });
try {
  fs.chmodSync(TARGET, 0o600);
} catch {
  /* best effort on exotic filesystems */
}

console.log(`Wrote ${planned.length} key(s) to ${TARGET} (mode 600).`);
console.log('No value was printed.');
console.log('\nVerify (prints set/missing only, never a value):');
console.log('  node scripts/email-config-diagnostic.js');
console.log('\nThen restart so PM2 picks the file up:');
console.log('  pm2 restart crackers-api --update-env');
console.log('  pm2 save');
console.log(`\nOnce verified working, remove the legacy file: rm -f ${SOURCE}`);
void os;
