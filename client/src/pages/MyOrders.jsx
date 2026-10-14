import { useState, useEffect, useCallback } from 'react';
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
  ChevronDown,
  Truck,
  Hourglass,
  Ban,
  Download,
  Loader2,
  XCircle,
  ClipboardList,
  ShoppingBag,
  MapPin,
} from 'lucide-react';
import { generateInvoicePDFBlob } from '../utils/pdfGenerator';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { getDisplayOrderId } from '../lib/orderId';

const OrderCardSkeleton = () => (
  <div className="panel-editorial glass-card p-5 sm:p-7" aria-hidden="true">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3 w-36" />
      </div>
      <Skeleton className="h-8 w-28" rounded="var(--r-pill)" />
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-5" style={{ borderTop: '1px solid var(--hairline)' }}>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-11 w-48" rounded="var(--r-md)" />
    </div>
  </div>
);

const MyOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const fetchMyOrders = useCallback(async () => {
    try {
      let allOrders = [];

      if (user.uid) {
        const userIdQuery = query(
          collection(db, 'orders'),
          where('userId', '==', user.uid)
        );
        const userIdSnapshot = await getDocs(userIdQuery);
        allOrders = userIdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      if (user.email && allOrders.length === 0) {
        const emailQuery = query(
          collection(db, 'orders'),
          where('customer.email', '==', user.email)
        );
        const emailSnapshot = await getDocs(emailQuery);
        const emailOrders = emailSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        emailOrders.forEach(order => {
          if (!allOrders.find(o => o.id === order.id)) {
            allOrders.push(order);
          }
        });
      }

      if (user.phoneNumber && allOrders.length === 0) {
        const phoneQuery = query(
          collection(db, 'orders'),
          where('customer.phone', '==', user.phoneNumber.replace('+91', ''))
        );
        const phoneSnapshot = await getDocs(phoneQuery);
        const phoneOrders = phoneSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        phoneOrders.forEach(order => {
          if (!allOrders.find(o => o.id === order.id)) {
            allOrders.push(order);
          }
        });
      }

      allOrders.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      });

      setOrders(allOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchMyOrders();
    }
  }, [user, fetchMyOrders]);

  const downloadInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      /* Pass the order through untouched: the invoice generator reads the
         canonical id (`shortCode`) itself. Injecting the document id as `orderId` here
         used to overwrite it with the internal Firestore document id, so the
         downloaded invoice printed the document id instead of CHYD26-3001.
         `order.id` stays in the payload for the generator's internal needs
         (keys/dedup) but is never displayed. */
      const orderWithId = {
        ...order,
        items: order.items
      };

      const pdfBlob = generateInvoicePDFBlob(orderWithId, order.customer);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${getDisplayOrderId(order) || 'ORDER'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Invoice downloaded successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const cancelOrder = async (order) => {
    const status = order.status?.toLowerCase();
    if (status === 'delivered' || status === 'cancelled') {
      toast.error('This order cannot be cancelled');
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this order?')) {
      return;
    }

    setCancellingOrder(order.id);

    try {
      // The cancel goes through the server so this status event is seen like
      // any other: exactly ONE deduped customer "order cancelled" email, and
      // ownership re-checked server-side. A direct Firestore write here used
      // to bypass the server entirely, so no cancellation email ever fired.
      const token = await user.getIdToken();
      const response = await fetch('/api/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id, status: 'Cancelled' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel order');
      }

      setOrders(orders.map(o =>
        o.id === order.id ? { ...o, status: 'Cancelled' } : o
      ));

      toast.success('Order cancelled successfully');
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancellingOrder(null);
    }
  };

  const canCancelOrder = (order) => {
    const status = order.status?.toLowerCase();
    if (status === 'delivered' || status === 'cancelled') {
      return false;
    }

    const isOwner =
      order.userId === user?.uid ||
      order.customer?.email === user?.email ||
      order.userEmail === user?.email;

    return isOwner;
  };

  /* -- Presentation only. Status text is always shown next to the icon, so
        colour is never the sole signal. -------------------------------- */
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return CheckCircle2;
      case 'shipped':
      case 'out for delivery':
        return Truck;
      case 'packed':
        return Package;
      case 'cancelled':
        return Ban;
      case 'confirmed':
        return CheckCircle2;
      default:
        return Hourglass;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
      case 'confirmed':
        return 'badge-leaf';
      case 'shipped':
      case 'out for delivery':
      case 'packed':
        return 'badge-gold';
      case 'cancelled':
        return 'badge-crimson';
      default:
        return 'badge-neutral';
    }
  };

  const orderCount = orders.length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <Seo title="My Orders | Crackers Hyderabad" noindex />
      <div className="shell section-pad-sm">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--maroon-700)' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Home
        </Link>

        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 16)}
          className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="section-eyebrow">Account</p>
            <h1 className="section-title mt-3">My Orders</h1>
          </div>

          {!loading && orderCount > 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="tabular font-semibold" style={{ color: 'var(--text-strong)' }}>
                {orderCount}
              </span>{' '}
              {orderCount === 1 ? 'order' : 'orders'} on this account
            </p>
          )}
        </motion.header>

        <hr className="rule-gold mt-6" />

        {loading ? (
          <div role="status" aria-live="polite" aria-busy="true" className="mt-8 space-y-6">
            <span className="sr-only">Loading your orders</span>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={ClipboardList}
              title="No Orders Yet"
              description="You haven't placed any orders yet. Browse the catalogue to build your first order."
              action={
                <Link to="/products" className="btn-primary btn-shine">
                  <ShoppingBag className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Start Shopping
                </Link>
              }
            />
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerParent(reduced, 0.06)}
            className="mt-8 space-y-6"
          >
            {orders.map((order) => {
              const StatusIcon = getStatusIcon(order.status);
              const isExpanded = expandedOrder === order.id;
              /* The single customer-facing id: shortCode (CHYD26-3001). Never
                 the Firestore document id — `order.id` below is internal only
                 (React keys, panel ids, API calls). */
              const orderCode = getDisplayOrderId(order) || 'N/A';
              const panelId = `order-panel-${order.id}`;

              return (
                <motion.article
                  key={order.id}
                  variants={revealVariants(reduced, 16)}
                  className="panel-editorial glass-card"
                >
                  {/* ---- Card head ---- */}
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
                    <div className="min-w-0">
                      <p className="label-caps">Order</p>
                      <h2 className="subsection-title mt-1">
                        #<span className="tabular">{orderCode}</span>
                      </h2>
                      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <span
                        className={`badge ${getStatusColor(order.status)}`}
                        style={{ fontSize: 'var(--font-small)', padding: '0.4rem 0.85rem' }}
                      >
                        <StatusIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {order.status || 'Pending'}
                      </span>
                    </div>
                  </div>

                  {/* ---- Expand toggle ---- */}
                  <div className="px-5 pb-5 sm:px-7">
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      className="btn-quiet w-full sm:w-auto"
                      style={{ minHeight: '44px' }}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      {isExpanded ? 'Hide order details' : 'View order details'}
                    </button>
                  </div>

                  {/* ---- Expanded body. The panel element is always rendered so
                         the toggle's aria-controls never points at a missing id.
                         `hidden` lives on this plain wrapper because Tailwind's
                         `grid` utility would otherwise win over `[hidden]`. ---- */}
                  <div id={panelId} hidden={!isExpanded}>
                    {isExpanded && (
                      <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={revealVariants(reduced, 10)}
                        className="grid gap-6 px-5 pb-6 sm:px-7 md:grid-cols-2"
                      >
                        <section>
                          <h3 className="label-caps flex items-center gap-2">
                            <Package className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            Items Ordered
                          </h3>
                          <ul className="mt-3 space-y-2">
                            {order.items?.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                                style={{
                                  background: 'var(--surface-sunken)',
                                  border: '1px solid var(--hairline)',
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold" style={{ color: 'var(--text-strong)' }}>
                                    {item.name}
                                  </p>
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    Qty: <span className="tabular">{item.quantity}</span>
                                  </p>
                                </div>
                                <p
                                  className="price shrink-0 font-bold"
                                  style={{ color: 'var(--ember-600)' }}
                                >
                                  ₹{(item.discountPrice || item.price || 0) * item.quantity}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </section>

                        <section>
                          <h3 className="label-caps flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            Delivery Details
                          </h3>
                          <dl
                            className="mt-3 space-y-2.5 rounded-xl px-4 py-4"
                            style={{
                              background: 'var(--surface-sunken)',
                              border: '1px solid var(--hairline)',
                            }}
                          >
                            <div className="flex flex-wrap gap-x-2 text-sm">
                              <dt className="font-semibold" style={{ color: 'var(--text-strong)' }}>Name:</dt>
                              <dd style={{ color: 'var(--text-body)' }}>{order.customer?.name}</dd>
                            </div>
                            <div className="flex flex-wrap gap-x-2 text-sm">
                              <dt className="font-semibold" style={{ color: 'var(--text-strong)' }}>Phone:</dt>
                              <dd className="tabular" style={{ color: 'var(--text-body)' }}>{order.customer?.phone}</dd>
                            </div>
                            {order.customer?.email && (
                              <div className="flex flex-wrap gap-x-2 text-sm">
                                <dt className="font-semibold" style={{ color: 'var(--text-strong)' }}>Email:</dt>
                                <dd className="break-all" style={{ color: 'var(--text-body)' }}>{order.customer?.email}</dd>
                              </div>
                            )}
                            {order.customer?.address && (
                              <div className="flex flex-wrap gap-x-2 text-sm">
                                <dt className="font-semibold" style={{ color: 'var(--text-strong)' }}>Address:</dt>
                                <dd style={{ color: 'var(--text-body)' }}>
                                  {order.customer?.address}, {order.customer?.city} - {order.customer?.pincode}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </section>
                      </motion.div>
                    )}
                  </div>

                  {/* ---- Card foot ---- */}
                  <div
                    className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"
                    style={{ borderTop: '1px solid var(--hairline)', background: 'var(--surface-raised)' }}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="label-caps">Order Total</span>
                      <span
                        className="price text-2xl font-bold"
                        style={{ color: 'var(--text-strong)' }}
                      >
                        ₹{order.total}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => downloadInvoice(order)}
                        disabled={downloadingInvoice === order.id}
                        aria-busy={downloadingInvoice === order.id}
                        className="btn-primary"
                      >
                        {downloadingInvoice === order.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            Download Invoice
                          </>
                        )}
                      </button>

                      {canCancelOrder(order) && (
                        <button
                          type="button"
                          onClick={() => cancelOrder(order)}
                          disabled={cancellingOrder === order.id}
                          aria-busy={cancellingOrder === order.id}
                          className="btn-outline"
                          style={{ color: 'var(--crimson-600)', borderColor: 'rgba(203, 42, 42, 0.4)' }}
                        >
                          {cancellingOrder === order.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                              Cancel Order
                            </>
                          )}
                        </button>
                      )}
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
