import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Canonical category ordering — the SINGLE source of truth shared by Home
 * and /products (and the Admin Canvas editor that writes it).
 *
 * Firestore `settings/categoryShowcase`:
 *   { hidden: string[], order: string[], updatedAt, updatedBy }
 * Both arrays hold stable category SLUGS (never display names), so a rename
 * can never desync the order. Canvas backfills unknown slugs and persists
 * the full array on save.
 *
 * Base entries come from config/categories.js (via homeData categoryDefs on
 * Home, PRODUCT_CATEGORIES on /products). This module only filters + sorts;
 * it never defines categories.
 */

/** Read the showcase config; null when missing/unreadable (caller falls back). */
export async function readCategoryShowcaseConfig() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'categoryShowcase'));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
      hidden: Array.isArray(data.hidden) ? data.hidden : [],
      order: Array.isArray(data.order) ? data.order : [],
    };
  } catch {
    return null;
  }
}

/**
 * Apply the showcase config to base entries ({ slug, ... }).
 * Null/missing config returns a copy in base order (the documented fallback).
 * Unknown slugs in `order` are ignored; unranked entries keep base order
 * (stable sort); hidden slugs are excluded.
 */
export function applyShowcaseOrder(entries, cfg) {
  const list = Array.isArray(entries) ? [...entries] : [];
  if (!cfg) return list;
  const hidden = new Set((cfg.hidden || []).map(String));
  const visible = list.filter((e) => !hidden.has(String(e.slug)));
  if (Array.isArray(cfg.order) && cfg.order.length > 0) {
    const rank = new Map(cfg.order.map((slug, i) => [String(slug), i]));
    visible.sort((a, b) => (rank.get(String(a.slug)) ?? 999) - (rank.get(String(b.slug)) ?? 999));
  }
  return visible;
}
