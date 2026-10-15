import { isProductInCategory } from '../config/categories';

/**
 * Hero Products configuration helpers — Admin → Hero Products.
 *
 * Data model (extends the existing settings/homepageConfig document, the same
 * one Canvas owns — no second database):
 *
 *   heroProducts: {
 *     mode: 'random' | 'category' | 'custom',
 *     count: number (3–12),
 *     category: string,          // category value, mode 'category'
 *     groupId: string,           // heroProductGroups[].id, mode 'custom'
 *     onlyActive: boolean,       // exclude out-of-stock
 *     onlyWithImages: boolean,
 *     seed: number,              // deterministic random shuffle key
 *   }
 *
 *   heroProductGroups: [{ id, name, active, productIds: string[] }]
 *
 * The storefront runs the SAME resolution logic (client/src/lib/heroProducts.js)
 * against this document, so the preview here matches the live hero exactly.
 */

export const HERO_MODES = ['random', 'category', 'custom'];

export const DEFAULT_HERO_PRODUCTS = {
  mode: 'random',
  count: 8,
  category: '',
  groupId: '',
  onlyActive: true,
  onlyWithImages: true,
  seed: 20260101,
};

export const DEFAULT_HERO_PRODUCT_GROUPS = [];

export const HERO_COUNT_MIN = 3;
export const HERO_COUNT_MAX = 12;

const clampCount = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_HERO_PRODUCTS.count;
  return Math.min(HERO_COUNT_MAX, Math.max(HERO_COUNT_MIN, Math.round(v)));
};

export const normalizeHeroProducts = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const mode = HERO_MODES.includes(raw.mode) ? raw.mode : DEFAULT_HERO_PRODUCTS.mode;
  const seed = Number.isFinite(Number(raw.seed)) ? Number(raw.seed) : DEFAULT_HERO_PRODUCTS.seed;
  return {
    mode,
    count: clampCount(raw.count),
    category: typeof raw.category === 'string' ? raw.category : '',
    groupId: typeof raw.groupId === 'string' ? raw.groupId : '',
    onlyActive: raw.onlyActive !== false,
    onlyWithImages: raw.onlyWithImages !== false,
    seed,
  };
};

export const normalizeHeroProductGroups = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((g) => g && typeof g === 'object' && typeof g.id === 'string' && g.id)
    .map((g) => ({
      id: g.id,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : 'Untitled Group',
      active: g.active !== false,
      productIds: Array.isArray(g.productIds)
        ? g.productIds.filter((id) => typeof id === 'string' && id)
        : [],
    }));
};

export const newHeroGroupId = () =>
  `hg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* ---- deterministic random (identical to the storefront resolver) ---- */

const mulberry32 = (a) => {
  let t = a >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const seededShuffle = (arr, seed) => {
  const rand = mulberry32(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const byAdminOrder = (a, b) =>
  (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
  String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });

const rawImage = (p) =>
  String(p?.imageURL || p?.imageUrl || p?.image || '').trim();

const hasImage = (p) => rawImage(p).length > 0;

/** Mirrors client/src/lib/heroProducts.js resolveHeroProducts exactly. */
export const resolveHeroProducts = (products, rawConfig, rawGroups) => {
  const cfg = normalizeHeroProducts(rawConfig);
  const groups = normalizeHeroProductGroups(rawGroups);
  const catalogue = Array.isArray(products) ? products.filter(Boolean) : [];

  const eligible = catalogue.filter(
    (p) => (!cfg.onlyWithImages || hasImage(p)) && (!cfg.onlyActive || p.outOfStock !== true),
  );
  const pool = eligible.length > 0
    ? eligible
    : catalogue.filter((p) => (!cfg.onlyWithImages || hasImage(p)));

  if (pool.length === 0) return { list: [], mode: cfg.mode, label: '', fallback: false };

  if (cfg.mode === 'custom') {
    const group = groups.find((g) => g.id === cfg.groupId) || null;
    if (group && group.productIds.length > 0) {
      const byId = new Map(pool.map((p) => [String(p.id), p]));
      const list = group.productIds.map((id) => byId.get(String(id))).filter(Boolean);
      if (list.length > 0) return { list, mode: 'custom', label: group.name, fallback: false };
    }
    const fallbackList = seededShuffle(pool, cfg.seed).slice(0, cfg.count);
    return { list: fallbackList, mode: 'custom', label: 'Fallback selection', fallback: true };
  }

  if (cfg.mode === 'category') {
    if (cfg.category) {
      const inCategory = pool.filter((p) => isProductInCategory(p, cfg.category)).sort(byAdminOrder);
      if (inCategory.length > 0) {
        return { list: inCategory.slice(0, cfg.count), mode: 'category', label: cfg.category, fallback: false };
      }
    }
    const fallbackList = seededShuffle(pool, cfg.seed).slice(0, cfg.count);
    return { list: fallbackList, mode: 'category', label: 'Fallback selection', fallback: true };
  }

  return {
    list: seededShuffle(pool, cfg.seed).slice(0, cfg.count),
    mode: 'random',
    label: 'Random selection',
    fallback: false,
  };
};
