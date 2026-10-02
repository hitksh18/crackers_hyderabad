import { getStatusTone } from './orderStatus';

/**
 * Status pill for the operations screens.
 *
 * Colour, icon and word always travel together — the state is never
 * communicated by colour alone.
 */
const OrderStatusBadge = ({ status, className = '' }) => {
  const label = status || 'Pending';
  const { badge, Icon } = getStatusTone(label);

  return (
    <span className={`badge ${badge} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2.4} />
      {label}
    </span>
  );
};

export default OrderStatusBadge;
