/**
 * "Firecrackers in Hyderabad" homepage guide — shared definition.
 *
 * The Admin Canvas `seoGuide` builder section (settings/homepageBuilder)
 * carries an optional `config` with overrides. Everything resolves with
 * fallbacks so a missing/partial config can never render blank headings,
 * empty cards or errors:
 *
 *   section config  →  siteSettings.seo (existing admin SEO)  →  defaults
 *
 * Category identity (name/slug/value/route) ALWAYS comes from the canonical
 * PRODUCT_CATEGORIES — Canvas only stores visibility (`hiddenSlugs`) and
 * ordering (`orderSlugs`), never names. Mirrored to admin/src/lib/seoGuide.js
 * (separate Vite builds, no shared package): keep the two files identical.
 */
import { PRODUCT_CATEGORIES } from '../config/categories';
import { DEFAULT_SEO } from './siteSettings';

export const SEO_GUIDE_TYPE = 'seoGuide';

export const DEFAULT_SEO_GUIDE = {
  eyebrow: 'Hyderabad • Premium Fireworks',
  heading: 'Firecrackers in Hyderabad',
  categoryHeading: 'Explore Categories',
  faqHeading: 'Frequently Asked Questions',
  paragraphs: [
    'Looking for firecrackers in Hyderabad? Crackers Hyderabad brings together a wide selection of fireworks for Diwali, festivals and special celebrations. Explore sparklers, flower pots, ground chakkars, rockets, garlands, fancy fireworks and gift boxes in one convenient online collection.',
    'Shop Diwali crackers online in Hyderabad and discover fireworks for every kind of celebration. From traditional sparklers and flower pots to rockets, ground chakkars and premium gift boxes, our collection makes it easy to explore and choose your favourite crackers.',
    'Whether you are planning a family Diwali celebration or looking for festive fireworks in Hyderabad, browse our online fireworks collection and explore different categories in one place.',
  ],
  faqs: [
    {
      q: 'Where can I buy firecrackers in Hyderabad?',
      a: 'You can browse and shop firecrackers online at Crackers Hyderabad, including sparklers, flower pots, rockets, ground chakkars, garlands and gift boxes.',
    },
    {
      q: 'Can I buy crackers online in Hyderabad?',
      a: 'Yes. Crackers Hyderabad is an online fireworks store serving Hyderabad — order through the website cart and checkout, then track your order online.',
    },
    {
      q: 'What types of firecrackers are available?',
      a: 'Sparklers, flower pots, ground chakkars, rockets, bombs, garlands, fancy fireworks, kids’ novelties and gift boxes. Use the category links above to browse each range.',
    },
    {
      q: 'Do you sell Diwali crackers?',
      a: 'Yes — sparklers, flower pots, ground chakkars, rockets, garlands and gift boxes are popular choices for Diwali crackers in Hyderabad and festive occasions.',
    },
    {
      q: 'Do you offer firecracker delivery in Hyderabad?',
      a: 'Yes. Place your order through the website cart and checkout then track it online — we offer doorstep delivery across Hyderabad.',
    },
    {
      q: 'What categories of fireworks are available?',
      a: 'Browse Sparklers, Flower Pots, Ground Chakkars, Rockets, Garlands, Fancy Fireworks, Gift Boxes and Bombs — or open the full catalogue to explore the complete fireworks collection.',
    },
  ],
  hiddenSlugs: [],
  orderSlugs: [],
};

export const DEFAULT_SEO_GUIDE_SECTION = {
  id: 'seoGuide',
  type: SEO_GUIDE_TYPE,
  label: 'Firecrackers in Hyderabad',
  enabled: true,
  order: 15,
  config: {},
};

const cleanText = (value) => String(value || '').trim();

const cleanList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? item : item?.text ?? ''))
    .map((s) => String(s || '').trim())
    .filter(Boolean);

const cleanFaqs = (value) =>
  (Array.isArray(value) ? value : [])
    .map((f) => ({ q: String(f?.q || '').trim(), a: String(f?.a || '').trim() }))
    .filter((f) => f.q && f.a);

/* Long-standing homepage behaviour, preserved exactly: the admin's SEO
   content field only stands in (first paragraph) when it differs from the
   shipped default — otherwise the three default paragraphs render, so the
   field stays meaningful without ever rendering the full text twice. */
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const siteParas = (siteSeo) => {
  const content = norm(siteSeo?.content);
  if (!content || content === norm(DEFAULT_SEO?.content)) return [];
  const first = String(siteSeo.content).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)[0];
  return first ? [first] : [];
};

/**
 * Resolve the render-ready section. Never returns blanks:
 * every field falls back down the chain to the hardcoded defaults.
 */
export const resolveSeoGuide = ({ sectionConfig, siteSeo } = {}) => {
  const cfg = sectionConfig && typeof sectionConfig === 'object' ? sectionConfig : {};

  const cfgParas = cleanList(cfg.paragraphs);
  const siteFallback = siteParas(siteSeo);
  const paras = cfgParas.length > 0
    ? cfgParas
    : (siteFallback.length > 0 ? siteFallback : [...DEFAULT_SEO_GUIDE.paragraphs]);

  const cfgFaqs = cleanFaqs(cfg.faqs);

  const hidden = new Set(
    (Array.isArray(cfg.hiddenSlugs) ? cfg.hiddenSlugs : []).map((s) => String(s)),
  );
  const rank = new Map(
    (Array.isArray(cfg.orderSlugs) ? cfg.orderSlugs : []).map((s, i) => [String(s), i]),
  );
  const categories = [...PRODUCT_CATEGORIES]
    .filter((c) => !hidden.has(c.slug))
    .sort((a, b) => (rank.get(a.slug) ?? 9999) - (rank.get(b.slug) ?? 9999))
    .map((c) => ({ name: c.name, slug: c.slug, value: c.value }));

  return {
    eyebrow: cleanText(cfg.eyebrow) || DEFAULT_SEO_GUIDE.eyebrow,
    heading: cleanText(cfg.heading) || cleanText(siteSeo?.contentHeading) || DEFAULT_SEO_GUIDE.heading,
    paras,
    categoryHeading: cleanText(cfg.categoryHeading) || DEFAULT_SEO_GUIDE.categoryHeading,
    faqHeading: cleanText(cfg.faqHeading) || DEFAULT_SEO_GUIDE.faqHeading,
    categories,
    faqs: cfgFaqs.length > 0 ? cfgFaqs : DEFAULT_SEO_GUIDE.faqs.map((f) => ({ ...f })),
  };
};
