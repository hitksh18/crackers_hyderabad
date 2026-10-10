import { getDoc, getDocs } from 'firebase/firestore';

/**
 * Tiny read-through cache for Firestore documents and collections.
 *
 * Why: Home, /products, ProductDetail and Cart revalidation each ran a full
 * `getDocs(products)` plus 4-6 identical settings-doc reads on every mount.
 * This dedupes simultaneous callers (StrictMode double-effects, widgets
 * mounting together) and reuses warm data for 60s — no new state library,
 * reads only, writes always go straight to Firestore.
 */

const DEFAULT_TTL_MS = 60_000;

const cache = new Map();
const inflight = new Map();

const isFresh = (entry, ttl) => entry && Date.now() - entry.at < ttl;
const snapshotDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

function deduped(key, ttl, read) {
  const hit = cache.get(key);
  if (isFresh(hit, ttl)) return Promise.resolve(hit.data);
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing;
  const job = read()
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
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

export function invalidateCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
