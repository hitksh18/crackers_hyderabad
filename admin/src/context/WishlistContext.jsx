import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'crackers_wishlist';

const WishlistContext = createContext(null);

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
};

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  // Ids removed locally while a cloud fetch is in flight. Without this the
  // merge below would resurrect them the moment the snapshot resolves.
  const removedDuringSyncRef = useRef(new Set());
  const [wishlist, setWishlist] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // storage unavailable
    }
  }, [wishlist]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const syncFromCloud = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const cloudIds = Array.isArray(snap.data().wishlist) ? snap.data().wishlist : [];
          if (!cancelled) {
            setWishlist(prev => {
              const cloudOnly = removedDuringSyncRef.current.size
                ? cloudIds.filter(id => !removedDuringSyncRef.current.has(id))
                : cloudIds;
              const merged = Array.from(new Set([...cloudOnly, ...prev]));
              return merged;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load wishlist from cloud:', err);
      }
    };
    syncFromCloud();
    return () => { cancelled = true; };
  }, [user, user?.uid]);

  const persistToCloud = useCallback(async (ids) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { wishlist: ids }, { merge: true });
    } catch (err) {
      console.error('Failed to sync wishlist:', err);
    }
  }, [user]);

  const toggleWishlist = useCallback((product) => {
    if (!product || !product.id) return;
    const exists = wishlist.includes(product.id);
    const next = exists ? wishlist.filter(id => id !== product.id) : [...wishlist, product.id];
    if (exists) removedDuringSyncRef.current.add(product.id);
    else removedDuringSyncRef.current.delete(product.id);
    setWishlist(next);
    persistToCloud(next);
  }, [wishlist, persistToCloud]);

  const isWishlisted = useCallback((id) => wishlist.includes(id), [wishlist]);

  return (
    <WishlistContext.Provider value={{ wishlist, toggleWishlist, isWishlisted, wishlistCount: wishlist.length }}>
      {children}
    </WishlistContext.Provider>
  );
};
