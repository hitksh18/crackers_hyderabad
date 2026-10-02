import { jsPDF } from 'jspdf';
import { pinOf, navUrlFor, formatCoords, QR_LABEL } from './deliveryLocation';
import { qrMatrix } from './qr';
import { LOGO_PNG_DATA_URL, MONEY_FONT_REGULAR_BASE64, MONEY_FONT_BOLD_BASE64 } from './invoiceAssets';

// Print palette, matched to the on-screen brand tokens in src/index.css.
// jsPDF wants RGB triples, so these are the literal channel values.
const MAROON = [118, 23, 19]; // --maroon-700 #761713
const MAROON_SOFT = [148, 37, 31]; // --maroon-600 #94251F
const GOLD = [210, 166, 79]; // --gold-400 #D2A64F
const DARK = [26, 23, 20]; // --text-strong #1A1714
const GRAY = [107, 100, 89]; // --text-muted #6B6459
const LIGHT = [139, 131, 119]; // --text-subtle #8B8377
const BORDER = [226, 210, 183]; // --hairline-strong #E2D2B7
const HEADER_BG = [249, 241, 227]; // --surface-sunken #F9F1E3
const GREEN = [44, 122, 83]; // --leaf-600 #2C7A53
const WHITE = [255, 255, 255];
/* One shade off paper. Enough to guide the eye along a row of an eighty-line
   packing list, faint enough that a mono laser print does not band. */
const ZEBRA = [252, 249, 243];

const M = 15;
const W = 210;
const CW = W - M * 2;
const RIGHT = M + CW;

/*
 * The page is divided once, here, and every block respects it.
 *
 * CONTENT_BOTTOM is the last millimetre a flowing block may occupy; the footer
 * band below it is stamped onto every page after the content is laid out, so
 * nothing can be pushed underneath it or printed over it. The old layout pinned
 * the signature and footer to absolute coordinates and let the item rows grow
 * towards them, which collided as soon as an order ran long.
 */
const CONTENT_BOTTOM = 258;
const FOOTER_RULE = 266;
/* Signature, and the delivery QR on shop copies. Bottom-anchored: a signature
   floating mid-page under a three-line order looks unfinished. */
const CLOSING_H = 36;
/* What the band needs when there is no QR in it — a rule and two 8 pt lines.
   Only the shop's copy carries a QR, so reserving the full CLOSING_H for every
   copy spilled each invoice of eleven items or more onto a second page holding
   nothing but this band. Reserve what is actually drawn. */
const SIGN_H = 12;

const MONEY_FONT = 'CHMoney';
const BODY_FONT = 'helvetica';

/**
 * Rupee amounts — and the ONLY strings that may be drawn in MONEY_FONT.
 *
 * That font is Noto Sans subset to sixteen characters (" ,-./0123456789₹"),
 * which is the whole reason it exists: jsPDF's built-in Helvetica is WinAnsi-
 * encoded and has no U+20B9, so prices used to print as "Rs 375". Anything
 * outside the subset would come out as a blank box, hence the finite guard — an
 * order with a corrupt total prints ₹0 rather than a row of tofu.
 */
const money = (value) => {
  const raw = Number(value);
  const n = Number.isFinite(raw) ? raw : 0;
  // Paise only when there are paise: a price list of whole rupees reads as
  // ₹375, not ₹375.00, but a 5% discount of ₹250.50 must not print as ₹250.5.
  const decimals = Number.isInteger(n) ? 0 : 2;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const under1000 = (n) => {
  const out = [];
  let rest = n;
  if (rest >= 100) {
    out.push(ONES[Math.floor(rest / 100)], 'Hundred');
    rest %= 100;
  }
  if (rest >= 20) {
    out.push(TENS[Math.floor(rest / 10)]);
    rest %= 10;
  }
  if (rest >= 1) out.push(ONES[rest]);
  return out.join(' ');
};

/** Lakh and crore, not million — this is read by customers in Hyderabad. */
const indianWords = (value) => {
  let n = Math.floor(value);
  if (n <= 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(under1000(crore), 'Crore');
  if (lakh) parts.push(under1000(lakh), 'Lakh');
  if (thousand) parts.push(under1000(thousand), 'Thousand');
  if (n) parts.push(under1000(n));
  return parts.join(' ');
};

/* Spelled out because a hand-altered digit is the oldest trick there is, and a
   printed invoice is the customer's receipt. */
const rupeesInWords = (value) => {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  const tail = paise ? ` and ${indianWords(paise)} Paise` : '';
  return `Rupees ${indianWords(whole)}${tail} Only`;
};

/**
 * @param {object} order
 * @param {object} customerInfo
 * @param {{ isAdmin?: boolean }} [options] Shop copies carry the packing
 *   checkboxes and the delivery QR; the customer's own copy does not need
 *   directions to their own house, nor a column to tick.
 */
export const generateInvoicePDF = (order, customerInfo, options = {}) => {
  const isAdmin = options.isAdmin === true;
  /* A counter sale has no delivery leg: the "shipping address" the register
     stores is the literal string "Counter sale". Printing it as a second
     address block, as the old layout did, invented a destination. */
  const isCounterSale = order.source === 'pos';

  const orderId = order.orderId || order.id || 'N/A';
  const displayOrderId = orderId.length > 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  const trackingId = order.shortCode ? `#${order.shortCode.toUpperCase()}` : `#${displayOrderId}`;

  /* Admin screens hand over a Firestore Timestamp; the tracking page gets its
     order from /api/orders/track, where createdAt is an ISO string. Accept both
     — the old Timestamp-only check fell through to "today", so every invoice
     printed from a tracked order was silently stamped with the wrong date. */
  const parsedDate = order.createdAt?.toDate?.() ?? (order.createdAt ? new Date(order.createdAt) : null);
  const orderDate = (parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date())
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const doc = new jsPDF();

  doc.addFileToVFS('CHMoney-Regular.ttf', MONEY_FONT_REGULAR_BASE64);
  doc.addFont('CHMoney-Regular.ttf', MONEY_FONT, 'normal');
  doc.addFileToVFS('CHMoney-Bold.ttf', MONEY_FONT_BOLD_BASE64);
  doc.addFont('CHMoney-Bold.ttf', MONEY_FONT, 'bold');

  doc.setProperties({
    title: `Invoice ${trackingId} - Crackers Hyderabad`,
    subject: 'Invoice',
    author: 'Crackers Hyderabad',
    creator: 'crackershyderabad.com',
  });

  // ---- drawing helpers ----------------------------------------------------

  const text = (value, x, y, { size = 8.5, bold = false, color = GRAY, align = 'left' } = {}) => {
    doc.setFont(BODY_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(value), x, y, { align });
  };

  /* Separate from text() so the money font can never be left selected with a
     label drawn in it — every price sets its own font and nothing else uses it. */
  const amount = (value, x, y, { size = 8.5, bold = false, color = DARK, align = 'right', prefix = '' } = {}) => {
    doc.setFont(MONEY_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(`${prefix}${money(value)}`, x, y, { align });
  };

  const rule = (y, color = BORDER, weight = 0.3, x1 = M, x2 = RIGHT) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(weight);
    doc.line(x1, y, x2, y);
  };

  const drawBrandBars = () => {
    doc.setFillColor(...MAROON);
    doc.rect(0, 0, W, 4, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 4, W, 1.2, 'F');
  };

  /** Trim to width with an ellipsis. Used where wrapping is not an option. */
  const clip = (value, width, size = 8.5, bold = false) => {
    doc.setFont(BODY_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    let out = String(value ?? '');
    if (doc.getTextWidth(out) <= width) return out;
    while (out.length > 1 && doc.getTextWidth(`${out}...`) > width) out = out.slice(0, -1);
    return `${out}...`;
  };

  /* Wrap to width in the font the lines are actually drawn in. splitTextToSize
     measures with whatever font happens to be selected, so every caller must set
     it first — which is how AMOUNT IN WORDS came to be measured in the money
     font, a sixteen-glyph subset where every letter is .notdef. Pass the size the
     text() call below will use and the two cannot drift apart. */
  const wrap = (value, width, size = 8.5, bold = false) => {
    doc.setFont(BODY_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(String(value ?? ''), width);
  };

  // ================= HEADER =================
  /* Logo left, identity beside it, invoice identity right. The old header
     stacked five centred lines, which burned 35 mm of a one-page document to
     say less than this does in 25. */
  const LOGO = 21;

  const drawHeader = () => {
    drawBrandBars();

    doc.addImage(LOGO_PNG_DATA_URL, 'PNG', M, 8.5, LOGO, LOGO);

    const tx = M + LOGO + 4;
    text('CRACKERS HYDERABAD', tx, 15.5, { size: 16, bold: true, color: MAROON });
    text('Standard Fireworks Exclusive Store', tx, 20.5, { size: 8 });
    text('Hyderabad, Telangana', tx, 24.8, { size: 8 });
    text('www.crackershyderabad.com', tx, 29.1, { size: 8, color: MAROON_SOFT });

    text('INVOICE', RIGHT, 16.5, { size: 22, bold: true, color: MAROON, align: 'right' });
    text(trackingId, RIGHT, 23, { size: 10.5, bold: true, color: MAROON_SOFT, align: 'right' });
    // Which of the two copies this is — the shop's file copy and the customer's
    // differ in what they carry, and a stack of them on a desk should say so.
    text(isAdmin ? 'Office Copy' : 'Customer Copy', RIGHT, 28.4, { size: 7.5, color: LIGHT, align: 'right' });

    rule(33.5, GOLD, 0.8);
  };

  /** Page 2 and on: no need to reprint the whole letterhead. */
  const drawContinuationHeader = () => {
    drawBrandBars();
    doc.addImage(LOGO_PNG_DATA_URL, 'PNG', M, 8.2, 9, 9);
    text('CRACKERS HYDERABAD', M + 11.5, 13, { size: 9.5, bold: true, color: MAROON });
    text(`Invoice ${trackingId} — continued`, RIGHT, 13, { size: 8, color: LIGHT, align: 'right' });
    rule(19, BORDER, 0.3);
  };

  drawHeader();

  // ================= META STRIP =================
  /* Date, payment, status and size in one band instead of a run-on centred
     sentence. Four equal cells so the values stay where the eye expects them. */
  const metaTop = 37;
  const metaH = 13;
  const itemCount = (order.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);

  doc.setFillColor(...HEADER_BG);
  doc.rect(M, metaTop, CW, metaH, 'F');
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, metaTop, CW, metaH);

  const metaCells = [
    ['DATE', orderDate],
    ['PAYMENT', order.paymentMode || (isCounterSale ? 'Cash' : 'Cash on Delivery')],
    ['STATUS', order.status || 'Pending'],
    ['ITEMS', `${itemCount} pc${itemCount === 1 ? '' : 's'}`],
  ];
  const cellW = CW / metaCells.length;

  metaCells.forEach(([label, value], i) => {
    const cx = M + i * cellW;
    if (i > 0) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(cx, metaTop + 2, cx, metaTop + metaH - 2);
    }
    text(label, cx + 4, metaTop + 5.2, { size: 6.5, bold: true, color: LIGHT });
    text(clip(value, cellW - 8, 9, true), cx + 4, metaTop + 10.4, { size: 9, bold: true, color: DARK });
  });

  // ================= BILL TO / SHIP TO =================
  /* Cards are sized to their contents. The old pair were a fixed 34 mm and the
     body was hard-sliced to two address lines, so a flat number, a street and a
     landmark quietly lost the landmark — on the one document the courier reads. */
  const cardTop = metaTop + metaH + 6;
  const TITLE_H = 6.5;

  const bodyRows = (name, phone, email, lines) => {
    const rows = [{ value: name || 'N/A', size: 9.5, bold: true, color: DARK, gap: 5.4 }];
    if (phone) rows.push({ value: phone, size: 8.5, color: GRAY, gap: 4.4 });
    if (email) rows.push({ value: email, size: 8.5, color: GRAY, gap: 4.4 });
    lines.forEach((line) => rows.push({ value: line, size: 8.5, color: DARK, gap: 4.4 }));
    return rows;
  };

  const drawCard = (x, w, title, tint, rows, height) => {
    doc.setFillColor(...HEADER_BG);
    doc.rect(x, cardTop, w, TITLE_H, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(x, cardTop, w, height);
    doc.line(x, cardTop + TITLE_H, x + w, cardTop + TITLE_H);
    text(title, x + 4, cardTop + 4.6, { size: 7.5, bold: true, color: tint });

    let y = cardTop + TITLE_H + 5.2;
    rows.forEach((row) => {
      text(clip(row.value, w - 8, row.size, row.bold), x + 4, y, row);
      y += row.gap;
    });
  };

  const billLines = [];
  if (customerInfo?.address) billLines.push(...wrap(customerInfo.address, CW / 2 - 11));
  const billTail = `${customerInfo?.city || ''} ${customerInfo?.pincode ? `- ${customerInfo.pincode}` : ''}`.trim();
  if (billTail) billLines.push(billTail);

  const delivery = order.delivery;
  const shipsElsewhere = !isCounterSale && delivery && !delivery.sameAsBilling;

  const billRows = bodyRows(customerInfo?.name, customerInfo?.phone, customerInfo?.email, billLines);
  let cardH = TITLE_H + 5.2 + billRows.reduce((h, r) => h + r.gap, 0) - 1;
  let shipRows = null;

  if (!isCounterSale) {
    const shipLines = [];
    if (shipsElsewhere) {
      const parts = [delivery.flatNo, delivery.streetNo, delivery.area].filter(Boolean).join(', ');
      if (parts) shipLines.push(...wrap(parts, CW / 2 - 11));
      const tail = [`${delivery.city || ''} ${delivery.pincode ? `- ${delivery.pincode}` : ''}`.trim(), delivery.state]
        .filter(Boolean)
        .join(', ');
      if (tail) shipLines.push(tail);
    } else {
      shipLines.push(...billLines);
    }
    shipRows = bodyRows(
      customerInfo?.name,
      (shipsElsewhere && delivery.altPhone) || customerInfo?.phone,
      customerInfo?.email,
      shipLines
    );
    cardH = Math.max(cardH, TITLE_H + 5.2 + shipRows.reduce((h, r) => h + r.gap, 0) - 1);
  }

  if (shipRows) {
    const boxW = CW / 2 - 3;
    drawCard(M, boxW, 'BILL TO', MAROON, billRows, cardH);
    drawCard(M + boxW + 6, boxW, shipsElsewhere ? 'DELIVER TO' : 'DELIVER TO (SAME AS BILLING)', MAROON_SOFT, shipRows, cardH);
  } else {
    drawCard(M, CW, 'BILL TO — COUNTER SALE', MAROON, billRows, cardH);
  }

  // ================= ITEMS TABLE =================
  /* The tick box is a packing aid, so it only earns its 12 mm on the shop's
     copy; the customer gets a line number in the same slot instead. */
  const firstCol = isAdmin ? { label: 'Pack', pack: true } : { label: '#' };
  const cols = [
    { ...firstCol, x: 0, w: 12, align: 'center' },
    { label: 'Item', x: 12, w: 88, align: 'left', wrap: true },
    { label: 'Qty', x: 100, w: 18, align: 'center' },
    { label: 'Rate', x: 118, w: 28, align: 'right', money: true },
    { label: 'Amount', x: 146, w: 34, align: 'right', money: true, bold: true },
  ];

  const drawTableHeader = (top) => {
    doc.setFillColor(...MAROON);
    doc.rect(M, top, CW, 8.5, 'F');
    cols.forEach((c) => {
      const tx = c.align === 'right' ? M + c.x + c.w - 3 : c.align === 'center' ? M + c.x + c.w / 2 : M + c.x + 4;
      text(c.label, tx, top + 5.7, { size: 8, bold: true, color: WHITE, align: c.align });
    });
    return top + 8.5;
  };

  let y = drawTableHeader(cardTop + cardH + 7);

  const nextPage = () => {
    doc.addPage();
    drawContinuationHeader();
    return 25;
  };

  const items = order.items || [];
  let subtotal = 0;

  items.forEach((item, index) => {
    // Price actually charged for this line. The server stores that in `price`
    // (discountPrice is the same when present); `onlinePrice` is the online
    // retail figure and must NOT win here, or a POS line billed at the offline
    // MRP/price would print the wrong per-unit amount. Matches the on-screen
    // admin OrderDetailPanel, so screen and invoice always agree.
    const price = item.discountPrice || item.price || 0;
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;

    /* Two lines before an ellipsis. Product names run to 200 characters here
       ("7 Shots Multi Colour Fancy Aerial Repeating Shell"), and the old single
       clipped line turned several of them into the same "7 Shots Multi Co...". */
    const wrapped = wrap(item.name, cols[1].w - 6);
    const nameLines = wrapped.slice(0, 2);
    if (wrapped.length > 2) nameLines[1] = clip(`${nameLines[1]} ...`, cols[1].w - 6);
    const rowH = nameLines.length > 1 ? 11.5 : 8.2;

    if (y + rowH > CONTENT_BOTTOM) y = drawTableHeader(nextPage());

    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(M, y, CW, rowH, 'F');
    }

    cols.forEach((c) => {
      const cx = M + c.x;
      const midY = y + rowH / 2 + 1.1;

      if (c.pack) {
        const box = 4.2;
        doc.setDrawColor(...LIGHT);
        doc.setLineWidth(0.35);
        doc.rect(cx + (c.w - box) / 2, y + (rowH - box) / 2, box, box);
        return;
      }

      const tx = c.align === 'right' ? cx + c.w - 3 : c.align === 'center' ? cx + c.w / 2 : cx + 4;

      if (c.wrap) {
        let ly = nameLines.length > 1 ? y + 5 : midY;
        nameLines.forEach((line) => {
          text(line, tx, ly, { size: 8.5, color: DARK, align: c.align });
          ly += 4.3;
        });
        return;
      }

      if (c.money) {
        amount(c.label === 'Rate' ? price : lineTotal, tx, midY, { size: 8.5, bold: c.bold, align: 'right' });
        return;
      }

      const value = c.label === 'Qty' ? item.quantity : index + 1;
      text(value, tx, midY, { size: 8.5, color: c.label === 'Qty' ? DARK : LIGHT, align: c.align });
    });

    y += rowH;
    rule(y);
  });

  if (items.length === 0) {
    text('No items on this order', W / 2, y + 6, { size: 9, align: 'center' });
    y += 10;
    rule(y);
  }

  // ================= TOTALS =================
  // `??` not `||`: a legitimate zero total (e.g. a 100%-discount counter sale)
  // must stay zero, not silently fall back to the pre-discount subtotal.
  const totalAmount = order.total ?? subtotal;
  const discount = Number(order.discount) > 0 ? Number(order.discount) : 0;

  const TOTAL_BLOCK = 78;
  const labelX = RIGHT - TOTAL_BLOCK;
  const ledgerH = 7 + (discount ? 7 : 0) + 14;

  if (y + ledgerH + 4 > CONTENT_BOTTOM) y = nextPage();

  y += 6;

  text('Subtotal', labelX + 4, y, { size: 9 });
  // `subtotal` is already the pre-discount sum of the line amounts, so the
  // ledger foots as Subtotal - Discount = Grand Total. Adding the discount
  // back in here double-counted it and overstated the subtotal.
  amount(subtotal, RIGHT - 4, y, { size: 9, color: DARK });
  y += 7;

  if (discount) {
    const pct = Number(order.discountPercent) > 0 ? ` (${Number(order.discountPercent)}%)` : '';
    text(`Discount${pct}`, labelX + 4, y, { size: 9, color: GREEN });
    amount(discount, RIGHT - 4, y, { size: 9, color: GREEN, prefix: '- ' });
    y += 7;
  }

  doc.setFillColor(...MAROON);
  doc.rect(labelX, y - 1, TOTAL_BLOCK, 14, 'F');
  text('GRAND TOTAL', labelX + 4, y + 8, { size: 10.5, bold: true, color: WHITE });
  amount(totalAmount, RIGHT - 4, y + 8.4, { size: 12, bold: true, color: WHITE });

  /* Left of the total band, which is otherwise dead space, and the place a
     reader already looks to check the figure they were quoted. */
  const wordsW = labelX - M - 6;
  const wordLines = wrap(rupeesInWords(totalAmount), wordsW, 8);
  text('AMOUNT IN WORDS', M, y + 2.5, { size: 6.5, bold: true, color: LIGHT });
  let wy = y + 7;
  wordLines.slice(0, 3).forEach((line) => {
    text(line, M, wy, { size: 8, color: DARK });
    wy += 4.2;
  });

  y = Math.max(y + 13 + 4, wy);

  // ================= NOTES =================
  if (order.notes || order.message) {
    const noteLines = wrap(order.notes || order.message, CW - 8, 8);
    const noteH = 8 + noteLines.length * 4.2;
    if (y + noteH > CONTENT_BOTTOM) y = nextPage();

    doc.setFillColor(...HEADER_BG);
    doc.rect(M, y, CW, noteH, 'F');
    text('ORDER NOTES', M + 4, y + 5, { size: 6.5, bold: true, color: MAROON });
    let ny = y + 10.5;
    noteLines.forEach((line) => {
      text(line, M + 4, ny, { size: 8, color: GRAY });
      ny += 4.2;
    });
    y += noteH + 4;
  }

  // ================= CLOSING BAND: QR + SIGNATURE =================
  /* Printed only on the shop's own copy. It encodes a Google Maps navigation
     link built from the coordinates stored on the order, so the packing slip
     that comes off the printer months from now still points at the same door —
     nothing here depends on a live lookup or on the address text being right. */
  const pin = isAdmin ? pinOf(order) : null;

  const closingH = pin ? CLOSING_H : SIGN_H;
  if (y + closingH > CONTENT_BOTTOM) y = nextPage();
  const closingTop = CONTENT_BOTTOM - closingH;

  if (pin) {
    const matrix = qrMatrix(navUrlFor(pin));

    if (matrix) {
      const QR_BLOCK = 34;
      const { size: modules, quietZone, isDark } = matrix;
      const unit = QR_BLOCK / (modules + quietZone * 2);
      const originX = M + quietZone * unit;
      const originY = closingTop + quietZone * unit;

      /* The quiet zone is drawn, not assumed: scanners find the symbol by its
         light border, and this sits next to a bordered footer. */
      doc.setFillColor(...WHITE);
      doc.rect(M, closingTop, QR_BLOCK, QR_BLOCK, 'F');

      doc.setFillColor(0, 0, 0);
      for (let row = 0; row < modules; row += 1) {
        let run = 0;
        // One rectangle per horizontal run of dark modules rather than one per
        // module: the same symbol, about half the drawing operations.
        for (let col = 0; col <= modules; col += 1) {
          if (col < modules && isDark(row, col)) {
            run += 1;
            continue;
          }
          if (run) {
            doc.rect(originX + (col - run) * unit, originY + row * unit, run * unit, unit, 'F');
            run = 0;
          }
        }
      }

      const textX = M + QR_BLOCK + 5;
      const textW = 128 - textX; // Stops short of the signature block.
      let ty = closingTop + 6;

      const labelLines = wrap(QR_LABEL, textW, 8.5, true);
      labelLines.forEach((line) => {
        text(line, textX, ty, { size: 8.5, bold: true, color: MAROON });
        ty += 4.2;
      });
      ty += 2;
      text('Scan to open Google Maps navigation', textX, ty, { size: 8 });
      ty += 4.5;
      text(formatCoords(pin), textX, ty, { size: 8, color: LIGHT });
    }
  }

  /* The signature sits at the foot of the band, which is the foot of the content
     area either way — so it lands in exactly the same place whether or not a QR
     reserved the taller CLOSING_H above it. */
  const signX = RIGHT - 58;
  rule(CONTENT_BOTTOM - 10, BORDER, 0.4, signX, RIGHT);
  text('Authorised Signature', signX, CONTENT_BOTTOM - 5.5, { size: 8, color: LIGHT });
  text('Crackers Hyderabad', signX, CONTENT_BOTTOM - 1.5, { size: 8, color: LIGHT });

  // ================= FOOTER (every page) =================
  /* Stamped after the flow, because "Page 1 of 3" cannot be written until the
     third page exists. */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);

    doc.setFillColor(...GOLD);
    doc.rect(M, FOOTER_RULE, CW, 1, 'F');

    if (p === pages) {
      doc.setFillColor(250, 249, 247);
      doc.rect(M, FOOTER_RULE + 1, CW, 15, 'F');
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.rect(M, FOOTER_RULE + 1, CW, 15);

      text('Thank you for shopping with Crackers Hyderabad!', W / 2, FOOTER_RULE + 6.5, {
        size: 9.5, bold: true, color: MAROON, align: 'center',
      });
      text('For support, reach us on WhatsApp or visit the store  ·  Report any discrepancy within 24 hours of delivery.',
        W / 2, FOOTER_RULE + 12, { size: 7.5, align: 'center' });
    }

    text(`Page ${p} of ${pages}`, RIGHT, 288, { size: 7, color: LIGHT, align: 'right' });
    text(`Invoice ${trackingId}`, M, 288, { size: 7, color: LIGHT });
  }

  return doc;
};

export const generateInvoicePDFBlob = (order, customerInfo, options = {}) => {
  const doc = generateInvoicePDF(order, customerInfo, options);
  return doc.output('blob');
};

export const downloadInvoicePDF = (order, customerInfo, options = {}) => {
  const doc = generateInvoicePDF(order, customerInfo, options);
  const orderId = order.orderId || order.id || 'ORDER';
  const displayOrderId = orderId.length > 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  doc.save(`Invoice_${(order.shortCode || displayOrderId)}.pdf`);
};

export const printInvoicePDF = (order, customerInfo, options = {}) => {
  const doc = generateInvoicePDF(order, customerInfo, options);
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(url, '_blank');
};
