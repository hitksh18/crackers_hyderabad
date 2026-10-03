import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trash2, Ban, CircleCheck, TriangleAlert, ArrowRight } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { modalVariants } from '../../lib/motion';
import { roleOptions, configFor } from './userRoles';
import RoleBadge from './RoleBadge';

const SCRIM = 'rgba(26, 23, 20, 0.62)';

const PANEL = {
  background: 'var(--surface-card)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--r-lg)',
  boxShadow: 'var(--shadow-xl)',
  overflow: 'hidden',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal shell. Mounts only while its dialog is open, so mount/unmount is the
 * open/close boundary: remember focus, move it into the panel, keep Tab inside,
 * lock the page behind, and hand focus back on close. Mirrors CustomModal.
 */
const Shell = ({ labelledBy, onClose, children, width = 'max-w-md' }) => {
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Lock the page behind the dialog, remember focus, and restore it on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusPanel = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusPanel);
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const nodes = panel.querySelectorAll(FOCUSABLE);
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);

      if (event.shiftKey && (outside || active === panel || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.001 : 0.18 }}
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      style={{ background: SCRIM }}
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        variants={modalVariants(reduced)}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={`w-full ${width} max-h-[90vh] overflow-y-auto`}
        style={PANEL}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

const Head = ({ id, title, onClose, accent = 'var(--maroon-700)' }) => (
  <div
    className="flex items-center justify-between gap-3 border-b px-5 py-4"
    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
  >
    <div className="flex items-center gap-2 min-w-0">
      <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full" style={{ background: accent }} />
      <h2 id={id} className="truncate text-base font-bold" style={{ color: 'var(--text-strong)' }}>
        {title}
      </h2>
    </div>
    <button
      type="button"
      onClick={onClose}
      aria-label="Close dialog"
      className="btn-quiet"
      style={{ minHeight: 44, minWidth: 44 }}
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
);

const Identity = ({ user }) => (
  <div className="mb-5">
    <p className="label-caps">User</p>
    <p className="mt-1 text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
      {user.displayName || 'No name'}
    </p>
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
      {user.email}
    </p>
  </div>
);

/** Role editor. The Save button is the confirmation step for a role change.
 *  While `saving` the dialog locks: no second submit, no close mid-flight. On
 *  failure the parent keeps `user` set, so the modal stays open with the error. */
export const RoleEditorModal = ({ user, currentRole, value, onChange, onCancel, onSave, saving = false }) => {
  const close = () => {
    if (saving) return;
    onCancel();
  };

  return (
    <AnimatePresence>
      {user && (
        <Shell labelledBy="role-editor-title" onClose={close}>
          <Head id="role-editor-title" title="Change User Role" onClose={close} />

        <div className="p-5">
          <Identity user={user} />

          <div
            className="mb-5 flex flex-wrap items-center gap-2 rounded-[var(--r-md)] px-3 py-2"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
          >
            <span className="label-caps">Current</span>
            <RoleBadge role={currentRole} />
            <ArrowRight
              className="h-4 w-4"
              style={{ color: 'var(--text-subtle)' }}
              aria-hidden="true"
            />
            <span className="label-caps">New</span>
            <RoleBadge role={value} />
          </div>

          <fieldset className="mb-5">
            <legend className="label-caps mb-2">Select role</legend>
            <div className="space-y-2">
              {roleOptions.map(role => {
                const config = configFor(role);
                const RoleIcon = config.icon;
                const active = value === role;

                return (
                  <label
                    key={role}
                    className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border-2 p-3 transition-colors ${
                      active
                        ? config.selected
                        : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600'
                    }`}
                    style={{ minHeight: 56 }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={active}
                      onChange={(e) => onChange(e.target.value)}
                      className="sr-only"
                    />
                    <RoleIcon className={`h-5 w-5 shrink-0 ${config.ink}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                        {config.label}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                        {config.description}
                      </span>
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${config.dot}`}
                      >
                        <span className="block h-1.5 w-1.5 rounded-full" style={{ background: '#FFFFFF' }} />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={saving} className="btn-outline flex-1 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              aria-busy={saving}
              className="btn-primary flex-1 text-sm"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save Role'}
            </button>
          </div>
        </div>
      </Shell>
    )}
    </AnimatePresence>
  );
};

/** Destructive confirmation for disable / delete. Closes only when the parent
 * clears `action` (i.e. on success); stays open on failure so the user can
 * retry. Duplicate confirms while the request is in flight are ignored. */
export const ConfirmActionModal = ({ action, onCancel, onConfirm }) => {
  const isDelete = action?.type === 'delete';
  const accent = isDelete ? 'var(--crimson-600)' : 'var(--gold-600)';
  const [pending, setPending] = useState(false);

  // Fresh state for every opening so a previous attempt can never leak in.
  useEffect(() => {
    if (action) setPending(false);
  }, [action]);

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <AnimatePresence>
      {action && (
        <Shell labelledBy="confirm-action-title" onClose={onCancel}>
          <Head
            id="confirm-action-title"
            title={isDelete ? 'Delete User' : 'Disable Account'}
            onClose={onCancel}
            accent={accent}
          />

          <div className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: isDelete ? 'rgba(203, 42, 42, 0.10)' : 'rgba(210, 166, 79, 0.16)',
                  border: `1px solid ${isDelete ? 'rgba(203, 42, 42, 0.28)' : 'rgba(210, 166, 79, 0.4)'}`,
                }}
              >
                {isDelete ? (
                  <Trash2 className="h-5 w-5" style={{ color: 'var(--crimson-600)' }} />
                ) : (
                  <Ban className="h-5 w-5" style={{ color: 'var(--gold-600)' }} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                  {action.user.displayName || 'No name'}
                </p>
                <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                  {action.user.email}
                </p>
              </div>
            </div>

            <p
              className="mb-5 flex items-start gap-2 rounded-[var(--r-md)] px-3 py-2.5 text-sm"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--hairline)',
                color: 'var(--text-body)',
              }}
            >
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: accent }}
                aria-hidden="true"
              />
              {isDelete
                ? 'Are you sure you want to permanently delete this user? This action cannot be undone.'
                : 'Are you sure you want to disable this account? The user will not be able to sign in.'}
            </p>

            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="btn-outline flex-1 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                aria-busy={pending}
                className="btn-primary flex-1 text-sm"
                style={
                  isDelete
                    ? { background: 'var(--crimson-600)', boxShadow: '0 8px 24px rgba(203, 42, 42, 0.28)' }
                    : { background: 'var(--gold-600)', boxShadow: 'var(--shadow-gold)' }
                }
              >
                {isDelete ? (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Ban className="h-4 w-4" aria-hidden="true" />
                )}
                {pending ? (isDelete ? 'Deleting...' : 'Disabling...') : isDelete ? 'Delete User' : 'Disable Account'}
              </button>
            </div>
          </div>
        </Shell>
      )}
    </AnimatePresence>
  );
};

/** Generated password-reset link.
 * Confirms that a reset email went out.
 *
 * The reset link is a bearer credential for someone else's account, so the
 * server sends it straight to the account holder and never returns it. There is
 * deliberately nothing here for an administrator to copy.
 */
export const ResetLinkModal = ({ action, onClose }) => (
  <AnimatePresence>
    {action && (
      <Shell labelledBy="reset-link-title" onClose={onClose} width="max-w-lg">
        <Head
          id="reset-link-title"
          title="Password Reset Email Sent"
          onClose={onClose}
          accent="var(--leaf-600)"
        />

        <div className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'rgba(44, 122, 83, 0.12)',
                border: '1px solid rgba(44, 122, 83, 0.3)',
              }}
            >
              <CircleCheck className="h-5 w-5" style={{ color: 'var(--leaf-600)' }} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                {action.user.displayName || 'User'}
              </p>
              <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                {action.email || action.user.email}
              </p>
            </div>
          </div>

          <p className="mb-5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            A reset link has been emailed to this account. It expires in about an
            hour. For their security the link is not shown here — ask them to
            check their inbox, including the spam folder.
          </p>

          <button type="button" onClick={onClose} className="btn-outline w-full text-sm">
            Done
          </button>
        </div>
      </Shell>
    )}
  </AnimatePresence>
);

const INPUT_STYLE = {
  borderColor: 'var(--hairline)',
  color: 'var(--text-strong)',
};

/** Full Admin "Edit User" dialog.
 * Loads CURRENT values from the combined Auth + Firestore object, edits only
 * the allow-listed fields that exist in the users/{uid} schema
 * (name, displayName, phone, phoneNumber, email) plus Auth fields
 * (displayName, email, disabled) and roles/{uid} (admin|sales|customer).
 * While `saving` the dialog locks. On failure the parent keeps `user` set so
 * the modal stays open with the error visible. */
export const EditUserModal = ({
  user,
  onCancel,
  onSave,
  onEnsureProfile,
  saving = false,
  ensuringProfile = false,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('customer');
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  // Reload current values every time a different user is opened.
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setName(user.firestoreName || user.profileName || '');
      setEmail(user.email || '');
      setPhone(user.firestorePhone || '');
      setPhoneNumber(user.firestorePhoneNumber || user.phoneNumber || '');
      setRole(roleOptions.includes(user.role) ? user.role : 'customer');
      setDisabled(Boolean(user.disabled));
      setError('');
    }
  }, [user]);

  const close = () => {
    if (saving || ensuringProfile) return;
    onCancel();
  };

  const handleSave = () => {
    setError('');
    if (email.trim() === '') {
      setError('Email address is required.');
      return;
    }
    onSave({
      displayName: displayName.trim(),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      phoneNumber: phoneNumber.trim(),
      role,
      disabled,
    });
  };

  return (
    <AnimatePresence>
      {user && (
        <Shell labelledBy="edit-user-title" onClose={close} width="max-w-lg">
          <Head id="edit-user-title" title="Edit User" onClose={close} />

          <div className="p-5">
            <Identity user={user} />

            {user.profileMissing && (
              <p
                className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--r-md)] px-3 py-2.5 text-sm"
                style={{
                  background: 'rgba(210, 166, 79, 0.12)',
                  border: '1px solid rgba(210, 166, 79, 0.4)',
                  color: 'var(--text-body)',
                }}
              >
                <TriangleAlert
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--gold-600)' }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  No Firestore profile yet — saving will create it.
                </span>
                {onEnsureProfile && (
                  <button
                    type="button"
                    onClick={onEnsureProfile}
                    disabled={ensuringProfile || saving}
                    className="btn-outline shrink-0 text-xs"
                    style={{ minHeight: 32 }}
                  >
                    {ensuringProfile ? 'Creating…' : 'Create now'}
                  </button>
                )}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-[var(--r-md)] px-3 py-2.5 text-sm font-semibold"
                style={{
                  background: 'rgba(203, 42, 42, 0.08)',
                  border: '1px solid rgba(203, 42, 42, 0.3)',
                  color: 'var(--crimson-600)',
                }}
              >
                {error}
              </p>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-user-display-name" className="label-caps mb-1 block">
                  Display name (Auth)
                </label>
                <input
                  id="edit-user-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  className="h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-card)] px-3 text-sm focus:outline-none"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label htmlFor="edit-user-name" className="label-caps mb-1 block">
                  Profile name
                </label>
                <input
                  id="edit-user-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  className="h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-card)] px-3 text-sm focus:outline-none"
                  style={INPUT_STYLE}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="edit-user-email" className="label-caps mb-1 block">
                  Email (Auth)
                </label>
                <input
                  id="edit-user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  className="h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-card)] px-3 text-sm focus:outline-none"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label htmlFor="edit-user-phone" className="label-caps mb-1 block">
                  Phone
                </label>
                <input
                  id="edit-user-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={32}
                  className="h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-card)] px-3 text-sm tabular focus:outline-none"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label htmlFor="edit-user-phone-number" className="label-caps mb-1 block">
                  Mobile number
                </label>
                <input
                  id="edit-user-phone-number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  maxLength={32}
                  className="h-10 w-full rounded-[var(--r-md)] border bg-[var(--surface-card)] px-3 text-sm tabular focus:outline-none"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <fieldset className="mb-4">
              <legend className="label-caps mb-2">Role</legend>
              <div className="space-y-2">
                {roleOptions.map((option) => {
                  const config = configFor(option);
                  const RoleIcon = config.icon;
                  const active = role === option;
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border-2 p-3 transition-colors ${
                        active
                          ? config.selected
                          : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600'
                      }`}
                      style={{ minHeight: 56 }}
                    >
                      <input
                        type="radio"
                        name="edit-user-role"
                        value={option}
                        checked={active}
                        onChange={(e) => setRole(e.target.value)}
                        className="sr-only"
                      />
                      <RoleIcon className={`h-5 w-5 shrink-0 ${config.ink}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                          {config.label}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                          {config.description}
                        </span>
                      </span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${config.dot}`}
                        >
                          <span className="block h-1.5 w-1.5 rounded-full" style={{ background: '#FFFFFF' }} />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label
              className="mb-5 flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-3 py-2.5"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
            >
              <input
                type="checkbox"
                checked={!disabled}
                onChange={(e) => setDisabled(!e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                Account enabled
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {disabled ? 'Signed in is blocked' : 'Can sign in'}
              </span>
            </label>

            <div className="flex gap-2">
              <button type="button" onClick={close} disabled={saving} className="btn-outline flex-1 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                aria-busy={saving}
                className="btn-primary flex-1 text-sm"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Shell>
      )}
    </AnimatePresence>
  );
};
