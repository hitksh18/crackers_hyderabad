import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaBox, FaCheckCircle, FaTruck, FaHourglass, FaBan, FaDownload, FaSpinner, FaTimesCircle } from 'react-icons/fa';
import { generateInvoicePDFBlob } from '../utils/pdfGenerator';
import toast from 'react-hot-toast';

const MyOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchMyOrders();
    }
  }, [user]);

  const fetchMyOrders = async () => {
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
  };

  const downloadInvoice = async (order) => {
    setDownloadingInvoice(order.id);
    
    try {
      const orderWithId = {
        orderId: order.id,
        ...order,
        items: order.items
      };
      
      const pdfBlob = generateInvoicePDFBlob(orderWithId, order.customer);
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${order.id.slice(-6).toUpperCase()}.pdf`;
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
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancelledBy: 'customer'
      });
      
      setOrders(orders.map(o => 
        o.id === order.id ? { ...o, status: 'Cancelled' } : o
      ));
      
      toast.success('Order cancelled successfully');
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
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

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return <FaCheckCircle className="text-green-500" />;
      case 'shipped':
      case 'out for delivery':
        return <FaTruck className="text-blue-500" />;
      case 'packed':
        return <FaBox className="text-yellow-500" />;
      case 'cancelled':
        return <FaBan className="text-red-500" />;
      case 'confirmed':
        return <FaCheckCircle className="text-emerald-500" />;
      default:
        return <FaHourglass className="text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'shipped':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'out for delivery':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'packed':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-primary-50/30 to-accent-50/30">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-primary-50/30 to-accent-50/30 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center text-primary-600 hover:text-primary-800 mb-6 font-semibold">
          <FaArrowLeft className="mr-2" />
          Back to Home
        </Link>

        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent mb-8"
        >
          My Orders
        </motion.h1>

        {orders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-lg p-12 text-center"
          >
            <FaBox className="text-6xl text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-700 mb-2">No Orders Yet</h2>
            <p className="text-gray-500 mb-6">You haven't placed any orders yet</p>
            <Link
              to="/products"
              className="inline-block bg-gradient-to-r from-primary-600 to-accent-600 text-white px-8 py-3 rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              Start Shopping
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
              >
                <div className="bg-gradient-to-r from-primary-600 to-accent-600 p-6 text-white">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold mb-1">
                        Order #{order.id.slice(-6).toUpperCase()}
                      </h3>
                      <p className="text-primary-100 text-sm">
                        {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 border-2 ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        {order.status || 'Pending'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <FaBox className="text-primary-600" />
                        Items Ordered
                      </h4>
                      <div className="space-y-2">
                        {order.items?.map((item, i) => (
                          <div key={i} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800">{item.name}</p>
                              <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                            </div>
                            <p className="font-bold text-primary-600">
                              ₹{(item.discountPrice || item.price) * item.quantity}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <FaTruck className="text-primary-600" />
                        Delivery Details
                      </h4>
                      <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <p className="text-gray-800">
                          <span className="font-semibold">Name:</span> {order.customer?.name}
                        </p>
                        <p className="text-gray-800">
                          <span className="font-semibold">Phone:</span> {order.customer?.phone}
                        </p>
                        {order.customer?.email && (
                          <p className="text-gray-800">
                            <span className="font-semibold">Email:</span> {order.customer?.email}
                          </p>
                        )}
                        {order.customer?.address && (
                          <p className="text-gray-800">
                            <span className="font-semibold">Address:</span>{' '}
                            {order.customer?.address}, {order.customer?.city} - {order.customer?.pincode}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t-2 border-gray-200 flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <span className="text-xl font-bold text-gray-900">Order Total:</span>
                      <span className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent ml-4">
                        ₹{order.total}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => downloadInvoice(order)}
                        disabled={downloadingInvoice === order.id}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 shadow-lg transition-all"
                      >
                        {downloadingInvoice === order.id ? (
                          <>
                            <FaSpinner className="animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FaDownload />
                            Download Invoice
                          </>
                        )}
                      </motion.button>
                      {canCancelOrder(order) && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => cancelOrder(order)}
                          disabled={cancellingOrder === order.id}
                          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-400 shadow-lg transition-all"
                        >
                          {cancellingOrder === order.id ? (
                            <>
                              <FaSpinner className="animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <FaTimesCircle />
                              Cancel Order
                            </>
                          )}
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyOrders;
