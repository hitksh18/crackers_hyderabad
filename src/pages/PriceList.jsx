import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import { FaSearch, FaBox } from 'react-icons/fa';

const categories = ['All', 'Gift Boxes', 'Kids Special', 'Sparklers', 'Flower Pots', 'Chakkars', 'Garlands', 'Fancy', 'Rockets & Novelties', 'Bombs', 'Guns-Rolls'];

const PriceList = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    let filtered = products;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => {
        if (p.categories && Array.isArray(p.categories)) {
          return p.categories.includes(selectedCategory);
        }
        return p.category === selectedCategory;
      });
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredProducts(filtered);
  }, [selectedCategory, searchQuery, products]);

  const fetchProducts = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsList);
      setFilteredProducts(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const productsByCategory = categories
    .filter(cat => cat !== 'All')
    .map(cat => ({
      category: cat,
      products: products.filter(p => {
        if (p.categories && Array.isArray(p.categories)) {
          return p.categories.includes(cat);
        }
        return p.category === cat;
      })
    }))
    .filter(group => group.products.length > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-purple-900 mb-8"
        >
          Price List
        </motion.h1>

        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <FaSearch className="absolute left-4 top-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-purple-50 border border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {searchQuery || selectedCategory !== 'All' ? (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-purple-600 text-white">
                  <tr>
                    <th className="text-left py-4 px-4 font-semibold">Product Name</th>
                    <th className="text-left py-4 px-4 font-semibold">Categories</th>
                    <th className="text-left py-4 px-4 font-semibold">Offline MRP</th>
                    <th className="text-left py-4 px-4 font-semibold">Offline Sale Price</th>
                    <th className="text-left py-4 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, index) => (
                    <tr
                      key={product.id}
                      className={`border-b ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-purple-50`}
                    >
                      <td className="py-3 px-4 font-medium">{product.name}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(product.categories || [product.category]).map((cat, idx) => (
                            <span key={idx} className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">₹{product.offlineMRP || product.price || 0}</td>
                      <td className="py-3 px-4">
                        {product.offlineDiscountPrice ? (
                          <span className="text-green-600 font-bold">₹{product.offlineDiscountPrice}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {product.outOfStock ? (
                          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                            Out of Stock
                          </span>
                        ) : (
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                            Available
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {productsByCategory.map(({ category, products }) => (
              <div key={category} className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4">
                  <h2 className="text-2xl font-bold">{category}</h2>
                  <p className="text-sm opacity-90">{products.length} products</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Product Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Offline MRP</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Offline Sale Price</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product, index) => (
                        <tr
                          key={product.id}
                          className={`border-b ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-purple-50`}
                        >
                          <td className="py-3 px-4 font-medium">{product.name}</td>
                          <td className="py-3 px-4">₹{product.offlineMRP || product.price || 0}</td>
                          <td className="py-3 px-4">
                            {product.offlineDiscountPrice ? (
                              <span className="text-green-600 font-bold">₹{product.offlineDiscountPrice}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {product.outOfStock ? (
                              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                                Out of Stock
                              </span>
                            ) : (
                              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                                Available
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg">
            <FaBox className="text-6xl text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No products found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceList;
