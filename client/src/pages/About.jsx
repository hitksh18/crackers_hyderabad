import { Link } from 'react-router-dom';
import { ShieldCheck, Tags, Truck, Headphones, ArrowRight } from 'lucide-react';
import Seo from '../components/Seo';
import { PRODUCT_CATEGORIES } from '../config/categories';

/**
 * About Crackers Hyderabad — premium festive editorial.
 * Copy stays factual (no founding dates, awards or statistics): everything
 * stated here is verifiable from the catalogue and site configuration.
 * Layout only — routing, auth, cart, products and all behaviour untouched.
 */
const VALUES = [
  {
    n: '01',
    icon: ShieldCheck,
    title: 'Trusted Products',
    text: 'Carefully selected products from established fireworks brands.',
  },
  {
    n: '02',
    icon: Tags,
    title: 'Transparent Pricing',
    text: 'Clear pricing and offers before you place your order.',
  },
  {
    n: '03',
    icon: Truck,
    title: 'Hyderabad Delivery',
    text: 'Convenient doorstep delivery across Hyderabad.',
  },
  {
    n: '04',
    icon: Headphones,
    title: 'Customer First',
    text: 'Support before, during and after your order.',
  },
];

const About = () => (
  <div className="about-page min-h-screen">
    <Seo
      title="About Us | Crackers Hyderabad"
      description="About Crackers Hyderabad — Hyderabad's online fireworks store for sparklers, rockets, flower pots, gift boxes and wholesale crackers with doorstep delivery."
      canonical="/about"
    />

    {/* ---- Centered hero ---- */}
    <section className="about-hero">
      <div className="about-shell pb-12 pt-12 sm:pb-16 sm:pt-16">
        <span className="section-eyebrow justify-center">Our Story</span>
        <h1 className="about-title mt-4">About Crackers Hyderabad</h1>
        <p className="about-sub">Celebrating Hyderabad, one spark at a time.</p>
        <p className="about-lead mt-5 text-base">
          Crackers Hyderabad brings together trusted fireworks, festive
          favourites and carefully selected celebration essentials for
          families across Hyderabad.
        </p>
        <div className="about-cta-row mt-7">
          <Link to="/products" className="btn-maroon nav-login-btn px-7 py-3 text-sm">
            Shop Products
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </Link>
          <Link to="/contact" className="btn-outline px-7 py-3 text-sm">
            Contact Us
          </Link>
        </div>
      </div>
    </section>

    {/* ---- Visual story ---- */}
    <section className="about-sec about-story">
      <div className="about-shell">
        <div className="about-story-grid">
          <div className="about-visual" role="img" aria-label="Crackers Hyderabad festive brand artwork">
            <div className="about-visual-copy">
              <p className="about-visual-kicker">EST. HYDERABAD</p>
              <p className="about-visual-title">
                Made for
                <br />
                Celebrations
              </p>
            </div>
          </div>
          <div>
            <span className="section-eyebrow">Who We Are</span>
            <h2 className="about-h2 mt-3">More Than Fireworks</h2>
            <p className="about-lead mt-4 text-base" style={{ marginInline: 0 }}>
              Crackers Hyderabad is an online fireworks store serving customers
              across Hyderabad.
            </p>
            <p className="about-lead mt-3 text-base" style={{ marginInline: 0 }}>
              We bring together sparklers, rockets, flower pots, ground
              chakkars, bombs, garlands, fancy fireworks and gift boxes in one
              carefully curated catalogue.
            </p>
            <p className="about-lead mt-3 text-base" style={{ marginInline: 0 }}>
              Whether you are celebrating with family or placing a larger
              festive order, our goal is to make the entire experience simple,
              transparent and reliable.
            </p>
            <hr className="rule-gold mt-6 max-w-[220px]" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>

    {/* ---- Brand values ---- */}
    <section className="about-sec about-values">
      <div className="about-shell">
        <div className="about-section-head">
          <span className="section-eyebrow justify-center">Why Us</span>
          <h2 className="about-h2 mt-3">Why Choose Us</h2>
          <p className="about-section-sub">
            Everything we do is built around a better celebration.
          </p>
        </div>
        <div className="about-values-grid mt-8">
          {VALUES.map((v) => (
            <article key={v.n} className="about-value-card">
              <span className="about-value-ico" aria-hidden="true">
                <v.icon strokeWidth={2.1} aria-hidden="true" />
              </span>
              <p className="about-value-num mt-4">{v.n}</p>
              <h3 className="about-value-title">{v.title}</h3>
              <p className="about-value-text">{v.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    {/* ---- Festive brand banner ---- */}
    <section className="about-sec about-banner">
      <div className="about-shell">
        <h2 className="about-banner-title">Made for Moments That Matter</h2>
        <p className="about-banner-sub">
          From a small family celebration to a festive gathering, bring a
          little more sparkle to every moment.
        </p>
        <div className="about-cta-row mt-7">
          <Link to="/products" className="btn-gold px-7 py-3 text-sm">
            Explore Our Collection
            <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>

    {/* ---- Category index (same links + order as everywhere else) ---- */}
    <section className="about-sec about-cats">
      <div className="about-shell">
        <div className="about-section-head">
          <span className="section-eyebrow justify-center">Categories</span>
          <h2 className="about-h2 mt-3">Explore Our Collection</h2>
        </div>
        <nav aria-label="Product categories" className="about-pills mt-7">
          {PRODUCT_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              to={`/products?category=${encodeURIComponent(c.value)}`}
              className="about-pill"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  </div>
);
export default About;
