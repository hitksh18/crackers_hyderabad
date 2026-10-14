/**
 * Storefront WhatsApp contact number.
 *
 * The SINGLE SOURCE OF TRUTH is the Store Contact setting in the admin app
 * (Site Settings → Store Contact → WhatsApp number), stored in Firestore at
 * `footerSettings/main` under the `whatsapp` field. This module only
 * normalises that saved value for wa.me links — it never invents a number,
 * never falls back to a hardcoded one, and never touches the stored value.
 *
 * This is the public customer-facing contact number. It is completely
 * separate from the Meta Cloud API credentials (WHATSAPP_ACCESS_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID) used for automated order messages — those must
 * never feed this link.
 */

/**
 * Normalise a saved Store Contact number to wa.me digits.
 *
 * - Strips spaces, `+`, `-`, `(`, `)` and all other non-digits.
 * - An Indian 10-digit number (`91212 98383`) gains the country code
 *   (`919121298383`).
 * - A value that already carries it (`91 91212 98383`, `+91-9121298383`)
 *   is left alone — 91 is never doubled.
 * - A trunk-prefixed value (`09121298383`) drops the trunk zero.
 * - Anything else yields '' so the caller renders no button instead of a
 *   link to a wrong number.
 */
export const normalizeWhatsappLinkNumber = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  return '';
};
