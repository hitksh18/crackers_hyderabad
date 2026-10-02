/**
 * A single boolean switch presented as a labelled card.
 *
 * State is carried by the checkbox itself plus the icon and the border tone —
 * never by colour alone.
 */
const TONES = {
  gold: { on: 'rgba(210, 166, 79, 0.14)', border: 'rgba(210, 166, 79, 0.5)', ink: 'var(--gold-600)' },
  crimson: { on: 'rgba(203, 42, 42, 0.10)', border: 'rgba(203, 42, 42, 0.38)', ink: 'var(--crimson-600)' },
  ember: { on: 'rgba(195, 58, 20, 0.10)', border: 'rgba(195, 58, 20, 0.38)', ink: 'var(--ember-600)' },
};

const ToggleCard = ({ id, icon: Icon, label, description, checked, onChange, tone = 'ember' }) => {
  const palette = TONES[tone] || TONES.ember;

  return (
    <label
      htmlFor={id}
      className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--r-sm)] border p-3 transition-colors"
      style={{
        background: checked ? palette.on : 'var(--surface-card)',
        borderColor: checked ? palette.border : 'var(--hairline-strong)',
      }}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--ember-600)]"
      />
      <span className="min-w-0">
        <span
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: checked ? palette.ink : 'var(--text-strong)' }}
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={1.9} /> : null}
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
};

export default ToggleCard;
