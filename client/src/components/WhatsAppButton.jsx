import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FaWhatsapp } from 'react-icons/fa';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING, DURATION } from '../lib/motion';
import { normalizeWhatsappLinkNumber } from '../lib/whatsappContact';

/**
 * Global floating WhatsApp contact button — every storefront route.
 *
 * Rendered once at the application root (AppContent), outside every page
 * section, so no hero, product grid, navbar, modal or footer can hide or
 * clip it: positioning is pure `position: fixed` (see .wa-float) with a
 * z-index above all overlays, and rendering never depends on scroll, hero
 * animation, viewport size, or product loading state.
 *
 * The number is the Store Contact setting from the admin app
 * (Site Settings → Store Contact → WhatsApp number), stored in Firestore at
 * `footerSettings/main` under the `whatsapp` field — the single source of
 * truth. Every mount re-reads the document, so an admin change is picked up
 * on the next visit with no code change and no cache.
 *
 * Safety: there is no hardcoded fallback number. Until the saved number
 * loads — or when it is missing/unusable — the button renders nothing, so
 * the shop can never link customers to a wrong number.
 */
const WhatsAppButton = () => {
  const { isAdmin, isSales } = useAuth();
  const reduced = useReducedMotion();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fetchWhatsAppSettings = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'footerSettings', 'main'));
      if (snap.exists()) {
        /* The Store Contact WhatsApp number only — no fallback to any other
           field, so the button can never show a number the admin did not put
           in this setting. Normalised for wa.me here; the stored value is
           left untouched. */
        const normalised = normalizeWhatsappLinkNumber(snap.data()?.whatsapp);
        if (normalised) setWhatsappNumber(normalised);
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

  /* Route-independent: visible on every storefront page, never on staff
     surfaces. The only data gate is the saved number itself (see above). */
  if (!settingsLoaded || !whatsappNumber || isAdmin || isSales) {
    return null;
  }

  const message = 'Hi, I would like to know more about your crackers.';
  const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappURL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="wa-float group fixed flex h-14 w-14 items-center justify-center text-white"
      style={{ zIndex: 70 }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? { duration: DURATION.instant } : SPRING.soft}
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
