import { AnimatePresence, motion } from 'framer-motion';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { modalVariants } from '../../lib/motion';

/**
 * Add / edit brand dialog.
 *
 * Fully controlled: every value and every handler comes from the page, so the
 * Firestore write, the logo upload and the reset semantics stay exactly where
 * they were.
 *
 * `onClose` is the dismiss path (backdrop, X) and leaves the draft intact.
 * `onCancel` is the explicit cancel path and clears the draft — same split as
 * the original screens.
 *
 * Add mode (used inline from Add/Edit Product) passes only name/logo/
 * description; slug + active are optional and default to auto-slug + active.
 * The Brands page passes the full set for managed editing.
 */
const BrandDialog = ({
  open,
  reduced,
  mode = 'add',
  title,
  submitLabel,
  submittingLabel,
  name,
  onNameChange,
  slug = '',
  onSlugChange = null,
  slugEdited = false,
  logo,
  onLogoChange,
  logoFile,
  onLogoFileChange,
  description,
  onDescriptionChange,
  active = true,
  onActiveChange = null,
  submitting,
  onSubmit,
  onClose,
  onCancel,
}) => {
  const isEdit = mode === 'edit';
  const heading = title || (isEdit ? 'Edit Brand' : 'Add New Brand');
  const action = submitLabel || (isEdit ? 'Save Changes' : 'Add Brand');
  const actionBusy = submittingLabel || (isEdit ? 'Saving...' : 'Adding...');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.001 : 0.18 }}
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/55 p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="brand-dialog-title"
            variants={modalVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-lg)] border"
            style={{
              background: 'var(--surface-card)',
              borderColor: 'var(--hairline-strong)',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-5 py-4"
              style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
            >
              <div className="min-w-0">
                <p className="label-caps">Catalogue</p>
                <h2 id="brand-dialog-title" className="card-title" style={{ color: 'var(--text-strong)' }}>
                  {heading}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close brand dialog"
                className="btn-quiet h-11 w-11 shrink-0 justify-center p-0"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label
                  htmlFor="brand-name"
                  className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  Brand Name
                  <span
                    className="text-[0.625rem] font-bold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--crimson-600)' }}
                  >
                    Required
                  </span>
                </label>
                <input
                  id="brand-name"
                  type="text"
                  value={name}
                  onChange={onNameChange}
                  placeholder="Enter brand name"
                  className="input-premium"
                  autoFocus
                />
              </div>

              {onSlugChange && (
                <div>
                  <label
                    htmlFor="brand-slug"
                    className="mb-1.5 block text-sm font-semibold"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    Brand Slug
                  </label>
                  <input
                    id="brand-slug"
                    type="text"
                    value={slug}
                    onChange={onSlugChange}
                    placeholder="standard-fireworks"
                    className="input-premium"
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {slugEdited
                      ? 'Custom slug — used in the shareable storefront URL.'
                      : 'Generated automatically from the name — edit to customize the storefront URL.'}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="brand-logo-url"
                  className="mb-1.5 block text-sm font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  Brand Logo
                </label>
                <div className="space-y-3">
                  <input
                    id="brand-logo-url"
                    type="url"
                    value={logoFile ? '' : logo}
                    onChange={onLogoChange}
                    placeholder="Enter logo URL or upload file"
                    className="input-premium disabled:opacity-60"
                    disabled={!!logoFile}
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="btn-quiet min-h-[44px] cursor-pointer px-3">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onLogoFileChange}
                        className="sr-only"
                      />
                    </label>
                    {logoFile && (
                      <span className="badge badge-leaf max-w-[12rem] truncate">{logoFile.name}</span>
                    )}
                  </div>
                </div>

                {logo && (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={logo}
                      alt="Brand logo preview"
                      className="h-16 w-16 rounded-[var(--r-sm)] border object-contain p-1"
                      style={{ background: 'var(--surface-raised)', borderColor: 'var(--hairline)' }}
                      onError={(e) => (e.target.style.display = 'none')}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Logo Preview
                    </span>
                  </div>
                )}
                {!logo && !logoFile && (
                  <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    No logo selected yet
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="brand-description"
                  className="mb-1.5 block text-sm font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  Brand Description
                </label>
                <textarea
                  id="brand-description"
                  value={description}
                  onChange={onDescriptionChange}
                  placeholder="Enter brand description (optional)"
                  rows={3}
                  className="input-premium resize-none"
                />
              </div>

              {onActiveChange && (
                <div
                  className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border px-3 py-2.5"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {active ? 'Active' : 'Inactive'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {active
                        ? 'Shown in customer brand navigation.'
                        : 'Hidden from customers — products stay in the database.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label="Brand status"
                    onClick={() => onActiveChange(!active)}
                    className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200"
                    style={{ background: active ? 'var(--leaf-600)' : 'var(--hairline-strong)' }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: active ? '1.375rem' : '0.125rem' }}
                    />
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button type="button" onClick={onCancel} className="btn-outline flex-1">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={submitting}
                  className="btn-primary flex-1"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {submitting ? actionBusy : action}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BrandDialog;
