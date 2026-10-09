'use strict';

/**
 * Transactional email service (order confirmations) via Gmail SMTP.
 *
 * Configuration (server environment only — never the browser bundle):
 *   EMAIL_ENABLED=true
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
 *   SMTP_USER=crackershyderabad@gmail.com
 *   SMTP_PASSWORD=<Gmail App Password — never the account password>
 *   EMAIL_FROM_NAME=Crackers Hyderabad
 *   EMAIL_FROM_ADDRESS=crackershyderabad@gmail.com
 *   ADMIN_NOTIFICATION_EMAIL=admin.crackershyderabad@gmail.com
 *   ADMIN_BASE_URL=https://admin.crackershyderabad.com (optional override)
 *   TRACK_BASE_URL=https://crackershyderabad.com (optional override)
 *
 * Backwards compatibility: SMTP_HOST/PORT/USER/PASSWORD fall back to the
 * pre-existing EMAIL_HOST/PORT/USER/PASS names, and ADMIN_NOTIFICATION_EMAIL
 * falls back to the earlier INTERNAL_ORDER_EMAIL name, so the current KVM
 * environment keeps working unchanged.
 *
 * Security rules enforced here, not by callers:
 * - credentials are read from the environment at call time and never logged,
 *   never returned, never sent to the browser;
 * - failures return structured { ok:false } results — they never throw into
 *   the order flow, so mail can never break checkout.
 */

const nodemailer = require('nodemailer');
const { FieldValue } = require('firebase-admin/firestore');
const { orderConfirmationHtml, orderConfirmationText, statusCopy, emailSubject, internalNewOrderSubject, internalNewOrderHtml, internalNewOrderText } = require('./emailTemplates');

const DEFAULT_FROM_NAME = 'Crackers Hyderabad';
const DEFAULT_FROM_ADDRESS = 'crackershyderabad@gmail.com';
const DEFAULT_TRACK_BASE_URL = 'https://crackershyderabad.com';
/* Where the store's NEW ORDER notification goes. Configurable via
   ADMIN_NOTIFICATION_EMAIL; never a customer address, and never hardcoded at a
   call site. INTERNAL_ORDER_EMAIL is honoured as the earlier name. */
const DEFAULT_ADMIN_NOTIFICATION_EMAIL = 'admin.crackershyderabad@gmail.com';
/* Staff order screen base for the internal VIEW ORDER button. The route is
   login-gated and carries no tokens, so linking it is safe. */
const DEFAULT_ADMIN_BASE_URL = 'https://admin.crackershyderabad.com';

// Deliberately strict: exactly one address, so the value can never fan a
// single send out to a recipient list.
const SINGLE_EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

const isValidRecipient = (value) =>
  typeof value === 'string' && value.length <= 254 && SINGLE_EMAIL.test(value);

/** Read mail configuration from the environment. Never logs secrets. */
function readEmailConfig() {
  const enabled = String(process.env.EMAIL_ENABLED ?? 'true').toLowerCase() !== 'false';
  const host = (process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
  const portRaw = process.env.SMTP_PORT || process.env.EMAIL_PORT || '465';
  const port = Number.parseInt(portRaw, 10);
  const secureRaw = process.env.SMTP_SECURE;
  const secure = secureRaw !== undefined
    ? String(secureRaw).toLowerCase() === 'true'
    : port === 465;
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const pass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS || '';
  const fromName = (process.env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME).trim() || DEFAULT_FROM_NAME;
  const fromAddress = (process.env.EMAIL_FROM_ADDRESS || user || DEFAULT_FROM_ADDRESS).trim();
  const trackBaseUrl = (process.env.TRACK_BASE_URL || process.env.PUBLIC_SITE_URL || DEFAULT_TRACK_BASE_URL).replace(/\/+$/, '');
  // ADMIN_NOTIFICATION_EMAIL is the documented name; INTERNAL_ORDER_EMAIL is the
  // earlier one and still wins if a server already sets it, so an existing
  // deployment is never silently re-pointed at a different inbox.
  const adminNotificationEmail = (
    process.env.ADMIN_NOTIFICATION_EMAIL
    || process.env.INTERNAL_ORDER_EMAIL
    || DEFAULT_ADMIN_NOTIFICATION_EMAIL
  ).trim();
  const adminBaseUrl = (process.env.ADMIN_BASE_URL || DEFAULT_ADMIN_BASE_URL).replace(/\/+$/, '');

  const problems = [];
  if (!enabled) problems.push('disabled (EMAIL_ENABLED=false)');
  if (!user) problems.push('missing SMTP_USER');
  if (!pass) problems.push('missing SMTP_PASSWORD');
  if (!Number.isFinite(port) || port <= 0) problems.push('invalid SMTP_PORT');

  return {
    enabled,
    host,
    port,
    secure,
    user,
    from: `"${fromName}" <${fromAddress}>`,
    fromAddress,
    trackBaseUrl,
    adminNotificationEmail,
    adminBaseUrl,
    // Exposed for logging only — pass is deliberately OMITTED. The admin
    // recipient is not a credential (it is documented in .env.example), so it is
    // printed to make misrouting obvious in the server log.
    describe: `host=${host} port=${port} secure=${secure} user=${user ? '(set)' : '(missing)'} adminTo=${adminNotificationEmail || '(missing)'}`,
    ok: problems.length === 0,
    problems,
    hasSecrets: Boolean(pass),
  };
}

/** Build a Gmail SMTP transporter. Call time-outs bound checkout latency. */
function createSmtpTransporter(config) {
  const cfg = config || readEmailConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASS || '' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/** Strip anything credential-like from an SMTP error before logging/storing. */
function safeMailError(error) {
  const message = String((error && error.message) || error || 'Mail send failed');
  return message
    .replace(/pass(word)?=[^\s;]*/gi, 'pass=[redacted]')
    .slice(0, 200);
}

/**
 * Read the notify block as it is actually stored on the order document.
 *
 * The dedup flags are the record of what has already been sent, so they have to
 * come from the committed document — not from the object a caller happens to be
 * holding. createOrder builds its post-commit order object fresh every time, so
 * a guard that trusted it would always see "not sent yet" and a retried create
 * would mail the customer and the store twice for one order. The stored block
 * wins; the passed-in object is only a fallback when the document cannot be
 * read (and a failed read must never block an order).
 */
async function readStoredNotify(orderRef, fallback) {
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  if (!orderRef || typeof orderRef.get !== 'function') return base;
  try {
    const snap = await orderRef.get();
    const stored = snap && snap.exists ? snap.data() : null;
    const notify = stored && stored.notify;
    return notify && typeof notify === 'object' ? { ...base, ...notify } : base;
  } catch {
    return base;
  }
}

/**
 * Payment note for the confirmation email, derived only from stored order
 * data. Storefront orders carry no payment mode (pay on delivery); counter
 * orders record Cash / UPI / Card.
 */
function orderPaymentNote(order) {
  const mode = String(order.paymentMode || order.paymentStatus || '').trim();
  if (/^(cash|upi|card)$/i.test(mode)) {
    const label = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
    return `Payment received via ${label}. Please keep your order ID handy for tracking.`;
  }
  return 'Payment is collected on delivery. Please keep your order ID handy for tracking.';
}

/**
 * Send the minimal order-confirmation email. Pure send — the caller decides
 * when (after commit) and records the outcome on the order.
 *
 * Returns { ok:true, messageId } or { ok:false, skipped?, error? }.
 * Never throws; never includes credentials in any output.
 */
async function sendOrderConfirmationEmail(
  { to, orderCode, status, quantity, total, customerName, trackUrl, invoiceUrl, note, custom, customSubject, items, subtotal, discount, couponCode },
  { transporter } = {}
) {
  const config = readEmailConfig();

  if (!config.enabled) return { ok: false, skipped: 'disabled' };
  if (!isValidRecipient(to)) return { ok: false, skipped: 'no-recipient' };
  if (!config.ok) {
    console.warn(`[email] skipped ${orderCode || ''}: ${config.problems.join(', ')} (${config.describe})`);
    return { ok: false, skipped: 'unconfigured', error: config.problems.join(', ') };
  }

  const code = String(orderCode || '').toUpperCase();
  /* Both links carry the canonical Order ID, which the generator guarantees is
     URL-safe (A-Z, 0-9, `-`, `_`). encodeURIComponent is belt-and-braces so a
     legacy or hand-edited id containing anything else cannot break the link or,
     worse, add a query string to it. */
  const url = trackUrl || `${config.trackBaseUrl}/track/${encodeURIComponent(code)}`;
  // Invoice PDFs are generated client-side on the phone-gated /track-order
  // lookup, which hosts the real customer Download Invoice action. The code
  // rides as ?id= so the lookup is prefilled — never an admin route, never
  // a guessed endpoint.
  const invoice = invoiceUrl || `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`;
  const html = orderConfirmationHtml({ orderCode: code, status, quantity, total, trackUrl: url, invoiceUrl: invoice, customerName, note, custom, items, subtotal, discount, couponCode });
  const text = orderConfirmationText({ orderCode: code, status, quantity, total, trackUrl: url, invoiceUrl: invoice, customerName, note, custom, items, subtotal, discount, couponCode });

  let transport = transporter;
  let owned = false;
  if (!transport) {
    transport = createSmtpTransporter(config);
    owned = true;
  }

  try {
    const info = await transport.sendMail({
      from: config.from,
      replyTo: config.from,
      envelope: { from: config.fromAddress, to },
      // Structured single recipient: nodemailer cannot expand this into a list.
      to: [{ address: to, name: '' }],
      subject: emailSubject(code, status, customSubject),
      text,
      html,
    });
    console.log(`[email] confirmation sent for ${code} to <redacted> (messageId: ${info && info.messageId})`);
    return { ok: true, messageId: (info && info.messageId) || null };
  } catch (error) {
    const safe = safeMailError(error);
    console.warn(`[email] Order confirmation email failed for ${code}: ${safe}`);
    return { ok: false, error: safe };
  } finally {
    if (owned && transport && typeof transport.close === 'function') {
      try { transport.close(); } catch { /* pooled connection cleanup only */ }
    }
  }
}

/**
 * Best-effort post-commit hook for createOrder: send the confirmation once.
 *
 * - Reads the recipient from the SAVED order (customer.email, then userEmail).
 * - Skips silently when disabled, unconfigured, or without a valid address.
 * - Skips when notify.confirmationEmailSentAt is already set (retried/second
 *   calls never double-mail for the same order document).
 * - Records the outcome on the order (notify.confirmationEmailSentAt on
 *   success; notify.confirmationEmailError + attempts on failure) so admin
 *   tooling and future status emails can see what happened.
 * - Never throws: the order response must not depend on mail.
 */
async function maybeSendOrderConfirmationEmail(db, orderRef, order, { transporter } = {}) {
  const skipped = (reason, extra) => ({ ok: false, skipped: reason, ...(extra || {}) });
  // Lazy require: emailAutomation reads templates/branding and must not create
  // a module cycle with this file.
  const automation = require('./emailAutomation');
  try {
    const notify = await readStoredNotify(orderRef, order.notify);
    if (notify.confirmationEmailSentAt) return skipped('already-sent');

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return skipped('no-recipient');

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const config = readEmailConfig();
    const code = String(order.shortCode || '').toUpperCase();
    const trackUrl = `${config.trackBaseUrl}/track/${encodeURIComponent(code)}`;
    const invoiceUrl = `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`;

    /* Automation rule gate — a disabled Order Placed rule suppresses the send
       and records the skip in the delivery log. */
    const rules = await automation.readAutomationRules(db).catch(() => null);
    if (!automation.isEventEnabled(rules, 'placed')) {
      automation.logDelivery(db, {
        event: 'placed', orderId: orderRef.id, recipient: to,
        subject: '', status: 'skipped', error: 'automation-disabled',
      }).catch(() => {});
      return skipped('automation-disabled');
    }

    const resolved = await automation.resolveSendCustom(
      db, { event: 'placed', order, code, trackUrl, invoiceUrl, status: order.status || 'Pending' }
    ).catch(() => ({ error: 'template-read-failed' }));
    if (resolved.error) {
      automation.logDelivery(db, {
        event: 'placed', orderId: orderRef.id, recipient: to,
        subject: '', status: 'failed', error: resolved.error,
      }).catch(() => {});
      return { ok: false, error: resolved.error };
    }

    const result = await sendOrderConfirmationEmail(
      {
        to,
        orderCode: code,
        status: order.status || 'Pending',
        quantity,
        total: order.total ?? 0,
        customerName: order.customer?.name || '',
        trackUrl,
        invoiceUrl,
        note: orderPaymentNote(order),
        custom: resolved.custom,
        customSubject: resolved.customSubject,
        items: order.items,
        couponCode: order.coupon?.code,
        subtotal: order.subtotal,
        discount: order.discount,
      },
      { transporter }
    );

    automation.logDelivery(db, {
      event: 'placed', orderId: orderRef.id, recipient: to,
      subject: emailSubject(code, order.status || 'Pending', resolved.customSubject),
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? '' : String(result.error || result.skipped || ''),
      messageId: result.messageId || '',
    }).catch(() => {});

    try {
      if (result.ok) {
        await orderRef.update({
          'notify.confirmationEmailSentAt': FieldValue.serverTimestamp(),
          'notify.confirmationEmailAttempts': FieldValue.increment(1),
        });
      } else if (!result.skipped || result.skipped === 'unconfigured') {
        // Record genuine failures (and misconfiguration) for debugging; pure
        // skips (disabled / no recipient / already sent) leave no trace.
        await orderRef.update({
          'notify.confirmationEmailError': String(result.error || result.skipped || 'failed').slice(0, 200),
          'notify.confirmationEmailAttempts': FieldValue.increment(1),
        });
      }
    } catch (recordError) {
      console.warn(`[email] could not record outcome for ${code}: ${recordError.message}`);
    }

    if (!result.ok && !result.skipped) {
      console.warn(`[email] Order confirmation email failed for order ${orderRef.id} (${code})`);
    }
    return result;
  } catch (error) {
    console.warn(`[email] confirmation hook failed for order ${orderRef.id}: ${safeMailError(error)}`);
    return skipped('hook-error', { error: safeMailError(error) });
  }
}

/* Canonical stored status -> per-event dedup key. Statuses without a key
   (e.g. Pending) never trigger a status email. */
function statusEmailKey(status) {
  const key = String(status || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (key === 'confirmed') return 'confirmed';
  if (key === 'packed') return 'packed';
  if (key === 'shipped') return 'shipped';
  if (key === 'out for delivery') return 'outForDelivery';
  if (key === 'delivered' || key === 'completed') return 'delivered';
  if (key === 'cancelled') return 'cancelled';
  return null;
}

/**
 * ONE customer email for a single status event. Deduped per event key on the
 * order (notify.statusEmails.<key>.sentAt), so retries and repeated saves of
 * the same status never re-mail. Returns the send result; never throws.
 */
async function sendStatusUpdateEmail(db, orderRef, order, targetStatus, { transporter } = {}) {
  const skipped = (reason, extra) => ({ ok: false, skipped: reason, ...(extra || {}) });
  const automation = require('./emailAutomation');
  try {
    const key = statusEmailKey(targetStatus);
    if (!key) return skipped('not-mailable');

    // Counter bills carry no customer email (customer.email is '') and their
    // userEmail is the STAFF member who rang the sale up — a status mail would
    // land in the wrong inbox. Storefront orders never set source:'pos'.
    if (order.source === 'pos') return skipped('counter-sale');

    const notify = await readStoredNotify(orderRef, order.notify);
    const prior = notify.statusEmails && notify.statusEmails[key];
    if (prior && prior.sentAt) return skipped('already-sent');

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return skipped('no-recipient');

    /* Automation rule gate per status event. */
    const event = automation.STATUS_TO_EVENT[key] || key;
    const rules = await automation.readAutomationRules(db).catch(() => null);
    if (!automation.isEventEnabled(rules, event)) {
      automation.logDelivery(db, {
        event, orderId: orderRef.id, recipient: to,
        subject: '', status: 'skipped', error: 'automation-disabled',
      }).catch(() => {});
      return skipped('automation-disabled');
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const config = readEmailConfig();
    const code = String(order.shortCode || '').toUpperCase();
    const trackUrl = `${config.trackBaseUrl}/track/${encodeURIComponent(code)}`;
    const invoiceUrl = `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`;

    const resolved = await automation.resolveSendCustom(
      db, { event, order, code, trackUrl, invoiceUrl, status: targetStatus }
    ).catch(() => ({ error: 'template-read-failed' }));
    if (resolved.error) {
      automation.logDelivery(db, {
        event, orderId: orderRef.id, recipient: to,
        subject: '', status: 'failed', error: resolved.error,
      }).catch(() => {});
      return { ok: false, error: resolved.error };
    }

    const result = await sendOrderConfirmationEmail(
      {
        to,
        orderCode: code,
        status: targetStatus,
        quantity,
        total: order.total ?? 0,
        customerName: order.customer?.name || '',
        trackUrl,
        invoiceUrl,
        note: orderPaymentNote(order),
        custom: resolved.custom,
        customSubject: resolved.customSubject,
        items: order.items,
        couponCode: order.coupon?.code,
        subtotal: order.subtotal,
        discount: order.discount,
      },
      { transporter }
    );

    automation.logDelivery(db, {
      event, orderId: orderRef.id, recipient: to,
      subject: emailSubject(code, targetStatus, resolved.customSubject),
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? '' : String(result.error || result.skipped || ''),
      messageId: result.messageId || '',
    }).catch(() => {});

    try {
      if (result.ok) {
        await orderRef.update({
          [`notify.statusEmails.${key}.sentAt`]: FieldValue.serverTimestamp(),
          [`notify.statusEmails.${key}.attempts`]: FieldValue.increment(1),
        });
      } else if (!result.skipped || result.skipped === 'unconfigured') {
        await orderRef.update({
          'notify.statusEmailError': String(result.error || result.skipped || 'failed').slice(0, 200),
          [`notify.statusEmails.${key}.attempts`]: FieldValue.increment(1),
        });
      }
    } catch (recordError) {
      console.warn(`[email] could not record status outcome for ${code}: ${recordError.message}`);
    }
    return result;
  } catch (error) {
    console.warn(`[email] status hook failed: ${safeMailError(error)}`);
    return skipped('hook-error', { error: safeMailError(error) });
  }
}

/* Delivery block for the internal mail, from whichever address shape the
   order carries. Plain text joined with <br> by the caller template. */
function internalDeliveryLines(order) {
  const d = order.delivery || {};
  const c = order.customer || {};
  const parts = d.sameAsBilling
    ? [c.address, c.city, c.pincode]
    : [d.flatNo && `${d.flatNo}`, d.streetNo, d.area, d.city, d.state, d.pincode];
  return parts.filter(Boolean).join(', ') || 'N/A';
}

/**
 * Order date for the internal mail, rendered in IST so the store reads the same
 * clock as its customers. Accepts a Firestore Timestamp (has toDate), a Date, or
 * an ISO/parseable string. Returns '' when there is nothing usable — the caller
 * then omits the row rather than inventing a date.
 */
function internalOrderDate(order) {
  const raw = order.createdAt || order.orderDate || order.placedAt;
  if (!raw) return '';
  let date;
  if (typeof raw.toDate === 'function') {
    date = raw.toDate();                       // Firestore Timestamp
  } else if (raw instanceof Date) {
    date = raw;
  } else {
    date = new Date(String(raw));
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toISOString();
  }
}

/**
 * ONE internal new-order notification to the store after commit. Guarded by
 * notify.internalNewOrderEmailSentAt so retried creates never double-notify.
 * Never throws; never mails the customer.
 */
async function maybeSendInternalNewOrderEmail(db, orderRef, order, { transporter } = {}) {
  const skipped = (reason, extra) => ({ ok: false, skipped: reason, ...(extra || {}) });
  const automation = require('./emailAutomation');
  try {
    const notify = await readStoredNotify(orderRef, order.notify);
    if (notify.internalNewOrderEmailSentAt) return skipped('already-sent');

    const config = readEmailConfig();
    if (!config.enabled) return skipped('disabled');
    if (!config.ok) {
      console.warn(`[email] internal skipped: ${config.problems.join(', ')} (${config.describe})`);
      return skipped('unconfigured', { error: config.problems.join(', ') });
    }

    const to = config.adminNotificationEmail;
    if (!isValidRecipient(to)) return skipped('no-recipient');

    /* Automation rule gate — a disabled Internal New Order rule suppresses
       the staff notification. It can never reroute to the customer: `to`
       stays the configured store inbox. */
    const rules = await automation.readAutomationRules(db).catch(() => null);
    if (!automation.isEventEnabled(rules, 'internalNewOrder')) {
      automation.logDelivery(db, {
        event: 'internalNewOrder', orderId: orderRef.id, recipient: to,
        subject: '', status: 'skipped', error: 'automation-disabled',
      }).catch(() => {});
      return skipped('automation-disabled');
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const code = String(order.shortCode || '').toUpperCase();
    const adminBase = config.adminBaseUrl;
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const delivery = internalDeliveryLines(order);
    const payload = {
      orderCode: code,
      customerName: order.customer?.name || 'N/A',
      customerEmail: order.customer?.email || order.userEmail || 'N/A',
      customerPhone: order.customer?.phone || order.userPhone || 'N/A',
      quantity,
      total: order.total ?? 0,
      paymentMethod: order.paymentMode || order.paymentStatus || 'Cash on Delivery',
      orderDate: internalOrderDate(order),
      deliveryLines: esc(delivery).replace(/, /g, '<br>'),
      deliveryText: delivery,
      viewOrderUrl: `${adminBase}/orders/${orderRef.id}`,
    };
    const html = internalNewOrderHtml(payload);
    const text = internalNewOrderText(payload);

    let transport = transporter;
    let owned = false;
    if (!transport) {
      transport = createSmtpTransporter(config);
      owned = true;
    }
    try {
      const info = await transport.sendMail({
        from: config.from,
        replyTo: config.from,
        envelope: { from: config.fromAddress, to },
        to: [{ address: to, name: '' }],
        subject: internalNewOrderSubject(code),
        text,
        html,
      });
      console.log(`[email] internal new-order sent for ${code} (messageId: ${info && info.messageId})`);
      automation.logDelivery(db, {
        event: 'internalNewOrder', orderId: orderRef.id, recipient: to,
        subject: internalNewOrderSubject(code),
        status: 'sent', error: '', messageId: (info && info.messageId) || null,
      }).catch(() => {});
      try {
        await orderRef.update({
          'notify.internalNewOrderEmailSentAt': FieldValue.serverTimestamp(),
          'notify.internalNewOrderEmailAttempts': FieldValue.increment(1),
        });
      } catch (recordError) {
        console.warn(`[email] could not record internal outcome for ${code}: ${recordError.message}`);
      }
      return { ok: true, messageId: (info && info.messageId) || null };
    } catch (error) {
      const safe = safeMailError(error);
      console.warn(`[email] internal new-order failed for ${code}: ${safe}`);
      try {
        await orderRef.update({
          'notify.internalNewOrderEmailError': safe,
          'notify.internalNewOrderEmailAttempts': FieldValue.increment(1),
        });
      } catch { /* record-only */ }
      return { ok: false, error: safe };
    } finally {
      if (owned && transport && typeof transport.close === 'function') {
        try { transport.close(); } catch { /* pooled connection cleanup only */ }
      }
    }
  } catch (error) {
    console.warn(`[email] internal hook failed: ${safeMailError(error)}`);
    return skipped('hook-error', { error: safeMailError(error) });
  }
}

module.exports = {
  readEmailConfig,
  createSmtpTransporter,
  sendOrderConfirmationEmail,
  maybeSendOrderConfirmationEmail,
  sendStatusUpdateEmail,
  maybeSendInternalNewOrderEmail,
  statusEmailKey,
  orderPaymentNote,
  internalOrderDate,
  internalDeliveryLines,
  isValidRecipient,
  safeMailError,
};
