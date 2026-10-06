/**
 * Compact card shell shared by every Add/Edit Product section.
 *
 * One radius (14px), one border, one background, one padding (20px), one
 * header pattern — individual cards must not invent their own chrome.
 * The root is full-height flex column: cards sharing a grid row occupy the
 * same row area, and each card distributes leftover space internally
 * (growing previews, bottom-pinned footers) instead of leaving voids.
 *
 * Dark Crackers Hyderabad admin theme only — all values are existing CSS vars.
 */
const FormCard = ({ icon: Icon, iconColor, title, subtitle, action, children, className = '' }) => (
  <section
    className={`flex h-full w-full min-w-0 flex-col rounded-[14px] border bg-[var(--surface-card)] p-5 ${className}`}
    style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)', boxSizing: 'border-box' }}
  >
    <div className="mb-4 flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
        style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
      >
        {Icon ? <Icon className="h-4 w-4" style={{ color: iconColor || 'var(--ember-600)' }} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold leading-tight" style={{ color: 'var(--text-strong)' }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
    <div className="flex min-w-0 flex-1 flex-col">{children}</div>
  </section>
);

export default FormCard;
