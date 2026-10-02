import { motion } from 'framer-motion';
import {
  Mail,
  User,
  Pencil,
  Key,
  Ban,
  Trash2,
  Check,
  Clock,
  Calendar,
  CircleCheck,
  CircleX,
  Hash,
} from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { DURATION, EASE_OUT_EXPO, EASE_IN_SOFT } from '../../lib/motion';
import { configFor } from './userRoles';
import RoleBadge from './RoleBadge';

const cardVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12 },
  visible: (delay) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: reduced ? 0.001 : DURATION.base,
      ease: EASE_OUT_EXPO,
      delay: reduced ? 0 : delay,
    },
  }),
  exit: {
    opacity: 0,
    y: reduced ? 0 : -10,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getProviderName = (providers) => {
  if (!providers || providers.length === 0) return 'Unknown';
  if (providers.includes('google.com')) return 'Google';
  if (providers.includes('password')) return 'Email/Password';
  return providers[0];
};

const ProviderIcon = ({ providers }) => {
  if (!providers || providers.length === 0) {
    return <Mail className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />;
  }
  if (providers.includes('google.com')) {
    return <Mail className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--crimson-600)' }} />;
  }
  if (providers.includes('password')) {
    return <Mail className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--ember-600)' }} />;
  }
  return <User className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />;
};

/**
 * One row of the roles register. Dense, aligned, and readable without colour:
 * every state (role, provider, verification, disabled) carries an icon and a word.
 */
const UserRoleCard = ({
  user,
  role,
  onEditRole,
  onResetPassword,
  onDisable,
  onEnable,
  onDelete,
  isCurrentUser,
  index,
}) => {
  const reduced = useReducedMotion();
  const config = configFor(role);
  const RoleIcon = config.icon;

  return (
    <motion.article
      custom={Math.min(index, 12) * 0.02}
      variants={cardVariants(reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`border border-l-4 ${config.rail} ${user.disabled ? 'opacity-70' : ''}`}
      style={{
        background: 'var(--surface-card)',
        borderTopColor: 'var(--hairline)',
        borderRightColor: 'var(--hairline)',
        borderBottomColor: 'var(--hairline)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div className="p-4">
        {/* Identity + status */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                width="40"
                height="40"
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                style={{ border: '1px solid var(--hairline)' }}
              />
            ) : (
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.wash}`}
                style={{ border: '1px solid var(--hairline)' }}
              >
                <RoleIcon className={`h-4 w-4 ${config.ink}`} strokeWidth={2} />
              </span>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                  {user.displayName || 'No name'}
                </p>
                {isCurrentUser && <span className="badge badge-ember">You</span>}
                {user.disabled && (
                  <span className="badge badge-crimson">
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    Disabled
                  </span>
                )}
              </div>

              <p className="mt-0.5 truncate text-sm" style={{ color: 'var(--text-body)' }}>
                {user.email || 'No email'}
              </p>

              <p
                className="tabular mt-1 flex items-center gap-1 font-mono text-xs"
                style={{ color: 'var(--text-subtle)' }}
                title={user.uid}
              >
                <Hash className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{user.uid}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            <RoleBadge role={role} />

            <span className="badge badge-neutral">
              <ProviderIcon providers={user.providers} />
              {getProviderName(user.providers)}
            </span>

            {user.emailVerified ? (
              <span className="badge badge-leaf">
                <CircleCheck className="h-3 w-3" aria-hidden="true" />
                Verified
              </span>
            ) : (
              <span className="badge badge-gold">
                <CircleX className="h-3 w-3" aria-hidden="true" />
                Not Verified
              </span>
            )}
          </div>
        </div>

        {/* Timestamps */}
        <dl
          className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 border-t pt-3 text-xs sm:grid-cols-2"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
            <dt className="label-caps">Created</dt>
            <dd className="tabular truncate" style={{ color: 'var(--text-body)' }}>
              {formatDate(user.creationTime)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
            <dt className="label-caps">Last sign-in</dt>
            <dd className="tabular truncate" style={{ color: 'var(--text-body)' }}>
              {formatDate(user.lastSignInTime)}
            </dd>
          </div>
        </dl>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
          <button type="button" onClick={onEditRole} className="btn-quiet" style={{ minHeight: 44 }}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Change Role
          </button>

          {user.providers?.includes('password') && (
            <button
              type="button"
              onClick={onResetPassword}
              className="btn-quiet"
              style={{ minHeight: 44 }}
            >
              <Key className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Password
            </button>
          )}

          {!isCurrentUser && (
            <>
              {user.disabled ? (
                <button
                  type="button"
                  onClick={onEnable}
                  className="btn-quiet"
                  style={{ minHeight: 44, color: 'var(--leaf-600)' }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Enable
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDisable}
                  className="btn-quiet"
                  style={{ minHeight: 44, color: 'var(--gold-600)' }}
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  Disable
                </button>
              )}

              <button
                type="button"
                onClick={onDelete}
                className="btn-quiet"
                style={{ minHeight: 44, color: 'var(--crimson-600)' }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </motion.article>
  );
};

export default UserRoleCard;
