import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaWhatsapp } from 'react-icons/fa';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING, DURATION } from '../lib/motion';

/**
 * Floating WhatsApp contact button — HOME PAGE ONLY.
 *
 * The number comes from the canvas "business information" section in the
 * admin page (HomepageBuilder → footer settings), stored in Firestore at
 * `footerSettings/main`. The dedicated `whatsapp` field wins; the general
 * `phone` field is the fallback. Every mount re-reads the document, so an
 * admin change is picked up on the next homepage visit — nothing is cached.
 */
const WhatsAppButton = () => {
  const { pathname } = useLocation();
  const { isAdmin, isSales } = useAuth();
  const reduced = useReducedMotion();
  const [whatsappNumber, setWhatsappNumber] = useState('+91 1234567890');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fetchWhatsAppSettings = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'footerSettings', 'main'));
      if (snap.exists()) {
        const data = snap.data();
        const raw = (data.whatsapp || data.phone || '').trim();
        if (raw) setWhatsappNumber(raw);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchWhatsAppSettings();
  }, [fetchWhatsAppSettings]);

  if (pathname !== '/' || !settingsLoaded || isAdmin || isSales) {
    return null;
  }

  const message = 'Hi, I would like to know more about your crackers.';
  const whatsappURL = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappURL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="wa-float group fixed z-overlay flex h-14 w-14 items-center justify-center text-white"
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? { duration: DURATION.instant } : { delay: 0.5, ...SPRING.soft }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={reduced ? undefined : { scale: 0.94 }}
    >
      {/* Soft halo with a gentle attention pulse (disabled for reduced motion). */}
      <span
        aria-hidden="true"
        className="wa-halo pointer-events-none absolute inset-0"
        style={{ boxShadow: '0 0 0 7px rgba(37, 211, 102, 0.16)' }}
      />

      {/* Label reveals on hover or keyboard focus. The link itself never depends on it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-full mr-3 hidden translate-x-1 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold opacity-0 transition duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
        style={{
          background: 'rgba(26, 23, 20, 0.94)',
          border: '1px solid rgba(210, 166, 79, 0.34)',
          color: 'var(--text-on-dark)',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 10px 26px rgba(26, 23, 20, 0.4)'
        }}
      >
        Chat with us on WhatsApp
      </span>

      <FaWhatsapp className="relative h-[30px] w-[30px]" aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45))' }} />
    </motion.a>
  );
};

export default WhatsAppButton;
