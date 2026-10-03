import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_SETTINGS = {
  bannerImageUrl: null,
  bannerImageAlt: 'Crackers Hyderabad Banner',
  promoMessage: 'Free Delivery available above orders of ₹2500 & Cash On Delivery available',
  updatedAt: null,
  updatedBy: null
};

export const useHomepageSettings = (realtime = false) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'homepage');

    if (realtime) {
      // Real-time listener
      const unsubscribe = onSnapshot(
        settingsRef,
        (docSnap) => {
          if (docSnap.exists()) {
            setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() });
          } else {
            setSettings(DEFAULT_SETTINGS);
          }
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching homepage settings:', err);
          setError(err.message);
          setSettings(DEFAULT_SETTINGS);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      const fetchSettings = async () => {
        try {
          const docSnap = await getDoc(settingsRef);
          if (docSnap.exists()) {
            setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() });
          } else {
            setSettings(DEFAULT_SETTINGS);
          }
        } catch (err) {
          console.error('Error fetching homepage settings:', err);
          setError(err.message);
          setSettings(DEFAULT_SETTINGS);
        } finally {
          setLoading(false);
        }
      };

      fetchSettings();
    }
  }, [realtime]);

  return { settings, loading, error };
};

export const updateHomepageSettings = async (newSettings, userEmail) => {
  const settingsRef = doc(db, 'settings', 'homepage');
  
  try {
    const updateData = {
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || 'admin'
    };

    await setDoc(settingsRef, updateData, { merge: true });

    return { success: true };
  } catch (error) {
    console.error('Error updating homepage settings:', error.message);
    return { success: false, error: error.message };
  }
};
