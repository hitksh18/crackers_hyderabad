'use strict';

/* ---------------------------------------------------------------------------
   Configurable Order ID generator.

   The order id the customer reads out over the phone ("CHYD26-0001") is
   minted HERE, on the server, inside the same transaction that writes the order.
   It is stored once, on `orders.shortCode`, and that single field is the
   canonical Order ID for every surface — storefront confirmation, admin list and
   search, tracking, email, SMS/WhatsApp and the invoice. Nothing else in the
   stack derives, re-formats or re-numbers it.

   WHAT IS CONFIGURABLE
     adminSettings/orderId holds { format, prefix, sequenceLength, nextSequence }.
     Changing it affects NEW orders only: orders already written keep the exact
     `shortCode` they were given, and nothing in this module — or anywhere else
     — ever rewrites one. There is deliberately no "regenerate" path.

   THE FORMAT STRING
     `CH-{YYYY}{MM}{DD}-{SEQUENCE}` — literal text plus {BLOCKS}:

       {PREFIX}   the configured prefix (defaults to CH)
       {YYYY}     4-digit year          {YY}  2-digit year
       {MM}       2-digit month (01-12) {DD}  2-digit day (01-31)
       {HH}       2-digit hour, 24h     {MIN} 2-digit minute
       {SEQUENCE} the zero-padded order sequence — REQUIRED

     {MIN} is deliberately not {MM}: month and minute both want two digits, and
     one of them has to give way. Minute is the rarer block, so it takes the
     shorter name.

   WHY {SEQUENCE} IS MANDATORY
     Every other block is a function of the clock. Two orders placed in the same
     minute under `CH-{YYYY}{MM}{DD}-{HH}{MIN}` would render identically, and the
     second one would be unreachable — its tracking lookup would resolve to the
     first. A format that can render the same string twice is rejected at save
     time rather than discovered by a customer.

   CHARACTER SET
     Uppercase letters, digits, `-` and `_` only. Every one of those survives the
     round trip through a URL path segment, a Firestore document id, an email
     link, a WhatsApp message body and a PDF filename. `#` in particular is
     banned: it is a URL fragment, so `CH#42` would truncate to `CH` in every
     link that carried it.
   --------------------------------------------------------------------------- */

const CONFIG_COLLECTION = 'adminSettings';
const CONFIG_DOC_ID = 'orderId';
const CONFIG_VERSION = 1;

/** The blocks an admin may use. Order is the order shown in the UI picker. */
const TOKENS = Object.freeze(['PREFIX', 'YYYY', 'YY', 'MM', 'DD', 'HH', 'MIN', 'SEQUENCE']);

/** The block that makes an id unique. Everything else is a function of time. */
const SEQUENCE_TOKEN = 'SEQUENCE';

const DEFAULT_FORMAT = '{PREFIX}-{SEQUENCE}';
const DEFAULT_PREFIX = 'CHYD26';
const DEFAULT_SEQUENCE_LENGTH = 4;
const DEFAULT_NEXT_SEQUENCE = 1;

const MIN_SEQUENCE_LENGTH = 3;
const MAX_SEQUENCE_LENGTH = 12;
const MAX_PREFIX_LENGTH = 12;
/* The human-facing sequence is four digits: 0001-9999. Past 9999 the server
   refuses to mint rather than rolling over to 0000 and duplicating ids. */
const MAX_ORDER_NUMBER = 9999;
/* 40 is the ceiling the tracking endpoints already accept (the legacy codes and
   the Firestore auto-ids both live inside it), so anything longer could be
   generated but never looked up. */
const MAX_ORDER_ID_LENGTH = 40;
const MIN_ORDER_ID_LENGTH = 3;
/* Generous next to MAX_ORDER_ID_LENGTH: this bounds the *format*, not the id,
   because {SEQUENCE} renders to a variable number of digits. */
const MAX_FORMAT_LENGTH = 60;

/** Characters allowed in the literal text of a format, and in the prefix. */
const SAFE_LITERAL = /^[A-Z0-9_-]*$/;
/** Characters allowed in a finished order id — the contract every consumer relies on. */
const SAFE_ORDER_ID = /^[A-Z0-9_-]+$/;

/**
 * Order ids are upper-case, so a lower-case character is a reliable signal that
 * what arrived is NOT one of ours — it is a Firestore auto-id, which is mixed-case
 * by construction.
 *
 * This is what makes the auto-id allowance safe at all. Distinguishing the two by
 * length alone would break both ways: a generated id can grow past 18 characters
 * (long prefix, long sequence) and would then skip the phone check, while a
 * genuine auto-id shorter than that would be refused one it does not need. By
 * case, the two sets cannot overlap at any length.
 */
const HAS_LOWERCASE = /[a-z]/;

/* A Firestore auto-id is 20 characters. The threshold is a little below that to
   tolerate the mixed-case spellings staff actually paste, but an id has to be at
   least this long AND contain a lower-case character to qualify. */
const AUTO_ID_MIN_LENGTH = 18;

/**
 * The legacy `CH1042-K7QMX3` shape: the old system appended six random
 * characters, which is the same unguessability the phone check replaced.
 *
 * Matched explicitly rather than by "contains a hyphen", because hyphens are
 * now ordinary in an order id — the default format is `CH-20261008-000001`.
 * Treating any hyphen as entropy would waive the phone check on every new
 * order and hand the caller's address to anyone enumerating the sequence.
 */
const LEGACY_RANDOM_SUFFIX_CODE = /^CH\d+-[A-Z0-9]{6}$/;

/**
 * Does this code prove ownership on its own, so no phone digits are required?
 *
 * Only two shapes qualify, and both are unguessable:
 *   - a Firestore auto-id (mixed-case, so it cannot be one of ours), and
 *   - a legacy `CH1042-K7QMX3` with its six random characters.
 *
 * Everything else — including every id in the configurable format, including
 * CH-20261008-000001 — needs the last four digits of the phone number on the
 * order. The default format is strictly sequential, so it carries no entropy.
 */
function carriesOwnEntropy(code) {
  const text = String(code || '').trim();
  if (HAS_LOWERCASE.test(text) && text.length >= AUTO_ID_MIN_LENGTH) return true;
  return LEGACY_RANDOM_SUFFIX_CODE.test(text.toUpperCase());
}

/**
 * India Standard Time, as a fixed offset.
 *
 * Not a nicety: an order placed at 00:30 IST belongs to the 8th, not the 7th,
 * and the date baked into its id has to say so. India observes no daylight
 * saving, so a constant offset is exact rather than an approximation — and it
 * keeps the id independent of whatever timezone the Node process happens to
 * boot in, which is what makes the admin's live preview trustworthy.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Messages shown to the admin. Kept in one place so the API response, the
 * preview panel and the tests cannot drift into three different wordings for
 * the same rule.
 */
const MESSAGES = Object.freeze({
  FORMAT_REQUIRED: 'Order ID format is required',
  FORMAT_TOO_LONG: `Order ID format must be ${MAX_FORMAT_LENGTH} characters or fewer`,
  FORMAT_EMPTY: 'Order ID format cannot be empty',
  FORBIDDEN_CHAR: 'Order ID format may only use letters, numbers, hyphens and underscores. Do not use "#".',
  UNKNOWN_TOKEN: (token) =>
    `Unknown block "{${token}}". Use ${TOKENS.map((t) => `{${t}}`).join(', ')}.`,
  SEQUENCE_REQUIRED: 'Order ID format must contain a unique sequence or collision-safe identifier. Add {SEQUENCE}.',
  PREFIX_INVALID: `Prefix may only use letters, numbers and underscores. Do not use "#". Max ${MAX_PREFIX_LENGTH} characters; leave it empty for no prefix.`,
  SEQUENCE_LENGTH_RANGE: `Sequence length must be between ${MIN_SEQUENCE_LENGTH} and ${MAX_SEQUENCE_LENGTH} digits.`,
  NEXT_SEQUENCE_REQUIRED: 'Next sequence number is required',
  NEXT_SEQUENCE_INVALID: 'Next sequence number must be a whole number of at least 1.',
  NEXT_SEQUENCE_TOO_HIGH: `Next sequence number must be ${9999} or less — the order number range is 0001 to 9999.`,
  NEXT_SEQUENCE_NOT_INCREASING:
    'Next sequence number must be greater than the highest existing sequence.',
  RENDERED_TOO_LONG: `Order ID must be ${MAX_ORDER_ID_LENGTH} characters or fewer so it can be entered on the tracking page.`,
  RENDERED_TOO_SHORT: `Order ID must be at least ${MIN_ORDER_ID_LENGTH} characters.`,
  UNSAFE_RENDERED:
    'Order ID may only use letters, numbers, hyphens and underscores. Do not use "#".',
  UNSAFE_PREFIX: 'Prefix may only use letters, numbers and underscores. Do not use "#".',
});

/** Split a format into literal runs and {TOKEN} blocks. */
function parseFormat(format) {
  const parts = [];
  const pattern = /\{([^{}]*)\}/g;
  let cursor = 0;
  let match = pattern.exec(format);
  while (match) {
    if (match.index > cursor) parts.push({ type: 'literal', value: format.slice(cursor, match.index) });
    parts.push({ type: 'token', value: match[1] });
    cursor = match.index + match[0].length;
    match = pattern.exec(format);
  }
  if (cursor < format.length) parts.push({ type: 'literal', value: format.slice(cursor) });
  return parts;
}

/** Uppercase and squeeze whitespace — how a typed format becomes a stored one. */
function normalizeFormatInput(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** Uppercase a prefix, dropping anything outside the safe set. */
function normalizePrefixInput(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * The date blocks for a moment in time, in IST and always zero-padded.
 * `now` is injectable so the admin's preview can be rendered for a fixed
 * instant and tested deterministically.
 */
function dateBlocks(now = new Date()) {
  const at = new Date((now instanceof Date ? now.getTime() : new Date(now).getTime()) + IST_OFFSET_MS);
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return {
    YYYY: pad(at.getUTCFullYear(), 4),
    YY: pad(at.getUTCFullYear() % 100),
    MM: pad(at.getUTCMonth() + 1),
    DD: pad(at.getUTCDate()),
    HH: pad(at.getUTCHours()),
    MIN: pad(at.getUTCMinutes()),
  };
}

/**
 * Render one order id.
 *
 * Unknown blocks are left as written rather than blanked, so a format that
 * slipped past validation produces an obviously wrong id instead of two
 * different-looking orders colliding on an empty string. Validation is the gate;
 * this is the renderer.
 */
function renderOrderId(config, { sequence, now = new Date() } = {}) {
  const blocks = dateBlocks(now);
  const prefix = normalizePrefixInput(config.prefix);
  const width = clampSequenceLength(config.sequenceLength);
  const padded = String(Math.max(0, Math.trunc(Number(sequence) || 0))).padStart(width, '0');

  const values = {
    ...blocks,
    PREFIX: prefix,
    SEQUENCE: padded,
  };

  /* Normalised here rather than relying on the caller. Block names are matched
     case-sensitively, so an un-normalised `{sequence}` would be left in the
     output verbatim — and the admin's preview would then disagree with the
     server about the same config. */
  return parseFormat(normalizeFormatInput(config.format))
    .map((part) => {
      if (part.type === 'literal') return part.value.toUpperCase();
      return Object.prototype.hasOwnProperty.call(values, part.value) ? values[part.value] : `{${part.value}}`;
    })
    .join('');
}

function clampSequenceLength(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.min(MAX_SEQUENCE_LENGTH, Math.max(MIN_SEQUENCE_LENGTH, n));
}

/** The default configuration — also what a shop with no stored config gets. */
function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    format: DEFAULT_FORMAT,
    prefix: DEFAULT_PREFIX,
    sequenceLength: DEFAULT_SEQUENCE_LENGTH,
    nextSequence: DEFAULT_NEXT_SEQUENCE,
    updatedAt: null,
    updatedBy: null,
  };
}

/**
 * Coerce a stored document into a usable config.
 *
 * Storage is attacker-adjacent (anyone with admin, or anyone who reached the
 * document through a rules mistake, can put anything in it) and the counter is
 * about to render whatever this returns into customer-facing ids. So a stored
 * value that would produce an unsafe id is NOT honoured — it falls back to the
 * default rather than being rendered. `isUsable` reports when that happened so
 * the settings screen can show the operator that the stored config was rejected.
 */
function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return { config: base, isUsable: true };

  const format = normalizeFormatInput(raw.format);
  const prefix = normalizePrefixInput(raw.prefix);
  const sequenceLength = clampSequenceLength(raw.sequenceLength);
  const nextSequenceRaw = Number(raw.nextSequence);

  const candidate = {
    ...base,
    format: format || base.format,
    prefix: prefix || base.prefix,
    sequenceLength,
    nextSequence: Number.isFinite(nextSequenceRaw) && nextSequenceRaw >= 1 ? Math.trunc(nextSequenceRaw) : base.nextSequence,
    updatedAt: raw.updatedAt ?? null,
    updatedBy: raw.updatedBy ?? null,
  };

  /* The prefix is checked in its own right, not only through the rendered id.
     A stored `CH#` is harmless while the format does not reference {PREFIX},
     and becomes a live `#` in customer-facing ids the moment someone edits the
     format to include it — which is exactly the sort of latent breakage a
     written-directly Firestore document should not be able to leave behind. */
  const rendered = renderOrderId(candidate, { sequence: candidate.nextSequence });
  const usable =
    SAFE_ORDER_ID.test(rendered) &&
    rendered.length >= MIN_ORDER_ID_LENGTH &&
    rendered.length <= MAX_ORDER_ID_LENGTH &&
    SAFE_LITERAL.test(candidate.prefix) &&
    candidate.prefix.length <= MAX_PREFIX_LENGTH &&
    parseFormat(candidate.format).some((p) => p.type === 'token' && p.value === SEQUENCE_TOKEN);

  return usable ? { config: candidate, isUsable: true } : { config: base, isUsable: false };
}

/**
 * Validate a submitted configuration.
 *
 * Returns every problem rather than the first, so the admin can fix the form in
 * one pass.
 *
 * There is deliberately NO floor against highestUsedSequence: rewinding the
 * next sequence (reset to 0001, say) is a supported flow, exactly as on the
 * offline side. Uniqueness does not depend on the counter never moving
 * backwards — commitSequencedOrder creates the tracking document (never
 * overwrites it) inside the same transaction and steps the counter over taken
 * ids on collision, so a rewound counter can never re-issue an existing id.
 */
function validateConfig(input, { highestUsedSequence = 0 } = {}) {
  // highestUsedSequence is accepted (callers report it for display) but is
  // NOT a validation floor: see the docblock above.
  void highestUsedSequence;
  const errors = {};

  const format = normalizeFormatInput(input?.format);
  const prefix = normalizePrefixInput(input?.prefix);
  const sequenceLength = Number.parseInt(input?.sequenceLength, 10);
  const nextSequence = Number(input?.nextSequence);

  if (!format) {
    errors.format = MESSAGES.FORMAT_EMPTY;
  } else if (format.length > MAX_FORMAT_LENGTH) {
    errors.format = MESSAGES.FORMAT_TOO_LONG;
  } else {
    const parts = parseFormat(format);
    const hasSequence = parts.some((p) => p.type === 'token' && p.value === SEQUENCE_TOKEN);
    const unknown = parts.find((p) => p.type === 'token' && !TOKENS.includes(p.value));
    const badLiteral = parts.find((p) => p.type === 'literal' && !SAFE_LITERAL.test(p.value.toUpperCase()));

    if (unknown) errors.format = MESSAGES.UNKNOWN_TOKEN(unknown.value);
    else if (badLiteral) errors.format = MESSAGES.FORBIDDEN_CHAR;
    else if (!hasSequence) errors.format = MESSAGES.SEQUENCE_REQUIRED;
    else {
      // Rendered against a deliberately worst-case sequence: a short id today
      // must not become an unlookupable one after a million orders.
      /* Rendered against the prefix as typed — including an empty one. Falling
         back to the default here would validate a different id than the one that
         would actually be minted. */
      const rendered = renderOrderId(
        { format, prefix, sequenceLength: Number.isFinite(sequenceLength) ? sequenceLength : DEFAULT_SEQUENCE_LENGTH },
        { sequence: 9_999_999_999 }
      );
      if (!SAFE_ORDER_ID.test(rendered)) errors.format = MESSAGES.UNSAFE_RENDERED;
      else if (rendered.length > MAX_ORDER_ID_LENGTH) errors.format = MESSAGES.RENDERED_TOO_LONG;
      else if (rendered.length < MIN_ORDER_ID_LENGTH) errors.format = MESSAGES.RENDERED_TOO_SHORT;
    }
  }

  /* An empty prefix is legal — `ORD-{SEQUENCE}` is a perfectly good id and is
     exactly what the brief lists as the example for changing the format. The
     characters are still constrained whenever there IS a prefix, because an
     unconstrained one is what breaks tracking links. */
  if (prefix && (prefix.length > MAX_PREFIX_LENGTH || !SAFE_LITERAL.test(prefix))) {
    errors.prefix = MESSAGES.PREFIX_INVALID;
  }

  if (!Number.isFinite(sequenceLength) || sequenceLength < MIN_SEQUENCE_LENGTH || sequenceLength > MAX_SEQUENCE_LENGTH) {
    errors.sequenceLength = MESSAGES.SEQUENCE_LENGTH_RANGE;
  }

  if (!Number.isFinite(nextSequence)) {
    errors.nextSequence = MESSAGES.NEXT_SEQUENCE_INVALID;
  } else if (!Number.isInteger(nextSequence) || nextSequence < 1) {
    errors.nextSequence = MESSAGES.NEXT_SEQUENCE_INVALID;
  } else if (nextSequence > MAX_ORDER_NUMBER) {
    errors.nextSequence = MESSAGES.NEXT_SEQUENCE_TOO_HIGH;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: null,
    value: {
      version: CONFIG_VERSION,
      format,
      prefix,
      sequenceLength,
      nextSequence,
    },
  };
}

/** Load the effective config, falling back to the default on any read error. */
async function readOrderIdConfig(db) {
  try {
    const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
    if (!snap.exists) return { config: defaultConfig(), isUsable: true };
    const { config, isUsable } = normalizeConfig(snap.data());
    if (!isUsable) {
      console.warn('[orderId] stored config is unusable and was ignored; falling back to the default format');
    }
    return { config, isUsable };
  } catch (error) {
    console.warn('[orderId] could not read config, using default:', error.message);
    return { config: defaultConfig(), isUsable: true };
  }
}

/** Persist a validated config. Callers must have run validateConfig first. */
async function writeOrderIdConfig(db, config, { userEmail = null } = {}) {
  const payload = {
    version: CONFIG_VERSION,
    format: config.format,
    prefix: config.prefix,
    sequenceLength: config.sequenceLength,
    nextSequence: config.nextSequence,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || null,
  };
  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).set(payload, { merge: true });
  return payload;
}

/**
 * Does this finished id look like something the shop can serve back?
 * The tracking endpoints gate on the same character set, so this is the one
 * place that decides what a legal order id is.
 */
function isSafeOrderId(value) {
  const text = String(value ?? '');
  return text.length >= MIN_ORDER_ID_LENGTH && text.length <= MAX_ORDER_ID_LENGTH && SAFE_ORDER_ID.test(text);
}

/**
 * The ONE customer-facing online Order ID: `order.shortCode`, normalised.
 *
 * Every customer-visible server surface — confirmation email subject/body,
 * manual resend, SMS — reads through here, so the mailed/texted id is always
 * the exact id the invoice and the storefront show. Internal uses (Firestore
 * reads/writes, `loadOrderRef`, tracking lookups, delivery logs) keep using
 * the document id directly.
 *
 * Deliberately strict: it NEVER falls back to `order.orderId`, `order.id`,
 * or a slice of either. The Firestore document id is internal-only and must
 * never become the visible order number. When `shortCode` is missing (a
 * legacy record that predates it), this returns '' and logs a diagnostic
 * naming the document, so callers fail safe — skip the send or render 'N/A'
 * — instead of silently leaking the internal id to the customer.
 *
 * Mirrored in client/src/lib/orderId.js and admin/src/lib/orderId.js — keep
 * the three in sync.
 */
function getDisplayOrderId(order) {
  const code = order && order.shortCode;
  if (typeof code !== 'string' || !code.trim()) {
    console.error(
      `[order-id] missing shortCode — refusing to expose the internal document id. doc=${(order && (order.id || order.orderId)) || 'unknown'}`
    );
    return '';
  }
  /* Counter/offline sales keep their configured casing (`Ayyapa26-0007`): the
     offline format is owned by the POS module and must be shown exactly as
     minted. Online ids are minted upper-case, and upper-casing here keeps a
     legacy or hand-edited value canonical (`CHYD26-3001`) everywhere it is
     shown, mailed or texted. */
  const isCounterSale = order.source === 'pos' || order.channel === 'offline' || order.orderType === 'offline';
  return isCounterSale ? code.trim() : code.trim().toUpperCase();
}

module.exports = {
  CONFIG_COLLECTION,
  CONFIG_DOC_ID,
  CONFIG_VERSION,
  TOKENS,
  SEQUENCE_TOKEN,
  MESSAGES,
  DEFAULT_FORMAT,
  DEFAULT_PREFIX,
  DEFAULT_SEQUENCE_LENGTH,
  DEFAULT_NEXT_SEQUENCE,
  MIN_SEQUENCE_LENGTH,
  MAX_SEQUENCE_LENGTH,
  MAX_ORDER_NUMBER,
  MAX_PREFIX_LENGTH,
  MAX_FORMAT_LENGTH,
  MAX_ORDER_ID_LENGTH,
  MIN_ORDER_ID_LENGTH,
  SAFE_ORDER_ID,
  LEGACY_RANDOM_SUFFIX_CODE,
  AUTO_ID_MIN_LENGTH,
  HAS_LOWERCASE,
  IST_OFFSET_MS,
  parseFormat,
  normalizeFormatInput,
  normalizePrefixInput,
  dateBlocks,
  renderOrderId,
  defaultConfig,
  normalizeConfig,
  validateConfig,
  readOrderIdConfig,
  writeOrderIdConfig,
  isSafeOrderId,
  carriesOwnEntropy,
  getDisplayOrderId,
};