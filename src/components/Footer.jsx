import { FaPhone, FaEnvelope, FaGlobe } from 'react-icons/fa';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [footerSettings, setFooterSettings] = useState({
    phone: '+91 98765 43210',
    email: 'info@crackershyderabad.com',
    website: 'www.crackershyderabad.com'
  });

  useEffect(() => {
    const fetchFooterSettings = async () => {
      try {
        const docRef = doc(db, 'footerSettings', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFooterSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error('Error fetching footer settings:', error);
      }
    };
    fetchFooterSettings();
  }, []);

  const logoUrl = footerSettings.logoUrl || '/images/website/crackerhyderabadlogo.png';

  return (
    <footer className="relative overflow-hidden" style={{ background: 'white', boxShadow: '0 -2px 10px rgba(0,0,0,0.08)' }}>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" style={{ paddingTop: '20px', paddingBottom: '20px' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Left - Contact Info */}
          <div className="text-center md:text-left">
            <h3 className="text-base font-bold mb-2" style={{ color: '#F8C330', fontFamily: 'Poppins, sans-serif' }}>Contact Us</h3>
            <div className="space-y-1">
              <a 
                href={`tel:${footerSettings.phone}`}
                className="flex items-center gap-2 transition-colors justify-center md:justify-start text-sm hover:opacity-70"
                style={{ fontFamily: 'Inter, sans-serif', color: '#444' }}
              >
                <FaPhone className="text-sm" style={{ color: '#F8C330' }} />
                <span className="font-medium">{footerSettings.phone}</span>
              </a>
              <a 
                href={`mailto:${footerSettings.email}`}
                className="flex items-center gap-2 transition-colors justify-center md:justify-start text-sm hover:opacity-70"
                style={{ fontFamily: 'Inter, sans-serif', color: '#444' }}
              >
                <FaEnvelope className="text-sm" style={{ color: '#F8C330' }} />
                <span className="font-medium">{footerSettings.email}</span>
              </a>
              <a 
                href={`https://${footerSettings.website}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 transition-colors justify-center md:justify-start text-sm hover:opacity-70"
                style={{ fontFamily: 'Inter, sans-serif', color: '#444' }}
              >
                <FaGlobe className="text-sm" style={{ color: '#F8C330' }} />
                <span className="font-medium">{footerSettings.website}</span>
              </a>
            </div>
          </div>

          {/* Center - Quick Links */}
          <div className="text-center">
            <h3 className="font-bold mb-2" style={{ color: '#F8C330', fontFamily: 'Poppins, sans-serif', fontSize: '1.05rem' }}>Quick Links</h3>
            <div className="flex flex-col gap-1">
              <a href="/products" className="text-gray-700 hover:text-primary-600 transition-colors font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.95rem' }}>
                Products
              </a>
              <a href="/cart" className="text-gray-700 hover:text-primary-600 transition-colors font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.95rem' }}>
                Cart
              </a>
              <a href="/my-orders" className="text-gray-700 hover:text-primary-600 transition-colors font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.95rem' }}>
                My Orders
              </a>
            </div>
          </div>

          {/* Right - Logo (Larger Size) */}
          <div className="flex justify-center md:justify-end items-center">
            <img 
              src={logoUrl}
              alt="Crackers Hyderabad Logo" 
              className="h-auto object-contain hover:scale-105 transition-transform duration-300"
              style={{
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
                width: 'clamp(180px, 28vw, 280px)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Copyright */}
      <div className="relative border-t" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <p className="text-center text-xs" style={{ fontFamily: 'Inter, sans-serif', color: '#666' }}>
            © {currentYear} CrackersHyderabad | All Rights Reserved
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
