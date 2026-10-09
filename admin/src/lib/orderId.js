/**
 * Order ID presentation for the admin app.
 *
 * The canonical Order ID is minted ONCE on the server and stored on the
 * order (`orders.orderId` for offline/store orders, mirrored on
 * `orders.shortCode` for every reader). This module only reads it — it never
 * builds one, never derives one from the document id, and never reformats
 * one. The PDF generator, filename, details and lists all read through here,
 * so they can never invent a second id.
 *
 * The fallback exists only for orders written before these fields were stored
 * (and for the handful of documents with no id at all): those orders still
 * need to be clickable. It is never used for anything a customer is shown.
 */
export const orderIdOf = (order) => {
  const stored = order?.orderId;
  if (typeof stored === 'string' && stored.trim()) return stored.trim();
  const code = order?.shortCode;
  if (typeof code === 'string' && code.trim()) return code.trim();
  return order?.id || '';
};

/**
 * Collapse a search term the way an order id is stored.
 *
 * Ids are upper-case with `-` separators, and people paste them with spaces,
 * a leading `#`, or in lower case. Normalising both sides means
 * "ch 2026 10 08 42" finds `CH-20261008-000042` without the admin having to
 * retype it, and it keeps the search working after the format changes — the term
 * is compared against whatever the id actually is, never against a pattern built
 * from the current format.
 */
export const normalizeOrderSearch = (value) =>
  String(value ?? '')
    .toUpperCase()
    // Keep '-' and '_': they are id characters, so dropping them would stop
    // `CH-2026...` matching itself. Spaces, '#', '/' and friends go.
    .replace(/[^A-Z0-9_-]/g, '');

/**
 * A second normalisation for "did they retype it with the separators removed?".
 *
 * People copy an id off a WhatsApp message and read `CH-20261008-000042` as
 * `CH 20261008 000042`, or retype it as `CH20261008000042`. Comparing the
 * separator-free forms finds all of those without the admin having to notice
 * which character they slipped.
 */
export const compactOrderSearch = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/**
 * Does this order match a search term?
 *
 * Checks the canonical Order ID first, then the raw Firestore document id (staff
 * paste those from URLs and from the database console), then the bare sequence
 * number — typing `000042` finds `CH-20261008-000042` without knowing the format.
 * Customer name and phone are matched by the caller, which owns those fields.
 */
export const orderIdMatches = (order, rawTerm) => {
  const term = String(rawTerm ?? '').trim();
  if (!term) return true;
  if (!order) return false;

  const needle = normalizeOrderSearch(term);
  const bareNeedle = compactOrderSearch(term);

  // Exact-ish first: the id as stored, with its separators.
  if (needle && normalizeOrderSearch(orderIdOf(order)).includes(needle)) return true;
  if (bareNeedle && compactOrderSearch(orderIdOf(order)).includes(bareNeedle)) return true;

  // Then the internal document id, which staff paste from URLs and the console.
  if (needle && normalizeOrderSearch(order.id).includes(needle)) return true;
  if (bareNeedle && compactOrderSearch(order.id).includes(bareNeedle)) return true;

  // Then the bare sequence number, so `000042` finds `CH-20261008-000042`
  // without the admin knowing the format at all.
  const digits = bareNeedle;
  if (digits && digits.length >= 3) {
    const sequence = String(order.orderNumber ?? '').replace(/\D/g, '');
    if (sequence && sequence.includes(digits)) return true;
  }

  return false;
};