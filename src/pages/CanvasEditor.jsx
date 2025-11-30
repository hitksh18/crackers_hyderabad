import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import toast from 'react-hot-toast';
import { FaSave, FaImage, FaFont, FaPalette, FaEye, FaUndo, FaRedo, FaUpload } from 'react-icons/fa';

const CanvasEditor = () => {
  const [activeTab, setActiveTab] = useState('hero');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
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

  const [footerSettings, setFooterSettings] = useState({
    shopName: 'Crackers Hyderabad',
    tagline: 'Your Trusted Fireworks Store in Hyderabad',
    address: 'Hyderabad, Telangana',
    phone: '+91 1234567890',
    email: 'info@crackershyderabad.com',
    showSocialLinks: true
  });

  const [bannerSettings, setBannerSettings] = useState({
    topBannerText: 'Free Shipping & COD for orders above ₹2,500',
    topBannerEnabled: true,
    banner1Text: 'Your trusted online fireworks store in Hyderabad — from premium gift boxes to everyday sparklers',
    banner1Enabled: true,
    banner2Text: 'Free Shipping & COD Available • Premium Quality Guaranteed • Same Day Delivery',
    banner2Enabled: true
  });

  const [adminSettings, setAdminSettings] = useState({
    whatsappNumber: '+91 1234567890',
    whatsappEnabled: true,
    minimumOrderValue: 500,
    minimumOrderValueEnabled: true
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [heroDoc, footerDoc, bannerDoc, adminDoc] = await Promise.all([
        getDoc(doc(db, 'heroSettings', 'main')),
        getDoc(doc(db, 'footerSettings', 'main')),
        getDoc(doc(db, 'bannerSettings', 'main')),
        getDoc(doc(db, 'adminSettings', 'main'))
      ]);
      
      if (heroDoc.exists()) {
        setHeroSettings(prev => ({ ...prev, ...heroDoc.data() }));
      }
      if (footerDoc.exists()) {
        setFooterSettings(prev => ({ ...prev, ...footerDoc.data() }));
      }
      if (bannerDoc.exists()) {
        setBannerSettings(prev => ({ ...prev, ...bannerDoc.data() }));
      }
      if (adminDoc.exists()) {
        const data = adminDoc.data();
        const migratedData = { ...data };
        
        if ('minimumOrderValueLocked' in data && !('minimumOrderValueEnabled' in data)) {
          migratedData.minimumOrderValueEnabled = data.minimumOrderValueLocked !== false;
          delete migratedData.minimumOrderValueLocked;
        }
        
        setAdminSettings(prev => ({ ...prev, ...migratedData }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast('Settings loaded with default values', { icon: 'ℹ️' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHero = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'heroSettings', 'main'), heroSettings);
      toast.success('Hero settings saved successfully!');
    } catch (error) {
      console.error('Error saving hero settings:', error);
      toast.error('Failed to save hero settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFooter = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'footerSettings', 'main'), footerSettings);
      toast.success('Footer settings saved successfully!');
    } catch (error) {
      console.error('Error saving footer settings:', error);
      toast.error('Failed to save footer settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBanner = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'bannerSettings', 'main'), bannerSettings);
      toast.success('Banner settings saved successfully!');
    } catch (error) {
      console.error('Error saving banner settings:', error);
      toast.error('Failed to save banner settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdmin = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'adminSettings', 'main'), adminSettings);
      toast.success('Admin settings saved successfully!');
    } catch (error) {
      console.error('Error saving admin settings:', error);
      toast.error('Failed to save admin settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    switch(activeTab) {
      case 'hero':
        await handleSaveHero();
        break;
      case 'banner':
        await handleSaveBanner();
        break;
      case 'footer':
        await handleSaveFooter();
        break;
      case 'admin':
        await handleSaveAdmin();
        break;
      default:
        break;
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading image...');
    try {
      const storageRef = ref(storage, `hero-backgrounds/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setHeroSettings(prev => ({ ...prev, backgroundImage: downloadURL }));
      toast.success('Image uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading logo...');
    try {
      const storageRef = ref(storage, `hero-logos/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setHeroSettings(prev => ({ ...prev, logoImage: downloadURL }));
      toast.success('Logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleLeftLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading left logo...');
    try {
      const storageRef = ref(storage, `hero-logos/${Date.now()}-left-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setHeroSettings(prev => ({ ...prev, leftLogoImage: downloadURL }));
      toast.success('Left logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading left logo:', error);
      toast.error('Failed to upload left logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const handleRightLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const loadingToast = toast.loading('Uploading right logo...');
    try {
      const storageRef = ref(storage, `hero-logos/${Date.now()}-right-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setHeroSettings(prev => ({ ...prev, rightLogoImage: downloadURL }));
      toast.success('Right logo uploaded successfully!', { id: loadingToast });
    } catch (error) {
      console.error('Error uploading right logo:', error);
      toast.error('Failed to upload right logo', { id: loadingToast });
    } finally {
      e.target.value = '';
    }
  };

  const tabs = [
    { id: 'hero', label: 'Hero Section', icon: FaImage },
    { id: 'banner', label: 'Alerts', icon: FaPalette },
    { id: 'footer', label: 'Footer', icon: FaFont },
    { id: 'admin', label: 'Admin Settings', icon: FaSave }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F9FB' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-accent-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Canvas Editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: '#F7F9FB' }}>
      {/* Sticky Save Button - Floating */}
      <motion.button
        onClick={handleSaveAll}
        disabled={saving}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 px-6 py-4 rounded-full font-bold text-white flex items-center gap-2 shadow-2xl"
        style={{
          background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
          color: '#6B0F0F'
        }}
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <FaSave className="text-lg" />
        {saving ? 'Saving...' : 'Save'}
      </motion.button>
      
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 mb-2">Canvas Editor</h1>
              <p className="text-gray-600">Customize your website appearance with live preview</p>
            </div>
            <motion.button
              onClick={handleSaveAll}
              disabled={saving}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 rounded-xl font-bold text-white flex items-center gap-2 shadow-lg hidden md:flex"
              style={{
                background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                color: '#6B0F0F'
              }}
            >
              <FaSave />
              {saving ? 'Saving...' : 'Save Changes'}
            </motion.button>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold whitespace-nowrap"
                style={{
                  background: activeTab === tab.id ? 'linear-gradient(90deg, #F8C330, #FFDB5E)' : 'white',
                  color: activeTab === tab.id ? '#6B0F0F' : '#666',
                  border: activeTab === tab.id ? 'none' : '1px solid #e0e0e0',
                  boxShadow: activeTab === tab.id ? '0 4px 12px rgba(248,195,48,0.3)' : '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            {activeTab === 'hero' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Hero Section Settings</h2>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Background Image</label>
                  
                  <div className="mb-3">
                    <label
                      htmlFor="imageUpload"
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer font-semibold"
                      style={{
                        background: 'linear-gradient(90deg, #6B0F0F, #FF8E00)',
                        color: 'white',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <FaUpload />
                      Upload Background Image
                    </label>
                    <input
                      id="imageUpload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>

                  <label className="block text-sm text-gray-600 mb-2">Or enter image URL:</label>
                  <input
                    type="text"
                    value={heroSettings.backgroundImage}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, backgroundImage: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    placeholder="/images/hero-bg.jpg or https://..."
                  />
                  
                  {heroSettings.backgroundImage && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-2">Current background:</p>
                      <img
                        src={heroSettings.backgroundImage}
                        alt="Background preview"
                        className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Background Overlay: {heroSettings.backgroundOverlay.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={heroSettings.backgroundOverlay}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, backgroundOverlay: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Brightness: {heroSettings.brightness}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="5"
                    value={heroSettings.brightness}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Logo Image</label>
                  
                  <div className="mb-3">
                    <label
                      htmlFor="logoUpload"
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer font-semibold"
                      style={{
                        background: 'linear-gradient(90deg, #6B0F0F, #FF8E00)',
                        color: 'white',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <FaUpload />
                      Upload Logo
                    </label>
                    <input
                      id="logoUpload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </div>

                  <label className="block text-sm text-gray-600 mb-2">Or enter logo URL:</label>
                  <input
                    type="text"
                    value={heroSettings.logoImage}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, logoImage: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    placeholder="/images/website/standard-logo.png or https://..."
                  />
                  
                  {heroSettings.logoImage && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-2">Current logo:</p>
                      <img
                        src={heroSettings.logoImage}
                        alt="Logo preview"
                        className="h-20 object-contain bg-gray-100 rounded-lg border-2 border-gray-200 p-2"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Logo Size: {heroSettings.logoSize}vw
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="35"
                    step="1"
                    value={heroSettings.logoSize}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, logoSize: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>

                <div className="border-t-2 border-gray-200 pt-4 mt-4">
                  <div className="bg-gradient-to-r from-primary-50 to-accent-50 p-4 rounded-lg mb-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <FaImage className="text-primary-600" />
                      Side Logos (Optional)
                    </h3>
                    <p className="text-sm text-gray-600">Add optional brand logos on left and right sides of the main logo for additional branding</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Left Logo</label>
                      <label
                        htmlFor="leftLogoUpload"
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg cursor-pointer font-medium text-sm"
                        style={{
                          background: 'linear-gradient(90deg, #6B0F0F, #FF8E00)',
                          color: 'white'
                        }}
                      >
                        <FaUpload />
                        Upload Left Logo
                      </label>
                      <input
                        id="leftLogoUpload"
                        type="file"
                        accept="image/*"
                        onChange={handleLeftLogoUpload}
                        className="hidden"
                      />
                      <input
                        type="text"
                        value={heroSettings.leftLogoImage}
                        onChange={(e) => setHeroSettings(prev => ({ ...prev, leftLogoImage: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none mt-2 text-sm"
                        placeholder="Or enter URL..."
                      />
                      {heroSettings.leftLogoImage && (
                        <button
                          onClick={() => setHeroSettings(prev => ({ ...prev, leftLogoImage: '' }))}
                          className="mt-2 text-xs text-red-600 hover:text-red-800"
                        >
                          Remove Left Logo
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Right Logo</label>
                      <label
                        htmlFor="rightLogoUpload"
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg cursor-pointer font-medium text-sm"
                        style={{
                          background: 'linear-gradient(90deg, #6B0F0F, #FF8E00)',
                          color: 'white'
                        }}
                      >
                        <FaUpload />
                        Upload Right Logo
                      </label>
                      <input
                        id="rightLogoUpload"
                        type="file"
                        accept="image/*"
                        onChange={handleRightLogoUpload}
                        className="hidden"
                      />
                      <input
                        type="text"
                        value={heroSettings.rightLogoImage}
                        onChange={(e) => setHeroSettings(prev => ({ ...prev, rightLogoImage: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none mt-2 text-sm"
                        placeholder="Or enter URL..."
                      />
                      {heroSettings.rightLogoImage && (
                        <button
                          onClick={() => setHeroSettings(prev => ({ ...prev, rightLogoImage: '' }))}
                          className="mt-2 text-xs text-red-600 hover:text-red-800"
                        >
                          Remove Right Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Side Logo Size: {heroSettings.sideLogoSize}vw
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="25"
                      step="1"
                      value={heroSettings.sideLogoSize}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, sideLogoSize: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="liveMotion"
                    checked={heroSettings.liveMotion}
                    onChange={(e) => setHeroSettings(prev => ({ ...prev, liveMotion: e.target.checked }))}
                    className="w-5 h-5"
                  />
                  <label htmlFor="liveMotion" className="text-sm font-semibold text-gray-700">
                    Enable Live Motion Background
                  </label>
                </div>

                <div className="border-t-2 border-gray-200 pt-4 mt-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg mb-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <FaPalette className="text-blue-600" />
                      Spacing Controls
                    </h3>
                    <p className="text-sm text-gray-600">Adjust spacing between hero elements for perfect alignment</p>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Line Spacing: {heroSettings.lineSpacing}px
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="40"
                      step="2"
                      value={heroSettings.lineSpacing}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, lineSpacing: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Spacing between logo, headings, and subtitle</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Trust Badge Spacing: {heroSettings.badgeSpacing}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="2"
                      value={heroSettings.badgeSpacing}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, badgeSpacing: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Space above trust badges (100% Authentic, etc.)</p>
                  </div>
                </div>

                <div className="border-t-2 border-gray-200 pt-4 mt-4">
                  <div className="bg-gradient-to-r from-green-50 to-teal-50 p-4 rounded-lg mb-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <FaFont className="text-green-600" />
                      Text Content
                    </h3>
                    <p className="text-sm text-gray-600">Edit all text content displayed in the hero section</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Main Heading</label>
                    <input
                      type="text"
                      value={heroSettings.mainHeading}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, mainHeading: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Sub Heading</label>
                    <input
                      type="text"
                      value={heroSettings.subHeading}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, subHeading: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Subtitle</label>
                    <textarea
                      value={heroSettings.subtitle}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, subtitle: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                      rows="2"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">CTA Button Text</label>
                    <input
                      type="text"
                      value={heroSettings.ctaText}
                      onChange={(e) => setHeroSettings(prev => ({ ...prev, ctaText: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveHero}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save Hero Settings'}
                </button>
              </div>
            )}

            {activeTab === 'banner' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Alerts Settings</h2>
                
                {/* Top Alert (Above Hero) */}
                <div className="bg-gradient-to-r from-primary-50 to-accent-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-bold text-gray-800 text-lg mb-2">Top Alert (Above Header)</h3>
                  <p className="text-xs text-gray-500 mb-3">Static alert bar shown above the navigation</p>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="topBannerEnabled"
                      checked={bannerSettings.topBannerEnabled}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, topBannerEnabled: e.target.checked }))}
                      className="w-5 h-5"
                    />
                    <label htmlFor="topBannerEnabled" className="text-sm font-semibold text-gray-700">
                      Enable Top Alert
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Alert Text</label>
                    <input
                      type="text"
                      value={bannerSettings.topBannerText}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, topBannerText: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                      placeholder="e.g., Free Shipping & COD Available"
                    />
                  </div>
                </div>

                {/* Banner 1 (Below Hero - Static) */}
                <div className="bg-gradient-to-r from-primary-50 to-accent-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-bold text-gray-800 text-lg mb-2">Alert 1 (Below Hero - Static)</h3>
                  <p className="text-xs text-gray-500 mb-3">Trust message banner, static position</p>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="banner1Enabled"
                      checked={bannerSettings.banner1Enabled}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, banner1Enabled: e.target.checked }))}
                      className="w-5 h-5"
                    />
                    <label htmlFor="banner1Enabled" className="text-sm font-semibold text-gray-700">
                      Enable Alert 1
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Alert Text</label>
                    <textarea
                      value={bannerSettings.banner1Text}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, banner1Text: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                      rows="2"
                      placeholder="e.g., Your trusted online fireworks store"
                    />
                  </div>
                </div>

                {/* Banner 2 (Below Hero - Scrolling) */}
                <div className="bg-gradient-to-r from-primary-50 to-accent-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-bold text-gray-800 text-lg mb-2">Alert 2 (Below Hero - Scrolling)</h3>
                  <p className="text-xs text-gray-500 mb-3">Animated scrolling promotional banner</p>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="banner2Enabled"
                      checked={bannerSettings.banner2Enabled}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, banner2Enabled: e.target.checked }))}
                      className="w-5 h-5"
                    />
                    <label htmlFor="banner2Enabled" className="text-sm font-semibold text-gray-700">
                      Enable Alert 2
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Alert Text</label>
                    <input
                      type="text"
                      value={bannerSettings.banner2Text}
                      onChange={(e) => setBannerSettings(prev => ({ ...prev, banner2Text: e.target.value }))}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                      placeholder="e.g., Free Shipping • Premium Quality • Fast Delivery"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveBanner}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save Alerts Settings'}
                </button>
              </div>
            )}

            {activeTab === 'footer' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Footer Settings</h2>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Shop Name</label>
                  <input
                    type="text"
                    value={footerSettings.shopName}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, shopName: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Tagline</label>
                  <input
                    type="text"
                    value={footerSettings.tagline}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, tagline: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={footerSettings.address}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={footerSettings.phone}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={footerSettings.email}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showSocialLinks"
                    checked={footerSettings.showSocialLinks}
                    onChange={(e) => setFooterSettings(prev => ({ ...prev, showSocialLinks: e.target.checked }))}
                    className="w-5 h-5"
                  />
                  <label htmlFor="showSocialLinks" className="text-sm font-semibold text-gray-700">
                    Show Social Media Links
                  </label>
                </div>

                <button
                  onClick={handleSaveFooter}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save Footer Settings'}
                </button>
              </div>
            )}

            {activeTab === 'admin' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Admin Settings</h2>
                
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg mb-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <FaSave className="text-green-600" />
                    WhatsApp Integration
                  </h3>
                  <p className="text-sm text-gray-600">Configure WhatsApp for customer support and invoice sharing</p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="whatsappEnabled"
                    checked={adminSettings.whatsappEnabled}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                    className="w-5 h-5"
                  />
                  <label htmlFor="whatsappEnabled" className="text-sm font-semibold text-gray-700">
                    Enable WhatsApp Support
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={adminSettings.whatsappNumber}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    placeholder="+91 1234567890"
                  />
                  <p className="text-xs text-gray-500 mt-1">This number will be used for customer WhatsApp support and invoice sharing</p>
                </div>

                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-4 rounded-lg mt-6 mb-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <FaSave className="text-yellow-600" />
                    Minimum Order Value
                  </h3>
                  <p className="text-sm text-gray-600">Set minimum order value for online checkout</p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="minimumOrderValueEnabled"
                    checked={adminSettings.minimumOrderValueEnabled}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, minimumOrderValueEnabled: e.target.checked }))}
                    className="w-5 h-5"
                  />
                  <label htmlFor="minimumOrderValueEnabled" className="text-sm font-semibold text-gray-700">
                    Enable Minimum Order Value Validation
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Order Value (₹)</label>
                  <input
                    type="number"
                    value={adminSettings.minimumOrderValue}
                    onChange={(e) => setAdminSettings(prev => ({ ...prev, minimumOrderValue: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-accent-500 focus:outline-none"
                    placeholder="500"
                    min="0"
                    step="50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Customers must have at least this amount in cart to checkout online</p>
                </div>

                <button
                  onClick={handleSaveAdmin}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save Admin Settings'}
                </button>

                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 mt-2"
                  style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <FaSave />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </motion.div>

          {/* Live Preview Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <div className="flex items-center gap-2 mb-4">
              <FaEye className="text-gray-600" />
              <h3 className="text-xl font-bold text-gray-800">Live Preview</h3>
            </div>
            
            {activeTab === 'hero' && (
              <div 
                className="relative rounded-lg overflow-hidden"
                style={{ height: '400px' }}
              >
                <div 
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(rgba(0,0,0,${heroSettings.backgroundOverlay - 0.05}), rgba(0,0,0,${heroSettings.backgroundOverlay + 0.05})), url(${heroSettings.backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: `brightness(${heroSettings.brightness}%)`,
                    animation: heroSettings.liveMotion ? 'slowZoom 20s ease-in-out infinite alternate' : 'none'
                  }}
                ></div>
                <div className="relative z-10 h-full flex flex-col items-center justify-center text-white p-4 gap-3">
                  <img 
                    src={heroSettings.logoImage || '/images/website/standard-logo.png'} 
                    alt="Logo" 
                    style={{
                      maxWidth: `${heroSettings.logoSize}vw`,
                      filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7))'
                    }}
                  />
                  <h1 style={{
                    color: '#F8C330',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    textShadow: '0 0 40px rgba(0,0,0,0.8)'
                  }}>
                    {heroSettings.mainHeading}
                  </h1>
                  <h2 style={{
                    color: '#F8C330',
                    fontSize: '1rem',
                    fontWeight: 600,
                    textShadow: '0 0 30px rgba(0,0,0,0.8)'
                  }}>
                    {heroSettings.subHeading}
                  </h2>
                  <p style={{
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    maxWidth: '90%',
                    textShadow: '0 0 30px rgba(0,0,0,0.9)'
                  }}>
                    {heroSettings.subtitle}
                  </p>
                  <button style={{
                    background: 'linear-gradient(90deg, #F8C330, #FFDB5E)',
                    color: '#6B0F0F',
                    padding: '12px 32px',
                    borderRadius: '14px',
                    fontWeight: 700,
                    border: 'none'
                  }}>
                    {heroSettings.ctaText}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'banner' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-600 mb-3">Live Preview</h3>
                
                {/* Top Alert Preview */}
                {bannerSettings.topBannerEnabled && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Top Alert</p>
                    <div className="bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 text-white py-2 px-4 rounded-lg text-center">
                      <p className="text-xs font-semibold">{bannerSettings.topBannerText}</p>
                    </div>
                  </div>
                )}
                
                {/* Alert 1 Preview (Static) */}
                {bannerSettings.banner1Enabled && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Alert 1 (Static)</p>
                    <div className="bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 text-white py-2 px-4 rounded-lg text-center">
                      <p className="text-xs font-semibold">{bannerSettings.banner1Text}</p>
                    </div>
                  </div>
                )}
                
                {/* Alert 2 Preview (Scrolling) */}
                {bannerSettings.banner2Enabled && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Alert 2 (Scrolling)</p>
                    <div className="bg-gradient-to-r from-red-600 via-orange-500 to-red-600 text-white py-3 px-4 rounded-lg overflow-hidden">
                      <div className="animate-scroll-fast whitespace-nowrap">
                        <span className="text-sm font-bold">🚚 {bannerSettings.banner2Text} 🚚</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'footer' && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white p-6 rounded-lg">
                <h3 className="text-2xl font-bold mb-2">{footerSettings.shopName}</h3>
                <p className="text-gray-300 mb-4">{footerSettings.tagline}</p>
                <div className="space-y-2 text-sm">
                  <p>{footerSettings.address}</p>
                  <p>{footerSettings.phone}</p>
                  <p>{footerSettings.email}</p>
                </div>
                {footerSettings.showSocialLinks && (
                  <div className="mt-4 text-xs text-gray-400">
                    Social media links enabled
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CanvasEditor;
