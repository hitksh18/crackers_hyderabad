/**
 * The house motion language.
 *
 * Rules this file encodes:
 *  - entering uses ease-out, leaving uses ease-in
 *  - only transform and opacity are animated
 *  - at most one or two focal animations per view; everything else is a
 *    short, cheap reveal
 *  - every variant has a still counterpart for reduced-motion visitors
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];
export const EASE_OUT_SOFT = [0.22, 0.61, 0.36, 1];
export const EASE_IN_SOFT = [0.55, 0.06, 0.68, 0.19];

export const DURATION = {
  instant: 0.1,
  fast: 0.18,
  base: 0.28,
  slow: 0.4,
  cinematic: 0.9,
};

export const SPRING = {
  soft: { type: 'spring', stiffness: 220, damping: 26 },
  snappy: { type: 'spring', stiffness: 380, damping: 30 },
  gentle: { type: 'spring', stiffness: 140, damping: 20 },
};

/** Scroll reveal. Distance shrinks to zero when motion is reduced. */
export const revealVariants = (reduced, distance = 24) => ({
  hidden: { opacity: 0, y: reduced ? 0 : distance },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.slow, ease: EASE_OUT_EXPO },
  },
});

/** Parent wrapper that staggers its children in. */
export const staggerParent = (reduced, stagger = 0.06, delayChildren = 0) => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: reduced ? 0 : stagger,
      delayChildren: reduced ? 0 : delayChildren,
    },
  },
});

/** Route-level transition. Deliberately short so navigation never feels slow. */
export const pageVariants = (reduced) => ({
  initial: { opacity: 0, y: reduced ? 0 : 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : -8,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/** Modal / dialog. */
export const modalVariants = (reduced) => ({
  hidden: { opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: reduced ? { duration: 0.001 } : SPRING.soft,
  },
  exit: {
    opacity: 0,
    scale: reduced ? 1 : 0.97,
    y: reduced ? 0 : 8,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/** Dropdown / popover anchored to a trigger. */
export const popoverVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : -8, scale: reduced ? 1 : 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_OUT_SOFT },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : -6,
    scale: reduced ? 1 : 0.98,
    transition: { duration: reduced ? 0.001 : DURATION.instant, ease: EASE_IN_SOFT },
  },
});

/** Full-screen mobile menu. */
export const sheetVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : '-6%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : '-4%',
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/** Standard `whileInView` config — reveal once, slightly before the edge. */
export const inViewOnce = { once: true, amount: 0.15, margin: '0px 0px -60px 0px' };

/** Interactive feedback for buttons and cards. */
export const tapFeedback = (reduced) =>
  reduced ? {} : { whileTap: { scale: 0.97 }, transition: SPRING.snappy };

export const hoverLift = (reduced, y = -6) =>
  reduced ? {} : { whileHover: { y }, transition: SPRING.soft };
