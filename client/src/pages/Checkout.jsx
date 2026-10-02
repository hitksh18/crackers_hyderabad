import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from '../utils/toast';
import { Banknote, Smartphone, CheckCircle2, AlertTriangle, ShoppingBag, ShieldCheck, MapPin, ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { sendOrderSMS } from '../utils/sms';
import CheckoutField from '../components/checkout/CheckoutField';
import ConfirmOrderModal from '../components/checkout/ConfirmOrderModal';
import DeliveryLocationPicker from '../components/checkout/DeliveryLocationPicker';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants } from '../lib/motion';
import { inr } from '../lib/currency';
import { MINIMUM_ORDER_VALUE } from '../lib/orderThresholds';
import { normaliseCoords } from '../utils/deliveryLocation';
import Seo from '../components/Seo';

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
const isEmailValid = (value) => typeof value === 'string' && value.trim().length <= 254 && EMAIL_RE.test(value.trim());

/* Accordion steps, in order. The delivery step is optional (pin or skip);
   everything else gates the payment step. */
const STEPS = ['email', 'shipping', 'billing', 'delivery', 'payment'];

const PAYMENT_LABELS = { cod: 'Cash on Delivery', upi: 'UPI on Delivery' };

const Checkout = () => {
  const { cart, hydrated, getCartTotal, clearCart, updateQuantity, removeFromCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [adminSettings, setAdminSettings] = useState({
    // Fallback only — the live adminSettings/main document carries the real
    // floor. Both resolve to lib/orderThresholds.MINIMUM_ORDER_VALUE (₹2,000).
    minimumOrderValue: MINIMUM_ORDER_VALUE,
    minimumOrderValueEnabled: true,
    deliveryPinEnabled: true
  });
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });
  /* Billing := shipping while on. The toggle writes the shipping values into
     the billing fields (and keeps them synced); unchecking restores whatever
     was there before. The server always receives both objects populated. */
  const [sameAsShipping, setSameAsShipping] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    flatNo: '',
    streetNo: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
    altPhone: '',
  });
  /* The pinned doorstep, as { lat, lng } or null. Kept beside the typed address
     rather than derived from it: the two answer different questions, and in the
     unaddressed layouts around Hyderabad the pin is the more reliable one. */
  const [pin, setPin] = useState(null);
  /* Which fields the map filled in. Re-pinning may overwrite these, but never a
     field the customer typed themselves — see applyResolvedAddress. */
  const autoFilledRef = useRef(new Set());
  const orderPlacedRef = useRef(false);
  const formRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Presentation-only: mobile order-summary collapse. Desktop is always
  // expanded via CSS (lg:block); this never affects submission or totals.
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* Presentation-only: summary-list scrollbar visibility — hidden at rest,
     thin gold while scrolling, fading out on idle. */
  const [summaryScrolling, setSummaryScrolling] = useState(false);
  const summaryIdleRef = useRef(null);
  const handleSummaryScroll = () => {
    setSummaryScrolling(true);
    if (summaryIdleRef.current) window.clearTimeout(summaryIdleRef.current);
    summaryIdleRef.current = window.setTimeout(() => setSummaryScrolling(false), 900);
  };
  useEffect(() => () => {
    if (summaryIdleRef.current) window.clearTimeout(summaryIdleRef.current);
  }, []);
  /* Same auto-hide treatment for the left accordion column on desktop. */
  const [workspaceScrolling, setWorkspaceScrolling] = useState(false);
  const workspaceIdleRef = useRef(null);
  const handleWorkspaceScroll = () => {
    setWorkspaceScrolling(true);
    if (workspaceIdleRef.current) window.clearTimeout(workspaceIdleRef.current);
    workspaceIdleRef.current = window.setTimeout(() => setWorkspaceScrolling(false), 900);
  };
  useEffect(() => () => {
    if (workspaceIdleRef.current) window.clearTimeout(workspaceIdleRef.current);
  }, []);
  // Presentation-only: which fields the visitor has left, so inline errors
  // never shout at an untouched form. Submission validation is unchanged.
  const [touched, setTouched] = useState({});
  /* Accordion state: exactly one section expanded at a time. Step values live
     in the shared form state above, so collapsing never discards anything. */
  const [activeStep, setActiveStep] = useState('email');
  const [deliverySkipped, setDeliverySkipped] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const STORAGE_KEY = 'checkout_details';

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) setFormData((prev) => ({ ...prev, ...parsed.formData }));
        if (parsed.deliveryAddress) setDeliveryAddress((prev) => ({ ...prev, ...parsed.deliveryAddress }));
        if (typeof parsed.sameAsShipping === 'boolean') setSameAsShipping(parsed.sameAsShipping);
        /* Re-validated on the way in: this came from storage the page does not
           exclusively own, and a bad pin must not survive a reload. */
        if (parsed.pin) setPin(normaliseCoords(parsed.pin.lat, parsed.pin.lng));
        if (Array.isArray(parsed.autoFilled)) autoFilledRef.current = new Set(parsed.autoFilled);
        if (STEPS.includes(parsed.activeStep)) setActiveStep(parsed.activeStep);
        if (typeof parsed.deliverySkipped === 'boolean') setDeliverySkipped(parsed.deliverySkipped);
        if (parsed.paymentMethod === 'cod' || parsed.paymentMethod === 'upi') setPaymentMethod(parsed.paymentMethod);
      }
    } catch (error) {
      console.error('Error restoring checkout details:', error);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          formData,
          deliveryAddress,
          sameAsShipping,
          pin,
          /* Persisted so that after a reload, re-pinning still knows which
             fields are its own to overwrite and which the customer typed. */
          autoFilled: [...autoFilledRef.current],
          activeStep,
          deliverySkipped,
          paymentMethod,
        })
      );
    } catch (error) {
      console.error('Error saving checkout details:', error);
    }
  }, [formData, deliveryAddress, sameAsShipping, pin, activeStep, deliverySkipped, paymentMethod]);

  useEffect(() => {
    const fetchAdminSettings = async () => {
      try {
        const adminDoc = await getDoc(doc(db, 'adminSettings', 'main'));
        if (adminDoc.exists()) {
          const data = adminDoc.data();
          const migratedData = { ...data };

          if ('minimumOrderValueLocked' in data && !('minimumOrderValueEnabled' in data)) {
            migratedData.minimumOrderValueEnabled = data.minimumOrderValueLocked !== false;
          }

          setAdminSettings(prev => ({ ...prev, ...migratedData }));
        }
      } catch (error) {
        console.error('Error fetching admin settings:', error);
      }
    };
    fetchAdminSettings();
  }, []);

  const handleChange = (e) => {
    /* Typing into a field claims it: a later re-pin will leave it alone. */
    autoFilledRef.current.delete(e.target.name);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const changeDelivery = (key, value) => {
    autoFilledRef.current.delete(`delivery.${key}`);
    setDeliveryAddress((prev) => ({ ...prev, [key]: value }));
  };

  /* Snapshot of the independently typed billing block, so unchecking
     "same as shipping" restores exactly what the customer had. */
  const prevBillingRef = useRef(null);

  /* Copy the shipping address into the billing fields, immediately and
     visibly. Name/phone/email are shared contact state and are never
     overwritten — only the street block is synced. */
  const copyShippingToBilling = useCallback((shipping) => {
    setFormData((prev) => ({
      ...prev,
      address: [shipping.streetNo, shipping.area].filter(Boolean).join(', ') || prev.address,
      city: shipping.city || prev.city,
      state: shipping.state || prev.state,
      pincode: shipping.pincode || prev.pincode,
    }));
  }, []);

  const handleSameAsShipping = (checked) => {
    if (checked) {
      prevBillingRef.current = {
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
      };
      copyShippingToBilling(deliveryAddress);
    } else if (prevBillingRef.current) {
      const snap = prevBillingRef.current;
      setFormData((prev) => ({ ...prev, ...snap }));
      prevBillingRef.current = null;
    }
    setSameAsShipping(checked);
  };

  /* While the flag is on, shipping edits flow straight into the synced
     billing copy so the two can never drift apart. */
  useEffect(() => {
    if (sameAsShipping) copyShippingToBilling(deliveryAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsShipping, deliveryAddress.flatNo, deliveryAddress.streetNo, deliveryAddress.area, deliveryAddress.city, deliveryAddress.state, deliveryAddress.pincode]);

  /**
   * Write the reverse-geocoded address into the form.
   *
   * The rule is that the map may fill a blank field, and may correct a field it
   * filled itself, but never touches something the customer typed. Without that
   * last part, nudging the pin by ten metres would silently wipe a flat number
   * only the customer could know — the map has no idea which floor anyone is on.
   */
  const applyResolvedAddress = useCallback((resolved) => {
    if (!resolved) return;

    const filled = autoFilledRef.current;

    const merge = (current, updates, prefix) => {
      const next = { ...current };
      let changed = false;

      for (const [key, incoming] of Object.entries(updates)) {
        if (!incoming) continue;
        const tag = prefix ? `${prefix}.${key}` : key;
        const isMine = filled.has(tag);
        if (current[key] && !isMine) continue; // The customer's own words. Leave them.
        if (current[key] === incoming) continue;

        next[key] = incoming;
        filled.add(tag);
        changed = true;
      }

      return changed ? next : current;
    };

    /* The two blocks take different shapes of the same answer: billing keeps the
       street address in one free-text field, delivery splits it across flat,
       street and area. */
    const streetLine = [resolved.house, resolved.street].filter(Boolean).join(', ');

    setDeliveryAddress((prev) =>
      merge(
        prev,
        {
          flatNo: resolved.house,
          streetNo: resolved.street,
          area: resolved.area,
          city: resolved.city,
          state: resolved.state,
          pincode: resolved.pincode,
        },
        'delivery'
      )
    );

    setFormData((prev) =>
      merge(
        prev,
        {
          address: [streetLine, resolved.area].filter(Boolean).join(', '),
          city: resolved.city,
          pincode: resolved.pincode,
        },
        ''
      )
    );
  }, []);

  /* ---- Step completion (live-derived from the shared form state) ---- */
  const emailDone = isEmailValid(formData.email);
  const shippingDone = Boolean(
    formData.name.trim() && formData.phone.trim() &&
    deliveryAddress.flatNo.trim() && deliveryAddress.streetNo.trim() &&
    deliveryAddress.area.trim() && deliveryAddress.city.trim() &&
    deliveryAddress.pincode.trim()
  );
  const billingDone = sameAsShipping || Boolean(
    formData.name.trim() && formData.phone.trim() &&
    formData.address.trim() && formData.city.trim() && formData.pincode.trim()
  );
  const stepDone = { email: emailDone, shipping: shippingDone, billing: billingDone, delivery: true, payment: true };

  const firstIncomplete = (from) => {
    const order = ['email', 'shipping', 'billing'];
    const start = from ? order.indexOf(from) + 1 : 0;
    for (let i = Math.max(0, start); i < order.length; i += 1) {
      if (!stepDone[order[i]]) return order[i];
    }
    return 'payment';
  };

  const goStep = (step) => setActiveStep(step);

  const continueFrom = (step) => {
    if (step === 'email') {
      if (!emailDone) {
        markTouched('email');
        toast.error('Please enter a valid email address');
        return;
      }
    }
    if (step === 'shipping') {
      const missing = ['name', 'phone', 'flatNo', 'streetNo', 'area', 'city', 'pincode']
        .filter((k) => {
          const v = k === 'name' || k === 'phone' ? formData[k] : deliveryAddress[k];
          return !String(v || '').trim();
        });
      missing.forEach((k) => markTouched(`ship.${k}`));
      if (!shippingDone) {
        toast.error('Please fill the shipping address');
        return;
      }
    }
    if (step === 'billing' && !sameAsShipping) {
      const missing = ['name', 'phone', 'address', 'city', 'pincode'].filter((k) => !String(formData[k] || '').trim());
      missing.forEach((k) => markTouched(k));
      if (!billingDone) {
        toast.error('Please fill the billing address');
        return;
      }
    }
    /* Delivery is optional: Continue keeps the pin, Skip drops it. Either way
       the step is complete and payment opens next. */
    if (step === 'delivery') {
      setDeliverySkipped((skipped) => (pin ? false : skipped));
    }
    setActiveStep(step === 'payment' ? 'payment' : firstIncomplete(step));
  };

  const skipDelivery = () => {
    setPin(null);
    setDeliverySkipped(true);
    setActiveStep('payment');
  };

  /* Billing payload: the street block when the flag is on (composed from the
     shipping fields the customer actually entered), the typed billing block
     otherwise. Contact details always ride from the shared state. */
  const effectiveCustomer = () => {
    if (sameAsShipping) {
      const street = [deliveryAddress.streetNo, deliveryAddress.area].filter(Boolean).join(', ');
      return {
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        address: street || deliveryAddress.flatNo || '',
        city: deliveryAddress.city,
        pincode: deliveryAddress.pincode,
      };
    }
    const { state: _ignored, ...billing } = formData;
    return billing;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const customer = effectiveCustomer();
    if (!isEmailValid(customer.email)) {
      toast.error('Please enter a valid email address');
      setActiveStep('email');
      markTouched('email');
      return;
    }
    if (!customer.name || !customer.phone || !customer.address || !customer.city || !customer.pincode) {
      toast.error('Please fill all required fields');
      setActiveStep(!shippingDone ? 'shipping' : 'billing');
      return;
    }
    if (!deliveryAddress.flatNo || !deliveryAddress.streetNo || !deliveryAddress.area || !deliveryAddress.city || !deliveryAddress.pincode) {
      toast.error('Please fill the shipping address');
      setActiveStep('shipping');
      return;
    }

    const cartTotal = getCartTotal();
    if (adminSettings.minimumOrderValueEnabled && cartTotal < adminSettings.minimumOrderValue) {
      toast.error(`Minimum order value is ₹${adminSettings.minimumOrderValue}. Your cart total is ₹${cartTotal}. Please add more items.`, {
        duration: 5000
      });
      return;
    }

    setShowConfirm(true);
  };

  const confirmPlaceOrder = async () => {
    setLoading(true);

    try {
      // The cart can still be edited inside the review modal, so re-check the
      // floor against the live total rather than trusting the check that ran
      // before the modal opened. The server enforces it again regardless.
      const liveTotal = getCartTotal();
      if (adminSettings.minimumOrderValueEnabled && liveTotal < adminSettings.minimumOrderValue) {
        toast.error(
          `Minimum order value is ₹${adminSettings.minimumOrderValue}. Your cart total is ₹${liveTotal}.`,
          { duration: 5000 }
        );
        setShowConfirm(false);
        return;
      }

      // Only ids and quantities are sent. The server prices the cart from the
      // products collection, enforces the minimum, assigns the status and order
      // code, and writes the document — the browser cannot choose what it pays.
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
        },
        body: JSON.stringify({
          customer: effectiveCustomer(),
          sameAsBilling: false,
          delivery: deliveryAddress,
          /* Sent alongside the typed address, not instead of it. The server
             re-validates the coordinates and stores both, so the driver gets the
             doorstep and the invoice still reads as an address. */
          deliveryLocation: pin,
          paymentMethod,
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      });

      // Read as text first: when the API is unreachable the dev proxy (or an
      // edge) answers with an HTML/text error page instead of JSON, and a bare
      // `response.json()` would throw, hiding the real HTTP status behind the
      // generic message. The toast UI is unchanged — only the message gains a
      // development-only suffix.
      let result = {};
      let rawBody = '';
      try {
        rawBody = await response.text();
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        result = {};
      }

      if (!response.ok) {
        const serverMessage =
          typeof result.error === 'string' && result.error ? result.error : '';
        const devDetail =
          typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
            ? ` (HTTP ${response.status}${serverMessage || !rawBody ? '' : `: ${rawBody.slice(0, 120)}`})`
            : '';
        toast.error(`${serverMessage || 'Could not place your order. Please try again.'}${devDetail}`, {
          duration: 5000,
        });
        return;
      }

      const { orderId, shortCode, total, itemCount, notifyToken } = result;

      orderPlacedRef.current = true;
      clearCart();
      sessionStorage.removeItem(STORAGE_KEY);

      // Email confirmation is sent by the server itself, once, right after the
      // order commits (api/lib/orders.js → maybeSendOrderConfirmationEmail).
      // Firing POST /api/orders/email from here as well used to produce a
      // SECOND confirmation for every order — two hooks, two senders. The
      // browser never triggers notification email; SMS stays client-side.
      if (formData.phone) {
        sendOrderSMS({ orderId, notifyToken, type: 'placed' });
      }

      navigate('/order-success', {
        // The last four digits ride along so the "Track Order" button works in
        // one tap — tracking checks them against the order, and asking the
        // customer to retype the number they just entered would be absurd.
        state: {
          orderId,
          shortCode,
          total,
          itemCount,
          phoneLast4: String(formData.phone || '').replace(/\D/g, '').slice(-4),
        },
      });
    } catch (error) {
      // Network-level failure: the request never reached the API (backend down,
      // CORS block, offline). Same toast UI; development appends the cause.
      console.error('Error placing order:', error);
      const devCause =
        typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && error && error.message
          ? ` (${error.message})`
          : '';
      toast.error(`Failed to place order. Please try again.${devCause}`);
    } finally {
      setLoading(false);
    }
  };

  /* Only genuinely empty once the cart has been read from storage. Acting on
  `cart.length === 0` before then bounced customers straight back to /cart on
  any direct load or refresh of this page, because hydration waits on auth. */
  const cartEmpty = hydrated && cart.length === 0 && !orderPlacedRef.current;

  useEffect(() => {
    if (cartEmpty) {
      /* Replace, not push: this page is not a destination anyone chose, and
         leaving it in the history makes Back bounce straight back here. */
      navigate('/cart', { replace: true });
    }
  }, [cartEmpty, navigate]);

  if (cartEmpty || !hydrated) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-14 w-14 animate-spin rounded-full"
          style={{ border: '3px solid var(--hairline-strong)', borderTopColor: 'var(--ember-600)' }}
        />
        <span className="sr-only">Loading checkout</span>
      </div>
    );
  }

  /* ---- Presentation-only derived state (no effect on submission) ---- */
  const markTouched = (key) => setTouched((prev) => ({ ...prev, [key]: true }));

  const emailMessages = { email: 'Enter a valid email address.' };
  const shippingMessages = {
    name: 'Full name is required.',
    phone: 'Phone number is required.',
    flatNo: 'Flat / house number is required.',
    streetNo: 'Street or road name is required.',
    area: 'Area or locality is required.',
    city: 'City is required.',
    pincode: 'Pincode is required.',
  };
  const billingMessages = {
    address: 'Billing address is required.',
    city: 'City is required.',
    pincode: 'Pincode is required.',
  };

  const emailError = touched.email && !emailDone ? emailMessages.email : '';
  const shipError = (key) => {
    const value = key === 'name' || key === 'phone' ? formData[key] : deliveryAddress[key];
    return touched[`ship.${key}`] && !String(value || '').trim() ? shippingMessages[key] : '';
  };
  const billingError = (key) =>
    !sameAsShipping && touched[`bill.${key}`] && !String(formData[key] || '').trim() ? billingMessages[key] : '';

  const total = getCartTotal();
  const minimumMet = total >= adminSettings.minimumOrderValue;

  const shippingSummary = shippingDone ? [
    `${formData.name} · ${formData.phone}`,
    `${deliveryAddress.flatNo}, ${deliveryAddress.streetNo}`,
    `${deliveryAddress.area}, ${deliveryAddress.city}${deliveryAddress.state ? `, ${deliveryAddress.state}` : ''} - ${deliveryAddress.pincode}`,
  ] : [];
  const billingSummary = billingDone ? (sameAsShipping ? ['Same as shipping address'] : [
    `${formData.name} · ${formData.phone}`,
    `${formData.address}, ${formData.city}${formData.state ? `, ${formData.state}` : ''} - ${formData.pincode}`,
  ]) : [];
  const deliverySummary = pin ? [
    'Location pinned',
    `${Number(pin.lat).toFixed(5)}, ${Number(pin.lng).toFixed(5)}${deliveryAddress.city ? ` · ${deliveryAddress.city}` : ''}`,
  ] : ['Not selected'];

  // Viewport math uses the real chrome heights: lg navbar = min-h-72 + py-2
  // (88px, see CheckoutNavbar) and the copyright strip ~= 52px. The summary
  // therefore starts below the navbar and ends above the footer with zero
  // page scroll — no fixed positioning anywhere.
  return (
    <div className="section-pad-sm checkout-fit pb-28 lg:flex lg:h-[calc(100dvh-88px-52px)] lg:min-h-[560px] lg:flex-col lg:overflow-hidden lg:pb-0">
      <Seo title="Checkout | Crackers Hyderabad" noindex />
      {/* Wide shell: the global navbar carries logo/brand/profile, so the
          page opens straight onto content with a compact back row. On desktop
          this is a fixed viewport (navbar / workspace / footer); the App
          footer flows right after, so no page scroll is possible. */}
      <div className="shell shell-checkout lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="mb-2 flex shrink-0 items-center gap-3">
          <Link
            to="/cart"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: 'var(--ember-600)' }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
            Back to Cart
          </Link>
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 16)}
          className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        >
          {/* One form across accordion + summary: the Place Order submit lives
              in the summary panel but submits this same form, so validation
              and the review modal behave identically everywhere. */}
          <form onSubmit={handleSubmit} ref={formRef} id="checkout-form" className="grid items-start gap-2.5 sm:gap-3 lg:min-h-0 lg:flex-1 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,32%)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
            {/* LEFT — progressive accordion in its own scroll viewport.
                Exactly one section expanded; the column scrolls, the page
                does not. */}
            <div
              className={`auto-scroll min-w-0 space-y-0 lg:min-h-0 lg:overflow-y-auto lg:pr-2${workspaceScrolling ? ' is-scrolling' : ''}`}
              onScroll={handleWorkspaceScroll}
            >
              <StepSection
                num="01"
                title="Email Address"
                done={emailDone}
                open={activeStep === 'email'}
                onOpen={() => goStep('email')}
                summary={emailDone ? [formData.email.trim()] : []}
                hint="Enter the email address where your invoice and order notifications should be sent."
              >
                <CheckoutField
                  id="checkout-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  label="Email Address"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => markTouched('email')}
                  error={emailError}
                />
                <ContinueButton onClick={() => continueFrom('email')} />
              </StepSection>

              <StepSection
                num="02"
                title="Shipping Address"
                done={shippingDone}
                open={activeStep === 'shipping'}
                onOpen={() => goStep('shipping')}
                summary={shippingSummary}
              >
                <div className="space-y-2.5">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <CheckoutField
                      id="ship-name"
                      name="name"
                      label="Full Name"
                      required
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleChange}
                      onBlur={() => markTouched('ship.name')}
                      error={shipError('name')}
                    />
                    <CheckoutField
                      id="ship-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      label="Phone"
                      required
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      onBlur={() => markTouched('ship.phone')}
                      error={shipError('phone')}
                    />
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <CheckoutField
                      id="ship-flat"
                      name="shipFlatNo"
                      label="Flat / House No"
                      required
                      placeholder="e.g. 12-3-456"
                      value={deliveryAddress.flatNo}
                      onChange={(e) => changeDelivery('flatNo', e.target.value)}
                      onBlur={() => markTouched('ship.flatNo')}
                      error={shipError('flatNo')}
                    />
                    <CheckoutField
                      id="ship-street"
                      name="shipStreetNo"
                      label="Street / Road Name"
                      required
                      placeholder="e.g. Road No 12"
                      value={deliveryAddress.streetNo}
                      onChange={(e) => changeDelivery('streetNo', e.target.value)}
                      onBlur={() => markTouched('ship.streetNo')}
                      error={shipError('streetNo')}
                    />
                  </div>
                  <CheckoutField
                    id="ship-area"
                    name="shipArea"
                    label="Area / Locality"
                    required
                    placeholder="e.g. Kukatpally"
                    value={deliveryAddress.area}
                    onChange={(e) => changeDelivery('area', e.target.value)}
                    onBlur={() => markTouched('ship.area')}
                    error={shipError('area')}
                  />
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <CheckoutField
                      id="ship-city"
                      name="shipCity"
                      label="City"
                      required
                      autoComplete="address-level2"
                      value={deliveryAddress.city}
                      onChange={(e) => changeDelivery('city', e.target.value)}
                      onBlur={() => markTouched('ship.city')}
                      error={shipError('city')}
                    />
                    <CheckoutField
                      id="ship-state"
                      name="shipState"
                      label="State"
                      placeholder="e.g. Telangana"
                      value={deliveryAddress.state}
                      onChange={(e) => changeDelivery('state', e.target.value)}
                    />
                    <CheckoutField
                      id="ship-pincode"
                      name="shipPincode"
                      label="Pincode"
                      required
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={deliveryAddress.pincode}
                      onChange={(e) => changeDelivery('pincode', e.target.value)}
                      onBlur={() => markTouched('ship.pincode')}
                      error={shipError('pincode')}
                    />
                  </div>
                </div>
                <ContinueButton onClick={() => continueFrom('shipping')} />
              </StepSection>

              <StepSection
                num="03"
                title="Billing Address"
                done={billingDone}
                open={activeStep === 'billing'}
                onOpen={() => goStep('billing')}
                summary={billingSummary}
                headerAction={activeStep === 'billing' ? (
                  <label
                    className="inline-flex min-h-[36px] cursor-pointer select-none items-center gap-2 px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      background: sameAsShipping ? 'rgba(210, 166, 79, 0.14)' : 'var(--surface-sunken)',
                      border: `1px solid ${sameAsShipping ? 'rgba(190, 140, 54, 0.45)' : 'var(--hairline-strong)'}`,
                      borderRadius: 'var(--r-md)',
                      color: 'var(--text-body)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sameAsShipping}
                      onChange={(e) => handleSameAsShipping(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-primary-600"
                    />
                    Same as shipping address
                  </label>
                ) : undefined}
              >
                {sameAsShipping ? (
                  <div className="space-y-2.5">
                    <p
                      className="flex items-start gap-2.5 p-3 text-sm"
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-md)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={2.2}
                        style={{ color: 'var(--leaf-600)' }}
                        aria-hidden="true"
                      />
                      <span>Billing uses your shipping address — copied below. Uncheck to edit separately.</span>
                    </p>
                    <dl
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 p-3 text-sm"
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-md)',
                      }}
                      aria-label="Billing address copied from shipping"
                    >
                      <dt style={{ color: 'var(--text-subtle)' }}>Street</dt>
                      <dd className="min-w-0 break-words font-medium" style={{ color: 'var(--text-body)' }}>{formData.address || '—'}</dd>
                      <dt style={{ color: 'var(--text-subtle)' }}>City</dt>
                      <dd className="font-medium" style={{ color: 'var(--text-body)' }}>{formData.city || '—'}</dd>
                      <dt style={{ color: 'var(--text-subtle)' }}>Pincode</dt>
                      <dd className="tabular font-medium" style={{ color: 'var(--text-body)' }}>{formData.pincode || '—'}</dd>
                      <dt style={{ color: 'var(--text-subtle)' }}>Phone</dt>
                      <dd className="tabular font-medium" style={{ color: 'var(--text-body)' }}>{formData.phone || '—'}</dd>
                    </dl>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <CheckoutField
                        id="bill-name"
                        name="name"
                        label="Full Name"
                        required
                        autoComplete="name"
                        value={formData.name}
                        onChange={handleChange}
                        onBlur={() => markTouched('name')}
                        error={touched.name && !formData.name.trim() ? 'Full name is required.' : ''}
                      />
                      <CheckoutField
                        id="bill-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        label="Phone"
                        required
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        onBlur={() => markTouched('phone')}
                        error={touched.phone && !formData.phone.trim() ? 'Phone number is required.' : ''}
                      />
                    </div>
                    <CheckoutField
                      id="bill-address"
                      name="address"
                      label="Billing Address"
                      required
                      rows={2}
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={handleChange}
                      onBlur={() => markTouched('bill.address')}
                      error={billingError('address')}
                    />
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <CheckoutField
                        id="bill-city"
                        name="city"
                        label="City"
                        required
                        autoComplete="address-level2"
                        value={formData.city}
                        onChange={handleChange}
                        onBlur={() => markTouched('bill.city')}
                        error={billingError('city')}
                      />
                      <CheckoutField
                        id="bill-state"
                        name="state"
                        label="State"
                        placeholder="e.g. Telangana"
                        autoComplete="address-level1"
                        value={formData.state}
                        onChange={handleChange}
                      />
                      <CheckoutField
                        id="bill-pincode"
                        name="pincode"
                        label="Pincode"
                        required
                        inputMode="numeric"
                        autoComplete="postal-code"
                        value={formData.pincode}
                        onChange={handleChange}
                        onBlur={() => markTouched('bill.pincode')}
                        error={billingError('pincode')}
                      />
                    </div>
                  </div>
                )}
                <ContinueButton onClick={() => continueFrom('billing')} />
              </StepSection>

              <StepSection
                num="04"
                title="Delivery Location"
                done={Boolean(pin) || deliverySkipped}
                open={activeStep === 'delivery'}
                onOpen={() => goStep('delivery')}
                summary={deliverySummary}
                optional
                hint="Pin your exact delivery location to help our delivery team find your address."
              >
                {adminSettings.deliveryPinEnabled !== false && (
                  <DeliveryLocationPicker value={pin} onChange={(next) => { setPin(next); if (next) setDeliverySkipped(false); }} onResolved={applyResolvedAddress} />
                )}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <ContinueButton onClick={() => continueFrom('delivery')} />
                  <button
                    type="button"
                    onClick={skipDelivery}
                    className="btn-outline min-h-[44px] w-full text-sm sm:w-auto"
                  >
                    Skip for now
                  </button>
                </div>
              </StepSection>

              <StepSection
                num="05"
                title="Payment"
                done={false}
                open={activeStep === 'payment'}
                onOpen={() => goStep('payment')}
                summary={[PAYMENT_LABELS[paymentMethod]]}
              >
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
                  {['cod', 'upi'].map((method) => {
                    const selected = paymentMethod === method;
                    const Icon = method === 'cod' ? Banknote : Smartphone;
                    return (
                      <button
                        key={method}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPaymentMethod(method)}
                        className="flex min-h-[52px] items-center gap-2 px-3 py-2 text-left transition-colors"
                        style={{
                          background: selected ? 'rgba(195, 58, 20, 0.10)' : 'var(--surface-sunken)',
                          border: `1px solid ${selected ? 'var(--ember-600)' : 'var(--hairline-strong)'}`,
                          borderRadius: 'var(--r-md)',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                          style={{ border: `2px solid ${selected ? 'var(--ember-600)' : 'var(--text-subtle)'}` }}
                        >
                          {selected && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--ember-600)' }} />}
                        </span>
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} aria-hidden="true" />
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {PAYMENT_LABELS[method]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Pay on arrival — cash or UPI scan at your doorstep.
                </p>

                <p className="mt-2.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  Method selected — place your order from the summary on the right.
                </p>
              </StepSection>
            </div>

            {/* RIGHT — full-height summary panel. Header pinned top, product
                list scrolls in the middle, totals + CTA pinned bottom. */}
            <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
          {/* ---- Order summary panel ---- */}
          <motion.aside
            initial="hidden"
            animate="visible"
            variants={revealVariants(reduced, 12)}
            aria-label="Order summary"
            className="flex min-w-0 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: '10px' }}
          >
            <div className="shrink-0 px-4 pt-4">
            <button
              type="button"
              onClick={() => setSummaryOpen((open) => !open)}
              aria-expanded={summaryOpen}
              aria-controls="checkout-summary-body"
              className="flex w-full items-center justify-between gap-3 lg:cursor-default"
            >
              <span className="flex items-center gap-2.5">
                <span className="subsection-title" style={{ color: 'var(--text-strong)' }}>Order Summary</span>
                <span className="badge badge-gold tabular" aria-label={`${cart.length} items`}>
                  {cart.length}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="transition-transform lg:hidden"
                style={{ color: 'var(--gold-600)', transform: summaryOpen ? 'rotate(180deg)' : 'none' }}
              >
                <ChevronDown className="h-5 w-5" strokeWidth={2.4} />
              </span>
            </button>
            <hr className="rule-gold mt-2.5" />
            <p className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold" style={{ color: minimumMet ? 'var(--leaf-600)' : 'var(--text-strong)' }}>
              {minimumMet ? '✓ Free Shipping & COD unlocked' : `Add ${inr(adminSettings.minimumOrderValue - getCartTotal())} more for FREE SHIPPING & COD`}
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-1 overflow-hidden rounded-full"
              style={{ background: 'var(--surface-sunken)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, (getCartTotal() / adminSettings.minimumOrderValue) * 100)}%`, background: 'var(--grad-gold)' }}
              />
            </div>
            </div>

            <div id="checkout-summary-body" className={`${summaryOpen ? 'block' : 'hidden'} min-h-0 flex-col lg:flex lg:min-h-0 lg:flex-1`}>
              <ul
                className={`auto-scroll max-h-[200px] min-h-0 space-y-2 overflow-y-auto pl-4 pr-1 lg:max-h-none lg:flex-1${summaryScrolling ? ' is-scrolling' : ''}`}
                onScroll={handleSummaryScroll}
              >
                {cart.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 py-1 text-[13px]" style={{ borderBottom: '1px dashed var(--hairline)' }}>
                    <span className="min-w-0" style={{ color: 'var(--text-body)' }}>
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="tabular text-xs" style={{ color: 'var(--text-subtle)' }}>
                        Qty × {item.quantity} · {inr(unitPriceOf(item))} each
                      </span>
                    </span>
                    <span className="price tabular shrink-0 font-semibold" style={{ color: 'var(--text-body)' }}>
                      {inr(unitPriceOf(item) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 shrink-0 px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                  <span className="price tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                    {inr(getCartTotal())}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3">
                  <span className="label-caps">Total</span>
                  <span
                    className="price tabular text-2xl font-bold"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    {inr(getCartTotal())}
                  </span>
                </div>

                {adminSettings.minimumOrderValueEnabled && (
                  <div
                    className="mt-3 p-3 text-sm font-semibold"
                    style={{
                      borderRadius: 'var(--r-md)',
                      background: minimumMet ? 'rgba(44, 122, 83, 0.10)' : 'rgba(203, 42, 42, 0.10)',
                      border: `1px solid ${minimumMet ? 'rgba(44, 122, 83, 0.32)' : 'rgba(203, 42, 42, 0.32)'}`,
                      color: minimumMet ? 'var(--leaf-600)' : 'var(--crimson-600)',
                    }}
                  >
                    {minimumMet ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                        <span>Minimum order value met</span>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                          <span className="tabular">Minimum order value: ₹{adminSettings.minimumOrderValue}</span>
                        </div>
                        <div className="tabular text-xs font-normal">
                          Add ₹{adminSettings.minimumOrderValue - getCartTotal()} more to checkout
                        </div>
                        <Link to="/products" className="btn-primary mt-3 w-full">
                          <ShoppingBag className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                          Shop for More
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  style={{ minHeight: 50 }}
                  className="btn-primary btn-shine mt-3 w-full text-sm"
                >
                  {loading ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Placing Order...</span>
                    </>
                  ) : (
                    'Place Order'
                  )}
                </motion.button>

                <p className="mt-2 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                  You will review the full order before it is placed.
                </p>
              </div>
            </div>
          </motion.aside>
            </div>
          </form>
        </motion.div>

        {/* Confirm Order Modal */}
        <AnimatePresence>
          {showConfirm && (
            <ConfirmOrderModal
              cart={cart}
              formData={effectiveCustomer()}
              deliveryAddress={deliveryAddress}
              pin={pin}
              sameAsBilling={false}
              paymentMethod={paymentMethod}
              total={getCartTotal()}
              loading={loading}
              onClose={() => setShowConfirm(false)}
              onConfirm={confirmPlaceOrder}
              onAddMore={() => navigate('/products')}
              onQuantityChange={updateQuantity}
              onRemove={removeFromCart}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ---- Mobile sticky checkout bar ----
          The Place Order control lives in the payment step; this bar keeps it
          reachable while scrolling on small screens. It submits the same form
          (and therefore the same validation + review modal). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky lg:hidden">
        <div
          className="glass-nav border-t"
          style={{ borderColor: 'var(--hairline)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="shell flex items-center gap-3 py-3">
            <div className="min-w-0">
              <p className="label-caps">
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </p>
              <p
                className="price text-xl font-bold"
                style={{ color: 'var(--text-strong)' }}
              >
                {inr(total)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={loading}
              aria-busy={loading}
              className="btn-primary btn-shine ml-auto shrink-0 px-5"
            >
              {loading ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* One accordion section: a flat separator row when collapsed, a subtle
   10px container when expanded — never floating giant cards. Headers of
   finished sections reopen them with every value intact. The number badge
   doubles as the progress signal: gold check when done, ember ring when
   active, muted outline while pending. */
const StepSection = ({ num, title, optional, hint, done, open, onOpen, summary, headerAction, children }) => {
  const reduced = useReducedMotion();
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="flex w-full items-center gap-3 border-b px-1 py-3.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <span
          className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          aria-hidden="true"
          style={done ? {
            background: 'rgba(210, 166, 79, 0.16)',
            border: '1px solid rgba(190, 140, 54, 0.5)',
            color: 'var(--gold-600)',
          } : {
            background: 'transparent',
            border: '1px solid var(--hairline-strong)',
            color: 'var(--text-subtle)',
          }}
        >
          {done ? '✓' : num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold" style={{ color: done ? 'var(--text-strong)' : 'var(--text-muted)' }}>
            {title}
            {optional && <span className="ml-2 font-semibold" style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>Optional</span>}
          </span>
          {done && summary.length > 0 && (
            <span className="mt-0.5 block truncate text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {summary[0]}
            </span>
          )}
          {done && summary.slice(1).map((line) => (
            <span key={line} className="block truncate text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {line}
            </span>
          ))}
        </span>
        {done && (
          <span className="shrink-0 text-[13px] font-bold underline underline-offset-4" style={{ color: 'var(--ember-600)' }}>
            Edit
          </span>
        )}
      </button>
    );
  }
  return (
    <section
      className="min-w-0 overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: '10px' }}
      aria-labelledby={`step-${title}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            aria-hidden="true"
            style={{
              background: 'rgba(195, 58, 20, 0.12)',
              border: '1px solid var(--ember-600)',
              color: 'var(--ember-600)',
            }}
          >
            {num}
          </span>
          <h2 id={`step-${title}`} className="subsection-title" style={{ color: 'var(--text-strong)' }}>
            {title}
          </h2>
          {optional && (
            <span className="badge" style={{ color: 'var(--text-muted)' }}>
              Optional
            </span>
          )}
          {headerAction}
        </div>
        <hr className="rule-gold my-2.5" />
        {hint && !done && (
          <p className="mb-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key="open"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: reduced ? 0.001 : 0.22 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

/* Full-width step advance. Inside the form but type=button, so only the
   payment step's submit can place the order. */
const ContinueButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="btn-primary mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 text-sm sm:w-auto sm:px-8"
  >
    {children || (
      <>
        Continue
        <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
      </>
    )}
  </button>
);

export default Checkout;
