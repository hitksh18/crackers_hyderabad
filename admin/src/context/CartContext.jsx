import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
// NOTE (admin copy): the storefront's siteTracker import is intentionally
// dropped here. This provider exists only so the Canvas live preview can
// render product cards; staff preview clicks must never pollute the shop's
// funnel analytics.

const GUEST_KEY = 'cart_guest';
const LEGACY_KEY = 'cart';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
};

const storageKeyFor = (user) => (user ? `cart_${user.uid}` : GUEST_KEY);

const readStoredCart = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }) => {
  const { user, authReady } = useAuth();
  const storageKey = storageKeyFor(user);
  const [cart, setCart] = useState([]);
  const [cartNotice, setCartNotice] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const storageKeyRef = useRef(storageKey);

  const notifyCart = (message) => {
    setCartNotice({ message, id: Date.now() });
  };

  /*
   * The cart is keyed by account: each signed-in user gets their own stored
   * cart, and guests get a separate one. We wait for the account to be known (a
   * restored session starts with `user === null`) so a signed-in user never
   * briefly sees the guest cart, and switching accounts swaps to that account's
   * own cart instead of leaking the previous one.
   *
   * `authReady`, not `loading`: `loading` also covers the roles/{uid} read, and
   * gating on it made the cart — and so the cart and checkout pages — wait on a
   * Firestore request that has nothing to do with which cart to open.
   */
  useEffect(() => {
    if (!authReady) return undefined;

    let key = storageKey;
    if (key === GUEST_KEY) {
      // One-time migration from the pre-account shared key.
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy && !localStorage.getItem(GUEST_KEY)) {
          localStorage.setItem(GUEST_KEY, legacy);
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch {
        // Storage unavailable; the cart just starts empty.
      }
    }

    storageKeyRef.current = key;
    setCart(readStoredCart(key));
    setHydrated(true);
    return undefined;
  }, [authReady, storageKey]);

  useEffect(() => {
    if (!hydrated) return undefined;
    // The identity-change render is owned by the hydrate effect above; writing
    // here would overwrite the incoming account's stored cart with the outgoing
    // one before the swap has been read.
    if (storageKeyRef.current !== storageKey) return undefined;

    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Storage can be unavailable in private mode or when the quota is full.
      // The cart still works for the rest of this session.
    }
    return undefined;
  }, [cart, storageKey, hydrated]);

  // Every mutation uses the functional form so two updates landing in the same
  // tick (double-tapping add-to-cart) cannot clobber one another.
  const addToCart = (product, quantity = 1) => {
    setCart((prev) => {
      const existingItem = prev.find((item) => item.id === product.id);

      if (existingItem) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }

      return [...prev, { ...product, quantity }];
    });

    notifyCart('Product added to cart');

    // No funnel beacon in the admin copy (see note at the top of this file).
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
    notifyCart('Product removed from cart');
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart((prev) => prev.map((item) => (item.id === productId ? { ...item, quantity } : item)));
  };

  const clearCart = () => {
    setCart([]);
    try {
      localStorage.removeItem(storageKeyRef.current);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  };

  const getCartTotal = () =>
    cart.reduce((total, item) => {
      const price = item.discountPrice || item.onlinePrice || item.price || 0;
      return total + price * item.quantity;
    }, 0);

  const getCartCount = () => cart.reduce((count, item) => count + item.quantity, 0);

  const value = {
    cart,
    /*
     * Whether `cart` has actually been read from storage yet. Exposed because an
     * empty cart and an unread cart look identical from the outside, and they
     * mean opposite things: hydration waits on auth settling, so on a cold page
     * load `cart` is [] for a few hundred ms even when the customer has items.
     * Anything that acts on emptiness — redirecting away, showing an
     * empty-state — must wait for this or it fires on a cart that isn't empty.
     */
    hydrated,
    cartNotice,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getCartCount,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};