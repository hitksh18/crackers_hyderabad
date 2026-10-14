/**
 * WhatsApp order-status + invoice send — the tests that matter.
 *
 * Run: node --test tests/whatsapp.test.js
 *
 * Covers the staff send (Admin Orders -> WhatsApp button ->
 * POST /api/orders/:orderId/whatsapp -> Meta Cloud API):
 *   - the message carries shortCode, never the document id;
 *   - the current status is reflected dynamically for every status;
 *   - the invoice filename matches the invoice the Download button produces;
 *   - missing shortCode / phone fail with reportable codes;
 *   - unconfigured WhatsApp refuses instead of faking a send;
 *   - provider failures surface without leaking the access token.
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const whatsapp = require('../api/lib/whatsapp');

const DOC_ID = '3UooOYxuwbiA13UJS5Gi';

const PRAVEEN_ORDER = {
  id: DOC_ID,
  shortCode: 'CHYD26-3001',
  status: 'Confirmed',
  total: 3277.5,
  customer: { name: 'Praveen Kumar', phone: '9248088588' },
};

const HITESH_ORDER = {
  id: '9ZppQAbCdEfG34HJK6Lm',
  shortCode: 'CHYD26-3002',
  status: 'Confirmed',
  total: 4070,
  customer: { name: 'Hitesh', phone: '+91 80080 09027' },
};

/* -------------------------------------------------------------------------
   Message content
   ------------------------------------------------------------------------- */

test('the status message quotes the canonical id, status and total', () => {
  const payload = whatsapp.resolveOrderWhatsapp(PRAVEEN_ORDER);
  assert.equal(payload.code, 'CHYD26-3001');
  assert.equal(payload.to, '919248088588');
  assert.equal(payload.filename, 'Invoice_CHYD26-3001.pdf');
  assert.ok(payload.message.includes('Hello Praveen Kumar,'), 'greets the customer by name');
  assert.ok(payload.message.includes('Your order #CHYD26-3001 has been confirmed.'), 'states the order and verb');
  assert.ok(payload.message.includes('Order Status: Confirmed'), 'quotes the current status');
  assert.ok(payload.message.includes('Order Total: \u20B93,277.50'), 'quotes the total');
  assert.ok(payload.message.includes('Your invoice is attached with this message.'));
  assert.ok(!payload.message.includes(DOC_ID), 'the document id must not appear');
  assert.ok(!payload.filename.includes(DOC_ID), 'the filename must not contain the document id');
});

test('the second example renders its own values', () => {
  const payload = whatsapp.resolveOrderWhatsapp(HITESH_ORDER);
  assert.equal(payload.code, 'CHYD26-3002');
  assert.equal(payload.to, '918008009027');
  assert.ok(payload.message.includes('Hello Hitesh,'));
  assert.ok(payload.message.includes('Your order #CHYD26-3002 has been confirmed.'));
  assert.ok(payload.message.includes('Order Total: \u20B94,070'));
  assert.equal(payload.filename, 'Invoice_CHYD26-3002.pdf');
});

test('every order status is reflected dynamically', () => {
  const expectations = {
    Pending: 'has been received',
    Confirmed: 'has been confirmed',
    Packed: 'has been packed',
    Processing: 'has been confirmed and is now being processed',
    Shipped: 'has been shipped',
    'Out for Delivery': 'has been out for delivery',
    Delivered: 'has been delivered',
    Cancelled: 'has been cancelled',
  };
  for (const [status, verb] of Object.entries(expectations)) {
    const payload = whatsapp.resolveOrderWhatsapp({ ...PRAVEEN_ORDER, status });
    assert.ok(
      payload.message.includes(`Your order #CHYD26-3001 ${verb}.`),
      `status "${status}" must read "${verb}"`
    );
    assert.ok(payload.message.includes(`Order Status: ${status}`), `status line must say "${status}"`);
    assert.ok(!payload.message.includes(DOC_ID), `status "${status}" must not leak the document id`);
  }
});

/* -------------------------------------------------------------------------
   Failure modes — fail safe, never substitute the document id
   ------------------------------------------------------------------------- */

test('a missing shortCode refuses with ORDER_ID_MISSING', () => {
  assert.throws(
    () => whatsapp.resolveOrderWhatsapp({ id: DOC_ID, status: 'Confirmed', total: 10, customer: { name: 'X', phone: '9248088588' } }),
    (error) => error.code === 'ORDER_ID_MISSING'
  );
});

test('a missing phone refuses with CUSTOMER_PHONE_MISSING', () => {
  assert.throws(
    () => whatsapp.resolveOrderWhatsapp({ ...PRAVEEN_ORDER, customer: { name: 'Praveen Kumar', phone: '' } }),
    (error) => error.code === 'CUSTOMER_PHONE_MISSING'
  );
});

test('an unusable phone refuses with CUSTOMER_PHONE_INVALID', () => {
  assert.throws(
    () => whatsapp.resolveOrderWhatsapp({ ...PRAVEEN_ORDER, customer: { name: 'P', phone: '12345' } }),
    (error) => error.code === 'CUSTOMER_PHONE_INVALID'
  );
});

test('phone numbers normalise to 91 + 10 digits without touching the stored value', () => {
  assert.deepEqual(whatsapp.normalizeWhatsappPhone('9248088588'), { ok: true, msisdn: '919248088588' });
  assert.deepEqual(whatsapp.normalizeWhatsappPhone('+91 92480 88588'), { ok: true, msisdn: '919248088588' });
  assert.deepEqual(whatsapp.normalizeWhatsappPhone('919248088588'), { ok: true, msisdn: '919248088588' });
  assert.deepEqual(whatsapp.normalizeWhatsappPhone('09248088588'), { ok: true, msisdn: '919248088588' });
  assert.equal(whatsapp.normalizeWhatsappPhone('8008009027').msisdn, '918008009027');
  assert.equal(whatsapp.normalizeWhatsappPhone('123').ok, false);
  assert.equal(whatsapp.normalizeWhatsappPhone('').ok, false);
  assert.equal(whatsapp.normalizeWhatsappPhone(null).ok, false);
  // A landline-length number cannot receive WhatsApp.
  assert.equal(whatsapp.normalizeWhatsappPhone('0401234567').ok, false);
  assert.equal(PRAVEEN_ORDER.customer.phone, '9248088588', 'the stored number is untouched');
});

/* -------------------------------------------------------------------------
   Configuration — refuse instead of faking a send
   ------------------------------------------------------------------------- */

test('missing credentials report as not configured', () => {
  const config = whatsapp.readWhatsappConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.ok, false);
  assert.ok(config.problems.length > 0);
});

test('an explicit disable is honoured even with credentials present', () => {
  const config = whatsapp.readWhatsappConfig({
    WHATSAPP_ENABLED: 'false',
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: '123',
  });
  assert.equal(config.enabled, false);
  assert.equal(config.ok, false);
});

test('a complete configuration reports ok', () => {
  const config = whatsapp.readWhatsappConfig({
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: '123',
  });
  assert.equal(config.ok, true);
  assert.equal(config.apiVersion, 'v21.0');
});

/* -------------------------------------------------------------------------
   Provider failures — surfaced, never leaking the token
   ------------------------------------------------------------------------- */

test('a Meta API failure surfaces without leaking credentials', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: 'Invalid parameter', code: 100 } }),
  });
  try {
    const config = {
      accessToken: 'SECRET-TOKEN-123',
      phoneNumberId: '123',
      apiVersion: 'v21.0',
    };
    const error = await whatsapp
      .uploadWhatsappMedia({ config, buffer: Buffer.from('%PDF'), filename: 'Invoice_CHYD26-3001.pdf' })
      .then(
        () => null,
        (thrown) => thrown
      );
    assert.ok(error, 'the upload must throw');
    assert.equal(error.code, 'WHATSAPP_MEDIA_FAILED');
    assert.ok(!error.message.includes('SECRET-TOKEN-123'), 'the token must not appear in the error');

    const sendError = await whatsapp
      .sendWhatsappDocument({ config, to: '919248088588', mediaId: 'mid.1', filename: 'Invoice_CHYD26-3001.pdf', caption: 'hi' })
      .then(
        () => null,
        (thrown) => thrown
      );
    assert.ok(sendError, 'the send must throw');
    assert.equal(sendError.code, 'WHATSAPP_SEND_FAILED');
    assert.ok(!sendError.message.includes('SECRET-TOKEN-123'), 'the token must not appear in the error');
  } finally {
    globalThis.fetch = original;
  }
});

test('a successful provider round trip returns the media and message ids', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    if (String(url).endsWith('/media')) {
      return { ok: true, status: 200, json: async () => ({ id: 'media-id-1' }) };
    }
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.abc' }] }) };
  };
  try {
    const config = { accessToken: 'token', phoneNumberId: 'PNID', apiVersion: 'v21.0' };
    const mediaId = await whatsapp.uploadWhatsappMedia({
      config,
      buffer: Buffer.from('%PDF'),
      filename: 'Invoice_CHYD26-3001.pdf',
    });
    assert.equal(mediaId, 'media-id-1');
    const messageId = await whatsapp.sendWhatsappDocument({
      config,
      to: '919248088588',
      mediaId,
      filename: 'Invoice_CHYD26-3001.pdf',
      caption: 'Your invoice is attached.',
    });
    assert.equal(messageId, 'wamid.abc');
    assert.ok(seen[0].includes('/PNID/media'), 'media upload targets the configured number id');
    assert.ok(seen[1].includes('/PNID/messages'), 'the document send targets the configured number id');
  } finally {
    globalThis.fetch = original;
  }
});

/* -------------------------------------------------------------------------
   Wiring — the endpoint and the UI read the same contract
   ------------------------------------------------------------------------- */

test('the endpoint loads by internal id and reads the strict helper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'api', 'server.js'), 'utf8');
  assert.match(server, /app\.post\(\s*'\/api\/orders\/:orderId\/whatsapp'/, 'the endpoint takes the internal document id');
  assert.match(server, /requireAdmin/, 'the endpoint is staff-only');
  assert.match(server, /resolveOrderWhatsapp\(order\)/, 'the endpoint resolves content from the stored order');
  assert.match(server, /WHATSAPP_NOT_CONFIGURED/, 'unconfigured WhatsApp refuses with a machine-readable code');
  assert.match(server, /uploadWhatsappMedia/, 'the invoice bytes are uploaded as media');
  assert.match(server, /sendWhatsappDocument/, 'the invoice goes as a document attachment');
  assert.ok(!/wa\.me.*whatsapp.*invoice|invoice.*wa\.me/i.test(server), 'no wa.me fallback for the attachment send');
});

test('the admin UI sends the invoice bytes with the lookup id only', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const page of ['Orders.jsx', 'OrderDetail.jsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'admin', 'src', 'pages', page), 'utf8');
    assert.match(source, /generateInvoicePDFBlob/, `${page} reuses the invoice generator`);
    assert.match(
      source,
      new RegExp(`/api/orders/\\$\\{[^}]*\\.id\\}/whatsapp`),
      `${page} calls the endpoint with the internal document id`
    );
    assert.ok(!/window\.open\(`https:\/\/wa\.me/.test(source), `${page} no longer opens a wa.me chat for orders`);
  }
  const bar = fs.readFileSync(
    path.join(__dirname, '..', 'admin', 'src', 'components', 'admin', 'OrderActionBar.jsx'),
    'utf8'
  );
  assert.match(bar, /FaWhatsapp/, 'the action uses the WhatsApp glyph');
  assert.match(bar, /aria-label=\{label\}/, 'the button keeps an accessible name');
  assert.ok(bar.includes("'Send WhatsApp'"), 'the tooltip and accessible name read "Send WhatsApp"');
});
