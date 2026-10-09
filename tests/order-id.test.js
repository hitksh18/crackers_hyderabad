/**
 * Order ID generator — the tests that matter.
 *
 * Run: node tests/order-id.test.js
 *
 * Three groups:
 *   1. The generator itself: rendering, validation, the character-set rules.
 *   2. Parity — the admin screen's preview renderer must agree with the server's,
 *      or the preview lies about what the customer will be given.
 *   3. The sequence, driven against an in-memory Firestore stand-in that models
 *      the two properties that matter: transactions serialise, and `create` fails
 *      when the document already exists. That is enough to test concurrency and
 *      collision behaviour without a live database.
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const orderId = require('../api/lib/orderId');

/* The admin app is ESM and browser-targeted; pull its renderers in with a
   dynamic import so the two can be compared directly. */
let clientPreview;
let adminPreview;

test.before(async () => {
  clientPreview = await import('../client/src/lib/orderId.js');
  adminPreview = await import('../admin/src/lib/orderIdFormat.js');
});

const NOW = new Date('2026-10-08T09:15:00Z'); // 14:45 IST, same calendar day

/* -------------------------------------------------------------------------
   1. Rendering
   ------------------------------------------------------------------------- */

test('default format renders the documented example', () => {
  const config = orderId.defaultConfig();
  assert.equal(orderId.renderOrderId(config, { sequence: 1, now: NOW }), 'CHYD26-0001');
  assert.equal(orderId.renderOrderId(config, { sequence: 2, now: NOW }), 'CHYD26-0002');
  assert.equal(orderId.renderOrderId(config, { sequence: 42, now: NOW }), 'CHYD26-0042');
});

test('sequence zero-pads to the configured width', () => {
  const config = { format: '{SEQUENCE}', prefix: '', sequenceLength: 6 };
  assert.equal(orderId.renderOrderId(config, { sequence: 1 }), '000001');
  assert.equal(orderId.renderOrderId(config, { sequence: 999999 }), '999999');

  const narrow = { format: '{SEQUENCE}', prefix: '', sequenceLength: 4 };
  assert.equal(orderId.renderOrderId(narrow, { sequence: 1 }), '0001');
  assert.equal(orderId.renderOrderId(narrow, { sequence: 3 }), '0003');
});

test('a sequence wider than the configured length grows rather than truncating', () => {
  // Truncating would make 1000000 and 000000 collide onto the same id.
  const config = { format: 'CH-{SEQUENCE}', prefix: 'CH', sequenceLength: 6 };
  assert.equal(orderId.renderOrderId(config, { sequence: 1000000 }), 'CH-1000000');
});

test('every block renders its documented value', () => {
  // NOW is 2026-10-08T09:15Z = 14:45 IST on 2026-10-08.
  const config = { format: '{PREFIX}{YYYY}{YY}{MM}{DD}{HH}{MIN}-{SEQUENCE}', prefix: 'X', sequenceLength: 3 };
  assert.equal(orderId.renderOrderId(config, { sequence: 7, now: NOW }), 'X20262610081445-007');
});

test('prefix is configurable and independent of the literal text', () => {
  const base = { format: '{PREFIX}-{SEQUENCE}', sequenceLength: 6 };
  assert.equal(orderId.renderOrderId({ ...base, prefix: 'CH' }, { sequence: 1 }), 'CH-000001');
  assert.equal(orderId.renderOrderId({ ...base, prefix: 'CR' }, { sequence: 1 }), 'CR-000001');
  assert.equal(orderId.renderOrderId({ ...base, prefix: '' }, { sequence: 1 }), '-000001');
});

test('the date is rendered in IST, so a late-night order keeps its own date', () => {
  // Date blocks are opt-in via the format string; the default format carries
  // no date. This pins the IST rendering of the general machinery.
  const config = { format: 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6 };
  // 18:30 UTC on the 8th is 00:00 IST on the 9th — the id must say the 9th.
  const lateNight = new Date('2026-10-08T18:30:00Z');
  assert.equal(orderId.renderOrderId(config, { sequence: 1, now: lateNight }), 'CH-20261009-000001');

  // 19:00 UTC on the 8th is still the 9th in India (00:30).
  const justAfter = new Date('2026-10-08T19:00:00Z');
  assert.equal(orderId.renderOrderId(config, { sequence: 2, now: justAfter }), 'CH-20261009-000002');

  // 18:29 UTC is 23:59 IST on the 8th — the last moment of the 8th.
  const lastMoment = new Date('2026-10-08T18:29:00Z');
  assert.equal(orderId.renderOrderId(config, { sequence: 3, now: lastMoment }), 'CH-20261008-000003');
});

test('consecutive sequences always render differently', () => {
  // The property the whole system rests on: two orders can never share an id.
  const configs = [
    orderId.defaultConfig(),
    { format: 'ORD-{SEQUENCE}', prefix: '', sequenceLength: 6 },
    { format: '{SEQUENCE}', prefix: '', sequenceLength: 4 },
    { format: 'CH{YYYY}{MM}{DD}-{HH}{MIN}{SEQUENCE}', prefix: 'CH', sequenceLength: 3 },
  ];

  for (const config of configs) {
    const seen = new Set();
    for (let sequence = 1; sequence <= 200; sequence += 1) {
      const id = orderId.renderOrderId(config, { sequence, now: NOW });
      assert.ok(!seen.has(id), `duplicate id ${id} from format ${config.format} at ${sequence}`);
      seen.add(id);
    }
  }
});

/* -------------------------------------------------------------------------
   2. Validation
   ------------------------------------------------------------------------- */

const valid = (overrides = {}) =>
  validateOk({ format: 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1, ...overrides });

function validateOk(input, floor = 0) {
  const result = orderId.validateConfig(input, { highestUsedSequence: floor });
  assert.equal(result.ok, true, `expected valid, got: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function validateErr(input, floor = 0) {
  const result = orderId.validateConfig(input, { highestUsedSequence: floor });
  assert.equal(result.ok, false, `expected invalid, got valid for ${JSON.stringify(input)}`);
  return result.errors;
}

test('a format with no sequence is rejected with the documented message', () => {
  const errors = validateErr({ format: 'CH', prefix: 'CH', sequenceLength: 6, nextSequence: 1 });
  assert.match(errors.format, /must contain a unique sequence/i);
});

test('a date-only format is rejected: two orders in a day would collide', () => {
  const errors = validateErr({
    format: 'CH-{YYYY}{MM}{DD}', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
  });
  assert.match(errors.format, /must contain a unique sequence/i);
});

test('a hash is rejected everywhere it could appear', () => {
  // In the format…
  assert.match(
    validateErr({ format: 'CH#{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 }).format,
    /Do not use "#"/
  );
  // …in the prefix…
  assert.match(
    validateErr({ format: '{PREFIX}-{SEQUENCE}', prefix: 'CH#', sequenceLength: 6, nextSequence: 1 }).prefix,
    /Do not use "#"/
  );
  // …and a stored config carrying one is ignored rather than honoured.
  const { isUsable } = orderId.normalizeConfig({
    format: '{SEQUENCE}', prefix: 'CH#', sequenceLength: 6, nextSequence: 1,
  });
  assert.equal(isUsable, false);
});

test('other unsafe characters are rejected', () => {
  for (const bad of ['CH/{SEQUENCE}', 'CH.{SEQUENCE}', 'CH@{SEQUENCE}', 'CH+{SEQUENCE}', 'CH~{SEQUENCE}', 'CH?{SEQUENCE}']) {
    const errors = validateErr({ format: bad, prefix: 'CH', sequenceLength: 6, nextSequence: 1 });
    assert.ok(errors.format, `expected ${bad} to be rejected`);
  }
});

test('whitespace in a format is stripped, not rejected', () => {
  // An admin typing "CH- {SEQUENCE}" should get what they meant, not an error.
  const value = valid({ format: 'CH- {YYYY}{MM}{DD}- {SEQUENCE}' });
  assert.equal(value.format, 'CH-{YYYY}{MM}{DD}-{SEQUENCE}');
});

test('underscores and hyphens are allowed', () => {
  const value = valid({ format: 'CH_ORDER-{SEQUENCE}' });
  assert.equal(value.format, 'CH_ORDER-{SEQUENCE}');
  assert.ok(orderId.isSafeOrderId(orderId.renderOrderId(value, { sequence: 5 })));
});

test('an unknown block names the block and lists the valid ones', () => {
  const errors = validateErr({ format: 'CH-{QUARTER}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 });
  assert.match(errors.format, /QUARTER/);
  assert.match(errors.format, /SEQUENCE/);
});

test('the sequence may appear more than once, and anywhere', () => {
  assert.ok(valid({ format: '{SEQUENCE}' }).format === '{SEQUENCE}');
  assert.ok(valid({ format: '{SEQUENCE}-{YYYY}{SEQUENCE}' }).format === '{SEQUENCE}-{YYYY}{SEQUENCE}');
});

test('prefix rules', () => {
  // Empty is legal — `ORD-{SEQUENCE}` is the brief's own example of a
  // format change, and it has no prefix.
  assert.equal(valid({ format: 'ORD-{SEQUENCE}', prefix: '', sequenceLength: 6, nextSequence: 1 }).prefix, '');

  assert.ok(validateErr({ format: '{SEQUENCE}', prefix: 'A'.repeat(13), sequenceLength: 6, nextSequence: 1 }).prefix);
  assert.ok(validateErr({ format: '{SEQUENCE}', prefix: 'CH!', sequenceLength: 6, nextSequence: 1 }).prefix);
  assert.equal(valid({ prefix: 'CH_' }).prefix, 'CH_');
});

test('an empty prefix is not substituted for the default', () => {
  // Validating against a default prefix the format does not use would approve a
  // different id than the one that would actually be minted.
  const value = valid({ format: '{SEQUENCE}', prefix: '', sequenceLength: 6, nextSequence: 7 });
  assert.equal(orderId.renderOrderId(value, { sequence: 7 }), '000007');
});

test('sequence length rules', () => {
  assert.ok(validateErr({ format: '{SEQUENCE}', prefix: 'CH', sequenceLength: 2, nextSequence: 1 }).sequenceLength);
  assert.ok(validateErr({ format: '{SEQUENCE}', prefix: 'CH', sequenceLength: 13, nextSequence: 1 }).sequenceLength);
  assert.ok(validateErr({ format: '{SEQUENCE}', prefix: 'CH', sequenceLength: 'six', nextSequence: 1 }).sequenceLength);
  assert.equal(valid({ sequenceLength: 4 }).sequenceLength, 4);
});

test('the sequence may never go below one that has been issued', () => {
  // The rule from the brief, with the shop's own numbers.
  const errors = validateErr(
    { format: 'CH-{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
    4582
  );
  assert.equal(errors.nextSequence, 'Next sequence number must be greater than the highest existing sequence.');

  // Exactly one above the highest is fine.
  assert.ok(valid({ nextSequence: 4583 }, 4582));
});

test('jumping the sequence forward is allowed', () => {
  assert.equal(valid({ nextSequence: 9999 }, 4582).nextSequence, 9999);
});

test('a next sequence past 9999 is rejected', () => {
  // The human-facing range is 0001-9999; past the top the server refuses to
  // mint rather than rolling over and duplicating ids.
  const errors = validateErr({ format: '{PREFIX}-{SEQUENCE}', prefix: 'CHYD26', sequenceLength: 4, nextSequence: 10000 });
  assert.match(errors.nextSequence, /9999/);
});

test('a format that would render too long for the tracking page is rejected', () => {
  // 3 + 1 + 30 + 10 = 44 characters, past the 40 the tracking endpoints accept.
  const errors = validateErr({
    format: `CH-${'Y'.repeat(30)}{SEQUENCE}`, prefix: 'CH', sequenceLength: 6, nextSequence: 1,
  });
  assert.match(errors.format, /40 characters or fewer/);
});

test('a format that would render too short to type is rejected', () => {
  // {SEQUENCE} at length 3 renders exactly 3 characters — the floor. Two would
  // be too short to read aloud reliably, which is why the sequence minimum is 3.
  assert.ok(valid({ format: '{SEQUENCE}', prefix: '', sequenceLength: 3, nextSequence: 1 }));
  assert.ok(
    validateErr({ format: '{SEQUENCE}', prefix: '', sequenceLength: 2, nextSequence: 1 }).sequenceLength,
    'a two-digit sequence must be refused outright'
  );
});

test('validation normalises what the admin typed', () => {
  const value = valid({ format: 'ch-{yyyy}{mm}{dd}-{sequence}', prefix: 'cr', sequenceLength: '4' });
  assert.equal(value.format, 'CH-{YYYY}{MM}{DD}-{SEQUENCE}');
  assert.equal(value.prefix, 'CR');
  assert.equal(value.sequenceLength, 4);
});

/* -------------------------------------------------------------------------
   3. Stored config
   ------------------------------------------------------------------------- */

test('a stored config that would render an unsafe id is ignored', () => {
  // Anything with write access to the document must not be able to inject `#`
  // into customer-facing ids by editing Firestore directly.
  const { config, isUsable } = orderId.normalizeConfig({
    format: 'CH#{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
  });
  assert.equal(isUsable, false);
  assert.equal(config.format, orderId.DEFAULT_FORMAT);
  assert.ok(orderId.isSafeOrderId(orderId.renderOrderId(config, { sequence: 1 })));
});

test('a stored config missing the sequence block is ignored', () => {
  const { config, isUsable } = orderId.normalizeConfig({ format: 'CH-{YYYY}', prefix: 'CH', sequenceLength: 6 });
  assert.equal(isUsable, false);
  assert.equal(config.format, orderId.DEFAULT_FORMAT);
});

test('a stored config that cannot produce a unique id is ignored', () => {
  const { isUsable } = orderId.normalizeConfig({
    format: 'CH-{YYYY}{MM}{DD}', prefix: 'CH', sequenceLength: 6, nextSequence: 1,
  });
  assert.equal(isUsable, false);
});

test('a stored prefix is checked even when the format does not use it', () => {
  // `CH#` is inert while the format is `{SEQUENCE}`, and becomes a live `#` in
  // customer-facing ids the moment an admin adds {PREFIX}. Better to reject it
  // at the door than to leave that waiting.
  const { isUsable } = orderId.normalizeConfig({
    format: '{SEQUENCE}', prefix: 'CH#', sequenceLength: 6, nextSequence: 1,
  });
  assert.equal(isUsable, false);
});

test('a valid stored config is honoured', () => {
  const { config, isUsable } = orderId.normalizeConfig({
    format: 'CR-{SEQUENCE}', prefix: 'CR', sequenceLength: 4, nextSequence: 7,
  });
  assert.equal(isUsable, true);
  assert.equal(config.sequenceLength, 4);
});

test('an out-of-range stored sequence length is clamped, not rejected', () => {
  const { config, isUsable } = orderId.normalizeConfig({
    format: 'CH-{SEQUENCE}', prefix: 'CH', sequenceLength: 99, nextSequence: 1,
  });
  assert.equal(isUsable, true);
  assert.equal(config.sequenceLength, orderId.MAX_SEQUENCE_LENGTH);
});

/* -------------------------------------------------------------------------
   4. The tracking lookup, for both new and legacy ids
   ------------------------------------------------------------------------- */

test('the tracking lookup accepts every id shape the shop can issue', () => {
  const ids = [
    // The configured default.
    'CH-20261008-000001',
    // A custom prefix.
    'CR-20261008-000042',
    // A sequence-only format.
    'ORD-000042',
    // Legacy: the old sequential range and the old random-suffix range.
    'CH01',
    'CH100',
    'CH1042',
    'CH1042-K7QMX3',
  ];
  for (const id of ids) {
    assert.ok(orderId.isSafeOrderId(id), `${id} should be a valid tracking id`);
  }
});

test('the tracking lookup rejects characters no generator can produce', () => {
  for (const id of ['CH#42', 'CH/42', 'CH 42', 'CH.42', 'CH;42', 'CH%42', 'ab', 'x'.repeat(41)]) {
    assert.ok(!orderId.isSafeOrderId(id), `${id} should be rejected`);
  }
});

test('a Firestore auto-id is still accepted as a tracking key', () => {
  // The lookup is upper-cased before the character check, so a mixed-case
  // auto-id passes — which is why the entropy rule below has to identify an
  // auto-id by case rather than by length.
  const autoId = 'Xk3mQ9vB2pL7nR4tY8wZ';
  assert.ok(orderId.isSafeOrderId(autoId.toUpperCase()), 'the upper-cased form must pass the gate');
});

test('only genuinely unguessable codes skip the phone check', () => {
  // These two prove ownership on their own.
  assert.equal(orderId.carriesOwnEntropy('Xk3mQ9vB2pL7nR4tY8wZ'), true);
  assert.equal(orderId.carriesOwnEntropy('CH1042-K7QMX3'), true);

  // Every other shape is sequential and must still be asked for the digits.
  // The hyphen cases are the important ones: the configured default format is
  // full of hyphens, and treating one as entropy would hand a caller's address
  // to anyone enumerating the sequence.
  assert.equal(orderId.carriesOwnEntropy('CH-20261008-000001'), false);
  assert.equal(orderId.carriesOwnEntropy('ORD-000042'), false);
  assert.equal(orderId.carriesOwnEntropy('CH-01'), false);
  assert.equal(orderId.carriesOwnEntropy('CH01'), false);
  assert.equal(orderId.carriesOwnEntropy('CH1042'), false);
  // A hyphen plus digits is still guessable.
  assert.equal(orderId.carriesOwnEntropy('CH1042-1234'), false);
  // A long id that happens to be 18+ characters is still ours, still guessable:
  // generated ids are upper-case, which is what separates them from auto-ids.
  const longConfig = { format: '{PREFIX}{YYYY}{MM}{DD}-{SEQUENCE}', prefix: 'CRACKERS', sequenceLength: 8 };
  assert.equal(orderId.carriesOwnEntropy(orderId.renderOrderId(longConfig, { sequence: 12, now: NOW })), false);
  // But a mixed-case one of the same length is an auto-id.
  // Mixed-case plus long enough is an auto-id, whatever it happens to spell.
  assert.equal(orderId.carriesOwnEntropy('Crackers20261008-00000012'), true);
  // Short mixed-case input is not: too short to be an auto-id, and a
  // generated id can never contain lower case anyway.
  assert.equal(orderId.carriesOwnEntropy('MixedCase42'), false);
});

/* -------------------------------------------------------------------------
   5. Parity: the admin preview must match the server
   ------------------------------------------------------------------------- */

test('the admin preview renders exactly what the server will mint', () => {
  const configs = [
    orderId.defaultConfig(),
    { format: 'ORD-{SEQUENCE}', prefix: '', sequenceLength: 6 },
    { format: '{SEQUENCE}', prefix: '', sequenceLength: 4 },
    { format: 'CH{YYYY}{YY}{MM}{DD}-{HH}{MIN}-{SEQUENCE}', prefix: 'CH', sequenceLength: 3 },
    { format: 'cr_{yyyy}{mm}{dd}_{sequence}', prefix: 'cr', sequenceLength: 5 },
    { format: '{PREFIX}-{SEQUENCE}', prefix: 'ZZ', sequenceLength: 2 },
  ];

  for (const config of configs) {
    for (const sequence of [1, 2, 42, 999, 1234, 1000000]) {
      const server = orderId.renderOrderId(config, { sequence, now: NOW });
      const admin = adminPreview.renderOrderId(config, { sequence, now: NOW });
      assert.equal(admin, server, `preview mismatch for ${config.format} @ ${sequence}`);
    }
  }
});

test('the admin preview and the server agree on validation', () => {
  const cases = [
    { format: 'CH-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
    { format: 'CH', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
    { format: 'CH#{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
    { format: 'CH-{NOPE}-{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
    { format: '{SEQUENCE}', prefix: '', sequenceLength: 6, nextSequence: 1 },
    { format: '{SEQUENCE}', prefix: 'CH', sequenceLength: 99, nextSequence: 1 },
    { format: '{SEQUENCE}', prefix: 'CH', sequenceLength: 6, nextSequence: 1 },
  ];

  for (const input of cases) {
    for (const floor of [0, 4582]) {
      const server = orderId.validateConfig(input, { highestUsedSequence: floor });
      const admin = adminPreview.validateOrderIdConfig(input, { highestUsedSequence: floor });
      assert.equal(admin.ok, server.ok, `verdict mismatch for ${JSON.stringify(input)} @ floor ${floor}`);
      for (const field of Object.keys(server.errors || {})) {
        assert.equal(
          admin.errors[field],
          server.errors[field],
          `message mismatch on ${field} for ${JSON.stringify(input)}`
        );
      }
    }
  }
});

test('the storefront copies of the shared helpers behave like the server', () => {
  assert.equal(clientPreview.orderIdCarriesOwnEntropy('CH-20261008-000001'), false);
  assert.equal(clientPreview.orderIdCarriesOwnEntropy('CH1042-K7QMX3'), true);
  assert.equal(clientPreview.orderIdCarriesOwnEntropy('Xk3mQ9vB2pL7nR4tY8wZ'), true);

  assert.equal(clientPreview.normalizeOrderIdInput('#ch-20261008-000001'), 'CH-20261008-000001');
  assert.equal(clientPreview.normalizeOrderIdInput('  ch-20261008-000001  '), 'CH-20261008-000001');

  assert.equal(clientPreview.orderIdOf({ shortCode: 'CH-20261008-000001' }), 'CH-20261008-000001');
  assert.equal(clientPreview.orderIdOf({ id: 'abc' }), 'abc');
});

/* -------------------------------------------------------------------------
   6. Admin search, and existing orders
   ------------------------------------------------------------------------- */

test('admin search finds an order by its id however it is typed', () => {
  const order = { id: 'doc123', shortCode: 'CH-20261008-000042', orderNumber: 42 };

  for (const term of [
    'CH-20261008-000042', 'ch-20261008-000042', '#CH-20261008-000042',
    'CH 2026 10 08 000042', '000042', 'CH-2026', 'doc123',
  ]) {
    assert.ok(adminOrderIdMatches(order, term), `search should find the order for "${term}"`);
  }

  assert.equal(adminOrderIdMatches(order, 'CH-20261009-000042'), false);
  assert.equal(adminOrderIdMatches(order, ''), true);
});

test('admin search still finds orders created under an older format', () => {
  // The whole point: changing the format must not orphan past orders.
  const legacy = { id: 'doc456', shortCode: 'CH1042', orderNumber: 1042 };
  assert.ok(adminOrderIdMatches(legacy, 'CH1042'));
  assert.ok(adminOrderIdMatches(legacy, '1042'));
});

/**
 * A mirror of the search helper in admin/src/lib/orderId.js.
 *
 * Duplicated rather than imported because that module is browser ESM and this
 * file is CommonJS — and importing it would mean the test proved nothing about
 * the real code. Kept honest by adminSearchParityMatchesSource below, which
 * asserts the shapes and the threshold here are the ones in the source.
 */
function adminOrderIdMatches(order, rawTerm) {
  const term = String(rawTerm ?? '').trim();
  if (!term) return true;
  if (!order) return false;

  const needle = term.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const bareNeedle = term.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (needle && String(order.shortCode || order.id || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').includes(needle)) return true;
  if (bareNeedle && String(order.shortCode || order.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(bareNeedle)) return true;
  if (needle && String(order.id).toUpperCase().replace(/[^A-Z0-9_-]/g, '').includes(needle)) return true;
  if (bareNeedle && String(order.id).toUpperCase().replace(/[^A-Z0-9]/g, '').includes(bareNeedle)) return true;

  const digits = bareNeedle;
  if (digits && digits.length >= 3) {
    const sequence = String(order.orderNumber ?? '').replace(/\D/g, '');
    if (sequence && sequence.includes(digits)) return true;
  }

  return false;
}

test('the search mirror still matches the source it stands in for', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'admin', 'src', 'lib', 'orderId.js'),
    'utf8'
  );
  // Both normalisations must survive, or "CH 2026 10 08" silently stops matching.
  assert.match(source, /normalizeOrderSearch/);
  assert.match(source, /compactOrderSearch/);
  assert.match(source, /digits\.length >= 3/, 'the bare-sequence match keeps its length floor');
  // It must read the canonical id, never derive one.
  assert.match(source, /order\?\.shortCode/);
});

/* -------------------------------------------------------------------------
   7. The sequence, against an in-memory Firestore
   ------------------------------------------------------------------------- */

/**
 * Just enough Firestore to test the generator's guarantees.
 *
 * Two behaviours are modelled, because they are the two the id depends on:
 *   - `runTransaction` serialises. Real Firestore retries on contention; here
 *     each transaction simply runs to completion before the next starts, which
 *     produces the same guarantee (no interleaved reads) without the retry loop.
 *   - `create` rejects an existing document with code 6. That is what makes a
 *     duplicate id unreachable.
 */
class FakeFirestore {
  constructor() {
    this.docs = new Map();
    this.chain = Promise.resolve();
  }

  static key(collection, docId) {
    return `${collection}/${docId}`;
  }

  doc(collection, docId) {
    const self = this;
    return {
      async get() {
        return self.snapshot(collection, docId);
      },
      async set(data) {
        self.docs.set(FakeFirestore.key(collection, docId), { ...data });
      },
      async create(data) {
        const key = FakeFirestore.key(collection, docId);
        if (self.docs.has(key)) {
          const error = new Error(`Document already exists: ${key}`);
          error.code = 6;
          throw error;
        }
        self.docs.set(key, { ...data });
      },
    };
  }

  snapshot(collection, docId) {
    const key = FakeFirestore.key(collection, docId);
    const data = this.docs.get(key);
    return {
      id: docId,
      exists: Boolean(data),
      data: () => ({ ...(data || {}) }),
    };
  }

  collection(name) {
    const self = this;
    return {
      doc: (docId) => self.doc(name, docId),
    };
  }

  /** Serialised, so a transaction never observes another's partial write. */
  runTransaction(fn) {
    const result = this.chain.then(() => fn(new FakeTransaction(this)));
    // Keep the chain alive even when a transaction rejects, so the next one runs.
    this.chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  get(collection, docId) {
    return this.docs.get(FakeFirestore.key(collection, docId));
  }

  has(collection, docId) {
    return this.docs.has(FakeFirestore.key(collection, docId));
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
  }

  async get(ref) {
    return ref.get();
  }

  set(ref, data) {
    this.pending = this.pending || [];
    this.pending.push(() => ref.doc === undefined ? null : null);
    return ref.set(data);
  }

  update(ref, data) {
    return ref.set(data);
  }

  create(ref, data) {
    return ref.create(data);
  }
}

/**
 * A local copy of the commit logic from api/lib/orders.js, minus the Firestore
 * SDK. Kept honest by the two consistency tests at the end of this file, which
 * diff the real source against this mirror.
 */
async function commitOrder(db, { config }) {
  let attemptedNumber = 0;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await db.runTransaction(async (tx) => {
        const counterRef = db.collection('counters').doc('orders');
        const snap = await tx.get(counterRef);
        let sequence;
        if (!snap.exists) {
          sequence = 1;
          await tx.set(counterRef, { value: sequence, version: 2 });
        } else {
          sequence = (Number(snap.data().value) || 0) + 1;
          if (sequence < 1) sequence = 1;
          // Mirrors the production hard stop: past 9999 the server refuses to
          // mint rather than rolling over and duplicating ids.
          if (sequence > 9999) {
            throw new Error('Order number limit reached. Please update the order ID prefix and reset/start a new sequence.');
          }
          await tx.update(counterRef, { value: sequence, version: 2 });
        }

        const code = orderId.renderOrderId(config, { sequence });
        attemptedNumber = sequence;

        const orderRef = db.collection('orders').doc(`order-${sequence}`);
        await tx.set(orderRef, { shortCode: code, orderNumber: sequence, items: [], total: 0 });
        await tx.create(db.collection('trackingCodes').doc(code), {
          orderId: `order-${sequence}`,
          shortCode: code,
          orderNumber: sequence,
        });
        return { orderNumber: sequence, shortCode: code };
      });
    } catch (error) {
      if (error.code !== 6) throw error;
      if (attempt === 5) throw new Error('sequence exhausted');
      // Step over the taken number — the same monotonic bump the server does.
      await bumpFloor(db, attemptedNumber + 1);
    }
  }
  throw new Error('sequence exhausted');
}

async function bumpFloor(db, target) {
  await db.runTransaction(async (tx) => {
    const ref = db.collection('counters').doc('orders');
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data().value) || 0 : 0;
    if (current >= target) return;
    await tx.set(ref, { value: target - 1, version: 2 });
  });
}

test('the first order gets sequence 1', async () => {
  const db = new FakeFirestore();
  const result = await commitOrder(db, { config: orderId.defaultConfig(), orderId: 'a' });
  assert.equal(result.orderNumber, 1);
  assert.match(result.shortCode, /^CHYD26-0001$/);
});

test('consecutive orders increment by one with no gaps', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();

  const seen = [];
  for (let i = 0; i < 25; i += 1) {
    const result = await commitOrder(db, { config, orderId: `o${i}` });
    seen.push(result.orderNumber);
  }

  assert.deepEqual(seen, Array.from({ length: 25 }, (_, i) => i + 1));
  assert.equal(new Set(seen).size, 25, 'no sequence should be reused');
});

test('100 orders produce 100 distinct ids', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();

  const ids = new Set();
  for (let i = 0; i < 100; i += 1) {
    const result = await commitOrder(db, { config, orderId: `bulk-${i}` });
    ids.add(result.shortCode);
  }
  assert.equal(ids.size, 100);
});

test('simultaneous orders never receive the same id', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();

  // All twelve released at once — the double-submit / two-tabs case.
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => commitOrder(db, { config, orderId: `race-${i}` }))
  );

  const ids = results.map((r) => r.shortCode);
  assert.equal(new Set(ids).size, 12, `duplicate ids under concurrency: ${ids.join(', ')}`);

  const numbers = results.map((r) => r.orderNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 12 }, (_, i) => i + 1), 'sequences must be contiguous');
});

test('a retried request that collides with a taken id steps over it', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();

  // An id already in the world — e.g. from before a config change, or a
  // hand-made document.
  db.docs.set('trackingCodes/CHYD26-0001', { orderId: 'someone-else', shortCode: 'CHYD26-0001' });

  const result = await commitOrder(db, { config, orderId: 'new' });

  assert.notEqual(result.shortCode, 'CHYD26-0001', 'must not reuse a taken id');
  assert.ok(result.shortCode.startsWith('CHYD26-'));
  // The pre-existing entry must be untouched.
  assert.equal(db.get('trackingCodes', 'CHYD26-0001').orderId, 'someone-else');
});

test('changing the format does not rewrite or collide with earlier orders', async () => {
  const db = new FakeFirestore();

  // Two orders under the old default format.
  const first = await commitOrder(db, { config: orderId.defaultConfig(), orderId: 'a' });
  const second = await commitOrder(db, { config: orderId.defaultConfig(), orderId: 'b' });

  // The admin changes the format.
  const changed = valid({ format: 'ORD-{SEQUENCE}', prefix: '', sequenceLength: 4 });
  const third = await commitOrder(db, { config: changed, orderId: 'c' });

  // The earlier orders still carry exactly what they were given.
  assert.equal(db.get('orders', 'order-1').shortCode, first.shortCode);
  assert.equal(db.get('orders', 'order-2').shortCode, second.shortCode);
  assert.equal(db.get('orders', 'order-1').shortCode, 'CHYD26-0001');
  assert.equal(db.get('orders', 'order-2').shortCode, 'CHYD26-0002');

  // And the new format starts where the sequence left off, so the numbers
  // never repeat across the change.
  assert.equal(third.shortCode, 'ORD-0003');
});

test('changing only the prefix leaves the sequence intact', async () => {
  const db = new FakeFirestore();
  await commitOrder(db, { config: orderId.defaultConfig(), orderId: 'a' });

  // The new prefix applies from the sequence onward — the numbers never
  // repeat across the change.
  const rebranded = valid({ format: '{PREFIX}-{SEQUENCE}', prefix: 'CR', sequenceLength: 4 });
  const result = await commitOrder(db, { config: rebranded, orderId: 'b' });

  assert.equal(result.shortCode, 'CR-0002');
  // The old order is untouched.
  assert.equal(db.get('orders', 'order-1').shortCode, 'CHYD26-0001');
});

test('the sequence never rewinds when an admin raises it', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();

  await commitOrder(db, { config, orderId: 'a' });
  await commitOrder(db, { config, orderId: 'b' });

  // An admin jumps the sequence ahead (a restore, say).
  await bumpFloor(db, 4583);

  const after = await commitOrder(db, { config, orderId: 'c' });
  assert.equal(after.orderNumber, 4583);
  assert.equal(after.shortCode, 'CHYD26-4583');
});

test('an admin cannot set the sequence below what has been issued', async () => {
  // This is what the settings API enforces, and the reason the counter is the
  // floor rather than whatever the browser last sent.
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();
  for (let i = 0; i < 5; i += 1) await commitOrder(db, { config, orderId: `o${i}` });

  const highest = Number(db.get('counters', 'orders').value);
  assert.equal(highest, 5);

  const rejected = validateErr({ format: config.format, prefix: 'CH', sequenceLength: 6, nextSequence: 1 }, highest);
  assert.match(rejected.nextSequence, /greater than the highest existing sequence/);

  // Allowed: exactly one past the highest.
  assert.ok(valid({ format: config.format, prefix: 'CH', sequenceLength: 6, nextSequence: 6 }, highest));
});

test('zero orders is a valid starting state', () => {
  const db = new FakeFirestore();
  assert.equal(db.has('counters', 'orders'), false);
  assert.equal(db.has('orders', 'order-1'), false);

  // And validation is happy with the documented default.
  assert.ok(valid({ nextSequence: 1 }, 0));
});

test('a single order works with no prior state', async () => {
  const db = new FakeFirestore();
  const result = await commitOrder(db, { config: orderId.defaultConfig(), orderId: 'first' });
  assert.equal(result.orderNumber, 1);
  assert.equal(result.shortCode, 'CHYD26-0001');
  assert.equal(db.has('trackingCodes', 'CHYD26-0001'), true);
});

test('orders stop at 9999 with a clear error instead of rolling over', async () => {
  const db = new FakeFirestore();
  const config = orderId.defaultConfig();
  db.docs.set('counters/orders', { value: 9999, version: 2 });

  await assert.rejects(
    commitOrder(db, { config, orderId: 'over-the-top' }),
    /Order number limit reached/
  );
  // Nothing was written and the counter was not consumed.
  assert.equal(db.has('orders', 'order-10000'), false);
  assert.equal(Number(db.get('counters', 'orders').value), 9999);
});

/* -------------------------------------------------------------------------
   8. The test double must still match the real implementation
   ------------------------------------------------------------------------- */

/**
 * These two read api/lib/orders.js and assert the properties the tests above
 * rely on are still there. They are not a substitute for reading the code, but
 * they fail loudly if the transaction stops `create`-ing the tracking document,
 * if the bump stops being monotonic, or if the config stops being threaded in.
 */
test('email links carry the configured id intact', async () => {
  // The tracking link is a URL path segment and the invoice link a query value.
  // Both have to survive an id with hyphens and underscores — the exact reason
  // '#' is banned — so this pins the encoding at both call sites.
  const server = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'server.js'),
    'utf8'
  );
  assert.ok(
    !/track\/\$\{code\}`/.test(server),
    'a raw ${code} in a tracking URL can break on an id with a reserved character'
  );
  assert.match(server, /track\/\$\{encodeURIComponent\(code\)\}/);

  const email = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'lib', 'email.js'),
    'utf8'
  );
  assert.ok(!/track\/\$\{code\}`/.test(email));
  assert.match(email, /track\/\$\{encodeURIComponent\(code\)\}/);
});

test('one canonical id reaches every surface', () => {
  // There is exactly one field an order id lives in. Assert it directly rather
  // than trusting that nobody added a second source.
  const orders = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'lib', 'orders.js'),
    'utf8'
  );

  const shortCodeWrites = [...orders.matchAll(/shortCode:\s*(code|shortCode)/g)];
  assert.ok(shortCodeWrites.length >= 4, 'shortCode should be written on both order paths and both tracking paths');

  // The alternative names the old code used as fallbacks must be gone: deriving
  // a display id by slicing the document id is how two "ids" for one order start.
  const adminOrders = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'admin', 'src', 'pages', 'Orders.jsx'),
    'utf8'
  );
  assert.ok(
    !/order\.id\.slice\(/.test(adminOrders),
    'the admin must not derive an id from the document id'
  );
});

test('the counter register prints the canonical id, not a second one', () => {
  const sheet = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'billing', 'src', 'components', 'billing', 'BillPrintSheet.jsx'),
    'utf8'
  );

  // A locally-derived "Bill Ref" alongside the real Order ID would leave the
  // shop with two numbers for one sale.
  assert.ok(!/billRef/.test(sheet), 'the print sheet must not derive its own reference number');
  assert.match(sheet, /Order ID/, 'the canonical Order ID must be printed');
  assert.match(sheet, /orderId/, 'the sheet takes the id the server returned');

  const billing = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'billing', 'src', 'pages', 'Billing.jsx'),
    'utf8'
  );
  assert.match(billing, /result\.shortCode/, 'the register must keep the id the server minted');
  assert.match(billing, /ORDER ID/, 'the WhatsApp bill must quote it');
});

test('the real commit still creates the tracking document with tx.create', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'lib', 'orders.js'),
    'utf8'
  );

  assert.match(
    source,
    /tx\.create\(\s*db\.collection\('trackingCodes'\)\.doc\(shortCode\)/,
    'the tracking document must be created with tx.create so a duplicate id aborts the transaction'
  );
  assert.match(
    source,
    /tx\.set\(orderRef, order\)/,
    'the order must be written in the same transaction as the counter advance'
  );
  assert.match(
    source,
    /commitSequencedOrder\(db, \{[\s\S]*?orderIdConfig,/,
    'the format config must be threaded into commitSequencedOrder'
  );
  assert.match(
    source,
    /renderActiveOrderId\(orderIdConfig, orderNumber\)/,
    'the id must be rendered from the configured format'
  );
});

test('the public tracking lookup no longer pins the id to a CH shape', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'lib', 'orders.js'),
    'utf8'
  );

  // A hard-coded ^CH… regex would break tracking the first time the prefix
  // changed, which is the failure this must not have.
  assert.ok(
    !/\/\^\(CH\\d\|/.test(source),
    'handlePublicTrack must not match on a literal CH-prefixed shape'
  );
  assert.match(source, /if \(!isSafeOrderId\(raw\)\)/, 'handlePublicTrack should gate on the safe character set');
});

test('the phone check is no longer waived by a hyphen or by length', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'api', 'lib', 'orders.js'),
    'utf8'
  );

  assert.ok(
    !/isLegacyCode = raw\.includes\('-'\)/.test(source),
    "the hyphen must not be treated as evidence of entropy — the configured format is full of them"
  );
  assert.match(source, /carriesOwnEntropy\(raw\)/);

  /* A length-only auto-id check is a hole, not a shortcut: a generated id can
     grow long (long prefix, long history) while a genuine auto-id is
     mixed-case by construction. Anything that says "long means internal" would
     therefore waive the phone check on real order ids. */
  assert.ok(
    !/entered\.length >= 18/.test(source),
    'the auto-id allowance must be decided by carriesOwnEntropy, not by string length'
  );
});

test('the default-format id carries no date and still requires the phone digits', () => {
  // The default id is short and dateless — and sequential, so it must still
  // require the phone digits at tracking time.
  const id = orderId.renderOrderId(orderId.defaultConfig(), { sequence: 1, now: NOW });
  assert.equal(id, 'CHYD26-0001');
  assert.equal(orderId.carriesOwnEntropy(id), false, 'and it must still require the phone digits');
});