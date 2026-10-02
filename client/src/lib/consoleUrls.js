/* Staff consoles live on their own subdomains, not inside the storefront.
   Local development overrides these in client/.env.local (the local Vite dev
   servers on :5001 / :5002); production falls back to the subdomains. */
const trim = (value) => (value || '').trim().replace(/\/+$/, '');

export const ADMIN_URL =
  trim(import.meta.env.VITE_ADMIN_URL) || 'https://admin.crackershyderabad.com';

export const BILLING_URL =
  trim(import.meta.env.VITE_BILLING_URL) || 'https://billing.crackershyderabad.com';
