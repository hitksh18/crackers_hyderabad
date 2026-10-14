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
  assert.match(source, /title="Print price list \(in the print dialog, turn off Headers and footers/, 'the print button tells staff how to drop browser chrome');
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

test('the offline print accent follows the logo palette, never green', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  // Gold brand (sampled from the mark), deep-blue title/divider/separators.
  assert.match(source, /\.pl-print-offline \.pl-print-brand \{ color: #B28E03; font-size: 19px/, 'gold brand leads at 19px');
  assert.match(source, /\.pl-print-offline \.pl-print-title \{ color: #1E40AF; font-size: 14px/, 'blue title follows at 14px');
  assert.match(source, /\.pl-print-div \{\s*width: 72mm/, 'a short centred divider replaces the full-width bar');
  assert.match(source, /\.pl-print-offline \.pl-print-div \{ border-top-color: #1E40AF/, 'offline divider is deep blue');
  assert.ok(!/\.pl-print-head \{ border-bottom/.test(source), 'no border wrapped directly around the header');
  assert.match(source, /\.pl-print-offline tr\.pl-group-first td \{ border-top-color: #B28E03/, 'offline group boundaries are gold');
  assert.ok(!/#1F6B3A/.test(source), 'no green accent remains on the page');
  assert.ok(!/#1D4ED8/.test(source), 'no bright-blue accent remains on the page');
});

test('only offline pages carry a whisper-quiet footer', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /@page pl-offline \{/, 'offline owns a named page');
  assert.match(source, /AYYAPA FIREWORKS · OFFLINE STORE · Page /, 'footer names brand, document and page');
  assert.match(source, /font-size: 8px/, 'footer text is readable, not microscopic');
  assert.match(source, /\.pl-print-offline \{ page: pl-offline; \}/, 'the offline document takes its named page');
  assert.ok(!/@page pl-online/.test(source), 'online keeps the plain page (no footer)');
});

test('category transitions are single quiet lines', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  const printCss = source.slice(source.indexOf('@media print'));
  assert.match(printCss, /tr\.pl-group-first td \{\s*border-top: 1px solid #111111/, 'group boundary is a thin rule');
  assert.ok(!/F5F4F0/.test(printCss), 'no background tint on group rows');
  assert.ok(!/padding-top: 8px/.test(printCss), 'no inflated row heights');
});

test('the table is a bordered grid inside generous margins', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /margin: 15mm;/, 'equal page margins on all sides');
  assert.match(source, /\.pl-print-table \{[^}]*border: 1px solid #999999;/, 'the table edge is thin, matching the frame language');
  const printCss = source.slice(source.indexOf('@media print'));
  assert.ok(!/nth-child\(even\)/.test(printCss), 'no zebra striping in the print document');
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

test('a thin frame borders every printed page', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /pl-page-frame/, 'frame element exists in the print document');
  assert.match(source, /position: fixed/, 'the frame repeats on every printed page');
  assert.match(source, /border: 1px solid #999999/, 'the frame is a thin neutral rule');
});

test('the downloaded filename follows the selected store', () => {
  const lib = read('admin', 'src', 'lib', 'priceListPricing.js');
  assert.match(lib, /fileName: 'Crackers Hyderabad PriceList'/, 'online filename configured');
  assert.match(lib, /fileName: 'Ayyappa Fireworks PriceList'/, 'offline filename configured');
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  assert.match(source, /document\.title = section\.fileName/, 'print swaps in the store filename');
  assert.match(source, /window\.addEventListener\('afterprint', restore\)/, 'the tab title is restored afterwards');
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
  assert.ok(/title="Print price list/.test(rightBlock), 'Print sits on the right after the switcher');
  assert.ok(!/title="Switch store price list"/.test(source), 'no single text-flipping toggle button remains');
});

test('pagination rules hold for a long catalogue', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  // Rows never split; the single column header repeats per printed page
  // (never per category). The company masthead is flow content, so it
  // prints once — never per page.
  assert.match(source, /pl-print-table tr \{\s*break-inside:\s*avoid/, 'rows never split across pages');
  assert.match(source, /pl-print-table thead \{\s*display:\s*table-header-group/, 'the column header repeats on continuation pages');
  assert.match(source, /tr\.pl-group-first \{\s*break-after:\s*avoid/, 'a group opening keeps with its rows');
  // No forced breaks anywhere: one continuous table, no blank pages.
  assert.ok(!/break-before:\s*page/.test(source), 'no forced page breaks in the print document');
  // Page counters exist in exactly one place: the offline named-page
  // footer. Nothing else may number pages.
  const bottoms = source.match(/@bottom-center/g) || [];
  assert.equal(bottoms.length, 1, 'exactly one running footer block (offline only)');
  // Long names wrap instead of truncating.
  assert.match(source, /overflow-wrap:\s*break-word/, 'long product names wrap');
});

test('the print document is separate from the screen table', () => {
  const source = read('admin', 'src', 'pages', 'PriceList.jsx');
  // Exactly one print table for the selected store: centred masthead once,
  // then product rows with text-free category separation and a running S.No.
  // No per-category tables, no embedded viewers.
  assert.match(source, /pl-print-doc pl-print-\$\{section\.key\}/, 'one print document per selected store');
  assert.match(source, /pl-print-table/, 'the print document owns its table');
  assert.ok(!/<iframe/.test(source), 'no embedded iframe preview');
  assert.ok(!/<embed/.test(source), 'no embedded object preview');
  assert.ok(!/<canvas/.test(source), 'no canvas PDF renderer');
  // Category boundaries come from the shared helper; the document shows no
  // category text at all. S.No runs continuously.
  assert.match(source, /groupProductsForPrint\(filteredProducts\)/, 'print groups come from the filtered list');
  assert.match(source, /className=\{itemIndex === 0 \? 'pl-group-first' : undefined\}/, 'first row of each group is marked');
  assert.ok(!/pl-cat-sep/.test(source), 'no text separator rows in the print document');
  assert.match(source, /snoById\.get\(product\.id\)/, 'printed S.No follows display order across groups');
  assert.match(source, /break-after:\s*avoid/, 'a heading never strands alone at a page bottom');
  // The screen table shows Product, Category, MRP, price and Availability —
  // filters use the same data the columns display.
  const head = source.match(/const PriceTableHead[\s\S]*?\n\);/);
  assert.ok(head, 'screen header component exists');
  assert.ok(/>Category</.test(head[0]), 'Category column present on screen');
  assert.ok(/>Availability</.test(head[0]), 'Availability column present on screen');
  assert.ok(!/>Status</.test(head[0]), 'no generic Status column on screen');
});
