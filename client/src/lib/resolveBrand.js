/**
 * Single brand-resolution approach for the storefront.
 *
 * Firestore products store the brand primarily as a string
 * (`brand: formData.brand || null` in Admin), while some records carry a
 * `brandId` or a legacy `brand` object. The `brands` collection holds the
 * canonical documents ({ id, name, logo, ... }). This module resolves every
 * shape to one consistent form — `{ id, name, logo }` or `null` — without
 * touching any Firestore document.
 *
 * Resolution priority:
 *   1. product.brand already an object with name/logo → preserved as-is.
 *   2. product.brandId → matching brands document by ID.
 *   3. product.brand string → match against brands.name (exact, then
 *      case-insensitive).
 *   4. Non-empty brand string with no match → { name, logo: null } so the
 *      name still displays and no broken logo renders.
 *   5. Missing brand → null. Never throws.
 *
 * Fetch the brands collection ONCE per listing flow, build a lookup with
 * buildBrandLookup(), then resolve every product from that map — never one
 * read per card.
 */

const cleanString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/* Display-name normalization shared by the storefront brand filter: trims
   and collapses inner whitespace so "Standard  Fireworks" still matches. */
export function normalizeBrandName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

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
    const name = cleanString(b.name);
    if (name) {
      if (!byName.has(name)) byName.set(name, b);
      const lower = name.toLowerCase();
      if (!byName.has(lower)) byName.set(lower, b);
    }
  }
  return { byId, byName };
}

function shapeBrandDoc(doc, fallbackName) {
  if (!doc || typeof doc !== 'object') return null;
  const name = cleanString(doc.name) || cleanString(fallbackName);
  const logo = cleanString(doc.logo);
  const slug = cleanString(doc.slug);
  if (!name && !logo) return null;
  return {
    id: doc.id !== null && doc.id !== undefined && doc.id !== '' ? String(doc.id) : null,
    name,
    logo,
    slug,
  };
}

export function resolveBrand(product, lookup) {
  if (!product || typeof product !== 'object') return null;
  const raw = product.brand;
  const brandId = product.brandId;

  // 1. Already an object with usable fields — preserve it.
  if (raw && typeof raw === 'object') {
    const shaped = shapeBrandDoc(raw, null);
    if (shaped) return shaped;
  }

  // 2. brandId → brands document by ID.
  if (brandId !== null && brandId !== undefined && brandId !== '' && lookup && lookup.byId) {
    const shaped = shapeBrandDoc(
      lookup.byId.get(String(brandId)),
      typeof raw === 'string' ? raw : null
    );
    if (shaped) return shaped;
  }

  // 3. Brand string → match brands.name; 4. unmatched name stays displayable.
  if (typeof raw === 'string' && raw.trim()) {
    const name = raw.trim();
    if (lookup && lookup.byName) {
      const doc = lookup.byName.get(name) || lookup.byName.get(name.toLowerCase());
      if (doc) {
        const shaped = shapeBrandDoc(doc, name);
        if (shaped) return shaped;
      }
    }
    return { id: null, name, logo: null };
  }

  return null;
}

/* Normalize a product list for ProductCard: every product with brand data
   gets a consistent { id, name, logo } brand; the rest pass through
   untouched. Pure — always returns a new array, never mutates inputs. */
export function withResolvedBrands(products, lookup) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const resolved = resolveBrand(p, lookup);
    if (!resolved) return p;
    if (p.brand === resolved) return p;
    return { ...p, brand: resolved };
  });
}

/* Defensive display read for components: safe for brand object, brand
   string, null or undefined — never throws, never assumes .logo exists. */
export function getBrandDisplay(product) {
  const resolved = resolveBrand(product, null);
  if (!resolved) return null;
  if (!resolved.name && !resolved.logo) return null;
  return resolved;
}

/* Brand slug for shareable URLs: stored slug first, derived fallback so
   legacy records without a slug still produce a stable link. */
export function brandSlugOf(brand) {
  if (!brand || typeof brand !== 'object') return null;
  const stored = cleanString(brand.slug);
  if (stored) return stored;
  const name = normalizeBrandName(brand.name);
  if (!name) return null;
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || null;
}

/**
 * Resolve a `?brand=` URL value to a managed brand document. Accepts a slug,
 * a document id or a display name (any casing) so old links keep working.
 * Inactive brands never resolve on the storefront.
 */
export function resolveBrandParam(brandsList, param) {
  const raw = normalizeBrandName(param);
  if (!raw) return null;
  const list = Array.isArray(brandsList) ? brandsList : [];
  const active = list.filter((b) => b && typeof b === 'object' && b.active !== false);
  const lower = raw.toLowerCase();
  return (
    active.find((b) => brandSlugOf(b) === lower) ||
    active.find((b) => String(b.id || '').toLowerCase() === lower) ||
    active.find((b) => normalizeBrandName(b.name).toLowerCase() === lower) ||
    null
  );
}

/** Stable brand id carried by a product (string, object or legacy shapes). */
export function getProductBrandId(product) {
  if (!product || typeof product !== 'object') return null;
  const { brandId, brand } = product;
  if (brandId !== null && brandId !== undefined && String(brandId).trim() !== '') {
    return String(brandId);
  }
  if (brand && typeof brand === 'object' && brand.id !== null && brand.id !== undefined && String(brand.id).trim() !== '') {
    return String(brand.id);
  }
  return null;
}

/** Display name for a product's brand: managed doc first, legacy text fallback. */
export function getProductBrandName(product, lookup = null) {
  if (!product || typeof product !== 'object') return null;
  const brandId = getProductBrandId(product);
  if (brandId && lookup && lookup.byId) {
    const doc = lookup.byId.get(String(brandId));
    const name = doc ? normalizeBrandName(doc.name) : '';
    if (name) return name;
  }
  const raw = product.brand;
  if (raw && typeof raw === 'object') return normalizeBrandName(raw.name) || null;
  return normalizeBrandName(raw) || null;
}

/**
 * True when the product belongs to the brand — by stable id first, then by
 * legacy name match for documents written before brandId existed. Products
 * carrying a different brandId never match on name alone.
 */
export function productMatchesBrand(product, brand, lookup = null) {
  if (!product || !brand) return false;
  const productBrandId = getProductBrandId(product);
  if (productBrandId) return productBrandId === String(brand.id);
  const name = lookup ? getProductBrandName(product, lookup) : getProductBrandName(product, null);
  return !!name && name.toLowerCase() === normalizeBrandName(brand.name).toLowerCase();
}
