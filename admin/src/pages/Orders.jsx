import { useState, useEffect, useMemo } from 'react';
import '../admin-portrait.css';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, FileText, StickyNote, Trash2, Search, ChevronDown } from 'lucide-react';
import toast from '../utils/toast';
import { sendOrderSMS } from '../utils/sms';
import { authFetch, readApiError } from '../utils/apiClient';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../context/AuthContext';
import { downloadInvoicePDF, printInvoicePDF } from '../utils/pdfGenerator';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import { getStatusTone } from '../components/admin/orderStatus';
import OrderActionBar from '../components/admin/OrderActionBar';
import OrderEditModal from '../components/admin/OrderEditModal';
import AccountMenu from '../components/admin/AccountMenu';

const statusOptions = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

const orderCodeOf = (order) => order.shortCode || order.id.slice(-6).toUpperCase();

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
  const { isAdmin, isMod } = useAuth();
  const canEditOrder = isAdmin || isMod;
  const canDeleteOrder = isAdmin;
  const [editingOrder, setEditingOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [editedNote, setEditedNote] = useState('');
  const [orderEditMinimum, setOrderEditMinimum] = useState(500);
  const [products, setProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
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
      const snapshot = await getDocs(collection(db, 'orders'));
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
      const snapshot = await getDocs(collection(db, 'products'));
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
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
    if (!editingOrder) return;

    if (editedItems.length === 0) {
      toast.error('Order must have at least one item');
      return;
    }

    const newTotal = editedItems.reduce((sum, item) => {
      const price = item.discountPrice || item.price || 0;
      return sum + (price * item.quantity);
    }, 0);

    if (newTotal < orderEditMinimum) {
      toast.error(`Order total must be at least Rs ${orderEditMinimum}. Current total: Rs ${newTotal}`);
      return;
    }

    try {
      await updateDoc(doc(db, 'orders', editingOrder.id), {
        items: editedItems,
        total: newTotal,
        adminNote: editedNote.trim() || null,
        adminNoteUpdatedAt: serverTimestamp()
      });

      setOrders(orders.map(order =>
        order.id === editingOrder.id
          ? { ...order, items: editedItems, total: newTotal, adminNote: editedNote.trim() || null }
          : order
      ));

      toast.success('Order updated successfully');
      cancelEditingOrder();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
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
      title: 'Delete All Orders',
      message: `WARNING: This will permanently delete ALL ${orders.length} orders!\n\nThis action CANNOT be undone.\n\nType "DELETE ALL ORDERS" below to confirm:`,
      type: 'danger',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      requiresInput: true,
      inputPlaceholder: 'Type DELETE ALL ORDERS',
      expectedInput: 'DELETE ALL ORDERS',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting ${orders.length} orders...`);

        try {
          const batchSize = 500;
          const orderIds = orders.map(order => order.id);

          for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = writeBatch(db);
            const batchIds = orderIds.slice(i, i + batchSize);

            batchIds.forEach(orderId => {
              batch.delete(doc(db, 'orders', orderId));
            });

            await batch.commit();
          }

          setOrders([]);
          toast.success(`Successfully deleted ${orderIds.length} orders`, { id: loadingToast });
          return true;
        } catch (error) {
          console.error('Error deleting orders:', error);
          toast.error(`Failed to delete orders: ${error.message}`, { id: loadingToast });
          return false;
        }
      },
    });
  };

  const openWhatsAppChat = (order) => {
    if (!order?.customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const phone = order.customer.phone.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const orderId = order.shortCode || order.id.slice(-6).toUpperCase();
    const status = order.status || 'Pending';
    const customerName = order.customer?.name || 'Customer';

    const message = encodeURIComponent(
      `Hello ${customerName},\n\n` +
      `*Order Update - Crackers Hyderabad*\n\n` +
      `Order ID: #${orderId}\n` +
      `Status: ${status}\n` +
      `Total: Rs.${order.total}\n\n` +
      `Thank you for shopping with us!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    toast.success('WhatsApp opened in new tab');
  };

  const handleDownloadInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      const orderData = {
        orderId: order.id,
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
      const orderData = {
        orderId: order.id,
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
    return visibleOrdersBase.filter(order => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || String(order.shortCode || order.id).toLowerCase().includes(q) || (order.customer?.name || '').toLowerCase().includes(q) || (order.customer?.phone || '').includes(q);
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
      labelled={labelled}
      onDownloadInvoice={() => handleDownloadInvoice(order)}
      onPrintInvoice={() => handlePrintInvoice(order)}
      onWhatsApp={() => openWhatsAppChat(order)}
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <div className="mx-auto w-full max-w-[1550px] px-4 py-4 lg:px-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-6 w-64" />
          <div className="mt-3 rounded-2xl border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <TableSkeleton rows={7} cols={5} label="Loading orders" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        busy={isConfirming}
        busyText={modalConfig.pendingText}
        {...modalConfig}
      />

      {/* Dedicated Orders Navbar - ONE navbar: Back, Search, Centered Title, Status, Date, Delete */}
      <header className="sticky top-0 z-30 flex min-h-[60px] w-full shrink-0 items-center border-b bg-[var(--surface-card)] px-4 py-2 transition-colors duration-200 lg:px-8" style={{ borderColor: 'var(--hairline)' }}>
        <div className="orders-head mx-auto flex w-full max-w-[1550px] flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
          <Link
            to="/dashboard"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold transition-colors duration-200"
            style={{ color: 'var(--ember-600)' }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Link>

          <div className="relative w-full sm:w-[300px] shrink lg:w-[320px] xl:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders... (order #, customer, phone)"
              className="h-9 w-full rounded-full border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
          </div>

          <h1 className="orders-title pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-sm font-bold tracking-tight lg:block" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
            Orders Management
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 appearance-none rounded-full border bg-[var(--surface-sunken)] pl-3 pr-8 text-xs font-semibold focus:outline-none transition-colors duration-200"
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
                className="h-9 appearance-none rounded-full border bg-[var(--surface-sunken)] pl-3 pr-8 text-xs font-semibold focus:outline-none transition-colors duration-200"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
              >
                <option value="All">Date: All dates</option>
                <option value="Today">Today</option>
                <option value="This week">This week</option>
                <option value="This month">This month</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            </div>

            {orders.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllOrders}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-200"
                style={{
                  borderColor: 'rgba(203, 42, 42, 0.35)',
                  background: 'rgba(203, 42, 42, 0.08)',
                  color: 'var(--text-strong)',
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" style={{ color: '#E14848' }} />
                <span className="hidden sm:inline">Delete All Orders ({orders.length})</span>
                <span className="sm:hidden">Delete All</span>
                </button>
              )}
            <AccountMenu />
          </div>
        </div>
      </header>

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
              order={editingOrder}
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
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Orders;
