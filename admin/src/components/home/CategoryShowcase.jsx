import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import CategoryIcon from '../CategoryIconPack';
import ScrollReveal from '../ui/ScrollReveal';
import SectionHeading from '../ui/SectionHeading';
import { categoryDefs } from './homeData';

const ArrowPip = ({ className = '', style }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-[var(--r-pill)] transition-transform duration-300 ease-out-expo group-hover:translate-x-1 ${className}`}
    style={style || { background: 'var(--grad-ember)', boxShadow: 'var(--shadow-ember)' }}
    aria-hidden="true"
  >
    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} style={{ color: '#FFFFFF' }} />
  </span>
);

/**
 * Uniform category grid. Every card shares the same geometry (compact on
 * phones, larger from sm up) and fills a clean 3x3 grid; each card carries a
 * live count derived from the products already loaded on the page.
 */
const CategoryShowcase = ({ sectionRef, countInCategory, categories = categoryDefs, heading }) => (
  <section
    ref={sectionRef}
    id="categories"
    className="section-pad"
    style={{ background: 'var(--surface-card)', scrollMarginTop: '84px' }}
  >
    <div className="shell-wide">
      <SectionHeading
        eyebrow={heading?.eyebrow || 'Explore'}
        title={heading?.title || 'Shop by Categories'}
        subtitle={heading?.subtitle || 'Handpicked ranges for every celebration'}
      />

      {(() => {
        const COLS = 3;
        const remainder = categories.length % COLS;
        const gridCategories = remainder === 0 ? categories : categories.slice(0, -remainder);
        const overflowCategories = remainder === 0 ? [] : categories.slice(-remainder);

        const renderCard = (cat) => {
          const count = countInCategory(cat.match);
          return (
            <div key={cat.name} className="category-card is-glass group h-full p-3 lg:p-4">
              <Link
                to={`/products?category=${encodeURIComponent(cat.link)}`}
                className="flex h-full items-center gap-2 sm:flex-col sm:items-center sm:gap-2 lg:flex-row lg:justify-start lg:gap-3.5"
              >
                <span
                  className="category-icon-wrap flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12 lg:h-16 lg:w-16"
                  aria-hidden="true"
                >
                  <CategoryIcon category={cat.slug} glow />
                </span>

                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:items-center lg:items-start">
                  <div className="flex w-full min-w-0 items-center gap-2 sm:justify-center lg:justify-between">
                    <h3
                      className="category-title min-w-0 flex-1 text-left transition-colors duration-200 sm:text-center lg:text-left"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      {cat.name}
                    </h3>
                    {/* From sm up the pip sits beside the title, as before. On
                        phones it moves to the meta row below so the category
                        name gets the card's full inner width and can wrap by
                        whole words instead of being squeezed per-character. */}
                    <span className="hidden shrink-0 sm:block">
                      <ArrowPip className="h-[22px] w-[22px]" />
                    </span>
                  </div>

                  <div className="flex w-full items-center justify-between gap-2 sm:justify-center lg:justify-start">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      <span className="tabular">{count}</span> item{count !== 1 ? 's' : ''}
                    </p>
                    <span className="shrink-0 sm:hidden">
                      <ArrowPip className="h-[22px] w-[22px]" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          );
        };

        return (
          <>
            <ScrollReveal stagger={0.03} distance={12} className="category-grid">
              {gridCategories.map((cat) => (
                <ScrollReveal.Item key={cat.name} distance={12}>{renderCard(cat)}</ScrollReveal.Item>
              ))}
            </ScrollReveal>

            {overflowCategories.length > 0 && (
              <ScrollReveal stagger={0.03} distance={12} className="category-grid-overflow">
                {overflowCategories.map((cat) => (
                  <ScrollReveal.Item key={cat.name} distance={12} className="category-grid-overflow-cell">
                    {renderCard(cat)}
                  </ScrollReveal.Item>
                ))}
              </ScrollReveal>
            )}
          </>
        );
      })()}
    </div>
  </section>
);

export default CategoryShowcase;