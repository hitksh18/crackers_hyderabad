import { CheckCircle2, CircleDot, Clock, MapPin, Package, Truck, XCircle } from 'lucide-react';

/**
 * One status vocabulary for the operations screens.
 *
 * Every tone carries a colour AND a word AND an icon — colour is never the
 * only signal. `dot` is the icon-only colour, chosen to clear 3:1 against both
 * the light and the dark card surface; `badge` is the token badge class.
 */
export const STATUS_TONES = {
  Pending: { badge: 'badge-gold', Icon: Clock, dot: 'var(--gold-500)' },
  Confirmed: { badge: 'badge-leaf', Icon: CheckCircle2, dot: '#3E9A6B' },
  Packed: { badge: 'badge-gold', Icon: Package, dot: 'var(--gold-500)' },
  Shipped: { badge: 'badge-ember', Icon: Truck, dot: 'var(--ember-500)' },
  'Out for Delivery': { badge: 'badge-ember', Icon: MapPin, dot: 'var(--ember-500)' },
  Delivered: { badge: 'badge-leaf', Icon: CheckCircle2, dot: '#3E9A6B' },
  Completed: { badge: 'badge-leaf', Icon: CheckCircle2, dot: '#3E9A6B' },
  Cancelled: { badge: 'badge-crimson', Icon: XCircle, dot: '#E14848' },
};

export const STATUS_FALLBACK = { badge: 'badge-neutral', Icon: CircleDot, dot: 'var(--text-muted)' };

export const getStatusTone = (status) => STATUS_TONES[status] || STATUS_FALLBACK;
