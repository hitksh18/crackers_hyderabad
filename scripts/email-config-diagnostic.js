/**
 * SAFE email configuration diagnostic - read-only, prints no secret.
 *
 * Answers "is the mail subsystem configured in THIS environment?" without ever
 * revealing a credential and without sending an email. Every value is reduced to
 * set / missing, true / false, or a redacted shape. The SMTP password is never
 * printed, logged or written anywhere - only its presence and length.
 *
 *   node scripts/email-config-diagnostic.js
 *       Report the environment this process sees, plus which env FILES exist
 *       and which keys they hold. Sends nothing.
 *
 *   node scripts/email-config-diagnostic.js --auth
 *       Additionally run a Gmail SMTP handshake with transporter.verify().
 *       That performs authentication but delivers NO email, so it is safe to
 *       use when the instruction is "do not send any other test emails".
 *
 * Safe to run on KVM and safe to paste the output anywhere: it contains no
 * credential material by construction.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const wantAuth = process.argv.includes('--auth');
const skipEnvLoad = process.argv.includes('--no-load-env');
const SECRET_KEYS = new Set(['SMTP_PASSWORD', 'EMAIL_PASS']);
const REPORT_KEYS = [
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

const line = (label, value) => console.log(`${label}: ${value}`);

/** set / missing without ever revealing the value. */
function state(key, raw) {
  if (raw === undefined || String(raw).trim() === '') return 'missing';
  if (SECRET_KEYS.has(key)) return 'set';
  if (key === 'EMAIL_ENABLED' || key === 'SMTP_SECURE') return String(raw).toLowerCase();
  return 'set';
}

/** Parse a dotenv file into key names only. Values are never returned. */
function envFileKeys(file) {
  const found = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    found[key] = value;
  }
  return found;
}

function describeFile(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return { file, exists: false };
  }
  const isSymlink = stat.isSymbolicLink();
  let target = null;
  if (isSymlink) {
    try {
      target = fs.readlinkSync(file);
    } catch {
      target = 'unreadable';
    }
  }
  const realExists = fs.existsSync(file);
  return {
    file,
    exists: true,
    isSymlink,
    target,
    brokenLink: isSymlink && !realExists,
    keys: realExists ? envFileKeys(file) : null,
  };
}

(async () => {
  const root = path.join(__dirname, '..');

  // Reproduce api/server.js's env-loading preamble exactly, so section [1]
  // reports what the API process would really see. A standalone script that
  // skipped this is exactly how a working setup looks broken.
  if (!skipEnvLoad) {
    if (process.env.NODE_ENV === 'production') {
      const envPath = path.join(root, '.env');
      if (fs.existsSync(envPath)) {
        try { process.loadEnvFile(envPath); console.log('(loaded .env)'); }
        catch (e) { console.log(`(could not load .env: ${e.message})`); }
      }
    }
    const emailEnvPath = path.join(root, '.env.email');
    if (fs.existsSync(emailEnvPath)) {
      try { process.loadEnvFile(emailEnvPath); console.log('(loaded .env.email)'); }
      catch (e) { console.log(`(could not load .env.email: ${e.message})`); }
    }
  }

  console.log('\n=========================================================');
  console.log(' EMAIL CONFIGURATION DIAGNOSTIC (no secrets shown)');
  console.log('=========================================================');

  // --- 1. what this process can see -----------------------------------------
  console.log('\n[1] RUNTIME ENVIRONMENT AS SEEN BY THIS PROCESS');
  console.log('---------------------------------------------------------');
  for (const key of REPORT_KEYS) line(key, state(key, process.env[key]));
  line('NODE_ENV', process.env.NODE_ENV || 'missing');
  line('PORT', process.env.PORT || 'missing');
  console.log(`CWD: ${process.cwd()}`);
  console.log(`script dir: ${__dirname}`);

  // --- 2. which env files exist, mirroring api/server.js ---------------------
  // api/server.js loads <api>/../.env then <api>/../.env.email. On KVM the API
  // runs from /root/crackers-deploy/api, so those resolve to /root/crackers-deploy/.
  const candidates = [
    path.join(root, '.env'),
    path.join(root, '.env.email'),
    path.join(root, 'api', '.env'),
    path.join(root, 'api', '.env.email'),
    '/root/crackers-deploy/.env',
    '/root/crackers-deploy/.env.email',
    '/root/crackers-deploy/api/.env',
    '/root/crackers-deploy/api/.env.email',
    '/root/crackers-deploy/repo/.env',
    '/root/crackers-deploy/repo/.env.email',
  ];

  console.log('\n[2] ENV FILES ON DISK');
  console.log('---------------------------------------------------------');
  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    const info = describeFile(file);
    if (!info.exists) {
      console.log(`  absent        ${file}`);
      continue;
    }
    const kind = info.brokenLink
      ? 'BROKEN LINK  '
      : info.isSymlink
        ? `symlink -> ${info.target}`
        : 'regular file ';
    console.log(`  ${kind}  ${file}`);
    if (info.brokenLink) {
      console.log('      !! symlink target does not exist - env will NOT load');
      continue;
    }
    if (!info.keys) continue;
    const relevant = REPORT_KEYS.filter((k) => k in info.keys);
    console.log(
      relevant.length
        ? `      holds: ${relevant.map((k) => `${k}=${state(k, info.keys[k])}`).join(', ')}`
        : '      holds: none of the email keys'
    );
  }

  // --- 3. what the application itself concludes -------------------------------
  console.log('\n[3] APPLICATION VIEW (readEmailConfig)');
  console.log('---------------------------------------------------------');
  try {
    const { readEmailConfig } = require(path.join(root, 'api', 'lib', 'email'));
    const config = readEmailConfig();
    line('email enabled', config.enabled);
    line('resolved config', config.describe);
    line('admin recipient resolved', config.adminNotificationEmail || 'missing');
    console.log(
      config.problems.length
        ? `BLOCKERS: ${config.problems.join(' | ')}`
        : 'BLOCKERS: none - configuration looks complete'
    );
  } catch (error) {
    console.log(`could not load api/lib/email.js: ${error.message}`);
    console.log('(run this from the deployed api directory if the path differs)');
  }

  // --- 4. optional SMTP authentication, sends no mail ------------------------
  console.log('\n[4] GMAIL SMTP AUTHENTICATION');
  console.log('---------------------------------------------------------');
  if (!wantAuth) {
    console.log('skipped (pass --auth to test; verify() delivers no email)');
  } else {
    try {
      const { readEmailConfig, createSmtpTransporter } = require(
        path.join(root, 'api', 'lib', 'email')
      );
      const config = readEmailConfig();
      if (config.problems.length) {
        console.log(`cannot attempt auth, config incomplete: ${config.problems.join(', ')}`);
      } else {
        const transport = createSmtpTransporter(config);
        const started = Date.now();
        try {
          await transport.verify();
          console.log(`AUTH OK (${Date.now() - started}ms) - Gmail accepted the credentials`);
        } catch (error) {
          const safe = String((error && error.message) || error)
            .replace(/pass(word)?=[^\s;]*/gi, 'pass=[redacted]')
            .slice(0, 200);
          console.log(`AUTH FAILED: ${safe}`);
          console.log('  535/5.7.8 = app password revoked or wrong');
          console.log('  550/5.7.1 = account blocked or not allowed to send');
          console.log('  ETIMEDOUT / ECONNREFUSED = egress blocked on port 465');
        } finally {
          transport.close();
        }
      }
    } catch (error) {
      console.log(`auth check could not run: ${error.message}`);
    }
  }

  console.log('\n=========================================================\n');
})().catch((error) => {
  console.error('diagnostic crashed:', error && error.message ? error.message : error);
  process.exit(1);
});
