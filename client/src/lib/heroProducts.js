import { normalizeImageUrl } from './normalizeImageUrl';
import { isProductInCategory } from '../config/categories';

/**
 * Hero product selection — resolves the admin's Hero Products configuration
 * (settings/homepageConfig.heroProducts + heroProductGroups) into the stable
 * list of products the existing Hero animation cycles through.
 *
 * Pure functions over the SAME cached catalogue the homepage already
 * downloads. Random mode is DETERMINISTIC: the admin-saved `seed` drives a
 * seeded shuffle, so the set (and its order) is identical on every render,
 * reload and session — it only changes when the admin saves a new seed
 * ("Shuffle Products" in Admin → Hero Products).
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

/** Defensive normalisation — a malformed saved config can never blank the hero. */
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

/* ---- deterministic random ---- */

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

const hasImage = (p) => !!(normalizeImageUrl(p?.imageURL) || normalizeImageUrl(p?.imageURL2));

/**
 * Resolve the hero product list.
 *
 * @returns { list, mode, label, fallback }
 *   list     — ordered products for the Hero animation (never empty unless
 *              the whole catalogue is empty)
 *   label    — human label for the active source (group name / category /
 *              "Random selection")
 *   fallback — true when the configured source produced nothing and the
 *              eligible-catalogue fallback is being used
 */
export const resolveHeroProducts = (products, rawConfig, rawGroups) => {
  const cfg = normalizeHeroProducts(rawConfig);
  const groups = normalizeHeroProductGroups(rawGroups);
  const catalogue = Array.isArray(products) ? products.filter(Boolean) : [];

  const eligible = catalogue.filter(
    (p) => (!cfg.onlyWithImages || hasImage(p)) && (!cfg.onlyActive || p.outOfStock !== true),
  );
  /* Never strand the hero: relax flags rather than render nothing. */
  const pool = eligible.length > 0
    ? eligible
    : catalogue.filter((p) => (!cfg.onlyWithImages || hasImage(p)));

  const empty = { list: [], mode: cfg.mode, label: '', fallback: false };

  if (pool.length === 0) return empty;

  if (cfg.mode === 'custom') {
    const group = groups.find((g) => g.id === cfg.groupId) || null;
    if (group && group.productIds.length > 0) {
      const byId = new Map(pool.map((p) => [String(p.id), p]));
      const list = group.productIds.map((id) => byId.get(String(id))).filter(Boolean);
      if (list.length > 0) {
        return { list, mode: 'custom', label: group.name, fallback: false };
      }
    }
    /* Group deleted/empty/products gone → graceful fallback set. */
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

  /* Random — stable, seed-driven, identical across renders/sessions. */
  return {
    list: seededShuffle(pool, cfg.seed).slice(0, cfg.count),
    mode: 'random',
    label: 'Random selection',
    fallback: false,
  };
};
