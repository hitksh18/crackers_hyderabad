import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { FaUser, FaEnvelope, FaShieldAlt, FaPhone, FaEdit, FaSave, FaTimes, FaGoogle, FaLink } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, isAdmin, isSales, loginWithGoogle } = useAuth();
  const [editing, setEditing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  const loadUserProfile = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setPhoneNumber(data.phoneNumber || '');
        setDisplayName(data.displayName || user.displayName || '');
      } else {
        setDisplayName(user.displayName || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        phoneNumber,
        displayName,
        email: user.email,
        updatedAt: new Date()
      }, { merge: true });
      
      toast.success('Profile updated successfully!');
      setEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">Please login to view your profile</h2>
          <Link to="/login" className="bg-accent-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent-700">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: '#F7F9FB', position: 'relative' }}>
      <div className="max-w-3xl mx-auto">
        {/* Radial glow behind card */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(248,195,48,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
          style={{
            background: 'white',
            borderRadius: '28px',
            boxShadow: '0 10px 35px rgba(0, 0, 0, 0.10)',
            overflow: 'hidden'
          }}
        >
          <div style={{
            background: 'linear-gradient(90deg, #FF6A4C, #FFC542)',
            height: '150px',
            position: 'relative'
          }}></div>
          
          <div className="relative px-8 pb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              style={{
                position: 'absolute',
                top: '-65px',
                left: '32px'
              }}
            >
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  style={{
                    width: '130px',
                    height: '130px',
                    borderRadius: '50%',
                    border: '4px solid white',
                    objectFit: 'cover',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
                  }}
                />
              ) : (
                <div style={{
                  width: '130px',
                  height: '130px',
                  borderRadius: '50%',
                  border: '4px solid white',
                  background: 'linear-gradient(135deg, #FF6A4C, #FFC542)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
                }}>
                  <FaUser className="text-6xl text-white" />
                </div>
              )}
            </motion.div>

            <div style={{ paddingTop: '80px' }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <motion.h1
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: '#222',
                      marginBottom: '4px',
                      letterSpacing: '-0.5px'
                    }}
                  >
                    {displayName || user.email?.split('@')[0] || 'My Profile'}
                  </motion.h1>
                </div>
                
                {!editing ? (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setEditing(true)}
                    style={{
                      background: 'linear-gradient(90deg, #FFB03A, #FF7C25)',
                      color: 'white',
                      padding: '10px 20px',
                      borderRadius: '12px',
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <FaEdit />
                    Edit Profile
                  </motion.button>
                ) : (
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSaveProfile}
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      <FaSave />
                      Save
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setEditing(false);
                        loadUserProfile();
                      }}
                      className="bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-600 transition flex items-center gap-2"
                    >
                      <FaTimes />
                      Cancel
                    </motion.button>
                  </div>
                )}
              </div>
              
              {isAdmin && (
                <motion.span
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="inline-flex items-center gap-2 bg-accent-100 text-accent-700 px-3 py-1 rounded-full text-sm font-semibold"
                >
                  <FaShieldAlt />
                  Administrator
                </motion.span>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 space-y-6"
              >
                <div style={{
                  background: 'white',
                  borderRadius: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  padding: '28px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                }}>
                  <h2 style={{
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    color: '#222',
                    marginBottom: '8px',
                    position: 'relative',
                    paddingBottom: '12px'
                  }}>
                    Account Information
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      width: '40px',
                      height: '3px',
                      background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                      borderRadius: '2px'
                    }}></div>
                  </h2>
                  
                  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {editing && (
                      <div className="flex items-start gap-4" style={{
                        background: 'linear-gradient(135deg, #FFF8E6 0%, #FFF 100%)',
                        padding: '18px',
                        borderRadius: '14px',
                        border: '2px solid #FFC542'
                      }}>
                        <div style={{
                          background: 'linear-gradient(135deg, #FFB03A, #FF7C25)',
                          padding: '12px',
                          borderRadius: '12px',
                          boxShadow: '0 4px 10px rgba(255,176,58,0.3)'
                        }}>
                          <FaUser className="text-white text-xl" />
                        </div>
                        <div className="flex-1">
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666', marginBottom: '8px' }}>Display Name</p>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter your name"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div style={{
                        background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
                        padding: '12px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 10px rgba(100,181,246,0.25)'
                      }}>
                        <FaEnvelope className="text-xl" style={{ color: '#1976D2' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666', marginBottom: '4px' }}>Email Address</p>
                        <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#222' }}>{user.email}</p>
                        {user.providerData?.[0]?.providerId === 'google.com' && (
                          <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>From Google Account</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div style={{
                        background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
                        padding: '12px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 10px rgba(76,175,80,0.25)'
                      }}>
                        <FaPhone className="text-xl" style={{ color: '#388E3C' }} />
                      </div>
                      <div className="flex-1">
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666', marginBottom: '8px' }}>Mobile Number</p>
                        {editing ? (
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+91 1234567890"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                          />
                        ) : (
                          <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#222' }}>
                            {phoneNumber || <span style={{ color: '#999', fontStyle: 'italic' }}>Not provided</span>}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div style={{
                        background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)',
                        padding: '12px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 10px rgba(255,152,0,0.25)'
                      }}>
                        <FaShieldAlt className="text-xl" style={{ color: '#F57C00' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666', marginBottom: '4px' }}>Account Role</p>
                        <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#222' }}>
                          {isAdmin ? 'Administrator' : isSales ? 'Sales' : 'Customer'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {!user.providerData?.some(p => p.providerId === 'google.com') && (
                    <div className="mt-6 bg-blue-50 rounded-lg p-6 border-2 border-blue-200">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <FaGoogle className="text-blue-600" />
                        Link Google Account
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Connect your Google account to access your profile information and easily sign in.
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={loginWithGoogle}
                        className="bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition flex items-center gap-3 shadow-sm"
                      >
                        <FaGoogle className="text-blue-600 text-xl" />
                        Link with Google
                      </motion.button>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="bg-gradient-to-r from-accent-50 to-primary-50 rounded-lg p-6 border-2 border-accent-200"
                  >
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Admin Access</h3>
                    <p className="text-gray-600 mb-4">You have administrative privileges. Manage products, orders, and billing.</p>
                    <div className="flex gap-3">
                      <Link
                        to="/admin/dashboard"
                        className="bg-accent-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-accent-700 transition"
                      >
                        Go to Dashboard
                      </Link>
                      <Link
                        to="/admin/billing"
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary-700 transition"
                      >
                        Billing System
                      </Link>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
