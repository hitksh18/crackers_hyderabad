#!/usr/bin/env node
'use strict';

/**
 * One-off migration: collapse the role vocabulary to admin | sales | customer.
 *
 * Stored roles/{uid}.role values outside the vocabulary — the retired
 * 'billing', 'packer' and 'mod' roles plus case/whitespace variants like
 * 'Admin' or ' SALES ' — are rewritten to their canonical form (retired roles
 * become 'customer'). The API and all three frontends already normalise on
 * read, but this makes the stored data match what every rule checks against.
 *
 * Run a dry run first:
 *
 *   node scripts/migrate-roles.js
 *   node scripts/migrate-roles.js --commit
 *
 * Safe to re-run: already-canonical documents are skipped and never written.
 */

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const VALID_ROLES = ['admin', 'sales', 'customer'];
const COMMIT = process.argv.includes('--commit');

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (fromEnv) return JSON.parse(fromEnv);

  const saPath = path.join(__dirname, '..', 'service-account.json');
  if (fs.existsSync(saPath)) return JSON.parse(fs.readFileSync(saPath, 'utf8'));

  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_KEY or provide service-account.json');
}

const canonical = (value) => {
  const role = String(value ?? '').trim().toLowerCase();
  return VALID_ROLES.includes(role) ? role : 'customer';
};

async function main() {
  initializeApp({ credential: cert(loadCredentials()) });
  const db = getFirestore();

  const snapshot = await db.collection('roles').get();
  console.log(`Scanned ${snapshot.size} role documents.\n`);

  const changes = [];
  snapshot.forEach((docSnap) => {
    const stored = docSnap.data().role;
    const target = canonical(stored);
    if (stored !== target) changes.push({ id: docSnap.id, stored, target });
  });

  if (changes.length === 0) {
    console.log('Nothing to migrate — every role is already canonical.');
    return;
  }

  console.log(`${changes.length} role documents need normalising:\n`);
  for (const entry of changes.slice(0, 50)) {
    console.log(`  ${entry.id}  ${JSON.stringify(entry.stored)} -> ${entry.target}`);
  }
  if (changes.length > 50) console.log(`  ... and ${changes.length - 50} more`);

  if (!COMMIT) {
    console.log('\nDry run. Re-run with --commit to apply.');
    return;
  }

  const CHUNK = 400;
  let done = 0;

  for (let i = 0; i < changes.length; i += CHUNK) {
    const batch = db.batch();
    for (const entry of changes.slice(i, i + CHUNK)) {
      batch.set(db.collection('roles').doc(entry.id), { role: entry.target }, { merge: true });
    }
    await batch.commit();
    done += Math.min(CHUNK, changes.length - i);
    console.log(`  committed ${done}/${changes.length}`);
  }

  console.log('\nDone. Stored roles now use only admin | sales | customer.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
