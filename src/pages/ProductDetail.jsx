import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { FaShoppingCart, FaMinus, FaPlus, FaArrowLeft, FaTag } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';

const ProductDetail = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const productData = { id: docSnap.id, ...docSnap.data() };
          setProduct(productData);
          
          const productsSnap = await getDocs(collection(db, 'products'));
          const allProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          let related = [];
          
          if (productData.brand) {
            related = allProducts.filter(p => 
              p.id !== id && p.brand === productData.brand
            );
          }
          
          if (related.length < 3) {
            const productCategories = productData.categories || [productData.category];
            const categoryRelated = allProducts.filter(p => {
              if (p.id === id) return false;
              if (related.some(r => r.id === p.id)) return false;
              const pCategories = p.categories || [p.category];
              return pCategories.some(cat => productCategories.includes(cat));
            });
            related = [...related, ...categoryRelated];
          }
          
          if (related.length < 3) {
            const randomProducts = allProducts
              .filter(p => p.id !== id && !related.some(r => r.id === p.id))
              .sort(() => Math.random() - 0.5);
            related = [...related, ...randomProducts];
          }
          
          setRelatedProducts(related.slice(0, 3));
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
    setQuantity(1);
  }, [id]);

  const handleAddToCart = () => {
    addToCart(product, quantity);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-gray-600 mb-4">Product not found</h2>
        <Link to="/products" className="text-purple-600 hover:underline">
          Back to Products
        </Link>
      </div>
    );
  }

  const displayPrice = product.discountPrice || product.onlinePrice || product.price;
  const originalPrice = product.onlinePrice || product.price;
  const hasDiscount = product.discountPrice && product.discountPrice < originalPrice;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/products" className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
          <FaArrowLeft className="mr-2" />
          Back to Products
        </Link>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="grid md:grid-cols-2 gap-8 p-8">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative"
            >
              <img
                src={product.imageURL || 'https://via.placeholder.com/400'}
                alt={product.name}
                className="w-full h-96 object-cover rounded-lg"
              />
              {hasDiscount && (
                <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold">
                  {Math.round(((originalPrice - product.discountPrice) / originalPrice) * 100)}% OFF
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col justify-center"
            >
              <h1 className="text-4xl font-bold text-purple-900 mb-4">{product.name}</h1>
              
              {product.brand && (
                <div className="flex items-center gap-2 mb-4">
                  <FaTag className="text-purple-500" />
                  <span className="text-gray-600">Brand:</span>
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                    {product.brand}
                  </span>
                </div>
              )}
              
              <p className="text-gray-600 mb-6">{product.description || 'Premium quality crackers for your celebrations.'}</p>
              
              <div className="mb-6">
                <span className="text-3xl font-bold text-purple-600">₹{displayPrice}</span>
                {hasDiscount && (
                  <span className="text-xl text-gray-400 line-through ml-4">₹{originalPrice}</span>
                )}
              </div>

              <div className="mb-6">
                <span className="text-gray-600">Categories: </span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(product.categories || [product.category]).filter(Boolean).map((cat, idx) => (
                    <span key={idx} className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              {product.outOfStock && (
                <div className="mb-6">
                  <span className="inline-block bg-red-100 text-red-700 px-4 py-2 rounded-lg font-semibold">
                    Out of Stock
                  </span>
                </div>
              )}

              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="bg-gray-200 p-3 rounded-lg hover:bg-gray-300"
                >
                  <FaMinus />
                </button>
                <span className="text-2xl font-bold w-16 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="bg-gray-200 p-3 rounded-lg hover:bg-gray-300"
                >
                  <FaPlus />
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddToCart}
                disabled={product.outOfStock}
                className="w-full bg-purple-600 text-white py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <FaShoppingCart />
                {product.outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </motion.button>
            </motion.div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-12">
            <h2 className="text-3xl font-bold text-purple-900 mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {relatedProducts.map(relatedProduct => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;
