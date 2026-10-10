import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import CategoryIcon from '../CategoryIconPack';

/**
 * "Firecrackers in Hyderabad" homepage guide — single visual definition.
 *
 * Pure presentational: everything rendered comes from props (resolved by
 * lib/seoGuide.js from the Canvas section config with fallbacks). No data
 * fetching, no effects, stable dimensions from first render.
 *
 * Mirrored to admin/src/components/home/SeoGuideSection.jsx so the Canvas
 * live preview renders this same component with draft config (separate Vite
 * builds, no shared package): keep the two files identical.
 */

/* One FAQ row: the answer stays in the DOM (collapsed via grid rows, never
   removed), so it remains crawlable and accessible. */
const FaqItem = ({ faq, index }) => {
  const [open, setOpen] = useState(false);
  const panelId = `home-faq-panel-${index}`;
  return (
    <div className="border-b" style={{ borderColor: 'var(--hairline)' }}>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2 text-left text-[15px] font-semibold"
          style={{ color: 'var(--text-strong)' }}
        >
          <span>{faq.q}</span>
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-sm font-bold leading-none transition-transform duration-200"
            style={{
              borderColor: 'rgba(210, 166, 79, 0.45)',
              color: 'var(--gold-400)',
              transform: open ? 'rotate(45deg)' : 'none',
            }}
          >
            +
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pb-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {faq.a}
          </p>
        </div>
      </div>
    </div>
  );
};

const SeoGuideSection = ({
  eyebrow,
  heading,
  paras = [],
  categoryHeading,
  categories = [],
  faqHeading,
  faqs = [],
}) => (
  <section className="section-pad-sm" style={{ background: 'var(--surface-page)' }} aria-labelledby="home-seo-heading">
    <div className="shell-wide">
      <div className="panel-editorial seo-guide">
        <p className="section-eyebrow seo-guide-eyebrow">
          {eyebrow}
        </p>
        <h2 id="home-seo-heading" className="section-title seo-guide-title">
          {heading}
        </h2>
        <div className="seo-guide-copy">
          {paras.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {categories.length > 0 && (
          <>
            <p className="section-eyebrow seo-guide-sub">
              {categoryHeading}
            </p>
            <nav aria-label="Shop by category" className="seo-cat-grid">
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  to={`/products?category=${encodeURIComponent(c.value)}`}
                  className="seo-cat-box"
                >
                  <span className="seo-cat-icon" aria-hidden="true">
                    <CategoryIcon category={c.slug} noCrop />
                  </span>
                  <span className="seo-cat-name">{c.name}</span>
                  <ArrowRight className="seo-cat-arrow" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </>
        )}
        {faqs.length > 0 && (
          <>
            <h3 className="seo-faq-title">
              {faqHeading}
            </h3>
            <div className="seo-faq-list">
              {faqs.map((f, i) => (
                <FaqItem key={f.q || i} faq={f} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  </section>
);

export default SeoGuideSection;
