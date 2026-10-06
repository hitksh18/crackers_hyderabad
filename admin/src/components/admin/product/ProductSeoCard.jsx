import { Search as SearchIcon } from 'lucide-react';
import FormCard from './FormCard';
import ProductSeoFields from '../ProductSeoFields';

/**
 * SEO — full-width card reusing the shared SEO fields: title/keywords/slug
 * on the top row, description/tags on the second row. Slug generation /
 * uniqueness / oldSlugs handling stays in the page submit logic.
 */
const ProductSeoCard = ({ seoData, onSeoChange }) => (
  <FormCard icon={SearchIcon} title="SEO Settings" subtitle="Search listing and product URL.">
    <ProductSeoFields seoData={seoData} onChange={onSeoChange} wide />
  </FormCard>
);

export default ProductSeoCard;
