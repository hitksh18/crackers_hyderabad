import { getDoc, getDocs } from 'firebase/firestore';

/**
 * Tiny read-through cache for Firestore documents and collections.
 *
 * Why this exists: Dashboard and Canvas both read the same collections
 * (products, orders, promotionalBanners, festiveDeals) plus a handful of
 * settings docs on every mount. Without a cache, each Dashboard ↔ Canvas
 * round-trip re-downloads all of them. This keeps reads cheap across
 * navigation without any new state architecture.
 *
 * Rules:
 * - Reads only. Writes always go straight to Firestore.
 * - Short TTL (60s docs/collections, 30s orders) — worst case is briefly
 *   stale stats, never lost writes.
 * - Writers invalidate: Canvas save and order reset clear the keys they
 *   affect, so the next mount re-reads fresh data.
 */

const DEFAULT_TTL_MS = 60_000;
const ORDERS_TTL_MS = 30_000;

const cache = new Map();
/* In-flight promises keyed identically: simultaneous callers (StrictMode
   double-effects, two widgets mounting together) share one request. */
const inflight = new Map();

const isFresh = (entry, ttl) => entry && Date.now() - entry.at < ttl;

const snapshotDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function deduped(key, ttl, read) {
  const hit = cache.get(key);
  if (isFresh(hit, ttl)) return Promise.resolve(hit.data);
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing;
  const job = read().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  }).finally(() => {
    if (inflight.get(key) === job) inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export function cachedGetDoc(ref, { ttl = DEFAULT_TTL_MS } = {}) {
  return deduped(`doc:${ref.path}`, ttl, () =>
    getDoc(ref).then((snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null))
  );
}

export function cachedGetDocs(refOrQuery, cacheKey, { ttl = DEFAULT_TTL_MS } = {}) {
  return deduped(`coll:${cacheKey}`, ttl, () => getDocs(refOrQuery).then(snapshotDocs));
}

export const ordersCacheTtl = ORDERS_TTL_MS;

/** Drop every key starting with `prefix` (e.g. 'coll:products'). Omit to clear all. */
export function invalidateCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
