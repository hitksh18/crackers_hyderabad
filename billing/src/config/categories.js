/**
 * SINGLE SOURCE OF TRUTH for product categories.
 *
 * This is the ONLY place category names, order, slugs and aliases may be
 * defined. Every screen that needs categories MUST import from here instead
 * of maintaining its own hardcoded array:
 *
 *   admin:  ProductForm (Add/Edit Product), Products (All Products),
 *           PriceList, Categories page (via homeData categoryDefs)
 *   client: Products catalogue pills, CategoryShowcase/Footer (via homeData)
 *   billing: ProductPickerPanel
 *
 * Canonical set/order: matches the storefront `categoryDefs` (homepage
 * CategoryShowcase + admin Categories page) — Sparkles first, Gift Boxes
 * last. Do NOT re-sort alphabetically and do NOT invent a new order.
 *
 * Each entry:
 *   name    — display label used across the UI (storefront + admin).
 *   value   — canonical string persisted on product documents
 *             (`categories[]` / legacy `category`). For 11 of 12 categories
 *             this equals `name`; "Threads & Pencils" is displayed while
 *             "Threads and Novelties" is stored (the value the Categories
 *             page and all existing product documents already use).
 *   slug    — stable icon/filter key (CategoryIconPack, footer shortlist).
 *   aliases — every stored string that means this category, used for
 *             matching so legacy documents keep working.
 *
 * The three app copies (admin/client/billing) MUST stay identical — the
 * apps are separate Vite builds with no shared package, so the file is
 * mirrored. If you change one copy, change all three.
 */

export const PRODUCT_CATEGORIES = [
  { name: 'Sparkles', value: 'Sparkles', slug: 'sparkles', aliases: ['Sparkles'] },
  { name: 'Ground Chakkars', value: 'Ground Chakkars', slug: 'ground-chakkars', aliases: ['Ground Chakkars'] },
  { name: 'Flower Pots', value: 'Flower Pots', slug: 'flower-pots', aliases: ['Flower Pots'] },
  { name: 'Bombs', value: 'Bombs', slug: 'bombs', aliases: ['Bombs'] },
  { name: 'Garlands', value: 'Garlands', slug: 'garlands', aliases: ['Garlands'] },
  { name: 'Rockets', value: 'Rockets', slug: 'rockets', aliases: ['Rockets'] },
  { name: 'Sky Shots', value: 'Sky Shots', slug: 'fancy', aliases: ['Sky Shots'] },
  { name: 'Guns, Rolls & Pop Pop', value: 'Guns, Rolls & Pop Pop', slug: 'guns-rolls-pop-pop', aliases: ['Guns, Rolls & Pop Pop'] },
  {
    name: 'Threads & Pencils',
    value: 'Threads and Novelties',
    slug: 'threads-novelties',
    aliases: ['Threads and Novelties', 'Threads & Pencils'],
  },
  { name: 'Fancy Fireworks', value: 'Fancy Fireworks', slug: 'fancy-fireworks', aliases: ['Fancy Fireworks'] },
  { name: 'Kids Special', value: 'Kids Special', slug: 'kids', aliases: ['Kids Special'] },
  { name: 'Gift Boxes', value: 'Gift Boxes', slug: 'gift-boxes', aliases: ['Gift Boxes'] },
];

/** Display labels in canonical order. */
export const CATEGORY_NAMES = PRODUCT_CATEGORIES.map((c) => c.name);

/** Canonical stored values in canonical order. */
export const CATEGORY_VALUES = PRODUCT_CATEGORIES.map((c) => c.value);

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Resolve any category string (display name, stored value or legacy alias,
 * any casing) to its canonical entry. Returns null when unknown.
 */
export const resolveCategory = (input) => {
  const key = norm(input);
  if (!key) return null;
  return (
    PRODUCT_CATEGORIES.find(
      (c) => norm(c.name) === key || norm(c.value) === key || c.aliases.some((a) => norm(a) === key),
    ) || null
  );
};

/** True when the raw stored string belongs to the given entry (alias-aware). */
export const entryMatchesValue = (entry, stored) => {
  if (!entry) return false;
  const key = norm(stored);
  return entry.aliases.some((a) => norm(a) === key);
};

/** All category values stored on a product (array form first, legacy second). */
export const productCategoryValues = (product) => {
  if (!product) return [];
  if (Array.isArray(product.categories)) return product.categories.filter((c) => c != null && String(c).trim() !== '');
  if (product.category != null && String(product.category).trim() !== '') return [product.category];
  return [];
};

/**
 * Alias-aware membership test. Replaces every ad-hoc
 * `p.categories.includes(x)` / `p.category === x` check so legacy documents
 * (e.g. stored "Threads & Pencils") keep matching the canonical category.
 */
export const isProductInCategory = (product, input) => {
  const entry = typeof input === 'object' && input !== null ? input : resolveCategory(input);
  if (!entry) return false;
  return productCategoryValues(product).some((stored) => entryMatchesValue(entry, stored));
};

/** Display label for a stored category string (unknown strings pass through). */
export const categoryDisplayName = (stored) => resolveCategory(stored)?.name || String(stored || '');

/**
 * Toggle a category in a `categories[]` selection array.
 *
 * Accepts the canonical entry (or any alias string). Adds the canonical
 * stored value when absent; removes EVERY alias spelling when present, so a
 * legacy "Threads & Pencils" can never linger next to "Threads and
 * Novelties". Always returns a new array.
 */
export const toggleCategoryValue = (selected, entryOrValue) => {
  const entry = typeof entryOrValue === 'object' && entryOrValue !== null ? entryOrValue : resolveCategory(entryOrValue);
  const list = Array.isArray(selected) ? selected : [];
  if (!entry) {
    const key = String(entryOrValue || '');
    return list.includes(key) ? list.filter((c) => c !== key) : [...list, key];
  }
  const has = list.some((stored) => entryMatchesValue(entry, stored));
  if (has) return list.filter((stored) => !entryMatchesValue(entry, stored));
  return [...list, entry.value];
};

/**
 * Homepage `categoryDefs` shape ({ name, slug, match, link }) derived from
 * the canonical entries — so homeData, the showcase, footer and admin
 * Categories page share the same definitions without a second list.
 */
export const toCategoryDefs = () =>
  PRODUCT_CATEGORIES.map((c) => ({
    name: c.name,
    slug: c.slug,
    match: [...c.aliases],
    link: c.value,
  }));
