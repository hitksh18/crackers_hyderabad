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

/** Generated password-reset link. */
/**
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
