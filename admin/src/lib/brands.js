import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Brand helpers — single source of truth for the Brand ↔ Product relationship
 * in the admin console.
 *
 * Data model (Firestore):
 *   brands/{brandId}: { name, slug, logo, description, active, createdAt, updatedAt }
 *   products/{productId}: { ..., brandId: "<brandId>" | null, brand: "<name>" | null }
 *
 * `brandId` is the source of truth. `brand` (the plain-text name) is kept as
 * a denormalized display fallback so legacy documents — written before the
 * managed brand system existed — keep rendering without a destructive
 * migration. Membership therefore matches EITHER the id OR (when the product
 * carries no brandId) the normalized legacy name.
 *
 * Pure helpers below never touch Firestore; the two async slug helpers are
 * the only Firestore readers, mirroring lib/productLinks.js.
 */

export const normalizeBrandName = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
};

const normalizeKey = (value) => normalizeBrandName(value).toLowerCase();

/** URL slug for a brand name: "Standard Fireworks" -> "standard-fireworks". */
export const brandSlugify = (name) => {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || 'brand';
};

/**
 * Find a duplicate brand name (case/whitespace-insensitive) excluding an
 * optional id — so "Standard Fireworks", "standard fireworks" and
 * "STANDARD FIREWORKS" can never become three records.
 */
export const findDuplicateBrand = (brands, name, excludeId = null) => {
  const key = normalizeKey(name);
  if (!key) return null;
  return (
    (Array.isArray(brands) ? brands : []).find(
      (b) => b && b.id !== excludeId && normalizeKey(b.name) === key,
    ) || null
  );
};

/** Reserve a unique brand slug against the live `brands` collection. */
export const ensureUniqueBrandSlug = async (baseSlug, excludeId = null) => {
  const clean = brandSlugify(baseSlug);
  let candidate = clean;
  let suffix = 2;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snap = await getDocs(query(collection(db, 'brands'), where('slug', '==', candidate)));
    const taken = snap.docs.some((d) => d.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${clean}-${suffix}`;
    suffix += 1;
  }
  throw new Error('Could not find a free brand slug');
};

/**
 * One lookup per page load — build once from the cached brands list, then
 * resolve every product from the maps (never one read per row/card).
 */
export function buildBrandLookup(brandsList) {
  const byId = new Map();
  const byName = new Map();
  const list = Array.isArray(brandsList) ? brandsList : [];
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    if (b.id !== null && b.id !== undefined && b.id !== '') {
      const key = String(b.id);
      if (!byId.has(key)) byId.set(key, b);
    }
    const name = normalizeBrandName(b.name);
    if (name) {
      if (!byName.has(name)) byName.set(name, b);
      const lower = name.toLowerCase();
      if (!byName.has(lower)) byName.set(lower, b);
    }
  }
  return { byId, byName };
}

/** Raw brand id carried by a product (string, object or legacy shapes). */
export const getProductBrandId = (product) => {
  if (!product || typeof product !== 'object') return null;
  const { brandId, brand } = product;
  if (brandId !== null && brandId !== undefined && String(brandId).trim() !== '') {
    return String(brandId);
  }
  if (brand && typeof brand === 'object' && brand.id !== null && brand.id !== undefined && String(brand.id).trim() !== '') {
    return String(brand.id);
  }
  return null;
};

/** Display name for a product's brand: managed doc first, legacy text fallback. */
export const getProductBrandName = (product, lookup = null) => {
  if (!product || typeof product !== 'object') return null;
  const brandId = getProductBrandId(product);
  if (brandId && lookup && lookup.byId) {
    const doc = lookup.byId.get(String(brandId));
    const name = doc ? normalizeBrandName(doc.name) : '';
    if (name) return name;
  }
  const raw = product.brand;
  if (raw && typeof raw === 'object') {
    return normalizeBrandName(raw.name) || null;
  }
  return normalizeBrandName(raw) || null;
};

/** Resolve a product's brand to its managed document (null when unmapped). */
export const resolveProductBrand = (product, lookup) => {
  if (!product || typeof product !== 'object' || !lookup) return null;
  const brandId = getProductBrandId(product);
  if (brandId && lookup.byId) {
    const doc = lookup.byId.get(String(brandId));
    if (doc) return doc;
  }
  const name = getProductBrandName(product, null);
  if (name && lookup.byName) {
    return lookup.byName.get(name) || lookup.byName.get(name.toLowerCase()) || null;
  }
  return null;
};

/**
 * True when the product belongs to the brand — by stable id first, then by
 * legacy name match for documents written before brandId existed. Products
 * that carry a DIFFERENT brandId never match on name alone.
 */
export const productBelongsToBrand = (product, brand, lookup = null) => {
  if (!product || !brand) return false;
  const productBrandId = getProductBrandId(product);
  if (productBrandId) return productBrandId === String(brand.id);
  const brandName = lookup ? getProductBrandName(product, lookup) : getProductBrandName(product, null);
  return !!brandName && normalizeKey(brandName) === normalizeKey(brand.name);
};

/** All products belonging to a brand (stable order: caller's list order). */
export const productsForBrand = (products, brand, lookup = null) =>
  (Array.isArray(products) ? products : []).filter((p) => productBelongsToBrand(p, brand, lookup));

/** Product counts per brand id — one pass, derived from cached metadata. */
export const countProductsByBrand = (products, brands, lookup = null) => {
  const counts = new Map();
  const list = Array.isArray(products) ? products : [];
  const brandList = Array.isArray(brands) ? brands : [];
  for (const b of brandList) {
    if (b && b.id !== undefined) counts.set(String(b.id), 0);
  }
  for (const p of list) {
    const brandId = getProductBrandId(p);
    if (brandId && counts.has(brandId)) {
      counts.set(brandId, counts.get(brandId) + 1);
      continue;
    }
    if (!brandId) {
      const name = lookup ? getProductBrandName(p, lookup) : getProductBrandName(p, null);
      if (name) {
        const match = lookup && lookup.byName
          ? lookup.byName.get(name) || lookup.byName.get(name.toLowerCase())
          : brandList.find((b) => normalizeKey(b && b.name) === normalizeKey(name));
        if (match) counts.set(String(match.id), (counts.get(String(match.id)) || 0) + 1);
      }
    }
  }
  return counts;
};

/**
 * Legacy brand strings on products that match NO managed brand — the
 * admin-triggered migration backlog. Returns [{ name, count }] sorted by
 * count desc. Never mutates anything; mapping happens explicitly through the
 * Brands page or the product form.
 */
export const unmappedBrandNames = (products, brands, lookup = null) => {
  const byKey = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    if (getProductBrandId(p)) continue;
    const name = lookup ? getProductBrandName(p, lookup) : getProductBrandName(p, null);
    if (!name) continue;
    const key = normalizeKey(name);
    const known = lookup && lookup.byName
      ? lookup.byName.get(name) || lookup.byName.get(name.toLowerCase())
      : (Array.isArray(brands) ? brands : []).find((b) => normalizeKey(b && b.name) === key);
    if (known) continue;
    const entry = byKey.get(key);
    if (entry) entry.count += 1;
    else byKey.set(key, { name, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** Fallback initials avatar text when a brand has no logo. */
export const brandInitials = (name) => {
  const clean = normalizeBrandName(name);
  if (!clean) return '•';
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};
