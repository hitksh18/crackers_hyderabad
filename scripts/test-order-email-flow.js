/**
 * ONE controlled test order through the real mail path.
 *
 * Sends exactly the emails you authorised, using real Gmail SMTP and the real
 * production hooks and templates — nothing is stubbed except the Firestore
 * document, because there is no order in the database yet. Delivery is counted
 * by wrapping the real transporter, so the mail genuinely goes out and the
 * totals below are observed rather than assumed.
 *
 * What it sends (and nothing else):
 *   step 1  new order            -> 1 customer confirmation + 1 admin notification
 *   step 2  Confirmed -> Packed  -> 1 customer email, 0 admin
 *   step 3  Packed -> Shipped    -> 1 customer email, 0 admin
 *   step 4  Packed -> Packed     -> 0 emails (duplicate protection)
 *
 * Total: customer 3, admin 1.
 *
 * Usage (the app password is read from the environment / .env, never printed):
 *   node scripts/test-order-email-flow.js --customer=you@example.com
 *
 * Add --dry-run to render and assert everything without sending.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FieldValue } = require('firebase-admin/firestore');

(function loadEnvLikeServer() {
  const root = path.join(__dirname, '..');
  if (process.env.NODE_ENV === 'production') {
    const p = path.join(root, '.env');
    if (fs.existsSync(p)) { try { process.loadEnvFile(p); } catch { /* optional */ } }
  }
  const p = path.join(root, '.env.email');
  if (fs.existsSync(p)) { try { process.loadEnvFile(p); } catch { /* optional */ } }
})();

const {
  maybeSendOrderConfirmationEmail,
  maybeSendInternalNewOrderEmail,
  sendStatusUpdateEmail,
  readEmailConfig,
  createSmtpTransporter,
  statusEmailKey,
} = require(path.join(__dirname, '..', 'api', 'lib', 'email'));

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : '';
};
const DRY = argv.includes('--dry-run');
const CUSTOMER_EMAIL = arg('customer');

const ADMIN_EMAIL = 'admin.crackershyderabad@gmail.com';
const ORDER_CODE = 'TEST01';

/** Counts every send while still delivering it for real. */
function makeCountingTransport(real) {
  const sent = [];
  return {
    sent,
    transport: {
      async sendMail(message) {
        sent.push({
          to: message.to[0].address,
          subject: message.subject,
          html: message.html || '',
          text: message.text || '',
        });
        return real ? real.sendMail(message) : { messageId: 'dry-run' };
      },
      close() { if (real && real.close) real.close(); },
    },
  };
}

/** In-memory stand-in for the committed order document. */
function fakeOrderRef(order) {
  const data = JSON.parse(JSON.stringify(order));
  const isServerTimestamp = (v) => {
    try { return FieldValue.isEqual(v, FieldValue.serverTimestamp()); } catch { return false; }
  };
  return {
    id: 'test-order-doc',
    async get() {
      return { id: 'test-order-doc', exists: true, data: () => JSON.parse(JSON.stringify(data)) };
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

const order = {
  shortCode: ORDER_CODE,
  orderNumber: 1,
  status: 'Pending',
  total: 16250,
  items: [
    { productId: 'p1', name: 'Sparklers 30 PCS', quantity: 5, price: 240 },
    { productId: 'p2', name: 'Flower Pot 5 PCS', quantity: 3, price: 320 },
  ],
  customer: {
    name: 'Test Customer',
    email: CUSTOMER_EMAIL,
    phone: '9876543210',
    address: '12-3-4 Banjara Hills',
    city: 'Hyderabad',
    pincode: '500034',
  },
  userEmail: CUSTOMER_EMAIL,
  paymentMode: 'Cash on Delivery',
  delivery: { sameAsBilling: true },
  source: 'web',
  createdAt: new Date().toISOString(),
  notify: {},
};

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

(async () => {
  if (!CUSTOMER_EMAIL) {
    console.error('\nRefusing to run: pass the customer address you control.');
    console.error('  node scripts/test-order-email-flow.js --customer=you@example.com\n');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(CUSTOMER_EMAIL)) {
    console.error(`\nRefusing to run: "${CUSTOMER_EMAIL}" is not a valid address.\n`);
    process.exit(1);
  }
  if (CUSTOMER_EMAIL === ADMIN_EMAIL) {
    console.error('\nRefusing to run: customer and admin must be different addresses,');
    console.error('otherwise "exactly 2 emails" cannot be proven.\n');
    process.exit(1);
  }

  const config = readEmailConfig();
  console.log('\n=========================================================');
  console.log(' CONTROLLED TEST ORDER');
  console.log(` mode:    ${DRY ? 'DRY RUN (nothing sent)' : 'LIVE — real Gmail SMTP'}`);
  console.log(` from:    ${config.from}`);
  console.log(` admin:   ${config.adminNotificationEmail}`);
  console.log(` customer:${CUSTOMER_EMAIL}`);
  console.log('=========================================================\n');

  if (!DRY && config.problems.length) {
    console.error(`Cannot send, config incomplete: ${config.problems.join(', ')}\n`);
    process.exit(1);
  }

  let real = null;
  if (!DRY) {
    real = createSmtpTransporter(config);
    console.log('Verifying Gmail SMTP credentials (no mail sent by this)...');
    try {
      await real.verify();
      console.log('SMTP AUTH OK\n');
    } catch (e) {
      console.error(`SMTP AUTH FAILED: ${String(e.message).replace(/pass(word)?=[^\s;]*/gi, 'pass=[redacted]')}`);
      process.exit(1);
    }
  }

  const counter = makeCountingTransport(real);
  const t = counter.transport;
  const ref = fakeOrderRef(order);
  const since = () => counter.sent.length;
  const toAddr = (addr) => counter.sent.filter((m) => m.to === addr).length;
  // Read the committed document the way api/server.js does before a status
  // change, so the dedup flags written by earlier steps are visible.
  const stored = async () => (await ref.get()).data();

  // --- step 1: the new order -------------------------------------------------
  console.log('STEP 1  new order  ->  expect 1 customer + 1 admin');
  const before1 = since();
  const r1 = await maybeSendOrderConfirmationEmail({}, ref, order, { transporter: t });
  const r2 = await maybeSendInternalNewOrderEmail({}, ref, order, { transporter: t });
  const step1 = counter.sent.slice(before1);
  check('customer confirmation delivered', toAddr(CUSTOMER_EMAIL), 1);
  check('admin notification delivered', toAddr(ADMIN_EMAIL), 1);
  check('exactly two emails for the order', step1.length, 2);
  if (r1.skipped) console.log(`        (customer hook: skipped=${r1.skipped})`);
  if (r2.skipped) console.log(`        (admin hook: skipped=${r2.skipped})`);

  // --- step 2: Confirmed -> Packed -------------------------------------------
  console.log('\nSTEP 2  Confirmed -> Packed  ->  expect 1 customer, 0 admin');
  const before2 = since();
  await sendStatusUpdateEmail({}, ref, { ...(await stored()), status: 'Packed' }, 'Packed', { transporter: t });
  const step2 = counter.sent.slice(before2);
  check('customer Packed email', toAddr(CUSTOMER_EMAIL), 2);
  check('no admin email', toAddr(ADMIN_EMAIL), 1);
  check('exactly one email this step', step2.length, 1);
  console.log(`        subject: ${step2[0] ? step2[0].subject : '(none)'}`);

  // --- step 3: Packed -> Shipped ---------------------------------------------
  console.log('\nSTEP 3  Packed -> Shipped  ->  expect 1 customer, 0 admin');
  const before3 = since();
  await sendStatusUpdateEmail({}, ref, { ...(await stored()), status: 'Shipped' }, 'Shipped', { transporter: t });
  const step3 = counter.sent.slice(before3);
  check('customer Shipped email', toAddr(CUSTOMER_EMAIL), 3);
  check('no admin email', toAddr(ADMIN_EMAIL), 1);
  check('exactly one email this step', step3.length, 1);
  console.log(`        subject: ${step3[0] ? step3[0].subject : '(none)'}`);

  // --- step 4: repeat the same status ---------------------------------------
  console.log('\nSTEP 4  Packed -> Packed (repeat)  ->  expect 0 emails');
  const before4 = since();
  const repeat = await sendStatusUpdateEmail({}, ref, { ...(await stored()), status: 'Packed' }, 'Packed', { transporter: t });
  check('no duplicate email', counter.sent.length - before4, 0);
  console.log(`        hook result: skipped=${repeat.skipped || 'none'}`);
  check('dedup key for Packed', statusEmailKey('Packed'), 'packed');

  // --- content verification --------------------------------------------------
  console.log('\nEMAIL CONTENT');
  const customerMail = counter.sent.find((m) => m.to === CUSTOMER_EMAIL);
  const adminMail = counter.sent.find((m) => m.to === ADMIN_EMAIL);
  if (customerMail) {
    check('customer subject shape', /^Your Crackers Hyderabad Order #TEST01 is /.test(customerMail.subject), true);
    check('branding logo present', customerMail.html.includes('nav-logo.png'), true);
    check('customer name shown', customerMail.html.includes('Test Customer'), true);
    check('order id shown', customerMail.html.includes('TEST01'), true);
    check('total shown', /16,250/.test(customerMail.html), true);
    check('status tracker present', /TRACK YOUR ORDER|tracker|Confirmed/i.test(customerMail.html), true);
    check('Track Your Order button', /TRACK YOUR ORDER/i.test(customerMail.html), true);
    check('Download Invoice button', /DOWNLOAD INVOICE/i.test(customerMail.html), true);
    check('NO product list', customerMail.html.includes('Sparklers 30 PCS') || customerMail.html.includes('Flower Pot 5 PCS'), false);
    console.log(`        subject: ${customerMail.subject}`);
  }
  if (adminMail) {
    check('admin recipient', adminMail.to, ADMIN_EMAIL);
    check('admin subject', adminMail.subject, `New Order Placed — #${ORDER_CODE}`);
    for (const field of ['Order ID', 'Customer', 'Customer Email', 'Phone', 'Quantity', 'Order Total', 'Payment Method', 'Order Date', 'DELIVERY', 'VIEW ORDER']) {
      check(`admin has "${field}"`, adminMail.html.includes(field), true);
    }
    check('admin is a separate template (no customer CTA)', /DOWNLOAD INVOICE|TRACK YOUR ORDER/i.test(adminMail.html), false);
    check('admin link has no token', /token|idToken|auth=/i.test(adminMail.html), false);
    console.log(`        subject: ${adminMail.subject}`);
  }

  console.log('\nTOTALS');
  console.log(`  customer ${CUSTOMER_EMAIL}: ${toAddr(CUSTOMER_EMAIL)}`);
  console.log(`  admin    ${ADMIN_EMAIL}: ${toAddr(ADMIN_EMAIL)}`);
  console.log(`  total sent: ${counter.sent.length}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (counter.sent.length && !DRY) console.log('\nCheck both inboxes, including spam/quarantine.');
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error('\nCRASHED:', error && error.message ? error.message : error);
  process.exit(1);
});
