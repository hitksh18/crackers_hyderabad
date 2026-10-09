/**
 * Settings → Orders → Order ID.
 *
 * The admin's control over how NEW order ids are generated. Three things matter
 * about this screen and they drive every decision in it:
 *
 *  1. THE SERVER DECIDES. Formats are saved through PUT /api/admin/order-id,
 *     which validates against the live sequence counter before writing. The
 *     client-side check in lib/orderIdFormat.js exists so the Save button can be
 *     honest while typing; it is not what guards the data. An id is minted in
 *     exactly one place — inside the transaction that creates the order.
 *
 *  2. EXISTING ORDERS NEVER CHANGE. There is no "apply to all orders" and no
 *     regenerate path anywhere in this codebase, deliberately. An order's id is
 *     written once, when the order is created, and read from there forever. A
 *     format saved here affects the next order and every order after it.
 *
 *  3. THE PREVIEW IS NOT A SAMPLE. It is rendered by the same logic as the real
 *     generator, from the same config, for the same sequence the next order
 *     would take — so what the admin approves here is what the customer sees.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Hash,
  RotateCcw,
  Save,
  Copy,
  Check,
  Info,
  TriangleAlert,
} from 'lucide-react';

import AdminHeader from '../components/admin/AdminHeader';
import FormField from '../components/admin/FormField';
import FormSection from '../components/admin/FormSection';
import { Skeleton } from '../components/ui/Skeleton';
import { authFetch, readApiError } from '../utils/apiClient';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import toast from '../utils/toast';
import {
  ORDER_ID_TOKENS,
  ORDER_ID_DEFAULTS,
  ORDER_ID_LIMITS,
  normalizeFormatInput,
  normalizePrefixInput,
  renderOrderId,
  validateOrderIdConfig,
  orderIdCarriesOwnEntropy,
} from '../lib/orderIdFormat';

/** One-line explanation per block, shown when the admin hovers or focuses it. */
const TOKEN_HELP = {
  PREFIX: 'The prefix you set below — CH for Crackers Hyderabad.',
  YYYY: 'Four-digit year, e.g. 2026.',
  YY: 'Two-digit year, e.g. 26.',
  MM: 'Two-digit month, 01–12.',
  DD: 'Two-digit day, 01–31.',
  HH: 'Two-digit hour on a 24-hour clock, 00–23.',
  MIN: 'Two-digit minute, 00–59.',
  SEQUENCE: 'The running order number, zero-padded. Required — it is what makes each id unique.',
};

const inputClass =
  'h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-sunken)] px-3 text-sm focus:outline-none transition-colors duration-200 tabular';
const inputStyle = { borderColor: 'var(--hairline)', color: 'var(--text-strong)' };
const invalidStyle = { borderColor: 'var(--crimson-600)' };

const OrderIdSettings = () => {
  const reduced = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  /** The saved config, and the draft being edited. Kept apart so Cancel is real. */
  const [saved, setSaved] = useState(null);
  const [format, setFormat] = useState(ORDER_ID_DEFAULTS.format);
  const [prefix, setPrefix] = useState(ORDER_ID_DEFAULTS.prefix);
  const [sequenceLength, setSequenceLength] = useState(String(ORDER_ID_DEFAULTS.sequenceLength));
  const [nextSequence, setNextSequence] = useState('1');

  /** From the server: the highest sequence ever issued, and whether the stored
   *  config was usable (a corrupted document falls back to the default, and the
   *  admin should be told rather than left to wonder). */
  const [highestUsedSequence, setHighestUsedSequence] = useState(0);
  const [storedConfigUsable, setStoredConfigUsable] = useState(true);

  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState({});

  const draft = useMemo(
    () => ({
      format,
      prefix,
      sequenceLength: Number.parseInt(sequenceLength, 10),
      nextSequence: Number.parseInt(nextSequence, 10),
    }),
    [format, prefix, sequenceLength, nextSequence]
  );

  const validation = useMemo(
    () => validateOrderIdConfig(draft, { highestUsedSequence }),
    [draft, highestUsedSequence]
  );

  /**
   * The preview. Rendered locally on every keystroke — waiting for the server
   * would make this feel broken — and confirmed against the server on save.
   * `sequence` is the number the next order would take if the admin saved now.
   */
  const previewSequence = Number.isFinite(draft.nextSequence) && draft.nextSequence > 0
    ? draft.nextSequence
    : highestUsedSequence + 1;

  const preview = useMemo(
    () => renderOrderId(draft, { sequence: previewSequence }),
    [draft, previewSequence]
  );

  const previewAfter = useMemo(
    () => renderOrderId(draft, { sequence: previewSequence + 1 }),
    [draft, previewSequence]
  );

  const previewIsGuessable = !orderIdCarriesOwnEntropy(preview);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return (
      normalizeFormatInput(format) !== saved.format ||
      normalizePrefixInput(prefix) !== saved.prefix ||
      Number.parseInt(sequenceLength, 10) !== saved.sequenceLength ||
      Number.parseInt(nextSequence, 10) !== saved.nextSequence
    );
  }, [saved, format, prefix, sequenceLength, nextSequence]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await authFetch('/api/admin/order-id');
      if (!response.ok) throw new Error(await readApiError(response, 'Failed to load Order ID settings'));

      const data = await response.json();
      setSaved(data.config);
      setFormat(data.config.format);
      setPrefix(data.config.prefix);
      setSequenceLength(String(data.config.sequenceLength));
      setNextSequence(String(data.config.nextSequence));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
      setStoredConfigUsable(data.storedConfigUsable !== false);
      setTouched({});
    } catch (error) {
      console.error('[orderId] load failed:', error);
      setLoadError(error.message || 'Failed to load Order ID settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (!validation.ok || saving) return;

    setSaving(true);
    try {
      const response = await authFetch('/api/admin/order-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: normalizeFormatInput(format),
          prefix: normalizePrefixInput(prefix),
          sequenceLength: Number.parseInt(sequenceLength, 10),
          nextSequence: Number.parseInt(nextSequence, 10),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The server's validation is authoritative — surface its per-field
        // messages rather than a generic failure.
        if (data.errors) {
          // The messages are also marked below so the inline errors appear —
          // the toast is for the case where the admin has scrolled elsewhere.
          Object.values(data.errors).forEach((message) => toast.error(message));
          setTouched({ format: true, prefix: true, sequenceLength: true, nextSequence: true });
        } else {
          toast.error(data.error || 'Could not save the Order ID settings');
        }
        return;
      }

      setSaved(data.config);
      setFormat(data.config.format);
      setPrefix(data.config.prefix);
      setSequenceLength(String(data.config.sequenceLength));
      setNextSequence(String(data.config.nextSequence));
      setHighestUsedSequence(Number(data.highestUsedSequence) || 0);
      setTouched({});

      toast.success(`Order IDs will now use ${data.config.format.replace(/\{[^}]+\}/g, '…')}`);
    } catch (error) {
      console.error('[orderId] save failed:', error);
      toast.error(error.message || 'Could not save the Order ID settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setFormat(ORDER_ID_DEFAULTS.format);
    setPrefix(ORDER_ID_DEFAULTS.prefix);
    setSequenceLength(String(ORDER_ID_DEFAULTS.sequenceLength));
    // Never reset the sequence itself — rewinding it is exactly what the
    // validation above exists to prevent.
    setNextSequence(String(highestUsedSequence + 1));
    setTouched({});
  };

  const discardChanges = () => {
    if (!saved) return;
    setFormat(saved.format);
    setPrefix(saved.prefix);
    setSequenceLength(String(saved.sequenceLength));
    setNextSequence(String(saved.nextSequence));
    setTouched({});
  };

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Please select the text and copy it manually.');
    }
  };

  /* Errors show once a field has been touched, or immediately on save — so a
     pristine form never greets the admin in red. */
  const errorFor = (field) => (touched[field] ? validation.errors[field] : undefined);

  const PreviewRow = ({ label, value }) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="label-caps" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="tabular break-all text-right text-sm font-bold"
        style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono, monospace)' }}
      >
        {value}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-page bg-[var(--surface-page)] text-[var(--text-body)]">
        <AdminHeader title="Settings" backFallback="/dashboard" />
        <div className="shell section-pad-sm">
          <div className="mb-8 space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-10 w-72" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-56 w-full" rounded="var(--r-lg)" />
            <Skeleton className="h-48 w-full" rounded="var(--r-lg)" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page bg-[var(--surface-page)] text-[var(--text-body)]">
      <AdminHeader
        title="Settings"
        backFallback="/dashboard"
        controls={
          <Link to="/orders" className="hidden text-xs font-semibold sm:inline" style={{ color: 'var(--text-muted)' }}>
            Orders
          </Link>
        }
      />

      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-[1100px] px-4 py-5 lg:px-8 lg:py-8"
      >
        {/* ---- Breadcrumb: Settings → Orders → Order ID ---- */}
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <li className="font-semibold" style={{ color: 'var(--text-strong)' }}>Settings</li>
            <li aria-hidden="true">/</li>
            <li className="font-semibold" style={{ color: 'var(--text-strong)' }}>Orders</li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">Order ID</li>
          </ol>
        </nav>

        <h2 className="text-xl font-bold leading-snug" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
          Order ID
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Choose how new order IDs are generated. IDs are created by the server when an order is
          placed — this setting only decides what the next one will look like.
        </p>

        {loadError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-[var(--r-md)] border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--crimson-600)', background: 'rgba(195,58,20,0.06)', color: 'var(--crimson-600)' }}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {loadError}{' '}
              <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
                Try again
              </button>
            </span>
          </div>
        )}

        {!storedConfigUsable && !loadError && (
          <div
            role="status"
            className="mt-5 flex items-start gap-2.5 rounded-[var(--r-md)] border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--gold-500)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" style={{ color: 'var(--gold-500)' }} />
            <span>
              The stored format could not be read safely, so the default format is in force. Saving
              from here will replace it.
            </span>
          </div>
        )}

        <form onSubmit={save} className="mt-6 space-y-5" noValidate>
          <FormSection
            index={1}
            icon={Hash}
            title="Order ID Format"
            description="Build the ID from blocks and literal text. Use only letters, numbers, hyphens and underscores — “#” is not allowed because it breaks links."
          >
            {/* ---- Preview: the point of the screen ---- */}
            <div
              className="rounded-[var(--r-md)] border p-4"
              style={{ borderColor: validation.ok ? 'var(--hairline)' : 'var(--crimson-600)', background: 'var(--surface-sunken)' }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                  Live Preview
                </p>
              </div>

              <div className="space-y-2.5">
                <PreviewRow label="Order ID Preview" value={preview} />
                <PreviewRow label="Next Order ID" value={previewAfter} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyPreview}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-200"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
                >
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy preview'}
                </button>

                {!validation.ok && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>
                    Fix the highlighted field — the preview shows what this format would produce.
                  </span>
                )}
              </div>

              {/* Flag a guessable ID once, plainly. It is not an error — the
                  tracking page asks for the last four phone digits regardless —
                  but an admin choosing a date-only format should know. */}
              {validation.ok && previewIsGuessable && (
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    This ID is predictable, so it is not proof of ownership on its own. Customers
                    are asked for the last 4 digits of their phone number when tracking. That is
                    already the case for every ID — this is just a reminder if you were expecting
                    the number itself to be secret.
                  </span>
                </p>
              )}
            </div>

            <FormField
              id="order-id-format"
              label="Format"
              required
              hint="Literal text plus blocks. Case is normalised on save."
              error={errorFor('format')}
            >
              <input
                id="order-id-format"
                type="text"
                value={format}
                onChange={(e) => { setFormat(e.target.value); setTouched((t) => ({ ...t, format: true })); }}
                onBlur={() => setTouched((t) => ({ ...t, format: true }))}
                aria-invalid={Boolean(errorFor('format'))}
                aria-describedby={errorFor('format') ? 'order-id-format-error' : 'order-id-format-hint'}
                className={inputClass}
                style={errorFor('format') ? invalidStyle : inputStyle}
                spellCheck={false}
                autoComplete="off"
                maxLength={ORDER_ID_LIMITS.maxOrderIdLength * 2}
              />
            </FormField>

            {/* ---- Block picker: insert rather than remember the syntax ---- */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                Insert a block
              </p>
              <div className="flex flex-wrap gap-2">
                {ORDER_ID_TOKENS.map((token) => {
                  const block = `{${token}}`;
                  const required = token === 'SEQUENCE';
                  return (
                    <button
                      key={token}
                      type="button"
                      title={TOKEN_HELP[token]}
                      onClick={() => {
                        setFormat((current) => current + block);
                        setTouched((t) => ({ ...t, format: true }));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200"
                      style={{
                        borderColor: required ? 'var(--gold-500)' : 'var(--hairline)',
                        background: 'var(--surface-card)',
                        color: 'var(--text-body)',
                      }}
                    >
                      <span className="tabular">{block}</span>
                      {required && (
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--gold-500)' }}>
                          required
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </FormSection>

          <FormSection
            index={2}
            icon={Hash}
            title="Prefix & Sequence"
            description="The prefix is any short code you like. The sequence is the running order number; it must never go backwards."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="order-id-prefix"
                label="Prefix"
                required
                hint="Letters, numbers and underscores. CH for Crackers Hyderabad."
                error={errorFor('prefix')}
              >
                <input
                  id="order-id-prefix"
                  type="text"
                  value={prefix}
                  onChange={(e) => { setPrefix(e.target.value); setTouched((t) => ({ ...t, prefix: true })); }}
                  onBlur={() => setTouched((t) => ({ ...t, prefix: true }))}
                  aria-invalid={Boolean(errorFor('prefix'))}
                  aria-describedby={errorFor('prefix') ? 'order-id-prefix-error' : 'order-id-prefix-hint'}
                  className={inputClass}
                  style={errorFor('prefix') ? invalidStyle : inputStyle}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={12}
                />
              </FormField>

              <FormField
                id="order-id-sequence-length"
                label="Sequence Length"
                required
                hint={`${ORDER_ID_LIMITS.minSequenceLength}–${ORDER_ID_LIMITS.maxSequenceLength} digits. 6 gives 000001.`}
                error={errorFor('sequenceLength')}
              >
                <input
                  id="order-id-sequence-length"
                  type="number"
                  inputMode="numeric"
                  min={ORDER_ID_LIMITS.minSequenceLength}
                  max={ORDER_ID_LIMITS.maxSequenceLength}
                  value={sequenceLength}
                  onChange={(e) => { setSequenceLength(e.target.value); setTouched((t) => ({ ...t, sequenceLength: true })); }}
                  onBlur={() => setTouched((t) => ({ ...t, sequenceLength: true }))}
                  aria-invalid={Boolean(errorFor('sequenceLength'))}
                  aria-describedby={errorFor('sequenceLength') ? 'order-id-sequence-length-error' : 'order-id-sequence-length-hint'}
                  className={inputClass}
                  style={errorFor('sequenceLength') ? invalidStyle : inputStyle}
                />
              </FormField>
            </div>

            <FormField
              id="order-id-next-sequence"
              label="Next Sequence Number"
              required
              hint={`Highest sequence issued so far: ${highestUsedSequence}. The next order will use the number below.`}
              error={errorFor('nextSequence')}
            >
              <input
                id="order-id-next-sequence"
                type="number"
                inputMode="numeric"
                min={highestUsedSequence + 1}
                value={nextSequence}
                onChange={(e) => { setNextSequence(e.target.value); setTouched((t) => ({ ...t, nextSequence: true })); }}
                onBlur={() => setTouched((t) => ({ ...t, nextSequence: true }))}
                aria-invalid={Boolean(errorFor('nextSequence'))}
                aria-describedby={errorFor('nextSequence') ? 'order-id-next-sequence-error' : 'order-id-next-sequence-hint'}
                className={inputClass}
                style={errorFor('nextSequence') ? invalidStyle : inputStyle}
              />
            </FormField>

            {/* The rule behind that floor, stated before it is hit. */}
            <p className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                The sequence can only move forward. Going backwards would issue an ID that already
                belongs to another order, and tracking would then show the wrong customer their order.
                You can jump ahead — useful after restoring a backup — but never back.
              </span>
            </p>
          </FormSection>

          {/* ---- The safety rule, in the place it matters ---- */}
          <motion.div
            variants={revealVariants(reduced, 12)}
            className="rounded-[var(--r-lg)] border px-5 py-4"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
              Existing orders are never changed
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              An order ID is written once, when the order is placed, and read from there ever after.
              Saving a new format changes what the <em>next</em> order is called. Orders already
              placed keep the ID they were given — in your list, on their invoice, and in the emails
              and messages they were sent.
            </p>
          </motion.div>

          {/* ---- Save bar ---- */}
          <div
            className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t px-1 py-3"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetToDefaults}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors duration-200"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset format
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={discardChanges}
                  className="h-9 rounded-full px-3 text-xs font-semibold underline underline-offset-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Discard changes
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!dirty || saving || !validation.ok}
              onClick={() => setTouched({ format: true, prefix: true, sequenceLength: true, nextSequence: true })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-xs font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: dirty && validation.ok ? 'var(--grad-ember)' : 'linear-gradient(122deg, #A9A29A, #8B8377)' }}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save Order ID format'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default OrderIdSettings;