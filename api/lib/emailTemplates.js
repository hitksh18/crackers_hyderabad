'use strict';

/**
 * Transactional email templates for Crackers Hyderabad.
 *
 * Premium compact order-confirmation + tracking notification — NOT an invoice.
 * Charcoal text, warm off-white canvas, deep brand red + gold accents.
 * Transactional only: customer name, order id, quantity, total, live status,
 * payment note, track + invoice actions. NEVER any product names, images,
 * per-item prices, S.No / Qty / Price columns, item tables, taglines or
 * marketing copy. The itemised invoice lives behind DOWNLOAD INVOICE.
 *
 * Email-client rules (Gmail desktop + mobile / Outlook / Apple Mail):
 * - table-based layout, inline CSS, safe font stacks (no external fetch);
 * - one external image only (the brand logo, with alt text + wordmark
 *   fallback for clients that block images by default);
 * - NO JavaScript, NO animations, NO CSS grid, NO complex flexbox,
 *   NO tracking params, three links max (track, invoice surface, website);
 * - every send is multipart (HTML + plain text).
 *
 * Interface preserved: orderConfirmationHtml, orderConfirmationText,
 * statusCopy, stepIndexForStatus, EMAIL_STEPS keep their names so callers in
 * lib/email.js work unchanged. emailSubject / emailPreheader are additive.
 * invoiceUrl points at the phone-gated /track-order lookup (with the code
 * prefilled), which hosts the real customer Download Invoice action —
 * never an admin route, never a guessed endpoint.
 */

const { escapeHtml } = require('./security');

/* Five customer-facing milestones, exactly as tracked on the site. */
const EMAIL_STEPS = ['Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

const STEP_FOR_STATUS = {
  pending: 0,
  ordered: 0,
  confirmed: 0,
  packed: 1,
  shipped: 2,
  'out for delivery': 3,
  delivered: 4,
  completed: 4,
};

/** Index of the current step for a stored status; unknown → 0, never Delivered. */
function stepIndexForStatus(status) {
  const key = String(status || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (key === 'cancelled') return -1;
  if (Object.prototype.hasOwnProperty.call(STEP_FOR_STATUS, key)) return STEP_FOR_STATUS[key];
  return 0;
}

const formatINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

/* Per-status headline + subject fragment. */
const STATUS_COPY = {
  Pending: { headline: 'Your order is confirmed', subject: 'Order Confirmed' },
  Confirmed: { headline: 'Your order is confirmed', subject: 'Order Confirmed' },
  Packed: { headline: 'Your order is packed', subject: 'Order Packed' },
  Shipped: { headline: 'Your order has shipped', subject: 'Order Shipped' },
  'Out for Delivery': { headline: 'Your order is out for delivery', subject: 'Out for Delivery' },
  Delivered: { headline: 'Your order was delivered', subject: 'Order Delivered' },
  Cancelled: { headline: 'Your order was cancelled', subject: 'Order Cancelled' },
};

function statusCopy(status) {
  return STATUS_COPY[status] || STATUS_COPY.Pending;
}

/**
 * Transactional subject line. Sentence case, no emoji, no promo/urgency
 * wording (spam triggers).
 */
function emailSubject(orderCode, status) {
  const code = String(orderCode || 'N/A').toUpperCase();
  const key = String(status || 'Pending').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const verb =
    key === 'pending' || key === 'ordered' || key === 'confirmed' ? 'is confirmed' :
    key === 'packed' ? 'is packed' :
    key === 'shipped' ? 'has shipped' :
    key === 'out for delivery' ? 'is out for delivery' :
    key === 'delivered' || key === 'completed' ? 'has been delivered' :
    key === 'cancelled' ? 'has been cancelled' :
    'is confirmed';
  return `Your Crackers Hyderabad order #${code} ${verb}`;
}

/** Inbox preview line. Rendered hidden at the top of the HTML body. */
function emailPreheader(orderCode) {
  const code = String(orderCode || 'N/A').toUpperCase();
  return `Your Crackers Hyderabad order #${code} has been confirmed.`;
}

/* ---- Horizontal progress tracker --------------------------------------
 * One row, five cells. Each cell draws its dot flanked by connector halves,
 * so dots and lines always align in every client (pure tables, no
 * positioning). Outer halves of the first/last cells are transparent.
 * State is carried by icon AND shade AND weight, never colour alone.
 */
function progressTracker(activeIndex) {
  const cells = EMAIL_STEPS.map((label, index) => {
    const done = index < activeIndex;
    const current = index === activeIndex;
    const marker = done ? '✓' : current ? '●' : '○';
    const dotBg = done ? '#761713' : current ? '#C33A14' : '#FFFFFF';
    const dotColor = done || current ? '#FFFFFF' : '#B4A996';
    const dotBorder = done || current ? '1px solid transparent' : '1px solid #C9BFAE';
    const labelColor = done || current ? '#211A15' : '#6B6259';
    const weight = done || current ? 'bold' : 'normal';
    // Connector halves: the segment left of step i is "done" when step i-1
    // is done-or-current, i.e. i <= activeIndex. Right of step i is done
    // when step i itself is done, i.e. i < activeIndex.
    const leftDone = index <= activeIndex;
    const rightDone = index < activeIndex;
    const leftColor = index === 0 ? 'transparent' : leftDone ? '#C33A14' : '#E2D7C0';
    const rightColor = index === EMAIL_STEPS.length - 1 ? 'transparent' : rightDone ? '#C33A14' : '#E2D7C0';
    return `
      <td align="center" valign="top" width="20%" style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding:11px 0;border-top:2px solid ${leftColor};font-size:0;line-height:0;">&nbsp;</td>
            <td width="26" align="center" valign="middle" style="padding:0;">
              <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:${dotBg};color:${dotColor};border:${dotBorder};font-size:12px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;text-align:center;">${marker}</div>
            </td>
            <td width="50%" style="padding:11px 0;border-top:2px solid ${rightColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
        <div class="step-label" style="padding-top:6px;font-size:12px;line-height:1.4;color:${labelColor};font-weight:${weight};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</div>
      </td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

/**
 * Premium order-confirmation email (HTML). Inputs are plain values already
 * resolved server-side from the saved order — never trust frontend totals.
 */
function orderConfirmationHtml({ orderCode, status, quantity, total, trackUrl, invoiceUrl, customerName, note }) {
  const code = escapeHtml(String(orderCode || 'N/A').toUpperCase());
  const activeIndex = stepIndexForStatus(status);
  const cancelled = activeIndex === -1;
  const items = Number(quantity) || 0;
  const preheader = escapeHtml(emailPreheader(code));
  const safeTrack = escapeHtml(trackUrl || '');
  const safeInvoice = escapeHtml(invoiceUrl || trackUrl || '');
  const safeNote = note ? escapeHtml(note) : '';
  const year = new Date().getFullYear();

  const tracker = cancelled
    ? `<p style="margin:0 0 4px;font-size:14px;color:#CB2A2A;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">This order was cancelled.</p>
       <p style="margin:0;font-size:13px;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">If this looks wrong, just reply to this email with order #${code}.</p>`
    : progressTracker(activeIndex);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Order confirmed #${code}</title>
<style>
  @media only screen and (max-width:480px){
    .container{width:100% !important;}
    .px{padding-left:18px !important;padding-right:18px !important;}
    .brand-name{font-size:17px !important;}
    .logo-img{width:40px !important;height:40px !important;}
    .h1{font-size:20px !important;}
    .step-label{font-size:10.5px !important;}
    .total-value{font-size:20px !important;}
    .btn-cell{display:block !important;width:100% !important;padding:0 0 10px 0 !important;}
    .btn-cell-last{padding-bottom:0 !important;}
    .btn-link{display:block !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E7DCC8;">
        <tr>
          <td class="px" style="padding:16px 28px;border-bottom:1px solid #EFE7D6;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" style="padding:0;">
                  <img class="logo-img" src="https://crackershyderabad.com/images/website/nav-logo.png" alt="Crackers Hyderabad" width="48" height="48" style="display:block;width:48px;height:48px;border:0;">
                </td>
                <td valign="middle" style="padding:0 0 0 14px;">
                  <div class="brand-name" style="font-size:19px;color:#211A15;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Crackers Hyderabad</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:26px 32px 0;">
            <div style="font-size:13px;letter-spacing:2.5px;color:#761713;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">ORDER CONFIRMED</div>
            <h1 class="h1" style="margin:8px 0 6px;font-size:23px;color:#211A15;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Thank you${customerName ? `, ${escapeHtml(customerName)}` : ''}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">Your order has been successfully placed.</p>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:20px 32px 0;">
            ${tracker}
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:22px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EF;border:1px solid #E7DCC8;border-radius:10px;">
              <tr>
                <td style="padding:16px 20px 4px;font-size:11px;letter-spacing:2px;color:#9E7029;font-family:Arial,Helvetica,sans-serif;">ORDER DETAILS</td>
              </tr>
              <tr>
                <td style="padding:6px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">Order ID</td>
                      <td align="right" style="padding:8px 0;font-size:15px;color:#761713;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">#${code}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-top:1px solid #EFE7D6;font-size:13px;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">Quantity</td>
                      <td align="right" style="padding:8px 0;border-top:1px solid #EFE7D6;font-size:15px;color:#211A15;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${items} item${items === 1 ? '' : 's'}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;border-top:1px solid #EFE7D6;font-size:14px;color:#211A15;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Total Bill</td>
                      <td class="total-value" align="right" style="padding:10px 0;border-top:1px solid #EFE7D6;font-size:22px;color:#761713;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${formatINR(total)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${safeNote ? `<tr>
          <td class="px" style="padding:16px 32px 0;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#4A423B;font-family:Arial,Helvetica,sans-serif;"><strong style="color:#211A15;">Note:</strong> ${safeNote}</p>
          </td>
        </tr>` : ''}
        <tr>
          <td class="px" style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="btn-cell" width="50%" valign="top" style="padding:0 6px 0 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#C33A14" style="border-radius:10px;background:#C33A14;">
                        <a class="btn-link" href="${safeTrack}" style="display:inline-block;padding:15px 20px;color:#FFFFFF;font-size:14px;font-weight:bold;text-decoration:none;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">TRACK YOUR ORDER</a>
                      </td>
                    </tr>
                  </table>
                </td>
                <td class="btn-cell btn-cell-last" width="50%" valign="top" style="padding:0 0 0 6px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#FFFFFF" style="border-radius:10px;background:#FFFFFF;border:1px solid #C33A14;">
                        <a class="btn-link" href="${safeInvoice}" style="display:inline-block;padding:14px 20px;color:#C33A14;font-size:14px;font-weight:bold;text-decoration:none;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">DOWNLOAD INVOICE</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:18px 32px 0;">
            <div style="text-align:center;font-size:13px;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">Need help with your order? Just reply to this email.</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 28px 24px;">
            <div style="margin:0 auto;height:1px;width:120px;background:#D2A64F;font-size:0;line-height:0;">&nbsp;</div>
            <div style="padding-top:12px;font-size:12px;letter-spacing:2px;color:#211A15;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">CRACKERS HYDERABAD</div>
            <div style="padding-top:4px;font-size:12px;color:#4A423B;font-family:Arial,Helvetica,sans-serif;">Hyderabad, Telangana</div>
            <div style="padding-top:6px;font-size:12px;font-family:Arial,Helvetica,sans-serif;"><a href="https://crackershyderabad.com" style="color:#9E7029;text-decoration:underline;">Visit crackershyderabad.com</a></div>
            <div style="padding-top:10px;font-size:11px;color:#6B6259;font-family:Arial,Helvetica,sans-serif;">&copy; ${year} Crackers Hyderabad. This is an automated confirmation for order #${code}.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Plain-text fallback. Concise by design — required fields only. */
function orderConfirmationText({ orderCode, status, quantity, total, trackUrl, invoiceUrl, customerName, note }) {
  const code = String(orderCode || 'N/A').toUpperCase();
  const copy = statusCopy(status);
  const items = Number(quantity) || 0;
  const lines = [
    'Crackers Hyderabad',
    copy.headline,
    '',
  ];
  if (customerName) lines.push(`Thank you, ${String(customerName)}.`, '');
  lines.push(
    `Order ID: #${code}`,
    `Quantity: ${items} item${items === 1 ? '' : 's'}`,
    `Total Bill: ${formatINR(total)}`,
    `Status: ${status || 'Pending'}`,
    '',
  );
  if (note) lines.push(`Note: ${String(note)}`, '');
  lines.push(
    `Track Your Order: ${trackUrl || ''}`,
    `Download Invoice: ${invoiceUrl || trackUrl || ''}`,
    '',
    'Need help? Just reply to this email or visit https://crackershyderabad.com',
    'Crackers Hyderabad, Hyderabad, Telangana | www.crackershyderabad.com',
  );
  return lines.join('\n');
}

/**
 * Internal new-order notification (to the store, never the customer).
 * Compact operational layout, visually distinct from the customer mail:
 * no tracker, no invoice CTA — identity, money, address, and a link to the
 * staff order screen (login-gated, no tokens in the URL).
 */
function internalNewOrderSubject(orderCode) {
  return `New Order Placed — #${String(orderCode || 'N/A').toUpperCase()}`;
}

function internalNewOrderHtml({ orderCode, customerName, customerEmail, customerPhone, quantity, total, paymentMethod, deliveryLines, viewOrderUrl }) {
  const code = escapeHtml(String(orderCode || 'N/A').toUpperCase());
  const year = new Date().getFullYear();
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#6B6259;font-family:Arial,Helvetica,sans-serif;">${label}</td>
      <td align="right" style="padding:8px 0;font-size:13px;color:#211A15;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${value}</td>
    </tr>`;
  const safeView = viewOrderUrl ? escapeHtml(viewOrderUrl) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>New order #${code}</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E7DCC8;">
        <tr>
          <td style="padding:16px 28px;border-bottom:1px solid #EFE7D6;">
            <div style="font-size:19px;color:#211A15;font-weight:bold;font-family:Georgia,'Times New Roman',serif;">Crackers Hyderabad — New Order</div>
            <div style="padding-top:2px;font-size:11px;letter-spacing:2px;color:#9E7029;font-family:Arial,Helvetica,sans-serif;">STAFF NOTIFICATION</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${row('Order', `#${code}`)}
              ${row('Customer', escapeHtml(customerName || 'N/A'))}
              ${row('Email', escapeHtml(customerEmail || 'N/A'))}
              ${row('Phone', escapeHtml(customerPhone || 'N/A'))}
              ${row('Quantity', `${Number(quantity) || 0} item${Number(quantity) === 1 ? '' : 's'}`)}
              ${row('Order Total', formatINR(total))}
              ${row('Payment', escapeHtml(paymentMethod || 'Cash on Delivery'))}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 0;">
            <div style="font-size:11px;letter-spacing:2px;color:#9E7029;font-family:Arial,Helvetica,sans-serif;">DELIVERY</div>
            <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#211A15;font-family:Arial,Helvetica,sans-serif;">${deliveryLines}</p>
          </td>
        </tr>
        ${safeView ? `<tr>
          <td style="padding:20px 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" bgcolor="#761713" style="border-radius:10px;background:#761713;">
                  <a href="${safeView}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;font-size:14px;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">VIEW ORDER</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}
        <tr>
          <td align="center" style="padding:20px 28px 24px;font-size:11px;color:#6B6259;font-family:Arial,Helvetica,sans-serif;">&copy; ${year} Crackers Hyderabad — internal notification for order #${code}.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function internalNewOrderText({ orderCode, customerName, customerEmail, customerPhone, quantity, total, paymentMethod, deliveryText, viewOrderUrl }) {
  const code = String(orderCode || 'N/A').toUpperCase();
  const lines = [
    'Crackers Hyderabad — STAFF NOTIFICATION',
    `New order placed: #${code}`,
    '',
    `Customer: ${customerName || 'N/A'}`,
    `Email: ${customerEmail || 'N/A'}`,
    `Phone: ${customerPhone || 'N/A'}`,
    `Quantity: ${Number(quantity) || 0} items`,
    `Order Total: ${formatINR(total)}`,
    `Payment: ${paymentMethod || 'Cash on Delivery'}`,
    '',
    `Delivery: ${deliveryText || 'N/A'}`,
    '',
  ];
  if (viewOrderUrl) lines.push(`View order: ${viewOrderUrl}`, '');
  lines.push(`Internal notification for order #${code}.`);
  return lines.join('\n');
}

module.exports = {
  EMAIL_STEPS,
  stepIndexForStatus,
  statusCopy,
  emailSubject,
  emailPreheader,
  orderConfirmationHtml,
  orderConfirmationText,
  internalNewOrderSubject,
  internalNewOrderHtml,
  internalNewOrderText,
};
