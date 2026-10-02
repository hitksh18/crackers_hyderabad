import { ShieldCheck, UserCog, UserCheck, FileText, PackageOpen, User } from 'lucide-react';

/**
 * The role vocabulary for the admin users surface.
 *
 * The role keys and their order are the same values written to the `roles`
 * Firestore collection — do not rename them. Everything else here is
 * presentation: each role is identified by an icon AND a word, so the badges
 * never rely on colour alone.
 */

export const roleOptions = ['admin', 'mod', 'sales', 'billing', 'packer', 'customer'];

export const roleConfig = {
  admin: {
    icon: ShieldCheck,
    label: 'Admin',
    description: 'Full access to all features',
    badge: 'bg-maroon-50 text-maroon-800 border-maroon-200 dark:bg-maroon-900/40 dark:text-maroon-200 dark:border-maroon-700',
    solid: 'bg-maroon-700 text-white border-maroon-700',
    idle: 'bg-maroon-50 text-maroon-800 border-maroon-200 hover:border-maroon-400 dark:bg-maroon-900/30 dark:text-maroon-200 dark:border-maroon-800',
    rail: 'border-l-maroon-700',
    wash: 'bg-maroon-50 dark:bg-maroon-900/40',
    ink: 'text-maroon-700 dark:text-maroon-200',
    selected: 'border-maroon-500 bg-maroon-50 dark:bg-maroon-900/30',
    dot: 'bg-maroon-700',
  },
  mod: {
    icon: UserCog,
    label: 'Mod',
    description: 'Manage orders, billing and price list',
    badge: 'bg-primary-50 text-primary-800 border-primary-200 dark:bg-primary-900/40 dark:text-primary-200 dark:border-primary-700',
    solid: 'bg-primary-600 text-white border-primary-600',
    idle: 'bg-primary-50 text-primary-800 border-primary-200 hover:border-primary-400 dark:bg-primary-900/30 dark:text-primary-200 dark:border-primary-800',
    rail: 'border-l-primary-600',
    wash: 'bg-primary-50 dark:bg-primary-900/40',
    ink: 'text-primary-700 dark:text-primary-200',
    selected: 'border-primary-500 bg-primary-50 dark:bg-primary-900/30',
    dot: 'bg-primary-600',
  },
  sales: {
    icon: UserCheck,
    label: 'Sales',
    description: 'Access to Billing and Price List only',
    badge: 'bg-accent-50 text-accent-800 border-accent-200 dark:bg-accent-900/40 dark:text-accent-300 dark:border-accent-700',
    solid: 'bg-accent-700 text-white border-accent-700',
    idle: 'bg-accent-50 text-accent-800 border-accent-200 hover:border-accent-400 dark:bg-accent-900/30 dark:text-accent-300 dark:border-accent-800',
    rail: 'border-l-accent-500',
    wash: 'bg-accent-50 dark:bg-accent-900/40',
    ink: 'text-accent-700 dark:text-accent-300',
    selected: 'border-accent-500 bg-accent-50 dark:bg-accent-900/30',
    dot: 'bg-accent-700',
  },
  billing: {
    icon: FileText,
    label: 'Billing',
    description: 'Access to Billing (POS) and Price List',
    badge: 'bg-leaf-50 text-leaf-800 border-leaf-200 dark:bg-leaf-800/40 dark:text-leaf-300 dark:border-leaf-700',
    solid: 'bg-leaf-600 text-white border-leaf-600',
    idle: 'bg-leaf-50 text-leaf-800 border-leaf-200 hover:border-leaf-300 dark:bg-leaf-800/30 dark:text-leaf-300 dark:border-leaf-800',
    rail: 'border-l-leaf-600',
    wash: 'bg-leaf-50 dark:bg-leaf-800/40',
    ink: 'text-leaf-700 dark:text-leaf-300',
    selected: 'border-leaf-500 bg-leaf-50 dark:bg-leaf-800/30',
    dot: 'bg-leaf-600',
  },
  packer: {
    icon: PackageOpen,
    label: 'Packer',
    description: 'Orders page with packing checklist and status',
    badge: 'bg-saffron-50 text-saffron-800 border-saffron-200 dark:bg-saffron-900/40 dark:text-saffron-300 dark:border-saffron-700',
    solid: 'bg-saffron-700 text-white border-saffron-700',
    idle: 'bg-saffron-50 text-saffron-800 border-saffron-200 hover:border-saffron-400 dark:bg-saffron-900/30 dark:text-saffron-300 dark:border-saffron-800',
    rail: 'border-l-saffron-500',
    wash: 'bg-saffron-50 dark:bg-saffron-900/40',
    ink: 'text-saffron-800 dark:text-saffron-300',
    selected: 'border-saffron-500 bg-saffron-50 dark:bg-saffron-900/30',
    dot: 'bg-saffron-700',
  },
  customer: {
    icon: User,
    label: 'Customer',
    description: 'Standard customer access',
    badge: 'bg-ink-100 text-ink-700 border-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:border-ink-700',
    solid: 'bg-ink-800 text-white border-ink-800',
    idle: 'bg-ink-100 text-ink-700 border-ink-200 hover:border-ink-300 dark:bg-ink-800 dark:text-ink-200 dark:border-ink-700',
    rail: 'border-l-ink-300',
    wash: 'bg-ink-100 dark:bg-ink-800',
    ink: 'text-ink-700 dark:text-ink-200',
    selected: 'border-ink-400 bg-ink-100 dark:bg-ink-800',
    dot: 'bg-ink-800',
  },
};

export const configFor = (role) => roleConfig[role] || roleConfig.customer;
