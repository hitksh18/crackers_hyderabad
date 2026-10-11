import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { PRODUCT_CATEGORIES } from '../config/categories';

/**
 * About Crackers Hyderabad — factual store introduction only.
 * No founding dates, awards, statistics or superlatives: everything stated
 * here is verifiable from the catalogue and site configuration.
 */
const About = () => (
  <div className="min-h-screen">
    <Seo
      title="About Us | Crackers Hyderabad"
      description="About Crackers Hyderabad — Hyderabad's online fireworks store for sparklers, rockets, flower pots, gift boxes and wholesale crackers with doorstep delivery."
      canonical="/about"
    />
    <div className="shell-narrow section-pad-sm">
      <span className="section-eyebrow">Our Store</span>
      <h1 className="section-title mt-4" style={{ color: 'var(--text-strong)' }}>
        About Crackers Hyderabad
      </h1>
      <div className="panel-editorial glass-card mt-6 p-5 sm:p-6">
        <p className="text-base" style={{ color: 'var(--text-body)' }}>
          Crackers Hyderabad is an online fireworks store serving Hyderabad. We
          sell sparklers, rockets, flower pots, ground chakkars, bombs,
          garlands, fancy fireworks and gift boxes, with options for family
          celebrations as well as wholesale orders.
        </p>
        <p className="mt-3 text-base" style={{ color: 'var(--text-body)' }}>
          Every product on this website is listed with its price, and orders
          are delivered to your doorstep. You can browse the full catalogue,
          track an order, or get in touch with us at any time.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link to="/products" className="btn-primary px-6 py-3 text-sm">
            Shop Products
          </Link>
          <Link to="/contact" className="btn-outline px-6 py-3 text-sm">
            Contact Us
          </Link>
        </div>
      </div>
      <h2 className="section-title mt-8 text-xl" style={{ color: 'var(--text-strong)' }}>
        Shop by Category
      </h2>
      <nav aria-label="Product categories" className="mt-3 flex flex-wrap gap-2">
        {PRODUCT_CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            to={`/products?category=${encodeURIComponent(c.value)}`}
            className="rounded-full border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
          >
            {c.name}
          </Link>
        ))}
      </nav>
    </div>
  </div>
);

export default About;
