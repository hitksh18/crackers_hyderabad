'use strict';

/* ---------------------------------------------------------------------------
   WhatsApp Cloud API sender — order status + invoice document.

   Used by POST /api/orders/:orderId/whatsapp (staff-only). The frontend
   generates the invoice with the SAME pdfGenerator the Download/Print buttons
   use and uploads it with the request; everything customer-facing here —
   the Order ID, the status, the total, the filename — is re-derived
   server-side from the stored order, so a tampered upload can never change
   what the customer reads.

   Canonical ID rule: the message, the caption and the filename carry
   `order.shortCode` via getDisplayOrderId (../orderId). The Firestore
   document id is used only to load the order and never leaves the server.

   No Meta integration existed before this module (the app only opened
   wa.me chat links). Credentials come from the environment only:
     WHATSAPP_ENABLED=true
     WHATSAPP_ACCESS_TOKEN=
     WHATSAPP_PHONE_NUMBER_ID=
     WHATSAPP_API_VERSION=v21.0 (optional)
   --------------------------------------------------------------------------- */

const { getDisplayOrderId } = require('./orderId');

const DEFAULT_API_VERSION = 'v21.0';
const MEDIA_UPLOAD_TIMEOUT_MS = 20000;
const MESSAGE_SEND_TIMEOUT_MS = 15000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Structured failure. `code` is the machine-readable contract the admin UI
    switches on; `message` is already customer-safe (never carries secrets). */
class WhatsappError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'WhatsappError';
    this.code = code;
    this.status = status;
  }
}

/* ---------------------------------------------------------------------------
   Configuration
   --------------------------------------------------------------------------- */

function readWhatsappConfig(env = process.env) {
  const enabled = String(env.WHATSAPP_ENABLED ?? 'true').toLowerCase() !== 'false';
  const accessToken = String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;

  const problems = [];
  if (!accessToken) problems.push('WHATSAPP_ACCESS_TOKEN is not set');
  if (!phoneNumberId) problems.push('WHATSAPP_PHONE_NUMBER_ID is not set');
  if (!/^v\d+\.\d+$/.test(apiVersion)) problems.push('WHATSAPP_API_VERSION must look like v21.0');

  return {
    enabled,
    ok: enabled && problems.length === 0,
    accessToken,
    phoneNumberId,
    apiVersion,
    problems,
  };
}

/* ---------------------------------------------------------------------------
   Phone numbers — Indian delivery only, normalised for the API, never written
   back to the order.
   --------------------------------------------------------------------------- */

function normalizeWhatsappPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  let national = '';
  if (/^91\d{10}$/.test(digits)) national = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) national = digits;
  else return { ok: false, error: 'invalid' };
  // Indian mobiles live in 6-9; anything else cannot receive WhatsApp.
  if (!/^[6-9]/.test(national)) return { ok: false, error: 'invalid' };
  return { ok: true, msisdn: `91${national}` };
}

/* ---------------------------------------------------------------------------
   Message content — built from the stored order, never from the request.
   --------------------------------------------------------------------------- */

const STATUS_VERBS = {
  Pending: 'received',
  Confirmed: 'confirmed',
  Packed: 'packed',
  Processing: 'confirmed and is now being processed',
  Shipped: 'shipped',
  'Out for Delivery': 'out for delivery',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
};

function statusVerb(status) {
  const text = String(status || '').trim();
  if (STATUS_VERBS[text]) return STATUS_VERBS[text];
  return text ? text.toLowerCase() : 'updated';
}

/** Indian formatting the way the shop quotes totals: whole rupees plain,
    paise only when there are paise (4070 -> "4,070", 3277.5 -> "3,277.50"). */
function formatINR(amount) {
  const rounded = Math.round(Number(amount || 0) * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toLocaleString('en-IN');
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildWhatsappStatusMessage({ customerName, orderCode, status, total }) {
  const name = String(customerName || '').trim() || 'Customer';
  return [
    `Hello ${name},`,
    '',
    `Your order #${orderCode} has been ${statusVerb(status)}.`,
    '',
    `Order Status: ${status}`,
    `Order Total: \u20B9${formatINR(total)}`,
    '',
    'Your invoice is attached with this message.',
    '',
    'Thank you for shopping with Crackers Hyderabad.',
  ].join('\n');
}

function whatsappInvoiceFilename(orderCode) {
  return `Invoice_${orderCode}.pdf`;
}

/**
 * Validate a stored order for WhatsApp delivery and resolve everything the
 * send needs. Throws WhatsappError with ORDER_ID_MISSING /
 * CUSTOMER_PHONE_MISSING / CUSTOMER_PHONE_INVALID — never substitutes the
 * document id.
 */
function resolveOrderWhatsapp(order) {
  const code = getDisplayOrderId(order);
  if (!code) {
    throw new WhatsappError(
      'ORDER_ID_MISSING',
      'This order has no customer Order ID yet (missing shortCode).',
      422
    );
  }
  const rawPhone = order.customer?.phone || order.userPhone || '';
  if (!String(rawPhone).trim()) {
    throw new WhatsappError('CUSTOMER_PHONE_MISSING', 'This order has no customer phone number.', 422);
  }
  const phone = normalizeWhatsappPhone(rawPhone);
  if (!phone.ok) {
    throw new WhatsappError('CUSTOMER_PHONE_INVALID', 'This order has an unusable phone number.', 422);
  }
  const status = String(order.status || '').trim() || 'Pending';
  const customerName = String(order.customer?.name || '').trim() || 'Customer';
  return {
    to: phone.msisdn,
    code,
    status,
    customerName,
    total: order.total ?? 0,
    filename: whatsappInvoiceFilename(code),
    message: buildWhatsappStatusMessage({ customerName, orderCode: code, status, total: order.total ?? 0 }),
  };
}

/* ---------------------------------------------------------------------------
   Meta Cloud API — media upload, then a document message carrying the status
   text as its caption. One customer message, one API round trip each.
   --------------------------------------------------------------------------- */

function metaErrorMessage(status, body) {
  if (status === 401 || status === 403) {
    return 'WhatsApp rejected the API credentials. Check WHATSAPP_ACCESS_TOKEN.';
  }
  const detail = body && body.error && body.error.message ? String(body.error.message) : '';
  if (status === 470 || /template/i.test(detail)) {
    return 'WhatsApp requires an approved message template for this conversation. Message the customer within 24 hours of their last message, or configure a template.';
  }
  const short = detail ? `: ${detail.slice(0, 160)}` : '';
  return `WhatsApp API error (HTTP ${status})${short}.`;
}

async function readMetaResponse(res, what) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new WhatsappError(
      what === 'media' ? 'WHATSAPP_MEDIA_FAILED' : 'WHATSAPP_SEND_FAILED',
      metaErrorMessage(res.status, body),
      res.status
    );
  }
  return body || {};
}

/** Upload the invoice PDF; returns the media id the document message needs. */
async function uploadWhatsappMedia({ config, buffer, filename, mimeType = 'application/pdf' }) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('type', mimeType);
  const res = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
    signal: AbortSignal.timeout(MEDIA_UPLOAD_TIMEOUT_MS),
  });
  const body = await readMetaResponse(res, 'media');
  if (!body.id) {
    throw new WhatsappError('WHATSAPP_MEDIA_FAILED', 'WhatsApp accepted the upload but returned no media id.', 502);
  }
  return body.id;
}

/** Send the invoice as a document with the status text as its caption. */
async function sendWhatsappDocument({ config, to, mediaId, filename, caption }) {
  const res = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename, caption },
    }),
    signal: AbortSignal.timeout(MESSAGE_SEND_TIMEOUT_MS),
  });
  const body = await readMetaResponse(res, 'message');
  const messageId = body.messages && body.messages[0] && body.messages[0].id;
  if (!messageId) {
    throw new WhatsappError('WHATSAPP_SEND_FAILED', 'WhatsApp accepted the request but returned no message id.', 502);
  }
  return messageId;
}

module.exports = {
  WhatsappError,
  MAX_PDF_BYTES,
  readWhatsappConfig,
  normalizeWhatsappPhone,
  statusVerb,
  formatINR,
  buildWhatsappStatusMessage,
  whatsappInvoiceFilename,
  resolveOrderWhatsapp,
  uploadWhatsappMedia,
  sendWhatsappDocument,
};
