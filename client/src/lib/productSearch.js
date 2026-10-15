import { getProductBrandName } from './resolveBrand';

/**
 * Catalogue search ranking for the navbar autocomplete (and the ?q= results
 * filter on the Products page).
 *
 * Pure functions over the SAME product documents the Products page already
 * downloads (see cachedGetDocs 'products'). No network, no randomness, no
 * side effects — identical queries always return identical order.
 *
 * Matching is substring-based everywhere (never exact-only, never
 * startsWith-only), across name → brand → category → keywords/tags → SKU →
 * description, in that priority. Single characters ("2", "b") and pure
 * numbers ("40") are first-class queries — there is no minimum length.
 *
 * Performance: normalization runs ONCE per product via buildSearchIndex()
 * (WeakMap-cached per catalogue array identity), so keystrokes only scan
 * precomputed strings instead of re-normalizing every field every time.
 *
 * Relevance tiers (highest first, single-token queries):
 *   100  exact product name match
 *    90  standalone numeric token equals the query ("2" in "2 Sound Crackers"
 *         outranks the "2" prefixing "20 Shots" — both still match)
 *    85  name starts with the query
 *    75  a name word starts with the query
 *    65  name contains the query anywhere
 *    60  numeric query contained in the name
 *    55  brand exact / starts-with
 *    50  brand word-start / contains
 *    45  category word-start
 *    40  category contains
 *    35  keyword/tag word-start
 *    30  keyword/tag contains, SKU contains
 *    20  description contains (suppressed for 1-char queries — too noisy)
 * Multi-token queries ("12 shots"): every token must appear in the combined
 * haystack; scored 70/48/35 by best field (name / name+brand+category /
 * anywhere), so partial noise never outranks genuine matches.
 */

export const MIN_QUERY_LENGTH = 1;
export const SUGGESTION_LIMIT = 6;

/* Lowercase, trim, collapse spaces, strip diacritics, and turn every common
   separator into a space — WITHOUT gluing words together:
   "12-Shots (Music/Party)" → "12 shots music party".
   Apostrophes are dropped ("ayyan's" → "ayyans") so both spellings match,
   "&" becomes "and" so "Threads & Pencils" meets "Threads and Novelties". */
export const normalizeText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[‘’ʼ`']/g, '')
  .replace(/&/g, ' and ')
  .replace(/[\\/(){}[\]<>"+:;,.!?@#$%^*~=|_–—―-]+/g, ' ')
  /* Split letter↔digit boundaries so "12cm"/"100shots" meet "12 cm"/"100
     shots" without requiring the shopper to type the space. */
  .replace(/([a-z])(\d)/g, '$1 $2')
  .replace(/(\d)([a-z])/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeQuery = (value) => normalizeText(value);

const wordStartsWith = (text, q) =>
  text.split(/[^a-z0-9]+/).some((word) => word.length > 0 && word.startsWith(q));

const categoryText = (product) => {
  if (Array.isArray(product?.categories)) return product.categories.map((c) => String(c)).join(' ');
  return String(product?.category || '');
};

const keywordText = (product) => {
  const parts = [];
  const push = (v) => {
    if (Array.isArray(v)) parts.push(...v.map((x) => String(x)));
    else if (v !== null && v !== undefined && v !== '') parts.push(String(v));
  };
  push(product?.seo?.keywords);
  push(product?.seo?.tags);
  push(product?.keywords);
  push(product?.tags);
  return parts.join(' ');
};

const skuText = (product) => String(product?.sku || product?.id || '');

/**
 * Normalized searchable representation — built once per catalogue, scanned
 * on every keystroke. `lookup` is the shared brand lookup (buildBrandLookup)
 * so brandId-only products resolve to their managed brand name.
 */
export function buildSearchIndex(products, lookup = null) {
  if (!Array.isArray(products)) return [];
  return products.map((product) => {
    const name = normalizeText(product?.name);
    const brand = normalizeText(getProductBrandName(product, lookup));
    const category = normalizeText(categoryText(product));
    const keywords = normalizeText(keywordText(product));
    const sku = normalizeText(skuText(product));
    const description = normalizeText(product?.description);
    return {
      product,
      name,
      brand,
      category,
      keywords,
      sku,
      description,
      haystack: `${name} ${brand} ${category} ${keywords} ${sku}`,
    };
  });
}

/* One index per catalogue array identity — the catalogue reference is stable
   between keystrokes, so normalization never re-runs while typing. */
const indexCache = new WeakMap();
const lookupCache = new WeakMap();
function getIndex(products, lookup) {
  if (!Array.isArray(products)) return [];
  if (!lookup) {
    let entry = indexCache.get(products);
    if (!entry) {
      entry = buildSearchIndex(products, null);
      indexCache.set(products, entry);
    }
    return entry;
  }
  let byLookup = lookupCache.get(products);
  if (!byLookup) {
    byLookup = new WeakMap();
    lookupCache.set(products, byLookup);
  }
  let entry = byLookup.get(lookup);
  if (!entry) {
    entry = buildSearchIndex(products, lookup);
    byLookup.set(lookup, entry);
  }
  return entry;
}

const scoreSingleToken = (entry, q) => {
  const { name, brand, category, keywords, sku, description } = entry;
  if (!name) return 0;

  if (name === q) return 100;

  const isNumeric = /^\d+$/.test(q);
  /* Standalone number token ("2" in "2 sound crackers") outranks a digit
     that merely prefixes another number ("2" in "20 shots") — both match. */
  if (isNumeric && name.split(/[^a-z0-9]+/).some((token) => token === q)) return 90;
  if (name.startsWith(q)) return 85;
  if (wordStartsWith(name, q)) return 70;

  if (name.includes(q)) return isNumeric ? 60 : 65;

  if (brand) {
    if (brand === q || brand.startsWith(q)) return 55;
    if (wordStartsWith(brand, q) || brand.includes(q)) return 50;
  }
  if (category) {
    if (wordStartsWith(category, q)) return 45;
    if (category.includes(q)) return 40;
  }
  if (keywords) {
    if (wordStartsWith(keywords, q)) return 35;
    if (keywords.includes(q)) return 30;
  }
  /* IDs are long random strings — a single character would match most of
     them, so SKU matching needs at least 2 characters to stay meaningful. */
  if (q.length > 1 && sku && sku.includes(q)) return 30;

  /* Description is the weakest signal and is skipped for 1-char queries —
     nearly every description would match a single letter. */
  if (q.length > 1 && description && description.includes(q)) return 20;

  return 0;
};

const scoreMultiToken = (entry, tokens, q) => {
  const inHaystack = entry.haystack;
  if (!tokens.every((t) => inHaystack.includes(t))) return 0;
  if (tokens.every((t) => entry.name.includes(t))) {
    return entry.name.startsWith(q) ? 78 : 70;
  }
  const near = `${entry.name} ${entry.brand} ${entry.category}`;
  if (tokens.every((t) => near.includes(t))) return 48;
  return 35;
};

export const scoreIndexed = (entry, rawQuery) => {
  const q = normalizeText(rawQuery);
  if (!q || !entry) return 0;
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) return scoreMultiToken(entry, tokens, q);
  return scoreSingleToken(entry, q);
};

export const scoreProduct = (product, rawQuery, lookup = null) => {
  const q = normalizeText(rawQuery);
  if (!q || !product) return 0;
  const [entry] = buildSearchIndex([product], lookup);
  return scoreIndexed(entry, q);
};

/** True when the product matches the query under the same ranking rules. */
export const matchesQuery = (product, rawQuery, lookup = null) =>
  scoreProduct(product, rawQuery, lookup) > 0;

/**
 * Rank catalogue products for a query, best first. Ties break by admin
 * sortOrder then name so the order is stable between keystrokes.
 */
export const searchProducts = (products, rawQuery, limit = SUGGESTION_LIMIT, lookup = null) => {
  const q = normalizeText(rawQuery);
  if (!q || !Array.isArray(products)) return [];
  return getIndex(products, lookup)
    .map((entry) => ({ entry, score: scoreIndexed(entry, q) }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.entry.product.sortOrder ?? 9999) - (b.entry.product.sortOrder ?? 9999) ||
        String(a.entry.product.name || '').localeCompare(String(b.entry.product.name || ''))
    )
    .slice(0, limit)
    .map((item) => item.entry.product);
};

/**
 * Total number of catalogue matches (before the suggestion limit), so the
 * dropdown footer can read "View all N results" without a second data
 * source. Same scoring as searchProducts — counts agree by construction.
 */
export const countMatches = (products, rawQuery, lookup = null) => {
  const q = normalizeText(rawQuery);
  if (!q || !Array.isArray(products)) return 0;
  let total = 0;
  for (const entry of getIndex(products, lookup)) {
    if (scoreIndexed(entry, q) > 0) total += 1;
  }
  return total;
};
