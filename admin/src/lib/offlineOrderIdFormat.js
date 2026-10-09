/**
 * Preview + validation helpers for the OFFLINE / STORE Order ID section.
 *
 * Mirrors api/lib/offlineOrderId.js (the SERVER is the source of truth and
 * re-validates on save). Kept separate from orderIdFormat.js on purpose:
 * ONLINE and OFFLINE are independent systems and must never share parsing.
 *
 * Format: `${prefix}${year}${separator}${paddedSequence}`
 *   Ayyapa + 26 + - + 0001 => Ayyapa26-0001
 *   STORE  + 26 + - + 00001 (padding 5) => STORE26-00001
 */

export const OFFLINE_DEFAULTS = {
  prefix: 'Ayyapa',
  year: '26',
  separator: '-',
  padding: 4,
  nextNumber: 1,
};

export const OFFLINE_LIMITS = {
  minPadding: 3,
  maxPadding: 12,
  maxPrefixLength: 20,
  maxYearLength: 4,
  maxSeparatorLength: 3,
  maxOrderNumber: 9999,
};

const cleanPrefix = (v) => String(v ?? '').replace(/\s+/g, '');
const cleanYear = (v) => String(v ?? '').replace(/\s+/g, '');
const cleanSeparator = (v) => String(v ?? '');

export const padOfflineNumber = (n, width = OFFLINE_DEFAULTS.padding) => {
  const w = Number.isFinite(Number(width)) ? Number(width) : OFFLINE_DEFAULTS.padding;
  return String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(w, '0');
};

/** Render one OFFLINE id. Pure — reserves nothing. Preserves prefix casing. */
export const renderOfflineOrderId = (config = {}, { sequence = 1 } = {}) => {
  const prefix = cleanPrefix(config.prefix ?? OFFLINE_DEFAULTS.prefix);
  const year = cleanYear(config.year ?? OFFLINE_DEFAULTS.year);
  const separator = cleanSeparator(config.separator ?? OFFLINE_DEFAULTS.separator);
  const rawPad = Number.parseInt(config.padding ?? config.sequenceLength, 10);
  const width = Number.isFinite(rawPad)
    ? Math.min(OFFLINE_LIMITS.maxPadding, Math.max(OFFLINE_LIMITS.minPadding, rawPad))
    : OFFLINE_DEFAULTS.padding;
  return `${prefix}${year}${separator}${padOfflineNumber(sequence, width)}`;
};

/**
 * Client-side validation for instant feedback. The server re-validates.
 * Unlike ONLINE, nextNumber MAY rewind (reset to 0001 is supported) because
 * the commit steps over taken ids — so no highestUsed floor check here.
 */
export const validateOfflineOrderIdConfig = (input = {}) => {
  const errors = {};
  const prefix = cleanPrefix(input.prefix);
  const year = cleanYear(input.year ?? '');
  const separator = cleanSeparator(input.separator ?? '');
  const padding = Number.parseInt(input.padding ?? input.sequenceLength, 10);
  const nextNumber = Number(input.nextNumber ?? input.nextSequence);

  if (!prefix) {
    errors.prefix = 'Offline prefix is required.';
  } else if (prefix.length > OFFLINE_LIMITS.maxPrefixLength || !/^[A-Za-z0-9_]*$/.test(prefix)) {
    errors.prefix = `Prefix must be 1–${OFFLINE_LIMITS.maxPrefixLength} letters/numbers, no spaces.`;
  }
  if (year.length > OFFLINE_LIMITS.maxYearLength || (year && !/^[A-Za-z0-9]*$/.test(year))) {
    errors.year = 'Year must be up to 4 letters/numbers (e.g. 26).';
  }
  if (separator.length > OFFLINE_LIMITS.maxSeparatorLength || !/^[A-Za-z0-9\-_]*$/.test(separator)) {
    errors.separator = 'Separator may only use - or _ (max 3 characters).';
  }
  if (!Number.isFinite(padding) || padding < OFFLINE_LIMITS.minPadding || padding > OFFLINE_LIMITS.maxPadding) {
    errors.padding = `Number padding must be between ${OFFLINE_LIMITS.minPadding} and ${OFFLINE_LIMITS.maxPadding} digits.`;
  }
  if (!Number.isFinite(nextNumber) || !Number.isInteger(nextNumber) || nextNumber < 1) {
    errors.nextNumber = 'Next order number must be a whole number of at least 1.';
  } else if (nextNumber > OFFLINE_LIMITS.maxOrderNumber) {
    errors.nextNumber = `Next order number must be ${OFFLINE_LIMITS.maxOrderNumber} or less — the range is 0001 to 9999.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
};
