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
 *   TRACK_BASE_URL=https://crackershyderabad.com (optional override)
 *
 * Backwards compatibility: SMTP_HOST/PORT/USER/PASSWORD fall back to the
 * pre-existing EMAIL_HOST/PORT/USER/PASS names, so the current KVM
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
/* Internal new-order notifications go ONLY here — never to a customer. */
const DEFAULT_INTERNAL_ORDER_EMAIL = 'crackershyderabad@gmail.com';
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
    // Exposed for logging only — pass is deliberately OMITTED.
    describe: `host=${host} port=${port} secure=${secure} user=${user ? '(set)' : '(missing)'}`,
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
  { to, orderCode, status, quantity, total, customerName, trackUrl, invoiceUrl, note },
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
  const url = trackUrl || `${config.trackBaseUrl}/track/${code}`;
  // Invoice PDFs are generated client-side on the phone-gated /track-order
  // lookup, which hosts the real customer Download Invoice action. The code
  // rides as ?id= so the lookup is prefilled — never an admin route, never
  // a guessed endpoint.
  const invoice = invoiceUrl || `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`;
  const html = orderConfirmationHtml({ orderCode: code, status, quantity, total, trackUrl: url, invoiceUrl: invoice, customerName, note });
  const text = orderConfirmationText({ orderCode: code, status, quantity, total, trackUrl: url, invoiceUrl: invoice, customerName, note });

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
      subject: emailSubject(code, status),
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
  try {
    const notify = order.notify || {};
    if (notify.confirmationEmailSentAt) return skipped('already-sent');

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return skipped('no-recipient');

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const config = readEmailConfig();
    const code = String(order.shortCode || '').toUpperCase();

    const result = await sendOrderConfirmationEmail(
      {
        to,
        orderCode: code,
        status: order.status || 'Pending',
        quantity,
        total: order.total ?? 0,
        customerName: order.customer?.name || '',
        trackUrl: `${config.trackBaseUrl}/track/${code}`,
        invoiceUrl: `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`,
        note: orderPaymentNote(order),
      },
      { transporter }
    );

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
  try {
    const key = statusEmailKey(targetStatus);
    if (!key) return skipped('not-mailable');

    // Counter bills carry no customer email (customer.email is '') and their
    // userEmail is the STAFF member who rang the sale up — a status mail would
    // land in the wrong inbox. Storefront orders never set source:'pos'.
    if (order.source === 'pos') return skipped('counter-sale');

    const notify = order.notify || {};
    const prior = notify.statusEmails && notify.statusEmails[key];
    if (prior && prior.sentAt) return skipped('already-sent');

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return skipped('no-recipient');

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const config = readEmailConfig();
    const code = String(order.shortCode || '').toUpperCase();

    const result = await sendOrderConfirmationEmail(
      {
        to,
        orderCode: code,
        status: targetStatus,
        quantity,
        total: order.total ?? 0,
        customerName: order.customer?.name || '',
        trackUrl: `${config.trackBaseUrl}/track/${code}`,
        invoiceUrl: `${config.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`,
        note: orderPaymentNote(order),
      },
      { transporter }
    );

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
 * ONE internal new-order notification to the store after commit. Guarded by
 * notify.internalNewOrderEmailSentAt so retried creates never double-notify.
 * Never throws; never mails the customer.
 */
async function maybeSendInternalNewOrderEmail(db, orderRef, order, { transporter } = {}) {
  const skipped = (reason, extra) => ({ ok: false, skipped: reason, ...(extra || {}) });
  try {
    const notify = order.notify || {};
    if (notify.internalNewOrderEmailSentAt) return skipped('already-sent');

    const config = readEmailConfig();
    if (!config.enabled) return skipped('disabled');
    if (!config.ok) {
      console.warn(`[email] internal skipped: ${config.problems.join(', ')} (${config.describe})`);
      return skipped('unconfigured', { error: config.problems.join(', ') });
    }

    const to = (process.env.INTERNAL_ORDER_EMAIL || DEFAULT_INTERNAL_ORDER_EMAIL).trim();
    if (!isValidRecipient(to)) return skipped('no-recipient');

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const code = String(order.shortCode || '').toUpperCase();
    const adminBase = (process.env.ADMIN_BASE_URL || DEFAULT_ADMIN_BASE_URL).replace(/\/+$/, '');
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
  isValidRecipient,
  safeMailError,
};
