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