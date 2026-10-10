'use strict';

const crypto = require('node:crypto');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { normaliseCoords } = require('./geocode');
const { STAFF_ROLES } = require('./security');
const { maybeSendOrderConfirmationEmail, maybeSendInternalNewOrderEmail, orderPaymentNote } = require('./email');
const {
  renderOrderId,
  readOrderIdConfig,
  normalizeConfig,
  carriesOwnEntropy,
  isSafeOrderId,
} = require('./orderId');
// OFFLINE/STORE ids are fully independent (own config + own counter).
// Imported here only for the POS path below; the online path above never uses it.
const {
  readOfflineOrderIdConfig,
  commitOfflineSequencedOrder,
  trackingKeyFor: offlineTrackingKeyFor,
} = require('./offlineOrderId');

/**
 * Server-side order creation.
 *
 * Previously the browser computed the total and wrote the order straight to
 * Firestore, with rules checking only that `total` was *a number*. A customer
 * could place a ten-thousand-rupee order for one rupee, and — because anyone
 * could create an order document at all — an attacker could plant a document
 * containing arbitrary text and any recipient address, then have the
 * notification endpoints mail or text it out under the shop's own identity.
 *
 * Money and identity are decided here, from the products collection, and
 * `orders.create` is closed in the rules.
 */

const NOTIFY_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ITEMS = 100;
const MAX_QUANTITY_PER_ITEM = 500;

const cleanText = (value, max) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

// Deliberately strict: exactly one address, no comma or semicolon, so the value
// can never fan a single send out to a list of recipients.
const SINGLE_EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

const isValidEmail = (value) =>
  typeof value === 'string' && value.length <= 254 && SINGLE_EMAIL.test(value);

const normalisePhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 12) return null;
  return digits.slice(-10);
};

/**
 * Sequential order ID system: CH01, CH02, ... CH99, CH100, CH101, ...
 *
 * - The human-facing order id (`shortCode`) is derived from a single
 *   Firestore counter (`counters/orders`) advanced inside a transaction, so
 *   concurrent checkouts can never receive the same number: the transaction
 *   serialises reservations and each retry observes the next value.
 * - The sequence starts at 1 (CH01) and never restarts. A legacy counter that
 *   predates this system (no `version` marker, e.g. the old CH1001 range) is
 *   migrated once: the old value is preserved as `legacyValue` and the new
 *   sequence starts at 1.
 * - Counter advance and order creation happen in ONE transaction
 *   (`commitSequencedOrder`): the counter, the order document, the tracking
 *   code (`create`, never overwrite) and the product sales increments all
 *   commit together or not at all. A failed attempt therefore consumes no
 *   number and leaves no partial order behind. If the freshly minted code ever
 *   collides with an existing `trackingCodes` document (legacy CH1001+ range
 *   reached, or a manually created code), the transaction aborts and the next
 *   number is tried — existing codes are detected and skipped, never
 *   duplicated or overwritten.
 * - `orderNumber` (integer) is stored alongside `shortCode` on both the order
 *   and its trackingCodes entry so the sequence can be sorted and recovered
 *   numerically (`shortCode` itself does not sort numerically as a string:
 *   "CH100" < "CH02" lexicographically).
 */
const ORDER_COUNTER_DOC = 'orders';
const ORDER_SEQUENCE_VERSION = 2;
const ORDER_SEQUENCE_START = 1;
/* Four-digit human-facing range: 0001-9999. Past the top the server refuses
   to mint (see commitSequencedOrder) rather than rolling over to 0000. */
const ORDER_NUMBER_MAX = 9999;
const ORDER_NUMBER_LIMIT_MESSAGE =
  'Order number limit reached. Please update the order ID prefix and reset/start a new sequence.';
/* Matches the offline committer: after a counter reset, stepping over every
   taken id can take as many attempts as there are taken ids in a row. */
const MAX_ORDER_CREATE_ATTEMPTS = 20;

/* The live format config, read once per request. `readOrderIdConfig` falls back
   to the documented default when the document is missing or unusable, so order
   creation never depends on the settings screen having been opened once.
   It is threaded through as an argument rather than kept in a module variable
   on purpose: two checkouts in flight must not be able to see each other's
   format if the admin saves a change in between. */
async function loadOrderIdConfig(db) {
  const loaded = await readOrderIdConfig(db);
  return loaded.config;
}

/**
 * The legacy `CH01` renderer, kept for the pre-config orders already in the
 * database and for anything that still needs to recognise the old shape.
 *
 * It is NOT what mints ids any more — `renderOrderId` from lib/orderId is, and it
 * honours whatever format the admin configured. Existing `CH01`-style orders keep
 * the id they were given because the id lives on the order document, not here.
 */
function formatShortCode(n) {
  return `CH${String(n).padStart(2, '0')}`;
}

/** Parse the numeric part of a legacy CH code, or null when not one. */
function parseShortCodeNumber(code) {
  const m = /^CH(\d+)$/i.exec(String(code || '').trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mint the id for a sequence number using the active format config.
 *
 * Falls back to the legacy `CH01` shape if the config somehow did not load, so
 * order creation fails visibly on a missing format rather than writing
 * `undefined` into a customer-facing field.
 */
function renderActiveOrderId(config, sequence, now = new Date()) {
  const effective = config || normalizeConfig(null).config;
  const rendered = renderOrderId(effective, { sequence, now });
  return rendered || formatShortCode(sequence);
}

/**
 * The counter document's current value — the highest sequence ever issued.
 *
 * Used by the settings screen to refuse a next-sequence below what has already
 * been handed out. Reads the counter directly rather than scanning orders: the
 * counter IS the sequence, advanced in the same transaction that writes every
 * order, so it cannot be behind an order that exists.
 */
async function readHighestUsedSequence(db) {
  try {
    const snap = await db.collection('counters').doc(ORDER_COUNTER_DOC).get();
    if (!snap.exists) return 0;
    const value = Number(snap.data()?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.warn('[orders] could not read the sequence counter:', error.message);
    return 0;
  }
}

/** Reserve the next sequence number, without rendering an id (transaction-safe). */
async function reserveNextOrderNumber(db) {
  const ref = db.collection('counters').doc(ORDER_COUNTER_DOC);
  const orderNumber = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        value: ORDER_SEQUENCE_START,
        version: ORDER_SEQUENCE_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ORDER_SEQUENCE_START;
    }
    const data = snap.data() || {};
    if (data.version !== ORDER_SEQUENCE_VERSION) {
      const legacyValue = Number(data.value);
      tx.set(ref, {
        value: ORDER_SEQUENCE_START,
        version: ORDER_SEQUENCE_VERSION,
        legacyValue: Number.isFinite(legacyValue) ? legacyValue : null,
        migratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ORDER_SEQUENCE_START;
    }
    const next = (Number(data.value) || 0) + 1;
    const safeNext = next < 1 ? 1 : next;
    tx.update(ref, { value: safeNext, updatedAt: FieldValue.serverTimestamp() });
    return safeNext;
  });
  return { orderNumber, shortCode: formatShortCode(orderNumber) };
}

/** Backwards-compatible alias: returns just the reserved number. */
async function nextOrderNumber(db) {
  const { orderNumber } = await reserveNextOrderNumber(db);
  return orderNumber;
}

/**
 * Raise the counter so the next order mints `sequence` or higher.
 *
 * The only legitimate use is the admin setting a next-sequence by hand, and it is
 * monotonic on purpose: a request that raced an in-flight checkout can only ever
 * push the counter further forward, never pull it back, so an admin save can
 * never hand two orders the same sequence.
 */
async function bumpSequenceFloor(db, sequence) {
  const target = Math.trunc(Number(sequence));
  if (!Number.isFinite(target) || target < 1) return;

  await db.runTransaction(async (tx) => {
    const ref = db.collection('counters').doc(ORDER_COUNTER_DOC);
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const current = Number(data.value) || 0;
    if (current >= target) return;

    if (!snap.exists || data.version !== ORDER_SEQUENCE_VERSION) {
      tx.set(ref, {
        value: target - 1,
        version: ORDER_SEQUENCE_VERSION,
        legacyValue: Number.isFinite(current) ? current : null,
        migratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    tx.update(ref, { value: target - 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Set the ONLINE counter so the next online order mints `sequence`.
 * Used by Save + Reset. Unlike bumpSequenceFloor this MAY rewind (reset to
 * 0001 is supported) because commitSequencedOrder steps over taken tracking
 * codes instead of reusing them — the exact guarantee the offline counter
 * relies on. Touches counters/orders ONLY; the offline counter is never
 * read or written here.
 */
async function setOnlineCounterTo(db, sequence) {
  const target = Math.trunc(Number(sequence));
  if (!Number.isFinite(target) || target < 1 || target > ORDER_NUMBER_MAX) {
    throw new Error('Next sequence number must be between 1 and 9999.');
  }
  const ref = db.collection('counters').doc(ORDER_COUNTER_DOC);
  // Direct write (admin-only route): reset semantics require exact positioning,
  // including rewinding. Collision safety is preserved by the commit loop.
  await ref.set(
    { value: target - 1, version: ORDER_SEQUENCE_VERSION, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** True when a commit failed because the tracking code already exists. */
function isTrackingCollision(error) {
  if (!error) return false;
  if (error.code === 6) return true; // ALREADY_EXISTS
  return /already.?exists/i.test(String((error && error.message) || ''));
}

/** True when a commit failed because a referenced document is gone. */
function isNotFound(error) {
  if (!error) return false;
  if (error.code === 5) return true; // NOT_FOUND
  return /not.?found/i.test(String((error && error.message) || ''));
}

/**
 * Structured, customer-safe order failure. Thrown for known failure modes so
 * the handler can answer with a precise status instead of the generic 500.
 */
function orderFailure(status, code, message) {
  const error = new Error(message);
  error.orderStatus = status;
  error.orderCode = code;
  return error;
}

/**
 * Atomically advance the sequence and create the order.
 *
 * `buildDocs(orderNumber, orderId)` returns `{ order, tracking }`.
 * `productIncrements` is a Map of productId -> quantity for the sales ledger.
 *
 * `orderIdConfig` is the format the admin saved. It is a parameter rather than
 * module state so that a config save landing between two concurrent checkouts
 * cannot give one of them the new format and the other the old one silently.
 *
 * Everything lands in a single transaction, so the order id only ever exists
 * alongside its order: no gaps consumed by failures, no partial orders.
 *
 * Uniqueness does not rest on the format being clever. `tx.create` on the
 * tracking document fails the whole transaction if that id is already taken —
 * by an order from an older format, by a retry of this one, or by a hand-made
 * document — so a duplicate id is not reachable even if the sequence were
 * rewound. The retry below steps the counter over the taken number and mints
 * the next one.
 */
async function commitSequencedOrder(db, { orderRef, buildDocs, productIncrements, orderIdConfig = null, couponBurn = null }) {
  // What the aborted attempt minted. The transaction rolled back, so the counter
  // did NOT advance past it — captured here so the retry can step over it
  // instead of minting the same taken code again.
  let attemptedCode = null;
  let attemptedOrderNumber = 0;
  for (let attempt = 1; attempt <= MAX_ORDER_CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await db.runTransaction(async (tx) => {
        /* Firestore rule: every tx.get must precede every tx.set/create/
           update. The counter read, the coupon re-reads and the customer
           counter read therefore all happen up front; writes follow. */
        const counterRef = db.collection('counters').doc(ORDER_COUNTER_DOC);
        const snap = await tx.get(counterRef);
        let orderNumber;
        let advanceCounter = null;
        if (!snap.exists) {
          orderNumber = ORDER_SEQUENCE_START;
          advanceCounter = () => tx.set(counterRef, {
            value: orderNumber,
            version: ORDER_SEQUENCE_VERSION,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const data = snap.data() || {};
          if (data.version !== ORDER_SEQUENCE_VERSION) {
            const legacyValue = Number(data.value);
            orderNumber = ORDER_SEQUENCE_START;
            advanceCounter = () => tx.set(counterRef, {
              value: orderNumber,
              version: ORDER_SEQUENCE_VERSION,
              legacyValue: Number.isFinite(legacyValue) ? legacyValue : null,
              migratedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            orderNumber = (Number(data.value) || 0) + 1;
            if (orderNumber < 1) orderNumber = 1;
            /* Hard stop at the top of the four-digit range. Throwing aborts the
               transaction before anything is written, so the counter is not
               consumed and no duplicate id can slip out. Both online checkout
               and POS orders funnel through here. */
            if (orderNumber > ORDER_NUMBER_MAX) {
              throw orderFailure(503, 'ORDER_NUMBER_LIMIT', ORDER_NUMBER_LIMIT_MESSAGE);
            }
            advanceCounter = () => tx.update(counterRef, { value: orderNumber, updatedAt: FieldValue.serverTimestamp() });
          }
        }

        /* Coupon limit re-checks (reads). They ride here — not just at
           validate time — so two simultaneous checkouts cannot both slip
           under a cap. Still no writes yet. */
        let couponCustUsed = 0;
        if (couponBurn) {
          const {
            COUPONS_COLLECTION: COUPON_COLL,
            CUSTOMER_COUNTERS_COLLECTION: CUST_COLL,
          } = require('./coupons');
          const couponRef = db.collection(COUPON_COLL).doc(couponBurn.couponId);
          const couponSnap = await tx.get(couponRef);
          if (!couponSnap.exists) {
            throw orderFailure(400, 'COUPON_INVALID', 'This coupon is no longer available.');
          }
          const live = couponSnap.data() || {};
          if (live.status !== 'active') {
            throw orderFailure(400, 'COUPON_INACTIVE', 'This coupon is no longer active.');
          }
          if (live.usageLimit != null && Number(live.usageCount || 0) >= Number(live.usageLimit)) {
            throw orderFailure(400, 'COUPON_LIMIT', 'This coupon has reached its usage limit.');
          }
          if (couponBurn.perCustomerLimit != null && couponBurn.customerKey) {
            const custSnap = await tx.get(
              db.collection(CUST_COLL).doc(`${couponBurn.couponId}_${couponBurn.customerKey}`)
            );
            couponCustUsed = custSnap.exists ? Number(custSnap.data().count) || 0 : 0;
            if (couponCustUsed >= Number(couponBurn.perCustomerLimit)) {
              throw orderFailure(400, 'COUPON_CUSTOMER_LIMIT', 'You have already used this coupon the maximum number of times.');
            }
          }
        }

        /* Writes begin — no more tx.get past this point. */
        if (advanceCounter) advanceCounter();
        const shortCode = renderActiveOrderId(orderIdConfig, orderNumber);
        attemptedCode = shortCode;
        attemptedOrderNumber = orderNumber;
        const { order, tracking } = buildDocs(orderNumber, shortCode);
        tx.set(orderRef, order);
        tx.create(db.collection('trackingCodes').doc(shortCode), tracking);
        if (productIncrements) {
          for (const [productId, quantity] of productIncrements) {
            tx.update(db.collection('products').doc(productId), {
              salesCount: FieldValue.increment(quantity),
            });
          }
        }
        if (couponBurn) {
          /* Coupon usage is consumed in the SAME atomic transaction as the
             order: one committed order == exactly one redemption. Retries,
             refreshes and duplicate posts cannot double-count, because the
             redemption document is created (never overwritten) alongside the
             order — a replay faces the same document and the whole commit
             aborts. */
          const {
            COUPONS_COLLECTION: COUPON_COLL,
            REDEMPTIONS_COLLECTION: REDEEM_COLL,
            CUSTOMER_COUNTERS_COLLECTION: CUST_COLL,
          } = require('./coupons');
          const couponRef = db.collection(COUPON_COLL).doc(couponBurn.couponId);
          if (couponBurn.perCustomerLimit != null && couponBurn.customerKey) {
            tx.set(db.collection(CUST_COLL).doc(`${couponBurn.couponId}_${couponBurn.customerKey}`), {
              couponId: couponBurn.couponId,
              customerKey: couponBurn.customerKey,
              count: couponCustUsed + 1,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          tx.update(couponRef, {
            usageCount: FieldValue.increment(1),
            totalDiscountGiven: FieldValue.increment(couponBurn.discountAmount),
            totalRevenue: FieldValue.increment(couponBurn.orderTotal),
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.create(db.collection(REDEEM_COLL).doc(orderRef.id), {
            couponId: couponBurn.couponId,
            code: couponBurn.code,
            orderId: orderRef.id,
            customerKey: couponBurn.customerKey || null,
            discountAmount: couponBurn.discountAmount,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return { orderNumber, shortCode };
      });
    } catch (error) {
      if (error && error.orderStatus) throw error;
      if (isTrackingCollision(error)) {
        if (attempt < MAX_ORDER_CREATE_ATTEMPTS) {
          console.warn(`[orders] tracking collision on ${attemptedCode}, stepping over it (attempt ${attempt})`);
          // The aborted transaction rolled back its own counter advance, so
          // without this the retry would mint the same taken code forever.
          // Step the shared counter past the number this attempt minted; the
          // retry then takes the next one. The step is monotonic (max) so
          // concurrent orders can only ever push it further forward.
          //
          // The sequence is recovered from what was minted rather than parsed
          // back out of the id: with a configurable format there is no fixed
          // shape to parse, and `orderNumber` is exactly what produced it.
          if (attemptedCode !== null) {
            await bumpSequenceFloor(db, attemptedOrderNumber + 1).catch((stepError) => {
              console.warn('[orders] sequence step-over failed:', stepError.message);
            });
          }
          continue;
        }
        throw orderFailure(503, 'SEQUENCE_EXHAUSTED', 'Could not reserve an order number. Please try again.');
      }
      // A product deleted between pricing and commit: nothing was written
      // (the transaction aborted), so report it as unavailable, not as a 500.
      if (isNotFound(error)) {
        throw orderFailure(400, 'PRODUCT_UNAVAILABLE', 'One of the products is no longer available');
      }
      throw error;
    }
  }
  throw orderFailure(503, 'SEQUENCE_EXHAUSTED', 'Could not reserve an order number. Please try again.');
}

function readCustomer(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Customer details are required' };
  }

  const name = cleanText(input.name, 100);
  const phone = normalisePhone(input.phone);
  const address = cleanText(input.address, 300);
  const city = cleanText(input.city, 80);
  const pincode = cleanText(input.pincode, 12);

  if (name.length < 2) return { ok: false, error: 'Please provide a valid name' };
  if (!phone) return { ok: false, error: 'Please provide a valid 10-digit phone number' };
  if (address.length < 5) return { ok: false, error: 'Please provide a delivery address' };
  if (!city) return { ok: false, error: 'Please provide a city' };
  if (!/^\d{6}$/.test(pincode)) return { ok: false, error: 'Please provide a valid 6-digit pincode' };

  const email = input.email ? cleanText(input.email, 254) : '';
  if (email && !isValidEmail(email)) {
    return { ok: false, error: 'Please provide a valid email address' };
  }

  return { ok: true, value: { name, phone, email, address, city, pincode } };
}

function readDelivery(input, sameAsBilling) {
  if (sameAsBilling) return { ok: true, value: { sameAsBilling: true } };

  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Delivery address is required' };
  }

  const flatNo = cleanText(input.flatNo, 80);
  const streetNo = cleanText(input.streetNo, 120);
  const area = cleanText(input.area, 120);
  const city = cleanText(input.city, 80);
  /* Optional: the pincode and the pin both fix the region, and rejecting an
     order because a map lookup left the state blank would be absurd. */
  const state = cleanText(input.state, 80);
  const pincode = cleanText(input.pincode, 12);
  const altPhone = input.altPhone ? normalisePhone(input.altPhone) : '';

  if (!flatNo || !streetNo || !area || !city) {
    return { ok: false, error: 'Please complete the delivery address' };
  }
  if (!/^\d{6}$/.test(pincode)) {
    return { ok: false, error: 'Please provide a valid 6-digit delivery pincode' };
  }

  return {
    ok: true,
    value: {
      sameAsBilling: false,
      flatNo,
      streetNo,
      area,
      city,
      state: state || '',
      pincode,
      altPhone: altPhone || '',
    },
  };
}

/**
 * The pinned doorstep, if one was sent.
 *
 * Absent is not an error: the pin is optional, and a customer whose browser
 * denied geolocation and whose map failed to load must still be able to order.
 * An invalid pin is treated as no pin for the same reason — a rejected checkout
 * would be a worse outcome than an order that navigates by address, which is
 * how every order worked before this existed.
 */
function readLocation(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return null;
  return normaliseCoords(input.lat, input.lng);
}

/**
 * Price the cart from the products collection. The client sends ids and
 * quantities only; nothing it claims about money is used.
 */
async function priceCart(db, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'Your cart is empty' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `An order cannot contain more than ${MAX_ITEMS} different products` };
  }

  // Collapse duplicates so the same id cannot be repeated to inflate work.
  const wanted = new Map();
  for (const raw of rawItems) {
    const id = typeof raw?.id === 'string' ? raw.id.slice(0, 128) : null;
    const quantity = Number.parseInt(raw?.quantity, 10);

    // A '/' (or empty) id is not a document id at all — collection.doc(id)
    // below would throw and turn a bad cart line into a generic HTTP 500.
    // Reject it here so the customer gets a precise 400 instead.
    if (!id || id.includes('/')) return { ok: false, error: 'One of the cart items is invalid' };
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      return { ok: false, error: 'One of the cart quantities is invalid' };
    }

    wanted.set(id, Math.min((wanted.get(id) || 0) + quantity, MAX_QUANTITY_PER_ITEM));
  }

  const refs = [...wanted.keys()].map((id) => db.collection('products').doc(id));
  const snaps = await db.getAll(...refs);

  const items = [];
  let total = 0;

  for (const snap of snaps) {
    if (!snap.exists) {
      return { ok: false, error: 'One of the products is no longer available' };
    }

    const product = snap.data();
    if (product.outOfStock === true) {
      return { ok: false, error: `${product.name || 'A product'} is out of stock` };
    }

    // Same precedence the storefront displays, resolved from the trusted record.
    const unitPrice = Number(product.discountPrice || product.onlinePrice || product.price || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: 'A product in your cart is mispriced. Please contact us.' };
    }

    const quantity = wanted.get(snap.id);
    total += unitPrice * quantity;

    items.push({
      id: snap.id,
      name: cleanText(product.name, 200),
      quantity,
      price: unitPrice,
      discountPrice: product.discountPrice ?? null,
      onlinePrice: product.onlinePrice ?? null,
    });
  }

  return { ok: true, value: { items, total: Math.round(total * 100) / 100 } };
}

/**
 * The checkout knobs from adminSettings/main, in one read.
 *
 * Both answers come from the same document, so they are fetched together rather
 * than twice per order.
 */
async function readCheckoutSettings(db) {
  /* Fail closed on the default floor rather than letting a read error waive it.
     The pin defaults on, because the failure mode there is a map nobody asked
     for — not money left on the table. */
  const fallback = { minimum: { enabled: true, value: 2500 }, deliveryPinEnabled: true };

  try {
    const snap = await db.collection('adminSettings').doc('main').get();
    if (!snap.exists) return fallback;

    const data = snap.data();
    const enabled =
      'minimumOrderValueEnabled' in data
        ? data.minimumOrderValueEnabled !== false
        : data.minimumOrderValueLocked !== false;

    return {
      minimum: { enabled, value: Number(data.minimumOrderValue) || 2500 },
      deliveryPinEnabled: data.deliveryPinEnabled !== false,
    };
  } catch {
    return fallback;
  }
}

/**
 * POST /api/orders
 * Body: { customer, delivery, sameAsBilling, items: [{ id, quantity }] }
 */
async function createOrder(req, res) {
  const db = getFirestore();

  try {
    const body = req.body || {};

    const customer = readCustomer(body.customer);
    if (!customer.ok) return res.status(400).json({ error: customer.error });

    const sameAsBilling = body.sameAsBilling === true;
    const delivery = readDelivery(body.delivery, sameAsBilling);
    if (!delivery.ok) return res.status(400).json({ error: delivery.error });

    const priced = await priceCart(db, body.items);
    if (!priced.ok) return res.status(400).json({ error: priced.error });

    const settings = await readCheckoutSettings(db);
    const { minimum } = settings;
    if (minimum.enabled && priced.value.total < minimum.value) {
      return res.status(400).json({
        error: `Minimum order value is Rs.${minimum.value}. Your cart totals Rs.${priced.value.total}.`,
        minimumOrderValue: minimum.value,
        cartTotal: priced.value.total,
      });
    }

    /* Optional coupon: the browser sends only the CODE. Everything else —
       validity, discount math, usage accounting — is decided here from the
       server-priced cart. The minimum above applies to the pre-discount total.
       Historical snapshot rides on the order so later edits to the coupon
       can never rewrite what this order paid. */
    const { normalizeCode, validateCouponForCart } = require('./coupons');
    const couponCode = normalizeCode(body.couponCode);
    let couponSnapshot = null;
    let couponBurn = null;
    let orderTotal = priced.value.total;
    let orderDiscount = 0;
    if (couponCode) {
      const signedInUidEarly = req.caller?.uid || null;
      const customerKey = signedInUidEarly
        || customer.value.email || customer.value.phone || null;
      const check = await validateCouponForCart(db, {
        code: couponCode,
        pricedItems: priced.value.items,
        customerKey,
      });
      if (!check.ok) return res.status(400).json({ error: check.error, code: 'COUPON_INVALID' });
      orderDiscount = Math.round(check.discountAmount * 100) / 100;
      orderTotal = Math.max(0, Math.round((priced.value.total - orderDiscount) * 100) / 100);
      couponSnapshot = {
        code: check.coupon.normalizedCode,
        couponId: check.coupon.id,
        discountType: check.coupon.discountType,
        discountValue: check.coupon.discountValue,
        discountAmount: orderDiscount,
      };
      couponBurn = {
        couponId: check.coupon.id,
        code: check.coupon.normalizedCode,
        discountAmount: orderDiscount,
        orderTotal,
        perCustomerLimit: check.coupon.perCustomerLimit,
        customerKey,
      };
    }

    /* Dropped when the feature is switched off, so "off" means orders genuinely
       stop carrying coordinates — not just that the map is hidden while a stale
       client, or anything else posting to this endpoint, keeps sending them. */
    const deliveryLocation = settings.deliveryPinEnabled ? readLocation(body.deliveryLocation) : null;
    // If the caller is signed in, bind the order to them. Guests stay anonymous.
    const signedInUid = req.caller?.uid || null;
    const signedInEmail = req.caller?.email || null;

    // Single-use capability returned only to whoever placed the order. The
    // notification endpoints require it, so merely knowing an order id — or
    // planting one — is not enough to make the shop send mail or SMS.
    const notifyToken = crypto.randomBytes(32).toString('base64url');
    const notifyTokenHash = crypto.createHash('sha256').update(notifyToken).digest('hex');

    /* The order-id format the admin configured, read once and passed into the
       commit. Read after the (slower) cart pricing so a busy shop is not holding
       a settings read open across it — the value is only consumed inside the
       transaction below. */
    const orderIdConfig = await loadOrderIdConfig(db);

    // One atomic transaction mints the order id and writes the order: the id
    // only exists when the order does, failures consume nothing and leave
    // nothing partial behind.
    const orderRef = db.collection('orders').doc();
    const increments = new Map(priced.value.items.map((item) => [item.id, item.quantity]));
    let orderNumber;
    let shortCode;
    try {
      ({ orderNumber, shortCode } = await commitSequencedOrder(db, {
        orderRef,
        productIncrements: increments,
        orderIdConfig,
        couponBurn,
        buildDocs: (num, code) => ({
          order: {
            userId: signedInUid,
            userEmail: signedInEmail || customer.value.email || null,
            userPhone: customer.value.phone,
            customer: customer.value,
            delivery: delivery.value,
            /* Stored at the top level, not inside `delivery`, because `delivery`
               collapses to { sameAsBilling: true } when the two addresses match and
               the pin is meaningful either way. Persisted so the invoice — and its QR
               code — regenerate identically months later. */
            deliveryLocation,
            items: priced.value.items,
            subtotal: priced.value.total,
            discount: orderDiscount,
            couponCode: couponSnapshot ? couponSnapshot.code : null,
            coupon: couponSnapshot,
            total: orderTotal,
            /* Successfully placed orders are born Confirmed — there is no
               Pending state for customer orders. The timeline therefore
               starts at Confirmed → Packed → … on every surface. */
            status: 'Confirmed',
            orderNumber: num,
            shortCode: code,
            createdAt: FieldValue.serverTimestamp(),
            notify: {
              tokenHash: notifyTokenHash,
              expiresAt: Timestamp.fromMillis(Date.now() + NOTIFY_TOKEN_TTL_MS),
              emailSentAt: null,
              smsSentAt: null,
            },
          },
          tracking: { orderId: orderRef.id, shortCode: code, orderNumber: num },
        }),
      }));
    } catch (error) {
      // Known failure modes already carry a customer-safe status + message
      // (e.g. product vanished mid-checkout, sequence exhausted). Anything
      // else is unexpected: log it in full, answer generically.
      if (error && error.orderStatus) {
        return res.status(error.orderStatus).json({ error: error.message, code: error.orderCode });
      }
      throw error;
    }

    console.log(`[orders] created ${orderRef.id} (${shortCode}) total=${orderTotal}${couponSnapshot ? ` coupon=${couponSnapshot.code}(-${orderDiscount})` : ''}`);

    /* Exactly ONE customer confirmation + ONE internal new-order
       notification — strictly after the successful commit, so an id is only
       ever mailed for an order that exists. Best-effort by contract: a mail
       failure (or disabled/unconfigured mail) is recorded on the order for
       debugging, but the 201 below is unaffected. Guards inside each hook
       make retried creates send nothing twice. */
    const savedOrder = {
      shortCode,
      orderNumber,
      status: 'Confirmed',
      total: orderTotal,
      subtotal: priced.value.total,
      discount: orderDiscount,
      coupon: couponSnapshot,
      items: priced.value.items,
      customer: customer.value,
      userEmail: signedInEmail || customer.value.email || null,
      notify: { tokenHash: notifyTokenHash },
    };
    try {
      await maybeSendOrderConfirmationEmail(db, orderRef, savedOrder);
    } catch (emailError) {
      console.warn(`[orders] confirmation email hook threw for ${shortCode}:`, emailError.message);
    }
    try {
      await maybeSendInternalNewOrderEmail(db, orderRef, savedOrder);
    } catch (emailError) {
      console.warn(`[orders] internal email hook threw for ${shortCode}:`, emailError.message);
    }

    return res.status(201).json({
      orderId: orderRef.id,
      shortCode,
      orderNumber,
      total: orderTotal,
      subtotal: priced.value.total,
      discount: orderDiscount,
      coupon: couponSnapshot,
      itemCount: priced.value.items.reduce((n, i) => n + i.quantity, 0),
      notifyToken,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ error: 'Could not place your order. Please try again.', code: 'INTERNAL' });
  }
}

/**
 * Verify a notify token against the stored hash and burn it for that channel,
 * so each order can send at most one email and one SMS.
 */
async function consumeNotifyToken(db, orderRef, order, presentedToken, channel) {
  const notify = order.notify;
  if (!notify?.tokenHash) return false;

  const expiresAt = notify.expiresAt?.toMillis?.();
  if (!expiresAt || Date.now() > expiresAt) return false;

  const alreadySent = channel === 'email' ? notify.emailSentAt : notify.smsSentAt;
  if (alreadySent) return false;

  if (typeof presentedToken !== 'string' || presentedToken.length < 20) return false;

  const presentedHash = crypto.createHash('sha256').update(presentedToken).digest('hex');
  const a = Buffer.from(presentedHash, 'hex');
  const b = Buffer.from(notify.tokenHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  await orderRef.update({
    [`notify.${channel}SentAt`]: FieldValue.serverTimestamp(),
  });

  return true;
}

/**
 * Price a counter cart from the staff-only productPricing collection, falling
 * back to the product's online retail price. Same precedence the register
 * displays (offlineDiscountPrice → offlineMRP → offlinePrice → onlinePrice),
 * resolved from the trusted records so the browser can never pick a price.
 */
async function pricePosCart(db, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'The bill is empty' };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `A bill cannot contain more than ${MAX_ITEMS} different products` };
  }

  const wanted = new Map();
  for (const raw of rawItems) {
    const id = typeof raw?.id === 'string' ? raw.id.slice(0, 128) : null;
    const quantity = Number.parseInt(raw?.quantity, 10);

    // Same guard as priceCart: a '/' id would make collection.doc(id) throw
    // and turn a bad bill line into a generic HTTP 500 instead of a 400.
    if (!id || id.includes('/')) return { ok: false, error: 'One of the bill items is invalid' };
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      return { ok: false, error: 'One of the bill quantities is invalid' };
    }

    wanted.set(id, Math.min((wanted.get(id) || 0) + quantity, MAX_QUANTITY_PER_ITEM));
  }

  const refs = [...wanted.keys()].map((id) => db.collection('products').doc(id));
  const pricingRefs = [...wanted.keys()].map((id) => db.collection('productPricing').doc(id));
  const [productSnaps, pricingSnaps] = await Promise.all([
    db.getAll(...refs),
    db.getAll(...pricingRefs),
  ]);

  const pricingById = new Map(
    pricingSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()])
  );

  const items = [];
  let total = 0;

  for (const snap of productSnaps) {
    if (!snap.exists) {
      return { ok: false, error: 'One of the products is no longer available' };
    }

    const product = snap.data();
    if (product.outOfStock === true) {
      return { ok: false, error: `${product.name || 'A product'} is out of stock` };
    }

    const pricing = pricingById.get(snap.id) || {};
    const unitPrice = Number(
      pricing.offlineDiscountPrice ||
        pricing.offlineMRP ||
        pricing.offlinePrice ||
        product.onlinePrice ||
        product.price ||
        0
    );
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: 'A product is mispriced. Please check the counter price list.' };
    }

    const quantity = wanted.get(snap.id);
    total += unitPrice * quantity;

    items.push({
      id: snap.id,
      name: cleanText(product.name, 200),
      quantity,
      price: unitPrice,
      discountPrice: pricing.offlineDiscountPrice ?? null,
      onlinePrice: product.onlinePrice ?? null,
    });
  }

  return { ok: true, value: { items, total: Math.round(total * 100) / 100 } };
}

/**
 * POST /api/orders/pos — staff-only counter billing.
 *
 * Body: { customer: { name, phone }, items: [{ id, quantity }], discountPercent,
 * paymentMode }
 *
 * The register never hands the browser pricing power: every amount is resolved
 * server-side from productPricing / products, the same way /api/orders prices
 * the storefront. The order is written as Completed with the payment mode and
 * discount recorded, plus the tracking code and the sales ledger used by the
 * storefront's Best Sellers rail.
 */
async function createPosOrder(req, res) {
  const db = getFirestore();

  try {
    const body = req.body || {};

    const name = cleanText(body.customer?.name, 100);
    const phone = normalisePhone(body.customer?.phone);
    if (name.length < 2) {
      return res.status(400).json({ error: 'Please provide a valid name' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit phone number' });
    }

    const parsedDiscount = Number(body.discountPercent);
    const discountPercent = Number.isFinite(parsedDiscount)
      ? Math.min(100, Math.max(0, parsedDiscount))
      : 0;

    const paymentMode = cleanText(body.paymentMode, 20) || 'Cash';
    if (!['Cash', 'UPI', 'Card'].includes(paymentMode)) {
      return res.status(400).json({ error: 'Invalid payment mode' });
    }

    const priced = await pricePosCart(db, body.items);
    if (!priced.ok) return res.status(400).json({ error: priced.error });

    const discount = Math.round(priced.value.total * (discountPercent / 100) * 100) / 100;
    const total = Math.max(0, Math.round((priced.value.total - discount) * 100) / 100);

    /* OFFLINE/STORE id only: own format (Ayyapa26-0001 by default) and own
       counter (counters/offlineOrders). Never touches the ONLINE counter, so
       counter bills and storefront checkouts never share a sequence. */
    const { config: offlineConfig } = await readOfflineOrderIdConfig(db);

    // Same atomic discipline as /api/orders but on the OFFLINE counter: the
    // offline id, the order, the tracking code and the sales ledger commit in
    // one transaction, so two terminals can never receive the same id and a
    // failed bill consumes nothing. Collisions step over (never overwrite).
    const orderRef = db.collection('orders').doc();
    const increments = new Map(priced.value.items.map((item) => [item.id, item.quantity]));
    let orderNumber;
    let shortCode;
    try {
      ({ orderNumber, shortCode } = await commitOfflineSequencedOrder(db, {
        orderRef,
        productIncrements: increments,
        offlineConfig,
        buildDocs: (num, code) => ({
          order: {
            userId: req.caller?.uid || null,
            userEmail: req.caller?.email || null,
            customer: {
              name,
              phone,
              email: '',
              address: 'Counter sale',
              city: 'Hyderabad',
              pincode: '500001',
            },
            delivery: { sameAsBilling: true },
            items: priced.value.items,
            subtotal: priced.value.total,
            discount,
            discountPercent,
            paymentMode,
            total,
            status: 'Completed',
            source: 'pos',
            channel: 'offline',
            orderType: 'offline',
            orderNumber: num,
            offlineOrderNumber: num,
            /* Single source of truth for the offline ID: stored directly on
               the order. `shortCode` mirrors it for compatibility with every
               existing reader (lists, search, invoices). Both are the same
               string — never regenerated downstream. */
            orderId: code,
            shortCode: code,
            createdAt: FieldValue.serverTimestamp(),
          },
          tracking: {
            orderId: orderRef.id,
            shortCode: code,
            offlineOrderId: code,
            orderNumber: num,
            channel: 'offline',
            source: 'pos',
            trackingKey: offlineTrackingKeyFor(code),
          },
        }),
      }));
    } catch (error) {
      if (error && error.orderStatus) {
        return res.status(error.orderStatus).json({ error: error.message, code: error.orderCode });
      }
      throw error;
    }

    console.log(`[orders/pos] created ${orderRef.id} (${shortCode}) total=${total} mode=${paymentMode}`);

    return res.status(201).json({
      orderId: orderRef.id,
      firestoreId: orderRef.id,
      shortCode,
      offlineOrderId: shortCode,
      orderNumber,
      total,
      itemCount: priced.value.items.reduce((n, i) => n + i.quantity, 0),
    });
  } catch (error) {
    console.error('Error creating POS order:', error);
    return res.status(500).json({ error: 'Could not save the bill. Please try again.', code: 'INTERNAL' });
  }
}

/* ---------------------------------------------------------------------------
   Order tracking

   Tracking codes are now purely sequential (CH01, CH02, ...) because the
   shop needs to read them aloud over the phone. That makes them guessable, so
   the code alone no longer grants access: this endpoint is the only public way
   to turn a code into an order, and it demands the last four digits of the
   order's phone number as a second factor.

   `trackingCodes.get` is staff-only in the rules for the same reason — a public
   code -> orderId map would hand an attacker the unguessable order id and let
   them read the order directly through `orders.get`, walking straight around
   the phone check.
   --------------------------------------------------------------------------- */

/**
 * Failed public tracking attempts, keyed by tracking code.
 *
 * Four digits is ten thousand guesses, which an IP-keyed limiter alone does not
 * stop — an attacker with a few hundred addresses would walk it in an evening.
 * Locking the *code* rather than the caller closes that, at the cost of letting
 * someone lock a stranger out of their own order for the window. That trade is
 * deliberate: tracking is a convenience with an obvious fallback (phone the
 * shop), whereas the customer PII behind it cannot be un-leaked.
 *
 * Successful lookups clear the counter, so a customer who fat-fingers three
 * times and then gets it right is not punished. In-memory and single-process,
 * like the other limiters here; a restart forgives everyone, which is
 * acceptable when the window is this short.
 */
const TRACK_MAX_FAILURES = 5;
const TRACK_LOCKOUT_MS = 15 * 60 * 1000;
const trackFailures = new Map();

const trackSweep = setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of trackFailures) {
    if (now > entry.resetAt) trackFailures.delete(code);
  }
}, TRACK_LOCKOUT_MS);
if (typeof trackSweep.unref === 'function') trackSweep.unref();

const recordTrackFailure = (code) => {
  const now = Date.now();
  const entry = trackFailures.get(code);
  if (!entry || now > entry.resetAt) {
    trackFailures.set(code, { count: 1, resetAt: now + TRACK_LOCKOUT_MS });
    return;
  }
  entry.count += 1;
};

const isTrackLocked = (code) => {
  const entry = trackFailures.get(code);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    trackFailures.delete(code);
    return false;
  }
  return entry.count >= TRACK_MAX_FAILURES;
};

/**
 * Compare two 4-digit strings without leaking their similarity through timing.
 * Both are hashed first so the comparison is over fixed-length buffers whatever
 * the caller sent.
 */
const digitsMatch = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/** The subset of an order a tracking page needs. Never the whole document. */
const trackingView = (id, order) => ({
  id,
  shortCode: order.shortCode || null,
  status: order.status || 'Pending',
  total: order.total ?? 0,
  createdAt: order.createdAt?.toDate?.()?.toISOString?.() || null,
  items: Array.isArray(order.items)
    ? order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price ?? 0,
        discountPrice: item.discountPrice ?? null,
      }))
    : [],
  /* Full contact details, as the page has always shown — the caller passed the
     phone check, and a masked address would leave them with an invoice they
     cannot use. What this deliberately omits is everything that is not theirs
     to see: the notify token hash, and the uid the order is bound to. Built as
     an allowlist so the next field somebody adds to an order is not published
     by default. */
  customer: {
    name: order.customer?.name || '',
    phone: order.customer?.phone || '',
    email: order.customer?.email || '',
    address: order.customer?.address || '',
    city: order.customer?.city || '',
    pincode: order.customer?.pincode || '',
  },
  delivery: order.delivery || null,
  /* The rest of what the invoice renders (see utils/pdfGenerator.js). Omitting
     these does not fail loudly — it prints an invoice with the payment mode and
     the discount quietly missing, which is worse. `source` decides whether the
     PDF is laid out as a counter sale or a delivery. */
  source: order.source || null,
  paymentMode: order.paymentMode || null,
  discount: order.discount ?? 0,
  discountPercent: order.discountPercent ?? 0,
  notes: order.notes || '',
  message: order.message || '',
  cancelledAt: order.cancelledAt?.toDate?.()?.toISOString?.() || null,
});

/**
 * POST /api/orders/track
 * Body: { code, phoneLast4 }
 *
 * Staff (valid bearer token, staff role) may look an order up by code alone —
 * that is the counter workflow, where someone reads "CH1042" off a slip.
 * Everyone else must also supply the last four digits of the order's phone.
 */
async function trackOrder(req, res) {
  const db = getFirestore();

  try {
    const isStaff = STAFF_ROLES.includes(req.caller?.role);
    const entered = cleanText(req.body?.code, 40).replace(/^#/, '');

    // Accepts both the new CH1042 and the legacy CH1042-K7QMX3 (see below).
    if (!/^[A-Za-z0-9-]{3,40}$/.test(entered)) {
      return res.status(400).json({ error: 'Please enter a valid tracking code' });
    }

    /* Tracking codes are stored upper-case, but a Firestore auto-id is
       case-sensitive and mixed-case — upper-casing one would make it
       unfindable. So the code lookup uppercases and the id fallback does not. */
    const raw = entered.toUpperCase();

    /* One message for "no such code", "wrong digits" and "locked out". Any
       difference between them is an oracle: it would confirm which numbers
       exist, and the running number makes those trivial to enumerate. */
    const deny = () => res.status(404).json({ error: 'No order matches that tracking code and phone number' });

    if (!isStaff && isTrackLocked(raw)) return deny();

    /* What counts as proof of ownership, decided once from the shape of what was
       typed rather than re-derived at each check. `carriesOwnEntropy` lives in
       lib/orderId so the storefront's copy of this rule cannot drift from the
       one that actually guards the data:
         - staff, holding a verified token, need nothing further;
         - a Firestore auto-id is itself unguessable;
         - a legacy CH1042-K7QMX3 carries six random characters, which is the
           same defence the phone check replaces, so those keep working and
           nothing needs migrating;
         - everything else — the old CH1042 and every id in the configurable
           format, including CH-20261008-000001 — proves nothing on its own and
           needs the four digits. Note that a hyphen is NOT evidence of
           entropy: hyphens are now ordinary in an id. */
    /* One rule, from one place, for "does this prove ownership on its own". The
       length-only check this replaced was a hole: the default configured format,
       CH-20261008-000001, is exactly 18 characters, so every new order would have
       been treated as an unguessable Firestore auto-id and served without the
       phone check. `carriesOwnEntropy` identifies an auto-id by its mixed case
       instead, which no generated id can ever have. */
    const needsPhone = !isStaff && !carriesOwnEntropy(raw);

    let phoneLast4 = '';
    if (needsPhone) {
      phoneLast4 = String(req.body?.phoneLast4 ?? '').replace(/\D/g, '');
      if (phoneLast4.length !== 4) {
        /* The flag is what the tracking page reads to reveal its digits field.
           Matching on the wording would break the moment somebody rephrases it.
           Returned for any bare code, present or not, so it is not an oracle. */
        return res.status(400).json({
          error: 'Please enter the last 4 digits of the phone number on the order',
          needsPhone: true,
        });
      }
    }

    const codeSnap = await db.collection('trackingCodes').doc(raw).get();
    let orderId = codeSnap.exists ? codeSnap.data().orderId : null;

    /* Order ids are 20-character Firestore auto-ids and remain unguessable, so
       a caller holding one has already proved as much as the code plus digits
       would. Staff paste them from the admin screens. Case preserved. */
    if (!orderId && looksLikeOrderId) orderId = entered;

    if (!orderId) {
      if (!isStaff) recordTrackFailure(raw);
      return deny();
    }

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      if (!isStaff) recordTrackFailure(raw);
      return deny();
    }

    const order = orderSnap.data();

    if (needsPhone) {
      const actual = String(order.customer?.phone || '').replace(/\D/g, '').slice(-4);
      if (actual.length !== 4 || !digitsMatch(phoneLast4, actual)) {
        recordTrackFailure(raw);
        console.warn(`[track] failed phone check for ${raw}`);
        return deny();
      }
    }

    // Right answer: forgive earlier fumbles rather than leaving the code locked.
    trackFailures.delete(raw);

    return res.json({ order: trackingView(orderSnap.id, order) });
  } catch (error) {
    console.error('Error tracking order:', error);
    return res.status(500).json({ error: 'Could not look up that order. Please try again.' });
  }
}

/* ---------------------------------------------------------------------------
   Public order tracking (Amazon-style timeline source of truth)

   The admin dropdowns already write exactly these canonical statuses, so this
   is a normaliser — not a second status system — that only absorbs legacy
   values still sitting in older documents:
     - POS counter sales are stored as 'Completed' (handed over) → Delivered
     - 'Processing', if ever present, is closest to Packed
     - anything unrecognised falls back to Pending (never a fake Delivered)
   --------------------------------------------------------------------------- */

const CUSTOMER_STATUSES = [
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

/** Map any stored status string onto the customer-facing canonical set. */
function normalizeCustomerStatus(status) {
  const raw = String(status || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!raw) return 'Pending';
  for (const canonical of CUSTOMER_STATUSES) {
    if (canonical.toLowerCase() === raw) return canonical;
  }
  if (raw === 'completed' || raw === 'complete' || raw === 'picked up' || raw === 'pickup') return 'Delivered';
  if (raw === 'processing' || raw === 'in transit' || raw === 'intransit') return 'Packed';
  if (raw === 'out for delivery' || raw === 'out of delivery') return 'Out for Delivery';
  return 'Pending';
}

/**
 * The customer-safe subset of an order. Deliberate allowlist: no Firestore
 * document ids, no customer PII (no names, phones, addresses, emails), no
 * item names/prices, no notify tokens, no internal fields. Payment method and
 * note are generic, non-identifying descriptors derived server-side from the
 * stored payment mode — never free text, never PII.
 */
const publicTrackingView = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    orderCode: order.shortCode || null,
    status: normalizeCustomerStatus(order.status),
    quantity: items.reduce((n, item) => n + (Number(item.quantity) || 0), 0),
    total: order.total ?? 0,
    paymentMethod: String(order.paymentMode || order.paymentStatus || 'Cash on Delivery').slice(0, 40),
    note: orderPaymentNote(order),
    createdAt: order.createdAt?.toDate?.()?.toISOString?.() || null,
    updatedAt: order.updatedAt?.toDate?.()?.toISOString?.() || null,
  };
};

/**
 * GET /api/orders/track/:orderCode
 *
 * Public, unauthenticated, rate-limited. Resolves a short code (CH01, …) to
 * the minimal tracking payload above — never the full document. Unknown or
 * malformed codes answer 404/400 with the same generic shape so the endpoint
 * cannot be used to probe for unrelated private data.
 */
async function handlePublicTrack(req, res) {
  const db = req.firestore || getFirestore();

  try {
    const entered = String(req.params?.orderCode || '').trim().replace(/^#/, '');
    const raw = entered.toUpperCase();

    /* Accepts every id the shop can have issued: the old CH01/CH100 range, the
       legacy CH1042-K7QMX3 codes, and whatever the configured format renders
       (by default CH-20261008-000001).

       Gated on the safe character set rather than on a shape, because the shape
       is admin-configurable — pinning the regex to `CH` would have broken
       tracking the first time the prefix was changed, which is exactly the
       failure this has to not have. The generator can only produce the safe set
       (see validateConfig), so this admits those ids and nothing more. */
    if (!isSafeOrderId(raw)) {
      return res.status(400).json({ error: 'Invalid order code' });
    }

    const codeSnap = await db.collection('trackingCodes').doc(raw).get();
    const orderId = codeSnap.exists ? codeSnap.data()?.orderId : null;
    if (!orderId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(publicTrackingView(orderSnap.data()));
  } catch (error) {
    console.error('Error in public order tracking:', error);
    return res.status(500).json({ error: 'Unable to load your order. Please try again.' });
  }
}

module.exports = {
  createOrder,
  createPosOrder,
  trackOrder,
  handlePublicTrack,
  normalizeCustomerStatus,
  publicTrackingView,
  CUSTOMER_STATUSES,
  consumeNotifyToken,
  isValidEmail,
  formatShortCode,
  parseShortCodeNumber,
  reserveNextOrderNumber,
  nextOrderNumber,
  readHighestUsedSequence,
  bumpSequenceFloor,
  setOnlineCounterTo,
  commitSequencedOrder,
  priceCart,
  NOTIFY_TOKEN_TTL_MS,
  MAX_ITEMS,
  MAX_ORDER_CREATE_ATTEMPTS,
  ORDER_NUMBER_MAX,
  ORDER_NUMBER_LIMIT_MESSAGE,
};
