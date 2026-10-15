import { useState } from 'react';
import { BadgePercent, Loader2, Percent, TicketPercent, Trash2, TriangleAlert } from 'lucide-react';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const offerLabel = (offer) => (
  offer.discountType === 'percentage'
    ? `${offer.discountValue}% OFF`
    : `₹${Number(offer.discountValue || 0).toLocaleString('en-IN')} OFF`
);

/* Human-readable provenance for the currently saved discount. Derived from
   the persisted order only — old orders without metadata fall back to the
   coupon/percent fields they do carry. */
const sourceInfo = (order) => {
  const amount = Number(order.discount) || 0;
  if (order.discountSource === 'ADMIN_PERCENTAGE') {
    return {
      title: 'Custom discount',
      detail: `${order.discountPercent}% OFF`,
      override: true,
      amount,
    };
  }
  if (order.coupon?.code || order.couponCode) {
    const code = order.coupon?.code || order.couponCode;
    const pct = Number(order.coupon?.discountValue);
    const detail = order.coupon?.discountType === 'percentage' && Number.isFinite(pct)
      ? `${pct}% OFF`
      : (order.discountPercent != null ? `${order.discountPercent}% OFF` : null);
    return { title: code, detail, override: order.adminOverride === true, amount };
  }
  if (amount > 0) {
    return { title: 'Counter discount', detail: order.discountPercent != null ? `${order.discountPercent}%` : null, override: false, amount };
  }
  return null;
};

const SourceBadge = ({ override }) => (
  override ? (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: 'rgba(210, 166, 79, 0.16)', color: 'var(--gold-600)', border: '1px solid rgba(210, 166, 79, 0.45)' }}
      title="Normal coupon eligibility was bypassed by an administrator."
    >
      Admin override
    </span>
  ) : (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: 'rgba(62, 154, 107, 0.12)', color: '#3E9A6B', border: '1px solid rgba(62, 154, 107, 0.35)' }}
    >
      Eligible coupon
    </span>
  )
);

/**
 * Discount box for the order editor.
 *
 * Presentational only: every figure comes from the server (the saved order
 * plus the coupon preview, both evaluated against the CURRENT persisted
 * order). Three explicit admin paths — Apply Coupon (optionally as an
 * ADMIN OVERRIDE that waives normal eligibility), Custom % and Remove —
 * each forwarded to its dedicated admin endpoint, which recalculates and
 * persists the authoritative values.
 *
 * While the item list has unsaved changes the discount actions stay
 * disabled: discounts always apply to the saved order, never to
 * edited-but-unsaved lines.
 */
const MODES = [
  { id: 'coupon', label: 'Apply Coupon' },
  { id: 'custom', label: 'Custom %' },
  { id: 'remove', label: 'Remove' },
];

const OrderDiscountSection = ({
  order = {},
  current = null,
  eligible = [],
  allOffers = [],
  loading = false,
  error = '',
  onApplyCoupon = () => {},
  onApplyCustom = () => {},
  onRemove = () => {},
  busy = false,
  gated = false,
}) => {
  const [mode, setMode] = useState('coupon');
  const [couponCode, setCouponCode] = useState('');
  const [customPct, setCustomPct] = useState('');

  const savedSubtotal = Number(order.subtotal) || 0;
  const applied = sourceInfo(order);
  const offers = Array.isArray(allOffers) ? allOffers : [];
  const chosen = offers.find((o) => o.code === couponCode) || null;

  const pctValue = parseFloat(customPct);
  const pctValid = Number.isFinite(pctValue) && pctValue >= 0.01 && pctValue <= 100;
  const customDiscount = pctValid ? Math.round(savedSubtotal * (pctValue / 100) * 100) / 100 : 0;
  const customTotal = Math.max(0, Math.round((savedSubtotal - customDiscount) * 100) / 100);

  return (
    <div
      className="mt-4 rounded-[var(--r-md)] border p-3"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
    >
      <div className="flex items-center gap-2">
        <TicketPercent className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--gold-600)' }} />
        <h3 className="card-title">Discount</h3>
      </div>

      {/* Current state — always the saved order, never a preview. */}
      {applied ? (
        <div className="mt-2.5 rounded-[var(--r-sm)] border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>{applied.title}</span>
            <SourceBadge override={applied.override} />
          </div>
          {applied.detail && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{applied.detail}</p>
          )}
          {applied.override && (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Normal coupon eligibility was bypassed by an administrator.
            </p>
          )}
          <div className="tabular mt-2 flex items-baseline justify-between gap-3 text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Discount</span>
            <span className="font-bold" style={{ color: '#3E9A6B' }}>−{inr(applied.amount)}</span>
          </div>
          <div className="tabular flex items-baseline justify-between gap-3 text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Final total</span>
            <span className="font-bold" style={{ color: 'var(--text-strong)' }}>{inr(order.total)}</span>
          </div>
          <button
            type="button"
            onClick={() => setMode('coupon')}
            className="btn-outline mt-2.5 w-full"
            style={{ minHeight: 40 }}
          >
            Change
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Current: <span className="font-semibold" style={{ color: 'var(--text-body)' }}>No discount applied</span>
        </p>
      )}

      {/* Mode tabs */}
      <div className="mt-3 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Discount actions">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className="rounded-[var(--r-sm)] border px-2 text-xs font-bold transition-[background-color,border-color]"
            style={{
              minHeight: 38,
              borderColor: mode === m.id ? 'var(--ember-600)' : 'var(--hairline)',
              background: mode === m.id ? 'rgba(195, 58, 20, 0.10)' : 'var(--surface-card)',
              color: mode === m.id ? 'var(--text-strong)' : 'var(--text-muted)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Checking discounts…
        </p>
      ) : error ? (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>{error}</p>
      ) : (
        <>
          {mode === 'coupon' && (
            <div className="mt-2.5">
              {offers.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No coupons exist yet.</p>
              ) : (
                <>
                  <label htmlFor="order-discount-coupon" className="label-caps">Coupon</label>
                  <select
                    id="order-discount-coupon"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    disabled={busy || gated}
                    className="input-premium mt-1 w-full"
                  >
                    <option value="">Select a coupon…</option>
                    {offers.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code} — {offerLabel(o)}{o.qualifies ? '' : ' (override)'}
                      </option>
                    ))}
                  </select>
                  {chosen && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <p className="tabular">Normal minimum: {inr(chosen.minimumOrderValue)}</p>
                      <p className="tabular">Order subtotal: {inr(savedSubtotal)}</p>
                      {chosen.qualifies ? (
                        <p className="mt-1.5"><SourceBadge override={false} /></p>
                      ) : (
                        <div
                          className="mt-1.5 flex items-start gap-1.5 rounded-[var(--r-sm)] border p-2"
                          style={{ borderColor: 'rgba(210, 166, 79, 0.45)', background: 'rgba(210, 166, 79, 0.10)' }}
                          role="note"
                        >
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: 'var(--gold-600)' }} />
                          <p className="text-[11px]" style={{ color: 'var(--text-body)' }}>
                            <span className="font-bold">Admin override</span> — this coupon does not
                            normally qualify{chosen.reason ? `: ${chosen.reason}` : '.'} Admins can
                            override this requirement.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => chosen && onApplyCoupon(chosen.code, { override: !chosen.qualifies })}
                    disabled={!chosen || busy || gated}
                    className="btn-primary mt-2.5 w-full"
                    style={{ minHeight: 44 }}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {busy ? 'Applying…' : chosen ? `Apply ${chosen.code}` : 'Apply discount'}
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'custom' && (
            <div className="mt-2.5">
              <p className="label-caps flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" aria-hidden="true" />
                Custom discount
              </p>
              <div className="mt-1 flex items-center gap-2">
                <label htmlFor="order-discount-pct" className="sr-only">Discount percentage</label>
                <input
                  id="order-discount-pct"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={customPct}
                  onChange={(e) => setCustomPct(e.target.value)}
                  placeholder="10"
                  disabled={busy || gated}
                  className="input-premium tabular w-28"
                />
                <span className="text-sm font-bold" style={{ color: 'var(--text-body)' }}>%</span>
                <span className="tabular ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                  {pctValid ? `−${inr(customDiscount)} → ${inr(customTotal)}` : '0.01% – 100%'}
                </span>
              </div>
              {customPct !== '' && !pctValid && (
                <p className="mt-1 text-[11px]" style={{ color: '#E14848' }}>
                  Enter a percentage between 0.01 and 100.
                </p>
              )}
              <button
                type="button"
                onClick={() => pctValid && onApplyCustom(pctValue)}
                disabled={!pctValid || busy || gated}
                className="btn-primary mt-2.5 w-full"
                style={{ minHeight: 44 }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? 'Applying…' : 'Apply custom discount'}
              </button>
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Replaces any existing discount. The server recalculates the final total.
              </p>
            </div>
          )}

          {mode === 'remove' && (
            <div className="mt-2.5">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Remove the current discount. The total returns to the full subtotal.
              </p>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy || gated || (!applied && !(current && current.code))}
                className="btn-outline mt-2 w-full"
                style={{ minHeight: 44 }}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                {busy ? 'Working…' : 'Remove discount'}
              </button>
            </div>
          )}

          {current && current.valid === false && (
            <div
              className="mt-2.5 flex items-start gap-1.5 rounded-[var(--r-sm)] border p-2"
              style={{ borderColor: 'rgba(203, 42, 42, 0.32)', background: 'rgba(203, 42, 42, 0.08)' }}
              role="alert"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: '#E14848' }} />
              <p className="text-[11px]" style={{ color: 'var(--text-body)' }}>
                <span className="font-bold">Current discount is no longer eligible.</span>{' '}
                {current.reason || 'It no longer satisfies the coupon rules.'}
              </p>
            </div>
          )}

          {gated && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Save item changes first — discounts always apply to the saved order.
            </p>
          )}
        </>
      )}

      {eligible.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--gold-600)' }}>
          <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
          {eligible.length} eligible discount{eligible.length === 1 ? '' : 's'} available
        </p>
      )}
    </div>
  );
};

export default OrderDiscountSection;
