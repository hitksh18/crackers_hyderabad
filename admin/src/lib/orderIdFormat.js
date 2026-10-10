/**
 * Preview and validation helpers for the Order ID settings screen.
 *
 * The SERVER is the source of truth for what an order id becomes — it mints them
 * (api/lib/orderId.js). This module exists so the admin's preview updates on
 * every keystroke instead of waiting for a round trip, which means it must
 * render identically to the server or the screen would lie.
 *
 * That equivalence is not left to good intentions: tests/order-id.test.js runs
 * both implementations over the same set of formats and asserts they agree. If
 * they ever diverge, the test fails rather than the preview quietly lying.
 *
 * The character-set rule is duplicated here for the same reason. It is the rule
 * that keeps `#` out of order ids, and `#` is a URL fragment — a format that
 * allowed it would produce ids that truncate the moment they are pasted into a
 * tracking link or an email button.
 */

const TOKENS = ['PREFIX', 'YYYY', 'YY', 'MM', 'DD', 'HH', 'MIN', 'SEQUENCE'];

const DEFAULT_FORMAT = '{PREFIX}-{SEQUENCE}';
const DEFAULT_PREFIX = 'CHYD26';
const DEFAULT_SEQUENCE_LENGTH = 4;

const MIN_SEQUENCE_LENGTH = 3;
const MAX_SEQUENCE_LENGTH = 12;
/* The human-facing sequence is four digits: 0001-9999. Matches the server. */
const MAX_ORDER_NUMBER = 9999;
const MAX_PREFIX_LENGTH = 12;
const MAX_FORMAT_LENGTH = 60;
const MAX_ORDER_ID_LENGTH = 40;
const MIN_ORDER_ID_LENGTH = 3;

const SAFE_LITERAL = /^[A-Z0-9_-]*$/;
const SAFE_ORDER_ID = /^[A-Z0-9_-]+$/;

/* India Standard Time as a fixed offset — matches the server. India observes no
   daylight saving, so this is exact, and it keeps the preview correct regardless
   of the timezone the admin's laptop is set to. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export const ORDER_ID_TOKENS = TOKENS;
export const ORDER_ID_DEFAULTS = {
  format: DEFAULT_FORMAT,
  prefix: DEFAULT_PREFIX,
  sequenceLength: DEFAULT_SEQUENCE_LENGTH,
};
export const ORDER_ID_LIMITS = {
  minSequenceLength: MIN_SEQUENCE_LENGTH,
  maxSequenceLength: MAX_SEQUENCE_LENGTH,
  maxOrderIdLength: MAX_ORDER_ID_LENGTH,
};

export const normalizeFormatInput = (value) =>
  String(value ?? '').replace(/\s+/g, '').toUpperCase();

export const normalizePrefixInput = (value) =>
  String(value ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Split a stored {format, prefix} into the five Site Settings fields when the
 * format is exactly `{PREFIX}<literal>{SEQUENCE}` (the shape this form and the
 * server compose). Anything else (date blocks, reordered tokens) is reported
 * as non-simple: the full format editor (Settings → Orders → Order ID) owns
 * those, and saving here would replace them — so the form warns instead.
 *
 * The middle literal splits into year + separator by peeling up to 3 trailing
 * `-`/`_` characters as the separator (mirrors the offline limits).
 */
export const parseOnlineFields = ({ format, prefix } = {}) => {
  const fallback = {
    simple: false,
    prefix: normalizePrefixInput(prefix),
    year: '',
    separator: '-',
  };
  const match = /^\{PREFIX\}([A-Z0-9_-]*)\{SEQUENCE\}$/.exec(normalizeFormatInput(format));
  if (!match) return fallback;
  const mid = match[1];
  const sepMatch = /([-_]{1,3})$/.exec(mid);
  const separator = sepMatch ? sepMatch[1] : '';
  const year = mid.slice(0, mid.length - separator.length);
  if (year.length > 4) return fallback;
  return { simple: true, prefix: normalizePrefixInput(prefix), year, separator };
};

/** Compose the stored format from the five fields. Inputs must be cleaned. */
export const composeOnlineFormat = ({ year = '', separator = '-' } = {}) =>
  `{PREFIX}${year}${separator}{SEQUENCE}`;

/** Split a format into literal runs and {TOKEN} blocks. */
export const parseOrderIdFormat = (format) => {
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
};

/* Default width 2 — every block except {YYYY} is two digits, and a missing
   default here silently renders 8 October as "8". */
const pad = (value, width = 2) => String(value).padStart(width, '0');

/** The date blocks for a moment in time, in IST. */
export const orderIdDateBlocks = (now = new Date()) => {
  const at = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    YYYY: pad(at.getUTCFullYear(), 4),
    YY: pad(at.getUTCFullYear() % 100),
    MM: pad(at.getUTCMonth() + 1),
    DD: pad(at.getUTCDate()),
    HH: pad(at.getUTCHours()),
    MIN: pad(at.getUTCMinutes()),
  };
};

/**
 * Render one order id. Unknown blocks are left as written rather than blanked,
 * matching the server, so an invalid draft still shows something recognisable
 * next to its error message.
 */
export const renderOrderId = (config, { sequence = 1, now = new Date() } = {}) => {
  const format = normalizeFormatInput(config?.format || DEFAULT_FORMAT);
  const prefix = normalizePrefixInput(config?.prefix || DEFAULT_PREFIX);
  const rawLength = Number.parseInt(config?.sequenceLength, 10);
  const width = Number.isFinite(rawLength)
    ? Math.min(MAX_SEQUENCE_LENGTH, Math.max(MIN_SEQUENCE_LENGTH, rawLength))
    : DEFAULT_SEQUENCE_LENGTH;

  const values = {
    ...orderIdDateBlocks(now),
    PREFIX: prefix,
    SEQUENCE: pad(Math.max(0, Math.trunc(Number(sequence) || 0)), width),
  };

  /* The format is normalised before parsing, exactly as the server does, so a
     lower-case block name resolves rather than being emitted verbatim. */
  return parseOrderIdFormat(format)
    .map((part) => {
      if (part.type === 'literal') return part.value.toUpperCase();
      return Object.prototype.hasOwnProperty.call(values, part.value) ? values[part.value] : `{${part.value}}`;
    })
    .join('');
};

/**
 * Client-side validation, for showing a problem while typing.
 *
 * The server validates again on save and its answer is the one that counts —
 * this copy exists to avoid a save button that fails after a round trip, not to
 * be the authority. Both report the same messages for the same rules.
 *
 * No floor against the highest used sequence (mirrors the server): rewinding
 * the next number is supported because the commit steps over taken ids.
 */
export const validateOrderIdConfig = (input, { highestUsedSequence = 0 } = {}) => {
  void highestUsedSequence;
  const errors = {};

  const format = normalizeFormatInput(input?.format);
  const prefix = normalizePrefixInput(input?.prefix);
  const sequenceLength = Number.parseInt(input?.sequenceLength, 10);
  const nextSequence = Number(input?.nextSequence);

  if (!format) {
    errors.format = 'Order ID format is required';
  } else if (format.length > MAX_FORMAT_LENGTH) {
    errors.format = `Order ID format must be ${MAX_FORMAT_LENGTH} characters or fewer`;
  } else {
    const parts = parseOrderIdFormat(format);
    const hasSequence = parts.some((p) => p.type === 'token' && p.value === 'SEQUENCE');
    const unknown = parts.find((p) => p.type === 'token' && !TOKENS.includes(p.value));
    const badLiteral = parts.find((p) => p.type === 'literal' && !SAFE_LITERAL.test(p.value.toUpperCase()));

    if (unknown) {
      errors.format = `Unknown block "{${unknown.value}}". Use ${TOKENS.map((t) => `{${t}}`).join(', ')}.`;
    } else if (badLiteral) {
      errors.format = 'Order ID format may only use letters, numbers, hyphens and underscores. Do not use "#".';
    } else if (!hasSequence) {
      errors.format = 'Order ID format must contain a unique sequence or collision-safe identifier. Add {SEQUENCE}.';
    } else {
      /* Rendered against the prefix as typed — including an empty one, so the check
         covers the id that would actually be minted. */
      const rendered = renderOrderId(
        { format, prefix, sequenceLength: Number.isFinite(sequenceLength) ? sequenceLength : DEFAULT_SEQUENCE_LENGTH },
        { sequence: 9_999_999_999 }
      );
      if (!SAFE_ORDER_ID.test(rendered)) {
        errors.format = 'Order ID may only use letters, numbers, hyphens and underscores. Do not use "#".';
      } else if (rendered.length > MAX_ORDER_ID_LENGTH) {
        errors.format = `Order ID must be ${MAX_ORDER_ID_LENGTH} characters or fewer so it can be entered on the tracking page.`;
      } else if (rendered.length < MIN_ORDER_ID_LENGTH) {
        errors.format = `Order ID must be at least ${MIN_ORDER_ID_LENGTH} characters.`;
      }
    }
  }

  /* An empty prefix is legal — `ORD-{SEQUENCE}` is a perfectly good id and is
     exactly what the brief lists as the example for changing the format. */
  if (prefix && (prefix.length > MAX_PREFIX_LENGTH || !SAFE_LITERAL.test(prefix))) {
    errors.prefix = `Prefix may only use letters, numbers and underscores. Do not use "#". Max ${MAX_PREFIX_LENGTH} characters; leave it empty for no prefix.`;
  }

  if (!Number.isFinite(sequenceLength) || sequenceLength < MIN_SEQUENCE_LENGTH || sequenceLength > MAX_SEQUENCE_LENGTH) {
    errors.sequenceLength = `Sequence length must be between ${MIN_SEQUENCE_LENGTH} and ${MAX_SEQUENCE_LENGTH} digits.`;
  }

  if (!Number.isFinite(nextSequence) || !Number.isInteger(nextSequence) || nextSequence < 1) {
    errors.nextSequence = 'Next sequence number must be a whole number of at least 1.';
  } else if (nextSequence > MAX_ORDER_NUMBER) {
    errors.nextSequence = `Next sequence number must be ${MAX_ORDER_NUMBER} or less — the order number range is 0001 to 9999.`;
  }

  return { ok: Object.keys(errors).length === 0, errors, maxOrderNumber: MAX_ORDER_NUMBER };
};

/**
 * Does this id carry its own entropy, so it needs no phone digits?
 *
 * Used to annotate the preview — an admin should be able to see at a glance
 * whether the format they picked is guessable. A date plus a running sequence
 * is not, which is exactly why the tracking page also asks for the last four
 * digits of the phone number. Mirrors `carriesOwnEntropy` in api/lib/orderId.js.
 */
export const orderIdCarriesOwnEntropy = (code) => {
  const text = String(code || '').trim();
  // Generated ids are upper-case, so a lower-case character means this is a
  // Firestore auto-id — the one genuinely unguessable key tracking accepts.
  if (/[a-z]/.test(text) && text.length >= 18) return true;
  return /^CH\d+-[A-Z0-9]{6}$/.test(text.toUpperCase());
};