import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FaEdit, FaTrash, FaStar, FaSearch, FaFilter, FaTimes, FaBox, FaArrowLeft } from 'react-icons/fa';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';

const AllProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStock, setFilterStock] = useState('All');
  const [filterFeatured, setFilterFeatured] = useState('All');
  const { isOpen, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      const productsData = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    const product = products.find(p => p.id === productId);
    openModal({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product?.name}"?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Product',
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

  const toggleFeatured = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        isFeatured: !currentStatus
      });
      setProducts(products.map(p => 
        p.id === productId ? { ...p, isFeatured: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Removed from featured' : 'Added to featured');
    } catch (error) {
      console.error('Error toggling featured:', error);
      toast.error('Failed to update featured status');
    }
  };

  const toggleOutOfStock = async (productId, currentStatus) => {
    try {
      await updateDoc(doc(db, 'products', productId), {
        outOfStock: !currentStatus
      });
      setProducts(products.map(p => 
        p.id === productId ? { ...p, outOfStock: !currentStatus } : p
      ));
      toast.success(currentStatus ? 'Marked as in stock' : 'Marked as out of stock');
    } catch (error) {
      console.error('Error toggling stock status:', error);
      toast.error('Failed to update stock status');
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'All' || (p.categories && Array.isArray(p.categories) ? p.categories.includes(filterCategory) : p.category === filterCategory);
    const matchesStock = filterStock === 'All' || 
      (filterStock === 'In Stock' && !p.outOfStock) || 
      (filterStock === 'Out of Stock' && p.outOfStock);
    const matchesFeatured = filterFeatured === 'All' || 
      (filterFeatured === 'Featured' && p.isFeatured) || 
      (filterFeatured === 'Not Featured' && !p.isFeatured);
    return matchesSearch && matchesCategory && matchesStock && matchesFeatured;
  });

  const categories = ['All', 'Gift Boxes', 'Kids Special', 'Sparklers', 'Flower Pots', 'Chakkars', 'Garlands', 'Fancy', 'Rockets & Novelties', 'Bombs', 'Guns-Rolls'];

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('All');
    setFilterStock('All');
    setFilterFeatured('All');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F9FB' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-accent-600 border-b-4 mb-4 mx-auto"></div>
          <p className="text-gray-600 font-semibold">Loading Products...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 md:px-8" style={{ background: '#F7F9FB' }}>
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        {...modalConfig}
      />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
            >
              <FaArrowLeft />
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold bg-gradient-to-r from-primary-800 to-accent-600 bg-clip-text text-transparent mb-2">
                All Products
              </h1>
              <p className="text-sm text-gray-600">Manage, edit, and categorize your products</p>
            </div>
            <Link to="/admin/add-product">
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-accent-500 to-accent-600 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 hover:shadow-xl transition-all shadow-lg"
              >
                <FaBox className="text-sm" />
                Add New Product
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-4"
          >
            <p className="text-gray-600 text-xs font-medium mb-1">Total Products</p>
            <p className="text-2xl font-bold text-gray-800">{products.length}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md p-4"
          >
            <p className="text-gray-600 text-xs font-medium mb-1">In Stock</p>
            <p className="text-2xl font-bold text-green-600">{products.filter(p => !p.outOfStock).length}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md p-4"
          >
            <p className="text-gray-600 text-xs font-medium mb-1">Out of Stock</p>
            <p className="text-2xl font-bold text-red-600">{products.filter(p => p.outOfStock).length}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md p-4"
          >
            <p className="text-gray-600 text-xs font-medium mb-1">Featured</p>
            <p className="text-2xl font-bold text-accent-600">{products.filter(p => p.isFeatured).length}</p>
          </motion.div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FaFilter className="text-primary-600" />
              Filters
            </h3>
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors"
            >
              <FaTimes />
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-3 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:outline-none font-medium"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Status</label>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:outline-none font-medium"
              >
                <option value="All">All</option>
                <option value="In Stock">In Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Featured Status</label>
              <select
                value={filterFeatured}
                onChange={(e) => setFilterFeatured(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-primary-500 focus:outline-none font-medium"
              >
                <option value="All">All</option>
                <option value="Featured">Featured</option>
                <option value="Not Featured">Not Featured</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing <span className="font-bold text-primary-600">{filteredProducts.length}</span> of <span className="font-bold">{products.length}</span> products
            </p>
          </div>
        </motion.div>

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-2xl shadow-lg p-12 text-center"
          >
            <FaBox className="text-6xl text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-2">No products found</p>
            <p className="text-gray-400 text-sm">Try adjusting your filters or add a new product</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all overflow-hidden"
              >
                {/* Product Image */}
                <div className="relative h-48 bg-gray-100">
                  <img 
                    src={product.imageURL || 'https://via.placeholder.com/300'} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  {product.outOfStock && (
                    <div className="absolute top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm">
                        OUT OF STOCK
                      </span>
                    </div>
                  )}
                  {product.isFeatured && (
                    <div className="absolute top-3 right-3">
                      <FaStar className="text-accent-500 text-2xl drop-shadow-lg" />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="p-5">
                  <h3 className="font-bold text-lg text-gray-800 mb-2 line-clamp-1">{product.name}</h3>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{product.description}</p>

                  {/* Categories */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(product.categories || [product.category]).slice(0, 2).map((cat, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-primary-100 text-primary-700 rounded-md text-xs font-semibold"
                      >
                        {cat}
                      </span>
                    ))}
                    {(product.categories || []).length > 2 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">
                        +{(product.categories || []).length - 2}
                      </span>
                    )}
                  </div>

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-green-50 p-2 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Online</p>
                      <p className="text-sm font-bold text-green-700">₹{product.price}</p>
                    </div>
                    <div className="bg-blue-50 p-2 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Offline</p>
                      <p className="text-sm font-bold text-blue-700">₹{product.offlinePrice || product.price}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleFeatured(product.id, product.isFeatured)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        product.isFeatured
                          ? 'bg-accent-500 text-white hover:bg-accent-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {product.isFeatured ? 'Featured' : 'Feature'}
                    </button>
                    <button
                      onClick={() => toggleOutOfStock(product.id, product.outOfStock)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        product.outOfStock
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {product.outOfStock ? 'Restock' : 'In Stock'}
                    </button>
                  </div>

                  {/* Edit & Delete */}
                  <div className="flex gap-2 mt-3">
                    <Link to={`/admin/edit-product/${product.id}`} className="flex-1">
                      <button className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                        <FaEdit />
                        Edit
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-700 transition-all"
                    >
                      <FaTrash />
                    </button>
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

export default AllProducts;
