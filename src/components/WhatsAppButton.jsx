import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaWhatsapp } from 'react-icons/fa';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const WhatsAppButton = () => {
  const { user } = useAuth();
  const [whatsappNumber, setWhatsappNumber] = useState('+91 1234567890');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWhatsAppSettings();
    checkUserRole();
  }, [user]);

  const fetchWhatsAppSettings = async () => {
    try {
      const adminDoc = await getDoc(doc(db, 'adminSettings', 'main'));
      if (adminDoc.exists() && adminDoc.data().whatsappNumber) {
        setWhatsappNumber(adminDoc.data().whatsappNumber);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp settings:', error);
    }
  };

  const checkUserRole = async () => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      const roleDoc = await getDoc(doc(db, 'roles', user.uid));
      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        setIsAdmin(role === 'admin' || role === 'sales');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || isAdmin) {
    return null;
  }

  const message = 'Hi! I have a question about your products.';
  const whatsappURL = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappURL}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 z-50"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring' }}
    >
      <FaWhatsapp className="text-3xl" />
    </motion.a>
  );
};

export default WhatsAppButton;
