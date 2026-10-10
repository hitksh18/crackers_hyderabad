/**
 * End-to-end check of the Order ID API, against a real Firebase emulator.
 *
 * Requires the emulators (see README / KVM_DEPLOYMENT.md):
 *   firebase emulators:start --only firestore,auth
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     FIREBASE_PROJECT_ID=demo-crackers node tests/order-id.e2e.js
 *
 * Skips itself with a clear message when the emulator is not running, so it is
 * safe to leave in `npm test`.
 *
 * What only a live Firestore can prove, and what the in-memory double in
 * order-id.test.js deliberately does NOT claim:
 *   - runTransaction really does serialise, so concurrent checkouts cannot both
 *     take sequence 1;
 *   - tx.create really does reject an existing document, so a duplicate id is
 *     unreachable;
 *   - the whole request path end to end: POST /api/orders returns the same id
 *     that tracking resolves, the admin settings API round-trips, and a format
 *     change leaves earlier orders untouched.
 */
'use strict';

const assert = require('node:assert/strict');

/* firebase-admin v14 reads FIRESTORE_EMULATOR_HOST (no FIREBASE_ prefix) and
   falls back to the older FIREBASE_ prefixed name. Both are accepted here so the
   script works whichever the caller has set.

   Getting this wrong is not a harmless mistake: with no emulator host the Admin
   SDK connects to the REAL project named in service-account.json, and this suite
   would be creating orders in production. So the host is required, and it is
   checked for loopback before anything is written. */
const FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_FIRESTORE_EMULATOR_HOST;
const AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.AUTH_EMULATOR_HOST;

if (!FIRESTORE_EMULATOR_HOST || !AUTH_EMULATOR_HOST) {
  console.log('SKIP order-id.e2e.js — set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to run it.');
  process.exit(0);
}

if (!/^(127\.0\.0\.1|localhost|\[::1\]|::1)/.test(FIRESTORE_EMULATOR_HOST)) {
  console.error(`REFUSING to run: the Firestore emulator host is "${FIRESTORE_EMULATOR_HOST}", which is not loopback.`);
  console.error('This suite writes orders. It must never run against a real project.');
  process.exit(1);
}

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3001';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-crackers';

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();
/* Set explicitly rather than left to the environment: this suite must talk to
   the emulator no matter what else is in the process environment. */
db.settings({ host: FIRESTORE_EMULATOR_HOST, ssl: false });

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/* -------------------------------------------------------------------------
   A staff identity, so the admin settings endpoints can be exercised
   ------------------------------------------------------------------------- */

async function createAdminUser() {
  /* Both emulators are found through the FIREBASE_*_EMULATOR_HOST variables
     above — firebase-admin reads them itself. There is nothing to point at
     here: v14 dropped the namespaced accessors, so `auth.settings` no longer
     exists to be assigned. */
  const auth = getAuth();

  const uid = 'e2e-admin';
  try {
    await auth.createUser({ uid, email: 'admin@test.local', password: 'Passw0rd!', emailVerified: true });
  } catch {
    // Already exists from a previous run — fine.
  }

  await db.collection('roles').doc(uid).set({ role: 'admin' });

  /* The Admin SDK has no sign-in method — it mints tokens, it does not accept
     credentials — so the password sign-in goes through the Auth emulator's
     Identity Toolkit endpoint directly. `key=fake` is what the emulator wants;
     it never leaves the loopback interface. The token it returns is a genuine
     RS256 ID token for this project, which is what verifyIdToken checks. */
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: 'Passw0rd!', returnSecureToken: true }),
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw new Error(`could not sign in to the auth emulator: ${JSON.stringify(body)}`);
  }

  return body.idToken;
}

/* -------------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------------- */

/* Priced above the shop's minimum order value (Rs.2500), so a plain checkout
   passes the same gate a real one does. Nothing here is about pricing — the
   minimum exists so the fixture is a realistic order rather than a special
   case the API would have to be configured around. */
const PRODUCT = {
  name: 'Test Sparkler',
  onlinePrice: 3000,
  price: 3000,
  outOfStock: false,
};

async function seedProduct() {
  const ref = db.collection('products').doc('e2e-product');
  await ref.set({ ...PRODUCT, createdAt: FieldValue.serverTimestamp() });
  return 'e2e-product';
}

/* A complete order as the API validates it. `delivery` is given in full rather
   than as { sameAsBilling: true } because sameAsBilling copies the BILLING
   address, which the API requires in structured form. */
const CUSTOMER = {
  name: 'Test Customer',
  phone: '9876543210',
  email: 'customer@test.local',
  address: '12 Test Street',
  city: 'Hyderabad',
  pincode: '500001',
};

const DELIVERY = {
  flatNo: '12',
  streetNo: '5',
  area: 'Banjara Hills',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500034',
};

async function placeOrder(token, overrides = {}) {
  const response = await apiFetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      customer: CUSTOMER,
      delivery: DELIVERY,
      items: [{ id: 'e2e-product', quantity: 1 }],
      ...overrides,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`checkout failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * The API rate-limits by client IP, and this suite is entirely one IP. A 429
 * would otherwise look like a behavioural failure, so each request waits out the
 * window it was told about and retries once.
 */
async function apiFetch(path, options = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, options);
    if (response.status !== 429) return response;

    const retryAfter = Number(response.headers.get('Retry-After')) || 60;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 500));
  }
  throw new Error(`${options.method || 'GET'} ${path} stayed rate-limited`);
}

async function getOrderIdSettings(token) {
  const response = await apiFetch('/api/admin/order-id', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`settings GET failed (${response.status}): ${JSON.stringify(body)}`);
  if (typeof body.highestUsedSequence !== 'number') {
    throw new Error(`settings GET returned no sequence state: ${JSON.stringify(body)}`);
  }
  return body;
}

async function saveOrderIdSettings(token, config) {
  const response = await apiFetch('/api/admin/order-id', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(config),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

/**
 * Put the emulator back to a known state.
 *
 * The counter is deleted rather than zeroed so the assertions below can talk
 * about sequence 1 in absolute terms, and the settings document is removed so the
 * default format is what is actually loaded.
 *
 * The tracking codes and orders MUST go too. They are the record of which ids
 * have been issued, so leaving them behind would make the next run collide with
 * its own predecessor at sequence 1 and walk the whole counter until it gave up
 * — a failure that looks exactly like a generator bug and is not one.
 */
async function resetState() {
  await deleteAll('trackingCodes');
  await deleteAll('orders');
  await db.collection('counters').doc('orders').delete();
  await db.collection('adminSettings').doc('orderId').delete();
}

/** Empty a collection in batches, using the Admin SDK's own paging. */
async function deleteAll(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) return;

  // Firestore caps a batch at 500 writes.
  for (let start = 0; start < snapshot.docs.length; start += 400) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(start, start + 400)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`\nOrder ID end-to-end — ${BASE_URL}\n`);

  const token = await createAdminUser();
  await seedProduct();

  // No stored config and no counter: the documented default, sequence 1.
  await resetState();

  const first = await placeOrder();
  const second = await placeOrder();

  await check('the first order gets sequence 1 in the default format', async () => {
    assert.equal(first.orderNumber, 1);
    assert.match(first.shortCode, /^CH-\d{8}-000001$/);
  });

  await check('consecutive orders increment with no gaps', async () => {
    assert.equal(second.orderNumber, 2);
    assert.match(second.shortCode, /^CH-\d{8}-000002$/);
    assert.notEqual(first.shortCode, second.shortCode);
  });

  await check('the tracking lookup resolves the id the checkout returned', async () => {
    const response = await apiFetch(`/api/orders/track/${encodeURIComponent(first.shortCode)}`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.orderCode, first.shortCode);
  });

  await check('the phone-gated lookup finds the same order', async () => {
    const response = await apiFetch('/api/orders/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: first.shortCode, phoneLast4: '3210' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.order.shortCode, first.shortCode);
  });

  await check('the wrong phone digits are refused', async () => {
    const response = await apiFetch('/api/orders/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: first.shortCode, phoneLast4: '9999' }),
    });
    assert.equal(response.status, 404);
  });

  /* ---- The property the brief asks about twice: simultaneous orders ------ */

  await check('twelve simultaneous orders all get different ids', async () => {
    // Read the counter first so the expected run is expressed relative to it,
    // rather than assuming what the previous checks consumed.
    const before = await getOrderIdSettings(token);

    const results = await Promise.all(Array.from({ length: 12 }, () => placeOrder()));
    const ids = results.map((r) => r.shortCode);
    assert.equal(new Set(ids).size, 12, `duplicate ids: ${ids.join(', ')}`);

    const numbers = results.map((r) => r.orderNumber).sort((a, b) => a - b);
    const first = before.highestUsedSequence + 1;
    const expected = Array.from({ length: 12 }, (_, i) => first + i);
    assert.deepEqual(numbers, expected, 'sequences must be contiguous and unique');
  });

  await check('a retried request creates a new order, never a duplicate id', async () => {
    const a = await placeOrder();
    const b = await placeOrder();
    assert.notEqual(a.shortCode, b.shortCode);
    assert.equal(b.orderNumber, a.orderNumber + 1);
  });

  /* ---- Settings validation ---------------------------------------------- */

  await check('a format with no sequence is refused', async () => {
    const { status, body } = await saveOrderIdSettings(token, {
      format: 'CH', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
    });
    assert.equal(status, 400);
    assert.match(body.errors.format, /must contain a unique sequence/i);
  });

  await check('a format containing # is refused', async () => {
    const { status, body } = await saveOrderIdSettings(token, {
      format: 'CH#{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
    });
    assert.equal(status, 400);
    assert.match(body.errors.format, /Do not use "#"/);
  });

  await check('rewinding the online counter steps over taken ids', async () => {
    const settings = await getOrderIdSettings(token);
    const highest = settings.highestUsedSequence;
    assert.ok(highest > 0);

    // Rewinding is accepted (mirrors the offline reset flow) — the commit
    // steps over taken tracking codes instead of duplicating them.
    const { status } = await saveOrderIdSettings(token, {
      format: 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
    });
    assert.equal(status, 200);

    const order = await placeOrder();
    assert.equal(order.orderNumber, highest + 1, 'must step over every taken number');

    // One above the highest is accepted too.
    const accepted = await saveOrderIdSettings(token, {
      format: 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: highest + 2,
    });
    assert.equal(accepted.status, 200);
  });

  await check('the settings API refuses an unauthenticated caller', async () => {
    const response = await fetch(`${BASE_URL}/api/admin/order-id`);
    assert.equal(response.status, 401);
  });

  /* ---- Changing the format ----------------------------------------------- */

  await check('changing the format affects only new orders', async () => {
    const before = await db.collection('orders').doc(first.orderId).get();
    const beforeCode = before.data().shortCode;

    const { status } = await saveOrderIdSettings(token, {
      format: 'ORD-{SEQUENCE}', prefix: '', sequenceLength: 4, nextSequence: 100,
    });
    assert.equal(status, 200);

    const after = await db.collection('orders').doc(first.orderId).get();
    assert.equal(after.data().shortCode, beforeCode, 'an existing order must be untouched');

    const next = await placeOrder();
    assert.match(next.shortCode, /^ORD-\d{4}$/);
    assert.equal(next.orderNumber, 100, 'the sequence must continue from the new floor');

    // The old order still tracks.
    const track = await apiFetch(`/api/orders/track/${encodeURIComponent(beforeCode)}`);
    assert.equal(track.status, 200, 'an old-format id must still resolve');
  });

  await check('an old-format id still needs the phone digits', async () => {
    const response = await apiFetch('/api/orders/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: first.shortCode, phoneLast4: '1234' }),
    });
    // 404, not a bare "please enter digits": the digits were supplied and wrong.
    assert.equal(response.status, 404);
  });

  await check('changing only the prefix keeps the sequence', async () => {
const saved = await saveOrderIdSettings(token, {
    format: '{PREFIX}-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CR', sequenceLength: 6, nextSequence: 101,
  });
  if (saved.status !== 200) {
    throw new Error(`could not set the prefix (${saved.status}): ${JSON.stringify(saved.body)}`);
  }
    const next = await placeOrder();
    assert.match(next.shortCode, /^CR-\d{8}-000101$/);
  });

  await check('counter bills use the offline counter, never the online one', async () => {
    const beforeOnline = (await getOrderIdSettings(token)).highestUsedSequence;
    const response = await apiFetch('/api/orders/pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customer: { name: 'Walk-in', phone: '9000000000' },
        items: [{ id: 'e2e-product', quantity: 1 }],
        paymentMode: 'Cash',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.match(body.shortCode, /^Ayyapa26-\d{4}$/, 'POS mints the offline format');

    const online = await placeOrder();
    assert.equal(online.orderNumber, beforeOnline + 1, 'POS must not consume online sequence');
  });

  await check('a config written straight to Firestore cannot inject unsafe ids', async () => {
    await db.collection('adminSettings').doc('orderId').set({
      version: 1, format: 'CH#{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 500,
    });

    const settings = await getOrderIdSettings(token);
    assert.equal(settings.storedConfigUsable, false, 'the hostile config must be reported as unusable');
    assert.equal(settings.config.format, 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', 'the default must be in force');

    const next = await placeOrder();
    assert.ok(!next.shortCode.includes('#'), 'no minted id may contain #');
  });

  // Leave the emulator in the documented default for the next run.
  await resetState();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nE2E run failed:', error);
  process.exit(1);
});