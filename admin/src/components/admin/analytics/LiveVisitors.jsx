import AnimatedCounter from '../../ui/AnimatedCounter';
import { Skeleton } from '../../ui/Skeleton';

/**
 * Visitors active in the last five minutes.
 *
 * Polled separately from the rest of the dashboard and far more often — this is
 * the one number that is worthless if it is a minute old, and it costs a single
 * Firestore document read.
 */
export default function LiveVisitors({ live, windowMinutes = 5, loading, stale }) {
  return (
    <section
      className="card-premium flex items-center justify-between gap-4 p-5"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {/* The dot only pulses when there is somebody to pulse for; a blinking
              light over a zero reads as a broken widget. */}
          {live > 0 && !stale ? (
            <span className="live-dot" aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: 'var(--delta-flat)' }}
            />
          )}
          Live now
        </p>

        {loading ? (
          <Skeleton className="mt-2 h-10 w-24" />
        ) : (
          <p
            className="mt-1.5 text-4xl font-bold leading-none"
            style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
          >
            <AnimatedCounter value={live} />
          </p>
        )}

        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {stale
            ? 'Paused while this tab is in the background'
            : `Active in the last ${windowMinutes} minutes`}
        </p>
      </div>

      {live === 0 && !loading && !stale && (
        <p
          className="max-w-[7.5rem] shrink-0 text-right text-[11px] leading-relaxed"
          style={{ color: 'var(--text-subtle)' }}
        >
          Nobody browsing right now
        </p>
      )}
    </section>
  );
}
