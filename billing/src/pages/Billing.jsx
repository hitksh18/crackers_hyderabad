import { useState, useEffect, useRef, useCallback } from 'react';
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
  MessageCircle,
  PauseCircle,
  Printer,
  Receipt,
  Search,
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
import { fetchTradePricingMap, mergeTradePricing } from '../lib/tradePricing';

const MAX_HELD_BILLS = 2;

const PAYMENT_MODES = [
  { mode: 'Cash', icon: Banknote },
  { mode: 'UPI', icon: Smartphone },
  { mode: 'Card', icon: CreditCard },
];

const LOGO_URL = '/crackerhyderabadlogo.png';

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

      toast.success('Bill saved successfully!');
      handlePrint();
      resetWorkspace();
    } catch (error) {
      console.error('Error saving bill:', error);
      toast.error('Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const sendToWhatsApp = () => {
    if (billItems.length === 0) {
      toast.error('Add items to the bill first');
      return;
    }

    if (!customerName || !customerPhone) {
      toast.error('Please enter customer name and phone number');
      return;
    }

    const itemsList = billItems
      .map((item, index) => {
        const price = unitPriceOf(item);
        const total = price * item.quantity;
        return `${index + 1}. ${item.name} - Qty: ${item.quantity} - ₹${price} = ₹${total}`;
      })
      .join('\n');

    const message = `*Crackers Hyderabad - Invoice*

*CUSTOMER DETAILS:*
Name: ${customerName}
Phone: ${customerPhone}
Payment Mode: ${paymentMode}

*ORDER ITEMS:*
${itemsList}

*BILL SUMMARY:*
Subtotal: ₹${calculateSubtotal().toFixed(2)}
${getDiscountAmount() > 0 ? `Discount (${discountPercent}%): -₹${getDiscountAmount().toFixed(2)}\n` : ''}Grand Total: ₹${calculateTotal().toFixed(2)}

Date: ${new Date().toLocaleDateString()}
Time: ${new Date().toLocaleTimeString()}

Thank you for shopping with us! Have a safe and happy celebration!`;

    const encodedMessage = encodeURIComponent(message);

    const formattedCustomerPhone = customerPhone.startsWith('+')
      ? customerPhone.replace(/[^0-9]/g, '')
      : '91' + customerPhone.replace(/[^0-9]/g, '');

    const whatsappURL = `https://wa.me/${formattedCustomerPhone}?text=${encodedMessage}`;

    window.open(whatsappURL, '_blank');
    toast.success('Opening WhatsApp to send invoice to customer...');
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
  const whatsappRef = useRef(sendToWhatsApp);
  whatsappRef.current = sendToWhatsApp;

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

      // Ctrl/Cmd + N → New bill (guarded when the bill has items).
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newBillRef.current();
        return;
      }

      // Ctrl/Cmd + H → Hold bill.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        holdBillRef.current();
        return;
      }

      // Ctrl/Cmd + Shift + W (or Alt + W) → WhatsApp bill.
      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'w') ||
        (event.altKey && event.key.toLowerCase() === 'w')
      ) {
        event.preventDefault();
        whatsappRef.current();
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
        className="no-print flex min-h-0 flex-1 flex-col"
        initial="initial"
        animate="animate"
        variants={pageVariants(reduced)}
      >
        {/* ---- Top bar ------------------------------------------------------ */}
        <header
          className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 lg:gap-3 lg:px-4"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
        >
          {/* Brand */}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="pos-tool-btn shrink-0"
              style={{ paddingInline: '0.5rem' }}
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <img
              src={LOGO_URL}
              alt="Crackers Hyderabad"
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              draggable={false}
            />
            <div className="hidden min-w-0 sm:block" style={{ maxWidth: '11rem' }}>
              <p className="truncate text-[0.8125rem] font-bold leading-tight" style={{ color: 'var(--text-strong)' }}>
                Crackers Hyderabad
              </p>
              <p className="truncate text-[0.625rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                Counter · {todayLabel}
              </p>
            </div>
          </div>

          {/* Search — the most important element in the header */}
          <div className="relative min-w-0 flex-1" style={{ maxWidth: '38rem' }}>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-subtle)' }}
              aria-hidden="true"
            />
            <label htmlFor="pos-global-search" className="sr-only">
              Search products by name, category or barcode
            </label>
            <input
              id="pos-global-search"
              ref={searchRef}
              type="text"
              placeholder="Search products by name, category or barcode…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pos-search-input input-premium h-10 w-full pl-9 pr-16 text-sm"
              autoComplete="off"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex" aria-hidden="true">
              <kbd
                className="flex h-5 items-center rounded border border-[color:var(--hairline-strong)] px-1.5 text-[0.625rem] font-bold"
                style={{ color: 'var(--text-subtle)', background: 'var(--surface-raised)' }}
              >
                /
              </kbd>
              <kbd
                className="flex h-5 items-center rounded border border-[color:var(--hairline-strong)] px-1.5 text-[0.625rem] font-bold"
                style={{ color: 'var(--text-subtle)', background: 'var(--surface-raised)' }}
              >
                Ctrl K
              </kbd>
            </span>
          </div>

          {/* Actions + live stats */}
          <div className="relative ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={holdBill}
              disabled={holdsFull}
              title={holdsFull ? `Maximum ${MAX_HELD_BILLS} bills can be held. (Ctrl+H)` : 'Hold bill (Ctrl+H)'}
              aria-label="Hold current bill"
              className="pos-tool-btn"
            >
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Hold</span>
            </button>

            <button
              type="button"
              onClick={() => setHeldOpen((open) => !open)}
              aria-expanded={heldOpen}
              aria-label="Held bills"
              className={`pos-tool-btn ${heldOpen ? 'is-active' : ''}`}
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Held</span>
              <span className="tabular">{heldBills.length}/{MAX_HELD_BILLS}</span>
            </button>

            <button type="button" onClick={handleNewBill} className="pos-tool-btn" aria-label="Start a new bill" title="New bill (Ctrl+N)">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">New Bill</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="pos-tool-btn shrink-0"
              aria-label="Sign out of billing"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Sign Out</span>
            </button>

            <dl
              className="hidden items-center gap-3 px-3 py-1 lg:flex"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--hairline)',
                borderRadius: '8px',
              }}
            >
              <div>
                <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>Items</dt>
                <dd className="tabular text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                  {itemCount}
                </dd>
              </div>
              <div className="border-l pl-3" style={{ borderColor: 'var(--hairline)' }}>
                <dt className="text-[0.625rem] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>Total</dt>
                <dd className="tabular price text-sm font-bold" style={{ color: 'var(--ember-400)' }}>
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>

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
        </header>

        {/* ---- Workspace: products 68% / bill 32% (desktop) ------------------ */}
        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden ${canIssue ? 'pb-24 md:pb-0' : ''}`}>
          {/* Product area */}
          <div className="w-full shrink-0 p-2 md:h-full md:w-[60%] md:shrink md:p-3 lg:w-[68%]">
            <div className="flex h-full flex-col max-md:min-h-[70vh]">
              <ProductPickerPanel
                products={filteredProducts}
                loading={loading}
                searchQuery={searchQuery}
                onAdd={addToBill}
                reduced={reduced}
                totalCount={products.length}
              />
            </div>
          </div>

          {/* Current bill */}
          <motion.section
            ref={billSectionRef}
            aria-labelledby="bill-heading"
            initial="hidden"
            animate="visible"
            variants={pageVariants(reduced)}
            className="flex w-full shrink-0 scroll-mt-2 flex-col p-2 pt-0 md:h-full md:w-[40%] md:overflow-hidden md:p-3 md:pl-0 lg:w-[32%]"
          >
            <div className="flex h-full min-h-0 flex-col max-md:min-h-[80vh]" style={REGISTER_PANEL}>
              <div
                className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
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
                className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-2.5"
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
              <div className="pos-pane min-h-0 flex-1 overflow-y-auto px-4 py-1 md:flex-1">
                {billItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
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
                    <button type="button" onClick={focusSearch} className="pos-tool-btn mt-2">
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
              <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: 'var(--hairline)' }}>
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
              <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: 'var(--hairline)' }}>
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
                <button
                  type="button"
                  onClick={sendToWhatsApp}
                  disabled={!canIssue}
                  className="pos-tool-btn mt-2 w-full"
                  title="WhatsApp bill (Ctrl+Shift+W)"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  WhatsApp Customer
                </button>
              </div>
            </div>
          </motion.section>
        </div>

        {/* ---- Status bar ----------------------------------------------------- */}
        <footer
          className="hidden h-8 shrink-0 items-center justify-between gap-4 border-t px-4 md:flex"
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
            <span><kbd className="font-bold">Ctrl+N</kbd> New Bill</span>
            <span><kbd className="font-bold">Ctrl+H</kbd> Hold</span>
            <span><kbd className="font-bold">Ctrl+Enter</kbd> Generate</span>
          </p>
        </footer>

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
      />

      <style>{`
        .bill-print-sheet { display: none; }

        @media print {
          @page { margin: 12mm; }

          body * { visibility: hidden !important; }

          /* 100vh resolves against the page box in paged media — without this the
             screen shell emits a blank sheet ahead of the invoice. */
          .pos-root { min-height: 0 !important; height: auto !important; overflow: visible !important; }

          .bill-print-sheet {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          .bill-print-sheet,
          .bill-print-sheet * { visibility: visible !important; }
        }
      `}</style>
    </div>
  );
};

export default Billing;
