import HomeProductRail from './HomeProductRail';

const FeaturedSection = ({ products, heading, loading, showAllLink }) => (
  <section className="section-pad" style={{ background: 'var(--surface-card)' }}>
    <div className="shell-wide">
      <HomeProductRail
        eyebrow={heading?.eyebrow || 'Handpicked'}
        title={heading?.title || 'Featured Products'}
        subtitle={heading?.subtitle || 'Our best-selling fireworks handpicked for you'}
        products={products}
        loading={loading}
        showAllLink={showAllLink || '/products'}
        railLabel="featured products"
      />
    </div>
  </section>
);

export default FeaturedSection;