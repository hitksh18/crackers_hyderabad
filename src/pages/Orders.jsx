import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaTrashAlt, FaEdit, FaPlus, FaMinus, FaTimes, FaSave, FaSearch, FaWhatsapp, FaDownload, FaSpinner } from 'react-icons/fa';
import toast from 'react-hot-toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../context/AuthContext';
import { downloadInvoicePDF } from '../utils/pdfGenerator';

const statusOptions = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('online');
  const { isOpen, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const { isAdmin } = useAuth();
  const [editingOrder, setEditingOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
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
    setEditedItems([...order.items]);
    setShowProductSearch(false);
    setProductSearchQuery('');
  };

  const cancelEditingOrder = () => {
    setEditingOrder(null);
    setEditedItems([]);
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

    if (newTotal < 2500) {
      toast.error(`Order total must be at least Rs 2500. Current total: Rs ${newTotal}`);
      return;
    }

    try {
      await updateDoc(doc(db, 'orders', editingOrder.id), {
        items: editedItems,
        total: newTotal
      });

      setOrders(orders.map(order =>
        order.id === editingOrder.id
          ? { ...order, items: editedItems, total: newTotal }
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
    product.name.toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const onlineOrders = orders.filter(order => !order.paymentMode);
  const storeOrders = orders.filter(order => order.paymentMode);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      
      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, status: newStatus } : o
      ));
      toast.success('Order status updated');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    openModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order #${orderNumber}?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Order',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          setOrders(orders.filter(order => order.id !== orderId));
          toast.success(`Order #${orderNumber} deleted successfully`);
        } catch (error) {
          console.error('Error deleting order:', error);
          toast.error('Failed to delete order');
        }
      },
    });
  };

  const handleDeleteAllOrders = async () => {
    openModal({
      title: 'Delete All Orders',
      message: `⚠️ WARNING: This will permanently delete ALL ${orders.length} orders!\n\nThis action CANNOT be undone.\n\nType "DELETE ALL ORDERS" below to confirm:`,
      type: 'danger',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      requiresInput: true,
      inputPlaceholder: 'Type DELETE ALL ORDERS',
      expectedInput: 'DELETE ALL ORDERS',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting ${orders.length} orders...`);
        
        try {
          // Use batch writes for better performance (max 500 per batch)
          const batchSize = 500;
          const orderIds = orders.map(order => order.id);
          
          for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = writeBatch(db);
            const batchIds = orderIds.slice(i, i + batchSize);
            
            batchIds.forEach(orderId => {
              batch.delete(doc(db, 'orders', orderId));
            });
            
            await batch.commit();
            console.log(`Deleted batch ${Math.floor(i / batchSize) + 1}`);
          }
          
          setOrders([]);
          toast.success(`Successfully deleted ${orderIds.length} orders`, { id: loadingToast });
        } catch (error) {
          console.error('Error deleting orders:', error);
          toast.error(`Failed to delete orders: ${error.message}`, { id: loadingToast });
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
    const orderId = order.id.slice(-6).toUpperCase();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        {...modalConfig}
      />
      
      <div className="max-w-7xl mx-auto">
        <Link to="/admin/dashboard" className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
          <FaArrowLeft className="mr-2" />
          Back to Dashboard
        </Link>

        <div className="flex justify-between items-center mb-8">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold text-purple-900"
          >
            Orders Management
          </motion.h1>
          
          {orders.length > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteAllOrders}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors"
            >
              <FaTrashAlt />
              Delete All Orders ({orders.length})
            </motion.button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'online'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Online Orders ({onlineOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('store')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'store'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Store Orders ({storeOrders.length})
          </button>
        </div>

        <div className="space-y-4">
          {(activeTab === 'online' ? onlineOrders : storeOrders).map((order, index) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-lg shadow-md p-6"
            >
              {/* Order Header with Edit, WhatsApp and Delete Buttons */}
              <div className="flex flex-wrap justify-between items-center mb-4 pb-4 border-b border-gray-200 gap-2">
                <h2 className="text-xl font-bold text-purple-900">
                  Order #{order.id.slice(-6).toUpperCase()}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDownloadInvoice(order)}
                    disabled={downloadingInvoice === order.id}
                    className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download Invoice PDF"
                  >
                    {downloadingInvoice === order.id ? (
                      <>
                        <FaSpinner className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FaDownload />
                        Invoice
                      </>
                    )}
                  </button>
                  {activeTab === 'online' && order.customer?.phone && (
                    <button
                      onClick={() => openWhatsAppChat(order)}
                      className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                      title="Message customer via WhatsApp"
                    >
                      <FaWhatsapp />
                      WhatsApp
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => startEditingOrder(order)}
                      className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                      title="Edit this order"
                    >
                      <FaEdit />
                      Edit Order
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteOrder(order.id, order.id.slice(-6).toUpperCase())}
                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                    title="Delete this order"
                  >
                    <FaTrashAlt />
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-bold text-purple-900 mb-2">Customer Details</h3>
                  <p className="text-gray-700">{order.customer?.name}</p>
                  <p className="text-gray-600 text-sm">{order.customer?.phone}</p>
                  {order.customer?.email && (
                    <p className="text-gray-600 text-sm">{order.customer?.email}</p>
                  )}
                  {order.customer?.address && (
                    <p className="text-gray-600 text-sm mt-2">{order.customer?.address}, {order.customer?.city} - {order.customer?.pincode}</p>
                  )}
                  {order.paymentMode && (
                    <p className="text-sm mt-2">
                      <span className="font-semibold">Payment:</span> {order.paymentMode}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-purple-900 mb-2">Order Items</h3>
                  <div className="space-y-1">
                    {order.items?.map((item, i) => (
                      <p key={i} className="text-sm text-gray-600">
                        {item.name} x {item.quantity} - ₹{(item.discountPrice || item.price) * item.quantity}
                      </p>
                    ))}
                  </div>
                  <p className="font-bold text-purple-600 mt-2">Total: ₹{order.total}</p>
                </div>

                <div>
                  <h3 className="font-bold text-purple-900 mb-2">Status</h3>
                  {activeTab === 'online' ? (
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className={`w-full px-4 py-2 rounded-lg font-semibold ${
                        order.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                        order.status === 'Out for Delivery' ? 'bg-indigo-100 text-indigo-800' :
                        order.status === 'Shipped' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'Packed' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'Confirmed' ? 'bg-emerald-100 text-emerald-800' :
                        order.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-4 py-2 rounded-lg font-semibold bg-green-100 text-green-800">
                      {order.status || 'Completed'}
                    </div>
                  )}
                  {order.discount > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      Discount: ₹{order.discount}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Order Editing Modal */}
        <AnimatePresence>
          {editingOrder && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={cancelEditingOrder}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">
                      Edit Order #{editingOrder.id.slice(-6).toUpperCase()}
                    </h2>
                    <button
                      onClick={cancelEditingOrder}
                      className="p-2 hover:bg-white/20 rounded-lg transition"
                    >
                      <FaTimes className="text-xl" />
                    </button>
                  </div>
                  <p className="text-purple-200 mt-1">
                    Customer: {editingOrder.customer?.name} | {editingOrder.customer?.phone}
                  </p>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800">Order Items</h3>
                    <button
                      onClick={() => setShowProductSearch(!showProductSearch)}
                      className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition"
                    >
                      <FaPlus />
                      Add Product
                    </button>
                  </div>

                  {showProductSearch && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                      <div className="relative mb-3">
                        <FaSearch className="absolute left-3 top-3 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search products..."
                          value={productSearchQuery}
                          onChange={(e) => setProductSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {filteredProducts.slice(0, 10).map(product => (
                          <button
                            key={product.id}
                            onClick={() => addProductToOrder(product)}
                            className="w-full flex justify-between items-center p-3 bg-white rounded-lg border hover:border-purple-500 hover:bg-purple-50 transition text-left"
                          >
                            <span className="font-medium">{product.name}</span>
                            <span className="text-purple-600 font-bold">
                              ₹{product.discountPrice || product.onlinePrice || product.price || 0}
                            </span>
                          </button>
                        ))}
                        {filteredProducts.length === 0 && (
                          <p className="text-center text-gray-500 py-4">No products found</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {editedItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{item.name}</p>
                          <p className="text-sm text-gray-600">
                            ₹{item.discountPrice || item.price} each
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updateItemQuantity(index, -1)}
                            className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-lg"
                          >
                            <FaMinus className="text-xs" />
                          </button>
                          <span className="font-bold text-lg w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateItemQuantity(index, 1)}
                            className="w-8 h-8 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-600 rounded-lg"
                          >
                            <FaPlus className="text-xs" />
                          </button>
                          <button
                            onClick={() => removeItemFromOrder(index)}
                            className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg ml-2"
                          >
                            <FaTrashAlt className="text-xs" />
                          </button>
                        </div>
                        <div className="text-right ml-4 min-w-[80px]">
                          <p className="font-bold text-purple-600">
                            ₹{((item.discountPrice || item.price) * item.quantity).toFixed(0)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {editedItems.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No items in order. Add products to continue.</p>
                  )}

                  <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                    <div className="flex justify-between items-center text-xl font-bold">
                      <span>New Total:</span>
                      <span className="text-purple-600">
                        ₹{editedItems.reduce((sum, item) => sum + ((item.discountPrice || item.price) * item.quantity), 0).toFixed(0)}
                      </span>
                    </div>
                    {editingOrder.total !== editedItems.reduce((sum, item) => sum + ((item.discountPrice || item.price) * item.quantity), 0) && (
                      <p className="text-sm text-gray-600 mt-1">
                        Original total: ₹{editingOrder.total}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-gray-50 border-t flex gap-4">
                  <button
                    onClick={cancelEditingOrder}
                    className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveOrderChanges}
                    disabled={editedItems.length === 0}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FaSave />
                    Save Changes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-2xl text-gray-500">No orders found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;
