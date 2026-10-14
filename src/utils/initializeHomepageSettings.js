import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const initializeHomepageSettings = async () => {
  const settingsRef = doc(db, 'settings', 'homepage');
  
  try {
    const docSnap = await getDoc(settingsRef);
    
    if (!docSnap.exists()) {
      console.log('Homepage settings document does not exist. Creating default settings...');
      
      const defaultSettings = {
        bannerImageUrl: null,
        bannerImageAlt: 'Crackers Hyderabad Banner',
        promoMessage: 'Free Delivery available above orders of ₹2500 & Cash On Delivery available',
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
      };
      
      await setDoc(settingsRef, defaultSettings);
      console.log('Default homepage settings created successfully!');
      return defaultSettings;
    } else {
      console.log('Homepage settings already exist');
      return docSnap.data();
    }
  } catch (error) {
    console.error('Error initializing homepage settings:', error);
    throw error;
  }
};
