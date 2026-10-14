'use strict';
/**
 * Email Automation: rules, templates, branding, tokens, delivery log.
 *
 * This layer sits BETWEEN the existing send pipeline (lib/email.js, which
 * owns SMTP, rendering and per-order dedup) and the admin UI. It adds:
 *
 * - per-event ON/OFF rules (emailAutomation/rules) gating every automated
 *   send; defaults preserve today's behavior (everything enabled);
 * - editable customer templates (emailAutomation/templates) with {TOKEN}
 *   rendering — unknown tokens refuse the send, never reach a customer;
 * - branding (emailAutomation/branding) for sender identity and CTA accent;
 * - a delivery log (emailAutomation/logs) with sent/failed/skipped states;
 * - explicit test + compose sends through the same backend transport.
 *
 * Nothing here mints order ids, touches orders, or holds SMTP secrets —
 * credentials stay in server environment via lib/email.js.
 */

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
/* The single customer-facing Order ID reader (shortCode, strict — never the
   document id). */
const { getDisplayOrderId } = require('./orderId');
const {
  readEmailConfig,
  createSmtpTransporter,
  isValidRecipient,
  safeMailError,
  orderPaymentNote,
} = require('./email');
const {
  orderConfirmationHtml,
  orderConfirmationText,
  emailSubject,
  emailPreheader,
} = require('./emailTemplates');

const RULES_DOC = 'emailAutomation/rules';
const TEMPLATES_DOC = 'emailAutomation/templates';
const BRANDING_DOC = 'emailAutomation/branding';
/* Top-level collection (a slash path is not a valid collection reference). */
const LOGS_COLLECTION = 'emailLogs';
const LOG_KEEP = 400;
const LOG_TRIM_TO = 250;

const EVENTS = Object.freeze([
  { key: 'placed', label: 'Order Placed', recipient: 'customer', desc: 'Sent right after a new order is placed.' },
  { key: 'confirmed', label: 'Order Confirmed', recipient: 'customer', desc: 'Sent when an order moves to Confirmed.' },
  { key: 'packed', label: 'Order Packed', recipient: 'customer', desc: 'Sent when an order is packed.' },
  { key: 'shipped', label: 'Order Shipped', recipient: 'customer', desc: 'Sent when the parcel is handed to the courier.' },
  { key: 'outForDelivery', label: 'Out for Delivery', recipient: 'customer', desc: 'Sent when the order leaves for delivery.' },
  { key: 'delivered', label: 'Order Delivered', recipient: 'customer', desc: 'Sent when an order is delivered.' },
  { key: 'cancelled', label: 'Order Cancelled', recipient: 'customer', desc: 'Sent when an order is cancelled.' },
  { key: 'detailsUpdated', label: 'Order Details Updated', recipient: 'customer', desc: 'Sent when staff edits items or totals on an order.' },
  { key: 'internalNewOrder', label: 'Internal New Order', recipient: 'staff', desc: 'Store inbox notification for every new order. Never sent to customers.' },
]);

/* statusEmailKey() output -> automation event. */
const STATUS_TO_EVENT = Object.freeze({
  confirmed: 'confirmed',
  packed: 'packed',
  shipped: 'shipped',
  outForDelivery: 'outForDelivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
});

const DEFAULT_TEMPLATE_FIELDS = Object.freeze({
  subject: '',
  preheader: '',
  heading: '',
  body: '',
  buttonText: '',
  buttonUrl: '',
});

const TEMPLATE_LIMITS = Object.freeze({
  subject: 120,
  preheader: 150,
  heading: 120,
  body: 5000,
  buttonText: 40,
  buttonUrl: 300,
});

const DEFAULT_BRANDING = Object.freeze({
  storeName: 'Crackers Hyderabad',
  senderName: 'Crackers Hyderabad',
  logoUrl: 'https://crackershyderabad.com/images/website/nav-logo.png',
  storeUrl: 'https://crackershyderabad.com',
  replyTo: '',
  supportEmail: 'crackershyderabad@gmail.com',
  supportPhone: '',
  accentColor: '#C33A14',
});

/* Every token the renderer understands. Known-but-empty resolves to '' —
   only genuinely unknown {BRACES} refuse a send. */
const TOKENS = Object.freeze([
  'CUSTOMER_NAME', 'CUSTOMER_EMAIL', 'ORDER_ID', 'ORDER_DATE', 'ORDER_STATUS',
  'ORDER_ITEMS', 'SUBTOTAL', 'DISCOUNT', 'COUPON_CODE', 'ORDER_TOTAL', 'SAVINGS',
  'DELIVERY_ADDRESS', 'CITY', 'PINCODE', 'MOBILE', 'TRACKING_NUMBER',
  'TRACKING_URL', 'COURIER_NAME', 'PAYMENT_METHOD', 'PAYMENT_STATUS',
  'CANCELLATION_REASON', 'REFUND_AMOUNT', 'STORE_NAME', 'STORE_PHONE',
  'STORE_EMAIL', 'STORE_URL', 'ORDER_URL',
]);

const cleanText = (value, max) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const istDate = (raw) => {
  const date = raw && typeof raw.toDate === 'function' ? raw.toDate() : raw ? new Date(raw) : null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date.toISOString();
  }
};

/* ---------------- rules ---------------- */

function defaultRules() {
  const events = {};
  for (const e of EVENTS) events[e.key] = { enabled: true };
  return { events, updatedAt: null, updatedBy: null };
}

async function readAutomationRules(db) {
  const base = defaultRules();
  try {
    const snap = await db.doc(RULES_DOC).get();
    if (!snap.exists) return base;
    const stored = (snap.data() || {}).events || {};
    for (const e of EVENTS) {
      if (stored[e.key] && typeof stored[e.key].enabled === 'boolean') {
        base.events[e.key] = { enabled: stored[e.key].enabled };
      }
    }
    return base;
  } catch {
    return base;
  }
}

function validateRulesInput(input) {
  const errors = {};
  const events = (input && input.events) || {};
  for (const e of EVENTS) {
    const node = events[e.key];
    if (node !== undefined && (!node || typeof node.enabled !== 'boolean')) {
      errors[e.key] = `${e.label} must be ON or OFF.`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const value = {};
  for (const e of EVENTS) value[e.key] = { enabled: events[e.key] ? events[e.key].enabled === true : true };
  return { ok: true, errors: null, value };
}

async function writeAutomationRules(db, events, { userEmail } = {}) {
  const payload = {
    events,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || null,
  };
  await db.doc(RULES_DOC).set(payload, { merge: true });
  return payload;
}

function isEventEnabled(rules, key) {
  return !rules || !rules.events || !rules.events[key] ? true : rules.events[key].enabled !== false;
}

/* ---------------- templates ---------------- */

function defaultTemplates() {
  const out = {};
  for (const e of EVENTS) out[e.key] = { ...DEFAULT_TEMPLATE_FIELDS };
  return out;
}

async function readTemplates(db) {
  const base = defaultTemplates();
  try {
    const snap = await db.doc(TEMPLATES_DOC).get();
    if (!snap.exists) return base;
    const stored = snap.data() || {};
    for (const e of EVENTS) {
      const node = stored[e.key];
      if (node && typeof node === 'object') {
        for (const field of Object.keys(DEFAULT_TEMPLATE_FIELDS)) {
          if (typeof node[field] === 'string') base[e.key][field] = node[field].slice(0, TEMPLATE_LIMITS[field]);
        }
      }
    }
    return base;
  } catch {
    return base;
  }
}

function validateTemplatesInput(input) {
  const errors = {};
  const value = {};
  const body = (input && typeof input === 'object' ? input : {});
  for (const e of EVENTS) {
    const node = body[e.key];
    if (node === undefined) {
      value[e.key] = { ...DEFAULT_TEMPLATE_FIELDS };
      continue;
    }
    if (!node || typeof node !== 'object') {
      errors[e.key] = `${e.label} template must be an object.`;
      continue;
    }
    value[e.key] = {};
    for (const field of Object.keys(DEFAULT_TEMPLATE_FIELDS)) {
      const v = node[field];
      if (v !== undefined && typeof v !== 'string') {
        errors[`${e.key}.${field}`] = `${e.label} ${field} must be text.`;
        continue;
      }
      value[e.key][field] = String(v ?? '').slice(0, TEMPLATE_LIMITS[field]);
    }
  }
  // Button URL must be a relative path or http(s) — never javascript:.
  for (const e of EVENTS) {
    const url = String((value[e.key] && value[e.key].buttonUrl) || '').trim();
    if (url && !/^(\/|https?:\/\/)/i.test(url)) {
      errors[`${e.key}.buttonUrl`] = `${e.label} button URL must start with / or http(s).`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors: null, value };
}

async function writeTemplates(db, templates, { userEmail } = {}) {
  const payload = { ...templates, updatedAt: new Date().toISOString(), updatedBy: userEmail || null };
  await db.doc(TEMPLATES_DOC).set(payload, { merge: true });
  return payload;
}

/* ---------------- branding ---------------- */

async function readBranding(db) {
  try {
    const snap = await db.doc(BRANDING_DOC).get();
    if (!snap.exists) return { ...DEFAULT_BRANDING };
    const data = snap.data() || {};
    const out = { ...DEFAULT_BRANDING };
    for (const key of Object.keys(DEFAULT_BRANDING)) {
      if (typeof data[key] === 'string') out[key] = data[key].slice(0, 300);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(out.accentColor)) out.accentColor = DEFAULT_BRANDING.accentColor;
    return out;
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

function validateBrandingInput(input) {
  const errors = {};
  const src = (input && typeof input === 'object' ? input : {});
  const str = (key, max) => {
    const v = src[key];
    if (v !== undefined && typeof v !== 'string') {
      errors[key] = `${key} must be text.`;
      return DEFAULT_BRANDING[key];
    }
    return String(v ?? DEFAULT_BRANDING[key]).slice(0, max);
  };
  const value = {
    storeName: str('storeName', 60) || DEFAULT_BRANDING.storeName,
    senderName: str('senderName', 60) || DEFAULT_BRANDING.senderName,
    logoUrl: str('logoUrl', 500),
    storeUrl: str('storeUrl', 200) || DEFAULT_BRANDING.storeUrl,
    replyTo: str('replyTo', 254),
    supportEmail: str('supportEmail', 254),
    supportPhone: str('supportPhone', 30),
    accentColor: str('accentColor', 7),
  };
  if (value.replyTo && !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(value.replyTo)) {
    errors.replyTo = 'Reply-To must be a valid email address.';
  }
  if (value.supportEmail && !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(value.supportEmail)) {
    errors.supportEmail = 'Support email must be a valid email address.';
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value.accentColor)) {
    errors.accentColor = 'Accent color must be a hex color like #C33A14.';
  }
  if (value.logoUrl && !/^(\/|https?:\/\/)/i.test(value.logoUrl)) {
    errors.logoUrl = 'Logo URL must start with / or http(s).';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors: null, value };
}

async function writeBranding(db, branding, { userEmail } = {}) {
  const payload = { ...branding, updatedAt: new Date().toISOString(), updatedBy: userEmail || null };
  await db.doc(BRANDING_DOC).set(payload, { merge: true });
  return payload;
}

/* ---------------- tokens ---------------- */

/** Resolve every supported token from the SAVED order. Unknown sources stay ''. */
function buildTokenContext(order, { code, trackUrl, invoiceUrl, branding, status } = {}) {
  const b = branding || {};
  const customer = order.customer || {};
  const delivery = order.delivery || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const name = String(it.name || it.title || 'Item');
    const price = Number(it.discountPrice ?? it.price ?? 0);
    return `${qty} × ${name}${price ? ` (${inr(price * qty)})` : ''}`;
  });
  const subtotal = Number(order.subtotal ?? (Number(order.total || 0) + Number(order.discount || 0)));
  const address = [delivery.flatNo, delivery.streetNo, delivery.area, delivery.city, delivery.state, delivery.pincode]
    .filter(Boolean).join(', ') || customer.address || '';
  return {
    CUSTOMER_NAME: String(customer.name || ''),
    CUSTOMER_EMAIL: String(customer.email || order.userEmail || ''),
    ORDER_ID: String(code || order.shortCode || ''),
    ORDER_DATE: istDate(order.createdAt || order.orderDate),
    ORDER_STATUS: String(status || order.status || ''),
    ORDER_ITEMS: itemLines.join('\n'),
    SUBTOTAL: inr(subtotal),
    DISCOUNT: inr(order.discount || 0),
    COUPON_CODE: String(order.couponCode || ''),
    ORDER_TOTAL: inr(order.total || 0),
    SAVINGS: inr(order.discount || 0),
    DELIVERY_ADDRESS: address,
    CITY: String(delivery.city || customer.city || ''),
    PINCODE: String(delivery.pincode || customer.pincode || ''),
    MOBILE: String(customer.phone || order.userPhone || ''),
    TRACKING_NUMBER: String(order.trackingNumber || ''),
    TRACKING_URL: String(trackUrl || ''),
    COURIER_NAME: String(order.courier || ''),
    PAYMENT_METHOD: String(order.paymentMode || order.paymentStatus || 'Cash on Delivery'),
    PAYMENT_STATUS: String(order.paymentStatus || (order.paymentMode ? 'Paid' : 'Cash on Delivery')),
    CANCELLATION_REASON: String(order.cancellationReason || ''),
    REFUND_AMOUNT: order.refundAmount != null ? inr(order.refundAmount) : '',
    STORE_NAME: String(b.storeName || DEFAULT_BRANDING.storeName),
    STORE_PHONE: String(b.supportPhone || ''),
    STORE_EMAIL: String(b.supportEmail || ''),
    STORE_URL: String(b.storeUrl || ''),
    ORDER_URL: String(invoiceUrl || trackUrl || ''),
  };
}

/**
 * Replace {TOKENS}. Returns { text, unresolved }. A send MUST be refused when
 * unresolved is non-empty — a raw {TOKEN} must never reach a customer.
 */
function renderTokens(text, ctx) {
  const unresolved = [];
  const out = String(text ?? '').replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
    if (!unresolved.includes(name)) unresolved.push(name);
    return match;
  });
  return { text: out, unresolved };
}

/* ---------------- delivery log ---------------- */

async function logDelivery(db, entry) {
  try {
    await db.collection(LOGS_COLLECTION).add({
      at: FieldValue.serverTimestamp(),
      event: String(entry.event || ''),
      orderId: String(entry.orderId || ''),
      recipient: String(entry.recipient || ''),
      subject: String(entry.subject || '').slice(0, 200),
      status: entry.status === 'sent' ? 'sent' : entry.status === 'skipped' ? 'skipped' : 'failed',
      error: String(entry.error || '').slice(0, 300),
      messageId: String(entry.messageId || '').slice(0, 200),
    });
    // Trim: keep the log bounded without a read on every send.
    const countSnap = await db.collection(LOGS_COLLECTION).count().get();
    const count = Number(countSnap.data().count) || 0;
    if (count > LOG_KEEP) {
      const old = await db.collection(LOGS_COLLECTION).orderBy('at', 'asc').limit(count - LOG_TRIM_TO).get();
      const batch = db.batch();
      old.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (error) {
    console.warn('[automation] log write failed:', error.message);
  }
}

async function readLogs(db, { event, status, search, limit = 50 } = {}) {
  let q = db.collection(LOGS_COLLECTION).orderBy('at', 'desc').limit(Math.min(200, Math.max(1, Number(limit) || 50)));
  if (event) q = q.where('event', '==', event);
  if (status) q = q.where('status', '==', status);
  const snap = await q.get();
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (search) {
    const term = String(search).toLowerCase();
    rows = rows.filter((r) =>
      String(r.orderId || '').toLowerCase().includes(term) ||
      String(r.recipient || '').toLowerCase().includes(term) ||
      String(r.subject || '').toLowerCase().includes(term)
    );
  }
  return rows;
}

async function readLastTriggered(db) {
  try {
    const snap = await db.collection(LOGS_COLLECTION).orderBy('at', 'desc').limit(100).get();
    const latest = {};
    for (const d of snap.docs) {
      const data = d.data() || {};
      if (data.event && !latest[data.event] && data.at && typeof data.at.toDate === 'function') {
        latest[data.event] = data.at.toDate().toISOString();
      }
    }
    return latest;
  } catch {
    return {};
  }
}

/* ---------------- templated customer send ---------------- */

/**
 * Resolve the stored template + branding for an event into renderer overrides.
 *
 * Returns { custom, customSubject, branding } or { error } when the template
 * references unknown tokens — the caller must refuse the send.
 */
async function resolveSendCustom(db, { event, order, code, trackUrl, invoiceUrl, status } = {}) {
  const [templates, branding] = await Promise.all([readTemplates(db), readBranding(db)]);
  const template = (templates && templates[event]) || {};
  const ctx = buildTokenContext(order, { code, trackUrl, invoiceUrl, branding, status });
  const custom = {};
  const unresolved = [];
  const take = (field) => {
    const raw = String(template[field] || '');
    if (!raw) return undefined;
    const out = renderTokens(raw, ctx);
    for (const name of out.unresolved) {
      if (!unresolved.includes(name)) unresolved.push(name);
    }
    return out.text;
  };
  const subject = take('subject');
  const preheader = take('preheader');
  const heading = take('heading');
  const body = take('body');
  const buttonText = take('buttonText');
  const buttonUrl = take('buttonUrl');
  if (unresolved.length > 0) {
    return { error: `Unknown token${unresolved.length > 1 ? 's' : ''}: ${unresolved.map((n) => `{${n}}`).join(', ')}` };
  }
  const paragraphs = String(body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (preheader !== undefined) custom.preheader = preheader;
  if (heading !== undefined) custom.heading = heading;
  if (paragraphs[0] !== undefined) custom.intro = paragraphs[0];
  if (buttonText !== undefined) custom.buttonText = buttonText;
  if (buttonUrl !== undefined) custom.buttonUrl = buttonUrl;
  custom.storeName = branding.storeName;
  custom.logoUrl = branding.logoUrl;
  custom.accent = branding.accentColor;
  custom.storeUrl = branding.storeUrl;
  custom.supportLine = [
    branding.supportEmail ? `Email ${branding.supportEmail}` : '',
    branding.supportPhone ? `Call ${branding.supportPhone}` : '',
  ].filter(Boolean).join(' • ') || undefined;
  return {
    custom,
    customSubject: subject,
    extraBody: paragraphs.length > 1 ? paragraphs.slice(1).join('\n\n') : '',
    branding,
  };
}

/**
 * Render + send one customer email for an automation event, applying the
 * stored template and branding over the proven order renderer.
 *
 * Returns { ok, messageId?, skipped?, error?, unresolved? }. Never throws.
 */
async function sendAutomationEmail(db, {
  event, order, code, status, trackUrl, invoiceUrl, transporter,
} = {}) {
  try {
    const rules = (await readAutomationRules(db).catch(() => null)) || null;
    if (!isEventEnabled(rules, event)) return { ok: false, skipped: 'automation-disabled' };

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return { ok: false, skipped: 'no-recipient' };

    const resolved = await resolveSendCustom(db, { event, order, code, trackUrl, invoiceUrl, status });
    if (resolved.error) return { ok: false, error: resolved.error };
    const { custom, customSubject, extraBody, branding } = resolved;

    const items = Array.isArray(order.items) ? order.items : [];
    const quantity = items.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    const baseNote = orderPaymentNote(order);
    const note = extraBody ? `${extraBody}\n\n${baseNote}` : baseNote;

    const { orderConfirmationHtml: renderHtml, orderConfirmationText: renderText, emailSubject: renderSubject } = require('./emailTemplates');
    const html = renderHtml({
      orderCode: code, status, quantity, total: order.total ?? 0,
      trackUrl, invoiceUrl, customerName: order.customer?.name || '', note, custom,
      items: order.items, subtotal: order.subtotal, discount: order.discount,
      couponCode: order.coupon?.code,
    });
    const text = renderText({
      orderCode: code, status, quantity, total: order.total ?? 0,
      trackUrl, invoiceUrl, customerName: order.customer?.name || '', note, custom,
      items: order.items, subtotal: order.subtotal, discount: order.discount,
      couponCode: order.coupon?.code,
    });
    const subject = renderSubject(code, status, customSubject);

    const emailConfig = require('./email').readEmailConfig();
    if (!emailConfig.enabled) return { ok: false, skipped: 'disabled' };
    if (!emailConfig.ok) return { ok: false, skipped: 'unconfigured', error: emailConfig.problems.join(', ') };

    let transport = transporter;
    let owned = false;
    if (!transport) {
      transport = createSmtpTransporter(emailConfig);
      owned = true;
    }
    try {
      const fromName = String(branding.senderName || '').trim() || 'Crackers Hyderabad';
      const from = `"${fromName}" <${emailConfig.fromAddress}>`;
      const info = await transport.sendMail({
        from,
        replyTo: branding.replyTo && isValidRecipient(branding.replyTo) ? branding.replyTo : emailConfig.fromAddress,
        envelope: { from: emailConfig.fromAddress, to },
        to: [{ address: to, name: '' }],
        subject,
        text,
        html,
      });
      return { ok: true, messageId: (info && info.messageId) || null, subject };
    } finally {
      if (owned && transport && typeof transport.close === 'function') {
        try { transport.close(); } catch { /* pooled connection cleanup only */ }
      }
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error || 'Send failed').slice(0, 200) };
  }
}

/**
 * Staff compose / test send. Explicit by construction — no dedup applies.
 * Tokens resolve against the given order when orderId resolves, else only
 * store tokens are available (unknown tokens still refuse the send).
 */
async function sendManualEmail(db, { to, subject, message, orderId } = {}) {
  if (!isValidRecipient(to)) return { ok: false, error: 'Enter a valid recipient email address.' };
  if (!String(subject || '').trim()) return { ok: false, error: 'Subject is required.' };
  if (!String(message || '').trim()) return { ok: false, error: 'Message is required.' };

  const branding = await readBranding(db);
  const emailConfig = require('./email').readEmailConfig();
  if (!emailConfig.enabled) return { ok: false, error: 'Email is disabled on the server (EMAIL_ENABLED=false).' };
  if (!emailConfig.ok) return { ok: false, error: `Email is not configured: ${emailConfig.problems.join(', ')}` };

  let ctx = buildTokenContext({}, { branding });
  let order = null;
  if (orderId) {
    const snap = await db.collection('orders').doc(String(orderId)).get();
    if (!snap.exists) return { ok: false, error: 'Order not found.' };
    order = { id: snap.id, ...snap.data() };
    const code = String(order.shortCode || '').toUpperCase();
    ctx = buildTokenContext(order, {
      code,
      trackUrl: `${emailConfig.trackBaseUrl}/track/${encodeURIComponent(code)}`,
      invoiceUrl: `${emailConfig.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`,
      branding,
      status: order.status,
    });
  }

  const renderedSubject = renderTokens(subject, ctx);
  const renderedBody = renderTokens(message, ctx);
  const unresolved = [...new Set([...renderedSubject.unresolved, ...renderedBody.unresolved])];
  if (unresolved.length > 0) {
    return { ok: false, error: `Unknown token${unresolved.length > 1 ? 's' : ''}: ${unresolved.map((n) => `{${n}}`).join(', ')}` };
  }

  const transport = createSmtpTransporter(emailConfig);
  try {
    const fromName = String(branding.senderName || '').trim() || 'Crackers Hyderabad';
    const paragraphs = renderedBody.text.split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;color:#211A15;">${paragraphs}<p style="margin-top:20px;font-size:12px;color:#6B6259;">${esc(branding.storeName)} • ${esc(branding.storeUrl)}</p></div></body></html>`;
    const info = await transport.sendMail({
      from: `"${fromName}" <${emailConfig.fromAddress}>`,
      replyTo: branding.replyTo && isValidRecipient(branding.replyTo) ? branding.replyTo : emailConfig.fromAddress,
      envelope: { from: emailConfig.fromAddress, to },
      to: [{ address: to, name: '' }],
      subject: renderedSubject.text.slice(0, 200),
      text: renderedBody.text,
      html,
    });
    return { ok: true, messageId: (info && info.messageId) || null, subject: renderedSubject.text.slice(0, 200) };
  } catch (error) {
    const { safeMailError } = require('./email');
    return { ok: false, error: safeMailError(error) };
  } finally {
    if (transport && typeof transport.close === 'function') {
      try { transport.close(); } catch { /* pooled connection cleanup only */ }
    }
  }
}

const crypto = require('node:crypto');

/**
 * Staff-triggered "order details updated" email.
 *
 * Called explicitly after a details save (there is no server-side write path
 * for item edits to hook into). Deduped by content hash: saving without
 * changes, or repeating the same notification, sends nothing. Never throws.
 */
async function sendDetailsUpdatedEmail(db, orderId) {
  const crypto = require('node:crypto');
  try {
    const orderRef = db.collection('orders').doc(String(orderId));
    const snap = await orderRef.get();
    if (!snap.exists) return { ok: false, error: 'Order not found.' };
    const order = { id: snap.id, ...snap.data() };

    const rules = await readAutomationRules(db).catch(() => null);
    if (!isEventEnabled(rules, 'detailsUpdated')) return { ok: false, skipped: 'automation-disabled' };

    const to = order.customer?.email || order.userEmail || '';
    if (!isValidRecipient(to)) return { ok: false, skipped: 'no-recipient' };

    const hash = crypto.createHash('sha1').update(JSON.stringify({
      items: order.items || [],
      total: order.total ?? 0,
      note: order.adminNote || null,
    })).digest('hex');
    const notify = (order.notify && typeof order.notify === 'object') ? order.notify : {};
    if (notify.detailsUpdatedHash === hash && notify.detailsUpdatedSentAt) {
      return { ok: false, skipped: 'already-sent' };
    }

    /* No shortCode, no customer mail — fail safe and report the record
       instead of mailing without an Order ID. */
    const code = getDisplayOrderId(order);
    if (!code) {
      console.error(`[email] details-updated email skipped for order ${orderRef.id}: missing shortCode`);
      return { ok: false, error: 'missing-short-code' };
    }
    const emailConfig = require('./email').readEmailConfig();
    const trackUrl = `${emailConfig.trackBaseUrl}/track/${encodeURIComponent(code)}`;
    const invoiceUrl = `${emailConfig.trackBaseUrl}/track-order?id=${encodeURIComponent(code)}`;

    const result = await sendAutomationEmail(db, {
      event: 'detailsUpdated', order, code, status: order.status || 'Pending', trackUrl, invoiceUrl,
    });
    try {
      if (result.ok) {
        await orderRef.update({
          'notify.detailsUpdatedHash': hash,
          'notify.detailsUpdatedSentAt': FieldValue.serverTimestamp(),
          'notify.detailsUpdatedAttempts': FieldValue.increment(1),
        });
      }
    } catch (recordError) {
      console.warn('[automation] could not record details outcome:', recordError.message);
    }
    await logDelivery(db, {
      event: 'detailsUpdated', orderId: orderRef.id, recipient: to,
      subject: '', status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
      error: result.ok ? '' : String(result.error || result.skipped || ''),
      messageId: result.messageId || '',
    }).catch(() => {});
    return result;
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error || 'Send failed').slice(0, 200) };
  }
}

module.exports = {
  EVENTS,
  STATUS_TO_EVENT,
  TOKENS,
  DEFAULT_BRANDING,
  LOG_KEEP,
  readAutomationRules,
  validateRulesInput,
  writeAutomationRules,
  isEventEnabled,
  readTemplates,
  validateTemplatesInput,
  writeTemplates,
  readBranding,
  validateBrandingInput,
  writeBranding,
  buildTokenContext,
  renderTokens,
  resolveSendCustom,
  logDelivery,
  readLogs,
  readLastTriggered,
  sendAutomationEmail,
  sendDetailsUpdatedEmail,
  sendManualEmail,
};
