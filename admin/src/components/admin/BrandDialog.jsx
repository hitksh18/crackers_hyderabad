import { AnimatePresence, motion } from 'framer-motion';
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { modalVariants } from '../../lib/motion';

/**
 * "Add new brand" dialog.
 *
 * Fully controlled: every value and every handler comes from the page, so the
 * Firestore write, the background-removal upload and the reset semantics stay
 * exactly where they were.
 *
 * `onClose` is the dismiss path (backdrop, X) and leaves the draft intact.
 * `onCancel` is the explicit cancel path and clears the draft — same split as
 * the original screens.
 */
const BrandDialog = ({
  open,
  reduced,
  name,
  onNameChange,
  logo,
  onLogoChange,
  logoFile,
  onLogoFileChange,
  description,
  onDescriptionChange,
  submitting,
  onSubmit,
  onClose,
  onCancel,
}) => (
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
                Add New Brand
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close add brand dialog"
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
                {submitting ? 'Adding...' : 'Add Brand'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default BrandDialog;
