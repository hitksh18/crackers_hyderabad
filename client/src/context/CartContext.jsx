import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../firebase';
import { cachedGetDocs } from '../lib/firestoreCache';
import { useAuth } from './AuthContext';
import { trackFunnel } from '../utils/siteTracker';
import { trackAddToCart, trackRemoveFromCart } from '../lib/ga4';
import toast from '../utils/toast';

const couponDroppedNotice = () => {
  toast.error('The applied coupon no longer fits this cart and was removed.');
};

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
const COUPON_SESSION_KEY = 'coupon_code';

/* Read a stored coupon code without trusting anything else about it — amounts
   are always revalidated server-side before display or order creation. */
const readStoredCouponCode = () => {
  try {
    return String(sessionStorage.getItem(COUPON_SESSION_KEY) || '').trim();
  } catch {
    return '';
  }
};

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
  /* Live mirror for analytics lookups: removeFromCart only receives an id,
     so the removed item's details come from here. Updated every render. */
  const cartRef = useRef(cart);
  cartRef.current = cart;

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
    const stored = readStoredCart(key);
    setCart(stored);
    setHydrated(true);

    // Revalidate against the live catalogue once per hydrate, via the shared
    // 60s cache (same download Home and /products use) — not a 4th full scan.
    let cancelled = false;
    (async () => {
      try {
        const live = await cachedGetDocs(collection(db, 'products'), 'products');
        if (cancelled) return;
        const liveIds = new Set((Array.isArray(live) ? live : []).map((d) => d.id));
        setCart((prev) => {
          if (prev.every((item) => !item || liveIds.has(item.id))) return prev;
          const cleaned = prev.filter((item) => item && liveIds.has(item.id));
          try {
            localStorage.setItem(key, JSON.stringify(cleaned));
          } catch {
            // Storage unavailable — in-memory cart still updates.
          }
          return cleaned;
        });
      } catch (error) {
        console.warn('Cart catalogue revalidation skipped:', error?.message || error);
      }
    })();
    return () => { cancelled = true; };
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
  // useCallback keeps the provider value stable so ProductCards don't
  // re-render when unrelated state changes.
  const addToCart = useCallback((product, quantity = 1) => {
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

    // The one funnel step no URL implies. Fire-and-forget, outside the state
    // update so a blocked beacon can never stop a product reaching the cart.
    trackFunnel('addToCart');
    // GA4 ecommerce (separate system, same user action). Never throws, and a
    // missing measurement id makes it a silent no-op.
    trackAddToCart(product, quantity);
  }, []);

  const removeFromCart = useCallback((productId) => {
    const removed = cartRef.current.find((item) => item && item.id === productId);
    setCart((prev) => prev.filter((item) => item.id !== productId));
    notifyCart('Product removed from cart');
    if (removed) trackRemoveFromCart(removed, removed.quantity);
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== productId));
      notifyCart('Product removed from cart');
      return;
    }

    setCart((prev) => prev.map((item) => (item.id === productId ? { ...item, quantity } : item)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCoupon(null);
    setCouponInput('');
    setCouponError('');
    try {
      sessionStorage.removeItem(COUPON_SESSION_KEY);
    } catch {
      // Storage unavailable — in-memory state still clears.
    }
    try {
      localStorage.removeItem(storageKeyRef.current);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }, []);

  /*
   * Shared applied-coupon state — the single authority for Cart and Checkout.
   * Only the CODE is stored (sessionStorage, this tab only); every amount is
   * revalidated through POST /api/coupons/validate and the server re-checks
   * again at order creation, so a stale or tampered value can never change
   * what is paid. Applying never consumes usage — only a created order does.
   */
  const [coupon, setCoupon] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponApplying, setCouponApplying] = useState(false);

  const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

  /*
   * Instant local re-estimate of an applied coupon against the CURRENT cart.
   * Same arithmetic the server uses (percentage with cap, fixed clamped to
   * the subtotal). This is display-only: the silent server revalidation
   * below stays authoritative and corrects any approximation (e.g. product
   * restrictions the estimate cannot see). Dropping is exact — eligible
   * value can never exceed the raw subtotal, so raw subtotal below minimum
   * means the server would drop it too.
   */
  const estimateCouponTotals = (applied, items) => {
    const subtotal = Math.round(items.reduce((s, it) => s + unitPriceOf(it) * (Number(it.quantity) || 0), 0) * 100) / 100;
    const minimum = Number(applied.minimumOrderValue) || 0;
    if (subtotal <= 0 || subtotal < minimum) return null;
    let amount;
    if (applied.discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(applied.discountValue) || 0));
      amount = (subtotal * pct) / 100;
      if (applied.maximumDiscount != null) amount = Math.min(amount, Number(applied.maximumDiscount));
    } else {
      amount = Math.min(Math.max(0, Number(applied.discountValue) || 0), subtotal);
    }
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) return null;
    return { subtotal, discountAmount: amount, total: Math.round((subtotal - amount) * 100) / 100 };
  };

  const validateCouponCode = useCallback(async (code, { silent = false, email, phone } = {}) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      if (!silent) setCouponError('Enter a coupon code.');
      return null;
    }
    setCouponApplying(true);
    if (!silent) setCouponError('');
    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: trimmed,
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.valid) {
        if (!silent) setCouponError(data.message || 'This coupon code is not valid.');
        return null;
      }
      return {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmount: data.discountAmount,
        minimumOrderValue: Number(data.minimumOrderValue) || 0,
        maximumDiscount: data.maximumDiscount ?? null,
        subtotal: data.subtotal,
        total: data.total,
      };
    } catch {
      if (!silent) setCouponError('Could not validate the coupon. Please try again.');
      return null;
    } finally {
      setCouponApplying(false);
    }
  }, [cart]);

  const applyCoupon = useCallback(async (code, options = {}) => {
    const applied = await validateCouponCode(code ?? couponInput, options);
    if (!applied) {
      setCoupon(null);
      return null;
    }
    setCoupon(applied);
    setCouponInput(applied.code);
    try {
      sessionStorage.setItem(COUPON_SESSION_KEY, applied.code);
    } catch {
      // Storage unavailable — the coupon still applies for this page.
    }
    return applied;
  }, [validateCouponCode, couponInput]);

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    setCouponInput('');
    setCouponError('');
    try {
      sessionStorage.removeItem(COUPON_SESSION_KEY);
    } catch {
      // Storage unavailable — in-memory state still clears.
    }
  }, []);

  /* Cart edits re-resolve the coupon in two steps: an instant local
     re-estimate so every +/- updates totals synchronously, then the silent
     server revalidation (authoritative — restores or drops as needed).
     Debounced 500ms so rapid +/- taps revalidate once, not per tap. */
  const cartSignature = cart.map((item) => `${item.id}:${item.quantity}`).join('|');
  useEffect(() => {
    if (!hydrated) return undefined;
    if (cart.length === 0) {
      if (coupon) setCoupon(null);
      return undefined;
    }
    const stored = coupon?.code || readStoredCouponCode();
    if (!stored) return undefined;
    if (coupon) {
      const estimate = estimateCouponTotals(coupon, cart);
      if (!estimate) {
        setCoupon(null);
        couponDroppedNotice();
      } else {
        setCoupon({ ...coupon, ...estimate });
      }
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      validateCouponCode(stored, { silent: true }).then((fresh) => {
        if (cancelled) return;
        if (fresh) {
          setCoupon(fresh);
        } else if (coupon) {
          setCoupon(null);
          couponDroppedNotice();
        }
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartSignature]);

  const getCartTotal = useCallback(() =>
    cart.reduce((total, item) => {
      const price = item.discountPrice || item.onlinePrice || item.price || 0;
      return total + price * item.quantity;
    }, 0), [cart]);

  const getCartCount = useCallback(() => cart.reduce((count, item) => count + item.quantity, 0), [cart]);

  /* Stable provider value: without this every cart render mints a new object
     and re-renders all 100+ ProductCards, even when the cart is untouched. */
  const value = useMemo(() => ({
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
    coupon,
    couponInput,
    setCouponInput,
    couponError,
    setCouponError,
    couponApplying,
    validateCouponCode,
    applyCoupon,
    removeCoupon,
  }), [cart, hydrated, cartNotice, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal, getCartCount, coupon, couponInput, couponError, couponApplying, validateCouponCode, applyCoupon, removeCoupon]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};