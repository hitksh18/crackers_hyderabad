import { Search, Truck } from 'lucide-react';

/**
 * Track-order entry point. The submit handler in Home.jsx still navigates to
 * /track-order?id=<id> with the trimmed, encoded order id.
 */
const TrackOrderBlock = ({ orderId, onOrderIdChange, onSubmit }) => (
  <div
    className="panel-editorial glass-card flex h-full flex-col p-6 md:p-8"
  >
    <span
      className="flex h-12 w-12 items-center justify-center"
      style={{
        borderRadius: 'var(--r-lg)',
        background: 'var(--grad-ember)',
        boxShadow: 'var(--shadow-ember)',
      }}
      aria-hidden="true"
    >
      <Truck className="h-6 w-6" strokeWidth={1.9} style={{ color: '#FFFFFF' }} />
    </span>

    <h2 className="section-title mt-4" style={{ color: 'var(--text-strong)' }}>
      Track Your Order
    </h2>

    <p
      className="mt-3 max-w-prose text-pretty"
      style={{ fontFamily: 'var(--font-body)', color: 'var(--text-muted)', lineHeight: 1.65 }}
    >
      Enter your Order ID to know exactly where your crackers are — from packing to your doorstep.
    </p>

    <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
      <div className="relative flex-1">
        <label htmlFor="track-order-id" className="sr-only">
          Order ID
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          strokeWidth={2.1}
          style={{ color: 'var(--text-subtle)' }}
          aria-hidden="true"
        />
        <input
          id="track-order-id"
          type="text"
          value={orderId}
          onChange={onOrderIdChange}
          placeholder="Enter your Order ID"
          aria-label="Order ID"
          className="input-premium tabular pl-12"
        />
      </div>

      <button type="submit" className="btn-primary shrink-0 px-7 py-3.5">
        Track Now
      </button>
    </form>
  </div>
);

export default TrackOrderBlock;
