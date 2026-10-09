/**
 * Offline invoice pagination — EXACT 20 products per page.
 *
 * Explicit slicing (never browser auto-break alone):
 *   1–20  → Page 1: 1–20 + totals
 *   21–40 → Page 1: 1–20 / Page 2: 21–40 + totals
 *   41    → Page 1: 1–20 / Page 2: 21–40 / Page 3: 41 + totals
 *
 * Totals / thank-you render on the FINAL page only (see BillPrintSheet).
 * No empty chunks are ever returned, so pagination alone can never create a
 * blank page. An empty bill still yields exactly one page (header + empty
 * table + totals) rather than zero pages.
 */

/** Maximum product rows on any invoice page. */
export const PRODUCTS_PER_PAGE = 20;

/** Split items into one array per physical page (max 20 rows each). */
export function chunkItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < list.length; i += PRODUCTS_PER_PAGE) {
    pages.push(list.slice(i, i + PRODUCTS_PER_PAGE));
  }
  return pages;
}

/* --- Deprecated weight-budget API (kept as stubs for compatibility) --- */
/** @deprecated Pagination is now a strict 20/page slice; weight is always 1. */
export const rowWeight = () => 1;
/** @deprecated Use PRODUCTS_PER_PAGE. */
export const FIRST_PAGE_UNITS = PRODUCTS_PER_PAGE;
/** @deprecated Use PRODUCTS_PER_PAGE. */
export const NEXT_PAGE_UNITS = PRODUCTS_PER_PAGE;
/** @deprecated No reserve needed; totals live on the final page by construction. */
export const LAST_CHUNK_RESERVE = 0;
