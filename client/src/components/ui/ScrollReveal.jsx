import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { revealVariants, staggerParent, inViewOnce } from '../../lib/motion';

/**
 * Reveals its children once as they scroll into view.
 *
 * Pass `stagger` to have direct children come in one after another — those
 * children must be <ScrollReveal.Item> (or any motion element using the
 * `hidden`/`visible` variant names).
 */
const ScrollReveal = ({
  children,
  as: Tag = 'div',
  distance = 24,
  delay = 0,
  stagger,
  className = '',
  ...rest
}) => {
  const reduced = useReducedMotion();
  const MotionTag = motion[Tag] || motion.div;

  /* Progressive enhancement only: where IntersectionObserver is
     unavailable the content renders as a plain (visible) element instead
     of mounting at opacity 0 waiting for an observer tick that never
     comes. Every modern browser takes the animated path below — visuals
     are unchanged there. */
  if (typeof window !== 'undefined' && typeof window.IntersectionObserver === 'undefined') {
    const PlainTag = Tag;
    return (
      <PlainTag className={className} {...rest}>
        {children}
      </PlainTag>
    );
  }

  const variants = stagger
    ? staggerParent(reduced, stagger, delay)
    : {
        hidden: revealVariants(reduced, distance).hidden,
        visible: {
          ...revealVariants(reduced, distance).visible,
          transition: {
            ...revealVariants(reduced, distance).visible.transition,
            delay: reduced ? 0 : delay,
          },
        },
      };

  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={inViewOnce}
      variants={variants}
      className={className}
      {...rest}
    >
      {children}
    </MotionTag>
  );
};

const Item = ({ children, as: Tag = 'div', distance = 20, className = '', ...rest }) => {
  const reduced = useReducedMotion();
  const MotionTag = motion[Tag] || motion.div;

  return (
    <MotionTag variants={revealVariants(reduced, distance)} className={className} {...rest}>
      {children}
    </MotionTag>
  );
};

ScrollReveal.Item = Item;

export default ScrollReveal;
