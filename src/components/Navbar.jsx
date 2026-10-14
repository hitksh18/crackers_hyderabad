import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { FaShoppingCart, FaUser, FaSignOutAlt, FaFileInvoice, FaChevronDown, FaTachometerAlt, FaUserCircle, FaHome, FaShoppingBag, FaClipboardList } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

const Navbar = () => {
  const { getCartCount } = useCart();
  const { user, isAdmin, isSales, signOut } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-50" style={{ background: 'linear-gradient(90deg, #6B0F0F, #B71B1C, #FF8E00)', boxShadow: '0 3px 10px rgba(0,0,0,0.12)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-3">
        <div className="flex justify-between items-center">
          {/* Left: Site Title - Logo Reduced 35% */}
          <Link to="/">
            <motion.h1
              whileHover={{ scale: 1.05 }}
              className="text-base md:text-2xl font-display font-bold tracking-wide text-white px-2"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              Crackers <span className="text-[#F8C330]">Hyderabad</span>
            </motion.h1>
          </Link>

          {/* Right: Navigation Links & Actions */}
          <div className="flex items-center gap-4 md:gap-6">
            <Link to="/" className="transition font-medium flex items-center gap-2 group text-white" style={{ opacity: 0.9, fontFamily: 'Inter, sans-serif' }}>
              <motion.div whileHover={{ scale: 1.1, opacity: 1 }} whileTap={{ scale: 0.9 }} style={{ opacity: 0.9 }}>
                <FaHome className="text-xl text-white" />
              </motion.div>
              <span className="hidden md:inline group-hover:opacity-100" style={{ opacity: 0.9 }}>Home</span>
            </Link>
            <Link to="/products" className="transition font-medium flex items-center gap-2 group text-white" style={{ opacity: 0.9, fontFamily: 'Inter, sans-serif' }}>
              <motion.div whileHover={{ scale: 1.1, opacity: 1 }} whileTap={{ scale: 0.9 }} style={{ opacity: 0.9 }}>
                <FaShoppingBag className="text-xl text-white" />
              </motion.div>
              <span className="hidden md:inline group-hover:opacity-100" style={{ opacity: 0.9 }}>Products</span>
            </Link>

            <Link to="/cart" className="relative">
              <motion.div whileHover={{ scale: 1.1, opacity: 1 }} whileTap={{ scale: 0.9 }} style={{ opacity: 0.9 }}>
                <FaShoppingCart className="text-2xl text-white" />
                {getCartCount() > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[#F8C330] text-dark-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                    {getCartCount()}
                  </span>
                )}
              </motion.div>
            </Link>

            {user ? (
              <div className="flex items-center gap-4">
                {(isAdmin || isSales) && (
                  <Link to="/admin/billing" className="px-4 py-2 rounded-xl font-semibold transition flex items-center gap-2 hidden md:flex text-white" style={{ background: 'linear-gradient(90deg, #FF5F6D, #FFC371)', fontFamily: 'Inter, sans-serif', opacity: 0.9, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
                    <FaFileInvoice />
                    <span>Billing</span>
                  </Link>
                )}
                
                <div className="relative" ref={profileMenuRef}>
                  <motion.button
                    whileHover={{ scale: 1.05, opacity: 1, boxShadow: '0 6px 18px rgba(0,0,0,0.3)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-2 font-semibold transition text-white overflow-hidden"
                    style={{ 
                      background: user.photoURL ? 'transparent' : '#F8C330', 
                      color: '#6B0F0F', 
                      fontFamily: 'Inter, sans-serif', 
                      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                      borderRadius: user.photoURL ? '50%' : '0.75rem',
                      padding: user.photoURL ? '0' : '0.75rem',
                      width: user.photoURL ? '45px' : 'auto',
                      height: user.photoURL ? '45px' : 'auto'
                    }}
                  >
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt="Profile" 
                        className="w-full h-full object-cover rounded-full"
                        style={{ border: '2px solid #F8C330' }}
                      />
                    ) : (
                      <FaUser className="text-lg" />
                    )}
                  </motion.button>

                  <AnimatePresence>
                    {showProfileMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-2xl overflow-hidden border-2 border-accent-500/20"
                      >
                        <div className="bg-gradient-to-r from-primary-600 to-accent-600 text-white px-4 py-3 flex items-center gap-3">
                          {user.photoURL && (
                            <img 
                              src={user.photoURL} 
                              alt="Profile" 
                              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-lg"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Logged in as</p>
                            <p className="text-xs opacity-90 truncate">{user.email}</p>
                          </div>
                        </div>

                        <div className="py-2">
                          <Link
                            to="/profile"
                            onClick={() => setShowProfileMenu(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-accent-50 transition"
                          >
                            <FaUserCircle className="text-primary-600" />
                            <span className="font-medium">View Profile</span>
                          </Link>

                          {!isAdmin && !isSales && (
                            <Link
                              to="/my-orders"
                              onClick={() => setShowProfileMenu(false)}
                              className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-accent-50 transition"
                            >
                              <FaClipboardList className="text-blue-600" />
                              <span className="font-medium">My Orders</span>
                            </Link>
                          )}

                          {isAdmin && (
                            <Link
                              to="/admin/dashboard"
                              onClick={() => setShowProfileMenu(false)}
                              className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-accent-50 transition"
                            >
                              <FaTachometerAlt className="text-accent-600" />
                              <span className="font-medium">Admin Dashboard</span>
                            </Link>
                          )}

                          {isSales && (
                            <Link
                              to="/price-list"
                              onClick={() => setShowProfileMenu(false)}
                              className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-accent-50 transition"
                            >
                              <FaFileInvoice className="text-green-600" />
                              <span className="font-medium">Price List</span>
                            </Link>
                          )}

                          <hr className="my-2 border-gray-200" />

                          <button
                            onClick={() => {
                              setShowProfileMenu(false);
                              signOut();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition"
                          >
                            <FaSignOutAlt />
                            <span className="font-medium">Logout</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <motion.div whileHover={{ scale: 1.05, boxShadow: '0 6px 18px rgba(0,0,0,0.3)' }} whileTap={{ scale: 0.95 }}>
                <Link to="/login" className="p-3 rounded-xl font-semibold transition flex items-center gap-2" style={{ background: '#F8C330', color: '#6B0F0F', fontFamily: 'Inter, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', display: 'inline-flex' }}>
                  <FaUser className="text-lg" />
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
