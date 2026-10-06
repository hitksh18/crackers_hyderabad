/**
 * Static content for the homepage.
 *
 * Nothing here is derived from Firestore — these are the fixed editorial
 * definitions the page has always carried. Category matching rules, promo
 * banner links and trust copy are unchanged; only their presentation moved.
 */

import {
  BadgeCheck,
  Truck,
  IndianRupee,
  Zap,
  Flame,
  Gift,
  ShieldCheck,
  CreditCard,
  Headphones,
  Star,
  Boxes,
  Store,
  Tags,
  LayoutGrid,
  PackageSearch,
  CalendarDays,
} from 'lucide-react';

import { toCategoryDefs } from '../../config/categories';

export const categoryDefs = toCategoryDefs();

export const promoBanners = [
  { title: '20% OFF', subtitle: 'On selected premium gift boxes', tag: 'FLAT DEAL', icon: BadgeCheck, gradient: 'linear-gradient(120deg, #CB2A2A 0%, #94251F 100%)', link: '/products?category=Gift Boxes' },
  { title: 'Free Delivery', subtitle: 'On orders above Rs. 2,500', tag: 'HYDERABAD WIDE', icon: Truck, gradient: 'linear-gradient(120deg, #C33A14 0%, #DF4C21 100%)', link: '/products' },
  { title: 'Festival Sale', subtitle: 'Big savings on multi-colour packs', tag: 'LIMITED TIME', icon: Flame, gradient: 'linear-gradient(120deg, #7C5622 0%, #BE8C36 100%)', link: '/products' },
  { title: 'Premium Gift Boxes', subtitle: 'Safely packed, ready to gift', tag: 'BEST SELLERS', icon: Gift, gradient: 'linear-gradient(120deg, #7A2410 0%, #9E2C10 100%)', link: '/products?category=Gift Boxes' },
];

/**
 * Fallback hero content. Used only when the admin has not yet configured any
 * hero slides in the Homepage Admin (or the Firestore read fails). The storefront
 * hero never goes blank — this editorial set stands in until the admin publishes
 * their own banners, which then fully replace it.
 *
 * Shape matches what the Homepage Admin saves per slide: id, imageUrl, eyebrow,
 * badge, position ('carousel' | 'card'), heading, subHeading, ctaText,
 * ctaLink, enabled, order.
 */
export const defaultHeroSlides = [
  {
    id: 'default-carousel-1',
    imageUrl: '/images/catalog/111.webp',
    eyebrow: 'Diwali Specials',
    badge: 'Diwali Specials',
    position: 'carousel',
    heading: 'Light Up Your Celebrations',
    subHeading: 'Premium crackers and festive celebration packs for the brightest festival of the year.',
    ctaText: 'Shop Now',
    ctaLink: '/products?category=Gift Boxes',
    enabled: true,
    order: 0,
  },
  {
    id: 'default-carousel-2',
    imageUrl: '/images/catalog/125.webp',
    eyebrow: 'Best Sellers',
    badge: 'Best Sellers',
    position: 'carousel',
    heading: 'The Most-Loved Fireworks',
    subHeading: 'Top-rated crackers chosen by thousands of happy customers across Hyderabad.',
    ctaText: 'Shop Best Sellers',
    ctaLink: '/products',
    enabled: true,
    order: 1,
  },
  {
    id: 'default-carousel-3',
    imageUrl: '/images/catalog/145.webp',
    eyebrow: 'Festive Combos',
    badge: 'Limited Offer',
    position: 'carousel',
    heading: 'Celebration Packs for Every Occasion',
    subHeading: 'Ready-to-gift boxes from premium manufacturers, packed safely and delivered to your door.',
    ctaText: 'Explore Combos',
    ctaLink: '/products?category=Gift Boxes',
    enabled: true,
    order: 2,
  },
  {
    id: 'default-card-1',
    imageUrl: '/images/catalog/165.webp',
    eyebrow: 'Best Sellers',
    badge: 'Best Sellers',
    position: 'card',
    heading: 'Explore Our Most Popular Crackers',
    subHeading: 'Top-rated picks our customers love.',
    ctaText: 'Shop Now',
    ctaLink: '/products',
    enabled: true,
    order: 3,
  },
  {
    id: 'default-card-2',
    imageUrl: '/images/catalog/224.webp',
    eyebrow: 'Festive Combos',
    badge: 'Festive Combos',
    position: 'card',
    heading: 'Celebration Packs for Every Occasion',
    subHeading: 'Ready-to-gift boxes for every festival.',
    ctaText: 'Explore',
    ctaLink: '/products?category=Gift Boxes',
    enabled: true,
    order: 4,
  },
];

export const trustBadges = [
  { text: 'Licensed Products', icon: BadgeCheck },
  { text: 'Safe Delivery', icon: Truck },
  { text: 'Best Prices', icon: IndianRupee },
  { text: 'Fast Shipping', icon: Zap },
];

export const whyChoose = [
  { title: 'Fast Delivery', text: 'Same-day doorstep delivery across Hyderabad', icon: Truck },
  { title: 'Licensed Products', text: 'Safety-tested crackers from certified factories', icon: ShieldCheck },
  { title: 'Secure Payments', text: 'UPI, cards and cash on delivery options', icon: CreditCard },
  { title: 'Customer Support', text: 'Friendly help before, during and after orders', icon: Headphones },
  { title: 'Trusted by Thousands', text: 'Loved by families across the city', icon: Star },
];

/**
 * Wholesale positioning. Themes only — no volumes, no lead times, no
 * certifications and no promises that are not already true elsewhere in the app.
 */
export const wholesalePillars = [
  { title: 'Bulk Ordering', text: 'Build a large order in one cart and set your own quantity line by line.', icon: Boxes },
  { title: 'Festival Stock for Retailers', text: 'Stock a shop counter for the season from a single catalogue.', icon: Store },
  { title: 'Wholesale Pricing', text: 'Wholesale rates across the range, shown before you check out.', icon: Tags },
  { title: 'Range and Variety', text: 'Rockets, sparkles, ground chakkars, flower pots, garlands and gift boxes.', icon: LayoutGrid },
  { title: 'Order Tracking', text: 'Follow an order with its order ID, from packing through to dispatch.', icon: PackageSearch },
  { title: 'Support', text: 'Talk to us before, during and after an order is placed.', icon: Headphones },
  { title: 'Seasonal Supply', text: 'Plan the festival season ahead instead of buying at the last minute.', icon: CalendarDays },
];
