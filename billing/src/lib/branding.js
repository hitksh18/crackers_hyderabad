/**
 * Billing/POS brand constants — single source of truth.
 *
 * The counter terminal is branded AYYAPA FIREWORKS. This module exists so the
 * name and the logo live in exactly one place: the header, the login screen,
 * the role-error screen, the printed invoice and the WhatsApp bill all read
 * from here instead of each hard-coding a string.
 *
 * The customer storefront and the staff console are separate applications and
 * keep their own branding — nothing here affects them.
 */

/** Display name, used on screen and on paper. */
export const BRAND_NAME = 'Ayyapa Fireworks';

/** Upper-case form for the letter-spaced caption style used across the POS UI. */
export const BRAND_NAME_UPPER = 'AYYAPA FIREWORKS';

/** Sub-line printed under the name on the invoice. */
export const BRAND_TAGLINE = 'Premium Quality Fireworks';

/**
 * Official logo asset path.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ACTION REQUIRED: this file does not exist yet, so the terminal renders the
 * wordmark alone (see BrandLogo). To switch on the official artwork, drop the
 * real Ayyapa Fireworks logo here:
 *
 *   billing/public/images/website/ayyapafireworkslogo.png
 *
 * Nothing else has to change — every surface reads BRAND_LOGO_SRC. No
 * placeholder or stand-in logo is shipped, deliberately: an invented mark on
 * a customer's printed invoice is worse than a clean wordmark.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const BRAND_LOGO_SRC = '/images/website/ayyapafireworkslogo.png';