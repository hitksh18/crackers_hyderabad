import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const TopBanner = () => {
  const [bannerSettings, setBannerSettings] = useState({
    topBannerText: 'Free Shipping & COD for orders above ₹2,500 in Hyderabad & Secunderabad',
    topBannerEnabled: true,
    promoMessage: 'SPECIAL FESTIVE OFFERS!'
  });

  useEffect(() => {
    const fetchBannerSettings = async () => {
      try {
        const bannerDoc = await getDoc(doc(db, 'bannerSettings', 'main'));
        if (bannerDoc.exists()) {
          setBannerSettings(prev => ({ ...prev, ...bannerDoc.data() }));
        }
      } catch (error) {
        console.error('Error fetching banner settings:', error);
      }
    };

    fetchBannerSettings();
  }, []);

  if (!bannerSettings.topBannerEnabled) return null;

  return (
    <>
      {/* Top Banner */}
      <div 
        className="text-white py-2 text-center text-sm font-medium"
        style={{ 
          background: 'linear-gradient(90deg, #DC2626, #F87171)',
          fontFamily: 'Inter, sans-serif'
        }}
      >
        {bannerSettings.topBannerText}
      </div>
    </>
  );
};

export default TopBanner;
