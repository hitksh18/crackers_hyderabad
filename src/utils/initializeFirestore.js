// Manual Firestore Initialization Script
// This can be run from browser console to manually create the homepage settings document

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const manuallyInitializeHomepageSettings = async () => {
  try {
    console.log('🔧 Starting manual initialization of homepage settings...');
    
    const settingsRef = doc(db, 'settings', 'homepage');
    
    // Check if document exists
    console.log('📖 Checking if document exists...');
    const docSnap = await getDoc(settingsRef);
    
    if (docSnap.exists()) {
      console.log('✅ Document already exists with data:', docSnap.data());
      return { success: true, message: 'Document already exists', data: docSnap.data() };
    }
    
    // Create new document
    console.log('📝 Creating new document...');
    const defaultSettings = {
      bannerImageUrl: null,
      bannerImageAlt: 'Crackers Hyderabad Banner',
      promoMessage: 'Free Delivery available above orders of ₹2500 & Cash On Delivery available',
      updatedAt: new Date().toISOString(),
      updatedBy: 'manual-init'
    };
    
    await setDoc(settingsRef, defaultSettings);
    console.log('✅ Document created successfully!');
    console.log('📄 Document data:', defaultSettings);
    
    return { success: true, message: 'Document created successfully', data: defaultSettings };
    
  } catch (error) {
    console.error('❌ Error initializing homepage settings:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'permission-denied') {
      console.error('🚫 PERMISSION DENIED: Check your Firestore security rules!');
      console.error('Make sure your rules allow writes to the "settings" collection');
    }
    
    return { success: false, error: error.message, code: error.code };
  }
};

// Test function to verify Firestore connection
export const testFirestoreConnection = async () => {
  try {
    console.log('🧪 Testing Firestore connection...');
    const settingsRef = doc(db, 'settings', 'homepage');
    const docSnap = await getDoc(settingsRef);
    
    console.log('✅ Firestore connection successful!');
    console.log('Document exists:', docSnap.exists());
    
    if (docSnap.exists()) {
      console.log('Document data:', docSnap.data());
    }
    
    return { success: true, exists: docSnap.exists(), data: docSnap.data() };
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    return { success: false, error: error.message };
  }
};

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  window.initFirestore = manuallyInitializeHomepageSettings;
  window.testFirestore = testFirestoreConnection;
}
