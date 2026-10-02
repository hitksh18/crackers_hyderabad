import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Turn a product title into a URL slug.
 *
 * "12 SHOTS- ALL VARIETY 1 BOX" -> "12-shots-all-variety-1-box"
 */
export const slugify = (title) => {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || 'product';
};

/**
 * Canonical storefront path for a product.
 *
 * Uses the stored slug when present, otherwise derives one from the title so
 * links stay correct even for legacy documents.
 */
export const productPath = (product) => {
  if (!product) return '/product/';
  const slug = product.slug || slugify(product.name);
  return `/product/${slug || product.id}`;
};

/**
 * Reserve a unique slug against the live `products` collection.
 *
 * Appends -2, -3, ... when the base slug is already taken by another product.
 * Callers must pass their own doc id (or null) as `excludeId` when re-saving.
 */
export const ensureUniqueSlug = async (baseSlug, excludeId) => {
  const clean = slugify(baseSlug);
  let candidate = clean;
  let suffix = 2;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snap = await getDocs(query(collection(db, 'products'), where('slug', '==', candidate)));
    const taken = snap.docs.some((d) => d.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${clean}-${suffix}`;
    suffix += 1;
  }
  throw new Error('Could not find a free product slug');
};