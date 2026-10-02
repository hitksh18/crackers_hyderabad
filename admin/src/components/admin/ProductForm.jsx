import { Link } from 'react-router-dom';
import AccountMenu from './AccountMenu';
import '../../admin-portrait.css';
import { ArrowLeft, Save, Tag, Image as ImageIcon, IndianRupee, Layers, Boxes, Search as SearchIcon, Star, PackageX } from 'lucide-react';
import FormField from './FormField';
import CategoryPicker from './CategoryPicker';
import ProductPriceFields from './ProductPriceFields';
import ProductSeoFields from './ProductSeoFields';
import ToggleCard from './ToggleCard';

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

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
    <div className="min-h-screen bg-[var(--surface-page)]">
      {/* Page-specific Navbar - 56-64px, sticky, Back left, Title centered, Save right */}
      <header className="sticky top-0 z-30 flex h-[60px] w-full shrink-0 items-center border-b bg-[var(--surface-card)] px-4 lg:px-8" style={{ borderColor: 'var(--hairline)' }}>
        <div className="mx-auto flex w-[calc(100%-32px)] max-w-[1550px] items-center gap-4 lg:w-[calc(100%-48px)]">
          <Link to="/products" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ember-600)' }}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Products</span>
            <span className="sm:hidden">Back</span>
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 hidden text-sm font-bold tracking-tight sm:block" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
            {title}
          </h1>
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-bold sm:hidden" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{title}</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-bold text-white shadow-sm transition disabled:opacity-60"
            style={{ background: 'var(--grad-ember)' }}
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{loading ? saveLoadingLabel : saveLabel}</span>
            <span className="sm:hidden">{isAdd ? 'Create' : 'Update'}</span>
          </button>
          <AccountMenu />
        </div>
      </header>

      <div className="mx-auto flex w-[calc(100%-32px)] max-w-[1550px] flex-1 flex-col min-h-0 gap-3 px-0 py-3 lg:w-[calc(100%-48px)] lg:px-0">
        {/* Subtle context line - compact 20px */}
        {!isAdd && productName ? (
          <p className="shrink-0 text-sm" style={{ color: 'var(--text-muted)' }}>
            Editing <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>“{productName}”</span> <span className="hidden sm:inline">— Changes go live as soon as you save.</span>
          </p>
        ) : isAdd ? (
          <p className="shrink-0 text-sm" style={{ color: 'var(--text-muted)' }}>Create a new product for your store.</p>
        ) : (
          <div className="shrink-0 h-4" />
        )}

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3 min-h-0">
          {/* IDENTITY + MEDIA - 58-62% / 38-42% (stacked in portrait-desktop, see admin-portrait.css) */}
          <div className="pf-idmedia grid shrink-0 gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            {/* Identity */}
            <div className="rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <Tag className="h-4 w-4" style={{ color: 'var(--ember-600)' }} />
                </span>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Identity</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>What the product is called and who makes it.</p>
                </div>
              </div>

              <div className="space-y-4">
                <FormField id="product-name" label="Product Name" required error={errors.name}>
                  <input
                    id="product-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={onFieldChange}
                    onBlur={onMarkTouched}
                    aria-invalid={errors.name ? 'true' : undefined}
                    aria-describedby={describedBy('product-name', errors.name, null)}
                    className="input-premium"
                    required
                  />
                </FormField>

                <FormField id="product-brand" label="Product Brand" hint="Optional. Pick an existing brand or create a new one.">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      id="product-brand"
                      name="brand"
                      value={formData.brand}
                      onChange={onFieldChange}
                      className="input-premium sm:flex-1"
                    >
                      <option value="">Select Brand (Optional)</option>
                      {brands.map(brand => (
                        <option key={brand.id} value={brand.name}>{brand.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={onShowAddBrand} className="btn-outline shrink-0">
                      Add Brand
                    </button>
                  </div>
                </FormField>

                <FormField id="product-description" label="Description">
                  <textarea
                    id="product-description"
                    name="description"
                    value={formData.description}
                    onChange={onFieldChange}
                    rows="3"
                    className="input-premium resize-none"
                    placeholder="Short description for the product card"
                  />
                </FormField>
              </div>
            </div>

            {/* Media */}
            <div className="rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <ImageIcon className="h-4 w-4" style={{ color: 'var(--ember-600)' }} />
                </span>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Media</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>One product image. Background removed automatically.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onToggleUseURL}
                    className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${useURL ? 'bg-[var(--surface-sunken)]' : 'bg-[var(--surface-card)]'}`}
                    style={{ borderColor: useURL ? 'var(--ember-600)' : 'var(--hairline)', color: useURL ? 'var(--ember-600)' : 'var(--text-muted)' }}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleUseURL(false)}
                    className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${!useURL ? 'bg-[var(--surface-sunken)]' : 'bg-[var(--surface-card)]'}`}
                    style={{ borderColor: !useURL ? 'var(--ember-600)' : 'var(--hairline)', color: !useURL ? 'var(--ember-600)' : 'var(--text-muted)' }}
                  >
                    Upload
                  </button>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="h-full w-full object-contain p-1" />
                    ) : (
                      <ImageIcon className="h-7 w-7" style={{ color: 'var(--text-subtle)' }} />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    {useURL ? (
                      <input
                        type="url"
                        value={imageURL || imagePreview}
                        onChange={onImageURLChange}
                        placeholder="https://example.com/image.jpg"
                        className="input-premium h-9 text-sm"
                      />
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onImageChange}
                        className="w-full cursor-pointer text-sm file:mr-2 file:rounded-full file:border file:bg-[var(--surface-sunken)] file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    )}
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {imagePreview ? 'This image will be saved.' : 'No image selected.'}
                    </p>
                    {imageProgress !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }}>
                        <div className="h-full transition-all" style={{ width: `${imageProgress}%`, background: 'var(--grad-ember)' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing - 4 cols, compact */}
          <div className="shrink-0 rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--ember-600)' }}>₹</span>
              </span>
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Pricing</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Website prices drive storefront. Store prices drive billing.</p>
              </div>
            </div>
            <ProductPriceFields formData={formData} onChange={onFieldChange} onBlur={onMarkTouched} errors={errors} />
          </div>

          {/* CATEGORY | AVAILABILITY | SEO - 3 cols (2 cols + full-width SEO in portrait-desktop) */}
          <div className="pf-trio grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--ember-600)' }}>#</span>
                </span>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Category</h2>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
                  Categories <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--crimson-600)' }}>Required</span>
                </p>
                <CategoryPicker options={categories} selected={formData.categories} onToggle={onCategoryToggle} invalid={!!errors.categories} describedBy={errors.categories ? 'categories-error' : undefined} />
                {errors.categories ? (
                  <p id="categories-error" className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>{errors.categories}</p>
                ) : (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>Multiple categories allowed</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <Star className="h-3.5 w-3.5" style={{ color: 'var(--gold-500)' }} />
                </span>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Availability</h2>
              </div>
              <div className="space-y-3">
                <ToggleCard
                  id="isFeatured"
                  icon={Star}
                  tone="gold"
                  label="Featured"
                  description="Storefront highlights."
                  checked={formData.isFeatured}
                  onChange={(e) => onFieldChange({ target: { name: 'isFeatured', value: e.target.checked } })}
                />
                <ToggleCard
                  id="outOfStock"
                  icon={PackageX}
                  tone="crimson"
                  label="Out of Stock"
                  description="Hides buy action."
                  checked={formData.outOfStock}
                  onChange={(e) => onFieldChange({ target: { name: 'outOfStock', value: e.target.checked } })}
                />
                <div className="flex items-center gap-2">
                  <label htmlFor="sortOrder" className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-strong)' }}>Order</label>
                  <input
                    id="sortOrder"
                    type="number"
                    name="sortOrder"
                    value={formData.sortOrder}
                    onChange={onFieldChange}
                    placeholder="0"
                    className="input-premium h-8 flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-[var(--surface-card)] p-4" style={{ borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <SearchIcon className="h-3.5 w-3.5" style={{ color: 'var(--ember-600)' }} />
                </span>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>SEO</h2>
              </div>
              <ProductSeoFields seoData={seoData} onChange={onSeoChange} compact />
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};

const categories = ['Rockets', 'Sparkles', 'Ground Chakkars', 'Sky Shots', 'Gift Boxes', 'Flower Pots', 'Bombs', 'Garlands', 'Kids Special', 'Guns, Rolls & Pop Pop', 'Threads and Novelties'];

export default ProductForm;
