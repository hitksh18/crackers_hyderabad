import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch, readApiError } from '../utils/apiClient';

/**
 * Discount state for the order editor.
 *
 * The server is authoritative for everything money: this hook only fetches
 * the eligible-discount preview (evaluated against the CURRENT persisted
 * order) and forwards explicit admin decisions — a coupon CODE to apply,
 * nothing more. Amounts are never sent up and never trusted from the client.
 *
 * Returns { data, loading, error, selected, setSelected, busy, refresh,
 * applyCoupon, applyCustomPercent, removeCoupon }. apply/remove resolve to
 * the server's updated order payload ({ order, emailed, ... }) so the owning
 * page can merge it into state exactly like an items save.
 */
export function useOrderDiscount(orderId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!orderId) {
      setData(null);
      return null;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/orders/${orderId}/eligible-coupons`);
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Could not check eligible discounts'));
      }
      const payload = await response.json().catch(() => ({}));
      if (requestRef.current !== request) return null;
      setData(payload);
      // A previously selected code that is no longer offered must not stay armed.
      setSelected((prev) => {
        if (!prev) return prev;
        const offers = [...(payload.eligible || []), ...(payload.all || [])];
        return offers.some((c) => c.code === prev) ? prev : '';
      });
      return payload;
    } catch (err) {
      if (requestRef.current !== request) return null;
      setError(err.message || 'Could not check eligible discounts');
      return null;
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setData(null);
    setError('');
    setSelected('');
    if (orderId) refresh();
  }, [orderId, refresh]);

  const applyCoupon = useCallback(async (code, { override = false } = {}) => {
    if (!orderId || !code || busy) return null;
    setBusy(true);
    try {
      const response = await authFetch(`/api/admin/orders/${orderId}/coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...(override ? { override: true } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || await readApiError(response, 'Could not apply the discount'));
      }
      setSelected('');
      await refresh();
      return payload;
    } finally {
      setBusy(false);
    }
  }, [orderId, busy, refresh]);

  const applyCustomPercent = useCallback(async (percent) => {
    if (!orderId || busy) return null;
    setBusy(true);
    try {
      const response = await authFetch(`/api/admin/orders/${orderId}/discount-percent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || await readApiError(response, 'Could not apply the discount'));
      }
      await refresh();
      return payload;
    } finally {
      setBusy(false);
    }
  }, [orderId, busy, refresh]);

  const removeCoupon = useCallback(async () => {
    if (!orderId || busy) return null;
    setBusy(true);
    try {
      const response = await authFetch(`/api/admin/orders/${orderId}/coupon`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || await readApiError(response, 'Could not remove the discount'));
      }
      await refresh();
      return payload;
    } finally {
      setBusy(false);
    }
  }, [orderId, busy, refresh]);

  return { data, loading, error, selected, setSelected, busy, refresh, applyCoupon, applyCustomPercent, removeCoupon };
}
