import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import ProductCard from '../components/ProductCard';
import { FaSearch, FaRocket, FaStar, FaGift, FaFire, FaBolt, FaGem, FaBaby, FaSpinner, FaFlask, FaCrown, FaBomb, FaBullseye } from 'react-icons/fa';
import { useSearchParams } from 'react-router-dom';

const categories = [
  { name: 'Gift Boxes', icon: FaGift, color: 'from-primary-600 to-accent-600' },
  { name: 'Kids Special', icon: FaBaby, color: 'from-pink-500 to-purple-600' },
  { name: 'Sparklers', icon: FaStar, color: 'from-accent-500 to-accent-700' },
  { name: 'Flower Pots', icon: FaFire, color: 'from-accent-600 to-primary-700' },
  { name: 'Chakkars', icon: FaSpinner, color: 'from-accent-700 to-primary-600' },
  { name: 'Garlands', icon: FaFlask, color: 'from-green-500 to-emerald-600' },
  { name: 'Fancy', icon: FaCrown, color: 'from-purple-600 to-pink-600' },
  { name: 'Rockets & Novelties', icon: FaRocket, color: 'from-primary-700 to-primary-900' },
  { name: 'Bombs', icon: FaBomb, color: 'from-primary-800 to-accent-500' },
  { name: 'Guns-Rolls', icon: FaBullseye, color: 'from-red-600 to-orange-600' },
];

const Products = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'products'));
        const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(productsData);
        setFilteredProducts(productsData);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
  }, [searchParams]);

  useEffect(() => {
    let filtered = products;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(p => {
        if (p.categories && Array.isArray(p.categories)) {
          return p.categories.some(cat => cat.toLowerCase() === selectedCategory.toLowerCase());
        }
        return p.category?.toLowerCase() === selectedCategory.toLowerCase();
      });
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(p => {
        const nameMatch = p.name.toLowerCase().includes(searchLower);
        const descMatch = p.description?.toLowerCase().includes(searchLower);
        const categoryMatch = p.categories 
          ? p.categories.some(cat => cat.toLowerCase().includes(searchLower))
          : p.category?.toLowerCase().includes(searchLower);
        
        return nameMatch || descMatch || categoryMatch;
      });
    }

    if (sortBy === 'low-high') {
      filtered = [...filtered].sort((a, b) => (a.onlinePrice || a.price || 0) - (b.onlinePrice || b.price || 0));
    } else if (sortBy === 'high-low') {
      filtered = [...filtered].sort((a, b) => (b.onlinePrice || b.price || 0) - (a.onlinePrice || a.price || 0));
    }

    setFilteredProducts(filtered);
  }, [searchTerm, sortBy, products, selectedCategory]);

  return (
    <div className="min-h-screen py-8 px-4 md:px-8" style={{ background: '#F7F9FB', position: 'relative' }}>
      <div className="max-w-7xl mx-auto" style={{ marginTop: '40px' }}>
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-800 to-accent-600 bg-clip-text text-transparent mb-8 text-center"
        >
          Our Products
        </motion.h1>

        <div className="mb-8 space-y-5">
          <div className="relative mx-auto" style={{ maxWidth: '900px', width: '100%' }}>
            <input
              type="text"
              placeholder="Search by product name, category, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-lg focus:outline-none transition-all hover:-translate-y-0.5"
              style={{
                height: '60px',
                borderRadius: '40px',
                paddingLeft: '56px',
                paddingRight: '16px',
                border: '1px solid rgba(255,180,90,0.35)',
                boxShadow: '0 8px 25px rgba(0,0,0,0.08)',
                fontFamily: 'Inter, sans-serif',
                background: '#FFFFFF'
              }}
              onMouseEnter={(e) => e.target.style.border = '1px solid rgba(255,180,90,0.6)'}
              onMouseLeave={(e) => e.target.style.border = '1px solid rgba(255,180,90,0.35)'}
            />
            <FaSearch className="absolute text-xl" style={{ left: '20px', top: '20px', color: '#F8C330' }} />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 text-sm px-3 py-1 rounded-full transition hover:bg-gray-200"
                style={{ top: '16px', background: '#f3f4f6', color: '#666' }}
              >
                Clear
              </button>
            )}
            <style>{`
              input::placeholder {
                color: #8E8E8E;
              }
            `}</style>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6"
          >
            <h3 className="text-center text-sm font-semibold text-gray-600 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Shop by Category
            </h3>
            <div className="category-grid max-w-6xl mx-auto px-2">
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchParams({});
                }}
                className={`category-btn font-semibold transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center ${
                  selectedCategory === 'All'
                    ? 'bg-gradient-to-r from-primary-600 to-accent-600 text-white scale-105'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                style={{ 
                  fontFamily: 'Poppins, sans-serif',
                  fontSize: 'clamp(0.6rem, 2vw, 0.75rem)',
                  border: selectedCategory === 'All' ? 'none' : '2px solid rgba(248, 195, 48, 0.3)'
                }}
              >
                <span className={selectedCategory === 'All' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : ''}>All Products</span>
              </button>
              {categories.map((category, index) => {
                const Icon = category.icon;
                const isSelected = selectedCategory === category.name;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedCategory(category.name);
                      setSearchParams({ category: category.name });
                    }}
                    className={`category-btn font-semibold transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? `bg-gradient-to-r ${category.color} text-white scale-105`
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ 
                      fontFamily: 'Poppins, sans-serif',
                      fontSize: 'clamp(0.55rem, 1.8vw, 0.7rem)',
                      border: isSelected ? 'none' : '2px solid rgba(248, 195, 48, 0.3)'
                    }}
                  >
                    <Icon className={`${isSelected ? 'filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]' : ''}`} style={{ fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)' }} />
                    <span className={`text-center leading-tight ${isSelected ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : ''}`}>{category.name}</span>
                  </button>
                );
              })}
            </div>
            <style>{`
              .category-grid {
                display: grid;
                grid-template-columns: repeat(12, 1fr);
                gap: 0.25rem;
                justify-items: center;
              }
              .category-btn {
                grid-column: span 2;
                width: 100%;
                height: 70px;
                padding: 0.5rem;
                border-radius: 0.75rem;
              }
              .category-grid button:nth-child(7) {
                grid-column: 2 / span 2;
                grid-row: 2;
              }
              .category-grid button:nth-child(8) {
                grid-column: 4 / span 2;
                grid-row: 2;
              }
              .category-grid button:nth-child(9) {
                grid-column: 6 / span 2;
                grid-row: 2;
              }
              .category-grid button:nth-child(10) {
                grid-column: 8 / span 2;
                grid-row: 2;
              }
              .category-grid button:nth-child(11) {
                grid-column: 10 / span 2;
                grid-row: 2;
              }
              @media (max-width: 767px) {
                .category-btn {
                  height: 65px;
                }
              }
              @media (max-width: 639px) {
                .category-btn {
                  height: 60px;
                  padding: 0.4rem;
                }
              }
            `}</style>
          </motion.div>

          {(searchTerm || selectedCategory !== 'All') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-gray-600 mt-4"
            >
              <span className="bg-white px-4 py-2 rounded-full shadow-sm">
                Found <span className="font-bold text-accent-600">{filteredProducts.length}</span> {filteredProducts.length === 1 ? 'product' : 'products'}
                {searchTerm && <span> matching "{searchTerm}"</span>}
                {selectedCategory !== 'All' && !searchTerm && <span> in {selectedCategory}</span>}
              </span>
            </motion.div>
          )}

          <div className="flex justify-center mt-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="focus:outline-none transition-all"
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,0.06)',
                background: '#FFFFFF',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                color: '#444',
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <option value="default">Sort By</option>
              <option value="low-high">Price: Low to High</option>
              <option value="high-low">Price: High to Low</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg h-80 animate-pulse"></div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 bg-white rounded-2xl shadow-lg"
          >
            <FaSearch className="text-6xl text-gray-300 mx-auto mb-4" />
            <p className="text-2xl text-gray-500 mb-2">No products found</p>
            <p className="text-gray-400">Try adjusting your search</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-4 px-6 py-2 rounded-full font-semibold transition-all"
                style={{
                  background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                  color: '#6B0F0F'
                }}
              >
                Clear Search
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Products;
