/**
 * Permanent vs local-only image URLs.
 *
 * The API falls back to server disk when Firebase Storage is unreachable and
 * returns a same-server URL for it. Such URLs render on the machine that
 * uploaded them but are dead everywhere else, so they must never be persisted
 * as production content (homepage banners, product images, logos).
 */

/** Permanent KVM base — these are real public URLs even though they are cross-origin. */
const KVM_BASES = [
  'https://crackershyderabad.com/uploads/',
  'https://www.crackershyderabad.com/uploads/',
];

/** True when the URL can only ever load on the uploading machine/server. */
export function isLocalOnlyUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // KVM HTTPS URLs are permanent production media — never local-only.
  for (const base of KVM_BASES) {
    if (trimmed.startsWith(base)) return false;
  }
  // blob: previews and data: URIs are never persistent storage.
  if (/^(blob|data):/i.test(trimmed)) return true;
  // Static frontend assets (/images/, /product_icons/, etc.) are permanent.
  if (
    trimmed.startsWith('/images/') ||
    trimmed.startsWith('/product_icons/') ||
    trimmed.startsWith('/favicon') ||
    trimmed.startsWith('/.well-known/')
  ) return false;
  // Root-relative server paths (/api/images/...) live on that server's disk.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    // Bare filenames / relative paths resolve against the current origin only.
    if (/^[a-z0-9._-]+\.[a-z0-9]+$/i.test(trimmed) || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
    return false;
  }
}
