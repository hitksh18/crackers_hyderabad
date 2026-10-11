/**
 * Production image-URL normalization (read-only, idempotent).
 *
 * Root cause it addresses: some Firestore product/brand/banner documents
 * carry `http://localhost:3001/uploads/...` (or other machine-only) URLs
 * because they were saved while the API's public base pointed at a local
 * address. Those URLs render on the uploader's machine but are blank
 * everywhere else — and `http:` variants are additionally blocked as
 * mixed content on the HTTPS production site.
 *
 * Rules (no network, no rewrites of stored data):
 * - valid https URLs (incl. Firebase Storage) → returned unchanged.
 * - http://crackershyderabad.com[/www] → upgraded to https (mixed-content fix).
 * - loopback/LAN hosts (localhost, 127.0.0.1, ::1, *.local, RFC 1918) whose
 *   path contains /uploads/... → re-based to the production uploads origin,
 *   preserving the path, so KVM-stored files resolve publicly. Files that
 *   were only ever on a dev machine still 404 — correctly surfaced by the
 *   existing onError placeholders rather than a blank guess.
 * - root-relative app assets (/images/...) → unchanged.
 * - blob:/data:/empty/unparseable → null (callers render placeholders).
 * - the retired /api/images/... shape is left untouched (the API answers
 *   410 for it by design so it fails loudly, not silently).
 */

const PROD_UPLOADS_BASE = 'https://crackershyderabad.com/uploads';

const LOOPBACK_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local|.*\.localhost|192\.168\..*|10\..*|172\.(1[6-9]|2\d|3[01])\..*)$/i;

export function normalizeImageUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || /^(blob|data):/i.test(trimmed)) return null;

  const absolute = trimmed.match(/^([a-z][a-z0-9+.-]*:)?\/\/([^/?#]+)([^?#]*)?/i);
  if (absolute) {
    const scheme = (absolute[1] || '').toLowerCase();
    const host = (absolute[2] || '').toLowerCase().split(':')[0];
    const path = absolute[3] || '/';
    if (LOOPBACK_RE.test(host)) {
      const up = path.indexOf('/uploads/');
      if (up < 0) return null;
      return PROD_UPLOADS_BASE + path.slice(up + '/uploads'.length);
    }
    if (
      scheme === 'http:' &&
      (host === 'crackershyderabad.com' || host === 'www.crackershyderabad.com')
    ) {
      return 'https://' + trimmed.slice('http://'.length);
    }
    return trimmed;
  }

  // Root-relative same-origin path (app assets, /uploads/... proxied).
  if (trimmed.startsWith('/')) return trimmed;
  return null;
}

/* Dev-only broken-image logging: never leaks internals to customers. */
export function logBrokenImageUrl(url) {
  try {
    if (import.meta.env.DEV) {
      console.debug('[img] failed to load:', typeof url === 'string' ? url.slice(0, 160) : url);
    }
  } catch {
    /* ignore */
  }
}
