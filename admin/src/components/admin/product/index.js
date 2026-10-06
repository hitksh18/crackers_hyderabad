/**
 * Shared Add/Edit Product UI — both pages compose the same cards so the two
 * screens can never drift apart. Page-level submit/load logic stays in
 * AddProduct.jsx and EditProduct.jsx.
 */
export { default as FormCard } from './FormCard';
export { default as ProductInformationCard } from './ProductInformationCard';
export { default as ProductPricingCard } from './ProductPricingCard';
export { default as ProductHighlightsCard } from './ProductHighlightsCard';
export { default as ProductStatusCard } from './ProductStatusCard';
export { default as ProductMediaCard } from './ProductMediaCard';
export { default as ProductOrganizationCard } from './ProductOrganizationCard';
export { default as ProductSeoCard } from './ProductSeoCard';
