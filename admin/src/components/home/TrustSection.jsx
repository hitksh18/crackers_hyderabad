import ScrollReveal from '../ui/ScrollReveal';
import SectionHeading from '../ui/SectionHeading';
import { RangoliDivider } from '../ui/Ornaments';
import { whyChoose } from './homeData';

const TrustSection = ({ heading }) => (
  <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
    <div className="shell-wide">
      <SectionHeading
        eyebrow={heading?.eyebrow || 'Why Us'}
        title={heading?.title || 'Why Choose Crackers Hyderabad'}
        subtitle={heading?.subtitle || 'The city’s most trusted fireworks destination'}
      />

      <RangoliDivider className="mx-auto -mt-4 mb-6 max-w-md" />

      <ScrollReveal
        stagger={0.05}
        className="mx-auto grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5"
      >
        {whyChoose.map((feature, index) => (
          <ScrollReveal.Item key={feature.title}>
            <div className="card-premium glass-card group relative h-full overflow-hidden p-4 text-center sm:p-4">
              <span
                className="tabular pointer-events-none absolute -top-2 right-3 select-none text-[2.25rem] font-extrabold leading-none transition-transform duration-300 ease-out-expo group-hover:scale-110"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--ember-600)', opacity: 0.1 }}
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <span
                className="mx-auto mb-3 flex h-11 w-11 items-center justify-center transition-transform duration-300 ease-out-expo group-hover:scale-105"
                style={{
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--grad-ember)',
                  boxShadow: 'var(--shadow-ember)',
                }}
                aria-hidden="true"
              >
                <feature.icon className="h-5 w-5" strokeWidth={2.1} style={{ color: '#FFFFFF' }} />
              </span>

              <h3 className="card-title mb-1.5" style={{ color: 'var(--text-strong)' }}>
                {feature.title}
              </h3>
              <p
                className="text-xs leading-relaxed"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--text-muted)' }}
              >
                {feature.text}
              </p>
            </div>
          </ScrollReveal.Item>
        ))}
      </ScrollReveal>
    </div>
  </section>
);

export default TrustSection;
