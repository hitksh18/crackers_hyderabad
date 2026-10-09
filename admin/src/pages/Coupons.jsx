import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, RefreshCw, Pencil, Copy, Eye, Power, Trash2, X } from 'lucide-react';
import AdminHeader from '../components/admin/AdminHeader';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { authFetch, readApiError } from '../utils/apiClient';
import toast from '../utils/toast';
import { PRODUCT_CATEGORIES } from '../config/categories';

const inputStyle = {
  borderColor: 'var(--hairline)',
  color: 'var(--text-strong)',
  background: 'var(--surface-sunken)',
};
const cardStyle = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
};

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '10',
  minimumOrderValue: '0',
  maximumDiscount: '',
  usageLimit: '',
  perCustomerLimit: '',
  startsAt: '',
  expiresAt: '',
  status: 'active',
  applicableProductIds: '',
  applicableCategoryIds: [],
};

const toForm = (coupon) => ({
  code: coupon?.code || '',
  description: coupon?.description || '',
  discountType: coupon?.discountType || 'percentage',
  discountValue: String(coupon?.discountValue ?? '10'),
  minimumOrderValue: String(coupon?.minimumOrderValue ?? '0'),
  maximumDiscount: coupon?.maximumDiscount == null ? '' : String(coupon.maximumDiscount),
  usageLimit: coupon?.usageLimit == null ? '' : String(coupon.usageLimit),
  perCustomerLimit: coupon?.perCustomerLimit == null ? '' : String(coupon.perCustomerLimit),
  startsAt: coupon?.startsAt ? coupon.startsAt.slice(0, 16) : '',
  expiresAt: coupon?.expiresAt ? coupon.expiresAt.slice(0, 16) : '',
  status: coupon?.status || 'active',
  applicableProductIds: Array.isArray(coupon?.applicableProductIds) ? coupon.applicableProductIds.join(', ') : '',
  applicableCategoryIds: Array.isArray(coupon?.applicableCategoryIds) ? coupon.applicableCategoryIds : [],
});

const discountLabel = (coupon) => {
  if (!coupon) return '—';
  return coupon.discountType === 'percentage'
    ? `${coupon.discountValue}% OFF`
    : `₹${Number(coupon.discountValue || 0).toLocaleString('en-IN')} OFF`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Coupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const { isOpen, isConfirming, modalConfig, openModal, closeModal, handleConfirm } = useModal();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [listRes, statsRes] = await Promise.all([
        authFetch('/api/admin/coupons'),
        authFetch('/api/admin/coupons/stats'),
      ]);
      if (!listRes.ok) throw new Error(await readApiError(listRes, 'Failed to load coupons'));
      const listData = await listRes.json();
      setCoupons(listData.coupons || []);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error('[coupons] load failed:', error);
      if (!quiet) setLoadError(error.message || 'Failed to load coupons');
      else toast.error(error.message || 'Failed to refresh coupons');
    } finally {
      if (!quiet) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (coupon) => {
    setEditing(coupon);
    setForm(toForm(coupon));
    setFormErrors({});
    setShowForm(true);
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveForm = async (e) => {
    e.preventDefault();
    if (formSaving) return;
    setFormSaving(true);
    setFormErrors({});
    try {
      const payload = {
        ...form,
        applicableProductIds: String(form.applicableProductIds || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const url = editing ? `/api/admin/coupons/${editing.id}` : '/api/admin/coupons';
      const response = await authFetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors) setFormErrors(data.errors);
        toast.error(data.error || 'Could not save the coupon');
        return;
      }
      toast.success(editing ? 'Coupon updated' : 'Coupon created');
      setShowForm(false);
      load(true);
    } catch (error) {
      toast.error(error.message || 'Could not save the coupon');
    } finally {
      setFormSaving(false);
    }
  };

  const toggleStatus = async (coupon) => {
    try {
      const response = await authFetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toForm(coupon), code: coupon.code, status: coupon.status === 'active' ? 'inactive' : 'active' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update the coupon');
      toast.success(data.coupon.status === 'active' ? 'Coupon activated' : 'Coupon deactivated — new checkouts can no longer use it');
      load(true);
    } catch (error) {
      toast.error(error.message || 'Could not update the coupon');
    }
  };

  const duplicateCoupon = async (coupon) => {
    try {
      const response = await authFetch(`/api/admin/coupons/${coupon.id}/duplicate`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not duplicate the coupon');
      toast.success(`Duplicated as ${data.coupon.code} (inactive, zero usage)`);
      load(true);
    } catch (error) {
      toast.error(error.message || 'Could not duplicate the coupon');
    }
  };

  const deleteCoupon = (coupon) => {
    openModal({
      title: 'Delete Coupon',
      message: `Delete coupon "${coupon.code}"?\n\nCoupons already used in orders cannot be deleted — deactivate them instead.`,
      type: 'danger',
      confirmText: 'Delete Coupon',
      cancelText: 'Cancel',
      pendingText: 'Deleting...',
      onConfirm: async () => {
        try {
          const response = await authFetch(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Could not delete the coupon');
          toast.success('Coupon deleted');
          load(true);
          return true;
        } catch (error) {
          toast.error(error.message || 'Could not delete the coupon');
          return false;
        }
      },
    });
  };

  const fieldError = (key) => formErrors[key] && (
    <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{formErrors[key]}</p>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        busy={isConfirming}
        busyText={modalConfig.pendingText}
        {...modalConfig}
      />
      <AdminHeader
        title="Coupons"
        backFallback="/dashboard"
        controls={(
          <>
            <button type="button" onClick={refresh} disabled={refreshing || loading} className="ax-btn" title="Refresh coupon list">
              <RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button type="button" onClick={openCreate} className="ax-btn ax-btn-primary">
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">New Coupon</span>
              <span className="sm:hidden">New</span>
            </button>
          </>
        )}
      />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 lg:px-8 xl:px-10">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Loading coupons">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} />
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            icon={Tag}
            title="Unable to load coupons"
            description={loadError}
            tone="alert"
            action={<button type="button" onClick={() => load()} className="ax-btn">Retry</button>}
          />
        ) : (
          <>
            {/* Live aggregates — read off the coupon documents, no order scans. */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Active offers', value: stats?.activeOffers ?? coupons.filter((c) => c.status === 'active').length },
                { label: 'Coupon uses', value: stats?.couponUses ?? coupons.reduce((n, c) => n + (Number(c.usageCount) || 0), 0) },
                { label: 'Discount given', value: `₹${Number(stats?.discountGiven ?? coupons.reduce((n, c) => n + (Number(c.totalDiscountGiven) || 0), 0)).toLocaleString('en-IN')}` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border p-4" style={cardStyle}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                  <p className="tabular mt-1 text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border" style={cardStyle}>
              {coupons.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="No coupons yet"
                  description="Create your first coupon to offer discounts at checkout."
                  action={<button type="button" onClick={openCreate} className="ax-btn ax-btn-primary">New Coupon</button>}
                />
              ) : (
                <div className="scroll-x overflow-x-auto">
                  <table className="w-full min-w-[52rem] border-collapse text-left">
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken)' }}>
                        {['Coupon / Description', 'Discount / Minimum', 'Usage / Performance', 'Validity', 'Status', 'Actions'].map((h, i) => (
                          <th key={h} className={`label-caps whitespace-nowrap px-4 py-2.5 ${i === 0 ? 'text-left' : i >= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((coupon) => (
                        <tr key={coupon.id} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                          <td className="px-4 py-2.5">
                            <p className="tabular text-[13px] font-bold" style={{ color: 'var(--text-strong)' }}>{coupon.code}</p>
                            <p className="mt-0.5 max-w-[16rem] truncate text-xs" style={{ color: 'var(--text-muted)' }} title={coupon.description || ''}>
                              {coupon.description || '—'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[13px]" style={{ color: 'var(--text-body)' }}>
                            <p className="font-semibold" style={{ color: 'var(--leaf-600)' }}>{discountLabel(coupon)}</p>
                            <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              Min ₹{Number(coupon.minimumOrderValue || 0).toLocaleString('en-IN')}
                              {coupon.maximumDiscount != null && ` · Cap ₹${Number(coupon.maximumDiscount).toLocaleString('en-IN')}`}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[13px]" style={{ color: 'var(--text-body)' }}>
                            <p className="tabular font-semibold" style={{ color: 'var(--text-strong)' }}>
                              {Number(coupon.usageCount) || 0}{coupon.usageLimit != null ? ` / ${coupon.usageLimit}` : ' / ∞'}
                            </p>
                            <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              −₹{Number(coupon.totalDiscountGiven || 0).toLocaleString('en-IN')}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(coupon.startsAt)} → {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'No expiry'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: coupon.status === 'active' ? 'var(--delta-up, #4fb483)' : 'var(--text-subtle)' }}
                              />
                              <span style={{ color: coupon.status === 'active' ? 'var(--delta-up, #4fb483)' : 'var(--text-subtle)' }}>
                                {coupon.status === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              {[
                                { title: 'Details', icon: Eye, fn: () => setDetail(coupon) },
                                { title: 'Edit', icon: Pencil, fn: () => openEdit(coupon) },
                                { title: 'Duplicate', icon: Copy, fn: () => duplicateCoupon(coupon) },
                                { title: coupon.status === 'active' ? 'Deactivate' : 'Activate', icon: Power, fn: () => toggleStatus(coupon) },
                                { title: 'Delete', icon: Trash2, fn: () => deleteCoupon(coupon), danger: true },
                              ].map(({ title, icon: Icon, fn, danger }) => (
                                <button
                                  key={title}
                                  type="button"
                                  title={title}
                                  aria-label={`${title} ${coupon.code}`}
                                  onClick={fn}
                                  className="grid h-8 w-8 place-items-center rounded-lg border transition-colors"
                                  style={{
                                    borderColor: 'var(--hairline)',
                                    background: 'var(--surface-sunken)',
                                    color: danger ? 'var(--delta-down, #f2716b)' : 'var(--text-muted)',
                                  }}
                                >
                                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ---------- create / edit ---------- */}
      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => !formSaving && setShowForm(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border p-5 shadow-xl"
            style={cardStyle}
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit coupon' : 'New coupon'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                {editing ? `Edit ${editing.code}` : 'New Coupon'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full" style={{ border: '1px solid var(--hairline)' }}>
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveForm} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Coupon Code</span>
                  <input
                    className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm font-semibold"
                    style={inputStyle}
                    value={form.code}
                    onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                    placeholder="MELA10"
                    disabled={Boolean(editing && Number(editing.usageCount || 0) > 0)}
                  />
                  {editing && Number(editing.usageCount || 0) > 0 && (
                    <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>Code is locked — this coupon has been used.</span>
                  )}
                  {fieldError('code')}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Status</span>
                  <select className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  {fieldError('status')}
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Description</span>
                <input className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="10% off festive orders" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Discount Type</span>
                  <select className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.discountType} onChange={(e) => set({ discountType: e.target.value })}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                  {fieldError('discountType')}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>
                    Discount Value {form.discountType === 'percentage' ? '(0–100)' : '(₹)'}
                  </span>
                  <input type="number" min="0" className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
                  {fieldError('discountValue')}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Minimum Order Value (₹)</span>
                  <input type="number" min="0" className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.minimumOrderValue} onChange={(e) => set({ minimumOrderValue: e.target.value })} />
                  {fieldError('minimumOrderValue')}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Maximum Discount (₹, optional)</span>
                  <input type="number" min="0" className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.maximumDiscount} onChange={(e) => set({ maximumDiscount: e.target.value })} placeholder="No cap" />
                  {fieldError('maximumDiscount')}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Usage Limit (optional)</span>
                  <input type="number" min="1" className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} placeholder="Unlimited" />
                  {fieldError('usageLimit')}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Per-Customer Limit (optional)</span>
                  <input type="number" min="1" className="tabular h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} placeholder="Unlimited" />
                  {fieldError('perCustomerLimit')}
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Starts (optional)</span>
                  <input type="datetime-local" className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
                  {fieldError('startsAt')}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Expires (optional)</span>
                  <input type="datetime-local" className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
                  {fieldError('expiresAt')}
                </label>
              </div>
              <fieldset>
                <legend className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Applicable Categories (optional — empty means all)</legend>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-[var(--r-md)] border p-2" style={inputStyle}>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <label key={cat.value} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}>
                      <input
                        type="checkbox"
                        checked={form.applicableCategoryIds.includes(cat.value)}
                        onChange={(e) => set({
                          applicableCategoryIds: e.target.checked
                            ? [...form.applicableCategoryIds, cat.value]
                            : form.applicableCategoryIds.filter((v) => v !== cat.value),
                        })}
                      />
                      {cat.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-body)' }}>Applicable Product IDs, comma-separated (optional)</span>
                <input className="h-10 w-full rounded-[var(--r-md)] border px-3 text-sm" style={inputStyle} value={form.applicableProductIds} onChange={(e) => set({ applicableProductIds: e.target.value })} placeholder="abc123, def456" />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="h-10 rounded-full border px-4 text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Cancel</button>
                <button type="submit" disabled={formSaving} className="h-10 rounded-full px-5 text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}>
                  {formSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- details ---------- */}
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md rounded-2xl border p-5 shadow-xl" style={cardStyle} role="dialog" aria-modal="true" aria-label={`Coupon ${detail.code}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="tabular text-base font-bold" style={{ color: 'var(--text-strong)' }}>{detail.code}</h3>
                <p className="mt-0.5 text-sm" style={{ color: 'var(--leaf-600)' }}>{discountLabel(detail)}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full" style={{ border: '1px solid var(--hairline)' }}>
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              {[
                ['Description', detail.description || '—'],
                ['Status', detail.status === 'active' ? 'Active' : 'Inactive'],
                ['Minimum order', `₹${Number(detail.minimumOrderValue || 0).toLocaleString('en-IN')}`],
                ['Maximum discount', detail.maximumDiscount != null ? `₹${Number(detail.maximumDiscount).toLocaleString('en-IN')}` : 'No cap'],
                ['Usage', `${Number(detail.usageCount) || 0}${detail.usageLimit != null ? ` / ${detail.usageLimit}` : ' / Unlimited'}`],
                ['Per-customer limit', detail.perCustomerLimit != null ? detail.perCustomerLimit : 'Unlimited'],
                ['Starts', formatDate(detail.startsAt) === '—' ? 'Immediately' : formatDate(detail.startsAt)],
                ['Expires', detail.expiresAt ? formatDate(detail.expiresAt) : 'No expiry'],
                ['Created', formatDate(detail.createdAt)],
                ['Last updated', formatDate(detail.updatedAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                  <dd className="tabular text-right font-semibold" style={{ color: 'var(--text-strong)' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border p-3 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
              <div>
                <p className="tabular text-base font-bold" style={{ color: 'var(--text-strong)' }}>{Number(detail.usageCount) || 0}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Orders</p>
              </div>
              <div>
                <p className="tabular text-base font-bold" style={{ color: 'var(--text-strong)' }}>₹{Number(detail.totalDiscountGiven || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Discount given</p>
              </div>
              <div>
                <p className="tabular text-base font-bold" style={{ color: 'var(--text-strong)' }}>₹{Number(detail.totalRevenue || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Revenue</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Coupons;
