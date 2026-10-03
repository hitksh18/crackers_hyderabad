import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Award, BadgeCheck, Check, Heart, Minus, Package, PackageSearch,
  PackageX, Plus, Share2, ShieldAlert, ShieldCheck, ShoppingCart, Sparkles,
  Tag, X, ZoomIn,
} from 'lucide-react';
import { db } from '../firebase';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import ImagePlaceholder from '../components/ImagePlaceholder';
import CategoryIcon from '../components/CategoryIconPack';
import { slugForCategory, displayNameForCategory } from '../lib/categoryIcons';
import ProductWatermark from '../components/ProductWatermark';
import QuantityInput from '../components/QuantityInput';
import ProductRail from '../components/product/ProductRail';
import StickyCartBar from '../components/product/StickyCartBar';
import EmptyState from '../components/ui/EmptyState';
import { ProductDetailSkeleton } from '../components/ui/Skeleton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { modalVariants, revealVariants, staggerParent } from '../lib/motion';
import { inr } from '../lib/currency';
import { productPath, slugify } from '../lib/productLinks';
import { trackProductEvent } from '../lib/analytics';
import Seo, { SITE_URL } from '../components/Seo';
import toast from '../utils/toast';

// The existing site footer, reused verbatim — the product page ends with the
// same copyright strip every non-home route renders, never a page-specific
// replacement.
const RECENT_KEY = 'crackers_recently_viewed';

/* Extra specification fields, if a product ever stores them. Read straight
     off the document and dropped when absent, so the details block below the
     description only ever shows what the product actually carries. Anything
     already on screen — name, brand, category, quantity, prices, stock — is
     deliberately not repeated here. */
const EXTRA_SPEC_FIELDS = [
  { key: 'pieces', label: 'Pieces' },
  { key: 'packSize', label: 'Pack Size' },
  { key: 'weight', label: 'Weight' },
  { key: 'duration', label: 'Burn Duration' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'countryOfOrigin', label: 'Country of Origin' },
];

const asSpecText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

/* Store-wide lighting guidance. Deliberately generic: it is safety advice,
   not product data, so nothing here is hardcoded per product. */
const SAFETY_POINTS = [
  'Light fireworks only in open, safe spaces',
  'Keep water, sand or a fire extinguisher nearby',
  'Keep children supervised at all times',
  'Follow the safety instructions on the pack',
];

/* Optional highlight strings only. Booleans / null / undefined collapse to ''
   so an old product without these fields renders no empty boxes. */
const asText = (value) => (typeof value === 'string' ? value.trim() : '');

/* Long names step down through the .pd-title tiers so the heading stays
   prominent on a phone, where wrapping is expected. On desktop the same
   classes are overridden by a container-query rule that divides the column
   width by the character count instead (see .pd-title in index.css), which is
   what actually keeps a long catalogue name on one line. */
const titleTier = (name) => {
  const len = String(name || '').length;
  if (len > 70) return ' pd-title--xlong';
  if (len > 46) return ' pd-title--long';
  if (len > 28) return ' pd-title--mid';
  return '';
};

const ProductDetail = () => {
  const { slug: urlSlug } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  // Recently-viewed ids are maintained (and pruned when products are
  // deleted) for browsing history; this page no longer renders the rail.
  const [, setRecentlyViewed] = useState([]);
  const [brandInfo, setBrandInfo] = useState({ name: null, logo: null });
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();

  useEffect(() => {
    let cancelled = false;
    const fetchProduct = async () => {
      const toProduct = (d) => ({ id: d.id, ...d.data() });

      try {
        // Resolution order: canonical slug -> legacy doc id -> historical slug.
        let resolved = null;

        const bySlug = await getDocs(
          query(collection(db, 'products'), where('slug', '==', urlSlug))
        );
        if (!bySlug.empty) resolved = toProduct(bySlug.docs[0]);

        if (!resolved && /^[A-Za-z0-9]{20}$/.test(urlSlug)) {
          const legacySnap = await getDoc(doc(db, 'products', urlSlug));
          if (legacySnap.exists()) resolved = toProduct(legacySnap);
        }

        if (!resolved) {
          try {
            const byOldSlug = await getDocs(
              query(collection(db, 'products'), where('oldSlugs', 'array-contains', urlSlug))
            );
            if (!byOldSlug.empty) resolved = toProduct(byOldSlug.docs[0]);
          } catch (oldSlugError) {
            console.warn('Old-slug lookup unavailable:', oldSlugError.message);
          }
        }

        if (!resolved) return;

        // Redirect non-canonical URLs (legacy ids, old titles) to the current
        // title-based slug so shared links always land on the real URL.
        const canonicalSlug = resolved.slug || slugify(resolved.name) || resolved.id;
        if (canonicalSlug !== urlSlug) {
          navigate(`/product/${canonicalSlug}`, { replace: true });
        }

        const productData = resolved;
        if (cancelled) return;
        setProduct(productData);

        trackProductEvent('PRODUCT_VIEW', {
          productId: productData.id,
          category:
            (Array.isArray(productData.categories) && productData.categories[0]) ||
            productData.category ||
            null,
        });

        const productsSnap = await getDocs(collection(db, 'products'));
        const allProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        let related = [];

        const productBrand = typeof productData.brand === 'string' ? productData.brand : (productData.brand?.name || null);

        const brandsSnap = await getDocs(collection(db, 'brands'));
        const brandsMap = {};
        brandsSnap.docs.forEach(bDoc => {
          const b = { id: bDoc.id, ...bDoc.data() };
          brandsMap[b.name] = b;
        });

        const resolvedBrand = typeof productData.brand === 'string'
          ? { name: productData.brand, logo: brandsMap[productData.brand]?.logo || null }
          : { name: productData.brand?.name || null, logo: productData.brand?.logo || null };

        /* "More like this" is category-first: a shopper looking at Sparklers
           wants other Sparklers before other products from the same brand.
           Brand and then a random fill keep the rail full for thin categories. */
        const productCategories = (productData.categories || [productData.category])
          .filter(Boolean);

        if (productCategories.length > 0) {
          related = allProducts.filter(p => {
            if (p.id === productData.id) return false;
            const pCategories = (p.categories || [p.category]).filter(Boolean);
            return pCategories.some(cat => productCategories.includes(cat));
          });
        }

        if (related.length < 8 && productBrand) {
          const brandRelated = allProducts.filter(p => {
            if (p.id === productData.id) return false;
            if (related.some(r => r.id === p.id)) return false;
            const pBrand = typeof p.brand === 'string' ? p.brand : (p.brand?.name || null);
            return pBrand === productBrand;
          });
          related = [...related, ...brandRelated];
        }

        if (related.length < 8) {
          const randomProducts = allProducts
            .filter(p => p.id !== productData.id && !related.some(r => r.id === p.id))
            .sort(() => Math.random() - 0.5);
          related = [...related, ...randomProducts];
        }

        if (cancelled) return;
        setBrandInfo(resolvedBrand);
        setRelatedProducts(related.slice(0, 8));

        try {
          const raw = localStorage.getItem(RECENT_KEY);
          let recent = raw ? JSON.parse(raw) : [];
          // Revalidate against the live catalogue: a product deleted in Admin
          // no longer exists in Firestore, so drop it here (and persist the
          // cleaned list) instead of rendering a stale deleted product.
          const liveIds = new Set(allProducts.map((p) => p.id));
          recent = [productData, ...recent.filter(p => p && p.id !== productData.id && liveIds.has(p.id))].slice(0, 8);
          localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
          if (!cancelled) setRecentlyViewed(recent);
        } catch (err) {
          console.error('Failed to update recently viewed:', err);
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProduct();
    setQuantity(1);
    return () => { cancelled = true; };
  }, [urlSlug, navigate]);

  /* Escape closes the zoom lightbox. */
  useEffect(() => {
    if (!zoomOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomOpen]);

  const handleAddToCart = () => {
    addToCart(product, quantity);
  };

  const handleShare = async () => {
    const shareData = {
      title: product.name,
      text: `Check out ${product.name} at Crackers Hyderabad`,
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Product link copied to clipboard');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('Could not share this product');
      }
    }
  };

  const handleWishlist = () => {
    toggleWishlist(product);
    if (!isWishlisted(product.id)) {
      toast.success(`${product.name} added to wishlist`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="pd-shell pd-hero">
          <ProductDetailSkeleton />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <div className="shell section-pad">
          <EmptyState
            icon={PackageSearch}
            title="Product not found"
            description="This product is no longer listed, or the link is incorrect. Browse the catalogue to find what you need."
            action={
              <Link to="/products" className="btn-primary">
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Back to Products
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const displayPrice = product.discountPrice || product.onlinePrice || product.price;
  const originalPrice = product.onlinePrice || product.price;
  const hasDiscount = product.discountPrice && product.discountPrice < originalPrice;
  const brandName = brandInfo.name || (typeof product.brand === 'string' ? product.brand : (product.brand?.name || null));
  const brandLogo = brandInfo.logo || product.brand?.logo || null;
  const outOfStock = product.outOfStock === true;
  const wished = isWishlisted(product.id);
  const stockLeft = typeof product.stock === 'number' ? product.stock : null;

  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - product.discountPrice) / originalPrice) * 100)
    : 0;

  const categoryList = Array.isArray(product.categories) && product.categories.length
    ? product.categories.filter(Boolean)
    : (product.category ? [product.category] : []);
  const primaryCategory = categoryList[0] || null;

  // Real description paragraphs (blank-line separated). Legacy descriptions
  // embed "Product Highlights:" metadata lines — strip those short
  // label-led paragraphs so the structured highlights below don't duplicate
  // them; genuine prose is never touched.
  const META_PARA_RE = /^(product highlights|brand|product|quantity|effect|ideal for|free door delivery|cash on delivery|premium quality)\s*:/i;
  const rawParas = String(product.description || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const descriptionParas = rawParas.filter((p) => !(META_PARA_RE.test(p) && p.length < 160));
  const cleanParas = descriptionParas.length > 0 ? descriptionParas : rawParas;

  /* Admin-managed highlights. `highlights` is the stored key; `productHighlights`
     is accepted too so either naming keeps working. Everything is optional and
     every value is coerced to a trimmed string — a product with no Effect data
     simply drops that card instead of showing a placeholder.

     The category is the fourth card rather than a block of its own, so the
     page states it exactly once. Brand falls back to the product's brand when
     the highlight itself was left blank. */
  const hl = {
    ...(product.productHighlights && typeof product.productHighlights === 'object' ? product.productHighlights : {}),
    ...(product.highlights && typeof product.highlights === 'object' ? product.highlights : {}),
  };

  const highlightCards = [
    {
      key: 'brand',
      icon: Award,
      label: 'Brand',
      value: asText(hl.brand) || asText(brandName),
      logo: brandLogo,
    },
    { key: 'quantity', icon: Package, label: 'Quantity', value: asText(hl.quantity) },
    ...(primaryCategory
      ? [{
        key: 'category',
        icon: null,
        label: 'Category',
        value: displayNameForCategory(primaryCategory),
        category: primaryCategory,
        to: `/products?category=${encodeURIComponent(primaryCategory)}`,
      }]
      : []),
  ].filter((card) => card.value);

  /* What the highlights row deliberately left out, shown once below the
     description instead: the effect, plus any extra spec the document
     carries. Empty when the product has neither, and then the whole section
     is skipped. */
  const detailCards = [
    { key: 'effect', label: 'Effect', value: asText(hl.effect) },
    ...EXTRA_SPEC_FIELDS.map(({ key, label }) => ({
      key,
      label,
      value: asSpecText(product[key]),
    })),
  ].filter((card) => card.value);

  /* A description that already opens with the product name does not need the
     name repeated above it. Plain string work — cheap enough to skip a hook,
     and it has to live below the loading guards anyway. */
  const descriptionMentionsName = (() => {
    const needle = String(product.name || '').trim().toLowerCase();
    if (!needle) return false;
    const haystack = cleanParas.join(' ').toLowerCase();
    return haystack.includes(needle) || haystack.includes(needle.slice(0, 18));
  })();

  // Store-level assurances default on: COD and the premium note show unless
  // the admin explicitly switched them off.
  const codAvailable = hl.codAvailable !== false;
  const premiumRaw = hl.premiumQuality;
  const premiumOn = premiumRaw === undefined || premiumRaw === null ? true : premiumRaw !== false;
  const premiumText = asText(premiumRaw) || 'Premium quality fireworks';
  const showAssurance = codAvailable || premiumOn;

  const productUrl = `${SITE_URL}${productPath(product)}`;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.imageURL || undefined,
    description: product.description || undefined,
    brand: { '@type': 'Brand', name: brandInfo.name || 'Crackers Hyderabad' },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'INR',
      price: displayPrice,
      availability: outOfStock
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
    },
  };

  // Home > Category > Product structured data for search engines.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ...(primaryCategory
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: primaryCategory,
              item: `${SITE_URL}/products?category=${encodeURIComponent(primaryCategory)}`,
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: primaryCategory ? 3 : 2,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  return (
    <div className="pd-page min-h-screen">
      {product && (
        <Seo
          title={`${product.name} | Crackers Hyderabad`}
          description={(product.description || product.name).slice(0, 155)}
          canonical={productUrl}
          image={product.imageURL || undefined}
          jsonLd={[productJsonLd, breadcrumbJsonLd]}
        />
      )}

      {/* ============ HERO — image + buying column only ============ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={staggerParent(reduced, 0.07)}
        className="pd-shell pd-hero"
        aria-labelledby="product-title"
      >
        <div className="pd-hero-grid">
          {/* ---- Product image well ---- */}
          <motion.div variants={revealVariants(reduced, 16)} className="pd-media-col">
            <div className="pd-media">
              <div className="pd-media-inner">
                {product.imageURL ? (
                  <img
                    src={product.imageURL}
                    alt={product.name}
                    draggable={false}
                    className="h-full w-full object-contain transition-transform duration-700 ease-out"
                  />
                ) : (
                  <ImagePlaceholder />
                )}
              </div>

              {outOfStock && (
                <div className="pd-media-oos">
                  <span className="pd-media-oos-pill">
                    <PackageX className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                    Currently Out of Stock
                  </span>
                </div>
              )}

              <div className="pd-media-meta">
                {brandLogo ? (
                  <span className="pd-chip pd-chip--brand">
                    <img
                      src={brandLogo}
                      alt=""
                      draggable={false}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="pd-chip-text">{brandName || 'Licensed'}</span>
                  </span>
                ) : (
                  <span className="pd-chip pd-chip--brand">
                    <span className="pd-chip-text">{brandName || 'Crackers Hyderabad'}</span>
                  </span>
                )}
                <span className="pd-chip pd-chip--stamp">
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" fill="none" aria-hidden="true">
                    <path
                      d="M6 0.5 L7.1 4.9 L11.5 6 L7.1 7.1 L6 11.5 L4.9 7.1 L0.5 6 L4.9 4.9 Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="pd-chip-text">Crackers Hyderabad</span>
                </span>

                <span className="pd-media-zoom">
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  Tap to zoom
                </span>
              </div>

              {/* Full-panel zoom trigger — keyboard reachable, no block children. */}
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                aria-label={`Zoom image of ${product.name}`}
                className="pd-media-hit"
              />
            </div>
          </motion.div>

          {/* ---- Buying column: title first, then identity, then price ---- */}
          <motion.div variants={revealVariants(reduced, 16)} className="pd-info">
            <h1
              id="product-title"
              className={`pd-title product-name${titleTier(product.name)}`}
              style={{ '--pd-chars': Math.max(12, String(product.name || '').length) }}
            >
              {product.name}
            </h1>

            <div className="pd-brandrow">
              {brandLogo && (
                <img
                  src={brandLogo}
                  alt=""
                  draggable={false}
                  className="pd-brandlogo"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <span className="pd-brandname">{brandName || 'Crackers Hyderabad'}</span>
              <span className="pd-licensed">
                <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                Licensed Product
              </span>

              <span className="pd-actions">
                <button
                  type="button"
                  onClick={handleWishlist}
                  aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
                  aria-pressed={wished}
                  className="wishlist-btn pd-iconbtn"
                  style={{
                    background: wished ? 'var(--crimson-600)' : 'var(--surface-card)',
                    border: `1px solid ${wished ? 'var(--crimson-600)' : 'var(--hairline-strong)'}`,
                  }}
                >
                  <Heart
                    key={wished ? 'w' : 'u'}
                    className={`h-[18px] w-[18px] ${wished ? 'heart-pop fill-current text-white' : ''}`}
                    style={wished ? undefined : { color: 'var(--text-muted)' }}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Share this product"
                  className="wishlist-btn pd-iconbtn"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline-strong)' }}
                >
                  <Share2 className="h-[18px] w-[18px]" style={{ color: 'var(--text-muted)' }} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            </div>

            <div className="pd-price">
              <span className="pd-price-now">{inr(displayPrice)}</span>
              {hasDiscount && <span className="pd-price-was">{inr(originalPrice)}</span>}
              {hasDiscount && (
                <span className="pd-off">
                  <Tag className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />
                  <span className="tabular">{discountPercent}%</span> OFF
                </span>
              )}
            </div>

            <div className="pd-stock">
              {outOfStock ? (
                <span className="badge badge-crimson pd-pill">
                  <PackageX className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Out of Stock
                </span>
              ) : (
                <span className="badge badge-leaf pd-pill">
                  <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
                  {stockLeft !== null && stockLeft <= 10 ? `Only ${stockLeft} left` : 'In Stock'}
                </span>
              )}
            </div>

            <div className="pd-buy">
              <div className="pd-qty">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease quantity"
                  className="pd-qty-btn"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
                </button>
                <QuantityInput
                  value={quantity}
                  onChange={setQuantity}
                  ariaLabel="Quantity"
                  className="pd-qty-input tabular"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  aria-label="Increase quantity"
                  className="pd-qty-btn"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                disabled={outOfStock}
                className="btn-primary btn-shine pd-atc"
              >
                <ShoppingCart className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
                {outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>

            {/* ---- Key highlights: spec cards beside the image, below the
                    purchase controls. The category is the last card, so it is
                    stated once on the whole page. ---- */}
            {highlightCards.length > 0 && (
              <div className="pd-info-hl">
                <h2 id="product-highlights-full" className="pd-label">Product Highlights</h2>
                <dl className="pd-hl-grid">
                  {highlightCards.map((card) => (
                    <div key={card.key} className="pd-hl">
                      <span className="pd-hl-icon">
                        {card.logo ? (
                          <img
                            src={card.logo}
                            alt=""
                            className="pd-hl-logo"
                            draggable={false}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : card.category ? (
                          <CategoryIcon category={slugForCategory(card.category)} noCrop />
                        ) : (
                          <card.icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                        )}
                      </span>
                      <div className="pd-hl-body">
                        <dt className="pd-hl-label">{card.label}</dt>
                        <dd className="pd-hl-value">
                          {card.to ? (
                            <Link to={card.to} className="pd-hl-link">{card.value}</Link>
                          ) : (
                            card.value
                          )}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* ---- COD + premium quality: one reassurance strip under the
                    highlights, still inside the first screen ---- */}
            {showAssurance && (
              <div className="pd-info-trust" aria-label="Delivery and quality assurances">
                <div className="pd-trust">
                  {codAvailable && (
                    <div className="pd-trust-side">
                      <span className="pd-trust-ico pd-trust-ico--cod">
                        <Check className="h-5 w-5" strokeWidth={2.8} aria-hidden="true" />
                      </span>
                      <span className="pd-trust-body">
                        <span className="pd-trust-title">COD Available</span>
                        <span className="pd-trust-sub">Pay safely on delivery</span>
                      </span>
                    </div>
                  )}
                  {premiumOn && (
                    <div className="pd-trust-side">
                      <span className="pd-trust-ico pd-trust-ico--gold">
                        <ShieldCheck className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      <span className="pd-trust-body">
                        <span className="pd-trust-title">{premiumText}</span>
                        <span className="pd-trust-sub">Trusted and genuine products</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* ============ BELOW THE FOLD ============ */}
      <div className="pd-shell pd-after">
        {/* ---- Safety guidance: store-wide care notes, not product data ---- */}
        <section className="pd-safety" aria-labelledby="product-safety-first">
          <div className="pd-safety-card">
            <div className="pd-safety-head">
              <span className="pd-safety-ico">
                <ShieldAlert className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="product-safety-first" className="pd-safety-title">Safety First</h2>
                <p className="pd-safety-sub">A few things to keep in mind</p>
              </div>
            </div>

            <ul className="pd-safety-list">
              {SAFETY_POINTS.map((point) => (
                <li key={point} className="pd-safety-item">
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.8} aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- Description: full content width, never beside the image ---- */}
        {cleanParas.length > 0 && (
          <section className="pd-sec pd-sec--desc" aria-labelledby="product-full-description">
            <h2 id="product-full-description" className="pd-label">Description</h2>
            <div className="pd-desc-inner">
              {!descriptionMentionsName && (
                <p className="pd-desc-title">{product.name}</p>
              )}
              <div className="pd-desc-body">
                {cleanParas.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---- Product details: whatever the highlights row did not show ---- */}
        {detailCards.length > 0 && (
          <section className="pd-sec pd-sec--details" aria-labelledby="product-details">
            <h2 id="product-details" className="pd-label">Product Details</h2>
            <dl className="pd-detail-grid">
              {detailCards.map((card) => (
                <div key={card.key} className="pd-detail">
                  <dt className="pd-detail-label">{card.label}</dt>
                  <dd className="pd-detail-value">{card.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ---- Recommendations ---- */}
        {relatedProducts.length > 0 && (
          <section className="pd-sec pd-sec--similar" aria-labelledby="related-products">
            <ProductRail
              headingId="related-products"
              eyebrow="Recommended"
              title="More Like This"
              items={relatedProducts}
              reduced={reduced}
              compact
              autoScroll={false}
              className=""
            />
          </section>
        )}
      </div>

      {/* The product page ends on the site copyright strip that App renders for
          every non-home route — no duplicate footer block here. */}

      {/* ============ STICKY PURCHASE BAR (phones + tablets) ============
          Same quantity state and same handler as the inline controls, so the
          two never disagree. CSS hides it from 1024px up, where the inline
          quantity + Add to Cart in the buy column take over. */}
      <StickyCartBar
        displayPrice={displayPrice}
        outOfStock={outOfStock}
        quantity={quantity}
        setQuantity={setQuantity}
        onAddToCart={handleAddToCart}
        visible
      />

      {/* ============ ZOOM LIGHTBOX ============ */}
      <AnimatePresence>
        {zoomOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.001 : 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${product.name} — enlarged image`}
            className="fixed inset-0 z-modal flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setZoomOpen(false)}
          >
            <button
              type="button"
              onClick={() => setZoomOpen(false)}
              aria-label="Close zoom"
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </button>

            {product.imageURL ? (
              <motion.img
                variants={modalVariants(reduced)}
                initial="hidden"
                animate="visible"
                exit="exit"
                src={product.imageURL}
                alt={product.name}
                draggable={false}
                className="max-h-full max-w-full rounded-[var(--r-xl)] object-contain"
              />
            ) : (
              <div className="h-64 w-64">
                <ImagePlaceholder />
              </div>
            )}

            {product.imageURL && <ProductWatermark className="bottom-6 right-6" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProductDetail;
