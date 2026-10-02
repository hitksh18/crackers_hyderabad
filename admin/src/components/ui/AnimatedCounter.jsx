import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * The final number is rendered immediately for reduced-motion visitors and for
 * screen readers, so the value is never something you have to wait to read.
 */
const AnimatedCounter = ({
  value = 0,
  duration = 1100,
  prefix = '',
  suffix = '',
  decimals = 0,
  locale = 'en-IN',
  className = '',
  style,
}) => {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [display, setDisplay] = useState(reduced ? value : 0);
  const started = useRef(false);

  useEffect(() => {
    const target = Number(value) || 0;

    if (reduced) {
      setDisplay(target);
      return undefined;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setDisplay(target);
      return undefined;
    }

    let frame = 0;

    const run = () => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(target * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(node);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, duration, reduced]);

  const formatted = display.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const finalFormatted = (Number(value) || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={`tabular ${className}`} style={style}>
      <span aria-hidden="true">
        {prefix}
        {formatted}
        {suffix}
      </span>
      <span className="sr-only">{`${prefix}${finalFormatted}${suffix}`}</span>
    </span>
  );
};

export default AnimatedCounter;
