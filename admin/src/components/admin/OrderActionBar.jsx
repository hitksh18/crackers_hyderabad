import { Download, Loader2, MessageCircle, Pencil, Printer, Trash2 } from 'lucide-react';

/**
 * Row actions for the orders register.
 *
 * Two presentations, one markup path: 44x44 icon buttons inside the dense
 * desktop table, icon + word inside the mobile cards. Every icon-only button
 * still carries an aria-label and a title, so the action is never colour- or
 * glyph-only.
 *
 * Colour is applied to the icon and the hover frame, never to the label text —
 * that keeps the label at full contrast in both themes.
 */
const TONES = {
  neutral: { icon: 'var(--text-muted)', wash: 'var(--surface-sunken)', ring: 'var(--hairline-strong)' },
  ember: { icon: 'var(--ember-500)', wash: 'rgba(195, 58, 20, 0.10)', ring: 'rgba(195, 58, 20, 0.32)' },
  leaf: { icon: '#3E9A6B', wash: 'rgba(44, 122, 83, 0.12)', ring: 'rgba(44, 122, 83, 0.34)' },
  crimson: { icon: '#E14848', wash: 'rgba(203, 42, 42, 0.10)', ring: 'rgba(203, 42, 42, 0.32)' },
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border ' +
  'border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--text-body)] ' +
  'transition-[background-color,border-color,transform] duration-150 ' +
  'hover:bg-[var(--btn-wash)] hover:border-[var(--btn-ring)] active:scale-[0.97] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const ActionButton = ({
  icon: Icon,
  text,
  label,
  tone = 'neutral',
  onClick,
  disabled = false,
  labelled = false,
  spinning = false,
}) => {
  const palette = TONES[tone] || TONES.neutral;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{ '--btn-wash': palette.wash, '--btn-ring': palette.ring, '--btn-icon': palette.icon }}
      className={`${BASE} ${labelled ? 'min-h-[44px] px-3 text-xs font-semibold' : 'h-11 w-11'}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 text-[var(--btn-icon)] ${spinning ? 'animate-spin' : ''}`}
        aria-hidden="true"
        strokeWidth={2}
      />
      {labelled && <span>{text}</span>}
    </button>
  );
};

const OrderActionBar = ({
  orderCode,
  showWhatsApp = false,
  canEdit = false,
  canDelete = false,
  isBusy = false,
  labelled = false,
  onDownloadInvoice,
  onPrintInvoice,
  onWhatsApp,
  onEdit,
  onDelete,
}) => (
  <div className={`flex flex-wrap items-center gap-2 ${labelled ? '' : 'justify-end'}`}>
    <ActionButton
      icon={isBusy ? Loader2 : Download}
      spinning={isBusy}
      text={isBusy ? 'Generating' : 'Invoice'}
      label={isBusy ? `Generating invoice for order ${orderCode}` : `Download invoice for order ${orderCode}`}
      tone="neutral"
      onClick={onDownloadInvoice}
      disabled={isBusy}
      labelled={labelled}
    />
    <ActionButton
      icon={Printer}
      text="Print"
      label={`Print invoice for order ${orderCode}`}
      tone="neutral"
      onClick={onPrintInvoice}
      disabled={isBusy}
      labelled={labelled}
    />
    {showWhatsApp && (
      <ActionButton
        icon={MessageCircle}
        text="WhatsApp"
        label={`Message the customer on WhatsApp about order ${orderCode}`}
        tone="leaf"
        onClick={onWhatsApp}
        labelled={labelled}
      />
    )}
    {canEdit && (
      <ActionButton
        icon={Pencil}
        text="Edit"
        label={`Edit order ${orderCode}`}
        tone="ember"
        onClick={onEdit}
        labelled={labelled}
      />
    )}
    {canDelete && (
      <ActionButton
        icon={Trash2}
        text="Delete"
        label={`Delete order ${orderCode}`}
        tone="crimson"
        onClick={onDelete}
        labelled={labelled}
      />
    )}
  </div>
);

export default OrderActionBar;
