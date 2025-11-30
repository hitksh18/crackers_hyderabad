import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { FaHome, FaShoppingBag, FaClipboardList, FaCheck } from 'react-icons/fa';

const OrderSuccess = () => {
  const location = useLocation();
  const orderId = location.state?.orderId;
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 800);
    
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 4000);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(confettiTimer);
    };
  }, []);

  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: ['#10B981', '#34D399', '#6EE7B7', '#FFD700', '#FF6B6B', '#4F46E5'][Math.floor(Math.random() * 6)]
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center px-4 py-12 overflow-hidden relative">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {confettiPieces.map((piece) => (
            <motion.div
              key={piece.id}
              className="absolute w-3 h-3 rounded-sm"
              style={{
                left: `${piece.x}%`,
                top: '-20px',
                backgroundColor: piece.color,
              }}
              initial={{ y: -20, rotate: 0, opacity: 1 }}
              animate={{
                y: '100vh',
                rotate: 720,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: piece.duration,
                delay: piece.delay,
                ease: 'linear',
              }}
            />
          ))}
        </div>
      )}

      <div className="text-center max-w-lg w-full relative z-10">
        <div className="relative mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              duration: 0.6
            }}
            className="relative mx-auto w-36 h-36"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-gradient-to-br from-green-400 via-emerald-500 to-teal-500 shadow-2xl"
            />
            
            <motion.div
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1, repeat: 3, repeatDelay: 0.5 }}
              className="absolute inset-0 rounded-full bg-green-400"
            />
            
            <motion.div
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 1.2, repeat: 3, repeatDelay: 0.5, delay: 0.2 }}
              className="absolute inset-0 rounded-full bg-green-300"
            />
            
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <FaCheck className="text-white text-5xl drop-shadow-lg" />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="absolute -top-2 left-1/2 -translate-x-1/2"
          >
            <span className="text-4xl">🎉</span>
          </motion.div>
          <motion.div
            initial={{ scale: 0, x: -20 }}
            animate={{ scale: [0, 1.2, 1], x: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="absolute top-8 left-8"
          >
            <span className="text-3xl">✨</span>
          </motion.div>
          <motion.div
            initial={{ scale: 0, x: 20 }}
            animate={{ scale: [0, 1.2, 1], x: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="absolute top-8 right-8"
          >
            <span className="text-3xl">🎆</span>
          </motion.div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="absolute bottom-0 left-12"
          >
            <span className="text-2xl">🎊</span>
          </motion.div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="absolute bottom-0 right-12"
          >
            <span className="text-2xl">🎇</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 40 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <motion.h1 
            className="text-4xl md:text-5xl font-extrabold mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <span className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Order Confirmed!
            </span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-gray-600 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            Thank you for your order
          </motion.p>
          
          {orderId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.1, type: "spring" }}
              className="inline-block bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400 rounded-2xl px-8 py-4 mb-6 shadow-lg"
            >
              <p className="text-sm text-green-700 font-semibold uppercase tracking-wide">Order ID</p>
              <p className="text-2xl font-bold text-green-800">#{orderId.slice(-8).toUpperCase()}</p>
            </motion.div>
          )}

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-gray-500 mb-10 max-w-md mx-auto leading-relaxed"
          >
            We'll contact you soon for confirmation. You can track your order status and download invoice from <strong className="text-green-600">My Orders</strong>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/my-orders">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
              >
                <FaClipboardList className="text-xl" />
                View My Orders
              </motion.button>
            </Link>

            <Link to="/products">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white border-2 border-green-500 text-green-600 px-10 py-4 rounded-2xl font-bold text-lg hover:bg-green-50 transition-all shadow-lg"
              >
                <FaShoppingBag className="text-xl" />
                Continue Shopping
              </motion.button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-10"
          >
            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-green-600 transition-colors font-medium"
            >
              <FaHome />
              Back to Home
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default OrderSuccess;
