import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeImageUrl } from './normalizeImageUrl';

/**
 * Bounded product-thumbnail lookup for the order screens.
 *
 * Order item snapshots carry names and prices but no images, so the pages
 * resolve ONLY the referenced product ids — chunked `documentId() in [...]`
 * reads (10 per query, the Firestore limit), never the whole catalogue. A
 * module-level cache means the My Orders list and the order details page
 * share one read per product for the whole session.
 */
const cache = new Map(); // productId -> url | null

export async function fetchOrderThumbnails(ids) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  const missing = unique.filter((id) => !cache.has(id));
  const CHUNK = 10;

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const snap = await getDocs(
        query(collection(db, 'products'), where(documentId(), 'in', chunk)),
      );
      const found = new Set();
      snap.forEach((d) => {
        const data = d.data() || {};
        const url = normalizeImageUrl(data.imageURL) || normalizeImageUrl(data.imageURL2) || null;
        cache.set(d.id, url);
        found.add(d.id);
      });
      chunk.forEach((id) => {
        if (!found.has(id)) cache.set(id, null);
      });
    } catch (error) {
      console.error('[thumbs] product read failed:', error?.message || error);
      chunk.forEach((id) => cache.set(id, null));
    }
  }

  const out = {};
  unique.forEach((id) => {
    out[id] = cache.get(id) ?? null;
  });
  return out;
}
