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
import { Hash, MessageCircle, Save, Activity, Store, RotateCcw, Search, Share2, Eye, FileText, ListChecks } from 'lucide-react';
import AdminHeader from '../components/admin/AdminHeader';
import { db } from '../firebase';
import { readSiteSettings, updateSeoSettings, DEFAULT_SEO, normalizeSeoSettings } from '../lib/siteSettings';
import { authFetch, readApiError, apiUrl } from '../utils/apiClient';
import toast from '../utils/toast';
import {
  normalizePrefixInput,
  renderOrderId,
  validateOrderIdConfig,
  parseOnlineFields,
  composeOnlineFormat,
} from '../lib/orderIdFormat';
import {
  OFFLINE_DEFAULTS,
  OFFLINE_LIMITS,
  renderOfflineOrderId,
  validateOfflineOrderIdConfig,
  padOfflineNumber,
} from '../lib/offlineOrderIdFormat';

/* Online next-number range 0001–9999, mirroring the server and the offline
   section. Padding mirrors the offline 3–12 range (server sequenceLength). */
const ORDER_NUMBER_MAX = 9999;
const ONLINE_PADDING_MIN = 3;
const ONLINE_PADDING_MAX = 12;
const ONLINE_YEAR_MAX = 4;
const ONLINE_SEPARATOR_MAX = 3;

const padOnlineNumber = (n, width = 4) => {
  const w = Number.isFinite(Number(width)) ? Number(width) : 4;
  return String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(w, '0');
};

const cardStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
};
const inputStyle = {
  borderColor: 'var(--hairline)',
  color: 'var(--text-strong)',
  background: 'var(--surface-sunken)',
};

/* ---------- SEO section helpers (presentation only) ---------- */

const SeoCounter = ({ count, limit }) => (
  <span
    className="tabular text-[11px] font-semibold"
    style={{ color: count > limit ? 'var(--crimson-600)' : 'var(--text-subtle)' }}
    aria-label={`${count} of ${limit} characters`}
  >
    {count} / {limit}
  </span>
);

const SeoToggle = ({ label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>{label}</p>
      {hint && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? 'var(--leaf-600, #3ecf8e)' : 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
    >
      <span
        className="absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all"
        style={{ left: checked ? '22px' : '2px', background: '#fff' }}
        aria-hidden="true"
      />
    </button>
  </div>
);

const isHttpUrl = (value) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(String(value || '').trim());

const displaySeoUrl = (canonicalUrl) => {
  const raw = String(canonicalUrl || '').trim() || 'https://crackershyderabad.com/';
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname === '/' ? '/' : url.pathname}`;
  } catch {
    return raw;
  }
};

const absoluteSeoImage = (image, canonicalUrl) => {
  const src = String(image || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  const base = String(canonicalUrl || '').trim().replace(/\/+$/, '') || 'https://crackershyderabad.com';
  if (!/^https?:\/\//i.test(base)) return '';
  return `${base}${src.startsWith('/') ? src : `/${src}`}`;
};

const seoHealth = (form) => {
  const items = [];
  const push = (ok, label, tone) => items.push({ ok, label, tone });
  const titleLen = String(form.homepageTitle || '').length;
  const descLen = String(form.homepageDescription || '').length;
  push(titleLen > 0 && titleLen <= 60, titleLen > 60 ? 'SEO title is longer than recommended (60)' : 'SEO title configured');
  push(descLen > 0 && descLen <= 160, descLen > 160 ? 'Meta description is longer than recommended (160)' : 'Meta description configured');
  push(isHttpUrl(form.canonicalUrl), isHttpUrl(form.canonicalUrl) ? 'Canonical URL configured' : 'Canonical URL is missing or invalid');
  push(String(form.homepageH1 || '').trim().length > 0, 'Homepage H1 configured');
  push(String(form.ogTitle || '').trim().length > 0, 'Open Graph title configured');
  push(String(form.ogDescription || '').trim().length > 0, 'Open Graph description configured');
  push(String(form.ogImage || '').trim().length > 0, String(form.ogImage || '').trim() ? 'Social image configured' : 'Social image is missing');
  return items.map((h) => ({ ...h, tone: h.ok ? 'var(--leaf-600, #3ecf8e)' : 'var(--gold-500)' }));
};

const SiteSettings = () => {
  /* ---------- ONLINE order id (same five fields as offline) ---------- */
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [onSaved, setOnSaved] = useState(null);
  const [onFormatSimple, setOnFormatSimple] = useState(true);
  const [onPrefix, setOnPrefix] = useState('CHYD26');
  const [onYear, setOnYear] = useState('');
  const [onSeparator, setOnSeparator] = useState('-');
  const [onPadding, setOnPadding] = useState('4');
  const [onNext, setOnNext] = useState('0001');
  const [highestUsedSequence, setHighestUsedSequence] = useState(0);
  const [onResetOpen, setOnResetOpen] = useState(false);
  const [onResetValue, setOnResetValue] = useState('0001');
  const [onResetting, setOnResetting] = useState(false);

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

  /* ---------- SEO settings (settings/siteSettings.seo; siblings untouched) ---------- */
  const [seoLoading, setSeoLoading] = useState(true);
  const [seoError, setSeoError] = useState(null);
  const [seoSaving, setSeoSaving] = useState(false);
  const [seoForm, setSeoForm] = useState({ ...DEFAULT_SEO });
  const [seoSaved, setSeoSaved] = useState(null);
  const [seoResetOpen, setSeoResetOpen] = useState(false);
  const [seoResetting, setSeoResetting] = useState(false);

  const loadOrderId = useCallback(async () => {
    setOrderLoading(true);
    setOrderError(null);
    try {
      const response = await authFetch('/api/admin/order-id');
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load Order ID settings'));
      const data = await response.json();
      /* Split the stored format into the five fields when it has the standard
         shape; anything custom stays editable on the Order ID page. */
      const parsed = parseOnlineFields({ format: data.config.format, prefix: data.config.prefix });
      const padding = Number(data.config.sequenceLength) || 4;
      const next = Number(data.config.nextSequence) || 1;
      setOnSaved({
        prefix: parsed.prefix,
        year: parsed.year,
        separator: parsed.separator,
        padding,
        nextNumber: next,
      });
      setOnFormatSimple(parsed.simple);
      setOnPrefix(parsed.prefix);
      setOnYear(parsed.year);
      setOnSeparator(parsed.separator);
      setOnPadding(String(padding));
      setOnNext(padOnlineNumber(next, padding));
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

  const loadSeo = useCallback(async () => {
    setSeoLoading(true);
    setSeoError(null);
    try {
      const settings = await readSiteSettings();
      const seo = normalizeSeoSettings(settings.seo);
      setSeoForm(seo);
      setSeoSaved(JSON.stringify(seo));
    } catch (error) {
      console.error('[site-settings] seo load failed:', error);
      setSeoError(error.message || 'Failed to load SEO settings');
    } finally {
      setSeoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrderId();
    loadOfflineOrderId();
    loadContact();
    loadSeo();
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
  }, [loadOrderId, loadOfflineOrderId, loadContact, loadSeo]);

  /* ---------- SEO save/reset (seo key only; order IDs/contact untouched) ---------- */
  const seoDirty = seoSaved !== null && JSON.stringify(seoForm) !== seoSaved;
  const setSeoField = (patch) => setSeoForm((f) => ({ ...f, ...patch }));
  const setSeoToggle = (key) => (enabled) =>
    setSeoForm((f) => ({ ...f, structuredData: { ...f.structuredData, [key]: enabled } }));

  const saveSeo = async (e) => {
    e?.preventDefault?.();
    if (seoSaving) return;
    setSeoSaving(true);
    try {
      const saved = await updateSeoSettings(seoForm);
      const seo = normalizeSeoSettings(saved.seo);
      setSeoForm(seo);
      setSeoSaved(JSON.stringify(seo));
      toast.success('SEO settings saved');
    } catch (error) {
      console.error('[site-settings] seo save failed:', error);
      toast.error('Could not save SEO settings');
    } finally {
      setSeoSaving(false);
    }
  };

  const resetSeo = async () => {
    if (seoResetting) return;
    setSeoResetting(true);
    try {
      const saved = await updateSeoSettings({ ...DEFAULT_SEO });
      const seo = normalizeSeoSettings(saved.seo);
      setSeoForm(seo);
      setSeoSaved(JSON.stringify(seo));
      setSeoResetOpen(false);
      toast.success('SEO settings reset to defaults');
    } catch (error) {
      console.error('[site-settings] seo reset failed:', error);
      toast.error('Could not reset SEO settings');
    } finally {
      setSeoResetting(false);
    }
  };

  /* ---------- ONLINE draft + validation + preview (mirrors offline) ---------- */
  const onDraft = useMemo(
    () => ({
      format: composeOnlineFormat({ year: onYear, separator: onSeparator }),
      prefix: normalizePrefixInput(onPrefix),
      sequenceLength: Number.parseInt(onPadding, 10),
      nextSequence: Number.parseInt(onNext, 10),
    }),
    [onPrefix, onYear, onSeparator, onPadding, onNext]
  );

  const onValidation = useMemo(() => validateOrderIdConfig(onDraft), [onDraft]);

  const onNextInt = Number.parseInt(onNext, 10);
  const onNextValid = /^\d{1,5}$/.test(String(onNext).trim()) && Number.isInteger(onNextInt) && onNextInt >= 1;
  const onYearError =
    onYear.length > ONLINE_YEAR_MAX || (onYear && !/^[A-Za-z0-9]*$/.test(onYear))
      ? 'Year must be up to 4 letters/numbers (e.g. 26).'
      : null;
  const onSeparatorError =
    onSeparator.length > ONLINE_SEPARATOR_MAX || !/^[A-Za-z0-9\-_]*$/.test(onSeparator)
      ? 'Separator may only use - or _ (max 3 characters).'
      : null;
  const onFieldError = (field) => {
    if (field === 'year') return onYearError;
    if (field === 'separator') return onSeparatorError;
    return onValidation.errors?.[field];
  };
  const onPreviewSeq = onNextValid && onNextInt <= ORDER_NUMBER_MAX ? onNextInt : null;
  const onPreview = useMemo(() => {
    if (onPreviewSeq === null) return `${normalizePrefixInput(onPrefix) || '—'}${onYear || ''}${onSeparator || ''}____`;
    return renderOrderId({ ...onDraft, prefix: normalizePrefixInput(onPrefix) }, { sequence: onPreviewSeq });
  }, [onDraft, onPrefix, onYear, onSeparator, onPreviewSeq]);
  const onPreviewAfter = (offset) =>
    renderOrderId({ ...onDraft, prefix: normalizePrefixInput(onPrefix) }, { sequence: onPreviewSeq + offset });

  const onChanged =
    !onSaved ||
    normalizePrefixInput(onPrefix) !== normalizePrefixInput(onSaved.prefix) ||
    onYear !== (onSaved.year ?? '') ||
    onSeparator !== (onSaved.separator ?? '') ||
    String(Number.parseInt(onPadding, 10) || '') !== String(onSaved.padding) ||
    String(Number.parseInt(onNext, 10) || '') !== String(onSaved.nextNumber);

  const onCanSave =
    onFormatSimple &&
    onValidation.ok &&
    onNextValid &&
    onNextInt <= ORDER_NUMBER_MAX &&
    !onYearError &&
    !onSeparatorError &&
    !orderSaving &&
    onChanged;

  const saveOnlineOrderId = async (e) => {
    e.preventDefault();
    if (!onCanSave) return;
    setOrderSaving(true);
    try {
      const response = await authFetch('/api/admin/order-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: composeOnlineFormat({ year: onYear, separator: onSeparator }),
          prefix: normalizePrefixInput(onPrefix),
          sequenceLength: Number.parseInt(onPadding, 10),
          nextSequence: Number.parseInt(onNext, 10),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) Object.values(data.errors).forEach((message) => toast.error(message));
        else toast.error(data.error || 'Could not save the Order ID settings');
        return;
      }
      const parsed = parseOnlineFields({ format: data.config.format, prefix: data.config.prefix });
      const padding = Number(data.config.sequenceLength) || 4;
      const next = Number(data.config.nextSequence) || 1;
      setOnSaved({ prefix: parsed.prefix, year: parsed.year, separator: parsed.separator, padding, nextNumber: next });
      setOnFormatSimple(parsed.simple);
      setOnPrefix(parsed.prefix);
      setOnYear(parsed.year);
      setOnSeparator(parsed.separator);
      setOnPadding(String(padding));
      setOnNext(padOnlineNumber(next, padding));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
      toast.success(`New online orders will be numbered like ${data.preview?.next || onPreview}`);
    } catch (error) {
      console.error('[site-settings] order id save failed:', error);
      toast.error(error.message || 'Could not save the Order ID settings');
    } finally {
      setOrderSaving(false);
    }
  };

  const resetOnlineCounter = async () => {
    const n = Number.parseInt(onResetValue, 10);
    if (!Number.isInteger(n) || n < 1 || n > ORDER_NUMBER_MAX) {
      toast.error(`Next number must be a whole number between 1 and ${ORDER_NUMBER_MAX}.`);
      return;
    }
    setOnResetting(true);
    try {
      const response = await authFetch('/api/admin/order-id/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextSequence: n }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || 'Could not reset the online counter');
        return;
      }
      const parsed = parseOnlineFields({ format: data.config.format, prefix: data.config.prefix });
      const padding = Number(data.config.sequenceLength) || 4;
      const next = Number(data.config.nextSequence) || 1;
      setOnSaved({ prefix: parsed.prefix, year: parsed.year, separator: parsed.separator, padding, nextNumber: next });
      setOnNext(padOnlineNumber(next, padding));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
      setOnResetOpen(false);
      toast.success(`Online counter reset. Next online order: ${data.preview?.next || ''}`);
    } catch (error) {
      console.error('[site-settings] online reset failed:', error);
      toast.error(error.message || 'Could not reset the online counter');
    } finally {
      setOnResetting(false);
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

        {/* Order ID pair: CSS grid stretch keeps both cards equal height. */}
        <div className="grid gap-4 xl:grid-cols-2">
        {/* ---------- ONLINE order id (same five fields as offline) ---------- */}
        <section className="rounded-md border p-4 sm:p-5" style={cardStyle} aria-labelledby="order-id-heading">
          <div className="mb-1 flex items-center gap-2">
            <Hash className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 id="order-id-heading" className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              Order ID Settings — Online Orders
            </h2>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Applies to new online orders only — e.g. CHYD26-2001. Existing online orders keep their original IDs. Offline/store orders use the separate section and are never affected.
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
            <form onSubmit={saveOnlineOrderId}>
              {!onFormatSimple && (
                <p className="mb-3 rounded border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--gold-500)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }} role="note">
                  A custom online format is stored — editing the full format lives on the Order ID page. Saving here replaces it with the standard Prefix/Year/Separator form.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Prefix</span>
                  <input
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onPrefix}
                    onChange={(e) => setOnPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                    maxLength={20}
                    placeholder="CHYD"
                    aria-label="Online prefix"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Year</span>
                  <input
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onYear}
                    onChange={(e) => setOnYear(e.target.value.replace(/\s+/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="26"
                    aria-label="Online year"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Separator</span>
                  <input
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onSeparator}
                    onChange={(e) => setOnSeparator(e.target.value.slice(0, 3))}
                    maxLength={3}
                    placeholder="-"
                    aria-label="Online separator"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Number Padding</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={ONLINE_PADDING_MIN}
                    max={ONLINE_PADDING_MAX}
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onPadding}
                    onChange={(e) => setOnPadding(e.target.value)}
                    aria-label="Online number padding"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Next Order Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onNext}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
                      setOnNext(cleaned);
                    }}
                    onBlur={() => {
                      const n = Number.parseInt(onNext, 10);
                      const pad = Number.parseInt(onPadding, 10) || 4;
                      if (Number.isInteger(n) && n >= 1 && n <= ORDER_NUMBER_MAX) {
                        setOnNext(padOnlineNumber(n, pad));
                      }
                    }}
                    placeholder="0001"
                    aria-label="Online next order number"
                  />
                </label>
              </div>
              {onFieldError('prefix') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{onFieldError('prefix')}</p>
              )}
              {onFieldError('year') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{onFieldError('year')}</p>
              )}
              {onFieldError('separator') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{onFieldError('separator')}</p>
              )}
              {onFieldError('sequenceLength') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{onFieldError('sequenceLength')}</p>
              )}
              {onFieldError('nextSequence') && (
                <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{onFieldError('nextSequence')}</p>
              )}
              <div className="mt-4 rounded border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Preview</p>
                <p className="mt-1 text-xl font-bold tabular" style={{ color: 'var(--text-strong)' }}>{onPreviewSeq !== null ? onPreview : `${normalizePrefixInput(onPrefix) || '—'}${onYear || ''}${onSeparator || ''}____`}</p>
                {onPreviewSeq !== null && (
                  <p className="mt-1 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                    Then:<br />{onPreviewAfter(1)}<br />{onPreviewAfter(2)}
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Highest online sequence issued so far: {highestUsedSequence}. Changes affect only new online orders.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={!onCanSave}
                  className="inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {orderSaving ? 'Saving…' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOnResetValue(padOnlineNumber(1, Number.parseInt(onPadding, 10) || 4)); setOnResetOpen(true); }}
                  className="inline-flex h-10 items-center gap-2 rounded-md border px-5 text-sm font-semibold"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset Online Order Number
                </button>
              </div>
            </form>
          )}
          {onResetOpen && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
              <div className="w-full max-w-sm rounded-md border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} role="alertdialog" aria-modal="true" aria-labelledby="on-reset-title" aria-describedby="on-reset-desc">
                <h3 id="on-reset-title" className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Reset Online Order Number?</h3>
                <p id="on-reset-desc" className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Existing online orders will NOT be changed, and the offline counter is untouched.
                  <br /><br />
                  Only the number used for the next new online order will be reset. Taken IDs are stepped over automatically.
                </p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Next Number</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={onResetValue}
                    onChange={(e) => setOnResetValue(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                    placeholder="0001"
                    aria-label="Reset next number"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setOnResetOpen(false)} className="h-9 rounded-md border px-4 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={resetOnlineCounter} disabled={onResetting} className="h-9 rounded-md px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad-ember)' }}>
                    {onResetting ? 'Resetting…' : 'Reset Counter'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ---------- OFFLINE / STORE order id (independent system) ---------- */}
        <section className="rounded-md border p-4 sm:p-5" style={cardStyle} aria-labelledby="offline-order-id-heading">
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
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
              <div className="mt-4 rounded-md border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
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
                  className="inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {offSaving ? 'Saving…' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOffResetValue(padOfflineNumber(1, Number.parseInt(offPadding, 10) || OFFLINE_DEFAULTS.padding)); setOffResetOpen(true); }}
                  className="inline-flex h-10 items-center gap-2 rounded-md border px-5 text-sm font-semibold"
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
              <div className="w-full max-w-sm rounded-md border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} role="alertdialog" aria-modal="true" aria-labelledby="off-reset-title" aria-describedby="off-reset-desc">
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
                    className="h-10 w-full rounded border px-3 text-sm font-semibold tabular"
                    style={inputStyle}
                    value={offResetValue}
                    onChange={(e) => setOffResetValue(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                    placeholder="0001"
                    aria-label="Reset next number"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setOffResetOpen(false)} className="h-9 rounded-md border px-4 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={resetOfflineCounter} disabled={offResetting} className="h-9 rounded-md px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad-ember)' }}>
                    {offResetting ? 'Resetting…' : 'Reset Counter'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
        </div>

        {/* ---------- store contact: full width below both order-ID cards ---------- */}
        <section className="mt-4 rounded-md border p-4 sm:p-5" style={cardStyle} aria-labelledby="contact-heading">
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
                  className="h-10 w-full rounded border px-3 text-sm tabular"
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
                className="inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {contactSaving ? 'Saving…' : 'Save Contact'}
              </button>
            </form>
          )}
        </section>

        {/* ---------- server status ---------- */}
        <section className="mt-4 rounded-md border p-4 sm:p-5" style={cardStyle} aria-labelledby="server-heading">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
              <h2 id="server-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                Server Status
              </h2>
            </div>
          {!serverStatus ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking…</p>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" style={{ color: 'var(--text-body)' }}>
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
          </div>
        </section>

        {/* ---------- SEO settings (homepage metadata + social + schema) ---------- */}
        <div className="mt-6">
          <div className="mb-1 flex items-center gap-2">
            <Search className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
              SEO Settings
            </h2>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Manage homepage search engine metadata, social sharing information and SEO content from one place.
          </p>

          {seoLoading ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading SEO settings…</p>
          ) : seoError ? (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--crimson-600)' }}>{seoError}</p>
              <button type="button" onClick={loadSeo} className="mt-2 text-xs font-semibold underline" style={{ color: 'var(--text-strong)' }}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* One connected workspace: sections separated by hairlines, not floating cards. */}
              <div className="rounded-md border" style={cardStyle}>
                <section className="p-4 sm:p-5" aria-labelledby="seo-search-heading">
                  <div className="mb-1 flex items-center gap-2">
                    <Search className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                    <h3 id="seo-search-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                      Search Engine Settings
                    </h3>
                  </div>
                  <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Keywords below are internal management topics only — they are never injected as a meta keywords tag.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <label className="block">
                        <span className="mb-1.5 flex items-baseline justify-between text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                          Homepage SEO Title
                          <SeoCounter count={seoForm.homepageTitle.length} limit={60} />
                        </span>
                        <input
                          className="h-10 w-full rounded border px-3 text-sm"
                          style={inputStyle}
                          value={seoForm.homepageTitle}
                          onChange={(e) => setSeoField({ homepageTitle: e.target.value })}
                          maxLength={120}
                          aria-label="Homepage SEO title"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 flex items-baseline justify-between text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                          Homepage Meta Description
                          <SeoCounter count={seoForm.homepageDescription.length} limit={160} />
                        </span>
                        <textarea
                          className="min-h-[84px] w-full rounded border px-3 py-2 text-sm"
                          style={inputStyle}
                          value={seoForm.homepageDescription}
                          onChange={(e) => setSeoField({ homepageDescription: e.target.value })}
                          maxLength={320}
                          aria-label="Homepage meta description"
                        />
                      </label>
                    </div>
                    <div className="flex flex-col gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Canonical URL</span>
                        <input
                          className="h-10 w-full rounded border px-3 text-sm tabular"
                          style={inputStyle}
                          value={seoForm.canonicalUrl}
                          onChange={(e) => setSeoField({ canonicalUrl: e.target.value.trim() })}
                          placeholder="https://crackershyderabad.com/"
                          aria-label="Canonical URL"
                        />
                      </label>
                      <label className="block flex-1">
                        <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Homepage Keywords / Topics (comma-separated)</span>
                        <textarea
                          className="min-h-[56px] w-full rounded border px-3 py-2 text-sm"
                          style={inputStyle}
                          value={seoForm.keywords}
                          onChange={(e) => setSeoField({ keywords: e.target.value })}
                          aria-label="Homepage keywords"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                  <section className="border-t p-4 sm:p-5" style={{ borderColor: 'var(--hairline)' }} aria-labelledby="seo-content-heading">
                    <div className="mb-1 flex items-center gap-2">
                      <FileText className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      <h3 id="seo-content-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                        Homepage SEO Content
                      </h3>
                    </div>
                    <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Rendered on the homepage; blank values fall back to built-in defaults.
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>H1 Heading</span>
                          <input
                            className="h-10 w-full rounded border px-3 text-sm"
                            style={inputStyle}
                            value={seoForm.homepageH1}
                            onChange={(e) => setSeoField({ homepageH1: e.target.value })}
                            maxLength={120}
                            aria-label="Homepage H1 heading"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>SEO Content Heading</span>
                          <input
                            className="h-10 w-full rounded border px-3 text-sm"
                            style={inputStyle}
                            value={seoForm.contentHeading}
                            onChange={(e) => setSeoField({ contentHeading: e.target.value })}
                            maxLength={120}
                            aria-label="SEO content heading"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>SEO Content (blank line = new paragraph)</span>
                        <textarea
                          className="min-h-[200px] w-full rounded border px-3 py-2 text-sm leading-relaxed"
                          style={inputStyle}
                          value={seoForm.content}
                          onChange={(e) => setSeoField({ content: e.target.value })}
                          aria-label="SEO content"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="border-t p-4 sm:p-5" style={{ borderColor: 'var(--hairline)' }} aria-labelledby="seo-schema-heading">
                    <div className="mb-1 flex items-center gap-2">
                      <ListChecks className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      <h3 id="seo-schema-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                        Structured Data
                      </h3>
                    </div>
                    <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Schemas reflect visible site content only — no ratings, hours, address or phone are generated.
                    </p>
                    <div className="flex flex-col divide-y" style={{ borderColor: 'var(--hairline)' }}>
                      <SeoToggle label="Organization Schema" hint="Site name, URL and logo" checked={seoForm.structuredData.organization} onChange={setSeoToggle('organization')} />
                      <SeoToggle label="WebSite Schema" hint="Site URL plus search action" checked={seoForm.structuredData.website} onChange={setSeoToggle('website')} />
                      <SeoToggle label="WebPage Schema" hint="Homepage title and description" checked={seoForm.structuredData.webpage} onChange={setSeoToggle('webpage')} />
                      <SeoToggle label="LocalBusiness Schema" hint="Only if business info is complete — currently name, URL, logo and service area" checked={seoForm.structuredData.localBusiness} onChange={setSeoToggle('localBusiness')} />
                    </div>
                  </section>
                  <section className="border-t p-4 sm:p-5" style={{ borderColor: 'var(--hairline)' }} aria-labelledby="seo-social-heading">
                    <div className="mb-1 flex items-center gap-2">
                      <Share2 className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      <h3 id="seo-social-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                        Social Sharing
                      </h3>
                    </div>
                    <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Image accepts a site path or full URL; previews resolve it against the storefront domain.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-3">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>OG Title</span>
                          <input className="h-10 w-full rounded border px-3 text-sm" style={inputStyle} value={seoForm.ogTitle} onChange={(e) => setSeoField({ ogTitle: e.target.value })} maxLength={120} aria-label="OG title" />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>OG Description</span>
                          <textarea className="min-h-[64px] w-full rounded border px-3 py-2 text-sm" style={inputStyle} value={seoForm.ogDescription} onChange={(e) => setSeoField({ ogDescription: e.target.value })} maxLength={320} aria-label="OG description" />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Twitter/X Description</span>
                          <textarea className="min-h-[64px] w-full rounded border px-3 py-2 text-sm" style={inputStyle} value={seoForm.twitterDescription} onChange={(e) => setSeoField({ twitterDescription: e.target.value })} maxLength={320} aria-label="Twitter description" />
                        </label>
                      </div>
                      <div className="flex flex-col gap-3">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>OG Image</span>
                          <input className="h-10 w-full rounded border px-3 text-sm tabular" style={inputStyle} value={seoForm.ogImage} onChange={(e) => setSeoField({ ogImage: e.target.value.trim() })} placeholder="/images/website/…" aria-label="OG image" />
                        </label>
                        {absoluteSeoImage(seoForm.ogImage, seoForm.canonicalUrl) ? (
                          <img
                            src={absoluteSeoImage(seoForm.ogImage, seoForm.canonicalUrl)}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            className="w-36 rounded border object-cover"
                            style={{ borderColor: 'var(--hairline)', aspectRatio: '1200 / 630' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>No social image</p>
                        )}
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Twitter/X Title</span>
                          <input className="h-10 w-full rounded border px-3 text-sm" style={inputStyle} value={seoForm.twitterTitle} onChange={(e) => setSeoField({ twitterTitle: e.target.value })} maxLength={120} aria-label="Twitter title" />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Twitter/X Image</span>
                          <input className="h-10 w-full rounded border px-3 text-sm tabular" style={inputStyle} value={seoForm.twitterImage} onChange={(e) => setSeoField({ twitterImage: e.target.value.trim() })} placeholder="/images/website/…" aria-label="Twitter image" />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="border-t p-4 sm:p-5" style={{ borderColor: 'var(--hairline)' }} aria-labelledby="seo-preview-heading">
                    <div className="mb-1 flex items-center gap-2">
                      <Eye className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      <h3 id="seo-preview-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                        Search Preview
                      </h3>
                    </div>
                    <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>Live preview — illustrative, not an exact Google rendering.</p>
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <div className="min-w-0 rounded border bg-white p-3" style={{ borderColor: '#DADCE0' }}>
                        <p className="text-[13px]" style={{ color: '#202124' }}>Crackers Hyderabad</p>
                        <p className="mt-0.5 break-words text-[15px] leading-snug" style={{ color: '#1A0DAB' }}>
                          {seoForm.homepageTitle || <span style={{ color: '#9AA0A6' }}>Homepage SEO Title</span>}
                        </p>
                        <p className="mt-0.5 break-all text-xs" style={{ color: '#006621' }}>
                          {displaySeoUrl(seoForm.canonicalUrl) || 'https://crackershyderabad.com/'}
                        </p>
                        <p className="mt-1 break-words text-xs leading-snug" style={{ color: '#4D5156' }}>
                          {seoForm.homepageDescription || <span style={{ color: '#9AA0A6' }}>Homepage meta description</span>}
                        </p>
                      </div>
                      <div className="flex min-w-0 gap-3 rounded border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                        {absoluteSeoImage(seoForm.ogImage, seoForm.canonicalUrl) ? (
                          <img
                            src={absoluteSeoImage(seoForm.ogImage, seoForm.canonicalUrl)}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            className="w-36 shrink-0 self-start rounded border object-cover"
                            style={{ borderColor: 'var(--hairline)', aspectRatio: '1200 / 630' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="grid w-36 shrink-0 place-items-center self-start rounded border text-[11px] font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-subtle)', aspectRatio: '1200 / 630' }}>
                            No image
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>Crackers Hyderabad</p>
                          <p className="mt-1 break-words text-[13px] font-bold leading-snug" style={{ color: 'var(--text-strong)' }}>
                            {seoForm.ogTitle || 'OG Title'}
                          </p>
                          <p className="mt-1 break-words text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {seoForm.ogDescription || 'OG Description'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="border-t p-4 sm:p-5" style={{ borderColor: 'var(--hairline)' }} aria-labelledby="seo-health-heading">
                    <div className="mb-2 flex items-center gap-2">
                      <Activity className="h-4 w-4" style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      <h3 id="seo-health-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-strong)' }}>
                        SEO Health
                      </h3>
                    </div>
                    <ul className="grid gap-x-8 text-xs sm:grid-cols-2" style={{ color: 'var(--text-body)' }}>
                      {seoHealth(seoForm).map((h) => (
                        <li key={h.label} className="flex items-center gap-2 border-b py-[7px]" style={{ borderColor: 'var(--hairline)' }}>
                          <span aria-hidden="true" style={{ color: h.tone }}>{h.ok ? '✓' : '⚠'}</span>
                          <span style={h.ok ? undefined : { color: 'var(--gold-500)', fontWeight: 600 }}>{h.label}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      SEO settings are saved to the site&apos;s configuration.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={saveSeo}
                        disabled={!seoDirty || seoSaving}
                        className="inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-40"
                        style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {seoSaving ? 'Saving…' : 'Save SEO Settings'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeoResetOpen(true)}
                  className="inline-flex h-10 items-center gap-2
                      rounded-md border px-5 text-sm font-semibold"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Reset SEO Settings
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

        {seoResetOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation">
            <div className="w-full max-w-sm rounded-md border p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} role="alertdialog" aria-modal="true" aria-labelledby="seo-reset-title">
              <h3 id="seo-reset-title" className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Reset SEO settings to the default configuration?</h3>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Only SEO settings are reset. Order ID settings, store contact and all other settings are untouched.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setSeoResetOpen(false)} className="h-9 rounded-md border px-4 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                  Cancel
                </button>
                <button type="button" onClick={resetSeo} disabled={seoResetting} className="h-9 rounded-md px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--grad-ember)' }}>
                  {seoResetting ? 'Resetting…' : 'Reset Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default SiteSettings;