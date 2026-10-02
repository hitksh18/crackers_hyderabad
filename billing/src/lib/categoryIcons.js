/* The approved store categories, each mapped to its single PNG icon.
   These names are used across the site (Home, Products filters, footer,
   product pages, price list). */

const NAME_SLUGS = {
  Rockets: 'rockets',
  Sparkles: 'sparkles',
  'Ground Chakkars': 'ground-chakkars',
  'Sky Shots': 'fancy',
  'Fancy Fireworks': 'fancy-fireworks',
  'Gift Boxes': 'gift-boxes',
  'Flower Pots': 'flower-pots',
  Bombs: 'bombs',
  Garlands: 'garlands',
  'Kids Special': 'kids',
  'Guns, Rolls & Pop Pop': 'guns-rolls-pop-pop',
  'Threads and Novelties': 'threads-novelties',
};

export const slugForCategory = (name) =>
  NAME_SLUGS[String(name || '').trim()] || 'rockets';

/* Legacy category names still stored on older product documents, mapped to
   the current storefront labels. Values that already match are returned as-is. */
const LEGACY_DISPLAY = {};

/** Display name for a category string — normalises legacy DB names to the
    current storefront label without duplicating the category. */
export const displayNameForCategory = (name) =>
  LEGACY_DISPLAY[String(name || '').trim()] || String(name || '');