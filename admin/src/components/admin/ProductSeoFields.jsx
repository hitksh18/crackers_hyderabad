import { Search } from 'lucide-react';
import FormField from './FormField';

/**
 * SEO panel shared by Add Product and Edit Product.
 *
 * The five inputs keep their original `name` values so the pages' single
 * `handleSeoChange` reducer and the `seo` document shape are untouched.
 * `stacked` renders keywords/slug in one column for narrow sidebars;
 * `wide` renders the full-width card layout — title/keywords/slug on the
 * top row, description/tags on the second row.
 */
const ProductSeoFields = ({ seoData, onChange, stacked = false, wide = false }) => {
  const titleField = (
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
  );

  const descriptionField = (
    <FormField id="seo-description" label="SEO Description">
      <textarea
        id="seo-description"
        name="description"
        value={seoData.description}
        onChange={onChange}
        rows="2"
        placeholder="Enter SEO description for search engines"
        className="input-premium min-h-[68px] resize-none"
      />
    </FormField>
  );

  const keywordsField = (
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
  );

  const slugField = (
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
  );

  const tagsField = (
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
  );

  return (
    <div
      className="rounded-[var(--r-sm)] border p-4"
      style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)' }}
    >
      <h3 className="label-caps mb-3 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        SEO Settings
      </h3>

      {wide ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {titleField}
            {keywordsField}
            {slugField}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {descriptionField}
            {tagsField}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {titleField}
          {descriptionField}
          <div className={`grid gap-3 ${stacked ? '' : 'md:grid-cols-2'}`}>
            {keywordsField}
            {slugField}
          </div>
          {tagsField}
        </div>
      )}
    </div>
  );
};

export default ProductSeoFields;
