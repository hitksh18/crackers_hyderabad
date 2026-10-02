'use strict';

/**
 * Shared security helpers for the admin API.
 *
 * Kept dependency-free on purpose: this server runs in constrained hosting and
 * every one of these is small enough not to warrant a package.
 */

/* The staff set is admin + sales only. The role vocabulary is exactly these
   two plus 'customer'; legacy values (billing/packer/mod) must never grant
   access — authenticate() normalises them to 'customer' before any check. */
const STAFF_ROLES = ['admin', 'sales'];
const VALID_ROLES = ['admin', 'sales', 'customer'];

/**
 * Validate a caller-supplied role against the vocabulary.
 * Returns the canonical (lowercase) role, or null when it is not one of
 * admin | sales | customer — callers must reject null, never fall back.
 */
const canonicalRole = (value) => {
  const role = String(value ?? '').trim().toLowerCase();
  return VALID_ROLES.includes(role) ? role : null;
};

/**
 * Resolve a stored role document value to the canonical vocabulary.
 * Legacy mod/billing/packer values, case variants and blanks all resolve to
 * 'customer', so one bad document cannot create inconsistent authorisation
 * between the API and the frontends.
 */
const normalizeRole = (value) => canonicalRole(value) || 'customer';

/**
 * Escape a value for interpolation into HTML.
 *
 * Order data is attacker-supplied — guest checkout accepts any name, address or
 * product label — and it gets rendered into an email that goes out from the
 * shop's own address. Without this, a crafted order turns those emails into a
 * phishing vehicle carrying the shop's legitimate From header.
 */
const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/** Strip anything that could break out of a single-line SMS body. */
const sanitiseSmsText = (value, maxLength = 60) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);

/**
 * Fixed-window in-memory rate limiter, keyed by client IP.
 *
 * Single-process only, which matches this deployment. Behind several instances
 * this becomes per-instance rather than global — move to a shared store if the
 * API is ever scaled out.
 */
const createRateLimiter = ({ windowMs, max, name }) => {
  const hits = new Map();

  // Bound memory: drop expired buckets periodically rather than on every call.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      console.warn(`[rate-limit] ${name} blocked ${key} (${entry.count} hits)`);
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    return next();
  };
};

/**
 * Conservative security headers. The API serves JSON and uploaded images only,
 * so it can afford to deny almost everything.
 */
const securityHeaders = (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // HSTS is enforced at the Nginx TLS layer in production; sending it here too
  // is harmless on plain HTTP (browsers ignore it) and protects direct-:3001 hits.
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  res.removeHeader('X-Powered-By');
  next();
};

module.exports = {
  STAFF_ROLES,
  VALID_ROLES,
  canonicalRole,
  normalizeRole,
  escapeHtml,
  sanitiseSmsText,
  createRateLimiter,
  securityHeaders,
};
