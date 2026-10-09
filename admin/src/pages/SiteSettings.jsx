/**
 * Site Settings — system-level configuration that does not belong in the
 * homepage Canvas.
 *
 * ORDER ID SETTINGS (two independent systems):
 *   1. ONLINE ORDERS — prefix + next sequence for the human-facing shortCode.
 *      Saved through PUT /api/admin/order-id (same endpoint + validation as
 *      Settings → Orders → Order ID); affects NEW online orders only.
 *      Firestore document ids are never touched. NEVER touched by offline.
 *   2. OFFLINE / STORE ORDERS — prefix + year + separator + padding + next.
 *      Saved through PUT /api/admin/offline-order-id; affects NEW offline
 *      (POS/counter) orders only. Own counter (counters/offlineOrders), own
 *      config doc (adminSettings/offlineOrderId). Existing orders keep IDs.
 *   3. Store contact — the WhatsApp number behind the floating storefront
 *      button (footerSettings/main.whatsapp).
 *   4. Server status — API reachability + mail health, read-only.
 *
 * Order reset lives on the Orders page (order management), not here — except
 * the OFFLINE counter reset, which lives in the offline card below.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Hash, MessageCircle, Save, Activity, Store, RotateCcw } from 'lucide-react';
import AdminHeader from '../components/admin/AdminHeader';
import { db } from '../firebase';
import { authFetch, readApiError, apiUrl } from '../utils/apiClient';
import toast from '../utils/toast';
import {
  normalizePrefixInput,
  renderOrderId,
  validateOrderIdConfig,
} from '../lib/orderIdFormat';
import {
  OFFLINE_DEFAULTS,
  OFFLINE_LIMITS,
  renderOfflineOrderId,
  validateOfflineOrderIdConfig,
  padOfflineNumber,
} from '../lib/offlineOrderIdFormat';

/* The one and only order-id shape: PREFIX-0001. The format string and the
   four-digit width are fixed here, never typed — the admin customises exactly
   two things: the prefix and the next number. */
const ORDER_ID_FORMAT = '{PREFIX}-{SEQUENCE}';
const ORDER_ID_SEQUENCE_LENGTH = 4;
const ORDER_NUMBER_MAX = 9999;

const padOrderNumber = (n) => String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(4, '0');

const cardStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
};
const inputStyle = {
  borderColor: 'var(--hairline)',
  color: 'var(--text-strong)',
  background: 'var(--surface-sunken)',
};

const SiteSettings = () => {
  /* ---------- ONLINE order id (unchanged behaviour) ---------- */
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [savedPrefix, setSavedPrefix] = useState('CHYD26');
  const [savedNextSequence, setSavedNextSequence] = useState(1);
  const [prefix, setPrefix] = useState('CHYD26');
  const [nextSequence, setNextSequence] = useState('1');
  const [highestUsedSequence, setHighestUsedSequence] = useState(0);

  /* ---------- OFFLINE / STORE order id (independent system) ---------- */
  const [offLoading, setOffLoading] = useState(true);
  const [offError, setOffError] = useState(null);
  const [offSaving, setOffSaving] = useState(false);
  const [offSaved, setOffSaved] = useState({ ...OFFLINE_DEFAULTS });
  const [offPrefix, setOffPrefix] = useState(OFFLINE_DEFAULTS.prefix);
  const [offYear, setOffYear] = useState(OFFLINE_DEFAULTS.year);
  const [offSeparator, setOffSeparator] = useState(OFFLINE_DEFAULTS.separator);
  const [offPadding, setOffPadding] = useState(String(OFFLINE_DEFAULTS.padding));
  const [offNext, setOffNext] = useState('0001');
  const [offHighest, setOffHighest] = useState(0);
  const [offResetOpen, setOffResetOpen] = useState(false);
  const [offResetValue, setOffResetValue] = useState('0001');
  const [offResetting, setOffResetting] = useState(false);

  /* ---------- store contact ---------- */
  const [contactLoading, setContactLoading] = useState(true);
  const [contactSaving, setContactSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [savedWhatsapp, setSavedWhatsapp] = useState('');

  /* ---------- server status ---------- */
  const [serverStatus, setServerStatus] = useState(null);

  const loadOrderId = useCallback(async () => {
    setOrderLoading(true);
    setOrderError(null);
    try {
      const response = await authFetch('/api/admin/order-id');
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load Order ID settings'));
      const data = await response.json();
      setSavedPrefix(data.config.prefix);
      setSavedNextSequence(data.config.nextSequence);
      setPrefix(data.config.prefix);
      setNextSequence(padOrderNumber(data.config.nextSequence));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
    } catch (error) {
      console.error('[site-settings] order id load failed:', error);
      setOrderError(error.message || 'Failed to load Order ID settings');
    } finally {
      setOrderLoading(false);
    }
  }, []);

  const loadOfflineOrderId = useCallback(async () => {
    setOffLoading(true);
    setOffError(null);
    try {
      const response = await authFetch('/api/admin/offline-order-id');
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load offline Order ID settings'));
      const data = await response.json();
      const cfg = data.config || {};
      setOffSaved({
        prefix: cfg.prefix ?? OFFLINE_DEFAULTS.prefix,
        year: cfg.year ?? OFFLINE_DEFAULTS.year,
        separator: cfg.separator ?? OFFLINE_DEFAULTS.separator,
        padding: Number(cfg.padding ?? OFFLINE_DEFAULTS.padding),
        nextNumber: Number(cfg.nextNumber ?? 1),
      });
      setOffPrefix(cfg.prefix ?? OFFLINE_DEFAULTS.prefix);
      setOffYear(cfg.year ?? OFFLINE_DEFAULTS.year);
      setOffSeparator(cfg.separator ?? OFFLINE_DEFAULTS.separator);
      setOffPadding(String(cfg.padding ?? OFFLINE_DEFAULTS.padding));
      setOffNext(padOfflineNumber(cfg.nextNumber ?? 1, Number(cfg.padding ?? OFFLINE_DEFAULTS.padding)));
      setOffHighest(Number(data.highestUsedSequence) || 0);
    } catch (error) {
      console.error('[site-settings] offline order id load failed:', error);
      setOffError(error.message || 'Failed to load offline Order ID settings');
    } finally {
      setOffLoading(false);
    }
  }, []);

  const loadContact = useCallback(async () => {
    setContactLoading(true);
    try {
      const snap = await getDoc(doc(db, 'footerSettings', 'main'));
      const value = snap.exists() ? String(snap.data()?.whatsapp || '') : '';
      setWhatsapp(value);
      setSavedWhatsapp(value);
    } catch (error) {
      console.error('[site-settings] contact load failed:', error);
      toast.error('Could not load the store contact number');
    } finally {
      setContactLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrderId();
    loadOfflineOrderId();
    loadContact();
    /* Server + mail health for the status card. Failures stay local to the
       card — they never block the settings themselves. The health probe uses
       a plain fetch (the endpoint is public) so a signed-out session can
       never masquerade as an offline server. */
    (async () => {
      const status = { api: false, mail: null };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const health = await fetch(apiUrl('/api/health'), { signal: controller.signal });
        status.api = health.ok;
      } catch {
        status.api = false;
      } finally {
        clearTimeout(timeout);
      }
      try {
        const response = await authFetch('/api/admin/email-automation');
        if (response.ok) {
          const data = await response.json();
          status.mail = data.emailStatus || null;
        }
      } catch {
        status.mail = null;
      }
      setServerStatus(status);
    })();
  }, [loadOrderId, loadOfflineOrderId, loadContact]);

  const draft = useMemo(
    () => ({
      format: ORDER_ID_FORMAT,
      prefix,
      sequenceLength: ORDER_ID_SEQUENCE_LENGTH,
      nextSequence: Number.parseInt(nextSequence, 10),
    }),
    [prefix, nextSequence]
  );

  const validation = useMemo(
    () => validateOrderIdConfig(draft, { highestUsedSequence }),
    [draft, highestUsedSequence]
  );

  /* Strictly alphanumeric, 1-20 chars, no spaces — the separator dash is
     added by the generator, never typed into the prefix. */
  const prefixError =
    !prefix.trim()
      ? 'Order ID prefix is required.'
      : !/^[A-Z0-9]{1,20}$/.test(prefix)
        ? 'Prefix must be 1–20 letters/numbers, no spaces.'
        : null;

  const nextInt = Number.parseInt(nextSequence, 10);
  const nextValid = /^\d{1,5}$/.test(nextSequence.trim()) && Number.isInteger(nextInt);
  const nextError =
    !nextValid || nextInt < 1
      ? 'Next order number must be a whole number of at least 1.'
      : nextInt > ORDER_NUMBER_MAX
        ? `Next order number must be ${ORDER_NUMBER_MAX} or less — the range is 0001 to 9999.`
        : nextInt <= highestUsedSequence
          ? 'Next order number must be greater than the highest existing sequence.'
          : null;

  const previewSequence = !nextError ? nextInt : null;
  const preview = useMemo(
    () => previewSequence === null
      ? `${normalizePrefixInput(prefix) || '—'}-____`
      : renderOrderId({ ...draft, prefix: normalizePrefixInput(prefix) }, { sequence: previewSequence }),
    [draft, prefix, previewSequence]
  );
  const previewAfter = (offset) =>
    renderOrderId({ ...draft, prefix: normalizePrefixInput(prefix) }, { sequence: previewSequence + offset });

  const orderChanged =
    normalizePrefixInput(prefix) !== normalizePrefixInput(savedPrefix) ||
    String(Number.parseInt(nextSequence, 10) || '') !== String(savedNextSequence);

  const canSave = !prefixError && !nextError && validation.ok && !orderSaving && orderChanged;

  const saveOrderId = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setOrderSaving(true);
    try {
      const response = await authFetch('/api/admin/order-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: ORDER_ID_FORMAT,
          prefix: normalizePrefixInput(prefix),
          sequenceLength: ORDER_ID_SEQUENCE_LENGTH,
          nextSequence: Number.parseInt(nextSequence, 10),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) Object.values(data.errors).forEach((message) => toast.error(message));
        else toast.error(data.error || 'Could not save the Order ID settings');
        return;
      }
      setSavedPrefix(data.config.prefix);
      setSavedNextSequence(data.config.nextSequence);
      setPrefix(data.config.prefix);
      setNextSequence(padOrderNumber(data.config.nextSequence));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
      toast.success(`New orders will be numbered like ${data.preview?.next || preview}`);
    } catch (error) {
      console.error('[site-settings] order id save failed:', error);
      toast.error(error.message || 'Could not save the Order ID settings');
    } finally {
      setOrderSaving(false);
    }
  };

  /* ---------- OFFLINE / STORE draft + validation + preview ---------- */
  const offDraft = useMemo(
    () => ({
      prefix: offPrefix,
      year: offYear,
      separator: offSeparator,
      padding: Number.parseInt(offPadding, 10),
      nextNumber: Number.parseInt(offNext, 10),
    }),
    [offPrefix, offYear, offSeparator, offPadding, offNext]
  );

  const offValidation = useMemo(() => validateOfflineOrderIdConfig(offDraft), [offDraft]);

  const offNextInt = Number.parseInt(offNext, 10);
  const offNextValid = /^\d{1,5}$/.test(String(offNext).trim()) && Number.isInteger(offNextInt) && offNextInt >= 1;
  const offFieldError = (field) => offValidation.errors?.[field];
  const offPreviewSeq = offNextValid && offNextInt <= OFFLINE_LIMITS.maxOrderNumber ? offNextInt : null;
  const offPreview = useMemo(() => {
    if (offPreviewSeq === null) return `${offPrefix || '—'}${offYear || ''}${offSeparator || ''}____`;
    return renderOfflineOrderId(
      { prefix: offPrefix, year: offYear, separator: offSeparator, padding: Number.parseInt(offPadding, 10) },
      { sequence: offPreviewSeq }
    );
  }, [offPrefix, offYear, offSeparator, offPadding, offPreviewSeq]);

  const offChanged =
    offPrefix !== (offSaved.prefix ?? OFFLINE_DEFAULTS.prefix) ||
    offYear !== (offSaved.year ?? OFFLINE_DEFAULTS.year) ||
    offSeparator !== (offSaved.separator ?? OFFLINE_DEFAULTS.separator) ||
    String(Number.parseInt(offPadding, 10) || '') !== String(offSaved.padding) ||
    String(Number.parseInt(offNext, 10) || '') !== String(offSaved.nextNumber);

  const offCanSave = offValidation.ok && offNextValid && offNextInt <= OFFLINE_LIMITS.maxOrderNumber && !offSaving && offChanged;

  const saveOfflineOrderId = async (e) => {
    e.preventDefault();
    if (!offCanSave) return;
    setOffSaving(true);
    try {
      const response = await authFetch('/api/admin/offline-order-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: String(offPrefix).replace(/\s+/g, ''),
          year: String(offYear).replace(/\s+/g, ''),
          separator: String(offSeparator),
          padding: Number.parseInt(offPadding, 10),
          nextNumber: Number.parseInt(offNext, 10),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) Object.values(data.errors).forEach((message) => toast.error(message));
        else toast.error(data.error || 'Could not save the offline Order ID settings');
        return;
      }
      const cfg = data.config;
      setOffSaved({ prefix: cfg.prefix, year: cfg.year, separator: cfg.separator, padding: Number(cfg.padding), nextNumber: Number(cfg.nextNumber) });
      setOffPrefix(cfg.prefix);
      setOffYear(cfg.year);
      setOffSeparator(cfg.separator);
      setOffPadding(String(cfg.padding));
      setOffNext(padOfflineNumber(cfg.nextNumber, Number(cfg.padding)));
      setOffHighest(Number(data.highestUsedSequence) || 0);
      toast.success(`New offline orders will be numbered like ${data.preview?.next || offPreview}`);
    } catch (error) {
      console.error('[site-settings] offline order id save failed:', error);
      toast.error(error.message || 'Could not save the offline Order ID settings');
    } finally {
      setOffSaving(false);
    }
  };

  const resetOfflineCounter = async () => {
    const n = Number.parseInt(offResetValue, 10);
    if (!Number.isInteger(n) || n < 1 || n > OFFLINE_LIMITS.maxOrderNumber) {
      toast.error(`Next number must be a whole number between 1 and ${OFFLINE_LIMITS.maxOrderNumber}.`);
      return;
    }
    setOffResetting(true);
    try {
      const response = await authFetch('/api/admin/offline-order-id/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextNumber: n }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || 'Could not reset the offline counter');
        return;
      }
      const cfg = data.config;
      setOffSaved({ prefix: cfg.prefix, year: cfg.year, separator: cfg.separator, padding: Number(cfg.padding), nextNumber: Number(cfg.nextNumber) });
      setOffNext(padOfflineNumber(cfg.nextNumber, Number(cfg.padding)));
      setOffHighest(Number(data.highestUsedSequence) || 0);
      setOffResetOpen(false);
      toast.success(`Offline counter reset. Next offline order: ${data.preview?.next || ''}`);
    } catch (error) {
      console.error('[site-settings] offline reset failed:', error);
      toast.error(error.message || 'Could not reset the offline counter');
    } finally {
      setOffResetting(false);
    }
  };

  const saveContact = async (e) => {
    e.preventDefault();
    if (contactSaving) return;
    setContactSaving(true);
    try {
      await setDoc(
        doc(db, 'footerSettings', 'main'),
        { whatsapp: whatsapp.trim(), updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setSavedWhatsapp(whatsapp.trim());
      toast.success('Store contact number saved');
    } catch (error) {
      console.error('[site-settings] contact save failed:', error);
      toast.error('Could not save the contact number');
    } finally {
      setContactSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <AdminHeader title="Site Settings" />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 lg:px-8 xl:px-10">
        <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          System-level settings that should not be edited from the homepage Canvas.
        </p>

        {/* ORDER ID SETTINGS (online + offline) + contact side by side on desktop; stacked on mobile. */}
        <div className="grid items-start gap-4 xl:grid-cols-2">
        {/* ---------- ONLINE order id (existing behaviour, unchanged) ---------- */}
        <section className="rounded-2xl border p-4 sm:p-6" style={cardStyle} aria-labelledby="order-id-heading">
          <div className="mb-1 flex items-center gap-2">
            <Hash className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 id="order-id-heading" className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Order ID Settings — Online Orders
            </h2>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Applies to new online orders only. Existing orders keep their original IDs. Offline/store orders use the separate section below.
          </p>

          {orderLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading order ID settings…</p>
          ) : orderError ? (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--crimson-600)' }}>{orderError}</p>
              <button type="button" onClick={loadOrderId} className="mt-2 text-xs font-semibold underline" style={{ color: 'var(--text-strong)' }}>
                Retry
              </button>
            </div>
          ) : (
            <form onSubmit={saveOrderId}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Order ID Prefix</span>
                  <input
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                    maxLength={20}
                    placeholder="CHYD26"
                    aria-label="Order ID prefix"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Next Order Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={nextSequence}
                    onChange={(e) => {
                      // Free editing: keep the raw digits, never reformat mid-keystroke.
                      const cleaned = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
                      setNextSequence(cleaned);
                    }}
                    onBlur={() => {
                      // Format after editing: pad a valid in-range value to four digits.
                      const n = Number.parseInt(nextSequence, 10);
                      if (Number.isInteger(n) && n >= 1 && n <= ORDER_NUMBER_MAX) {
                        setNextSequence(padOrderNumber(n));
                      }
                    }}
                    placeholder="0001"
                    aria-label="Next order number"
                  />
                </label>
              </div>
              {prefixError && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>
                  {prefixError}
                </p>
              )}
              {nextError && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>
                  {nextError}
                </p>
              )}
              {!prefixError && !nextError && !validation.ok && validation.errors?.nextSequence && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>
                  {validation.errors.nextSequence}
                </p>
              )}
              <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Next order</p>
                <p className="mt-1 text-xl font-bold tabular" style={{ color: 'var(--text-strong)' }}>{preview}</p>
                {previewSequence !== null && (
                  <p className="mt-1 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                    Then:<br />{previewAfter(1)}<br />{previewAfter(2)}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={!canSave}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {orderSaving ? 'Saving…' : 'Save Order ID Settings'}
              </button>
            </form>
          )}
        </section>

        {/* ---------- OFFLINE / STORE order id (independent system) ---------- */}
        <section className="rounded-2xl border p-4 sm:p-6" style={cardStyle} aria-labelledby="offline-order-id-heading">
          <div className="mb-1 flex items-center gap-2">
            <Store className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 id="offline-order-id-heading" className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Order ID Settings — Offline / Store Orders
            </h2>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Applies to new offline/store (POS) orders only — e.g. Ayyapa26-0001. Existing offline orders keep their original IDs. Online orders are never affected.
          </p>

          {offLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading offline Order ID settings…</p>
          ) : offError ? (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--crimson-600)' }}>{offError}</p>
              <button type="button" onClick={loadOfflineOrderId} className="mt-2 text-xs font-semibold underline" style={{ color: 'var(--text-strong)' }}>
                Retry
              </button>
            </div>
          ) : (
            <form onSubmit={saveOfflineOrderId}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Prefix</span>
                  <input
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offPrefix}
                    onChange={(e) => setOffPrefix(e.target.value.replace(/\s+/g, '').slice(0, 20))}
                    maxLength={20}
                    placeholder="Ayyapa"
                    aria-label="Offline prefix"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Year</span>
                  <input
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offYear}
                    onChange={(e) => setOffYear(e.target.value.replace(/\s+/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="26"
                    aria-label="Offline year"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Separator</span>
                  <input
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offSeparator}
                    onChange={(e) => setOffSeparator(e.target.value.slice(0, 3))}
                    maxLength={3}
                    placeholder="-"
                    aria-label="Offline separator"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Number Padding</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={OFFLINE_LIMITS.minPadding}
                    max={OFFLINE_LIMITS.maxPadding}
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offPadding}
                    onChange={(e) => setOffPadding(e.target.value)}
                    aria-label="Offline number padding"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Next Order Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offNext}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
                      setOffNext(cleaned);
                    }}
                    onBlur={() => {
                      const n = Number.parseInt(offNext, 10);
                      const pad = Number.parseInt(offPadding, 10) || OFFLINE_DEFAULTS.padding;
                      if (Number.isInteger(n) && n >= 1 && n <= OFFLINE_LIMITS.maxOrderNumber) {
                        setOffNext(padOfflineNumber(n, pad));
                      }
                    }}
                    placeholder="0001"
                    aria-label="Offline next order number"
                  />
                </label>
              </div>
              {offFieldError('prefix') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{offFieldError('prefix')}</p>
              )}
              {offFieldError('year') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{offFieldError('year')}</p>
              )}
              {offFieldError('separator') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{offFieldError('separator')}</p>
              )}
              {offFieldError('padding') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{offFieldError('padding')}</p>
              )}
              {offFieldError('nextNumber') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{offFieldError('nextNumber')}</p>
              )}
              <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Preview</p>
                <p className="mt-1 text-xl font-bold tabular" style={{ color: 'var(--text-strong)' }}>{offPreview}</p>
                {offPreviewSeq !== null && (
                  <p className="mt-1 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                    Then:<br />{renderOfflineOrderId({ prefix: offPrefix, year: offYear, separator: offSeparator, padding: Number.parseInt(offPadding, 10) }, { sequence: offPreviewSeq + 1 })}<br />
                    {renderOfflineOrderId({ prefix: offPrefix, year: offYear, separator: offSeparator, padding: Number.parseInt(offPadding, 10) }, { sequence: offPreviewSeq + 2 })}
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Highest offline sequence issued so far: {offHighest}. Changes affect only new offline orders.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={!offCanSave}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {offSaving ? 'Saving…' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOffResetValue(padOfflineNumber(1, Number.parseInt(offPadding, 10) || OFFLINE_DEFAULTS.padding)); setOffResetOpen(true); }}
                  className="inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-semibold"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset Offline Order Number
                </button>
              </div>
            </form>
          )}
          {offResetOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
              <div className="w-full max-w-sm rounded-2xl border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} role="alertdialog" aria-modal="true" aria-labelledby="off-reset-title" aria-describedby="off-reset-desc">
                <h3 id="off-reset-title" className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Reset Offline Order Number?</h3>
                <p id="off-reset-desc" className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Existing offline orders will NOT be changed.
                  <br /><br />
                  Only the number used for the next new offline order will be reset.
                </p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Next Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offResetValue}
                    onChange={(e) => setOffResetValue(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                    placeholder="0001"
                    aria-label="Reset next number"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setOffResetOpen(false)} className="h-9 rounded-full border px-4 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={resetOfflineCounter} disabled={offResetting} className="h-9 rounded-full px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad-ember)' }}>
                    {offResetting ? 'Resetting…' : 'Reset Counter'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ---------- store contact ---------- */}
        <section className="rounded-2xl border p-4 sm:p-6" style={cardStyle} aria-labelledby="contact-heading">
          <div className="mb-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 id="contact-heading" className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Store Contact
            </h2>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            WhatsApp number behind the floating WhatsApp button on the storefront.
          </p>
          {contactLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading contact number…</p>
          ) : (
            <form onSubmit={saveContact} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>WhatsApp number</span>
                <input
                  className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm tabular"
                  style={inputStyle}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+91 …"
                  aria-label="WhatsApp number"
                />
              </label>
              <button
                type="submit"
                disabled={contactSaving || whatsapp.trim() === savedWhatsapp}
                className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {contactSaving ? 'Saving…' : 'Save Contact'}
              </button>
            </form>
          )}
        </section>
        </div>

        {/* ---------- server status ---------- */}
        <section className="mt-4 rounded-2xl border p-4 sm:p-6" style={cardStyle} aria-labelledby="server-heading">
          <div className="mb-1 flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 id="server-heading" className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Server Status
            </h2>
          </div>
          {!serverStatus ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking…</p>
          ) : (
            <ul className="space-y-1.5 text-xs" style={{ color: 'var(--text-body)' }}>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: serverStatus.api ? 'var(--leaf-600, #3ecf8e)' : 'var(--crimson-600)' }} aria-hidden="true" />
                API server: {serverStatus.api ? 'reachable' : 'unreachable'}
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: serverStatus.mail?.ok ? 'var(--leaf-600, #3ecf8e)' : 'var(--crimson-600)' }}
                  aria-hidden="true"
                />
                {serverStatus.mail
                  ? (serverStatus.mail.ok
                    ? 'Order emails: sending'
                    : `Order emails: not sending (${(serverStatus.mail.problems || ['unknown']).join(', ')})`)
                  : 'Order emails: status unknown'}
              </li>
            </ul>
          )}
        </section>

      </main>
    </div>
  );
};

export default SiteSettings;