import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const getInitial = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
};

/**
 * True when the visitor has asked their OS to reduce motion.
 *
 * The stylesheet already neutralises CSS animations globally; this hook is for
 * the cases CSS cannot reach — canvas loops, Framer variants, and any effect
 * we should skip rather than shorten.
 */
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(getInitial);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia(QUERY);
    const onChange = (event) => setReduced(event.matches);

    setReduced(mql.matches);

    // Safari < 14 only has the deprecated listener API.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
};

export default useReducedMotion;
