import {
  Truck,
  Gift,
  BadgeCheck,
  Flame,
  Star,
  Sparkles,
  Rocket,
  Boxes,
  Tags,
  IndianRupee,
  ShieldCheck,
  CreditCard,
  Zap,
  Headphones,
  Package,
  Store,
  LayoutGrid,
  PackageSearch,
  CalendarDays,
} from 'lucide-react';
import { whyChoose } from '../components/home/homeData';

/* Icons the canvas may assign to a trust card, keyed by the stored name.
   Stored cards keep only the key; components are resolved here so both the
   public homepage and the canvas preview render the same icon. */
export const TRUST_ICON_OPTIONS = {
  Truck,
  Gift,
  BadgeCheck,
  Flame,
  Star,
  Sparkles,
  Rocket,
  Boxes,
  Tags,
  IndianRupee,
  ShieldCheck,
  CreditCard,
  Zap,
  Headphones,
  Package,
  Store,
  LayoutGrid,
  PackageSearch,
  CalendarDays,
};

export const DEFAULT_TRUST_ICON = 'ShieldCheck';

/**
 * Resolve stored trust cards ({ id, icon, title, text, enabled }) to
 * render-ready cards. Returns null when nothing custom is stored, so callers
 * fall back to the built-in `whyChoose` set and the page never blanks.
 */
export function resolveTrustCards(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return null;
  return stored.map((card, i) => ({
    id: card.id || `trust-${i}`,
    title: card.title || '',
    text: card.text || '',
    enabled: card.enabled !== false,
    icon: TRUST_ICON_OPTIONS[card.icon] || TRUST_ICON_OPTIONS[DEFAULT_TRUST_ICON],
  }));
}

export function defaultTrustCards() {
  const keyOf = (component) =>
    Object.keys(TRUST_ICON_OPTIONS).find((key) => TRUST_ICON_OPTIONS[key] === component) || DEFAULT_TRUST_ICON;
  return whyChoose.map((card, i) => ({
    id: `trust-${i}`,
    icon: keyOf(card.icon),
    title: card.title,
    text: card.text,
    enabled: true,
  }));
}
