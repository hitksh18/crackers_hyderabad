import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, collection, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { cachedGetDocs } from '../lib/firestoreCache';
import { db } from '../firebase';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FileText, Eye } from 'lucide-react';
import toast from '../utils/toast';
import { sendOrderSMS } from '../utils/sms';
import { authFetch, readApiError } from '../utils/apiClient';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../context/AuthContext';
/* Invoice PDFs (jsPDF + helpers) load on first use, not with the detail page. */
const loadInvoicePdf = () => import('../utils/pdfGenerator');
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import { getStatusTone } from '../components/admin/orderStatus';
import OrderActionBar from '../components/admin/OrderActionBar';
import AdminHeader from '../components/admin/AdminHeader';
import OrderDetailPanel from '../components/admin/OrderDetailPanel';
import OrderEditModal from '../components/admin/OrderEditModal';
import { orderIdOf } from '../lib/orderId';

const statusOptions = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

/* The canonical Order ID, as minted on the server. See lib/orderId.js. */
const orderCodeOf = (order) => orderIdOf(order) || 'N/A';

const AdminOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const { isAdmin } = useAuth();
  const canEditOrder = isAdmin;
  const canDeleteOrder = isAdmin;

  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [orderEditMinimum, setOrderEditMinimum] = useState(500);
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);

  const [editingOrder, setEditingOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [editedNote, setEditedNote] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  useEffect(() => {
    if (!orderId) return undefined;

    let cancelled = false;
    const load = async () => {
      try {
        const [orderSnap, products, adminSnap] = await Promise.all([
          getDoc(doc(db, 'orders', orderId)),
          cachedGetDocs(collection(db, 'products'), 'products'),
          getDoc(doc(db, 'adminSettings', 'main')),
        ]);

        if (cancelled) return;

        if (!orderSnap.exists()) {
          setMissing(true);
          return;
        }

        setOrder({ id: orderSnap.id, ...orderSnap.data() });
        setProducts(products);

        if (adminSnap.exists()) {
          const value = Number(adminSnap.data().minimumOrderValue);
          if (Number.isFinite(value) && value > 0) setOrderEditMinimum(value);
        }
      } catch (error) {
        console.error('Error fetching order:', error);
        if (!cancelled) {
          setMissing(true);
          toast.error('Could not load this order');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const isOnline = order ? !order.paymentMode : true;

  const handleStatusChange = async (newStatus) => {
    try {
      // The server owns status writes: it sees the transition and sends
      // exactly ONE deduped customer email for it (plus updatedAt for the
      // public tracking timeline). Writing the doc from here bypassed that.
      const response = await authFetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to update order'));
      }
      const data = await response.json().catch(() => ({}));
      setOrder(prev => ({ ...prev, status: newStatus }));

      // No transition (the order already had this status) means no event —
      // skip the SMS too, same as the server skips the email.
      if (data.changed !== false && order?.customer?.phone) {
        sendOrderSMS({ orderId, type: 'status' });
      }

      toast.success('Order status updated');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Failed to update order');
    }
  };

  const startEditingOrder = () => {
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
    setEditedItems(editedItems.filter((_, i) => i !== index));
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

      setOrder(prev => ({
        ...prev,
        items: editedItems,
        total: newTotal,
        adminNote: editedNote.trim() || null,
      }));

      toast.success('Order updated successfully');
      cancelEditingOrder();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const handleDeleteOrder = () => {
    openModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order #${orderCodeOf(order)}?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Order',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting order #${orderCodeOf(order)}...`);
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          toast.success(`Order #${orderCodeOf(order)} deleted`, { id: loadingToast });
          navigate('/orders', { replace: true });
          return true;
        } catch (error) {
          console.error('Error deleting order:', error);
          toast.error('Failed to delete order', { id: loadingToast });
          return false;
        }
      },
    });
  };

  const openWhatsAppChat = () => {
    if (!order?.customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const phone = order.customer.phone.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const status = order.status || 'Pending';
    const customerName = order.customer?.name || 'Customer';

    const message = encodeURIComponent(
      `Hello ${customerName},\n\n` +
      `*Order Update - Crackers Hyderabad*\n\n` +
      `Order ID: #${orderCodeOf(order)}\n` +
      `Status: ${status}\n` +
      `Total: Rs.${order.total}\n\n` +
      `Thank you for shopping with us!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    toast.success('WhatsApp opened in new tab');
  };

  const handleDownloadInvoice = async () => {
    setDownloadingInvoice(order.id);
    try {
      const orderData = { orderId: order.id, ...order, items: order.items || [] };
      const customerInfo = order.customer || { name: 'N/A', phone: 'N/A', email: '', address: '', city: '', pincode: '' };
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

  const handlePrintInvoice = async () => {
    setDownloadingInvoice(order.id);
    try {
      const orderData = { orderId: order.id, ...order, items: order.items || [] };
      const customerInfo = order.customer || { name: 'N/A', phone: 'N/A', email: '', address: '', city: '', pincode: '' };
      const { printInvoicePDF } = await loadInvoicePdf();
      printInvoicePDF(orderData, customerInfo, { isAdmin: true });
    } catch (error) {
      console.error('Error printing invoice:', error);
      toast.error('Failed to print invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const filteredProducts = products.filter(product =>
    (product.name || '').toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="admin-page">
        <div className="shell section-pad-sm">
          <div className="mb-8 space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-80" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" rounded="var(--r-lg)" />
            <Skeleton className="h-72 w-full" rounded="var(--r-lg)" />
          </div>
        </div>
      </div>
    );
  }

  if (missing || !order) {
    return (
      <div className="admin-page">
        <AdminHeader
          title="Order"
          backFallback="/orders"
        />
        <div className="shell section-pad-sm">
          <div className="mt-8">
            <EmptyState
              icon={FileText}
              title="Order not found"
              description="This order may have been deleted, or the link is incorrect."
              action={
                <Link to="/orders" className="btn-primary">
                  <Eye className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  View all orders
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const tone = getStatusTone(order.status);
  const ToneIcon = tone.Icon;

  return (
    <div className="admin-page">
      <AdminHeader
        title={`Order #${order ? orderCodeOf(order) : ''}`}
        backFallback="/orders"
      />
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        busy={isConfirming}
        busyText={modalConfig.pendingText}
        {...modalConfig}
      />

      <motion.div
        variants={pageVariants(reduced)}
        initial="initial"
        animate="animate"
        className="shell section-pad-sm"
      >
        <header className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <span className="label-caps">Operations</span>
            <h1 className="section-title mt-1.5">
              Order #{orderCodeOf(order)}
            </h1>
            <p className="tabular mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              {isOnline ? 'Online order' : 'Store order'} ·{' '}
              {order.createdAt?.toDate?.()
                ? order.createdAt.toDate().toLocaleString()
                : order.createdAt?.getTime
                  ? new Date(order.createdAt).toLocaleString()
                  : '—'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOnline ? (
              <label
                className="flex items-center gap-2 rounded-[var(--r-md)] border px-3 py-2"
                style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-card)' }}
              >
                <ToneIcon className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: tone.dot }} strokeWidth={2.2} />
                <span className="label-caps" style={{ color: 'var(--text-muted)' }}>Status</span>
                <select
                  value={order.status || 'Pending'}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  aria-label={`Order status for order ${orderCodeOf(order)}`}
                  disabled={!canEditOrder}
                  className="min-h-[44px] rounded-[var(--r-sm)] border px-2 text-sm font-semibold"
                  style={{
                    borderColor: 'var(--hairline-strong)',
                    background: 'var(--surface-card)',
                    color: 'var(--text-strong)',
                    colorScheme: 'dark',
                  }}
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            ) : (
              <OrderStatusBadge status={order.status || 'Completed'} />
            )}

            <OrderActionBar
              orderCode={orderCodeOf(order)}
              showWhatsApp={isOnline && Boolean(order.customer?.phone)}
              canEdit={canEditOrder}
              canDelete={canDeleteOrder}
              isBusy={downloadingInvoice === order.id}
              onDownloadInvoice={handleDownloadInvoice}
              onPrintInvoice={handlePrintInvoice}
              onWhatsApp={openWhatsAppChat}
              onEdit={startEditingOrder}
              onDelete={handleDeleteOrder}
            />
          </div>
        </header>

        <motion.div variants={revealVariants(reduced, 12)}>
          <OrderDetailPanel order={order} />
        </motion.div>

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

export default AdminOrderDetail;
