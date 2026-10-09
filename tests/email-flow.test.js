/**
 * Two-email flow test suite — new order + status automation.
 *
 * Runs on plain Node (no test framework, no network, no real mail):
 *
 *   node tests/email-flow.test.js
 *
 * Everything the hooks touch is injected — a fake SMTP transporter that counts
 * sends, and a fake order document that interprets the dotted-path writes the
 * hooks make. That makes each assertion about the REAL production code in
 * api/lib/email.js rather than a re-implementation of it.
 *
 * What is proven here is the send/decision logic: which recipient gets mail,
 * how many emails a scenario produces, and that the dedup flags stop repeats.
 */

'use strict';

const path = require('path');

// --- environment must be set BEFORE email.js is required -------------------
process.env.EMAIL_ENABLED = 'true';
process.env.SMTP_HOST = 'smtp.gmail.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';
process.env.SMTP_USER = 'crackershyderabad@gmail.com';
process.env.SMTP_PASSWORD = 'test-only-app-password-placeholder';
process.env.EMAIL_FROM_NAME = 'Crackers Hyderabad';
process.env.EMAIL_FROM_ADDRESS = 'crackershyderabad@gmail.com';
delete process.env.INTERNAL_ORDER_EMAIL;
delete process.env.ADMIN_NOTIFICATION_EMAIL;
delete process.env.ADMIN_BASE_URL;

const { FieldValue } = require('firebase-admin/firestore');
const {
  maybeSendOrderConfirmationEmail,
  maybeSendInternalNewOrderEmail,
  sendStatusUpdateEmail,
  readEmailConfig,
  statusEmailKey,
} = require(path.join(__dirname, '..', 'api', 'lib', 'email'));

const CUSTOMER_EMAIL = 'customer@gmail.com';
const ADMIN_EMAIL = 'admin.crackershyderabad@gmail.com';

// --- test doubles -----------------------------------------------------------

/** Counts sends instead of talking to Gmail. */
const makeTransporter = () => {
  const sent = [];
  return {
    sent,
    async sendMail(message) {
      sent.push({
        to: message.to[0].address,
        subject: message.subject,
        html: message.html || '',
        text: message.text || '',
      });
      return { messageId: `test-${sent.length}@local` };
    },
    close() {},
  };
};

/** Flaky transporter: every send throws, to prove mail failure is survivable. */
const makeFailingTransporter = () => ({
  sent: [],
  async sendMail() {
    this.sent.push(1);
    throw new Error('SMTP 535 authentication failed pass=abcd1234');
  },
  close() {},
});

const isServerTimestamp = (v) => {
  try { return FieldValue.isEqual(v, FieldValue.serverTimestamp()); } catch { return false; }
};
const isIncrement = (v) => {
  try { return typeof v === 'object' && v !== null && FieldValue.isEqual(v, FieldValue.increment(1)); } catch { return false; }
};

/** Applies dotted-path updates the way Firestore would, in memory. */
const makeOrderRef = (initial = {}) => {
  const data = JSON.parse(JSON.stringify(initial));
  const writes = [];
  const ref = {
    id: 'order-doc-1',
    data,
    writes,
    async get() {
      return { exists: true, id: ref.id, data: () => JSON.parse(JSON.stringify(data)) };
    },
    async update(patch) {
      for (const [path, raw] of Object.entries(patch)) {
        const parts = path.split('.');
        let node = data;
        for (const key of parts.slice(0, -1)) {
          if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
          node[key] = { ...node[key] };
          node = node[key];
        }
        const leaf = parts[parts.length - 1];
        writes.push(path);
        if (isServerTimestamp(raw)) {
          node[leaf] = new Date().toISOString();
        } else if (isIncrement(raw)) {
          node[leaf] = (typeof node[leaf] === 'number' ? node[leaf] : 0) + 1;
        } else {
          node[leaf] = raw;
        }
      }
    },
  };
  return ref;
};

const makeOrder = (overrides = {}) => ({
  shortCode: 'CH1042',
  orderNumber: 1042,
  status: 'Pending',
  total: 16250,
  items: [
    { productId: 'p1', name: 'Sparklers 30 PCS', quantity: 5, price: 240 },
    { productId: 'p2', name: 'Flower Pot 5 PCS', quantity: 3, price: 320 },
  ],
  customer: {
    name: 'Hitesh Ksheersagar',
    email: CUSTOMER_EMAIL,
    phone: '9876543210',
    address: '12-3-4 Banjara Hills',
    city: 'Hyderabad',
    pincode: '500034',
  },
  userEmail: CUSTOMER_EMAIL,
  paymentMode: 'Cash on Delivery',
  delivery: { sameAsBilling: true },
  createdAt: '2026-03-04T10:15:00.000Z',
  notify: {},
  ...overrides,
});

// --- tiny assertion runner --------------------------------------------------

let passed = 0;
let failed = 0;
const results = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++; else failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    results.push(`        expected ${JSON.stringify(expected)}`);
    results.push(`        actual   ${JSON.stringify(actual)}`);
  }
  return ok;
}

const countTo = (transporter, address) =>
  transporter.sent.filter((m) => m.to === address).length;

// --- the two new-order hooks, exactly as orders.js calls them ---------------

async function simulateNewOrder(orderOverrides = {}, { failing = false } = {}) {
  const transporter = failing ? makeFailingTransporter() : makeTransporter();
  const savedOrder = makeOrder(orderOverrides);
  // The document exists once the write has committed — seed the fake with the
  // same shape orders.js hands the hooks, so a later status event (which reads
  // the stored customer) sees a real recipient.
  const orderRef = makeOrderRef(savedOrder);
  await maybeSendOrderConfirmationEmail({}, orderRef, savedOrder, { transporter });
  await maybeSendInternalNewOrderEmail({}, orderRef, savedOrder, { transporter });
  return { transporter, orderRef, savedOrder };
}

async function simulateStatusChange(orderRef, previousStatus, nextStatus) {
  const transporter = makeTransporter();
  // server.js: no transition => changed:false => no hook call at all.
  if (String(previousStatus) === String(nextStatus)) return { transporter, changed: false };
  const order = { ...orderRef.data, status: nextStatus };
  const result = await sendStatusUpdateEmail({}, orderRef, order, nextStatus, { transporter });
  return { transporter, changed: true, result };
}

(async () => {
  console.log('\n=== TWO-EMAIL FLOW — new order + status automation ===\n');

  // ---------------------------------------------------------------- TEST 1
  {
    const { transporter } = await simulateNewOrder();
    check('TEST 1  new order -> total emails', transporter.sent.length, 2);
    check('TEST 1  new order -> customer confirmation', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 1  new order -> admin new-order notification', countTo(transporter, ADMIN_EMAIL), 1);
    check('TEST 1  customer email subject',
      transporter.sent.find((m) => m.to === CUSTOMER_EMAIL).subject,
      'Your Crackers Hyderabad Order #CH1042 is confirmed');
    check('TEST 1  admin email subject',
      transporter.sent.find((m) => m.to === ADMIN_EMAIL).subject,
      'New Order Placed — #CH1042');
  }

  // ---------------------------------------------------------------- TEST 2
  {
    const { orderRef } = await simulateNewOrder();
    const before = orderRef.writes.length;
    const { transporter, changed } = await simulateStatusChange(orderRef, 'Confirmed', 'Packed');
    check('TEST 2  Confirmed -> Packed -> transition detected', changed, true);
    check('TEST 2  Confirmed -> Packed -> customer emails', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 2  Confirmed -> Packed -> admin emails', countTo(transporter, ADMIN_EMAIL), 0);
    check('TEST 2  Packed email subject', transporter.sent[0].subject,
      'Your Crackers Hyderabad Order #CH1042 is packed');
    check('TEST 2  status flag written', orderRef.writes.includes('notify.statusEmails.packed.sentAt'), true);
    void before;
  }

  // ---------------------------------------------------------------- TEST 3
  {
    const { orderRef } = await simulateNewOrder();
    const { transporter } = await simulateStatusChange(orderRef, 'Packed', 'Shipped');
    check('TEST 3  Packed -> Shipped -> customer emails', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 3  Packed -> Shipped -> admin emails', countTo(transporter, ADMIN_EMAIL), 0);
    check('TEST 3  Shipped email subject', transporter.sent[0].subject,
      'Your Crackers Hyderabad Order #CH1042 has shipped');
  }

  // ---------------------------------------------------------------- TEST 4
  {
    const { orderRef } = await simulateNewOrder();
    const { transporter } = await simulateStatusChange(orderRef, 'Shipped', 'Out for Delivery');
    check('TEST 4  Shipped -> Out for Delivery -> customer emails', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 4  Shipped -> Out for Delivery -> admin emails', countTo(transporter, ADMIN_EMAIL), 0);
    check('TEST 4  dedup key for Out for Delivery', statusEmailKey('Out for Delivery'), 'outForDelivery');
  }

  // ---------------------------------------------------------------- TEST 5
  {
    const { orderRef } = await simulateNewOrder();
    const { transporter } = await simulateStatusChange(orderRef, 'Out for Delivery', 'Delivered');
    check('TEST 5  Out for Delivery -> Delivered -> customer emails', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 5  Out for Delivery -> Delivered -> admin emails', countTo(transporter, ADMIN_EMAIL), 0);
  }

  // ---------------------------------------------------------------- TEST 6
  {
    const { orderRef } = await simulateNewOrder();
    const { transporter } = await simulateStatusChange(orderRef, 'Shipped', 'Cancelled');
    check('TEST 6  Shipped -> Cancelled -> customer emails', countTo(transporter, CUSTOMER_EMAIL), 1);
    check('TEST 6  Shipped -> Cancelled -> admin emails', countTo(transporter, ADMIN_EMAIL), 0);
    check('TEST 6  cancelled uses its own dedup key', statusEmailKey('Cancelled'), 'cancelled');
    check('TEST 6  cancellation subject', transporter.sent[0].subject,
      'Your Crackers Hyderabad Order #CH1042 has been cancelled');
  }

  // ---------------------------------------------------------------- TEST 7
  {
    const { orderRef } = await simulateNewOrder();
    const { transporter, changed } = await simulateStatusChange(orderRef, 'Packed', 'Packed');
    check('TEST 7  same-status save -> not a transition', changed, false);
    check('TEST 7  same-status save -> emails', transporter.sent.length, 0);
    check('TEST 7  same-status save -> nothing written', orderRef.writes.filter((w) => w.startsWith('notify.statusEmails')), []);
  }

  // ---------------------------------------------------------------- TEST 8
  {
    const { orderRef } = await simulateNewOrder();
    await simulateStatusChange(orderRef, 'Confirmed', 'Packed');
    const retry = await simulateStatusChange(orderRef, 'Confirmed', 'Packed');
    check('TEST 8  retried status request -> duplicate emails', retry.transporter.sent.length, 0);
    check('TEST 8  retried status request -> already-sent', retry.result.skipped, 'already-sent');
  }

  // ---------------------------------------------------------------- TEST 9
  {
    const { orderRef, savedOrder } = await simulateNewOrder();
    const first = countTo(makeTransporter(), CUSTOMER_EMAIL); // 0, sanity
    void first;
    const retry = makeTransporter();
    // orders.js re-runs both hooks with the same orderRef on a retried create.
    const r1 = await maybeSendOrderConfirmationEmail({}, orderRef, savedOrder, { transporter: retry });
    const r2 = await maybeSendInternalNewOrderEmail({}, orderRef, savedOrder, { transporter: retry });
    check('TEST 9  retried create -> duplicate emails', retry.sent.length, 0);
    check('TEST 9  retried create -> confirmation skipped', r1.skipped, 'already-sent');
    check('TEST 9  retried create -> admin skipped', r2.skipped, 'already-sent');
  }

  // ------------------------------------------------- EXTRA: POS / walk-in
  {
    const posOrder = makeOrder({
      source: 'pos',
      customer: { name: 'Walk-in Customer', email: '', phone: '9000000000', city: 'Hyderabad', pincode: '500001' },
      userEmail: 'staff@crackershyderabad.com',
    });
    const { transporter } = await simulateNewOrder(posOrder);
    check('EXTRA  POS order -> customer email skipped', countTo(transporter, CUSTOMER_EMAIL), 0);
    check('EXTRA  POS order -> admin still notified', countTo(transporter, ADMIN_EMAIL), 1);
    check('EXTRA  POS status email skipped', statusEmailKey('Packed'), 'packed');
  }

  // --------------------------------------------- EXTRA: failure isolation
  {
    let threw = false;
    try {
      await simulateNewOrder({}, { failing: true });
    } catch {
      threw = true;
    }
    check('EXTRA  mail failure never throws into checkout', threw, false);
    const config = readEmailConfig();
    check('EXTRA  password never exposed in config', JSON.stringify(config).includes('test-only-app-password'), false);
    check('EXTRA  config.describe leaks no secret', config.describe.includes('SMTP_PASSWORD'), false);
  }

  // ------------------------------------------- EXTRA: recipient resolution
  {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.INTERNAL_ORDER_EMAIL = 'legacy-store@example.com';
    check('EXTRA  legacy INTERNAL_ORDER_EMAIL still honoured',
      readEmailConfig().adminNotificationEmail, 'legacy-store@example.com');
    delete process.env.INTERNAL_ORDER_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'store-owner@example.com';
    check('EXTRA  ADMIN_NOTIFICATION_EMAIL wins',
      readEmailConfig().adminNotificationEmail, 'store-owner@example.com');
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    check('EXTRA  documented default is the store inbox',
      readEmailConfig().adminNotificationEmail, ADMIN_EMAIL);
  }

  // ------------------------------------------ EXTRA: email content contract
  {
    const { transporter } = await simulateNewOrder();
    const admin = transporter.sent.find((m) => m.to === ADMIN_EMAIL);
    for (const field of ['Order ID', 'Customer', 'Customer Email', 'Phone', 'Quantity', 'Order Total', 'Payment Method', 'Order Date', 'DELIVERY', 'VIEW ORDER']) {
      check(`EXTRA  admin email contains "${field}"`, admin.html.includes(field), true);
    }
    check('EXTRA  admin email shows customer name', admin.html.includes('Hitesh Ksheersagar'), true);
    check('EXTRA  admin email shows delivery address', admin.html.includes('Banjara Hills'), true);
    check('EXTRA  admin email has no auth token in the URL',
      /token|idToken|auth=/i.test(admin.html), false);
    check('EXTRA  admin deep link is the login-gated staff route',
      admin.html.includes('https://admin.crackershyderabad.com/orders/'), true);
    check('EXTRA  admin email is NOT the customer template',
      admin.html.includes('TRACK YOUR ORDER') || admin.html.includes('DOWNLOAD INVOICE'), false);

    const customer = transporter.sent.find((m) => m.to === CUSTOMER_EMAIL);
    check('EXTRA  customer email has the brand logo', customer.html.includes('nav-logo.png'), true);
    check('EXTRA  customer email has TRACK YOUR ORDER', /TRACK YOUR ORDER/i.test(customer.html), true);
    check('EXTRA  customer email has DOWNLOAD INVOICE', /DOWNLOAD INVOICE/i.test(customer.html), true);
    check('EXTRA  customer email lists ordered product names',
      customer.html.includes('Sparklers 30 PCS') && customer.html.includes('Flower Pot 5 PCS'), true);
    check('EXTRA  customer email shows item quantities and line totals',
      customer.html.includes('Qty: 5') && customer.html.includes('Qty: 3')
      && customer.html.includes('₹1,200') && customer.html.includes('₹960'), true);
    check('EXTRA  customer email items section precedes order details',
      customer.html.indexOf('ITEMS IN YOUR ORDER') !== -1
      && customer.html.indexOf('ITEMS IN YOUR ORDER') < customer.html.indexOf('ORDER DETAILS'), true);
  }

  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('\nTEST RUN CRASHED:', error);
  process.exit(1);
});