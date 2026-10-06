import { Loader2, Save } from 'lucide-react';
import AdminHeader from './AdminHeader';
import StickySaveBar from './StickySaveBar';
import {
  ProductInformationCard,
  ProductPricingCard,
  ProductHighlightsCard,
  ProductStatusCard,
  ProductMediaCard,
  ProductOrganizationCard,
  ProductSeoCard,
} from './product';

/**
 * Shared Add/Edit Product form.
 *
 * Full-width workspace grid (65/35 columns, 16px gap, 24–32px gutters, no
 * narrow centered column). Desktop places cards into strict rows via
 * explicit grid lines — row 1: Information | Image, row 2: Pricing | Status,
 * row 3: Highlights | Organization, row 4: full-width SEO. Cards in a row
 * occupy the same row area; leftover space is distributed inside the cards
 * (growing image preview, bottom-pinned footers).
 *
 * DOM order is the mobile order (Information, Image, Pricing, Status,
 * Highlights, Organization, SEO) — below `md` everything stacks in that
 * sequence with a sticky bottom save bar.
 *
 * Presentational only — submit/load/validation logic lives in the pages.
 */
const ProductForm = ({
  mode, // 'add' | 'edit'
  productName,
  formData,
  seoData,
  errors,
  brands,
  imagePreview,
  imageURL,
  useURL,
  imageProgress,
  onFieldChange,
  onSeoChange,
  onCategoryToggle,
  onImageChange,
  onImageURLChange,
  onToggleUseURL,
  onBrandChange,
  onShowAddBrand,
  onMarkTouched,
  onSubmit,
  loading,
}) => {
  const isAdd = mode === 'add';
  const title = isAdd ? 'Add Product' : 'Edit Product';
  const saveLabel = isAdd ? 'Create Product' : 'Update Product';
  const saveLoadingLabel = isAdd ? 'Creating Product...' : 'Updating Product...';

  return (
    <div className="admin-page bg-[var(--surface-page)]">
      {/* Sticky top bar: Back | centered title | Save + avatar */}
      <AdminHeader
        title={title}
        backFallback="/products"
        controls={(
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="ax-btn-primary"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{loading ? saveLoadingLabel : saveLabel}</span>
            <span className="sm:hidden">{isAdd ? 'Create' : 'Update'}</span>
          </button>
        )}
      />

      <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
        {/* Context line — makes the mode unmistakable */}
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={
              isAdd
                ? { background: 'rgba(44, 122, 83, 0.14)', color: 'var(--leaf-600)' }
                : { background: 'rgba(195, 58, 20, 0.12)', color: 'var(--ember-600)' }
            }
          >
            {isAdd ? 'New product' : 'Editing'}
          </span>
          {!isAdd && productName ? (
            <p className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>“{productName}”</span>
              <span className="hidden sm:inline"> — changes go live as soon as you save.</span>
            </p>
          ) : isAdd ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Create a new product for your store.
            </p>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="min-w-0">
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
            <div className="min-w-0 md:col-start-1 md:row-start-1">
              <ProductInformationCard
                formData={formData}
                errors={errors}
                brands={brands}
                onFieldChange={onFieldChange}
                onBrandChange={onBrandChange}
                onShowAddBrand={onShowAddBrand}
                onMarkTouched={onMarkTouched}
              />
            </div>

            <div className="min-w-0 md:col-start-2 md:row-start-1">
              <ProductMediaCard
                imagePreview={imagePreview}
                imageURL={imageURL}
                useURL={useURL}
                imageProgress={imageProgress}
                onImageChange={onImageChange}
                onImageURLChange={onImageURLChange}
                onToggleUseURL={onToggleUseURL}
              />
            </div>

            <div className="min-w-0 md:col-start-1 md:row-start-2">
              <ProductPricingCard
                formData={formData}
                errors={errors}
                onFieldChange={onFieldChange}
                onMarkTouched={onMarkTouched}
              />
            </div>

            <div className="min-w-0 md:col-start-2 md:row-start-2">
              <ProductStatusCard
                formData={formData}
                onFieldChange={onFieldChange}
              />
            </div>

            <div className="min-w-0 md:col-start-1 md:row-start-3">
              <ProductHighlightsCard
                formData={formData}
                onFieldChange={onFieldChange}
              />
            </div>

            <div className="min-w-0 md:col-start-2 md:row-start-3">
              <ProductOrganizationCard
                selected={formData.categories}
                onToggle={onCategoryToggle}
                error={errors.categories}
              />
            </div>

            <div className="min-w-0 md:col-start-1 md:col-end-[-1] md:row-start-4">
              <ProductSeoCard
                seoData={seoData}
                onSeoChange={onSeoChange}
              />
            </div>
          </div>

          {/* Mobile sticky save — the header action stays reachable */}
          <div className="mt-4 md:hidden">
            <StickySaveBar
              loading={loading}
              label={saveLabel}
              loadingLabel={saveLoadingLabel}
              hint={isAdd ? 'Creates the product and its store pricing.' : 'Updates the product and its store pricing.'}
              icon={Save}
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
