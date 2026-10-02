import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArchFrame, Diya } from '../ui/Ornaments';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { productPath } from '../../lib/productLinks';

const DISPLAY_MS = 3800;
const FADE_MS = 420;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ProductShowcase({ products = [] }) {
  const reduced = useReducedMotion();

  const eligible = useMemo(
    () => products.filter((p) => p.imageURL && !p.outOfStock),
    [products],
  );

  const [seqIndex, setSeqIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const preloadedRef = useRef(new Set());
  const timerRef = useRef(null);

  const sequence = useMemo(() => {
    if (eligible.length <= 1) return eligible;
    return shuffle(eligible);
  }, [eligible]);

  const current = sequence[seqIndex % sequence.length] || sequence[0];

  const [secondaryId, setSecondaryId] = useState(null);
  const secondaryProduct = useMemo(() => {
    if (eligible.length < 2 || !current) return null;
    if (secondaryId && secondaryId !== current.id) {
      const found = eligible.find((p) => p.id === secondaryId);
      if (found) return found;
    }
    const pool = eligible.filter((p) => p.id !== current.id);
    return pool[Math.floor(Math.random() * pool.length)];
  }, [eligible, current, secondaryId]);

  useEffect(() => {
    if (!secondaryProduct || !current) return;
    if (secondaryProduct.id === current.id) {
      const pool = eligible.filter((p) => p.id !== current.id);
      if (pool.length > 0) setSecondaryId(pool[Math.floor(Math.random() * pool.length)].id);
    }
  }, [current, eligible, secondaryProduct]);

  const preload = useCallback((product) => {
    if (!product?.imageURL || preloadedRef.current.has(product.id)) return;
    preloadedRef.current.add(product.id);
    const img = new Image();
    img.src = product.imageURL;
  }, []);

  useEffect(() => {
    if (sequence.length < 2) return;
    const next1 = sequence[(seqIndex + 1) % sequence.length];
    const next2 = sequence[(seqIndex + 2) % sequence.length];
    if (next1) preload(next1);
    if (next2) preload(next2);
  }, [sequence, seqIndex, preload]);

  useEffect(() => {
    if (sequence.length < 2 || paused || reduced) return;

    timerRef.current = setInterval(() => {
      setSeqIndex((prev) => {
        const next = prev + 1;
        if (next >= sequence.length) {
          return 0;
        }
        return next;
      });
    }, DISPLAY_MS);

    return () => clearInterval(timerRef.current);
  }, [sequence, paused, reduced]);

  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (eligible.length === 0) return null;

  const mainProduct = current || eligible[0];

  return (
    <div
      className="relative mx-auto w-full max-w-[300px] sm:max-w-[320px] md:max-w-[340px] lg:max-w-[380px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Floating secondary product */}
      <div className="absolute -right-1 bottom-[16%] z-20 h-[4rem] w-[4rem] sm:-right-2 sm:h-[4.5rem] sm:w-[4.5rem] lg:-right-3 lg:h-24 lg:w-24">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={secondaryProduct?.id}
            className="h-full w-full overflow-hidden rounded-[var(--r-pill)]"
            style={{
              border: '2.5px solid rgba(210,166,79,0.45)',
              background: 'rgba(26,23,20,0.92)',
              boxShadow: 'var(--shadow-lg)',
            }}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: reduced ? 0.001 : 0.4, ease: [0.16, 1, 0.3, 1] },
            }}
            exit={{
              opacity: 0,
              scale: reduced ? 1 : 0.88,
              transition: { duration: reduced ? 0.001 : 0.28, ease: [0.55, 0.06, 0.68, 0.19] },
            }}
          >
            {secondaryProduct?.imageURL && (
              <img
                src={secondaryProduct.imageURL}
                alt={secondaryProduct.name || 'Featured firework'}
                loading="lazy"
                className="h-full w-full object-contain p-2"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Clickable product arch */}
      <Link
        to={productPath(mainProduct)}
        aria-label={mainProduct.name || 'View product'}
        className="group relative block w-full outline-none"
        style={{ aspectRatio: '5 / 6' }}
      >
        <motion.div
          className="relative h-full w-full"
          whileHover={reduced ? undefined : { scale: 1.03 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <ArchFrame />

          {/* Glass fill */}
          <div
            className="absolute inset-[5%] overflow-hidden"
            style={{
              borderRadius: '999px 999px var(--r-xl) var(--r-xl)',
              border: '1px solid rgba(210,166,79,0.34)',
              background:
                'linear-gradient(168deg, rgba(255,253,248,0.13) 0%, rgba(255,253,248,0.04) 55%, rgba(58,11,12,0.22) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,253,248,0.22), var(--shadow-xl)',
            }}
          />

          {/* Hover glow */}
          <div
            className="absolute inset-[5%] rounded-[999px_999px_var(--r-xl)_var(--r-xl)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              boxShadow: 'inset 0 0 40px rgba(210,166,79,0.15), 0 0 30px rgba(210,166,79,0.12)',
            }}
          />

          {/* Fixed product stage */}
          <div
            className="absolute inset-[5%] overflow-hidden"
            style={{ borderRadius: '999px 999px var(--r-xl) var(--r-xl)' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mainProduct.id}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: {
                    duration: reduced ? 0.001 : FADE_MS / 1000,
                    ease: [0.16, 1, 0.3, 1],
                  },
                }}
                exit={{
                  opacity: 0,
                  scale: reduced ? 1 : 0.97,
                  transition: {
                    duration: reduced ? 0.001 : FADE_MS / 1000,
                    ease: [0.55, 0.06, 0.68, 0.19],
                  },
                }}
              >
                <img
                  src={mainProduct.imageURL}
                  alt={mainProduct.name || 'Premium firework product'}
                  loading="eager"
                  className="block max-h-[70%] max-w-[80%] object-contain sm:max-h-[72%] sm:max-w-[82%] md:max-h-[74%] md:max-w-[84%] lg:max-h-[76%] lg:max-w-[86%]"
                  style={{ filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.4))' }}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </Link>

      {/* Diyas */}
      <div className="mt-3 flex items-end justify-center gap-9" aria-hidden="true">
        <Diya className="h-6 w-10" delay="0s" />
        <Diya className="h-7 w-12" delay="0.7s" />
        <Diya className="h-6 w-10" delay="1.3s" />
      </div>
    </div>
  );
}
