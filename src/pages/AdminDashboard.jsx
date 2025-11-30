import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FaPlus, FaEdit, FaTrash, FaBox, FaShoppingCart, FaStar, FaChartLine, FaRupeeSign, FaFileInvoice, FaSearch, FaImage, FaBell, FaMoon, FaSun, FaCheckCircle, FaTimesCircle, FaHome, FaChevronRight, FaUsers } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';

const AdminDashboard = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const { isOpen, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const { unreadCount, liveOrderCount, serverStatus, markAllAsRead } = useNotifications();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      const productsData = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);

      const ordersSnap = await getDocs(collection(db, 'orders'));
      const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    const product = products.find(p => p.id === productId);
    openModal({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product?.name}"?`,
      type: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'products', productId));
          setProducts(products.filter(p => p.id !== productId));
          toast.success('Product deleted successfully');
        } catch (error) {
          console.error('Error deleting product:', error);
          toast.error('Failed to delete product');
        }
      },
    });
  };

  const topProducts = products
    .filter(p => p.soldCount > 0)
    .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    .slice(0, 5);

  const categories = ['All', 'Gift Boxes', 'Kids Special', 'Sparklers', 'Flower Pots', 'Chakkars', 'Garlands', 'Fancy', 'Rockets & Novelties', 'Bombs', 'Guns-Rolls'];
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const featuredCount = products.filter(p => p.isFeatured).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-accent-600 border-b-4 mb-4 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-300 font-semibold">Loading Dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-6 px-4 md:px-8 bg-gray-50 dark:bg-gray-900 transition-colors">
      <CustomModal isOpen={isOpen} onClose={closeModal} onConfirm={handleConfirm} {...modalConfig} />
      
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
          <FaHome className="text-primary-600" />
          <FaChevronRight className="text-xs" />
          <span className="font-semibold text-gray-900 dark:text-white">Dashboard</span>
        </div>

        {/* Header with Notifications & Dark Mode */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6"
        >
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-display font-bold bg-gradient-to-r from-primary-800 to-accent-600 bg-clip-text text-transparent mb-2">
              Admin Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Manage your crackers inventory and orders</p>
          </div>

          {/* Live Status Indicators & Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Server Status */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {serverStatus === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Live Orders Counter */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <FaShoppingCart className="text-accent-600" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{liveOrderCount} Orders</span>
            </div>

            {/* Notifications Bell */}
            <button
              onClick={markAllAsRead}
              className="relative px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all"
            >
              <FaBell className="text-lg text-gray-700 dark:text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all"
            >
              {isDark ? <FaSun className="text-lg text-yellow-400" /> : <FaMoon className="text-lg text-gray-700" />}
            </button>
          </div>
        </motion.div>

        {/* Global Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="relative max-w-2xl">
            <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search products, orders, customers, categories..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
            />
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6 border-l-4 border-primary-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">Total Products</p>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white">{products.length}</h3>
                <p className="text-xs text-primary-600 mt-1 font-medium">{featuredCount} Featured</p>
              </div>
              <div className="bg-primary-100 dark:bg-primary-900 p-3 rounded-xl">
                <FaBox className="text-2xl text-primary-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6 border-l-4 border-accent-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">Total Orders</p>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white">{orders.length}</h3>
                <p className="text-xs text-green-600 mt-1 font-medium">All Time</p>
              </div>
              <div className="bg-accent-100 dark:bg-accent-900 p-3 rounded-xl">
                <FaShoppingCart className="text-2xl text-accent-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6 border-l-4 border-green-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">Total Revenue</p>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
                  <FaRupeeSign className="text-lg" />
                  {totalRevenue.toLocaleString('en-IN')}
                </h3>
                <p className="text-xs text-green-600 mt-1 font-medium">All Time</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-xl">
                <FaChartLine className="text-2xl text-green-600" />
              </div>
            </div>
          </motion.div>

          {/* Quick Actions Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ y: -5 }}
            className="bg-gradient-to-br from-primary-600 to-accent-600 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6"
          >
            <p className="text-white/90 text-sm font-medium mb-4">Quick Actions</p>
            <div className="grid grid-cols-3 gap-2">
              <Link to="/admin/add-product" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaPlus className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Add</span>
              </Link>
              <Link to="/admin/canvas-editor" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaImage className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Canvas</span>
              </Link>
              <Link to="/admin/orders" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaFileInvoice className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Orders</span>
              </Link>
              <Link to="/admin/billing" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaRupeeSign className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Billing</span>
              </Link>
              <Link to="/admin/users" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaUsers className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Users</span>
              </Link>
              <Link to="/admin/all-products" className="bg-white/20 hover:bg-white/30 transition-all rounded-lg p-2 text-center">
                <FaBox className="text-white text-lg mx-auto mb-1" />
                <span className="text-white text-xs font-medium block">Products</span>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Portrait Mode Layout: Recent Orders & Top Products Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr] gap-6 mb-8">
          {/* Recent Orders Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Recent Orders</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Latest 3 orders</p>
              </div>
              <Link to="/admin/orders">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-r from-primary-600 to-accent-600 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  View All
                </motion.button>
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <FaFileInvoice className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-base">No orders yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 3).map((order) => (
                  <motion.div
                    key={order.id}
                    whileHover={{ x: 5 }}
                    className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-white text-sm">
                          {order.customer?.name || order.customerName || 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Order #{order.id.substring(0, 8)}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                        order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status || 'Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-accent-600 flex items-center">
                        <FaRupeeSign className="text-sm" />
                        {(order.total || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {order.createdAt?.toDate().toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Product Inventory Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Product Inventory</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Top-selling preview</p>
              </div>
              <Link to="/admin/all-products">
                <button 
                  className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-105"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F'
                  }}
                >
                  View All Products
                </button>
              </Link>
            </div>

            {topProducts.length === 0 ? (
              <div className="text-center py-12">
                <FaStar className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-base">No sales data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    whileHover={{ x: 5 }}
                    className={`p-3 rounded-lg border border-gray-100 dark:border-gray-600 hover:shadow-md transition-all ${
                      index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-750'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        #{index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded text-xs font-medium">
                            {product.category}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {product.soldCount || 0} sold
                          </span>
                        </div>
                      </div>
                      <FaStar className="text-accent-500 flex-shrink-0" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
