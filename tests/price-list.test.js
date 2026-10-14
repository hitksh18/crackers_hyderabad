/**
 * Price List sections — the tests that matter.
 *
 * Run: node --test tests/price-list.test.js
 *
 * The printed document has two branded sections that must never cross
 * values: ONLINE (Crackers Hyderabad, storefront pricing) and OFFLINE
 * (Ayyapa Fireworks, counter pricing). These tests pin the per-section
 * fallback chains to the exact chains the canonical consumers use, and pin
 * the print document shape (two branded sections, forced section break,
 * repeating headers, no generated metadata).
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

let pricing;
test.before(async () => {
  pricing = await import('../admin/src/lib/priceListPricing.js');
});

/* -------------------------------------------------------------------------
   Per-section values mirror the canonical consumers
   ------------------------------------------------------------------------- */

test('online values follow the storefront pricing', () => {
  // Fully-priced online product: original + discounted sale.
  const full = { id: 'p1', onlinePrice: 1000, discountPrice: 800 };
  assert.equal(pricing.onlineMrpOf(full), 1000);
  assert.equal(pricing.onlineSaleOf(full), 800);

  // No discount: sale column stays empty, like the billing sheet's dash.
  const noDeal = { id: 'p2', onlinePrice: 1000 };
  assert.equal(pricing.onlineMrpOf(noDeal), 1000);
  assert.equal(pricing.onlineSaleOf(noDeal), null);

  // Legacy product with only `price`: still lists.
  const legacy = { id: 'p3', price: 500 };
  assert.equal(pricing.onlineMrpOf(legacy), 500);
  assert.equal(pricing.onlineSaleOf(legacy), null);

  // Online values never read trade fields.
  const trade = { id: 'p4', onlinePrice: 1000, discountPrice: 800, offlineMRP: 700, offlineDiscountPrice: 600 };
  assert.equal(pricing.onlineMrpOf(trade), 1000);
  assert.equal(pricing.onlineSaleOf(trade), 800);
});

test('offline values follow the counter register', () => {
  // Fully-priced counter product.
  const full = { id: 'p1', offlineMRP: 900, offlineDiscountPrice: 750, onlinePrice: 1000 };
  assert.equal(pricing.offlineMrpOf(full), 900);
  assert.equal(pricing.offlineSaleOf(full), 750);

  // offlinePrice (no MRP doc): the register charges offlinePrice, so must the list.
  const tradeOnly = { id: 'p2', offlinePrice: 800, onlinePrice: 1000, price: 1100 };
  assert.equal(pricing.offlineMrpOf(tradeOnly), 800);

  // No counter pricing at all: falls back exactly like the register.
  const onlineOnly = { id: 'p3', onlinePrice: 1000, price: 1100 };
  assert.equal(pricing.offlineMrpOf(onlineOnly), 1000);
  assert.equal(pricing.offlineSaleOf(onlineOnly), null);

  // Offline values never read the online sale price.
  const deal = { id: 'p4', discountPrice: 800, offlineMRP: 900 };
  assert.equal(pricing.offlineMrpOf(deal), 900);
  assert.equal(pricing.offlineSaleOf(deal), null);
});

test('the billing register agrees with the offline chain', () => {  // The offline section must charge what the counter charges. Pin the order
  // of both fallback chains in the register to the section selectors.
  const sheet = read('billing', 'src', 'components', 'billing', 'BillPrintSheet.jsx');
  const mrpLine = sheet.split('\n').find((line) => line.includes('const mrp = item.offlineMRP'));
  assert.ok(mrpLine, 'the register keeps an offline-first MRP chain');
  assert.ok(
    /offlineMRP \|\| item\.offlinePrice \|\| item\.onlinePrice/.test(mrpLine),
    'register MRP order (offlineMRP, offlinePrice, onlinePrice) must match offlineMrpOf'
  );
  const picker = read('billing', 'src', 'components', 'billing', 'ProductPickerPanel.jsx');
  assert.match(
    picker,
    /product\.offlineMRP \|\| product\.offlinePrice \|\| product\.onlinePrice/,
    'picker MRP order must match offlineMrpOf'
  );
});

test('currency display never alters values', () => {
  assert.equal(pricing.formatINR(1493), '₹1,493');
  assert.equal(pricing.formatINR(3277.5), '₹3,277.5');
  assert.equal(pricing.formatINR(0), '₹0');
  assert.equal(pricing.formatINR(null), '₹0');
  assert.equal(pricing.formatINR(undefined), '—');
  assert.equal(pricing.formatINR('abc'), '—');
});

/* -------------------------------------------------------------------------
   Category grouping — existing categories, canonical order, no duplication
   ------------------------------------------------------------------------- */

let priceCategories;
test.before(async () => {
  priceCategories = await import('../admin/src/config/categories.js');
});

test('print groups follow the canonical category order', async () => {
  const [first, second, third] = priceCategories.CATEGORY_VALUES;
  const groups = pricing.groupProductsForPrint([
    { id: 'c', categories: [third] },
    { id: 'a', categories: [first] },
    { id: 'b', categories: [second] },
  ]);
  assert.deepEqual(groups.map((g) => g.key), [first, second, third]);
  assert.deepEqual(groups.map((g) => g.items.map((p) => p.id)), [['a'], ['b'], ['c']]);
});

test('a multi-category product prints once, under its first group', () => {
  const [first, second] = priceCategories.CATEGORY_VALUES;
  const groups = pricing.groupProductsForPrint([
    { id: 'multi', categories: [second, first] },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, first);
  assert.deepEqual(groups[0].items.map((p) => p.id), ['multi']);
});

test('Kids Special holds its own group boundary like every category', () => {
  // Kids Special must neither vanish nor duplicate: one group, one row each,
  // separated exactly like any other boundary. First-canonical-group wins,
  // so fixtures put Kids Special best-ranked.
  const kids = priceCategories.CATEGORY_VALUES.find((v) => /kids/i.test(v));
  assert.ok(kids, 'Kids Special exists in the canonical ordering');
  const groups = pricing.groupProductsForPrint([
    { id: 'a', categories: [priceCategories.CATEGORY_VALUES[0]] },
    { id: 'k1', categories: [kids] },
    { id: 'k2', categories: [kids] },
  ]);
  const kidsGroup = groups.find((g) => g.key === kids);
  assert.ok(kidsGroup, 'a Kids Special group is formed');
  assert.deepEqual(kidsGroup.items.map((p) => p.id), ['k1', 'k2']);
  const flat = groups.flatMap((g) => g.items.map((p) => p.id));
  assert.deepEqual(flat, ['a', 'k1', 'k2']);
  assert.equal(new Set(flat).size, flat.length, 'no product duplicates across groups');
});

test('legacy single-category and uncategorised products land sanely', () => {
  const [first] = priceCategories.CATEGORY_VALUES;
  const groups = pricing.groupProductsForPrint([
    { id: 'legacy', category: first },
    { id: 'plain' },
    { id: 'blank', categories: [] },
  ]);
  assert.equal(groups[0].key, first);
  assert.deepEqual(groups[0].items.map((p) => p.id), ['legacy']);
  const last = groups[groups.length - 1];
  assert.equal(last.key, '__uncategorised');
  assert.equal(last.label, 'Uncategorised');
  assert.deepEqual(last.items.map((p) => p.id), ['plain', 'blank']);
});

test('grouping preserves catalogue order and handles empties', () => {
  const [first] = priceCategories.CATEGORY_VALUES;
  const groups = pricing.groupProductsForPrint([
    { id: 'z-last', categories: [first] },
    { id: 'a-first', categories: [first] },
  ]);
  assert.deepEqual(groups[0].items.map((p) => p.id), ['z-last', 'a-first']);
  assert.deepEqual(pricing.groupProductsForPrint([]), []);
  assert.deepEqual(pricing.groupProductsForPrint(null), []);
});

test('screen separators share the print grouping rule', async () => {
  const [first, second] = priceCategories.CATEGORY_VALUES;
  assert.deepEqual(pricing.screenGroupOf({ categories: [second, first] }), {
    key: first,
    label: priceCategories.categoryDisplayName(first),
  });
  assert.deepEqual(pricing.screenGroupOf({}), {
    key: '__uncategorised',
    label: 'Uncategorised',
  });
  // Same key as the print grouping would file it under.
  const groups = pricing.groupProductsForPrint([
    { id: 'x', categories: [second, first] },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, pricing.screenGroupOf({ categories: [second, first] }).key);
});

test('screen rows band on category change with continuous S.No', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /screenGroups\[index\] \|\| screenGroupOf\(product\)/, 'each displayed row resolves its band');
  assert.match(source, /showSeparator/, 'a separator renders only on group change');
  assert.match(source, /<tr className="pl-sep">/, 'separator is a full-width table row');
  assert.match(source, /<td colSpan=\{6\}>\{group\.label\}<\/td>/, 'separator names the group across all columns');
  assert.match(source, /sno=\{index \+ 1\}/, 'S.No never resets after a category');
  assert.match(source, /pl-table tbody tr\.pl-sep td \{/, 'separator band styling is screen-only');
});

/* -------------------------------------------------------------------------
   Document shape — two branded sections, clean pagination, no metadata
   ------------------------------------------------------------------------- */

test('both sections carry their own branding and pricing', () => {
  const byKey = Object.fromEntries(pricing.PRICE_LIST_SECTIONS.map((s) => [s.key, s]));
  assert.deepEqual(Object.keys(byKey), ['online', 'offline']);

  assert.equal(byKey.online.brand, 'CRACKERS HYDERABAD');
  assert.equal(byKey.online.title, 'ONLINE STORE PRICE LIST');
  assert.match(byKey.online.logo, /crackerhyderabadlogo\.png$/);

  assert.equal(byKey.offline.brand, 'AYYAPA FIREWORKS');
  assert.equal(byKey.offline.title, 'OFFLINE STORE PRICE LIST');
  assert.match(byKey.offline.logo, /ayyappa-fireworks-logo\.png$/);

  // The sections resolve different values for the same product.
  const product = { id: 'p', onlinePrice: 1000, discountPrice: 900, offlineMRP: 850, offlineDiscountPrice: 800 };
  assert.deepEqual(byKey.online.valueOf(product), { mrp: 1000, sale: 900 });
  assert.deepEqual(byKey.offline.valueOf(product), { mrp: 850, sale: 800 });
});

test('the page shows one store at a time with no generated metadata', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  // One state variable drives both switchers, the table and print.
  assert.match(source, /useState\('online'\)/, 'ONLINE STORE is the default tab');
  // A shared two-option switcher renders in the navbar (compact) and in the
  // content area — never a single button that changes its text.
  assert.match(source, /const StoreSwitch/, 'one shared switcher component');
  assert.match(source, /<StoreSwitch value=\{priceListMode\} onChange=\{setPriceListMode\} compact \/>/, 'navbar hosts the compact switcher');
  assert.ok(!/<StoreSwitch value=\{priceListMode\} onChange=\{setPriceListMode\} \/>/.test(source), 'no second switcher in the content area');
  assert.match(source, /aria-pressed=\{active\}/, 'the selected option is exposed to assistive tech');
  assert.ok(!/title="Switch store price list"/.test(source), 'the old single-toggle navbar button is gone');
  assert.ok(!/priceListMode === 'online' \? 'Offline Store' : 'Online Store'/.test(source), 'no text-flipping toggle button remains');
  assert.ok(!/Generated:/.test(source), 'no "Generated: <date>" line in the document');
  assert.ok(!/new Date\(\)\.toLocaleDateString/.test(source), 'no browser-generated date in the document');
  assert.ok(!/IP address|printersIp|userIp/i.test(source), 'no IP metadata in the document');
  assert.match(source, /title="Download the price list PDF for the selected store"/, 'the print button generates the PDF document');
});

test('no horizontal category-pill strip remains', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.ok(!/scroll-x-pills -mx-1 flex gap-2 overflow-x-auto/.test(source), 'the scrolling pill row markup is gone');
  assert.ok(!/aria-pressed=\{active\}\s*\n?\s*onClick=\{\(\) => setSelectedCategory/.test(source), 'no pill buttons toggle categories');
});

test('each store labels its own columns', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /mrpLabel=\{section\.mrpLabel\} priceLabel=\{section\.priceLabel\}/, 'the screen header reads the section labels');
  const lib = read('admin', 'src', 'lib', 'priceListPricing.js');
  assert.match(lib, /mrpLabel: 'MRP'/, 'both stores show MRP');
  assert.match(lib, /priceLabel: 'ONLINE PRICE'/, 'online shows ONLINE PRICE');
  assert.match(lib, /priceLabel: 'STORE PRICE'/, 'offline shows STORE PRICE');
});

test('the screen table leads with a sequential S.No', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /<th className="pl-h-sno">S\.No<\/th>/, 'S.No heads the screen table');
  assert.match(source, /sno=\{index \+ 1\}/, 'screen rows number by display order');
});

test('availability comes from the catalogue stock flag', () => {
  assert.equal(pricing.availabilityOf({ outOfStock: true }), 'Out of Stock');
  assert.equal(pricing.availabilityOf({ outOfStock: false }), 'In Stock');
  assert.equal(pricing.availabilityOf({}), 'In Stock', 'records predating the flag list as in stock');
  assert.equal(pricing.availabilityOf(null), 'In Stock');
});

test('no description sentence survives below the navbar', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.ok(!/Online store and counter price lists/.test(source), 'description text removed');
  assert.ok(!/Showing \{filteredProducts\.length\}/.test(source), 'no product-count sentence in the content');
});

test('both brand palettes live in the shared PDF engine, never green', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  // Ayyapa: gold brand sampled from the mark, deep complementary blue title.
  assert.match(engine, /brandColor: \[178, 142, 3\]/, 'ayyapa gold brand colour');
  assert.match(engine, /titleColor: \[30, 64, 175\]/, 'ayyapa deep-blue document title');
  // Crackers Hyderabad: maroon identity, burnt-red accent.
  assert.match(engine, /brandColor: \[118, 23, 19\]/, 'crackers maroon brand colour');
  assert.match(engine, /titleColor: \[179, 64, 31\]/, 'crackers burnt-red document title');
  // Short centred divider — never a full-width bar, never a header box.
  assert.match(engine, /const divW = 56;/, 'a short centred divider replaces the full-width bar');
  assert.ok(!/#1F6B3A/.test(engine), 'no green accent remains in the document');
  assert.ok(!/#1D4ED8/.test(engine), 'no bright-blue accent remains in the document');
  // One branding helper serves both sections: same geometry, own identity.
  assert.match(engine, /export const pdfBrandingFor/, 'a single branding helper owns both identities');
});

test('footers carry only the brand name on every page', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  // Footer stamped after layout on every page: brand name only.
  assert.match(engine, /drawText\(doc, branding\.brand, PDF_PAGE\.w \/ 2, footerY/, 'footer draws the brand name alone');
  // No page numbers, store tags or metadata anywhere in the document.
  assert.ok(!/['`]Page /.test(engine.replace(/\/\/.*$/gm, '')), 'no page numbers in the document');
  assert.ok(!/footerTag/.test(engine), 'no footer tag field remains');
  assert.ok(!/OFFLINE STORE/.test(engine), 'no OFFLINE STORE text in the document');
  assert.ok(!/ONLINE STORE/.test(engine), 'no ONLINE STORE text in the document');
  // Subtitles are exactly PRICE LIST for both stores.
  assert.deepEqual(
    [...engine.matchAll(/docTitle: '([^']+)'/g)].map((m) => m[1]),
    ['PRICE LIST', 'PRICE LIST'],
    'both subtitles read exactly PRICE LIST',
  );
  // No CSS paged-media counters: footers are stamped after layout.
  // (Chrome never supported counter(pages).)
  const page = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.ok(!/@bottom-center/.test(page), 'no CSS running footers remain');
  assert.ok(!/counter\(pages\)/.test(page), 'no CSS page counters remain');
});

test('category changes open exactly one compact heading band', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  // One routine draws the band: accent rule above, tinted wash, bold
  // uppercase centred name, single hairline below — no box of its own.
  assert.match(engine, /const drawCategoryHead = \(doc, label, widths, left, top, branding\) =>/, 'one heading routine exists');
  assert.match(engine, /String\(label \|\| ''\)\.toUpperCase\(\)/, 'heading names render bold uppercase');
  assert.match(engine, /headingBg/, 'heading carries a subtle brand-tinted wash');
  assert.match(engine, /headingColor/, 'heading text follows the brand accent');
  // Exactly one heading per category: drawn only at group starts, which come
  // from the existing grouping — never one per product, never invented.
  assert.match(engine, /const isGroupStart = i === 0 \|\| rows\[i - 1\]\.groupKey !== row\.groupKey/, 'headings open groups only');
  assert.match(engine, /groupLabel: labelOf\(group\)/, 'each row carries its group display label');
  // Heading + first row are atomic: measured together, paged together, never
  // orphaned alone at a page bottom.
  assert.match(engine, /const need = m\.h \+ \(isGroupStart \? CAT_GAP \+ CAT_HEAD_H : 0\)/, 'heading and first row page as one unit');
});

test('one frame owns the geometry; the table lives inside it', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  assert.match(engine, /export const PDF_FRAME = \{ x: 12, y: 10, w: 186, h: 277 \}/, 'a single authoritative content rectangle');
  assert.match(engine, /tableW = widths\.reduce/, 'table width derives from the content width');
  // Columns share the full content width exactly: name owns the largest area.
  assert.match(engine, /\{ key: 'name', share: 0\.41 \}/, 'product name keeps the largest share');
  const fullBlock = engine.match(/export const PDF_COLUMNS = \[([\s\S]*?)\];/)[1];
  const shares = [...fullBlock.matchAll(/share: (0\.\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(shares, [0.07, 0.41, 0.2, 0.1, 0.1, 0.12], 'six columns share the content width');
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'columns sum to exactly the table width — no overflow');
  assert.ok(!/position: fixed/.test(engine), 'no CSS fixed-position frame hack');
});

test('Ayyapa compacts to S.NO | PRODUCT NAME | PRICE; Crackers keeps six', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  // Compact register exists once, shares exact, PRICE draws the sale value.
  const compactBlock = engine.match(/export const PDF_COLUMNS_COMPACT = \[([\s\S]*?)\];/)[1];
  assert.deepEqual(
    [...compactBlock.matchAll(/key: '(\w+)'/g)].map((m) => m[1]),
    ['sno', 'name', 'price'],
    'compact set is exactly S.NO, PRODUCT NAME, PRICE',
  );
  const compactShares = [...compactBlock.matchAll(/share: (0\.\d+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(compactShares.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'compact shares sum to exactly the table width');
  assert.match(engine, /export const PDF_HEADER_TITLES_COMPACT = \['S\.No', 'Product Name', 'Price'\]/, 'price column labeled exactly PRICE');
  // Wiring: offline takes the compact set, online keeps the full register.
  assert.match(engine, /columns: PDF_COLUMNS_COMPACT,/, 'Ayyapa renders the compact register');
  assert.match(engine, /headerTitles: PDF_HEADER_TITLES_COMPACT,/, 'Ayyapa titles carry no SALE PRICE');
  assert.match(engine, /columns: PDF_COLUMNS,/, 'Crackers keeps the full register');
  assert.match(engine, /headerTitles: PDF_HEADER_TITLES,/, 'Crackers keeps all six titles');
  // One renderer serves both: measurement, head and rows all read the
  // branding's column set — never a second table implementation.
  assert.match(engine, /const columns = branding\.columns \|\| PDF_COLUMNS;/, 'single renderer reads per-brand columns');
  assert.ok(!/OfflinePrintTable/.test(engine), 'no legacy offline table remains');
});

test('fixed and floating UI never reaches the printed page', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  // The mobile nav trigger (circular hamburger) ignores viewport media
  // queries in print, so it is hidden by name — as are the drawer, its
  // veil/close, and toast popups. Named classes only, never a blind
  // global button hide.
  for (const selector of ['.asb-fab,', '.asb-drawer,', '.asb-drawer-veil,', '.asb-drawer-close,', '.react-hot-toast']) {
    assert.ok(source.includes(selector), `${selector} is hidden in print`);
  }
});

test('brand header on page 1 only; frame + table head on every page', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  assert.match(engine, /const drawFrame = \(doc\) =>/, 'one frame drawing routine exists');
  assert.match(engine, /const drawPageHeader = \(doc, branding, logoDims\) =>/, 'one header routine exists');
  // Page 1 reserves the brand header; continuations start the table at the
  // top of the content area — logo/brand/title must never repeat.
  assert.match(engine, /const startPage = \(isFirst\) => \{/, 'the page template knows first from continuation');
  assert.match(engine, /isFirst \? drawPageHeader\(doc, branding, logoDims\) : PDF_FRAME\.y \+ PDF_PAD/, 'brand header is drawn on page 1 only');
  assert.match(engine, /let \{ y \} = startPage\(true\)/, 'the document opens with the brand header');
  assert.match(engine, /doc\.addPage\(\);[\s\S]*?const st = startPage\(false\)/, 'continuation pages skip the brand header');
  assert.ok(!/table-header-group/.test(engine), 'no CSS thead-repeat hack');
});

test('the engine filename follows the selected store', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  assert.match(engine, /export const priceListPdfFileName/, 'a single filename helper exists');
  assert.match(engine, /`\$\{branding\.fileName\}\.pdf`/, 'filenames end in .pdf under the store name');
  const lib = read('admin', 'src', 'lib', 'priceListPricing.js');
  assert.match(lib, /fileName: 'Crackers Hyderabad PriceList'/, 'online filename configured');
  assert.match(lib, /fileName: 'Ayyappa Fireworks PriceList'/, 'offline filename configured');
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /printPriceListPDF\(pdfBrandingFor\(section, logoDataUrl\), rows\)/, 'the button renders the selected store through the shared engine');
  assert.ok(!/document\.title = section\.fileName/.test(source), 'no browser-title filename swap remains');
  assert.ok(!/window\.print\(\)/.test(source), 'no window.print() remains on this page');
});
test('filter dropdowns render readable text', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /className="input-premium pl-select h-10/, 'both dropdowns carry the readable-select class');
  assert.match(source, /select\.pl-select\.input-premium \{/, 'select control has explicit colors');
  assert.match(source, /background-color: var\(--surface-card\)/, 'dropdown control follows the dark theme');
  assert.match(source, /select\.pl-select\.input-premium option \{/, 'native option rows have explicit colors');
});

test('navbar layout: Refresh left, single switch plus Print right', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  const leftAt = source.indexOf('leftControls={');
  const controlsAt = source.indexOf('controls={');
  assert.ok(leftAt !== -1 && controlsAt !== -1 && leftAt < controlsAt, 'navbar takes left controls before right controls');
  const leftBlock = source.slice(leftAt, controlsAt);
  const rightBlock = source.slice(controlsAt);
  assert.ok(/title="Refresh product and pricing data"/.test(leftBlock), 'Refresh sits beside Back on the left');
  assert.ok(/StoreSwitch value=\{priceListMode\} onChange=\{setPriceListMode\} compact/.test(rightBlock), 'the switcher sits on the right');
  assert.ok(/title="Download the price list PDF for the selected store"/.test(rightBlock), 'Print sits on the right after the switcher');
  assert.ok(!/title="Switch store price list"/.test(source), 'no single text-flipping toggle button remains');
});

test('pagination is content-aware: measure, flow, repeat the head', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  // Every row is measured (names wrap) before anything is drawn.
  assert.match(engine, /const measured = \(rows \|\| \[\]\)\.map\(\(row\) => measureRow\(doc, row, widths, columns\)\)/, 'all rows are measured up front');
  // Rows flow while they fit; otherwise a new templated page starts.
  assert.match(engine, /if \(y \+ need > contentBottom\) newPage\(\);/, 'a row that does not fit opens a new page');
  // The table head is part of the page template, so it repeats everywhere.
  assert.match(engine, /const bodyTop = drawTableHead\(doc, widths, left, tableTop, headerTitles, columns\)/, 'every page opens with the table head');
  // No fixed products-per-page anywhere.
  assert.ok(!/per.?page.{0,20}\d{2}/i.test(engine), 'no fixed row count per page');
  // Long names wrap instead of truncating.
  assert.match(engine, /splitTextToSize/, 'long product names wrap inside their cell');
  assert.ok(!/\.\.\./.test(engine.replace(/\.\.\.[A-Za-z_]+/g, '')), 'no ellipsis truncation in the document');
});

test('rows flatten the existing groups with continuous S.No', () => {
  const engine = read('admin', 'src', 'utils', 'priceListPdf.js');
  assert.match(engine, /export const buildPriceListRows/, 'one row builder flattens the print groups');
  assert.match(engine, /groupKey: group\.key/, 'each row remembers its group for headings');
  assert.match(engine, /sno: snoById\.get\(product\.id\)/, 'S.No follows display order across groups');
  // Heading text comes from the existing group display labels — the engine
  // never invents category names.
  assert.match(engine, /labelOf = \(group\) => group\?\.label/, 'heading labels default to the existing group labels');
});

test('the page renders one PDF through the engine, not DOM tables', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /buildPriceListRows\(\{/, 'the button flattens the filtered groups into rows');
  assert.match(source, /groupProductsForPrint\(filteredProducts\)/, 'rows come from the filtered list');
  assert.match(source, /categoryOf: \(product\) =>/, 'categories ride in the CATEGORY column');
  assert.match(source, /labelOf: \(group\) => group\.label/, 'headings use the existing group display labels');
  assert.match(source, /statusOf: printStatusOf/, 'status reads the real stock flag');
  assert.match(source, /valueOf: section\.valueOf/, 'prices read the selected store');
  assert.ok(!/pl-print-doc/.test(source), 'no print-only DOM document remains');
  assert.ok(!/pl-print-table/.test(source), 'no print-only DOM tables remain');
  assert.ok(!/<iframe/.test(source), 'no embedded iframe preview');
  assert.ok(!/<embed/.test(source), 'no embedded object preview');
  assert.ok(!/<canvas/.test(source), 'no canvas PDF renderer');
  // The screen table shows Product, Category, MRP, price and Availability —
  // filters use the same data the columns display.
  const head = source.match(/const PriceTableHead[\s\S]*?\n\);/);
  assert.ok(head, 'screen header component exists');
  assert.ok(/>Category</.test(head[0]), 'Category column present on screen');
  assert.ok(/>Availability</.test(head[0]), 'Availability column present on screen');
  assert.ok(!/>Status</.test(head[0]), 'no generic Status column on screen');
});

let priceListPdf;
test.before(async () => {
  priceListPdf = await import('../admin/src/utils/priceListPdf.js');
});

test('a 123-product catalogue paginates without losing rows', () => {
  const cats = priceCategories.CATEGORY_VALUES;
  const groups = cats.map((key, gi) => ({
    key,
    items: Array.from({ length: gi === 0 ? 15 : 9 }, (_, i) => ({
      id: `${key}-${i}`,
      name: i % 4 === 0
        ? '7 Shots Multi Colour Fancy Aerial Repeating Shell Box Extra Long Product Name For Wrapping'
        : `Product ${i + 1} of ${key}`,
      outOfStock: (gi + i) % 9 === 0,
    })),
  }));
  const flat = groups.flatMap((g) => g.items);
  const snoById = new Map(flat.map((p, i) => [p.id, i + 1]));
  const rows = priceListPdf.buildPriceListRows({
    groups,
    snoById,
    valueOf: () => ({ mrp: 1493, sale: 800 }),
    formatPrice: pricing.formatINR,
    statusOf: pricing.printStatusOf,
    categoryOf: (p) => priceCategories.categoryDisplayName(p.id.split('-')[0]) || p.id,
    labelOf: (group) => priceCategories.categoryDisplayName(group.key),
  });
  assert.equal(rows.length, flat.length, 'every product reaches the document exactly once');
  assert.deepEqual(rows.map((r) => r.sno), flat.map((_, i) => i + 1), 'S.No runs continuously');
  assert.equal(new Set(rows.map((r) => r.sno)).size, rows.length, 'no duplicate numbers');
  // One heading label per category, carried by its first row.
  const headLabels = rows.filter((r, i) => i === 0 || rows[i - 1].groupKey !== r.groupKey).map((r) => r.groupLabel);
  assert.equal(headLabels.length, cats.length, 'exactly one heading per category');
  assert.deepEqual(headLabels, cats.map((k) => priceCategories.categoryDisplayName(k)), 'headings use the existing display names');

  const doc = priceListPdf.generatePriceListPDF(
    priceListPdf.pdfBrandingFor(pricing.PRICE_LIST_SECTIONS[1], null),
    rows,
  );
  assert.ok(doc.getNumberOfPages() >= 2, 'a long catalogue spans pages');
  const bytes = doc.output('arraybuffer');
  assert.ok(bytes.byteLength > 10000, 'the document carries real content');
});
