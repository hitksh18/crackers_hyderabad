'use strict';

/* ---------------------------------------------------------------------------
   OFFLINE / STORE Order ID generator — completely independent from ONLINE.

   ONLINE lives in lib/orderId.js + counters/orders + adminSettings/orderId
   and is NEVER touched by this module. OFFLINE lives here:

     config  : adminSettings/offlineOrderId
               { prefix, year, separator, padding, nextNumber, ... }
     counter : counters/offlineOrders
               { value, version, updatedAt, ... }

   Default format (prefix + year + separator + zero-padded sequence):

     Ayyapa26-0001
     Ayyapa26-0002
     ...

   Rendering rule: `${prefix}${year}${separator}${String(seq).padStart(padding,'0')}`

   Example custom: prefix STORE, year 26, separator -, padding 5, seq 1
     => STORE26-00001

   Properties (mirrors the online guarantees, on a separate counter):
   - Creating an offline order NEVER increments counters/orders.
   - Creating an online order NEVER increments counters/offlineOrders.
   - Config changes affect NEW offline orders only; stored shortCodes are
     never rewritten (there is no regenerate path).
   - Collision-safe: trackingCodes doc is created (never overwritten) inside
     the same transaction; on collision the counter steps over and retries.
   - Concurrency-safe: counter advance + order + tracking code commit in ONE
     Firestore transaction (no read-increment-save outside a transaction).

   Case note: the offline prefix preserves the admin's casing for display
   (Ayyapa, STORE, ...). Tracking lookups uppercase the code before reading
   Firestore, so the tracking document is keyed by the UPPERCASED id while
   orders.shortCode keeps the display casing. Both refer to the same sale.
   --------------------------------------------------------------------------- */

const { FieldValue } = require('firebase-admin/firestore');

const CONFIG_COLLECTION = 'adminSettings';
const CONFIG_DOC_ID = 'offlineOrderId';
const CONFIG_VERSION = 1;

const COUNTER_COLLECTION = 'counters';
const COUNTER_DOC_ID = 'offlineOrders';
const COUNTER_VERSION = 1;
const COUNTER_START = 1;

/* Four-digit human range, same as online: 0001-9999. Past the top the server
   refuses to mint rather than rolling over to 0000 and duplicating ids. */
const MAX_ORDER_NUMBER = 9999;
const MAX_CREATE_ATTEMPTS = 20;

const DEFAULT_PREFIX = 'Ayyapa';
const DEFAULT_YEAR = '26';
const DEFAULT_SEPARATOR = '-';
const DEFAULT_PADDING = 4;
const DEFAULT_NEXT_NUMBER = 1;

const MIN_PADDING = 3;
const MAX_PADDING = 12;
const MAX_PREFIX_LENGTH = 20;
const MAX_YEAR_LENGTH = 4;
const MAX_SEPARATOR_LENGTH = 3;
const MAX_ORDER_ID_LENGTH = 40;
const MIN_ORDER_ID_LENGTH = 3;

/* Display casing is preserved, so the safe set is case-insensitive here
   (online uppercases; offline keeps Ayyapa/STORE as typed). */
const SAFE_PREFIX = /^[A-Za-z0-9_]*$/;
const SAFE_YEAR = /^[A-Za-z0-9]*$/;
const SAFE_SEPARATOR = /^[A-Za-z0-9\-_]*$/;
const SAFE_ORDER_ID_CI = /^[A-Za-z0-9\-_]+$/;

const MESSAGES = Object.freeze({
  PREFIX_REQUIRED: 'Offline prefix is required.',
  PREFIX_INVALID: `Prefix must be 1–${MAX_PREFIX_LENGTH} letters/numbers, no spaces.`,
  YEAR_INVALID: 'Year must be up to 4 letters/numbers (e.g. 26).',
  SEPARATOR_INVALID: 'Separator may only use - or _ (max 3 characters).',
  PADDING_RANGE: `Number padding must be between ${MIN_PADDING} and ${MAX_PADDING} digits.`,
  NEXT_REQUIRED: 'Next order number is required.',
  NEXT_INVALID: 'Next order number must be a whole number of at least 1.',
  NEXT_TOO_HIGH: `Next order number must be ${MAX_ORDER_NUMBER} or less — the range is 0001 to 9999.`,
});

function cleanPrefix(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

function cleanYear(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

function cleanSeparator(value) {
  return String(value ?? '');
}

function clampPadding(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_PADDING;
  return Math.min(MAX_PADDING, Math.max(MIN_PADDING, n));
}

function padNumber(n, width) {
  return String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(width, '0');
}

/** Render one OFFLINE order id. Pure — reserves nothing. */
function renderOfflineOrderId(config, { sequence } = {}) {
  const prefix = cleanPrefix(config?.prefix ?? DEFAULT_PREFIX);
  const year = cleanYear(config?.year ?? DEFAULT_YEAR);
  const separator = cleanSeparator(config?.separator ?? DEFAULT_SEPARATOR);
  const width = clampPadding(config?.padding ?? config?.sequenceLength ?? DEFAULT_PADDING);
  const seq = Math.max(0, Math.trunc(Number(sequence) || 0));
  return `${prefix}${year}${separator}${padNumber(seq, width)}`;
}

/** Tracking document key: uppercased so lookups (which uppercase) always hit. */
function trackingKeyFor(shortCode) {
  return String(shortCode || '').toUpperCase();
}

function defaultOfflineConfig() {
  return {
    version: CONFIG_VERSION,
    prefix: DEFAULT_PREFIX,
    year: DEFAULT_YEAR,
    separator: DEFAULT_SEPARATOR,
    padding: DEFAULT_PADDING,
    nextNumber: DEFAULT_NEXT_NUMBER,
    updatedAt: null,
    updatedBy: null,
  };
}

/**
 * Coerce a stored document into a usable config. Unusable stored values fall
 * back to the default (and report isUsable:false) rather than minting an
 * unsafe id.
 */
function normalizeOfflineConfig(raw) {
  const base = defaultOfflineConfig();
  if (!raw || typeof raw !== 'object') return { config: base, isUsable: true };

  const prefix = cleanPrefix(raw.prefix);
  const year = cleanYear(raw.year);
  const separator = cleanSeparator(raw.separator);
  const padding = clampPadding(raw.padding ?? raw.sequenceLength);
  const nextRaw = Number(raw.nextNumber ?? raw.nextSequence);

  const candidate = {
    ...base,
    prefix: prefix || base.prefix,
    year: year || '',
    separator,
    padding,
    nextNumber: Number.isFinite(nextRaw) && nextRaw >= 1 ? Math.trunc(nextRaw) : base.nextNumber,
    updatedAt: raw.updatedAt ?? null,
    updatedBy: raw.updatedBy ?? null,
  };
  // Support legacy stored shape that used empty year.
  if (typeof raw.year === 'string' && raw.year === '') candidate.year = '';

  const rendered = renderOfflineOrderId(candidate, { sequence: candidate.nextNumber });
  const usable =
    candidate.prefix.length >= 1 &&
    candidate.prefix.length <= MAX_PREFIX_LENGTH &&
    SAFE_PREFIX.test(candidate.prefix) &&
    candidate.year.length <= MAX_YEAR_LENGTH &&
    (candidate.year === '' || SAFE_YEAR.test(candidate.year)) &&
    candidate.separator.length <= MAX_SEPARATOR_LENGTH &&
    SAFE_SEPARATOR.test(candidate.separator) &&
    SAFE_ORDER_ID_CI.test(rendered) &&
    rendered.length >= MIN_ORDER_ID_LENGTH &&
    rendered.length <= MAX_ORDER_ID_LENGTH;

  return usable ? { config: candidate, isUsable: true } : { config: base, isUsable: false };
}

/**
 * Validate a submitted offline configuration.
 *
 * Unlike ONLINE (which forbids rewinding because its sequence is the only
 * uniqueness source), OFFLINE explicitly ALLOWS nextNumber <= highestUsed:
 * resetting to 0001 when 0001-0004 exist is a supported flow, and the commit
 * below steps over taken ids instead of reusing them. So there is no floor
 * check here — only range checks. Collision protection makes rewind safe.
 */
function validateOfflineConfig(input = {}) {
  const errors = {};

  const prefix = cleanPrefix(input?.prefix);
  const year = cleanYear(input?.year ?? '');
  const separator = cleanSeparator(input?.separator ?? '');
  const padding = Number.parseInt(input?.padding ?? input?.sequenceLength, 10);
  const nextNumber = Number(input?.nextNumber ?? input?.nextSequence);

  if (!prefix) {
    errors.prefix = MESSAGES.PREFIX_REQUIRED;
  } else if (prefix.length > MAX_PREFIX_LENGTH || !SAFE_PREFIX.test(prefix)) {
    errors.prefix = MESSAGES.PREFIX_INVALID;
  }

  if (year.length > MAX_YEAR_LENGTH || (year && !SAFE_YEAR.test(year))) {
    errors.year = MESSAGES.YEAR_INVALID;
  }

  if (separator.length > MAX_SEPARATOR_LENGTH || !SAFE_SEPARATOR.test(separator)) {
    errors.separator = MESSAGES.SEPARATOR_INVALID;
  }

  if (!Number.isFinite(padding) || padding < MIN_PADDING || padding > MAX_PADDING) {
    errors.padding = MESSAGES.PADDING_RANGE;
  }

  if (!Number.isFinite(nextNumber)) {
    errors.nextNumber = MESSAGES.NEXT_INVALID;
  } else if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    errors.nextNumber = MESSAGES.NEXT_INVALID;
  } else if (nextNumber > MAX_ORDER_NUMBER) {
    errors.nextNumber = MESSAGES.NEXT_TOO_HIGH;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const value = {
    version: CONFIG_VERSION,
    prefix,
    year,
    separator,
    padding,
    nextNumber,
  };

  // Render check: even a valid-looking config must produce a safe, lookupable id.
  const rendered = renderOfflineOrderId(value, { sequence: 9999999 });
  if (!SAFE_ORDER_ID_CI.test(rendered) || rendered.length > MAX_ORDER_ID_LENGTH || rendered.length < MIN_ORDER_ID_LENGTH) {
    return { ok: false, errors: { prefix: MESSAGES.PREFIX_INVALID } };
  }

  return { ok: true, errors: null, value };
}

async function readOfflineOrderIdConfig(db) {
  try {
    const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
    if (!snap.exists) return { config: defaultOfflineConfig(), isUsable: true };
    const { config, isUsable } = normalizeOfflineConfig(snap.data());
    if (!isUsable) {
      console.warn('[offlineOrderId] stored config is unusable; falling back to default');
    }
    return { config, isUsable };
  } catch (error) {
    console.warn('[offlineOrderId] could not read config, using default:', error.message);
    return { config: defaultOfflineConfig(), isUsable: true };
  }
}

async function writeOfflineOrderIdConfig(db, config, { userEmail = null } = {}) {
  const payload = {
    version: CONFIG_VERSION,
    prefix: config.prefix,
    year: config.year,
    separator: config.separator,
    padding: config.padding,
    nextNumber: config.nextNumber,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || null,
  };
  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).set(payload, { merge: true });
  return payload;
}

/** Highest offline sequence ever issued (from the OFFLINE counter only). */
async function readHighestUsedOfflineSequence(db) {
  try {
    const snap = await db.collection(COUNTER_COLLECTION).doc(COUNTER_DOC_ID).get();
    if (!snap.exists) return 0;
    const value = Number(snap.data()?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.warn('[offlineOrderId] could not read offline counter:', error.message);
    return 0;
  }
}

/**
 * Monotonic raise used after a tracking collision: step the shared OFFLINE
 * counter past the taken number. Never lowers (max only), so concurrent
 * orders can only push forward.
 */
async function bumpOfflineSequenceFloor(db, sequence) {
  const target = Math.trunc(Number(sequence));
  if (!Number.isFinite(target) || target < 1) return;
  await db.runTransaction(async (tx) => {
    const ref = db.collection(COUNTER_COLLECTION).doc(COUNTER_DOC_ID);
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const current = Number(data.value) || 0;
    if (current >= target) return;
    if (!snap.exists || data.version !== COUNTER_VERSION) {
      tx.set(ref, {
        value: target - 1,
        version: COUNTER_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    tx.update(ref, { value: target - 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Set the OFFLINE counter so the next offline order mints `nextNumber`.
 * Used by Save + Reset. Unlike the online bump, this MAY rewind (reset to
 * 0001 is supported) because the commit loop steps over taken ids.
 */
async function setOfflineCounterTo(db, nextNumber) {
  const target = Math.trunc(Number(nextNumber));
  if (!Number.isFinite(target) || target < 1 || target > MAX_ORDER_NUMBER) {
    throw new Error('Next number must be between 1 and 9999.');
  }
  const ref = db.collection(COUNTER_COLLECTION).doc(COUNTER_DOC_ID);
  // Direct write (admin-only route): reset semantics require exact positioning,
  // including rewinding. Collision safety is preserved by the commit loop.
  await ref.set(
    { value: target - 1, version: COUNTER_VERSION, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

function isTrackingCollision(error) {
  if (!error) return false;
  if (error.code === 6) return true;
  return /already.?exists/i.test(String((error && error.message) || ''));
}

function offlineFailure(status, code, message) {
  const error = new Error(message);
  error.orderStatus = status;
  error.orderCode = code;
  return error;
}

/**
 * generateOfflineOrderId() — dedicated reusable offline minter.
 *
 * Atomically advances counters/offlineOrders and creates the order +
 * tracking code in ONE transaction. Retries on tracking collision by stepping
 * the counter over the taken number (never overwrites, never duplicates).
 *
 * buildDocs(orderNumber, shortCode) returns { order, tracking } — same shape
 * as the online commit, but the counter, config and rendering are offline-only.
 */
async function commitOfflineSequencedOrder(
  db,
  { orderRef, buildDocs, productIncrements, offlineConfig = null } = {}
) {
  let attemptedCode = null;
  let attemptedOrderNumber = 0;

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await db.runTransaction(async (tx) => {
        const counterRef = db.collection(COUNTER_COLLECTION).doc(COUNTER_DOC_ID);
        const snap = await tx.get(counterRef);

        let orderNumber;
        let advanceCounter = null;
        if (!snap.exists) {
          orderNumber = COUNTER_START;
          advanceCounter = () =>
            tx.set(counterRef, {
              value: orderNumber,
              version: COUNTER_VERSION,
              updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
          const data = snap.data() || {};
          if (data.version !== COUNTER_VERSION) {
            orderNumber = COUNTER_START;
            advanceCounter = () =>
              tx.set(counterRef, {
                value: orderNumber,
                version: COUNTER_VERSION,
                updatedAt: FieldValue.serverTimestamp(),
              });
          } else {
            orderNumber = (Number(data.value) || 0) + 1;
            if (orderNumber < 1) orderNumber = 1;
            if (orderNumber > MAX_ORDER_NUMBER) {
              throw offlineFailure(
                503,
                'OFFLINE_ORDER_NUMBER_LIMIT',
                'Offline order number limit reached. Please update the offline prefix and reset/start a new sequence.'
              );
            }
            advanceCounter = () =>
              tx.update(counterRef, { value: orderNumber, updatedAt: FieldValue.serverTimestamp() });
          }
        }

        if (advanceCounter) advanceCounter();

        const effective =
          offlineConfig || (await readOfflineOrderIdConfig(db)).config;
        const shortCode = renderOfflineOrderId(effective, { sequence: orderNumber });
        attemptedCode = shortCode;
        attemptedOrderNumber = orderNumber;

        const trackingKey = trackingKeyFor(shortCode);
        const { order, tracking } = buildDocs(orderNumber, shortCode);
        tx.set(orderRef, order);
        tx.create(db.collection('trackingCodes').doc(trackingKey), tracking);
        if (productIncrements) {
          for (const [productId, quantity] of productIncrements) {
            tx.update(db.collection('products').doc(productId), {
              salesCount: FieldValue.increment(quantity),
            });
          }
        }
        return { orderNumber, shortCode };
      });
    } catch (error) {
      if (error && error.orderStatus) throw error;
      if (isTrackingCollision(error)) {
        if (attempt < MAX_CREATE_ATTEMPTS) {
          console.warn(
            `[offlineOrderId] tracking collision on ${attemptedCode}, stepping over it (attempt ${attempt})`
          );
          if (attemptedCode !== null) {
            await bumpOfflineSequenceFloor(db, attemptedOrderNumber + 1).catch((e) => {
              console.warn('[offlineOrderId] step-over failed:', e.message);
            });
          }
          continue;
        }
        throw offlineFailure(503, 'SEQUENCE_EXHAUSTED', 'Could not reserve an offline order number. Please try again.');
      }
      if (error && error.code === 5) {
        throw offlineFailure(400, 'PRODUCT_UNAVAILABLE', 'One of the products is no longer available');
      }
      throw error;
    }
  }
  throw offlineFailure(503, 'SEQUENCE_EXHAUSTED', 'Could not reserve an offline order number. Please try again.');
}

function buildOfflinePreview(config, baseSequence) {
  const first = Math.max(1, Number(baseSequence) || 1);
  return {
    next: renderOfflineOrderId(config, { sequence: first }),
    afterNext: renderOfflineOrderId(config, { sequence: first + 1 }),
    sequence: first,
  };
}

module.exports = {
  CONFIG_COLLECTION,
  CONFIG_DOC_ID,
  CONFIG_VERSION,
  COUNTER_COLLECTION,
  COUNTER_DOC_ID,
  COUNTER_VERSION,
  MAX_ORDER_NUMBER,
  DEFAULT_PREFIX,
  DEFAULT_YEAR,
  DEFAULT_SEPARATOR,
  DEFAULT_PADDING,
  DEFAULT_NEXT_NUMBER,
  MIN_PADDING,
  MAX_PADDING,
  MESSAGES,
  renderOfflineOrderId,
  trackingKeyFor,
  defaultOfflineConfig,
  normalizeOfflineConfig,
  validateOfflineConfig,
  readOfflineOrderIdConfig,
  writeOfflineOrderIdConfig,
  readHighestUsedOfflineSequence,
  bumpOfflineSequenceFloor,
  setOfflineCounterTo,
  commitOfflineSequencedOrder,
  generateOfflineOrderId: commitOfflineSequencedOrder,
  buildOfflinePreview,
};
