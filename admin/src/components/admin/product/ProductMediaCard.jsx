import { Image as ImageIcon } from 'lucide-react';
import FormCard from './FormCard';

/**
 * Product image — controlled-height centered preview, Upload / URL modes,
 * progress and save-state feedback. Upload behaviour (file upload, API post,
 * URL mode) lives in the page handlers; this is layout.
 */
const ProductMediaCard = ({ imagePreview, imageURL, useURL, imageProgress, onImageChange, onImageURLChange, onToggleUseURL, imagePreview2, imageURL2, useURL2, onImageChange2, onImageURLChange2, onToggleUseURL2 }) => (
  <FormCard icon={ImageIcon} title="Product Image" subtitle="Upload a product image with the background already removed.">
    <div
      className="flex min-h-[240px] w-full flex-1 items-center justify-center overflow-hidden rounded-[var(--r-sm)] border"
      style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
    >
      {imagePreview ? (
        <img src={imagePreview} alt="Product preview" className="h-full w-full object-contain p-2" />
      ) : (
        <span className="flex flex-col items-center gap-1.5 px-4 text-center">
          <ImageIcon className="h-7 w-7" style={{ color: 'var(--text-subtle)' }} />
          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>No image selected</span>
        </span>
      )}
    </div>

    <div className="mt-2.5 flex shrink-0 gap-2" role="group" aria-label="Image source">
      <button
        type="button"
        onClick={() => onToggleUseURL(false)}
        aria-pressed={!useURL}
        className="h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition-colors"
        style={{
          borderColor: !useURL ? 'var(--ember-600)' : 'var(--hairline)',
          color: !useURL ? 'var(--ember-600)' : 'var(--text-muted)',
          background: !useURL ? 'var(--surface-sunken)' : 'var(--surface-card)',
        }}
      >
        Upload Image
      </button>
      <button
        type="button"
        onClick={() => onToggleUseURL(true)}
        aria-pressed={useURL}
        className="h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition-colors"
        style={{
          borderColor: useURL ? 'var(--ember-600)' : 'var(--hairline)',
          color: useURL ? 'var(--ember-600)' : 'var(--text-muted)',
          background: useURL ? 'var(--surface-sunken)' : 'var(--surface-card)',
        }}
      >
        Image URL
      </button>
    </div>

    <div className="mt-2.5 shrink-0">
      {useURL ? (
        <input
          type="url"
          value={imageURL || imagePreview || ''}
          onChange={onImageURLChange}
          placeholder="https://example.com/image.jpg"
          className="input-premium h-11 text-sm"
          aria-label="Image URL"
        />
      ) : (
        <input
          type="file"
          accept="image/*"
          onChange={onImageChange}
          className="w-full max-w-full cursor-pointer truncate text-sm file:mr-2 file:rounded-full file:border file:bg-[var(--surface-sunken)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Upload product image"
        />
      )}
      <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {imagePreview ? 'This image will be saved.' : 'No image selected.'}
      </p>
      {imageProgress !== null && imageProgress !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }}>
          <div className="h-full transition-all" style={{ width: `${imageProgress}%`, background: 'var(--grad-ember)' }} />
        </div>
      )}
    </div>

    {/* Optional second product image — rendered only when the page wires the
        imageURL2 handlers. Primary block above is untouched. */}
    {onImageChange2 && (
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          Second image <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
        </p>
        <div
          className="mt-2 flex min-h-[120px] w-full items-center justify-center overflow-hidden rounded-[var(--r-sm)] border"
          style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
        >
          {imagePreview2 ? (
            <img src={imagePreview2} alt="Second product preview" className="h-full w-full object-contain p-2" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 px-4 text-center">
              <ImageIcon className="h-6 w-6" style={{ color: 'var(--text-subtle)' }} />
              <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>No second image</span>
            </span>
          )}
        </div>

        <div className="mt-2.5 flex shrink-0 gap-2" role="group" aria-label="Second image source">
          <button
            type="button"
            onClick={() => onToggleUseURL2(false)}
            aria-pressed={!useURL2}
            className="h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition-colors"
            style={{
              borderColor: !useURL2 ? 'var(--ember-600)' : 'var(--hairline)',
              color: !useURL2 ? 'var(--ember-600)' : 'var(--text-muted)',
              background: !useURL2 ? 'var(--surface-sunken)' : 'var(--surface-card)',
            }}
          >
            Upload Image
          </button>
          <button
            type="button"
            onClick={() => onToggleUseURL2(true)}
            aria-pressed={useURL2}
            className="h-9 flex-1 rounded-full border px-3 text-xs font-semibold transition-colors"
            style={{
              borderColor: useURL2 ? 'var(--ember-600)' : 'var(--hairline)',
              color: useURL2 ? 'var(--ember-600)' : 'var(--text-muted)',
              background: useURL2 ? 'var(--surface-sunken)' : 'var(--surface-card)',
            }}
          >
            Image URL
          </button>
        </div>

        <div className="mt-2.5 shrink-0">
          {useURL2 ? (
            <input
              type="url"
              value={imageURL2 || imagePreview2 || ''}
              onChange={onImageURLChange2}
              placeholder="https://example.com/image-2.jpg"
              className="input-premium h-11 text-sm"
              aria-label="Second image URL"
            />
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={onImageChange2}
              className="w-full max-w-full cursor-pointer truncate text-sm file:mr-2 file:rounded-full file:border file:bg-[var(--surface-sunken)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Upload second product image"
            />
          )}
        </div>
      </div>
    )}
  </FormCard>
);

export default ProductMediaCard;
