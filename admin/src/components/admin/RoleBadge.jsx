import { configFor } from './userRoles';

/**
 * Role identity chip: icon AND word, so the role is never signalled by
 * colour alone.
 */
const RoleBadge = ({ role, className = '' }) => {
  const config = configFor(role);
  const Icon = config.icon;

  return (
    <span className={`badge ${config.badge} ${className}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
      {config.label}
    </span>
  );
};

export default RoleBadge;
