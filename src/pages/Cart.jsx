import { motion } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import { FaTrash, FaMinus, FaPlus, FaShoppingBag } from 'react-icons/fa';

const Cart = () => {
  const { cart, removeFromCart, updateQuantity, getCartTotal } = useCart();

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#F7F9FB' }}>
        <FaShoppingBag className="text-8xl text-gray-300 mb-6" />
        <h2 className="text-3xl font-bold text-gray-600 mb-4">Your cart is empty</h2>
        <Link to="/products">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-700"
          >
            Continue Shopping
          </motion.button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 md:px-8" style={{ background: '#F7F9FB' }}>
      <div className="max-w-6xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-purple-900 mb-8"
        >
          Shopping Cart
        </motion.h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white p-5 flex gap-5"
                style={{
                  borderRadius: '18px',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.12)'
                }}
              >
                <img
                  src={item.imageURL || 'https://via.placeholder.com/150'}
                  alt={item.name}
                  className="w-32 h-32 object-cover"
                  style={{ borderRadius: '12px' }}
                />
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-1" style={{ color: '#6B0F0F', fontFamily: 'Poppins, sans-serif' }}>{item.name}</h3>
                  <p className="text-gray-600 text-sm mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>{item.category}</p>
                  <p className="text-lg font-semibold" style={{ color: '#FF6000', fontFamily: 'Poppins, sans-serif' }}>
                    ₹{item.discountPrice || item.onlinePrice || item.price || 0}
                  </p>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-500 hover:text-red-700 transition p-2"
                  >
                    <FaTrash />
                  </button>
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="p-2 rounded-lg transition"
                      style={{ background: '#F3F4F6', border: '1px solid #E5E7EB' }}
                    >
                      <FaMinus className="text-sm" style={{ color: '#6B0F0F' }} />
                    </motion.button>
                    <span className="font-bold w-10 text-center text-lg" style={{ fontFamily: 'Poppins, sans-serif' }}>{item.quantity}</span>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="p-2 rounded-lg transition"
                      style={{ background: '#F3F4F6', border: '1px solid #E5E7EB' }}
                    >
                      <FaPlus className="text-sm" style={{ color: '#6B0F0F' }} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-6 h-fit"
            style={{
              borderRadius: '18px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
              border: '1px solid #FFE08A'
            }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#F8C330', fontFamily: 'Poppins, sans-serif' }}>Order Summary</h2>
            <div className="space-y-3 mb-6">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm" style={{ fontFamily: 'Inter, sans-serif', color: '#666' }}>
                  <span>{item.name} x {item.quantity}</span>
                  <span className="font-semibold" style={{ color: '#333' }}>₹{(item.discountPrice || item.onlinePrice || item.price || 0) * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4" style={{ borderColor: '#FFE08A' }}>
              <div className="flex justify-between text-xl font-bold mb-6" style={{ fontFamily: 'Poppins, sans-serif', color: '#6B0F0F' }}>
                <span>Total</span>
                <span>₹{getCartTotal()}</span>
              </div>
              <Link to="/checkout">
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full text-white py-4 font-bold transition-all"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    borderRadius: '12px',
                    fontFamily: 'Poppins, sans-serif',
                    color: '#6B0F0F',
                    boxShadow: '0 6px 15px rgba(0,0,0,0.15)'
                  }}
                >
                  Proceed to Checkout
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
