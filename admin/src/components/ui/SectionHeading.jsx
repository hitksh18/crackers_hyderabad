import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { revealVariants, inViewOnce } from '../../lib/motion';

/**
 * The one section header used across the storefront.
 *
 * `align="left"` is the editorial default; centre it only when the section
 * below is itself symmetrical.
 */
const SectionHeading = ({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  as: Heading = 'h2',
  action = null,
  className = '',
}) => {
  const reduced = useReducedMotion();
  const centred = align === 'center';

  return (
    <div
      className={`mb-[var(--space-heading)] ${
        centred
          ? 'text-center'
          : 'flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between text-left'
      } ${className}`}
    >
      <div className={centred ? '' : 'max-w-2xl'}>
        {eyebrow && (
          <span className={`section-eyebrow ${centred ? 'justify-center' : ''}`}>{eyebrow}</span>
        )}

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={inViewOnce}
          variants={revealVariants(reduced, 18)}
        >
          <Heading className="section-title mt-3">{title}</Heading>
          {subtitle && (
            <p
              className={`mt-2.5 text-base max-w-prose ${centred ? 'mx-auto' : ''}`}
              style={{ color: 'var(--text-muted)' }}
            >
              {subtitle}
            </p>
          )}
        </motion.div>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export default SectionHeading;
