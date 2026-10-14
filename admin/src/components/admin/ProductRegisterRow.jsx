import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  PackageCheck,
  PackageX,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import ImagePlaceholder from '../ImagePlaceholder';
import { displayNameForCategory } from '../../lib/categoryIcons';
import { DURATION } from '../../lib/motion';

/**
 * One line of the product register.
 *
 * Presentational only — every mutation is handed back up to AllProducts so the
 * Firestore writes and the reorder persistence stay in a single place.
 *
 * Layout: stacked card below `xl`, dense table row from `xl` up. The trailing
 * cells use `display: contents` at `xl` so they become direct flex children of
 * the row and line up under the shared column header.
 */
const ProductRegisterRow = ({
  product,
  position,
  total,
  index,
  reduced,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onToggleFeatured,
  onToggleStock,
  onDelete,
  onEditClick,
}) => {
  const shownCategories = (product.categories || [product.category]).filter(Boolean).slice(0, 2);
  const extraCategories = (product.categories || []).length - 2;

  const borderColour = isDragging
    ? 'var(--ember-600)'
    : isDropTarget
      ? 'var(--gold-500)'
      : 'var(--hairline)';

  return (
    <motion.li
      initial={{ opacity: 0, y: reduced ? 0 : 14 }}
      animate={{ opacity: isDragging ? 0.7 : 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0.001 }
          : {
              opacity: { duration: DURATION.base },
              y: { duration: DURATION.base },
              delay: Math.min(index, 12) * 0.04,
            }
      }
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      data-dragging={isDragging ? 'true' : undefined}
      data-drop-target={isDropTarget ? 'true' : undefined}
      className="group relative flex cursor-grab flex-col gap-2 rounded-[var(--r-md)] border px-3 py-2 transition-[border-color,box-shadow,filter] duration-150 hover:brightness-[1.05] hover:shadow-[var(--shadow-sm)] active:cursor-grabbing xl:flex-row xl:items-center xl:gap-4 xl:px-4 xl:py-1.5"
      style={{
        background: isDropTarget ? 'var(--surface-sunken)' : 'var(--surface-card)',
        borderColor: borderColour,
        borderStyle: isDragging ? 'dashed' : 'solid',
        boxShadow: isDragging ? 'var(--shadow-lg)' : 'var(--shadow-xs)',
      }}
    >
      {/* Drop indicator — a solid rail on the leading edge of the target slot. */}
      {isDropTarget && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-[3px] left-2 right-2 h-[3px] rounded-full xl:bottom-0 xl:left-0 xl:right-auto xl:top-0 xl:h-auto xl:w-[3px]"
          style={{ background: 'var(--gold-500)' }}
        />
      )}

      {/* Handle + thumbnail + identity */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          aria-hidden="true"
          title="Drag to reorder"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors duration-150 group-hover:text-[var(--text-muted)]"
          style={{
            background: isDragging ? 'rgba(195, 58, 20, 0.12)' : 'var(--surface-sunken)',
            border: `1px solid ${isDragging ? 'rgba(195, 58, 20, 0.4)' : 'var(--hairline)'}`,
            color: isDragging ? 'var(--ember-600)' : 'var(--text-subtle)',
          }}
        >
          <GripVertical className="h-4 w-4" strokeWidth={2} />
        </span>

        <div
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px]"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--hairline)' }}
        >
          {product.imageURL ? (
            <img
              src={product.imageURL}
              alt=""
              aria-hidden="true"
              draggable={false}
              loading="lazy"
              decoding="async"
              width={44}
              height={44}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              className="h-full w-full object-contain p-1"
              style={{ aspectRatio: '1 / 1' }}
            />
          ) : (
            <ImagePlaceholder compact />
          )}
          {product.isFeatured && (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-[var(--r-sm)]"
              style={{ background: 'var(--gold-500)' }}
            >
              <Star className="h-2.5 w-2.5 text-white" fill="currentColor" strokeWidth={0} />
            </span>
          )}
          {product.outOfStock && (
            <span
              className="absolute inset-x-0 bottom-0 text-center text-[0.55rem] font-bold uppercase tracking-wider text-white"
              style={{ background: 'var(--crimson-600)' }}
            >
              Out of stock
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              title={product.name}
              className="truncate text-[13.5px] font-bold leading-tight tracking-tight"
              style={{ color: 'var(--text-strong)' }}
            >
              {product.name}
            </h3>
            {isDragging && <span className="badge badge-ember shrink-0">Moving</span>}
          </div>

          {product.description && (
            <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {product.description}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {shownCategories.map((cat, idx) => (
              <span key={`${cat}-${idx}`} className="badge badge-neutral">
                {displayNameForCategory(cat)}
              </span>
            ))}
            {extraCategories > 0 && (
              <span className="badge badge-neutral tabular">+{extraCategories}</span>
            )}
          </div>
        </div>
      </div>

      {/* Trailing cells — table columns at xl, wrapped chips below it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 xl:contents">
        {/* Pricing — small uppercase muted labels, bold right-aligned amounts */}
        <div className="min-w-[7rem] xl:w-[8.5rem] xl:shrink-0">
          <dl className="flex items-center gap-4 xl:block xl:space-y-0.5">
            <div className="flex items-baseline gap-1.5 xl:justify-between">
              <dt className="label-caps">Online</dt>
              <dd
                className="price tabular text-[15px] font-bold"
                style={{ color: 'var(--text-strong)' }}
              >
                {(() => {
                  const v = product.discountPrice ?? product.onlinePrice ?? product.price;
                  return v != null && v !== '' ? `₹${Number(v).toLocaleString('en-IN')}` : '—';
                })()}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5 xl:justify-between">
              <dt className="label-caps">Offline</dt>
              <dd className="price tabular text-[15px] font-bold" style={{ color: 'var(--text-body)' }}>
                {(() => {
                  const v = product.offlineDiscountPrice ?? product.offlineMRP ?? product.offlinePrice;
                  return v != null && v !== '' ? `₹${Number(v).toLocaleString('en-IN')}` : '—';
                })()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Status — compact indicators, existing brand/status colours */}
        <div className="flex items-center gap-1.5 xl:w-[11.5rem] xl:shrink-0">
          <button
            type="button"
            onClick={() => onToggleFeatured(product.id, product.isFeatured)}
            aria-pressed={!!product.isFeatured}
            title={product.isFeatured ? 'Remove from featured' : 'Add to featured'}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[7px] border px-2 text-[11px] font-bold uppercase tracking-wide transition-colors duration-150"
            style={
              product.isFeatured
                ? {
                    background: 'rgba(210, 166, 79, 0.16)',
                    borderColor: 'rgba(210, 166, 79, 0.45)',
                    color: 'var(--gold-600)',
                  }
                : {
                    background: 'var(--surface-sunken)',
                    borderColor: 'var(--hairline)',
                    color: 'var(--text-muted)',
                  }
            }
          >
            <Star
              className="h-3 w-3 shrink-0"
              aria-hidden="true"
              fill={product.isFeatured ? 'currentColor' : 'none'}
              strokeWidth={2}
            />
            {product.isFeatured ? 'Featured' : 'Feature'}
          </button>

          <button
            type="button"
            onClick={() => onToggleStock(product.id, product.outOfStock)}
            aria-pressed={!product.outOfStock}
            title={product.outOfStock ? 'Mark as in stock' : 'Mark as out of stock'}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[7px] border px-2 text-[11px] font-bold uppercase tracking-wide transition-colors duration-150"
            style={
              product.outOfStock
                ? {
                    background: 'rgba(203, 42, 42, 0.10)',
                    borderColor: 'rgba(203, 42, 42, 0.32)',
                    color: 'var(--crimson-600)',
                  }
                : {
                    background: 'rgba(44, 122, 83, 0.12)',
                    borderColor: 'rgba(44, 122, 83, 0.32)',
                    color: 'var(--leaf-600)',
                  }
            }
          >
            {product.outOfStock ? (
              <PackageX className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2} />
            ) : (
              <PackageCheck className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2} />
            )}
            {product.outOfStock ? 'Restock' : 'In Stock'}
          </button>
        </div>

        {/* Display order — grouped pill: number (secondary) + compact square steppers */}
        <div
          className="inline-flex items-center gap-1 rounded-[8px] border px-1 py-0.5 xl:w-[8.5rem] xl:shrink-0"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
        >
          <span
            className="tabular shrink-0 px-1 text-[11px] font-semibold"
            style={{ color: 'var(--text-subtle)' }}
          >
            <span className="sr-only">Position </span>#{position}
          </span>
          <button
            type="button"
            onClick={() => onMoveUp(product.id)}
            disabled={position <= 1}
            title="Move up (customers see this first)"
            aria-label={`Move ${product.name} up — customers see this first`}
            className="btn-quiet h-8 min-h-[32px] w-8 shrink-0 p-0 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(product.id)}
            disabled={position >= total}
            title="Move down"
            aria-label={`Move ${product.name} down`}
            className="btn-quiet h-8 min-h-[32px] w-8 shrink-0 p-0 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Actions — compact icon buttons: neutral edit, danger delete */}
        <div className="ml-auto flex items-center gap-1.5 xl:ml-0 xl:w-[6rem] xl:shrink-0 xl:justify-end">
          <Link
            to={`/products/edit/${product.id}`}
            onClick={onEditClick}
            title={`Edit ${product.name}`}
            aria-label={`Edit ${product.name}`}
            className="btn-quiet h-8 min-h-[32px] px-2.5 xl:w-8 xl:justify-center xl:px-0"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="xl:sr-only">Edit</span>
          </Link>
          <button
            type="button"
            onClick={() => onDelete(product.id)}
            title={`Delete ${product.name}`}
            aria-label={`Delete ${product.name}`}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-[7px] border px-2.5 text-xs font-semibold transition-colors duration-150 xl:w-8 xl:px-0"
            style={{
              background: 'rgba(203, 42, 42, 0.08)',
              borderColor: 'rgba(203, 42, 42, 0.28)',
              color: 'var(--crimson-600)',
            }}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="xl:hidden">Delete</span>
          </button>
        </div>
      </div>
    </motion.li>
  );
};

export default ProductRegisterRow;
