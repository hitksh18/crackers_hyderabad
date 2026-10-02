import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { revealVariants } from '../../lib/motion';

/**
 * Shared empty / not-found / error panel.
 *
 * Always takes a Lucide icon component — never a character glyph.
 * `tone` picks the frame colour: neutral for "nothing here yet", alert for
 * genuine failures.
 */
const TONES = {
  neutral: {
    ring: 'rgba(190, 140, 54, 0.28)',
    wash: 'rgba(210, 166, 79, 0.12)',
    icon: 'var(--gold-600)',
  },
  alert: {
    ring: 'rgba(203, 42, 42, 0.28)',
    wash: 'rgba(203, 42, 42, 0.10)',
    icon: 'var(--crimson-600)',
  },
};

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action = null,
  secondaryAction = null,
  tone = 'neutral',
  className = '',
}) => {
  const reduced = useReducedMotion();
  const palette = TONES[tone] || TONES.neutral;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={revealVariants(reduced, 16)}
      className={`panel-editorial mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center sm:px-10 ${className}`}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: palette.wash, border: `1px solid ${palette.ring}` }}
        >
          <Icon className="h-7 w-7" style={{ color: palette.icon }} strokeWidth={1.7} />
        </span>
      )}

      <h3 className="subsection-title">{title}</h3>

      {description && (
        <p className="mt-3 max-w-prose text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          {action}
          {secondaryAction}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
