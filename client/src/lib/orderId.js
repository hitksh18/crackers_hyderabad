/**
 * Order ID presentation for the storefront.
 *
 * The canonical Order ID is minted ONCE on the server and stored on the order
 * (`orders.orderId` for offline/store orders, mirrored on `orders.shortCode`).
 * Every customer-facing surface — confirmation, My Orders, tracking, invoice —
 * reads it through here, so there is exactly one id and no screen can invent
 * its own.
 *
 * The fallback exists only for orders written before these fields were stored;
 * it is never used for anything newly created.
 */
export const orderIdOf = (order) => {
  const stored = order?.orderId;
  if (typeof stored === 'string' && stored.trim()) return stored.trim();
  const code = order?.shortCode;
  if (typeof code === 'string' && code.trim()) return code.trim();
  return order?.id || '';
};

/**
 * The ONE customer-facing online Order ID: `order.shortCode`, normalised.
 *
 * Every visible surface — confirmation, My Orders, tracking, invoice header /
 * footer / filename, email, SMS, WhatsApp, admin list and detail — reads
 * through here, so there is exactly one id and no screen can invent its own.
 *
 * Deliberately stricter than `orderIdOf` above: it NEVER falls back to
 * `order.orderId`, `order.id`, or a slice of either. The Firestore document id
 * is internal-only and must never become the visible order number. When
 * `shortCode` is missing (a legacy record that predates it), this returns ''
 * and logs a diagnostic naming the document, so the record can be migrated
 * instead of silently leaking its internal id to the customer.
 *
 * Mirrored in admin/src/lib/orderId.js and api/lib/orderId.js — keep the
 * three in sync.
 */
export const getDisplayOrderId = (order) => {
  const code = order?.shortCode;
  if (typeof code !== 'string' || !code.trim()) {
    console.error(
      `[order-id] missing shortCode — refusing to expose the internal document id. doc=${order?.id || order?.orderId || 'unknown'}`
    );
    return '';
  }
  /* Counter/offline sales keep their configured casing (`Ayyapa26-0007`): the
     offline format is owned by the POS module and must be shown exactly as
     minted. Online ids are minted upper-case, and upper-casing here keeps a
     legacy or hand-edited value canonical (`CHYD26-3001`) everywhere it is
     shown, mailed or texted. */
  const isCounterSale = order?.source === 'pos' || order?.channel === 'offline' || order?.orderType === 'offline';
  return isCounterSale ? code.trim() : code.trim().toUpperCase();
};

/**
 * Drop a leading `#` and tidy the rest, the way a customer types an id back in.
 *
 * The format is admin-configurable, so this normalises rather than pattern-
 * matches: whatever shape the id has, stripping decoration and upper-casing is
 * enough to match what the server stored (which it also upper-cases).
 */
export const normalizeOrderIdInput = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .trim()
    .toUpperCase();

/**
 * Does this code prove ownership on its own, so no phone digits are required?
 *
 * Mirrors `carriesOwnEntropy` in api/lib/orderId.js — that copy is the one that
 * actually guards the data, and it also decides whether the lookup succeeds. If
 * this disagrees in the direction of showing the field when the server will not
 * ask for it, the cost is a wasted round trip, not a disclosure.
 *
 * Only two shapes qualify, and both are unguessable: a Firestore auto-id, and
 * the legacy `CH1042-K7QMX3` with six random characters. A hyphen alone proves
 * nothing — the default configured format is full of them.
 */
export const orderIdCarriesOwnEntropy = (code) => {
  const text = String(code ?? '').trim();
  // Generated ids are upper-case, so a lower-case character means this is a
  // Firestore auto-id — the one genuinely unguessable key tracking accepts.
  if (/[a-z]/.test(text) && text.length >= 18) return true;
  return /^CH\d+-[A-Z0-9]{6}$/.test(text.toUpperCase());
};