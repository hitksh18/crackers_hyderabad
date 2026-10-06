/**
 * Send one real "New Order Placed" alert to the store inbox.
 *
 * This is the manual counterpart to the automation in api/lib/email.js: it
 * calls the very same hook (maybeSendInternalNewOrderEmail) with the very same
 * templates and the very same SMTP configuration the live server uses, so a
 * successful run proves the production path end to end — config resolution,
 * admin recipient, template rendering, Gmail auth and delivery.
 *
 * NO CREDENTIAL IS EVER STORED BY THIS SCRIPT. It reads SMTP_HOST / SMTP_USER /
 * SMTP_PASSWORD (or the legacy EMAIL_* names) from the environment it is started
 * in, holds them in memory for the life of the process, and exits. It writes no
 * .env file, prints no password, and commits nothing. Type the app password into
 * your own shell when you launch it:
 *
 *   PowerShell
 *     $env:SMTP_HOST='smtp.gmail.com'; $env:SMTP_PORT='465'; $env:SMTP_SECURE='true'
 *     $env:SMTP_USER='crackershyderabad@gmail.com'; $env:SMTP_PASSWORD='<app password>'
 *     $env:EMAIL_FROM_NAME='Crackers Hyderabad'; $env:EMAIL_FROM_ADDRESS='crackershyderabad@gmail.com'
 *     $env:ADMIN_NOTIFICATION_EMAIL='admin.crackershyderabad@gmail.com'
 *     node scripts/send-test-order-email.js
 *
 *   bash
 *     SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_SECURE=true \
 *     SMTP_USER=crackershyderabad@gmail.com SMTP_PASSWORD='<app password>' \
 *     EMAIL_FROM_NAME='Crackers Hyderabad' EMAIL_FROM_ADDRESS=crackershyderabad@gmail.com \
 *     ADMIN_NOTIFICATION_EMAIL=admin.crackershyderabad@gmail.com \
 *     node scripts/send-test-order-email.js
 *
 * On KVM the variables already exist, so no password is needed at all:
 *   node scripts/send-test-order-email.js
 *
 * Flags:
 *   --dry-run   render everything and print the resolved config without
 *               connecting to SMTP (safe when nothing is configured)
 *   --to=ADDR   override the admin recipient for this run only
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const { FieldValue } = require('firebase-admin/firestore');
const {
  maybeSendInternalNewOrderEmail,
  readEmailConfig,
  internalOrderDate,
  internalDeliveryLines,
} = require(path.join(__dirname, '..', 'api', 'lib', 'email'));
const {
  internalNewOrderSubject,
  internalNewOrderHtml,
  internalNewOrderText,
} = require(path.join(__dirname, '..', 'api', 'lib', 'emailTemplates'));

const dryRun = process.argv.includes('--dry-run');
const toOverride = (process.argv.find((a) => a.startsWith('--to=')) || '').slice(5).trim();

// Mirror api/server.js's env-loading preamble. Without this a standalone script
// sees an empty environment and reports "unconfigured" even when .env.email on
// disk holds a complete, working configuration — which is exactly the false
// negative this script previously produced.
(function loadEnvLikeServer() {
  const root = path.join(__dirname, '..');
  if (process.env.NODE_ENV === 'production') {
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
      try { process.loadEnvFile(envPath); } catch { /* optional */ }
    }
  }
  const emailEnvPath = path.join(root, '.env.email');
  if (fs.existsSync(emailEnvPath)) {
    try { process.loadEnvFile(emailEnvPath); } catch { /* optional */ }
  }
})();

// --- sample order -----------------------------------------------------------
// Clearly fictional so nobody mistakes it for a real purchase. Swap these values
// for a live order's details if you want the alert to mirror one exactly.
const SAMPLE_ORDER = {
  shortCode: 'TEST01',
  orderNumber: 1,
  status: 'Pending',
  total: 16250,
  items: [
    { productId: 'p1', name: 'Sparklers 30 PCS', quantity: 5, price: 240 },
    { productId: 'p2', name: 'Flower Pot 5 PCS', quantity: 3, price: 320 },
  ],
  customer: {
    name: 'Test Customer (not a real order)',
    email: 'test.customer@example.com',
    phone: '9876543210',
    address: '12-3-4 Banjara Hills',
    city: 'Hyderabad',
    pincode: '500034',
  },
  userEmail: 'test.customer@example.com',
  paymentMode: 'Cash on Delivery',
  delivery: { sameAsBilling: true },
  source: 'web',
  createdAt: new Date().toISOString(),
  notify: {},
};

/**
 * Minimal stand-in for a committed order document. maybeSendInternalNewOrderEmail
 * needs only get() (to read the dedup flag) and update() (to record that the
 * alert went out) — it must never reach a real collection from this script.
 */
function fakeOrderRef(order) {
  const data = JSON.parse(JSON.stringify(order));
  const isServerTimestamp = (v) => {
    try { return FieldValue.isEqual(v, FieldValue.serverTimestamp()); } catch { return false; }
  };
  return {
    id: 'test-order-doc',
    async get() {
      return { id: 'test-order-doc', exists: true, data: () => ({ ...data }) };
    },
    async update(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.');
        let node = data;
        for (const part of parts.slice(0, -1)) {
          if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
          node = node[part];
        }
        node[parts[parts.length - 1]] = isServerTimestamp(value)
          ? new Date().toISOString()
          : value;
      }
    },
  };
}

/** Counts the send instead of talking to Gmail. Used only by the live path's
 *  self-check below; the dry run renders templates directly instead. */
const fakeTransporter = () => ({
  sent: [],
  async sendMail(message) {
    this.sent.push({ to: message.to[0].address, subject: message.subject });
    return { messageId: 'not-sent' };
  },
  close() {},
});

(async () => {
  const config = readEmailConfig();
  console.log('\n=== Crackers Hyderabad — new-order alert test ===\n');
  console.log('Config:', config.describe);
  console.log('Admin recipient:', toOverride || config.adminNotificationEmail);

  if (toOverride) process.env.ADMIN_NOTIFICATION_EMAIL = toOverride;

  if (dryRun) {
    // Rendered straight from the production templates, so this works with no
    // SMTP configuration at all and never opens a connection. The payload is
    // built exactly as maybeSendInternalNewOrderEmail builds it.
    const order = SAMPLE_ORDER;
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const delivery = internalDeliveryLines(order);
    const payload = {
      orderCode: String(order.shortCode || '').toUpperCase(),
      customerName: order.customer?.name || 'N/A',
      customerEmail: order.customer?.email || order.userEmail || 'N/A',
      customerPhone: order.customer?.phone || 'N/A',
      quantity: (order.items || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0),
      total: order.total ?? 0,
      paymentMethod: order.paymentMode || 'Cash on Delivery',
      orderDate: internalOrderDate(order),
      orderStatus: order.status || 'Pending',
      deliveryLines: esc(delivery).replace(/, /g, '<br>'),
      deliveryText: delivery,
      viewOrderUrl: `${config.adminBaseUrl}/orders/test-order-doc`,
    };
    const subject = internalNewOrderSubject(payload.orderCode);
    const html = internalNewOrderHtml(payload);
    const text = internalNewOrderText(payload);
    const out = path.join(os.tmpdir(), 'crackers-hyderabad-test-order-email.html');
    fs.writeFileSync(out, html, 'utf8');

    console.log('\n--- DRY RUN: nothing sent, no SMTP connection opened ---');
    console.log('To:      ', toOverride || config.adminNotificationEmail);
    console.log('Subject: ', subject);
    console.log('HTML:    ', out, `(${html.length} bytes)`);
    console.log('Text:    ', `${text.length} bytes`);
    console.log('\nRequired fields present in the rendered email:');
    const checks = [
      ['Order ID', payload.orderCode],
      ['Customer', payload.customerName],
      ['Customer Email', payload.customerEmail],
      ['Phone', payload.customerPhone],
      ['Quantity', `${payload.quantity} items`],
      ['Order Total', `₹${Number(payload.total).toLocaleString('en-IN')}`],
      ['Payment Method', payload.paymentMethod],
      ['Order Date', payload.orderDate],
      ['Delivery address', payload.deliveryText.split(',')[0]],
      ['VIEW ORDER', payload.viewOrderUrl],
    ];
    let missing = 0;
    for (const [label, expected] of checks) {
      const ok = expected ? html.includes(expected) : false;
      if (!ok) missing++;
      console.log(`  ${ok ? 'ok  ' : 'MISS'} ${label}${ok ? '' : `  (looking for "${expected}")`}`);
    }
    console.log(`\nOrder date resolved to: ${payload.orderDate}`);
    console.log(`Delivery rendered as:    ${payload.deliveryText}`);
    process.exit(missing === 0 ? 0 : 1);
  }

  if (!config.enabled) {
    console.error('\nEmail is disabled (EMAIL_ENABLED). Nothing sent.');
    process.exit(1);
  }
  if (config.problems.length) {
    console.error('\nSMTP is not fully configured, so no mail was attempted:');
    for (const problem of config.problems) console.error('  -', problem);
    console.error('\nSet the variables in your shell and run again, or run this on KVM.');
    process.exit(1);
  }

  console.log('\nSending one real alert...\n');
  const result = await maybeSendInternalNewOrderEmail({}, fakeOrderRef(SAMPLE_ORDER), SAMPLE_ORDER);

  if (result.ok) {
    console.log('SENT. messageId:', result.messageId);
    console.log('Check', toOverride || config.adminNotificationEmail, 'and the spam folder.');
    process.exit(0);
  }
  if (result.skipped === 'no-recipient') {
    console.error('\nNo valid admin recipient resolved. Check ADMIN_NOTIFICATION_EMAIL.');
    process.exit(1);
  }
  if (result.skipped === 'already-sent') {
    console.log('\nThe dedup flag was already set on this order, so nothing was sent.');
    process.exit(0);
  }
  console.error('\nNOT SENT:', JSON.stringify(result));
  process.exit(1);
})().catch((error) => {
  console.error('\nCRASHED:', error && error.message ? error.message : error);
  process.exit(1);
});
