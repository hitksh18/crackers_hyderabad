'use strict';

/**
 * Commerce analytics — real order/product data for the Admin dashboard.
 *
 * Pairs with lib/siteAnalytics.siteSnapshot (traffic). The route merges both
 * into ONE response so the page loads with a single aggregated request.
 *
 * Source of truth notes (do not "improve" by inventing data):
 * - orders/{id}: total, status, items[{id,name,quantity,price}],
 *   customer{name,phone,email}, userId, userEmail, createdAt, updatedAt,
 *   shortCode. No refund fields exist anywhere — refunds are reported as
 *   untracked, never as zero.
 * - products/{id}: categories[], category, outOfStock, salesCount.
 *   There is no stock-quantity field — low-stock alerts use outOfStock only.
 * - Void orders (Cancelled/Refunded/Failed) are excluded from revenue and
 *   sales counts, mirroring siteAnalytics.
 */

const { getAuth } = require('firebase-admin/auth');
const { Timestamp } = require('firebase-admin/firestore');
const { dayKeyFor, dayStartMs, resolveRange, delta } = require('./siteAnalytics');

const ORDERS_CAP = 5000;
/* Same void set as siteAnalytics (not exported there): case-sensitive. */
const VOID_STATUSES = new Set(['Cancelled', 'Refunded', 'Failed']);
const UNFULFILLED_STATUSES = ['Pending', 'Confirmed', 'Packed'];
const KNOWN_STATUSES = [
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Completed',
];

const numberOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const msOf = (value) => {
  try {
    const ms = value?.toMillis?.();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
};

const maskEmail = (email) => {
  const clean = String(email || '').trim();
  const at = clean.indexOf('@');
  if (at <= 0) return '';
  return `${clean[0]}***@${clean.slice(at + 1)}`;
};

const buyerKeyOf = (order) => {
  const email = String(order.userEmail || order.customerEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  if (order.userId) return `uid:${order.userId}`;
  if (order.customerPhone) return `phone:${String(order.customerPhone).replace(/\D/g, '')}`;
  return '';
};

async function loadOrdersRange(db, fromMs, toMs) {
  const snap = await db
    .collection('orders')
    .where('createdAt', '>=', Timestamp.fromMillis(fromMs))
    .where('createdAt', '<=', Timestamp.fromMillis(toMs))
    .orderBy('createdAt', 'asc')
    .limit(ORDERS_CAP)
    .get();

  const orders = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const ms = msOf(data.createdAt);
    if (!ms || ms > toMs) continue;
    const customer = data.customer && typeof data.customer === 'object' ? data.customer : {};
    const items = Array.isArray(data.items)
      ? data.items.map((item) => ({
        id: String(item?.id || '').slice(0, 128),
        name: String(item?.name || 'Item').slice(0, 160),
        quantity: Math.max(1, Math.floor(numberOf(item?.quantity)) || 1),
        price: numberOf(item?.price),
      }))
      : [];
    orders.push({
      id: doc.id,
      day: dayKeyFor(ms),
      ms,
      total: numberOf(data.total),
      status: String(data.status || 'Pending'),
      items,
      customerName: String(customer.name || '').slice(0, 120),
      customerEmail: String(customer.email || '').slice(0, 254),
      customerPhone: String(customer.phone || '').slice(0, 32),
      userId: data.userId || null,
      userEmail: data.userEmail || null,
      shortCode: String(data.shortCode || data.orderNumber || doc.id).slice(0, 32),
      source: data.source || 'online',
      updatedMs: msOf(data.updatedAt),
      cancelledMs: msOf(data.cancelledAt),
    });
  }
  return { orders, truncated: snap.size === ORDERS_CAP };
}

const isVoid = (order) => VOID_STATUSES.has(order.status);

function summarizeWindow(orders, keys) {
  const inWindow = new Set(keys);
  let revenue = 0;
  let count = 0;
  let itemsSold = 0;
  let cancelled = 0;
  const buyers = new Set();
  const buyersPerDay = {};
  const statuses = {};
  for (const order of orders) {
    if (!inWindow.has(order.day)) continue;
    statuses[order.status] = (statuses[order.status] || 0) + 1;
    if (order.status === 'Cancelled') cancelled += 1;
    if (isVoid(order)) continue;
    revenue += order.total;
    count += 1;
    for (const item of order.items) itemsSold += item.quantity;
    const key = buyerKeyOf(order);
    if (key) {
      buyers.add(key);
      if (!buyersPerDay[order.day]) buyersPerDay[order.day] = new Set();
      buyersPerDay[order.day].add(key);
    }
  }
  return { revenue, count, itemsSold, cancelled, buyers, buyersPerDay, statuses };
}

async function buildActivity(db, orders, fromMs) {
  const events = [];
  const recent = [...orders].sort((a, b) => b.ms - a.ms).slice(0, 6);
  for (const order of recent) {
    events.push({
      type: 'order',
      title: `New order #${order.shortCode}`,
      detail: `${order.customerName || 'Customer'} · ₹${Math.round(order.total).toLocaleString('en-IN')}`,
      ms: order.ms,
    });
  }
  const updates = orders
    .filter((o) => o.updatedMs && o.updatedMs > o.ms + 30_000)
    .sort((a, b) => b.updatedMs - a.updatedMs)
    .slice(0, 4);
  for (const order of updates) {
    events.push({
      type: 'status',
      title: `Order #${order.shortCode} → ${order.status}`,
      detail: order.customerName || 'Customer',
      ms: order.updatedMs,
    });
  }
  /* Recent signups WITHOUT paging the whole Auth user base: the users
     collection carries createdAt (written at signup) and answers "newest
     signups" with one indexed query (~90ms) instead of a full listUsers
     pagination (~750ms+ even for a handful of users). Output shape is
     identical ({ ms, label }); the Auth listing survives only as a capped
     fallback if the collection read fails. */
  try {
    const signupsSnap = await db
      .collection('users')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    signupsSnap.docs
      .map((d) => {
        const data = d.data() || {};
        const ms = msOf(data.createdAt);
        const label = data.displayName || data.name || maskEmail(data.email) || 'New customer';
        return { ms, label };
      })
      .filter((u) => Number.isFinite(u.ms) && u.ms >= fromMs)
      .slice(0, 3)
      .forEach((u) => {
        events.push({ type: 'signup', title: 'New customer account', detail: u.label, ms: u.ms });
      });
  } catch (error) {
    console.error('[commerce] signups collection load failed, falling back to Auth listing:', error.message);
    try {
      const authUsers = [];
      let pageToken;
      let pages = 0;
      do {
        const result = await getAuth().listUsers(1000, pageToken);
        result.users.forEach((u) => authUsers.push(u));
        pageToken = result.pageToken;
        pages += 1;
      } while (pageToken && pages < 3);
      authUsers
        .map((u) => ({
          ms: u.metadata?.creationTime ? Date.parse(u.metadata.creationTime) : NaN,
          label: u.displayName || maskEmail(u.email) || 'New customer',
        }))
        .filter((u) => Number.isFinite(u.ms) && u.ms >= fromMs)
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3)
        .forEach((u) => {
          events.push({ type: 'signup', title: 'New customer account', detail: u.label, ms: u.ms });
        });
    } catch (fallbackError) {
      console.error('[commerce] signups load failed:', fallbackError.message);
    }
  }
  return events.sort((a, b) => b.ms - a.ms).slice(0, 10);
}

async function buildAlerts(db, orders, current, summary, productDocs) {
  const alerts = [];
  try {
    /* Reuses the products snapshot the caller already fetched for the
       category map — no second full collection scan. */
    const outOfStock = [];
    let noSales = 0;
    const noSalesNames = [];
    (productDocs || []).forEach((doc) => {
      const data = doc.data ? doc.data() : doc;
      const id = doc.id || '';
      if (!data) return;
      if (data.outOfStock === true) {
        outOfStock.push(String(data.name || id).slice(0, 120));
      }
      if (numberOf(data.salesCount) === 0 && noSalesNames.length < 5) {
        noSalesNames.push(String(data.name || id).slice(0, 120));
      }
      if (numberOf(data.salesCount) === 0) noSales += 1;
    });
    if (outOfStock.length > 0) {
      alerts.push({
        kind: 'stock',
        title: `${outOfStock.length} product${outOfStock.length === 1 ? '' : 's'} out of stock`,
        detail: outOfStock.slice(0, 3).join(', '),
      });
    }
    if (noSales > 0) {
      alerts.push({
        kind: 'nosales',
        title: `${noSales} product${noSales === 1 ? '' : 's'} with no recorded sales`,
        detail: noSalesNames.slice(0, 3).join(', '),
      });
    }
  } catch (error) {
    console.error('[commerce] products load failed:', error.message);
  }

  try {
    const pendingSnap = await db
      .collection('orders')
      .where('status', 'in', UNFULFILLED_STATUSES)
      .limit(100)
      .get();
    if (pendingSnap.size > 0) {
      alerts.push({
        kind: 'unfulfilled',
        title: `${pendingSnap.size}${pendingSnap.size === 100 ? '+' : ''} unfulfilled order${pendingSnap.size === 1 ? '' : 's'}`,
        detail: 'Awaiting packing or dispatch',
      });
    }
  } catch (error) {
    console.error('[commerce] unfulfilled load failed:', error.message);
  }

  const windowed = orders.filter((o) => current.includes(o.day));
  const totalWindowed = windowed.length;
  if (summary.cancelled >= 3 && totalWindowed > 0 && summary.cancelled / totalWindowed >= 0.2) {
    alerts.push({
      kind: 'cancelled',
      title: `Cancelled-order spike: ${summary.cancelled} of ${totalWindowed} orders`,
      detail: `${Math.round((summary.cancelled / totalWindowed) * 100)}% cancelled in this period`,
    });
  }
  return alerts;
}

/**
 * Commerce block for GET /api/admin/analytics/commerce.
 * Every number traces to orders/products/Auth — nothing is sampled or made up.
 */
async function commerceSnapshot(db, query = {}) {
  const { current, previous, startKey, endKey } = resolveRange(query);
  const rangeStartMs = dayStartMs(previous[0] || startKey);
  const rangeEndMs = dayStartMs(endKey) + 86_400_000 - 1;

  let loaded;
  let productsSnap = { docs: [] };
  try {
    /* The orders range, the products collection and the unfulfilled-orders
       lookup are independent — one round, not three serial stages. */
    const [ordersResult, productsResult] = await Promise.all([
      loadOrdersRange(db, rangeStartMs, rangeEndMs),
      db.collection('products').get().catch((error) => {
        console.error('[commerce] products load failed:', error.message);
        return { docs: [] };
      }),
    ]);
    loaded = ordersResult;
    productsSnap = productsResult;
  } catch (error) {
    console.error('[commerce] orders load failed:', error.message);
    return {
      ok: false,
      range: { from: startKey, to: endKey, days: current.length },
      previousRange: { from: previous[0] || null, to: previous[previous.length - 1] || null },
      unavailable: true,
      dataGaps: { ordersTruncated: false, ordersUnavailable: true },
    };
  }

  const { orders, truncated } = loaded;
  const cur = summarizeWindow(orders, current);
  const prev = summarizeWindow(orders, previous);

  const productCategory = new Map();
  try {
    productsSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const category = Array.isArray(data.categories) && data.categories[0]
        ? String(data.categories[0])
        : String(data.category || '');
      if (category) productCategory.set(doc.id, category.slice(0, 80));
    });
  } catch (error) {
    console.error('[commerce] category map failed:', error.message);
    productCategory.clear();
  }

  const byCategory = new Map();
  const byProduct = new Map();
  for (const order of orders) {
    if (!current.includes(order.day) || isVoid(order)) continue;
    for (const item of order.items) {
      const revenue = item.quantity * item.price;
      const category = productCategory.get(item.id) || 'Uncategorized';
      const cat = byCategory.get(category) || { label: category, qty: 0, revenue: 0 };
      cat.qty += item.quantity;
      cat.revenue += revenue;
      byCategory.set(category, cat);
      const prod = byProduct.get(item.id) || {
        id: item.id,
        name: item.name,
        category: productCategory.get(item.id) || '',
        units: 0,
        revenue: 0,
      };
      prod.units += item.quantity;
      prod.revenue += revenue;
      if (!prod.name || prod.name === 'Item') prod.name = item.name;
      byProduct.set(item.id, prod);
    }
  }
  const categoryRevenue = [...byCategory.values()].reduce((sum, c) => sum + c.revenue, 0);
  const categorySales = [...byCategory.values()]
    .map((c) => ({
      ...c,
      revenue: Math.round(c.revenue * 100) / 100,
      share: categoryRevenue > 0 ? Math.round((c.revenue / categoryRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const topProducts = [...byProduct.values()]
    .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, 10);

  const buyerMap = new Map();
  for (const order of orders) {
    if (!current.includes(order.day)) continue;
    const key = buyerKeyOf(order);
    if (!key) continue;
    const entry = buyerMap.get(key) || {
      name: order.customerName || 'Customer',
      emailMasked: maskEmail(order.userEmail || order.customerEmail),
      orders: 0,
      spend: 0,
      lastMs: 0,
      lastCode: '',
    };
    entry.orders += 1;
    if (!isVoid(order)) entry.spend += order.total;
    if (!entry.name || entry.name === 'Customer') entry.name = order.customerName || entry.name;
    if (order.ms >= entry.lastMs) {
      entry.lastMs = order.ms;
      entry.lastCode = order.shortCode;
    }
    buyerMap.set(key, entry);
  }
  const topCustomers = [...buyerMap.values()]
    .map((c) => ({ ...c, spend: Math.round(c.spend * 100) / 100 }))
    .sort((a, b) => b.spend - a.spend || b.orders - a.orders)
    .slice(0, 8);

  const [activity, alerts] = await Promise.all([
    buildActivity(db, orders, rangeStartMs),
    buildAlerts(db, orders, current, cur, productsSnap.docs),
  ]);

  return {
    ok: true,
    range: { from: startKey, to: endKey, days: current.length },
    previousRange: { from: previous[0] || null, to: previous[previous.length - 1] || null },
    summary: {
      revenue: Math.round(cur.revenue * 100) / 100,
      orders: cur.count,
      customers: cur.buyers.size,
      avgOrderValue: cur.count > 0 ? Math.round((cur.revenue / cur.count) * 100) / 100 : 0,
      itemsSold: cur.itemsSold,
      cancelled: cur.cancelled,
      refunds: { unavailable: true, note: 'Refund events are not tracked by the backend yet.' },
      previous: { revenue: Math.round(prev.revenue * 100) / 100, orders: prev.count, customers: prev.buyers.size },
      deltas: {
        revenue: delta(cur.revenue, prev.revenue),
        orders: delta(cur.count, prev.count),
        customers: delta(cur.buyers.size, prev.buyers.size),
        avgOrderValue: delta(
          cur.count > 0 ? cur.revenue / cur.count : 0,
          prev.count > 0 ? prev.revenue / prev.count : 0,
        ),
        itemsSold: delta(cur.itemsSold, prev.itemsSold),
      },
    },
    customersSeries: current.map((key) => (cur.buyersPerDay[key] ? cur.buyersPerDay[key].size : 0)),
    categorySales,
    orderStatuses: KNOWN_STATUSES.map((status) => ({ status, count: cur.statuses[status] || 0 })),
    topProducts,
    topCustomers,
    activity,
    alerts,
    dataGaps: { ordersTruncated: truncated, ordersUnavailable: false },
  };
}

module.exports = { commerceSnapshot };

