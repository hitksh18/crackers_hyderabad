import { useState, useEffect, useMemo } from 'react';
import '../admin-portrait.css';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDoc, doc, deleteDoc } from 'firebase/firestore';
import { invalidateCache, cachedGetDocs, ordersCacheTtl } from '../lib/firestoreCache';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { Eye, FileText, StickyNote, Trash2, Search, ChevronDown } from 'lucide-react';
import toast from '../utils/toast';
import { sendOrderSMS } from '../utils/sms';
import { authFetch, readApiError } from '../utils/apiClient';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useOrderDiscount } from '../hooks/useOrderDiscount';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

/* Invoice PDFs (jsPDF + helpers) load on first use, not with the Orders page. */
const loadInvoicePdf = () => import('../utils/pdfGenerator');
import { pageVariants, revealVariants } from '../lib/motion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import { getStatusTone } from '../components/admin/orderStatus';
import OrderActionBar from '../components/admin/OrderActionBar';
import OrderEditModal from '../components/admin/OrderEditModal';
import AdminHeader from '../components/admin/AdminHeader';
import { getDisplayOrderId, orderIdMatches } from '../lib/orderId';

const statusOptions = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

/* The canonical Order ID, as minted on the server. See lib/orderId.js. */
/* The single visible Order ID: shortCode (CHYD26-3001). `order.id` is internal
   only (Firestore access, routing, API calls) and must never be displayed as
   the order number. A record missing its shortCode renders 'N/A' and logs a
   diagnostic instead of leaking its document id. */
const orderCodeOf = (order) => getDisplayOrderId(order) || 'N/A';

const FilterTab = ({ active, onClick, label, count }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex min-h-[36px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-colors duration-200 ${active ? 'shadow-sm' : ''}`}
    style={
      active
        ? { background: 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--hairline-strong)', boxShadow: 'var(--shadow-xs)' }
        : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
    }
  >
    {label}
    <span className={`tabular rounded-full px-2 py-0.5 text-[11px] ${active ? '' : ''}`} style={active ? { background: 'var(--ember-600)', color: '#fff' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--hairline)' }}>{count}</span>
  </button>
);

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('online');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const { isAdmin } = useAuth();
  const canEditOrder = isAdmin;
  const canDeleteOrder = isAdmin;
  const [editingOrder, setEditingOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [editedNote, setEditedNote] = useState('');
  /* While a save is in flight the editor locks: repeated clicks can neither
     duplicate lines nor fire parallel writes against the same order. */
  const [savingOrder, setSavingOrder] = useState(false);
  /* Discount state for the editor, evaluated against the CURRENT persisted
     order — never edited-but-unsaved lines. */
  const orderDiscount = useOrderDiscount(editingOrder?.id || null);
  const [orderEditMinimum, setOrderEditMinimum] = useState(500);
  const [products, setProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);  /* The order id currently sending over WhatsApp (per-row spinner + disabled
     state); null when idle. Separate from downloadingInvoice so one action
     never freezes the other. */
  const [sendingWhatsApp, setSendingWhatsApp] = useState(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    getDoc(doc(db, 'adminSettings', 'main'))
      .then((snap) => {
        if (snap.exists()) {
          const value = Number(snap.data().minimumOrderValue);
          if (Number.isFinite(value) && value > 0) setOrderEditMinimum(value);
        }
      })
      .catch(() => {});
  }, []);

  const fetchOrders = async () => {
    try {
      // Shared 30s cache with Dashboard: Dashboard ↔ Orders round-trips
      // reuse the same download instead of re-fetching the full collection.
      const ordersData = await cachedGetDocs(collection(db, 'orders'), 'orders', { ttl: ordersCacheTtl });
      setOrders(ordersData.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      /* Read-only catalogue for the order editor — shared cache, not a fresh
         full download on every visit. */
      const productsList = await cachedGetDocs(collection(db, 'products'), 'products');
      setProducts(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const startEditingOrder = (order) => {
    setEditingOrder(order);
    setEditedItems([...(order.items || [])]);
    setEditedNote(order.adminNote || '');
    setShowProductSearch(false);
    setProductSearchQuery('');
  };

  const cancelEditingOrder = () => {
    setEditingOrder(null);
    setEditedItems([]);
    setEditedNote('');
    setShowProductSearch(false);
    setProductSearchQuery('');
  };

  const updateItemQuantity = (index, change) => {
    const newItems = [...editedItems];
    const newQuantity = newItems[index].quantity + change;
    if (newQuantity > 0) {
      newItems[index] = { ...newItems[index], quantity: newQuantity };
      setEditedItems(newItems);
    }
  };

  const removeItemFromOrder = (index) => {
    const newItems = editedItems.filter((_, i) => i !== index);
    setEditedItems(newItems);
  };

  const addProductToOrder = (product) => {
    const existingIndex = editedItems.findIndex(item => item.id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...editedItems];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + 1
      };
      setEditedItems(newItems);
    } else {
      const price = product.discountPrice || product.onlinePrice || product.price || 0;
      setEditedItems([...editedItems, {
        id: product.id,
        name: product.name,
        price: price,
        discountPrice: product.discountPrice,
        quantity: 1
      }]);
    }
    setShowProductSearch(false);
    setProductSearchQuery('');
    toast.success(`${product.name} added to order`);
  };

  const saveOrderChanges = async () => {
    if (!editingOrder || savingOrder) return;

    if (editedItems.length === 0) {
      toast.error('Order must have at least one item');
      return;
    }

    // Fast client-side floor check only — the server re-enforces the live
    // minimum against the recalculated subtotal before persisting.
    const previewTotal = editedItems.reduce((sum, item) => {
      const price = item.discountPrice || item.price || 0;
      return sum + (price * item.quantity);
    }, 0);

    if (previewTotal < orderEditMinimum) {
      toast.error(`Order total must be at least Rs ${orderEditMinimum}. Current total: Rs ${previewTotal}`);
      return;
    }

    setSavingOrder(true);
    try {
      /* The server is the single authority for money: it reprices from the
         products records, recalculates subtotal/discount/total from the
         CURRENT lines, persists them together, and emails the customer the
         updated order. This screen renders the returned order — never a
         locally computed total. */
      const response = await authFetch(`/api/admin/orders/${editingOrder.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editedItems.map((item) => ({ id: item.id, quantity: item.quantity })),
          adminNote: editedNote,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to update order'));
      }
      const data = await response.json().catch(() => ({}));

      if (data.unchanged) {
        toast.success('No changes to save');
      } else {
        mergeUpdatedOrder(data.order);
        toastEmailOutcome(data, 'updated');
        if (data.couponRemoved) {
          toast.error(`Coupon ${data.couponRemoved.code} no longer applies: ${data.couponRemoved.reason}`, { duration: 8000 });
        }
        // The editor stays open with the authoritative order, so the admin
        // can review the recalculated discount or apply an eligible one next.
        orderDiscount.refresh();
      }
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSavingOrder(false);
    }
  };

  /* Merge a server-returned order into list + editor state so every surface
     keeps rendering the authoritative values. */
  const mergeUpdatedOrder = (updated) => {
    setOrders((prev) => prev.map((order) => (
      order.id === updated.id ? { ...order, ...updated } : order
    )));
    if (Array.isArray(updated.items)) setEditedItems(updated.items);
    invalidateCache('coll:orders');
  };

  const toastEmailOutcome = (data, verb) => {
    if (data.emailed) {
      toast.success(`Order ${verb} successfully. Customer emailed the updated order.`);
    } else {
      toast.success(`Order ${verb} successfully.`);
      toast.error(
        data.emailSkipped === 'no-recipient'
          ? 'Order saved, but the customer has no usable email address.'
          : 'Order saved, but the updated-order email could not be sent.',
        { duration: 8000 }
      );
    }
  };

  const handleApplyCoupon = async (code, { override = false } = {}) => {
    if (!code || orderDiscount.busy) return;
    try {
      const result = await orderDiscount.applyCoupon(code, { override });
      if (!result) return;
      if (result.unchanged) {
        toast.success('That discount is already applied.');
        return;
      }
      mergeUpdatedOrder(result.order);
      toast.success(
        `Discount ${result.order.couponCode} applied${result.order.adminOverride ? ' (admin override)' : ''}: −₹${Number(result.order.discount || 0).toLocaleString('en-IN')}. New total ₹${Number(result.order.total || 0).toLocaleString('en-IN')}.` +
        (result.emailed ? ' Customer emailed.' : '')
      );
      if (!result.emailed) {
        toast.error('Discount saved, but the updated-order email could not be sent.', { duration: 8000 });
      }
    } catch (error) {
      console.error('Error applying discount:', error);
      toast.error(error.message || 'Failed to apply the discount');
    }
  };

  const handleApplyCustomPercent = async (percent) => {
    if (orderDiscount.busy) return;
    try {
      const result = await orderDiscount.applyCustomPercent(percent);
      if (!result) return;
      if (result.unchanged) {
        toast.success('That discount is already applied.');
        return;
      }
      mergeUpdatedOrder(result.order);
      toast.success(
        `Custom ${result.order.discountPercent}% discount applied: −₹${Number(result.order.discount || 0).toLocaleString('en-IN')}. New total ₹${Number(result.order.total || 0).toLocaleString('en-IN')}.` +
        (result.emailed ? ' Customer emailed.' : '')
      );
      if (!result.emailed) {
        toast.error('Discount saved, but the updated-order email could not be sent.', { duration: 8000 });
      }
    } catch (error) {
      console.error('Error applying custom discount:', error);
      toast.error(error.message || 'Failed to apply the discount');
    }
  };

  const handleRemoveCoupon = async () => {
    if (orderDiscount.busy) return;
    try {
      const result = await orderDiscount.removeCoupon();
      if (!result) return;
      if (result.unchanged) {
        toast.success('No discount to remove.');
        return;
      }
      mergeUpdatedOrder(result.order);
      toastEmailOutcome(result, 'updated');
    } catch (error) {
      console.error('Error removing discount:', error);
      toast.error(error.message || 'Failed to remove the discount');
    }
  };

  const filteredProducts = products.filter(product =>
    (product.name || '').toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const onlineOrders = orders.filter(order => !order.paymentMode);
  const storeOrders = orders.filter(order => order.paymentMode);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      // The server owns status writes: it is what sees the transition and
      // sends exactly ONE deduped customer email for it (plus updatedAt for
      // the public tracking timeline). Writing the doc from here bypassed
      // that entirely.
      const response = await authFetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to update order'));
      }
      const data = await response.json().catch(() => ({}));

      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, status: newStatus } : o
      ));

      // No transition (the order already had this status) means no event —
      // skip the SMS too, same as the server skips the email.
      const order = orders.find(o => o.id === orderId);
      if (data.changed !== false && order?.customer?.phone) {
        sendOrderSMS({ orderId, type: 'status' });
      }

      toast.success('Order status updated');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    openModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order #${orderNumber}?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Order',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting order #${orderNumber}...`);
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          setOrders((prev) => prev.filter(order => order.id !== orderId));
          toast.success(`Order #${orderNumber} deleted successfully`, { id: loadingToast });
          return true;
        } catch (error) {
          console.error('Error deleting order:', error);
          toast.error('Failed to delete order', { id: loadingToast });
          return false;
        }
      },
    });
  };

  const handleDeleteAllOrders = async () => {
    openModal({
      title: 'Reset All Orders',
      message: `WARNING: This will permanently delete ALL ${orders.length} loaded orders, their tracking codes and product sales counts, and reset the order-number sequence!\n\nThis action CANNOT be undone.\n\nType "DELETE ALL ORDERS" below to confirm:`,
      type: 'danger',
      confirmText: 'Reset Everything',
      cancelText: 'Cancel',
      requiresInput: true,
      inputPlaceholder: 'Type DELETE ALL ORDERS',
      expectedInput: 'DELETE ALL ORDERS',
      pendingText: 'Resetting...',
      onConfirm: async () => {
        const loadingToast = toast.loading('Resetting all orders on the server...');
        try {
          /* Server-side reset: deletes every order + tracking code, zeroes
             sales counts and re-arms the counter atomically. A client-side
             batch loop cannot do any of that safely. */
          const response = await authFetch('/api/admin/orders/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: 'RESET ORDERS' }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Reset failed');
          setOrders([]);
          invalidateCache('coll:orders');
          invalidateCache('coll:products');
          toast.success(
            `Reset complete — ${data.ordersDeleted ?? 0} orders deleted`,
            { id: loadingToast }
          );
          return true;
        } catch (error) {
          console.error('Error resetting orders:', error);
          toast.error(error.message || 'Failed to reset orders', { id: loadingToast });
          return false;
        }
      },
    });
  };

  /* Sends the customer their current status + invoice over WhatsApp through
     the staff-only backend endpoint. The message text, the Order ID and the
     recipient are all re-derived server-side from the stored order; the
     browser only uploads the invoice bytes, generated here with the SAME
     pdfGenerator the Download button uses, so the attachment is byte-identical
     to a downloaded invoice. The Firestore document id travels as the lookup
     key only and never appears in customer-facing content. */
  const handleSendWhatsApp = async (order) => {
    if (!order || sendingWhatsApp) return;
    const code = getDisplayOrderId(order);
    if (!code) {
      toast.error('This order has no customer Order ID yet.');
      return;
    }
    if (!order?.customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    setSendingWhatsApp(order.id);
    try {
      const orderData = {
        ...order,
        items: order.items || []
      };
      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };

      const { generateInvoicePDFBlob } = await loadInvoicePdf();
      const blob = generateInvoicePDFBlob(orderData, customerInfo, { isAdmin: true });
      const form = new FormData();
      form.append('invoice', blob, `Invoice_${code}.pdf`);

      const response = await authFetch(`/api/orders/${order.id}/whatsapp`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) {
        if (data.code === 'WHATSAPP_NOT_CONFIGURED') {
          toast.error('WhatsApp is not configured.');
          return;
        }
        if (data.code === 'ORDER_ID_MISSING') {
          toast.error('This order has no customer Order ID yet.');
          return;
        }
        if (data.code === 'CUSTOMER_PHONE_MISSING' || data.code === 'CUSTOMER_PHONE_INVALID') {
          toast.error('Customer phone number is missing or invalid.');
          return;
        }
        toast.error(await readApiError(response, 'Failed to send WhatsApp message'));
        return;
      }
      toast.success('WhatsApp message sent successfully');
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      toast.error('Failed to send WhatsApp message');
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const handleDownloadInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      /* Pass the order through untouched: the invoice generator reads the
         canonical id (`shortCode`) itself. Injecting the document id as `orderId` here
         used to overwrite it with the internal Firestore document id, so the
         downloaded invoice showed the document id instead of CHYD26-3001. */
      const orderData = {
        ...order,
        items: order.items || []
      };

      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };

      const { downloadInvoicePDF } = await loadInvoicePdf();
      downloadInvoicePDF(orderData, customerInfo, { isAdmin: true });
      toast.success('Invoice downloaded successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handlePrintInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      /* Same as download above: no document-id-as-`orderId` injection — the
         generator reads `shortCode` itself. */
      const orderData = {
        ...order,
        items: order.items || []
      };

      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };

      const { printInvoicePDF } = await loadInvoicePdf();
      printInvoicePDF(orderData, customerInfo, { isAdmin: true });
    } catch (error) {
      console.error('Error printing invoice:', error);
      toast.error('Failed to print invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const visibleOrdersBase = activeTab === 'online' ? onlineOrders : storeOrders;

  const filteredVisibleOrders = useMemo(() => {
    /* The id term is normalised separately from the text fields: an Order ID is
       upper-case with hyphens, so `ch 2026 10 08 42` should find
       `CH-20261008-000042`, while a customer called "Chandra" should still be
       found by typing their name. Matching against the stored id rather than a
       pattern built from the current format is what keeps search working after
       the format changes. */
    const textTerm = search.trim().toLowerCase();

    return visibleOrdersBase.filter(order => {
      const matchesSearch =
        !search.trim() ||
        orderIdMatches(order, search) ||
        (order.customer?.name || '').toLowerCase().includes(textTerm) ||
        (order.customer?.phone || '').includes(textTerm);
      const matchesStatus = statusFilter === 'All' || (order.status || 'Pending') === statusFilter;
      let matchesDate = true;
      if (dateFilter !== 'All') {
        const d = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        const now = new Date();
        if (dateFilter === 'Today') matchesDate = d.toDateString() === now.toDateString();
        if (dateFilter === 'This week') {
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          matchesDate = d >= weekAgo;
        }
        if (dateFilter === 'This month') matchesDate = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [visibleOrdersBase, search, statusFilter, dateFilter]);

  const renderActions = (order, labelled) => (
    <OrderActionBar
      orderCode={orderCodeOf(order)}
      showWhatsApp={activeTab === 'online' && Boolean(order.customer?.phone)}
      canEdit={canEditOrder}
      canDelete={canDeleteOrder}
      isBusy={downloadingInvoice === order.id}
      isWhatsAppBusy={sendingWhatsApp === order.id}
      labelled={labelled}
      onDownloadInvoice={() => handleDownloadInvoice(order)}
      onPrintInvoice={() => handlePrintInvoice(order)}
      onWhatsApp={() => handleSendWhatsApp(order)}
      onEdit={() => startEditingOrder(order)}
      onDelete={() => handleDeleteOrder(order.id, orderCodeOf(order))}
    />
  );

  const renderStatusControl = (order) => {
    if (activeTab !== 'online') {
      return <OrderStatusBadge status={order.status || 'Completed'} />;
    }

    const tone = getStatusTone(order.status);
    const ToneIcon = tone.Icon;

    return (
      <div className="flex items-center gap-1.5">
        <ToneIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: tone.dot }} strokeWidth={2.2} />
        <select
          value={order.status}
          onChange={(e) => handleStatusChange(order.id, e.target.value)}
          aria-label={`Order status for order ${orderCodeOf(order)}`}
          className="min-h-[32px] w-full min-w-0 rounded-full border px-2.5 text-xs font-semibold"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--surface-card)',
            color: 'var(--text-strong)',
            colorScheme: 'dark',
          }}
        >
          {statusOptions.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
    );
  };

  const renderViewLink = (order) => (
    <Link
      to={`/orders/${order.id}`}
      aria-label={`View full details for order ${orderCodeOf(order)}`}
      className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors duration-200"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
    >
      <Eye className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.2} />
      View
    </Link>
  );

  /* Shell-first: header + toolbar paint immediately; only the table
     section shows a skeleton while orders load. Previously the entire page
     (including search/filters) was blocked behind `loading`. */
  if (loading) {
    return (
      <div className="admin-page bg-[var(--surface-page)]">
        <AdminHeader title="Orders" backFallback="/dashboard" />
        <div className="mx-auto w-full max-w-[1550px] px-4 pt-3 lg:px-8">
          <Skeleton className="h-10 w-full max-w-[360px]" />
          <div className="mt-3 rounded-2xl border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <TableSkeleton rows={7} cols={5} label="Loading orders" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
      <CustomModal
        {...modalConfig}
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        busy={isConfirming}
        busyText={modalConfig.pendingText}
      />

      {/* Shared Admin navbar: Back | Orders | actions + avatar.
          Search and filters live in the toolbar below, not the navbar. */}
      <AdminHeader
        title="Orders"
        backFallback="/dashboard"
        controls={(
          <>
            {orders.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllOrders}
                className="ax-btn"
                style={{ borderColor: 'rgba(203, 42, 42, 0.35)', color: 'var(--text-strong)' }}
              >
                <Trash2 aria-hidden="true" style={{ color: '#E14848' }} />
                <span className="hidden sm:inline">Reset All ({orders.length})</span>
                <span className="sm:hidden">Reset All</span>
              </button>
            )}
          </>
        )}
      />

      {/* Page toolbar: search + filters */}
      <div className="mx-auto w-full max-w-[1550px] px-4 pt-3 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[300px] shrink lg:w-[320px] xl:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders... (order #, customer, phone)"
              className="h-10 w-full rounded-[10px] border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-sm font-semibold focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Status: All</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>

          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-10 appearance-none rounded-[10px] border bg-[var(--surface-sunken)] pl-3 pr-8 text-sm font-semibold focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
            >
              <option value="All">Date: All dates</option>
              <option value="Today">Today</option>
              <option value="This week">This week</option>
              <option value="This month">This month</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
          </div>
        </div>
      </div>

      <motion.div
        variants={pageVariants(reduced)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-[1550px] px-4 py-3 lg:px-8"
      >
        {/* Tabs - only controls below navbar, compact */}
        <div className="flex w-fit gap-1 rounded-full border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
          <FilterTab
            active={activeTab === 'online'}
            onClick={() => setActiveTab('online')}
            label="Online Orders"
            count={onlineOrders.length}
          />
          <FilterTab
            active={activeTab === 'store'}
            onClick={() => setActiveTab('store')}
            label="Store Orders"
            count={storeOrders.length}
          />
        </div>

        {orders.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={FileText}
              title="No orders found"
              description="Orders placed online and orders created at the counter will both appear in this register."
            />
          </div>
        ) : filteredVisibleOrders.length === 0 ? (
          <div
            className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center"
            style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-card)' }}
          >
            <FileText className="h-6 w-6" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No matching {activeTab === 'online' ? 'online' : 'store'} orders
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table - grid aligned, full width, no clipping */}
            <div
              className="orders-table-card mt-3 hidden overflow-hidden rounded-2xl border md:block transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              {/* Header — column proportions live in .orders-grid (see admin-portrait.css) */}
              <div
                className="orders-grid grid items-center gap-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest"
                style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', borderBottom: '1px solid var(--hairline)' }}
              >
                <div>Order</div>
                <div>Customer</div>
                <div className="text-center">Items</div>
                <div className="text-right">Total</div>
                <div>Status</div>
                <div>Placed</div>
                <div className="text-right">Actions</div>
              </div>
              {/* Rows */}
              <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {filteredVisibleOrders.map((order) => (
                  <div
                    key={order.id}
                    className="orders-grid grid items-center gap-2 px-3 py-2.5 transition-colors duration-200 hover:bg-[var(--surface-sunken)]/60"
                    style={{ minHeight: '62px' }}
                  >
                    {/* ORDER */}
                    <div className="min-w-0">
                      <p className="tabular text-sm font-bold leading-tight" style={{ color: 'var(--text-strong)' }}>
                        #{orderCodeOf(order)}
                      </p>
                      {order.adminNote && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: 'rgba(210,166,79,0.15)', color: 'var(--gold-600)', border: '1px solid rgba(210,166,79,0.3)' }}>
                          <StickyNote className="h-3 w-3" /> Note
                        </span>
                      )}
                      <div className="mt-1 md:hidden">{renderViewLink(order)}</div>
                    </div>

                    {/* CUSTOMER */}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>
                        {order.customer?.name || 'N/A'}
                      </p>
                      <p className="tabular truncate text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                        {order.customer?.phone || '—'}
                      </p>
                    </div>

                    {/* ITEMS */}
                    <div className="tabular text-center text-sm" style={{ color: 'var(--text-body)' }}>
                      {order.items?.length || 0}
                    </div>

                    {/* TOTAL */}
                    <div className="tabular text-right">
                      <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-strong)' }}>
                        ₹{(order.total || 0).toLocaleString('en-IN')}
                      </p>
                      {order.discount > 0 && (
                        <span className="tabular text-xs font-semibold" style={{ color: '#3E9A6B' }}>
                          -₹{order.discount}
                        </span>
                      )}
                    </div>

                    {/* STATUS */}
                    <div className="min-w-0">
                      <div className="w-full max-w-[150px]">{renderStatusControl(order)}</div>
                    </div>

                    {/* PLACED */}
                    <div className="tabular text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                      {order.createdAt?.toDate ? (
                        <>
                          <div>{order.createdAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                          <div>{order.createdAt.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                        </>
                      ) : (
                        'N/A'
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div className="flex justify-end">
                      <div className="hidden lg:block">{renderActions(order, false)}</div>
                      <div className="lg:hidden">
                        <Link
                          to={`/orders/${order.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile cards */}
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 12)}
              className="mt-4 space-y-3 md:hidden"
            >
              {filteredVisibleOrders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-2xl border p-4 transition-colors duration-200"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tabular text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                        #{orderCodeOf(order)}
                      </p>
                      <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status || (activeTab === 'online' ? 'Pending' : 'Completed')} className="shrink-0" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                        {order.customer?.name || 'N/A'}
                      </p>
                      <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.customer?.phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-base font-bold" style={{ color: 'var(--text-strong)' }}>
                        ₹{(order.total || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.items?.length || 0} items
                      </p>
                    </div>
                  </div>

                  {order.adminNote && (
                    <span className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs" style={{ background: 'rgba(210,166,79,0.15)', color: 'var(--gold-600)' }}>
                      <StickyNote className="h-3 w-3" /> Internal note
                    </span>
                  )}

                  {activeTab === 'online' && <div className="mt-3">{renderStatusControl(order)}</div>}

                  <div className="mt-3 flex flex-wrap gap-2">{renderActions(order, true)}</div>

                  <div className="mt-3">
                    <Link
                      to={`/orders/${order.id}`}
                      className="inline-flex min-h-[44px] items-center gap-2 text-xs font-semibold"
                      style={{ color: 'var(--ember-600)' }}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
                      View full details
                    </Link>
                  </div>
                </li>
              ))}
            </motion.ul>
          </>
        )}

        <AnimatePresence>
          {editingOrder && (
            <OrderEditModal
              order={orders.find((o) => o.id === editingOrder.id) || editingOrder}
              orderCode={orderCodeOf(editingOrder)}
              items={editedItems}
              note={editedNote}
              onNoteChange={setEditedNote}
              showProductSearch={showProductSearch}
              onToggleProductSearch={() => setShowProductSearch(!showProductSearch)}
              productSearchQuery={productSearchQuery}
              onProductSearchChange={setProductSearchQuery}
              filteredProducts={filteredProducts}
              onAddProduct={addProductToOrder}
              onQuantityChange={updateItemQuantity}
              onRemoveItem={removeItemFromOrder}
              onCancel={cancelEditingOrder}
              onSave={saveOrderChanges}
              busy={savingOrder}
              discountData={orderDiscount.data}
              discountLoading={orderDiscount.loading}
              discountError={orderDiscount.error}
              onApplyCoupon={handleApplyCoupon}
              onApplyCustom={handleApplyCustomPercent}
              onRemoveCoupon={handleRemoveCoupon}
              couponBusy={orderDiscount.busy}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Orders;
