import { Search } from 'lucide-react';
import FormField from './FormField';

/**
 * SEO panel shared by Add Product and Edit Product.
 *
 * The five inputs keep their original `name` values so the pages' single
 * `handleSeoChange` reducer and the `seo` document shape are untouched.
 */
const ProductSeoFields = ({ seoData, onChange }) => (
  <div
    className="rounded-[var(--r-sm)] border p-4"
    style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
  >
    <h3 className="label-caps mb-3 flex items-center gap-1.5">
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      SEO Settings
    </h3>

    <div className="space-y-4">
      <FormField id="seo-title" label="SEO Title">
        <input
          id="seo-title"
          type="text"
          name="title"
          value={seoData.title}
          onChange={onChange}
          placeholder="Enter SEO title (defaults to product name)"
          className="input-premium"
        />
      </FormField>

      <FormField id="seo-description" label="SEO Description">
        <textarea
          id="seo-description"
          name="description"
          value={seoData.description}
          onChange={onChange}
          rows="2"
          placeholder="Enter SEO description for search engines"
          className="input-premium"
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="seo-keywords" label="SEO Keywords" hint="Comma separated keywords">
          <input
            id="seo-keywords"
            type="text"
            name="keywords"
            value={seoData.keywords}
            onChange={onChange}
            placeholder="fireworks, crackers, diwali (comma separated)"
            aria-describedby="seo-keywords-hint"
            className="input-premium"
          />
        </FormField>

        <FormField id="seo-slug" label="SEO Slug" hint="URL-friendly name">
          <input
            id="seo-slug"
            type="text"
            name="slug"
            value={seoData.slug}
            onChange={onChange}
            placeholder="product-url-slug"
            aria-describedby="seo-slug-hint"
            className="input-premium"
          />
        </FormField>
      </div>

      <FormField id="seo-tags" label="SEO Tags" hint="Comma separated tags for categorization">
        <input
          id="seo-tags"
          type="text"
          name="tags"
          value={seoData.tags}
          onChange={onChange}
          placeholder="diwali, celebration, festival (comma separated)"
          aria-describedby="seo-tags-hint"
          className="input-premium"
        />
      </FormField>
    </div>
  </div>
);

export default ProductSeoFields;
