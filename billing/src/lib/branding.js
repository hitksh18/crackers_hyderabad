/**
 * Billing/POS brand constants — single source of truth.
 *
 * The counter terminal is branded AYYAPA FIREWORKS ONLY. This module exists
 * so the name and the logo live in exactly one place: the header, the login
 * screen, the role-error screen and the printed offline invoice all read
 * from here instead of each hard-coding a string.
 *
 * The offline/store invoice must NEVER mention the online store brand anywhere.
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
 * Official offline logo asset path.
 *
 * The dedicated high-resolution artwork is `billing/images/Ayyappa Fireworks
 * Logo.png`. A servable copy lives at
 * `billing/public/images/website/ayyappa-fireworks-logo.png` (same bytes).
 * Every offline surface reads BRAND_LOGO_SRC; components fall back to the
 * wordmark if the file ever goes missing, so a missing image never prints
 * as a broken-image icon. Never use the online-store logo here.
 */
export const BRAND_LOGO_SRC = '/images/website/ayyappa-fireworks-logo.png';