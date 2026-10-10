import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { collection, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  FilePlus2,
  LogOut,
  PauseCircle,
  Printer,
  Receipt,
  ShoppingBag,
  Smartphone,
} from 'lucide-react';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants } from '../lib/motion';
import BillPrintSheet from '../components/billing/BillPrintSheet';
import ProductPickerPanel from '../components/billing/ProductPickerPanel';
import BillLineRow from '../components/billing/BillLineRow';
import { REGISTER_PANEL } from '../components/billing/surfaces';
import { BRAND_NAME_UPPER } from '../lib/branding';
import { fetchTradePricingMap, mergeTradePricing } from '../lib/tradePricing';

const MAX_HELD_BILLS = 2;

const PAYMENT_MODES = [
  { mode: 'Cash', icon: Banknote },
  { mode: 'UPI', icon: Smartphone },
  { mode: 'Card', icon: CreditCard },
];

const unitPriceOf = (item) =>
  item.offlineDiscountPrice || item.offlineMRP || item.offlinePrice || item.onlinePrice || 0;

/* Small confirm dialog used for the two non-destructive guards (leave page,
   start new bill). Rendered through the fixed overlay so it cannot disturb
   the register layout. */
const ConfirmDialog = ({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) => (
  <div className="pos-overlay" role="presentation">
    <div
      className="pos-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pos-confirm-title"
      aria-describedby="pos-confirm-message"
    >
      <h2 id="pos-confirm-title" className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
        {title}
      </h2>
      <p id="pos-confirm-message" className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
        {message}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="pos-tool-btn">
          {cancelLabel || 'Cancel'}
        </button>
        <button type="button" onClick={onConfirm} className="pos-tool-btn is-accent">
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

const Billing = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [billItems, setBillItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [heldBills, setHeldBills] = useState([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  /* The Order ID the server minted for the bill just rung up, shown on the
     printed receipt so the counter, the customer and the admin all quote
     the same one. */
  const [savedOrderId, setSavedOrderId] = useState('');
  const printRef = useRef();
  const searchRef = useRef();
  const billSectionRef = useRef();
  const reduced = useReducedMotion();

  /* The register owns the viewport: no page scrollbars while it is mounted.
     Restored on unmount so storefront pages behave normally again. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // Counter pricing no longer rides along on the product document — it
      // lives in the staff-only `productPricing` collection. Both reads go out
      // together so the catalogue is never on screen without its trade prices:
      // falling back to the online retail price would charge the wrong amount
      // at the till.
      const [snapshot, pricingMap] = await Promise.all([
        getDocs(collection(db, 'products')),
        fetchTradePricingMap(),
      ]);
      const productsList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProducts(mergeTradePricing(productsList, pricingMap));
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const showAddToast = (message) => {
    toast.dismiss();
    toast.success(message, {
      id: `bill-add-${Date.now()}`,
      position: 'top-center',
      duration: 2000,
      style: {
        background: 'var(--leaf-600)',
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: '13px',
        padding: '6px 12px',
        borderRadius: '999px',
        maxWidth: '280px',
        boxShadow: 'var(--shadow-md)',
      },
    });
  };

  const addToBill = (product) => {
    const existingItem = billItems.find((item) => item.id === product.id);
    if (existingItem) {
      setBillItems(
        billItems.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        ),
      );
      showAddToast(`${product.name} +1`);
    } else {
      setBillItems([{ ...product, quantity: 1, addedAt: Date.now() }, ...billItems]);
      showAddToast(`${product.name} added`);
    }
  };

  const updateQuantity = (id, change) => {
    setBillItems(
      billItems
        .map((item) => {
          if (item.id === id) {
            const newQuantity = item.quantity + change;
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const setDirectQuantity = (id, value) => {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty < 1) return;

    setBillItems(billItems.map((item) => (item.id === id ? { ...item, quantity: qty } : item)));
  };

  const removeFromBill = (id) => {
    setBillItems(billItems.filter((item) => item.id !== id));
    toast.success('Item removed from bill');
  };

  const resetWorkspace = () => {
    setBillItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscountPercent(0);
    setPaymentMode('Cash');
  };

  /* ---- Hold / resume ---------------------------------------------------- */

  const holdBill = () => {
    if (billItems.length === 0) {
      toast.error('Nothing to hold — add items first');
      return;
    }
    if (heldBills.length >= MAX_HELD_BILLS) {
      toast.error(`Maximum ${MAX_HELD_BILLS} bills can be held.`);
      return;
    }
    const held = {
      id: Date.now(),
      items: billItems,
      customerName,
      customerPhone,
      discountPercent,
      paymentMode,
    };
    setHeldBills([...heldBills, held]);
    resetWorkspace();
    toast.success('Bill held — register cleared');
  };

  const resumeHeldBill = (heldId) => {
    const held = heldBills.find((b) => b.id === heldId);
    if (!held) return;
    setBillItems(held.items);
    setCustomerName(held.customerName);
    setCustomerPhone(held.customerPhone);
    setDiscountPercent(held.discountPercent);
    setPaymentMode(held.paymentMode);
    setHeldBills(heldBills.filter((b) => b.id !== heldId));
    setHeldOpen(false);
    toast.success('Held bill resumed');
  };

  /* ---- New bill / leave (both guarded) ----------------------------------- */

  const handleNewBill = () => {
    if (billItems.length > 0) {
      setConfirm({
        kind: 'new',
        title: 'Start a new bill?',
        message: 'Current bill contains items. Starting a new bill will discard them.',
        confirmLabel: 'Start New Bill',
      });
      return;
    }
    resetWorkspace();
    toast.success('New bill started');
  };

  const handleBack = () => {
    if (billItems.length > 0) {
      setConfirm({
        kind: 'back',
        title: 'Leave billing?',
        message: 'Current bill contains items. Returning to the previous page will not save them.',
        confirmLabel: 'Leave',
      });
      return;
    }
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const runConfirmed = () => {
    if (!confirm) return;
    if (confirm.kind === 'new') {
      resetWorkspace();
      toast.success('New bill started');
    } else if (confirm.kind === 'back') {
      if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
      } else {
        navigate('/');
      }
    } else if (confirm.kind === 'logout') {
      doLogout();
    }
    setConfirm(null);
  };

  const doLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Session already invalid — the guard redirects to login regardless.
    }
    navigate('/login', { replace: true });
  };

  const handleLogout = () => {
    if (billItems.length > 0) {
      setConfirm({
        kind: 'logout',
        title: 'Sign out of billing?',
        message: 'Current bill contains items. Signing out will discard them.',
        confirmLabel: 'Sign Out',
      });
      return;
    }
    doLogout();
  };

  /* ---- Totals ------------------------------------------------------------ */

  const calculateSubtotal = () =>
    billItems.reduce((total, item) => total + unitPriceOf(item) * item.quantity, 0);

  const getDiscountAmount = () => {
    const subtotal = calculateSubtotal();
    return Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return Math.max(0, subtotal - getDiscountAmount());
  };

  /* ---- Bill generation (existing backend path) --------------------------- */

  const handlePrint = () => {
    window.print();
  };

  const saveBill = async () => {
    if (saving) return; // guard against duplicate submissions
    if (billItems.length === 0) {
      toast.error('Add items to the bill first');
      return;
    }

    if (!customerName || !customerPhone) {
      toast.error('Please enter customer name and phone number');
      return;
    }

    setSaving(true);
    try {
      // Only ids and quantities travel to the server — every price, the
      // discount math and the totals are resolved server-side from the
      // productPricing/products collections, exactly like /api/orders.
      const user = auth.currentUser;
      const response = await fetch('/api/orders/pos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
        },
        body: JSON.stringify({
          customer: { name: customerName, phone: customerPhone },
          items: billItems.map((item) => ({ id: item.id, quantity: item.quantity })),
          discountPercent,
          paymentMode,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error || 'Could not save the bill. Please try again.');
        return;
      }

      /* The OFFLINE/STORE ORDER ID minted by the server off the independent
         offline counter (e.g. Ayyapa26-0001) — never the online sequence. The
         same ORDER ID is stored on the order, shown in history/details and
         printed on the invoice/receipt.

         flushSync is load-bearing. setSavedOrderId() alone only SCHEDULES a
         render, and handlePrint() below calls window.print() in this very same
         tick — the print snapshot was taken while the sheet still held the
         previous (empty) id, so BillPrintSheet dropped its ORDER ID row and
         every printed/PDF invoice came out with DATE and TIME but no order id.
         Flushing first puts the exact server-minted id into the DOM before the
         snapshot. The id is never regenerated here, only handed through. */
      flushSync(() => setSavedOrderId(result.shortCode || ''));

      toast.success(result.shortCode ? `Bill saved as ${result.shortCode}` : 'Bill saved successfully!');
      /* Save-as-PDF filename: browsers name the file after the document
         title, so stamp the offline ORDER ID into it before printing
         (e.g. Invoice_Ayyapa26-0001). Restored right after. */
      const prevTitle = document.title;
      if (result.shortCode) document.title = `Invoice_${result.shortCode}`;
      handlePrint();
      setTimeout(() => { document.title = prevTitle; }, 1000);
      /* Only after the print snapshot: clearing the register must never reach
         the sheet before it has been printed. */
      resetWorkspace();
    } catch (error) {
      console.error('Error saving bill:', error);
      toast.error('Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  /* ---- Live filtering (name / category / sku / barcode) ------------------ */

  const filteredProducts = products.filter((product) => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) return true;
    const nameMatch = (product.name || '').toLowerCase().includes(searchLower);
    const categoryMatch = Array.isArray(product.categories)
      ? product.categories.some((cat) => String(cat).toLowerCase().includes(searchLower))
      : String(product.category || '').toLowerCase().includes(searchLower);
    const codeMatch = (product.sku || product.code || '').toLowerCase().includes(searchLower);
    const barcodeMatch = (product.barcode || '').toLowerCase().includes(searchLower);
    return nameMatch || categoryMatch || codeMatch || barcodeMatch;
  });

  /* ---- Keyboard-first workflow ------------------------------------------- */

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const focusBill = useCallback(() => {
    billSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const newBillRef = useRef(handleNewBill);
  newBillRef.current = handleNewBill;
  const holdBillRef = useRef(holdBill);
  holdBillRef.current = holdBill;
  const saveBillRef = useRef(saveBill);
  saveBillRef.current = saveBill;

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const inSearch = document.activeElement === searchRef.current;

      // Esc closes whatever is open on top.
      if (event.key === 'Escape') {
        if (confirm) setConfirm(null);
        else if (heldOpen) setHeldOpen(false);
        else if (inSearch) searchRef.current?.blur();
        return;
      }

      // Ctrl/Cmd + Enter → Generate Bill (register-wide).
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveBillRef.current();
        return;
      }

      // Ctrl/Cmd + K or '/' → search, from anywhere.
      if (
        (event.key === '/' && !typing) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        focusSearch();
        return;
      }

      /* New bill (guarded when the bill already has items).

         Ctrl+N is reserved by Chrome/Edge/Firefox for "new browser window" and
         is handled ABOVE the page: the keydown still reaches us and runs the
         New Bill action, but no web page can cancel the browser's own response
         to it, so the window will still open. preventDefault() and
         stopPropagation() are both called because they suppress every
         page-level default (including Firefox's non-reserved builds and any
         in-page handler), but they cannot suppress the browser chrome action.

         Alt+N is bound to the identical handler so New Bill has a shortcut
         that is guaranteed not to collide with a reserved key. The button in
         the header and Ctrl+Enter-adjacent flows remain available too.
         event.code is matched alongside event.key so the shortcut survives
         non-QWERTY layouts. */
      const newBillCombo =
        (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyN';
      const newBillAltCombo = event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyN';
      if (newBillCombo || newBillAltCombo) {
        event.preventDefault();
        event.stopPropagation();
        newBillRef.current();
        return;
      }

      // Ctrl/Cmd + H → Hold bill.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        holdBillRef.current();
        return;
      }

      // Enter while the search field is focused quick-adds the first match.
      if (event.key === 'Enter' && inSearch && searchQuery.trim()) {
        if (filteredProducts.length > 0) {
          event.preventDefault();
          addToBill(filteredProducts[0]);
        }
        return;
      }

      if (typing || billItems.length === 0) return;

      // +/- step the most recently added line.
      if (event.key === '+') {
        event.preventDefault();
        updateQuantity(billItems[0].id, 1);
      } else if (event.key === '-') {
        event.preventDefault();
        updateQuantity(billItems[0].id, -1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, heldOpen, searchQuery, filteredProducts, billItems, saving]);

  const subtotal = calculateSubtotal();
  const discountAmount = getDiscountAmount();
  const grandTotal = calculateTotal();
  const itemCount = billItems.reduce((sum, item) => sum + item.quantity, 0);
  const canIssue = billItems.length > 0;
  const holdsFull = heldBills.length >= MAX_HELD_BILLS;
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  return (
    <div
      className="pos-root relative flex h-full min-h-0 flex-col overflow-hidden"
      style={{ background: 'var(--surface-page)' }}
    >
      <motion.div
        className="no-print pos-shell min-h-0 min-w-0 flex-1"
        initial="initial"
        animate="animate"
        variants={pageVariants(reduced)}
      >
        {/* ==================================================================
             TWO COLUMNS FROM THE VERY TOP OF THE VIEWPORT.

             pos-shell is the single grid that declares the split; everything
             below is placed inside it. There is no full-width navbar: the left
             column owns its own header (brand + billing actions) and the right
             column owns its own header (Items / Total). The divider is the
             grid's column boundary plus one border-right on the left column,
             so it runs unbroken from Y=0 to the bottom edge.
             ================================================================== */}

        {/* ---- LEFT COLUMN: header + products + status ---------------------- */}
        <div className="pos-col-left">
          {/* ---- LEFT HEADER ------------------------------------------------
              One compact POS toolbar, packed at the far left:
              [Back] [Brand] [Hold] [Held] [New Bill] [Sign Out] ...empty.

              justify-content:flex-start with fixed gaps — NOT space-between —
              so the actions sit immediately after the wordmark and the trailing
              space is left empty instead of the buttons drifting toward the
              Current Bill divider. The brand block has a fixed width so the
              buttons always start at the same X, and nothing here competes with
              the Products row below. */}
          <header
            className="pos-navbar pos-col-left-head pos-left-head left-header relative z-30 flex shrink-0 items-center border-b"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            {/* BACK → BRAND → BUTTONS. flex-start only, never space-between. */}
            <button
              type="button"
              onClick={handleBack}
              className="pos-tool-btn pos-back-btn back-button"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <div className="pos-brand-block brand-block">
              <div className="pos-brand-text">
                <p
                  className="brand-name text-[0.75rem] font-bold uppercase leading-tight"
                  style={{ color: 'var(--text-strong)' }}
                >
                  {BRAND_NAME_UPPER}
                </p>
                <p className="counter text-[0.5625rem] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                  Counter · {todayLabel}
                </p>
              </div>
            </div>

            {/* Actions begin directly after the brand block and occupy only the
                width they need. The popover lives in here because this wrapper
                is its positioning context. */}
            <div className="pos-header-actions header-actions relative flex items-center">
            <button
              type="button"
              onClick={holdBill}
              disabled={holdsFull}
              title={holdsFull ? `Maximum ${MAX_HELD_BILLS} bills can be held. (Ctrl+H)` : 'Hold bill (Ctrl+H)'}
              aria-label="Hold current bill"
              className="pos-tool-btn"
            >
              <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Hold</span>
            </button>

            <button
              type="button"
              onClick={() => setHeldOpen((open) => !open)}
              aria-expanded={heldOpen}
              aria-label="Held bills"
              className={`pos-tool-btn ${heldOpen ? 'is-active' : ''}`}
            >
              <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Held</span>
              <span className="tabular">{heldBills.length}/{MAX_HELD_BILLS}</span>
            </button>

            <button
              type="button"
              onClick={handleNewBill}
              className="pos-tool-btn"
              aria-label="Start a new bill"
              title="New bill (Alt+N)"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Bill</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="pos-tool-btn shrink-0"
              aria-label="Sign out of billing"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>

            {/* Held bills popover */}
            <AnimatePresence>
              {heldOpen && (
                <motion.div
                  className="pos-popover"
                  initial={{ opacity: 0, y: reduced ? 0 : -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -4 }}
                  transition={{ duration: reduced ? 0.001 : 0.15 }}
                >
                  <div
                    className="flex items-center justify-between border-b px-4 py-2.5"
                    style={{ borderColor: 'var(--hairline)' }}
                  >
                    <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>Held bills</h3>
                    <span className="tabular text-[0.6875rem] font-bold" style={{ color: 'var(--text-muted)' }}>
                      {heldBills.length} / {MAX_HELD_BILLS} held
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto p-2">
                    {heldBills.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                        No held bills
                      </p>
                    ) : (
                      heldBills.map((held, index) => {
                        const heldTotal = held.items.reduce(
                          (sum, item) => sum + unitPriceOf(item) * item.quantity,
                          0,
                        );
                        const heldQty = held.items.reduce((sum, item) => sum + item.quantity, 0);
                        return (
                          <div
                            key={held.id}
                            className="mb-1.5 flex items-center gap-3 rounded-[8px] px-3 py-2.5"
                            style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold" style={{ color: 'var(--text-strong)' }}>
                                Held #{String(index + 1).padStart(2, '0')}
                                {held.customerName ? ` · ${held.customerName}` : ''}
                              </p>
                              <p className="tabular mt-0.5 text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>
                                {heldQty} item{heldQty === 1 ? '' : 's'} · ₹
                                {heldTotal.toFixed(2)} · {new Date(held.id).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => resumeHeldBill(held.id)}
                              className="pos-tool-btn is-accent shrink-0"
                            >
                              Resume
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {holdsFull && (
                    <p
                      className="border-t px-4 py-2 text-[0.6875rem] font-semibold"
                      style={{ borderColor: 'var(--hairline)', color: 'var(--ember-400)' }}
                    >
                      Maximum {MAX_HELD_BILLS} bills can be held.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Flexible space: keeps BACK→BRAND→BUTTONS pinned left while the
              Items/Total summary below stays at the far right of the LEFT
              column only. Never overlaps Current Bill — header has
              overflow:hidden and lives inside .pos-col-left. */}
          <div className="min-w-0 flex-1" aria-hidden="true" />

          {/* Items / Total — far right of LEFT navbar, still inside left column. */}
          <div className="pos-nav-summary" aria-live="polite" aria-label="Current bill summary">
            <span className="pos-nav-chip tabular">
              Items {itemCount}
            </span>
            <span className="pos-nav-chip pos-nav-total tabular price">
              Total ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </header>

        {/* Product area — the rest of the left column, directly under its header. */}
          <div className="pos-col-left-body flex min-h-0 min-w-0 flex-1 flex-col p-2 pt-0 md:p-3">
            <div className="flex h-full min-h-0 flex-col max-md:min-h-[70vh]">
              <ProductPickerPanel
                products={filteredProducts}
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchInputRef={searchRef}
                onAdd={addToBill}
                reduced={reduced}
                totalCount={products.length}
              />
            </div>
          </div>

          {/* ---- Status bar: the last cell of the LEFT column ------------------ */}
          <footer
            className="pos-col-left-foot hidden h-[26px] shrink-0 items-center justify-between gap-4 border-t px-4 md:flex"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <p className="tabular flex min-w-0 items-center gap-2 text-[0.6875rem] font-medium" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--leaf-600)' }} aria-hidden="true" />
              <span className="truncate">
                Ready · {loading ? '…' : `${products.length} products`}
              </span>
            </p>
            <p className="hidden shrink-0 items-center gap-3 text-[0.6875rem] font-semibold lg:flex" style={{ color: 'var(--text-subtle)' }} aria-label="Keyboard shortcuts">
              <span><kbd className="font-bold">Ctrl+K</kbd> Search</span>
              <span><kbd className="font-bold">Alt N</kbd> New Bill</span>
              <span><kbd className="font-bold">Ctrl+H</kbd> Hold</span>
              <span><kbd className="font-bold">Ctrl+Enter</kbd> Generate</span>
            </p>
          </footer>
        </div>

        {/* ---- RIGHT PANEL ----------------------------------------------------
             A cell in grid column 2, so it starts at Y=0 — level with the left
             header, not below it.

             There is deliberately NO separate bar above the Current Bill: the
             live count and total live inside the Current Bill header itself
             (the "N Items" chip) and in its pinned summary at the bottom, so
             nothing is stranded above the panel it describes. */}
          <motion.section
            ref={billSectionRef}
            aria-labelledby="bill-heading"
            initial="hidden"
            animate="visible"
            variants={pageVariants(reduced)}
            className={`pos-col-right flex min-h-0 w-full flex-col overflow-hidden p-2 pt-2 md:p-3 md:pl-3 ${canIssue ? 'pb-24 md:pb-0' : ''}`}
          >
            <div className="flex h-full min-h-0 flex-col max-md:min-h-[80vh]" style={REGISTER_PANEL}>
              {/* Bill header: identity, live item count and — as the wireframe
                  asks — the two customer fields immediately beneath it. */}
              <div
                className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <div className="min-w-0">
                  <h2
                    id="bill-heading"
                    className="text-[0.8125rem] font-extrabold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    Current Bill
                  </h2>
                  <p className="tabular mt-0.5 text-[0.6875rem] font-medium" style={{ color: 'var(--text-muted)' }}>
                    New bill · Counter
                  </p>
                </div>
                <span
                  className="tabular shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold"
                  style={{
                    background: canIssue ? 'rgba(232, 90, 36, 0.12)' : 'var(--surface-sunken)',
                    border: `1px solid ${canIssue ? 'rgba(232, 90, 36, 0.35)' : 'var(--hairline)'}`,
                    color: canIssue ? '#F5B08C' : 'var(--text-muted)',
                  }}
                >
                  {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                </span>
              </div>

              {/* Customer — compact, optional until billing */}
              <div
                className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-2"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
              >
                <div className="min-w-0">
                  <label htmlFor="customer-name" className="mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                    Name
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    placeholder="Full name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="input-premium h-9 text-sm"
                    autoComplete="off"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="customer-phone" className="mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                    Phone
                  </label>
                  <input
                    id="customer-phone"
                    type="tel"
                    placeholder="Mobile number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="input-premium tabular h-9 text-sm"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Line items — the only scrollable area of the bill panel */}
              <div className="pos-pane flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-1 md:flex-1">
                {billItems.length === 0 ? (
                  <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-1.5 py-4 text-center">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
                    >
                      <ShoppingBag
                        className="h-5 w-5"
                        style={{ color: 'var(--text-subtle)' }}
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                    </span>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                      Your bill is empty
                    </p>
                    <p className="max-w-[16rem] text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      Add products from the catalogue to start billing.
                    </p>
                    <button type="button" onClick={focusSearch} className="pos-tool-btn mt-1">
                      Browse Products
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="pt-2 text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-subtle)' }}>
                      Items
                    </p>
                    <AnimatePresence initial={false}>
                      {billItems.map((item, index) => (
                        <BillLineRow
                          key={item.id}
                          item={item}
                          index={index}
                          onStep={updateQuantity}
                          onSetQuantity={setDirectQuantity}
                          onRemove={removeFromBill}
                          reduced={reduced}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Summary — pinned, never scrolls away */}
              <div className="shrink-0 border-t px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--text-body)' }}>
                    Subtotal
                  </span>
                  <span className="tabular price text-[0.8125rem] font-bold" style={{ color: 'var(--text-strong)' }}>
                    ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="discount-percent"
                    className="text-[0.8125rem] font-semibold"
                    style={{ color: 'var(--text-body)' }}
                  >
                    Discount
                  </label>
                  <div className="flex items-center gap-2">
                    {discountPercent > 0 && (
                      <span className="tabular text-[0.8125rem] font-bold" style={{ color: 'var(--leaf-600)' }}>
                        -₹{discountAmount.toFixed(2)}
                      </span>
                    )}
                    <div className="relative">
                      <input
                        id="discount-percent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={discountPercent}
                        onChange={(e) =>
                          setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                        }
                        placeholder="0"
                        className="input-premium tabular h-8 w-[4.5rem] pr-7 text-right text-[0.8125rem] font-bold"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-2.5 flex items-center justify-between gap-4 border-t pt-2.5"
                  style={{ borderColor: 'var(--hairline-strong)' }}
                >
                  <span className="text-[0.8125rem] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--text-strong)' }}>
                    Total
                  </span>
                  <span
                    className="tabular price font-extrabold"
                    style={{ color: 'var(--ember-500)', fontSize: '1.875rem', lineHeight: 1.1 }}
                  >
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Payment */}
              <div className="shrink-0 border-t px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
                <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
                  Payment
                </p>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment mode">
                  {PAYMENT_MODES.map(({ mode, icon: Icon }) => {
                    const active = paymentMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setPaymentMode(mode)}
                        className={`pos-pay-btn ${active ? 'is-active' : ''}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0 border-t px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
                <button
                  type="button"
                  onClick={saveBill}
                  disabled={!canIssue || saving}
                  className="pos-generate-btn"
                  title="Generate bill (Ctrl+Enter)"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Saving…' : 'Generate Bill'}
                </button>
              </div>
            </div>
          </motion.section>

        {/* ---- Mobile sticky cart bar ------------------------------------------ */}
        {canIssue && (
          <div
            className="absolute inset-x-0 bottom-0 z-30 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 md:hidden"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="tabular text-[0.6875rem] font-bold" style={{ color: 'var(--text-muted)' }}>
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </p>
                <p className="tabular price truncate text-base font-extrabold" style={{ color: 'var(--text-strong)' }}>
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <button type="button" onClick={focusBill} className="pos-generate-btn" style={{ width: 'auto', paddingInline: '1.25rem', minHeight: '2.75rem' }}>
                <Receipt className="h-4 w-4" aria-hidden="true" />
                View Bill
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel="Cancel"
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Print invoice lives in a body-level portal, OUTSIDE the
          viewport-locked POS shell: the shell's fixed height and
          overflow:hidden (plus absolute positioning) is what clipped
          multi-page bills. The portal child flows naturally across pages. */}
      {createPortal(
        <div className="bill-print-root">
          <BillPrintSheet
            ref={printRef}
            customerName={customerName}
            customerPhone={customerPhone}
            paymentMode={paymentMode}
            items={billItems}
            subtotal={subtotal}
            discountPercent={discountPercent}
            discountAmount={discountAmount}
            total={grandTotal}
            orderId={savedOrderId}
          />
        </div>,
        document.body
      )}

      <style>{`
        .bill-print-sheet { display: none; }

        @media print {
          /* Zero page margin is what removes Chrome's own print header/footer —
             the URL / "localhost:5002", browser date & time, page numbers and the
             document title are drawn inside the page MARGIN BOX, and with no
             margin box there is nowhere to draw them. The printable margin the
             invoice needs is padding on .bps-body in
             components/billing/BillPrintSheet.css instead. */
          @page { size: A4 portrait; margin: 0; }

          body { margin: 0; }

          /* Isolate the portal: everything else leaves the layout entirely
             (display:none, not visibility), so no app shell, toast or overlay
             can reserve space, clip content or emit blank pages. The invoice
             is a direct body child in normal flow, which is what lets it
             fragment across physical pages. */
          body > *:not(.bill-print-root) { display: none !important; }

          .bill-print-root {
            display: block !important;
          }

          .bill-print-sheet {
            display: block !important;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default Billing;