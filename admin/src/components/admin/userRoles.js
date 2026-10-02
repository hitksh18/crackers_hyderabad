import { ShieldCheck, UserCheck, User } from 'lucide-react';

/**
 * The role vocabulary for the admin users surface.
 *
 * The role keys and their order are the same values written to the `roles`
 * Firestore collection — do not rename them. Everything else here is
 * presentation: each role is identified by an icon AND a word, so the badges
 * never rely on colour alone.
 */

export const roleOptions = ['admin', 'sales', 'customer'];

/** Roles that are no longer part of the vocabulary. Any stored value outside
 *  roleOptions (legacy mod/billing/packer, case variants, typos) resolves to
 * 'customer' so every surface agrees on who can do what. */
export const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  return roleOptions.includes(role) ? role : 'customer';
};

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
  sales: {
    icon: UserCheck,
    label: 'Sales',
    description: 'Access to sales and billing functionality',
    badge: 'bg-accent-50 text-accent-800 border-accent-200 dark:bg-accent-900/40 dark:text-accent-300 dark:border-accent-700',
    solid: 'bg-accent-700 text-white border-accent-700',
    idle: 'bg-accent-50 text-accent-800 border-accent-200 hover:border-accent-400 dark:bg-accent-900/30 dark:text-accent-300 dark:border-accent-800',
    rail: 'border-l-accent-500',
    wash: 'bg-accent-50 dark:bg-accent-900/40',
    ink: 'text-accent-700 dark:text-accent-300',
    selected: 'border-accent-500 bg-accent-50 dark:bg-accent-900/30',
    dot: 'bg-accent-700',
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
