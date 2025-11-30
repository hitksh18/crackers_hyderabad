import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';
import { FaRocket, FaStar, FaGift, FaFire, FaBolt, FaGem, FaBaby, FaSpinner, FaFlask, FaCrown, FaBomb, FaBullseye, FaCheckCircle, FaShippingFast, FaShieldAlt, FaPhoneAlt, FaShoppingCart, FaTruck, FaStore, FaLeaf } from 'react-icons/fa';
import { useHomepageSettings } from '../hooks/useHomepageSettings';

const categories = [
  { name: 'Gift Boxes', icon: FaGift, color: 'from-primary-600 to-accent-600' },
  { name: 'Kids Special', icon: FaBaby, color: 'from-pink-500 to-purple-600' },
  { name: 'Sparklers', icon: FaStar, color: 'from-accent-500 to-accent-700' },
  { name: 'Flower Pots', icon: FaFire, color: 'from-accent-600 to-primary-700' },
  { name: 'Chakkars', icon: FaSpinner, color: 'from-accent-700 to-primary-600' },
  { name: 'Garlands', icon: FaFlask, color: 'from-green-500 to-emerald-600' },
  { name: 'Fancy', icon: FaCrown, color: 'from-purple-600 to-pink-600' },
  { name: 'Rockets & Novelties', icon: FaRocket, color: 'from-primary-700 to-primary-900' },
  { name: 'Bombs', icon: FaBomb, color: 'from-primary-800 to-accent-500' },
  { name: 'Guns-Rolls', icon: FaBullseye, color: 'from-red-600 to-orange-600' },
];

const Home = () => {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promotionalBanners, setPromotionalBanners] = useState([]);
  const { settings: homepageSettings, loading: settingsLoading } = useHomepageSettings();
  const [heroSettings, setHeroSettings] = useState({
    backgroundImage: '/images/hero-bg.jpg',
    backgroundOverlay: 0.5,
    liveMotion: true,
    logoImage: '/images/website/standard-logo.png',
    logoSize: 34,
    leftLogoImage: '',
    rightLogoImage: '',
    sideLogoSize: 15,
    mainHeading: 'Crackers Hyderabad',
    mainHeadingSize: 'clamp(2.25rem, 5.5vw, 3rem)',
    subHeading: 'Standard Fireworks Exclusive Store',
    subHeadingSize: 'clamp(1.15rem, 2.8vw, 1.4rem)',
    subtitle: 'CELEBRATE EVERY FESTIVAL AND EVENT WITH DAZZLING LIGHTS AND SPARKLING SHOWERS ONLY WITH US',
    subtitleSize: 'clamp(0.95rem, 2.2vw, 1.15rem)',
    ctaText: 'Shop Now',
    brightness: 100,
    lineSpacing: 20,
    badgeSpacing: 24
  });
  
  const [bannerSettings, setBannerSettings] = useState({
    topBannerText: 'Free Shipping & COD for orders above ₹2,500',
    topBannerEnabled: true,
    banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
    banner1Enabled: true,
    banner2Text: 'Free Shipping & COD Available • Premium Quality Guaranteed • Same Day Delivery',
    banner2Enabled: true
  });

  useEffect(() => {
    const fetchFeaturedProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'products'));
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const featured = allProducts.filter(p => p.isFeatured);
        const highSelling = allProducts
          .filter(p => !p.isFeatured)
          .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
          .slice(0, 8 - featured.length);
        
        const productsToShow = [...featured, ...highSelling].slice(0, 8);
        setFeaturedProducts(productsToShow);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchPromotionalBanners = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'promotionalBanners'));
        const bannersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPromotionalBanners(bannersData.sort((a, b) => (b.order || 0) - (a.order || 0)));
      } catch (error) {
        console.error('Error fetching promotional banners:', error);
      }
    };

    const fetchHeroSettings = async () => {
      try {
        const heroDoc = await getDoc(doc(db, 'heroSettings', 'main'));
        if (heroDoc.exists()) {
          setHeroSettings(prev => ({ ...prev, ...heroDoc.data() }));
        }
      } catch (error) {
        console.error('Error fetching hero settings:', error);
      }
    };

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

    fetchFeaturedProducts();
    fetchPromotionalBanners();
    fetchHeroSettings();
    fetchBannerSettings();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#F7F9FB' }}>
      <section className="relative h-[70vh] sm:h-[68vh] md:h-[70vh] lg:h-[72vh] overflow-hidden hero-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '450px' }}>
        <div 
          className="absolute inset-0 hero-background"
          style={{ 
            backgroundImage: `linear-gradient(rgba(0,0,0,${heroSettings.backgroundOverlay}), rgba(0,0,0,${heroSettings.backgroundOverlay})), url(${heroSettings.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            animation: heroSettings.liveMotion ? 'slowZoom 20s ease-in-out infinite alternate' : 'none',
            filter: `brightness(${heroSettings.brightness}%)`
          }}
        ></div>

        <div className="relative z-10 text-white px-3 sm:px-4 md:px-6 hero-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: `${heroSettings.lineSpacing}px`, width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Logo Container with Optional Side Logos */}
          <div className="logo-container" style={{ minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 'clamp(8px, 2vw, 20px)', flexWrap: 'wrap' }}>
            {/* Left Side Logo (Optional) */}
            {heroSettings.leftLogoImage && (
              <img 
                src={heroSettings.leftLogoImage} 
                alt="Left Logo" 
                className="h-auto side-logo side-logo-left"
                style={{
                  maxWidth: `clamp(60px, ${heroSettings.sideLogoSize}vw, 150px)`,
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                  display: 'block',
                  objectFit: 'contain'
                }}
              />
            )}
            
            {/* Main Standard Fireworks Logo */}
            <img 
              src={heroSettings.logoImage || '/images/website/standard-logo.png'} 
              alt="Standard Fireworks" 
              className="h-auto hero-logo"
              style={{
                maxWidth: `clamp(180px, ${heroSettings.logoSize}vw, 420px)`,
                width: '100%',
                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7))',
                display: 'block',
                margin: '0 auto',
                objectFit: 'contain'
              }}
            />
            
            {/* Right Side Logo (Optional) */}
            {heroSettings.rightLogoImage && (
              <img 
                src={heroSettings.rightLogoImage} 
                alt="Right Logo" 
                className="h-auto side-logo side-logo-right"
                style={{
                  maxWidth: `clamp(60px, ${heroSettings.sideLogoSize}vw, 150px)`,
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                  display: 'block',
                  objectFit: 'contain'
                }}
              />
            )}
          </div>

          <h1
            className="font-bold leading-tight"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontSize: heroSettings.mainHeadingSize,
              fontWeight: 700,
              color: '#F8C330',
              textShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 80px rgba(0,0,0,0.6), 2px 2px 4px rgba(0,0,0,0.9)',
              textAlign: 'center',
              width: '100%'
            }}
          >
            {heroSettings.mainHeading}
          </h1>

          <h2
            className="leading-tight"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontSize: heroSettings.subHeadingSize,
              fontWeight: 600,
              color: '#F8C330',
              textShadow: '0 0 30px rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.9)',
              textAlign: 'center',
              width: '100%'
            }}
          >
            {heroSettings.subHeading}
          </h2>
          
          <p
            className="font-medium mx-auto uppercase hero-subtitle"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: heroSettings.subtitleSize,
              color: 'white',
              opacity: 0.95,
              textShadow: '0 0 30px rgba(0,0,0,0.9), 2px 2px 6px rgba(0,0,0,1)',
              letterSpacing: '1.2px',
              maxWidth: '90%',
              padding: '0 16px',
              width: '100%',
              display: 'block',
              textAlign: 'center',
              margin: '0 auto'
            }}
          >
            {heroSettings.subtitle}
          </p>
        
        <style>{`
          @keyframes slowZoom {
            0% {
              transform: scale(1);
            }
            100% {
              transform: scale(1.05);
            }
          }
          
          /* Mobile First - 320px to 479px */
          @media (max-width: 479px) {
            .hero-section {
              min-height: 400px !important;
              height: 65vh !important;
            }
            .hero-logo {
              max-width: 140px !important;
            }
            .side-logo {
              max-width: 50px !important;
            }
            .logo-container {
              gap: 6px !important;
            }
            .hero-content {
              gap: 12px !important;
            }
          }
          
          /* Small Mobile - 480px to 639px */
          @media (min-width: 480px) and (max-width: 639px) {
            .hero-section {
              height: 65vh !important;
            }
            .hero-logo {
              max-width: 160px !important;
            }
            .side-logo {
              max-width: 60px !important;
            }
          }
          
          /* Tablet - 640px to 1023px */
          @media (min-width: 640px) and (max-width: 1023px) {
            .hero-section {
              height: 68vh !important;
            }
            .hero-logo {
              max-width: clamp(200px, 30vw, 300px) !important;
            }
            .side-logo {
              max-width: clamp(70px, 12vw, 120px) !important;
            }
          }
          
          /* Desktop - 1024px and above */
          @media (min-width: 1024px) {
            .hero-section {
              height: 72vh !important;
            }
            .logo-container {
              flex-wrap: nowrap !important;
            }
          }
          
          /* Subtitle responsive wrapping */
          @media (min-width: 780px) {
            .hero-subtitle {
              white-space: nowrap;
            }
          }
          
          @media (max-width: 779px) {
            .hero-subtitle {
              white-space: normal;
              line-height: 1.4;
            }
          }
          
          /* Trust Badges responsive */
          @media (max-width: 479px) {
            .hero-content > div:last-child {
              gap: 12px !important;
              font-size: 0.75rem !important;
            }
            .hero-content > div:last-child svg {
              font-size: 1rem !important;
            }
          }
        `}</style>
          
          <Link to="/products" className="inline-block relative z-20">
            <button
              className="text-white font-bold hover:scale-105"
              style={{
                background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                color: '#6B0F0F',
                fontFamily: 'Poppins, sans-serif',
                boxShadow: '0 6px 15px rgba(0,0,0,0.35)',
                padding: '16px 48px',
                borderRadius: '14px',
                fontSize: '1.1rem',
                transition: 'transform 0.2s ease',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {heroSettings.ctaText}
            </button>
          </Link>

          {/* Trust Badges */}
          <div
            className="flex flex-wrap justify-center gap-6 text-white"
            style={{ marginTop: `${heroSettings.badgeSpacing}px` }}
          >
            <div className="flex items-center gap-2">
              <FaCheckCircle className="text-[#F8C330]" style={{ fontSize: '1.35rem' }} />
              <span className="text-sm font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>100% Authentic</span>
            </div>
            <div className="flex items-center gap-2">
              <FaShippingFast className="text-[#F8C330]" style={{ fontSize: '1.35rem' }} />
              <span className="text-sm font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>Fast Delivery</span>
            </div>
            <div className="flex items-center gap-2">
              <FaShieldAlt className="text-[#F8C330]" style={{ fontSize: '1.35rem' }} />
              <span className="text-sm font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>Safety Certified</span>
            </div>
          </div>
        </div>
      </section>

      {/* Alert 1 - Trust Banner (Static) */}
      {bannerSettings.banner1Enabled && (
        <div className="bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 text-white py-2 sm:py-3 shadow-xl">
          <div className="max-w-5xl mx-auto px-2 sm:px-4 text-center">
            <p className="text-[0.7rem] sm:text-sm md:text-base font-semibold leading-tight sm:leading-relaxed" style={{ lineHeight: '1.3' }}>
              {bannerSettings.banner1Text}
            </p>
          </div>
        </div>
      )}

      {/* Alert 2 - Scrolling Promo Banner */}
      {bannerSettings.banner2Enabled && (
        <div 
          className="text-white overflow-hidden"
          style={{ 
            background: 'linear-gradient(135deg, #DC2626, #EF4444, #F87171)',
            fontFamily: 'Poppins, sans-serif',
            padding: '12px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <div className="animate-scroll-smooth whitespace-nowrap font-bold flex items-center gap-2" style={{ fontSize: 'clamp(0.8rem, 2.5vw, 1.1rem)', letterSpacing: '0.5px' }}>
            <span>🚚 {bannerSettings.banner2Text} 🚚</span>
            <span className="mx-4 sm:mx-8">•</span>
            <span>🚚 {bannerSettings.banner2Text} 🚚</span>
            <span className="mx-4 sm:mx-8">•</span>
            <span>🚚 {bannerSettings.banner2Text} 🚚</span>
            <span className="mx-4 sm:mx-8">•</span>
            <span>🚚 {bannerSettings.banner2Text} 🚚</span>
            <span className="mx-4 sm:mx-8">•</span>
            <span>🚚 {bannerSettings.banner2Text} 🚚</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scroll-smooth {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-smooth {
          animation: scroll-smooth 40s linear infinite;
        }
      `}</style>

      {/* Why Choose Us Section */}
      <section style={{ background: 'linear-gradient(135deg, #FFF1DB, #FBD7C1, #F2C18D)', paddingTop: '80px', paddingBottom: '50px', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-4"
            style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(90deg, #FF512F, #F09819)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Why Choose Us
          </motion.h2>
          <p className="text-center text-gray-700 mb-12 text-base md:text-lg px-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Hyderabad's most trusted fireworks destination
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-white rounded-2xl transition-all duration-300"
              style={{ 
                padding: '25px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.18)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)'}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto" style={{ background: 'linear-gradient(135deg, #FF512F, #FFC371)' }}>
                <FaGift className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>Wide Variety</h3>
              <p className="text-sm text-gray-600 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                From sparklers and flower-pots, to atom bombs, kids-special, multicolour night-outs and rockets — we have it all.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-white rounded-2xl transition-all duration-300"
              style={{ 
                padding: '25px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.18)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)'}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto" style={{ background: 'linear-gradient(135deg, #FF512F, #FFC371)' }}>
                <FaShoppingCart className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>Wholesale & Retail</h3>
              <p className="text-sm text-gray-600 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                Whether you're buying for a family Diwali celebration or stocking up for retail, we cater to both.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-white rounded-2xl transition-all duration-300"
              style={{ 
                padding: '25px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.18)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)'}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto" style={{ background: 'linear-gradient(135deg, #FF512F, #FFC371)' }}>
                <FaShieldAlt className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>Trusted Quality</h3>
              <p className="text-sm text-gray-600 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                All products sourced from Sivakasi factory-outlets — safety-tested, certified.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-white rounded-2xl transition-all duration-300"
              style={{ 
                padding: '25px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.18)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)'}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto" style={{ background: 'linear-gradient(135deg, #FF512F, #FFC371)' }}>
                <FaShippingFast className="text-3xl text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>Convenient Shopping</h3>
              <p className="text-sm text-gray-600 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                Easy online order, delivery within Hyderabad region, secure payment options, friendly support.
              </p>
            </motion.div>
          </div>

        </div>
      </section>

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        .animate-scroll {
          display: inline-block;
          animation: scroll 20s linear infinite;
        }
      `}</style>

      <section style={{ background: 'linear-gradient(135deg, #FFF1DB, #FBD7C1, #F2C18D)', paddingTop: '80px', paddingBottom: '50px', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-4"
            style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(90deg, #FF512F, #F09819)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Shop by Category
          </motion.h2>
          <p className="text-center text-gray-700 mb-12 text-base md:text-lg font-medium px-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Browse our extensive collection of fireworks
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-4">
            {categories.map((category, index) => (
              <Link key={index} to={`/products?category=${category.name}`}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  className={`bg-gradient-to-br ${category.color} p-4 rounded-2xl text-white cursor-pointer transition-all duration-300 flex flex-col items-center justify-center h-28 relative overflow-hidden group`}
                  style={{ boxShadow: '0 6px 15px rgba(0,0,0,0.15)' }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,0,0,0.15)'}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <category.icon className="text-4xl mb-2 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] relative z-10 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xs font-bold text-center leading-tight relative z-10" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontFamily: 'Poppins, sans-serif' }}>{category.name}</h3>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Promotional Banners Section */}
      {promotionalBanners.length > 0 && (
        <section style={{ background: 'linear-gradient(135deg, #FFF1DB, #FBD7C1, #F2C18D)', paddingTop: '80px', paddingBottom: '50px', paddingLeft: '1rem', paddingRight: '1rem' }}>
          <div className="max-w-7xl mx-auto space-y-6">
            {promotionalBanners.map((banner, index) => (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative overflow-hidden rounded-2xl transition-shadow cursor-pointer"
                style={{ boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)'}
              >
                <img
                  src={banner.imageUrl}
                  alt={`Promotional banner ${index + 1}`}
                  className="w-full h-auto object-cover max-h-[300px] md:max-h-[400px]"
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Homepage Banner Section */}
      {settingsLoading ? (
        <section className="py-10 sm:py-12 md:py-16 px-4 md:px-8 bg-gradient-to-br from-primary-50 to-accent-50">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse bg-gray-300 rounded-2xl h-64 sm:h-80 md:h-96"></div>
          </div>
        </section>
      ) : homepageSettings.bannerImageUrl ? (
        <section className="py-6 sm:py-8 md:py-10 px-4 md:px-8 bg-gradient-to-br from-primary-50 to-accent-50">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl shadow-2xl"
            >
              <img
                src={homepageSettings.bannerImageUrl}
                alt={homepageSettings.bannerImageAlt || "Crackers Hyderabad Banner"}
                className="w-full h-auto object-cover max-h-[400px] sm:max-h-[500px] md:max-h-[600px]"
              />
            </motion.div>
          </div>
        </section>
      ) : null}

      <section style={{ background: 'linear-gradient(135deg, #FFF1DB, #FBD7C1, #F2C18D)', paddingTop: '80px', paddingBottom: '50px', paddingLeft: '1rem', paddingRight: '1rem' }}>
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-4"
            style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(90deg, #FF512F, #F09819)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Featured Products
          </motion.h2>
          <p className="text-center text-gray-700 mb-12 text-base md:text-lg font-medium px-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Our best-selling fireworks handpicked for you
          </p>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-96 animate-pulse" style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}></div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {featuredProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05, type: 'spring' }}
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))}
              </div>
              
              {/* View All Products Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-12 text-center"
              >
                <Link to="/products">
                  <button
                    className="text-white font-bold hover:scale-105 transition-transform"
                    style={{
                      background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                      color: '#6B0F0F',
                      fontFamily: 'Poppins, sans-serif',
                      boxShadow: '0 6px 15px rgba(0,0,0,0.35)',
                      padding: '16px 48px',
                      borderRadius: '14px',
                      fontSize: '1.1rem',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    View All Products
                  </button>
                </Link>
              </motion.div>
            </>
          )}
        </div>
      </section>
      
      <Footer />
    </div>
  );
};

export default Home;
