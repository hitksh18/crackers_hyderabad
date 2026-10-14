import { jsPDF } from 'jspdf';
import { MONEY_FONT_REGULAR_BASE64, MONEY_FONT_BOLD_BASE64 } from './invoiceAssets.js';

/**
 * Unified Price List PDF engine — the ONLY price-list document renderer.
 *
 * Both stores share this layout engine. Only branding + the { mrp, sale }
 * value source + the column set differ:
 *
 *   Ayyapa   : S.NO | PRODUCT NAME | PRICE (PRICE = existing sale price)
 *   Crackers : S.NO | PRODUCT NAME | CATEGORY | MRP | SALE PRICE | STATUS
 *   header  : centred logo + brand + document title + short accent divider,
 *             drawn ONCE on page 1. Pages 2+ start directly with the repeated
 *             table head, maximising usable space (the old CSS `window.print()`
 *             header printed once but later pages drifted out of the frame).
 *   frame   : ONE page frame; the table grid lives strictly inside it and
 *             shares its left/right content boundaries (the old layout sized
 *             the table and the border independently, so page 4 overflowed).
 *   groups  : NO anonymous category breaks — before the first product of
 *             every category sits ONE compact full-width heading band (bold
 *             uppercase name, brand accent, subtle tint, single thin rules
 *             above/below). The CATEGORY column still carries names per row.
 *   paging  : content-aware — every row is measured (names wrap) and placed
 *             while it fits; otherwise a new page starts. No fixed N-per-page.
 *
 * Pure w.r.t. data: callers pass prebuilt `rows` (see buildPriceListRows).
 * Nothing here reads prices, categories or stock — it only draws them.
 */

/* Page geometry (A4 portrait, millimetres). A single frame rect owns the
   printable area; every number below derives from it. */
export const PDF_PAGE = { w: 210, h: 297 };
export const PDF_FRAME = { x: 12, y: 10, w: 186, h: 277 };
export const PDF_PAD = 4; // frame inset -> content edges
export const PDF_FOOTER_RESERVE = 9; // footer band inside the frame

export const contentRect = () => ({
  left: PDF_FRAME.x + PDF_PAD,
  right: PDF_FRAME.x + PDF_FRAME.w - PDF_PAD,
  get width() {
    return this.right - this.left;
  },
});

/* Column shares of the content width. STATUS owns 12% so "Out of Stock"
   fits on one 8pt line; PRODUCT NAME keeps the largest area. */
export const PDF_COLUMNS = [
  { key: 'sno', share: 0.07 },
  { key: 'name', share: 0.41 },
  { key: 'category', share: 0.2 },
  { key: 'mrp', share: 0.1 },
  { key: 'sale', share: 0.1 },
  { key: 'status', share: 0.12 },
];

/* Compact register for the Ayyapa price list: S.NO | PRODUCT NAME | PRICE,
   where PRICE draws the existing sale value. Shares sum to exactly 1. */
export const PDF_COLUMNS_COMPACT = [
  { key: 'sno', share: 0.1 },
  { key: 'name', share: 0.72 },
  { key: 'price', share: 0.18 },
];

export const PDF_HEADER_TITLES = ['S.No', 'Product Name', 'Category', 'MRP', 'Sale Price', 'Status'];

export const PDF_HEADER_TITLES_COMPACT = ['S.No', 'Product Name', 'Price'];

/* Print palette. Per-brand accents arrive via `branding`; everything else
   is neutral print furniture (light header wash, hairline grid, zebra). */
const INK = [26, 26, 26];
const MUTED = [110, 105, 95];
const FRAME_LINE = [150, 144, 132];
const GRID_V = [231, 228, 221];
const GRID_H = [221, 216, 204];
const TABLE_EDGE = [140, 134, 122];
const HEADER_WASH = [244, 241, 234];
const HEADER_RULE = [60, 58, 55];
const ZEBRA = [251, 249, 245];
const GREEN = [38, 110, 70];
const RED = [170, 58, 40];
const WHITE = [255, 255, 255];

const BODY_FONT = 'helvetica';
const MONEY_FONT = 'CHMoney';
const DASH = '—'; // NOT in the money-font subset: always draw in BODY_FONT

const TABLE_HEAD_H = 8;
const HEAD_GAP = 4; // header block -> table head
const CAT_GAP = 1.2; // breathing room above a category heading band
const CAT_HEAD_H = 7; // compact heading band height (never a large card)
const ROW_PAD_V = 1.9;
const ROW_PAD_H = 2;
const NAME_SIZE = 9;
const CELL_SIZE = 8.5;
const NAME_LEAD = 3.9;
const CELL_LEAD = 3.7;

const logoCache = new Map();

/** Fetch a public logo URL into a data URL (cached). Null when unreachable.
 *
 * Large store logos (1000px+ RGBA) would otherwise embed as multi-megabyte
 * bitmaps — jsPDF decodes PNGs to raw raster before Flating. The header
 * draws ~46mm wide, so anything past 480px is downscaled via bitmap +
 * canvas (PNG to preserve transparency); any failure falls back to the
 * original bytes and the text header still prints without a logo. */
export const loadLogoDataUrl = async (url, maxWidth = 480) => {
  if (!url) return null;
  if (logoCache.has(url)) return logoCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`logo ${res.status}`);
    const blob = await res.blob();
    const scaled = await downscaleLogo(blob, maxWidth);
    const dataUrl = scaled || (await blobToDataUrl(blob));
    logoCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    logoCache.set(url, null);
    return null;
  }
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const downscaleLogo = async (blob, maxWidth) => {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  const bmp = await createImageBitmap(blob);
  try {
    if (bmp.width <= maxWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round((bmp.height * maxWidth) / bmp.width);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    bmp.close?.();
  }
};

const colWidths = (contentWidth, columns) => columns.map((c) => c.share * contentWidth);

/**
 * Flatten grouped catalogue products into drawable rows.
 *
 * `groups` is groupProductsForPrint() output (canonical order, each product
 * exactly once — incl. Kids Special as its own group). `snoById` carries the
 * continuous numbering. Pure + unit-testable; the engine never regroups.
 */
export const buildPriceListRows = ({ groups, snoById, valueOf, formatPrice, statusOf, categoryOf, labelOf = (group) => group?.label ?? group?.key ?? '' }) =>
  (groups || []).flatMap((group) =>
    (group.items || []).map((product) => {
      const { mrp, sale } = valueOf(product);
      return {
        sno: snoById.get(product.id),
        name: product.name || '',
        category: categoryOf(product),
        mrpText: formatPrice(mrp),
        saleText: sale ? formatPrice(sale) : DASH,
        saleIsDash: !sale,
        statusText: statusOf(product),
        outOfStock: Boolean(product.outOfStock),
        groupKey: group.key,
        groupLabel: labelOf(group),
      };
    }),
  );

/** Wrap-measure one row with the fonts it will be drawn in. Only columns
    present in the branding's set are measured; absent ones cost nothing. */
const measureRow = (doc, row, widths, columns) => {
  const at = (key) => {
    const i = columns.findIndex((c) => c.key === key);
    return i < 0 ? null : widths[i];
  };
  doc.setFont(BODY_FONT, 'normal');
  doc.setFontSize(NAME_SIZE);
  const nameW = at('name');
  const nameLines = nameW == null ? [''] : doc.splitTextToSize(String(row.name || ''), Math.max(nameW - ROW_PAD_H * 2, 10));
  doc.setFontSize(CELL_SIZE);
  const catW = at('category');
  const catLines = catW == null ? [''] : doc.splitTextToSize(String(row.category || ''), Math.max(catW - ROW_PAD_H * 2, 10));
  const statusW = at('status');
  const statusLines = statusW == null ? [''] : doc.splitTextToSize(String(row.statusText || ''), Math.max(statusW - ROW_PAD_H * 2, 10));
  const lines = Math.max(nameLines.length, catLines.length, statusLines.length, 1);
  const lead = Math.max(NAME_LEAD, CELL_LEAD);
  return { h: ROW_PAD_V * 2 + lines * lead, nameLines, catLines, statusLines };
};

const drawText = (doc, value, x, y, { size = CELL_SIZE, bold = false, color = INK, align = 'left' } = {}) => {
  doc.setFont(BODY_FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(String(value), x, y, { align });
};

/* Money font is a 16-glyph subset (digits , . ₹) — every price sets it
   itself and nothing else may use it (mirrors the invoice generator). */
const drawAmount = (doc, value, x, y, { size = CELL_SIZE, bold = false, color = INK } = {}) => {
  doc.setFont(MONEY_FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(String(value), x, y, { align: 'right' });
};

const drawFrame = (doc) => {
  doc.setDrawColor(...FRAME_LINE);
  doc.setLineWidth(0.4);
  doc.rect(PDF_FRAME.x, PDF_FRAME.y, PDF_FRAME.w, PDF_FRAME.h);
};

/**
 * Full brand header, drawn ONCE on page 1: centred logo (aspect preserved),
 * brand line in the brand colour, document title in the accent colour, then
 * a short centred divider. Returns the y where the table head may start.
 * Pages 2+ skip this entirely and start with the table head, so the table
 * geometry never enters the header area on page 1 and never wastes space
 * afterwards.
 */
const drawPageHeader = (doc, branding, logoDims) => {
  const cx = PDF_PAGE.w / 2;
  let y = PDF_FRAME.y + 6;

  if (branding.logoDataUrl && logoDims) {
    const maxW = 46;
    const maxH = 20;
    let w = maxW;
    let h = w / logoDims.aspect;
    if (h > maxH) {
      h = maxH;
      w = h * logoDims.aspect;
    }
    try {
      // Stable alias: the bytes embed once, pages reference the XObject.
      doc.addImage(branding.logoDataUrl, 'PNG', cx - w / 2, y, w, h, branding.imageAlias);
      y += h + 3;
    } catch {
      y += 1; // corrupt image: text header still prints
    }
  }

  drawText(doc, branding.brand, cx, y + 4.5, { size: 14, bold: true, color: branding.brandColor, align: 'center' });
  y += 9.5;
  drawText(doc, branding.docTitle, cx, y + 3.5, { size: 10.5, bold: true, color: branding.titleColor, align: 'center' });
  y += 8;

  const divW = 56;
  doc.setDrawColor(...branding.accentColor);
  doc.setLineWidth(0.7);
  doc.line(cx - divW / 2, y, cx + divW / 2, y);
  return y + HEAD_GAP;
};

const RIGHT_KEYS = ['mrp', 'sale', 'price', 'status'];

const drawTableHead = (doc, widths, left, top, titles, columns) => {
  doc.setFillColor(...HEADER_WASH);
  doc.rect(left, top, widths.reduce((a, b) => a + b, 0), TABLE_HEAD_H, 'F');
  const xs = [];
  let x = left;
  widths.forEach((w) => {
    xs.push(x);
    x += w;
  });
  titles.forEach((title, i) => {
    const key = columns[i]?.key;
    const align = key === 'sno' ? 'center' : RIGHT_KEYS.includes(key) ? 'right' : 'left';
    const tx = align === 'center' ? xs[i] + widths[i] / 2 : align === 'right' ? xs[i] + widths[i] - ROW_PAD_H : xs[i] + ROW_PAD_H;
    drawText(doc, title.toUpperCase(), tx, top + 5.4, { size: 8, bold: true, color: INK, align });
  });
  // vertical separators + stronger bottom rule (header authority, single line)
  doc.setDrawColor(...GRID_V);
  doc.setLineWidth(0.25);
  xs.slice(1).forEach((vx) => doc.line(vx, top, vx, top + TABLE_HEAD_H));
  doc.setDrawColor(...HEADER_RULE);
  doc.setLineWidth(0.6);
  doc.line(left, top + TABLE_HEAD_H, left + widths.reduce((a, b) => a + b, 0), top + TABLE_HEAD_H);
  return top + TABLE_HEAD_H;
};

/**
 * Compact full-width category heading band. Exactly one per category,
 * immediately before its first product: thin accent rule above, subtle
 * brand-tinted wash, bold uppercase centred name, single hairline below.
 * No side borders of its own (the table's one outer edge passes alongside),
 * never a large card. Returns the y where the first product row may start.
 */
const drawCategoryHead = (doc, label, widths, left, top, branding) => {
  const tableW = widths.reduce((a, b) => a + b, 0);
  doc.setDrawColor(...branding.accentColor);
  doc.setLineWidth(0.6);
  doc.line(left, top, left + tableW, top);
  doc.setFillColor(...branding.headingBg);
  doc.rect(left, top, tableW, CAT_HEAD_H, 'F');
  drawText(doc, String(label || '').toUpperCase(), left + tableW / 2, top + 4.9, {
    size: 8.5,
    bold: true,
    color: branding.headingColor,
    align: 'center',
  });
  doc.setDrawColor(...GRID_H);
  doc.setLineWidth(0.25);
  doc.line(left, top + CAT_HEAD_H, left + tableW, top + CAT_HEAD_H);
  return top + CAT_HEAD_H;
};

const drawRow = (doc, row, measured, widths, left, top, zebra, columns) => {
  const { h, nameLines, catLines, statusLines } = measured;
  const tableW = widths.reduce((a, b) => a + b, 0);
  if (zebra) {
    doc.setFillColor(...ZEBRA);
    doc.rect(left, top, tableW, h, 'F');
  }
  const xs = [];
  let x = left;
  widths.forEach((w) => {
    xs.push(x);
    x += w;
  });
  const at = (key) => columns.findIndex((c) => c.key === key);
  const lineY = (i) => top + ROW_PAD_V + 2.9 + i * NAME_LEAD;
  const midY = top + h / 2 + 1.2;

  if (at('sno') >= 0) {
    const i = at('sno');
    drawText(doc, String(row.sno ?? ''), xs[i] + widths[i] / 2, midY, { size: CELL_SIZE, color: MUTED, align: 'center' });
  }

  if (at('name') >= 0) {
    const i = at('name');
    doc.setFont(BODY_FONT, 'normal');
    doc.setFontSize(NAME_SIZE);
    doc.setTextColor(...INK);
    const nameX = xs[i] + ROW_PAD_H;
    const off = nameLines.length === 1 ? (h - ROW_PAD_V * 2 - NAME_LEAD) / 2 : 0;
    nameLines.forEach((line, li) => doc.text(line, nameX, lineY(li) + off, { align: 'left' }));
    doc.setFontSize(CELL_SIZE);
  }

  if (at('category') >= 0) {
    const i = at('category');
    catLines.forEach((line, li) => {
      drawText(doc, line, xs[i] + ROW_PAD_H, lineY(li) + (catLines.length === 1 ? (h - ROW_PAD_V * 2 - CELL_LEAD) / 2 : 0), { size: CELL_SIZE });
    });
  }

  if (at('mrp') >= 0) {
    const i = at('mrp');
    drawAmount(doc, row.mrpText, xs[i] + widths[i] - ROW_PAD_H, midY, { size: CELL_SIZE });
  }

  // 'sale' (Crackers register) and 'price' (Ayyapa register) draw the same
  // existing sale value; only the column label differs.
  if (at('sale') >= 0 || at('price') >= 0) {
    const i = at('sale') >= 0 ? at('sale') : at('price');
    if (row.saleIsDash) drawText(doc, DASH, xs[i] + widths[i] - ROW_PAD_H, midY, { size: CELL_SIZE, align: 'right' });
    else drawAmount(doc, row.saleText, xs[i] + widths[i] - ROW_PAD_H, midY, { size: CELL_SIZE, bold: true });
  }

  if (at('status') >= 0) {
    const i = at('status');
    const statusColor = row.outOfStock ? RED : GREEN;
    statusLines.forEach((line, li) => {
      drawText(doc, line, xs[i] + widths[i] - ROW_PAD_H, lineY(li) + (statusLines.length === 1 ? (h - ROW_PAD_V * 2 - CELL_LEAD) / 2 : 0), {
        size: 8,
        bold: true,
        color: statusColor,
        align: 'right',
      });
    });
  }

  // hairline row rule + faint verticals (grid language, never a heavy box)
  doc.setDrawColor(...GRID_H);
  doc.setLineWidth(0.25);
  doc.line(left, top + h, left + tableW, top + h);
  doc.setDrawColor(...GRID_V);
  xs.slice(1).forEach((vx) => doc.line(vx, top, vx, top + h));
  return top + h;
};

/**
 * @param {object} branding { brand, docTitle, fileName, columns,
 *   headerTitles, brandColor:[r,g,b], titleColor:[r,g,b], accentColor:[r,g,b],
 *   headingColor:[r,g,b], headingBg:[r,g,b], logoDataUrl? }
 * @param {Array} rows buildPriceListRows() output, already ordered, S.No set
 * @param {object} [hooks] test/diagnostic hook: { onLayout({ rowsPerPage }) }
 */
export const generatePriceListPDF = (branding, rows, hooks = {}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('CHMoney-Regular.ttf', MONEY_FONT_REGULAR_BASE64);
  doc.addFont('CHMoney-Regular.ttf', MONEY_FONT, 'normal');
  doc.addFileToVFS('CHMoney-Bold.ttf', MONEY_FONT_BOLD_BASE64);
  doc.addFont('CHMoney-Bold.ttf', MONEY_FONT, 'bold');

  doc.setProperties({
    title: `${branding.brand} - ${branding.docTitle}`,
    subject: 'Price List',
    author: branding.brand,
    creator: 'crackershyderabad.com',
  });

  const { left, width } = contentRect();
  // Column set is per-brand (Ayyapa compact, Crackers full register);
  // every geometric consumer below derives from it — one renderer.
  const columns = branding.columns || PDF_COLUMNS;
  const headerTitles = branding.headerTitles || PDF_HEADER_TITLES;
  const widths = colWidths(width, columns);
  const tableW = widths.reduce((a, b) => a + b, 0);
  const contentBottom = PDF_FRAME.y + PDF_FRAME.h - PDF_FOOTER_RESERVE - PDF_PAD;

  let logoDims = null;
  if (branding.logoDataUrl) {
    try {
      const props = doc.getImageProperties(branding.logoDataUrl);
      if (props?.width && props?.height) logoDims = { aspect: props.width / props.height };
    } catch {
      logoDims = null;
    }
  }

  // Measure every row up front (wrapping names change heights) so paging is
  // content-aware instead of a fixed N-per-page guess.
  const measured = (rows || []).map((row) => measureRow(doc, row, widths, columns));

  const startPage = (isFirst) => {
    drawFrame(doc);
    // Page 1 reserves the brand header height; continuation pages start the
    // table at the top of the content area for maximum usable space.
    const tableTop = isFirst ? drawPageHeader(doc, branding, logoDims) : PDF_FRAME.y + PDF_PAD;
    const bodyTop = drawTableHead(doc, widths, left, tableTop, headerTitles, columns);
    // table side edges: one clean outer border in the grid language
    return { bodyTop, y: bodyTop };
  };

  let { y } = startPage(true);
  const openEdge = { top: y }; // top edge of the live table (for side rules)
  const rowsPerPage = [0];

  const newPage = () => {
    closeTableEdges(doc, left, tableW, openEdge.top, y);
    doc.addPage();
    const st = startPage(false);
    openEdge.top = st.bodyTop;
    y = st.y;
    rowsPerPage.push(0);
  };

  (rows || []).forEach((row, i) => {
    const m = measured[i];
    const isGroupStart = i === 0 || rows[i - 1].groupKey !== row.groupKey;
    // Atomic unit: heading + first row travel together — a heading is never
    // orphaned alone at a page bottom; the group moves as a whole instead.
    const need = m.h + (isGroupStart ? CAT_GAP + CAT_HEAD_H : 0);
    if (y + need > contentBottom) newPage();
    if (isGroupStart) {
      y += CAT_GAP;
      y = drawCategoryHead(doc, row.groupLabel, widths, left, y, branding);
    }
    y = drawRow(doc, row, m, widths, left, y, i % 2 === 1, columns);
    rowsPerPage[rowsPerPage.length - 1] += 1;
  });
  closeTableEdges(doc, left, tableW, openEdge.top, y);
  hooks.onLayout?.({ rowsPerPage });

  // Brand-only footers, stamped after layout on every page. No page
  // numbers, no store tags, no metadata — the footer is the brand name.
  const pages = doc.getNumberOfPages();
  const footerY = PDF_FRAME.y + PDF_FRAME.h - 3.4;
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    drawText(doc, branding.brand, PDF_PAGE.w / 2, footerY, {
      size: 7.5,
      color: MUTED,
      align: 'center',
    });
  }
  return doc;
};

/* Side edges of the live table block: drawn per page-span so the grid reads
   as one clean outer border without ever touching the page frame. */
const closeTableEdges = (doc, left, tableW, top, bottom) => {
  if (bottom <= top) return;
  doc.setDrawColor(...TABLE_EDGE);
  doc.setLineWidth(0.4);
  doc.line(left, top, left, bottom);
  doc.line(left + tableW, top, left + tableW, bottom);
};

/* Per-section branding for the shared engine. Same geometry, only the
   identity changes: logo, brand/title colours, footer tag and filename. */
export const pdfBrandingFor = (section, logoDataUrl) =>
  section.key === 'offline'
    ? {
        key: 'offline',
        imageAlias: 'pl-logo-ayyapa',
        brand: 'AYYAPA FIREWORKS',
        docTitle: 'PRICE LIST',
        fileName: section.fileName,
        // Compact register: S.NO | PRODUCT NAME | PRICE (sale value).
        columns: PDF_COLUMNS_COMPACT,
        headerTitles: PDF_HEADER_TITLES_COMPACT,
        brandColor: [178, 142, 3], // gold sampled from the Ayyappa mark
        titleColor: [30, 64, 175], // deep complementary blue
        accentColor: [178, 142, 3],
        headingColor: [150, 115, 0], // darkened gold: accent voice, print contrast
        headingBg: [250, 245, 230], // whisper of gold wash
        logoDataUrl,
      }
    : {
        key: 'online',
        imageAlias: 'pl-logo-crackers',
        brand: 'CRACKERS HYDERABAD',
        docTitle: 'PRICE LIST',
        fileName: section.fileName,
        // Full register: S.NO | PRODUCT NAME | CATEGORY | MRP | SALE PRICE | STATUS.
        columns: PDF_COLUMNS,
        headerTitles: PDF_HEADER_TITLES,
        brandColor: [118, 23, 19], // maroon store identity
        titleColor: [179, 64, 31], // burnt-red accent
        accentColor: [179, 64, 31],
        headingColor: [179, 64, 31],
        headingBg: [250, 239, 235], // whisper of brand wash
        logoDataUrl,
      };

export const priceListPdfFileName = (branding) => `${branding.fileName}.pdf`;

export const downloadPriceListPDF = (branding, rows) => {
  generatePriceListPDF(branding, rows).save(priceListPdfFileName(branding));
};

export const printPriceListPDF = (branding, rows) => {
  const doc = generatePriceListPDF(branding, rows);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
};
