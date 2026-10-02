/* Counter billing lives in its own frontend (billing.crackershyderabad.com).
   Local development overrides this in .env.local; production falls back to
   the subdomain. */
export const BILLING_URL =
  (import.meta.env.VITE_BILLING_URL || '').trim() ||
  'https://billing.crackershyderabad.com';
