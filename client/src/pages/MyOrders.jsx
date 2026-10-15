import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  Truck,
  Hourglass,
  Ban,
  ClipboardList,
  ShoppingBag,
  ArrowRight,
  Search,
  SearchX,
} from 'lucide-react';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { getDisplayOrderId } from '../lib/orderId';
import { inr } from '../lib/currency';
import { fetchOrderThumbnails } from '../lib/orderThumbs';

/* Compact card skeleton — mirrors the real card's rows so nothing jumps. */
const OrderCardSkeleton = () => (
  <div className="panel-editorial glass-card p-4 sm:p-5" aria-hidden="true">
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-6 w-24" rounded="var(--r-pill)" />
    </div>
    <Skeleton className="mt-2 h-3 w-40" />
    <div className="mt-3 flex items-center gap-3">
      <Skeleton className="h-11 w-11" rounded="10px" />
      <Skeleton className="h-11 w-11" rounded="10px" />
      <Skeleton className="h-11 w-11" rounded="10px" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-32" rounded="var(--r-md)" />
    </div>
  </div>
);

const STATUS_META = {
  delivered: { Icon: CheckCircle2, badge: 'badge-leaf' },
  completed: { Icon: CheckCircle2, badge: 'badge-leaf' },
  confirmed: { Icon: CheckCircle2, badge: 'badge-leaf' },
  shipped: { Icon: Truck, badge: 'badge-gold' },
  'out for delivery': { Icon: Truck, badge: 'badge-gold' },
  packed: { Icon: Package, badge: 'badge-gold' },
  cancelled: { Icon: Ban, badge: 'badge-crimson' },
};

const statusMeta = (status) =>
  STATUS_META[String(status || '').toLowerCase()] || { Icon: Hourglass, badge: 'badge-neutral' };

const orderDate = (order) => {
  const d = order.createdAt?.toDate?.();
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/**
 * Customer order history — compact, scannable cards. Full detail (tracking,
 * items, saved bill, invoice, cancellation) lives behind View Order on
 * /my-orders/:orderId, so cards never expand in place.
 */
const MyOrders = () => {
  const [orders, setOrders] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const fetchMyOrders = useCallback(async () => {
    try {
      let allOrders = [];

      if (user.uid) {
        const userIdQuery = query(collection(db, 'orders'), where('userId', '==', user.uid));
        const userIdSnapshot = await getDocs(userIdQuery);
        allOrders = userIdSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }

      if (user.email && allOrders.length === 0) {
        const emailQuery = query(collection(db, 'orders'), where('customer.email', '==', user.email));
        const emailSnapshot = await getDocs(emailQuery);
        emailSnapshot.docs.forEach((doc) => {
          const order = { id: doc.id, ...doc.data() };
          if (!allOrders.find((o) => o.id === order.id)) allOrders.push(order);
        });
      }

      if (user.phoneNumber && allOrders.length === 0) {
        const phoneQuery = query(
          collection(db, 'orders'),
          where('customer.phone', '==', user.phoneNumber.replace('+91', '')),
        );
        const phoneSnapshot = await getDocs(phoneQuery);
        phoneSnapshot.docs.forEach((doc) => {
          const order = { id: doc.id, ...doc.data() };
          if (!allOrders.find((o) => o.id === order.id)) allOrders.push(order);
        });
      }

      allOrders.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      });

      setOrders(allOrders);

      /* Bounded thumbnail read: only the first four item ids per card. */
      const ids = allOrders.flatMap((o) => (o.items || []).slice(0, 4).map((it) => it.id));
      fetchOrderThumbnails(ids)
        .then((map) => setThumbs(map))
        .catch(() => {});
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load your orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchMyOrders();
  }, [user, fetchMyOrders]);

  const orderCount = orders.length;

  /* Local, case-insensitive filter over the already-loaded orders — matches
     the display order id (shortCode) and any product name in the order.
     No refetch, no debounce needed (pure in-memory scan). */
  const q = searchQuery.trim().toLowerCase();
  const visibleOrders = useMemo(() => {
    if (!q) return orders;
    return orders.filter((order) => {
      if (String(getDisplayOrderId(order) || '').toLowerCase().includes(q)) return true;
      const items = Array.isArray(order.items) ? order.items : [];
      return items.some((it) => String(it?.name || '').toLowerCase().includes(q));
    });
  }, [orders, q]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <Seo title="My Orders | Crackers Hyderabad" noindex />
      <div className="mx-auto w-full py-6" style={{ maxWidth: 1440, paddingInline: 'clamp(16px, 4vw, 40px)' }}>
        <Link
          to="/"
          className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--maroon-700)' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Home
        </Link>

        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 16)}
          className="mt-2 flex flex-wrap items-end justify-between gap-2"
        >
          <div className="min-w-0">
            <h1
              className="text-xl font-bold sm:text-2xl"
              style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
            >
              My Orders
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              View and manage your orders
            </p>
          </div>

          {!loading && orderCount > 0 && (
            <p className="tabular shrink-0 text-sm" style={{ color: 'var(--text-muted)' }}>
              {q ? (
                <>
                  <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {visibleOrders.length}
                  </span>{' '}
                  {visibleOrders.length === 1 ? 'match' : 'matches'}
                </>
              ) : (
                <>
                  <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {orderCount}
                  </span>{' '}
                  {orderCount === 1 ? 'order' : 'orders'} · Latest first
                </>
              )}
            </p>
          )}
        </motion.header>

        {/* In-page order search — the navbar carries no search field. */}
        {!loading && orderCount > 0 && (
          <div className="relative mx-auto mt-4 w-full max-w-[600px]">
            <label htmlFor="orders-search" className="sr-only">
              Search orders by order number or product name
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <input
              id="orders-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order number or product name"
              autoComplete="off"
              className="input-premium is-glass h-[46px] pl-11 pr-4 text-sm"
              style={{ borderRadius: 'var(--r-pill)' }}
            />
          </div>
        )}

        <hr className="rule-gold mt-5" />

        {loading ? (
          <div role="status" aria-live="polite" aria-busy="true" className="mt-5 space-y-4">
            <span className="sr-only">Loading your orders</span>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={ClipboardList}
              title="No Orders Yet"
              description="Your orders will appear here once you place your first order."
              action={
                <Link to="/products" className="btn-primary btn-shine">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Start Shopping
                </Link>
              }
            />
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={SearchX}
              title="No matching orders"
              description="Try searching with a different order number or product name."
              action={
                <button type="button" onClick={() => setSearchQuery('')} className="btn-outline">
                  Clear search
                </button>
              }
            />
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerParent(reduced, 0.05)}
            className="mt-5 space-y-4"
          >
            {visibleOrders.map((order) => {
              const { Icon, badge } = statusMeta(order.status);
              const items = Array.isArray(order.items) ? order.items : [];
              const itemCount = items.reduce((n, it) => n + (Number(it.quantity) || 1), 0);
              const first = items[0];
              const more = Math.max(0, items.length - 1);
              const previewItems = items.slice(0, 4);
              const extraCount = Math.max(0, items.length - previewItems.length);

              return (
                <motion.article
                  key={order.id}
                  variants={revealVariants(reduced, 14)}
                  className="panel-editorial glass-card order-card overflow-hidden"
                >
                  <div className="flex flex-col gap-3 p-4 sm:p-5">
                    {/* Row 1: id + status */}
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <p className="label-caps">Order</p>
                        <h2 className="subsection-title mt-0.5 text-lg">
                          #<span className="tabular">{getDisplayOrderId(order) || 'N/A'}</span>
                        </h2>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="tabular">{orderDate(order)}</span>
                        </p>
                      </div>
                      <span className={`badge ${badge}`}>
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                        {order.status || 'Pending'}
                      </span>
                    </div>

                    {/* Row 2: thumbnails + summary */}
                    <div className="flex items-center gap-3">
                      <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
                        {previewItems.map((it, i) => {
                          const url = thumbs[String(it.id)];
                          return (
                            <span
                              key={`${it.id}-${i}`}
                              className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[10px]"
                              style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
                            >
                              {url ? (
                                <img src={url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                              ) : (
                                <Package className="h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
                              )}
                            </span>
                          );
                        })}
                        {extraCount > 0 && (
                          <span
                            className="tabular flex h-[52px] shrink-0 items-center justify-center rounded-[10px] px-2 text-xs font-bold"
                            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', color: 'var(--text-muted)' }}
                          >
                            +{extraCount}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {first?.name || 'Items in this order'}
                          {more > 0 && <span style={{ color: 'var(--text-muted)' }}> + {more} more</span>}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                            {itemCount}
                          </span>{' '}
                          {itemCount === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                    </div>

                    {/* Row 4: total + action */}
                    <div
                      className="mt-1 flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between"
                      style={{ borderTop: '1px solid var(--hairline)' }}
                    >
                      <p className="flex items-baseline gap-2">
                        <span className="label-caps">Total</span>
                        <span className="price text-xl font-bold" style={{ color: 'var(--text-strong)' }}>
                          {inr(order.total)}
                        </span>
                      </p>
                      <Link
                        to={`/my-orders/${order.id}`}
                        className="btn-primary inline-flex min-h-[42px] w-full items-center justify-center px-5 text-sm sm:w-auto"
                      >
                        View Order
                        <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MyOrders;
