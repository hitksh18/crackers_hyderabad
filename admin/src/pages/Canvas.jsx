import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import toast from '../utils/toast';
import { uploadImage } from '../utils/uploadImage';
import { isLocalOnlyUrl } from '../utils/storageUrls';
import { readHomepageConfig, saveHomepageConfig, defaultHeroBanner, defaultPromoCard, defaultSecondaryBanner, defaultProductBanner, DEFAULT_HERO_BANNERS, DEFAULT_PROMO_CARDS } from '../lib/homepage';
import { readBuilderConfig, saveSections, moveSection, duplicateSection, BANNER_SECTION_TEMPLATE } from '../lib/homepageBuilder';
import { readSiteSettings, saveSiteSettings, announcementTexts } from '../lib/siteSettings';
import { resolveTrustCards, defaultTrustCards } from '../lib/trustIcons';
import { categoryDefs } from '../components/home/homeData';
import StorefrontHero from '../components/home/StorefrontHero';
import CategoryShowcase from '../components/home/CategoryShowcase';
import FeaturedSection from '../components/home/FeaturedSection';
import HomeProductRail from '../components/home/HomeProductRail';
import DealsSection from '../components/home/DealsSection';
import PromoSection from '../components/home/PromoSection';
import SecondaryBannerGrid from '../components/home/SecondaryBannerGrid';
import ProductBannerGrid from '../components/home/ProductBannerGrid';
import TrustSection from '../components/home/TrustSection';
import NewsletterBlock from '../components/home/NewsletterBlock';
import TrackOrderBlock from '../components/home/TrackOrderBlock';
import WholesaleSection from '../components/home/WholesaleSection';
import Footer from '../components/Footer';
import { TopBannerPreview } from '../components/TopBanner';
import {
  CanvasNav,
  SectionTabs,
  WorkspaceHead,
  EditorPane,
  DeviceToggle,
  PreviewFrame,
  Field,
  Toggle,
  RowMenu,
} from '../components/admin/homepage/CanvasChrome';
import { BannerModal, DealModal, TrustModal } from '../components/admin/homepage/CanvasModals';
import '../components/admin/homepage/canvas.css';

/* ---------- section navigation (the ONLY navigation) ---------- */

const CANVAS_SECTIONS = [
  { id: 'hero', label: 'Hero' },
  { id: 'messages', label: 'Messages' },
  { id: 'stable', label: 'Stable Message' },
  { id: 'sections', label: 'Sections' },
  { id: 'categories', label: 'Categories' },
  { id: 'products', label: 'Products' },
  { id: 'promos', label: 'Banners' },
  { id: 'deals', label: 'Deals' },
  { id: 'trust', label: 'Trust' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'wholesale', label: 'Wholesale' },
  { id: 'footer', label: 'Footer' },
  { id: 'admin', label: 'Admin' },
];

/* ---------- defaults (mirror the public homepage fallbacks) ---------- */

const TEXT_DEFAULTS = {
  categories: { eyebrow: 'Explore', title: 'Shop by Categories', subtitle: 'Handpicked ranges for every celebration' },
  featured: { eyebrow: 'Handpicked', title: 'Featured Products', subtitle: 'Our best-selling fireworks handpicked for you', maxItems: 12 },
  bestSellers: { eyebrow: 'Top Rated', title: 'Best Sellers', subtitle: 'The most-loved picks from real orders', maxItems: 10 },
  deals: { eyebrow: 'Festive Offers', title: 'Festive Deals', subtitle: 'Limited-time offers for every celebration', maxItems: 0 },
  trust: { eyebrow: 'Why Us', title: 'Why Choose Crackers Hyderabad', subtitle: 'The city’s most trusted fireworks destination' },
  newsletter: { heading: 'Stay Updated with Festival Offers', description: 'Get exclusive deals, early sale access and festive surprises straight to your inbox.', buttonText: 'Subscribe' },
  wholesale: { eyebrow: 'Wholesale', title: 'Built for Wholesale Orders', description: 'Retailers, event teams and large family celebrations order differently. The catalogue, the cart and the tracking are all built to carry a bigger list without turning into a phone call.', ctaText: 'Shop Crackers', ctaUrl: '/products' },
};

const FOOTER_DEFAULTS = {
  phone: '+91 98765 43210',
  whatsapp: '',
  email: 'info@crackershyderabad.com',
  address: 'Hyderabad, Telangana',
  location: '',
};

const HERO_MAX = 5;
const SECONDARY_MAX = 10;
const MSG_MAX = 5;
const MSG_MIN_ENABLED = 2;

const heroImageOf = (b) => b?.imageDesktop || b?.image || null;

const maxOrAll = (arr, n) => (n && n > 0 ? arr.slice(0, n) : arr);

const byAdminOrder = (a, b) =>
  (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
  (b.salesCount || 0) - (a.salesCount || 0) ||
  (a.name || '').localeCompare(b.name || '');

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export default function HomepageBuilder() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [active, setActive] = useState('hero');
  const [draft, setDraft] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [products, setProducts] = useState([]);
  const [modes, setModes] = useState({});
  const [bannerModal, setBannerModal] = useState(null);
  const [dealModal, setDealModal] = useState(null);
  const [trustModal, setTrustModal] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [newsletterTest, setNewsletterTest] = useState('');
  const origCollections = useRef({ promos: [], deals: [] });
  const dragRef = useRef(null);
  const [dropTarget, setDropTarget] = useState(null);

  /* ---------------- load (existing sources only) ---------------- */

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [
          productsSnap, promoSnap, dealsSnap, catSnap, builder, site, homepage, footerSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'products')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'promotionalBanners')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'festiveDeals')).catch(() => ({ docs: [] })),
          getDoc(doc(db, 'settings', 'categoryShowcase')).catch(() => null),
          readBuilderConfig().catch(() => null),
          readSiteSettings().catch(() => null),
          readHomepageConfig().catch(() => null),
          getDoc(doc(db, 'footerSettings', 'main')).catch(() => null),
        ]);

        setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const promos = promoSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.order || 0) - (a.order || 0));
        const deals = dealsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.order || 0) - (a.order || 0));
        origCollections.current = {
          promos: JSON.parse(JSON.stringify(promos)),
          deals: JSON.parse(JSON.stringify(deals)),
        };

        const catData = catSnap && catSnap.exists() ? catSnap.data() : {};
        const footData = footerSnap && footerSnap.exists() ? footerSnap.data() : {};

        const next = {
          homepage: {
            ...(homepage || {}),
            heroBanners: [...(homepage?.heroBanners || [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .slice(0, HERO_MAX),
            promoCards: [...(homepage?.promoCards || [])],
            secondaryBanners: [...(homepage?.secondaryBanners || [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .slice(0, SECONDARY_MAX),
            productBanners: [...(homepage?.productBanners || [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
            sectionText: Object.fromEntries(
              Object.keys(TEXT_DEFAULTS).map((k) => [k, { ...TEXT_DEFAULTS[k], ...((homepage?.sectionText || {})[k] || {}) }])
            ),
            trustCards: Array.isArray(homepage?.trustCards) ? homepage.trustCards : null,
          },
          builder: builder || { sections: [] },
          site: site || {},
          showcase: { hidden: catData.hidden || [], order: catData.order || [] },
          footer: { ...FOOTER_DEFAULTS, ...footData },
          promos,
          deals,
        };
        const known = new Set(next.showcase.order);
        categoryDefs.forEach((c) => { if (!known.has(c.slug)) next.showcase.order.push(c.slug); });

        setDraft(next);
        setSavedJson(JSON.stringify(next));
        if (import.meta.env.DEV) {
          console.log('[canvas] settings/homepageConfig loaded:', {
            bannerCount: next.homepage.heroBanners.length,
            banners: next.homepage.heroBanners.map((b, i) => ({
              pos: i + 1,
              id: b.id,
              enabled: b.enabled !== false,
              image: b.imageDesktop || b.image || null,
            })),
          });
        }
      } catch (e) {
        console.error(e);
        toast.error('Failed to load canvas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const dirty = !!draft && JSON.stringify(draft) !== savedJson;
  const modeOf = (key) => modes[key] || 'desktop';
  const setMode = (key, mode) => setModes((m) => ({ ...m, [key]: mode }));

  /* ---------------- generic helpers ---------------- */

  const moveInDraft = (getList, setList, from, to) => {
    setDraft((d) => {
      const list = [...getList(d)];
      if (from < 0 || to < 0 || from >= list.length || to >= list.length) return d;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return setList(d, list);
    });
  };

  const dnd = (key, index, onMove) => ({
    draggable: true,
    onDragStart: (e) => {
      dragRef.current = { key, index };
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e) => {
      e.preventDefault();
      setDropTarget(`${key}:${index}`);
    },
    onDragLeave: () => setDropTarget((t) => (t === `${key}:${index}` ? null : t)),
    onDrop: (e) => {
      e.preventDefault();
      const from = dragRef.current;
      dragRef.current = null;
      setDropTarget(null);
      if (from && from.key === key && from.index !== index) onMove(from.index, index);
    },
    onDragEnd: () => {
      dragRef.current = null;
      setDropTarget(null);
    },
  });

  /* ---------------- save (existing backends only) ---------------- */

  const persistCollections = async () => {
    const jobs = [];
    const origP = new Map(origCollections.current.promos.map((p) => [p.id, p]));
    draft.promos.forEach((p, i) => {
      const order = draft.promos.length - i;
      if (String(p.id).startsWith('new-')) {
        const { id: _omit, ...data } = p;
        jobs.push(addDoc(collection(db, 'promotionalBanners'), { ...data, order }));
      } else {
        const o = origP.get(p.id) || {};
        if (JSON.stringify({ ...o, order: o.order }) !== JSON.stringify({ ...p, order: o.order }) || o.order !== order) {
          jobs.push(updateDoc(doc(db, 'promotionalBanners', p.id), { ...p, order }));
        }
      }
    });
    origCollections.current.promos
      .filter((o) => !draft.promos.some((p) => p.id === o.id))
      .forEach((o) => jobs.push(deleteDoc(doc(db, 'promotionalBanners', o.id))));

    const origD = new Map(origCollections.current.deals.map((x) => [x.id, x]));
    draft.deals.forEach((x, i) => {
      const order = draft.deals.length - i;
      if (String(x.id).startsWith('new-')) {
        const { id: _omit, ...data } = x;
        jobs.push(addDoc(collection(db, 'festiveDeals'), { ...data, order }));
      } else {
        const o = origD.get(x.id) || {};
        if (JSON.stringify({ ...o, order: o.order }) !== JSON.stringify({ ...x, order: o.order }) || o.order !== order) {
          jobs.push(updateDoc(doc(db, 'festiveDeals', x.id), { ...x, order }));
        }
      }
    });
    origCollections.current.deals
      .filter((o) => !draft.deals.some((x) => x.id === o.id))
      .forEach((o) => jobs.push(deleteDoc(doc(db, 'festiveDeals', o.id))));

    await Promise.all(jobs);
  };

  const handleSave = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      /* Section-independent validation: only areas that changed since the last
         save are validated, so an untouched section can never block an
         unrelated save (e.g. Hero must save while Announcement is disabled). */
      let savedSnap = null;
      try { savedSnap = savedJson ? JSON.parse(savedJson) : null; } catch { savedSnap = null; }
      const changed = (key) =>
        !savedSnap || JSON.stringify(draft?.[key] ?? null) !== JSON.stringify(savedSnap?.[key] ?? null);

      if (changed('site')) {
        const bar = draft.site?.announcementBar;
        if (bar?.enabled !== false) {
          const liveCount = (bar.messages || []).filter((m) => m.enabled !== false && String(m.text || '').trim()).length;
          if (liveCount < MSG_MIN_ENABLED) {
            throw new Error(`Announcement bar needs at least ${MSG_MIN_ENABLED} enabled messages (has ${liveCount}). Add messages or disable the bar.`);
          }
        }
      }

      if (changed('homepage')) {
        const heroOn = (draft.builder?.sections || []).some((s) => s.type === 'hero' && s.enabled !== false);
        const banners = draft.homepage.heroBanners || [];
        if (banners.length > HERO_MAX) {
          throw new Error(`Hero supports at most ${HERO_MAX} banners (has ${banners.length}). Delete extras before saving.`);
        }
        const local = banners.filter((b) => isLocalOnlyUrl(heroImageOf(b)));
        if (local.length > 0) {
          throw new Error(
            `${local.length} hero banner(s) use local-only image URLs that cannot load on the public site. Re-upload them to permanent storage before saving.`
          );
        }
        if (heroOn) {
          const valid = banners.filter((b) => b.enabled !== false && heroImageOf(b));
          if (valid.length === 0) {
            throw new Error('Hero is enabled but has no valid banner. Upload at least one banner or disable Hero.');
          }
        }

        const secondary = draft.homepage.secondaryBanners || [];
        if (secondary.length > SECONDARY_MAX) {
          throw new Error(`Secondary banners support at most ${SECONDARY_MAX} (has ${secondary.length}). Delete extras before saving.`);
        }
        const badSecondary = secondary.filter((b) => isLocalOnlyUrl(b.imageDesktop || b.image));
        if (badSecondary.length > 0) {
          throw new Error(
            `${badSecondary.length} secondary banner(s) use local-only image URLs that cannot load on the public site. Re-upload them to permanent storage before saving.`
          );
        }
        const badProduct = (draft.homepage.productBanners || []).filter(
          (b) => isLocalOnlyUrl(b.image) || !b.productId
        );
        if (badProduct.length > 0) {
          throw new Error(
            `${badProduct.length} product banner(s) are missing a permanent image or a selected product. Fix them before saving.`
          );
        }
      }

      if (changed('promos')) {
        const bad = (draft.promos || []).filter((p) => isLocalOnlyUrl(p.imageUrl));
        if (bad.length > 0) {
          throw new Error(
            `${bad.length} promotional banner(s) use local-only image URLs that cannot load on the public site. Re-upload them to permanent storage before saving.`
          );
        }
      }
      /* The public homepage reads settings/homepageConfig.heroBanners — this
         is the write that makes a banner appear on the storefront. */
      const heroSummary = (draft.homepage.heroBanners || []).map((b, i) => ({
        pos: i + 1,
        id: b.id,
        enabled: b.enabled !== false,
        image: b.imageDesktop || b.image || null,
        mobile: b.imageMobile || null,
      }));
      if (import.meta.env.DEV) {
        console.log('[canvas] saving settings/homepageConfig:', {
          bannerCount: heroSummary.length,
          banners: heroSummary,
          secondaryCount: (draft.homepage.secondaryBanners || []).length,
          productBannerCount: (draft.homepage.productBanners || []).length,
        });
      }
      /* Each write is labeled so a failure names the exact part instead of a
         generic error. "Saved" is only set after every write resolves. */
      const labeled = (label, job) => job.catch((e) => {
        throw new Error(`${label}: ${e?.message || 'write failed'}`);
      });
      await Promise.all([
        labeled(
          'homepage configuration (settings/homepageConfig)',
          saveHomepageConfig(draft.homepage, { status: draft.homepage.status || 'published', userEmail: user?.email })
        ),
        labeled('section order (settings/homepageBuilder)', saveSections(draft.builder.sections, user?.email)),
        labeled('site settings (settings/siteSettings)', saveSiteSettings(draft.site, { userEmail: user?.email })),
        labeled(
          'category showcase (settings/categoryShowcase)',
          setDoc(doc(db, 'settings', 'categoryShowcase'), {
            hidden: draft.showcase.hidden,
            order: draft.showcase.order,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.email || 'admin',
          })
        ),
        labeled(
          'footer settings (footerSettings/main)',
          setDoc(doc(db, 'footerSettings', 'main'), {
            ...draft.footer,
            updatedAt: new Date().toISOString(),
          }, { merge: true })
        ),
        labeled('promotional banners / festive deals', persistCollections()),
      ]);
      if (import.meta.env.DEV) {
        console.log('[canvas] save succeeded: settings/homepageConfig now holds', heroSummary.length, 'hero banner(s).');
      }
      /* Verify: re-read the stored document and confirm the hero banners we
         just wrote are what Firestore actually holds. This closes the loop
         between "Saved" and "the homepage will show it". */
      try {
        const check = await getDoc(doc(db, 'settings', 'homepageConfig'));
        const stored = ((check.data() || {}).heroBanners || []).map((b) => b?.imageDesktop || b?.image || null);
        const written = (draft.homepage.heroBanners || []).map((b) => b?.imageDesktop || b?.image || null);
        const match = stored.length === written.length && stored.every((u, i) => u === written[i]);
        if (import.meta.env.DEV) {
          console.log('[canvas] verify settings/homepageConfig:', { match, stored, written });
        }
        if (!match) {
          throw new Error(
            'Verification read differs from what was saved — the stored document does not match this Canvas. Reload the Canvas before editing further.'
          );
        }
      } catch (e) {
        /* A failed verification read must not masquerade as a failed save when
           every write already succeeded — but it must not claim success either. */
        if (e?.message?.startsWith('Verification read differs')) throw e;
        console.warn('[canvas] verification read failed (writes already succeeded):', e);
      }
      const freshPromos = draft.promos.map((p, i) => ({ ...p, order: draft.promos.length - i }));
      const freshDeals = draft.deals.map((x, i) => ({ ...x, order: draft.deals.length - i }));
      origCollections.current = {
        promos: JSON.parse(JSON.stringify(freshPromos)),
        deals: JSON.parse(JSON.stringify(freshDeals)),
      };
      const saved = { ...draft, promos: freshPromos, deals: freshDeals };
      setDraft(saved);
      setSavedJson(JSON.stringify(saved));
      toast.success('Saved Successfully');
    } catch (e) {
      console.error('[canvas] save failed:', e);
      const msg = e?.message || '';
      const isValidation = /^(Announcement bar|Hero|Secondary|\d+ (hero|promotional|secondary|product)|Verification)/.test(msg);
      const message = isValidation ? msg : `Save Failed — changes have not been persisted. ${msg}`.trim();
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- derived data ---------------- */

  const orderedSections = useMemo(
    () => [...(draft?.builder?.sections || [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [draft]
  );
  const sectionEnabled = (type) => orderedSections.some((s) => s.type === type && s.enabled !== false);
  const setBuilderEnabled = (type, v) => {
    const target = orderedSections.find((s) => s.type === type);
    if (target) {
      setDraft((d) => ({
        ...d,
        builder: { ...d.builder, sections: d.builder.sections.map((s) => (s.id === target.id ? { ...s, enabled: v } : s)) },
      }));
    }
  };

  const heroBanners = draft?.homepage?.heroBanners || [];
  const promoCards = (draft?.homepage?.promoCards || []).slice(0, 2);
  const texts = draft?.homepage?.sectionText || TEXT_DEFAULTS;

  const featuredBase = useMemo(() => {
    const feat = products.filter((p) => p.isFeatured);
    const rest = products.filter((p) => !p.isFeatured).sort(byAdminOrder);
    return [...feat, ...rest];
  }, [products]);
  const bestBase = useMemo(
    () => [...products].sort(
      (a, b) => (b.salesCount || 0) - (a.salesCount || 0) || (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
    ),
    [products]
  );

  const countInCategory = (matchNames) => products.filter((p) => {
    if (Array.isArray(p.categories)) {
      return p.categories.some((cat) => matchNames.some((m) => m.toLowerCase() === String(cat).toLowerCase()));
    }
    return matchNames.some((m) => m.toLowerCase() === String(p.category || '').toLowerCase());
  }).length;

  const orderedCats = useMemo(() => {
    if (!draft) return [];
    const rank = new Map((draft.showcase.order || []).map((slug, i) => [slug, i]));
    return [...categoryDefs].sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999));
  }, [draft]);
  const visibleCats = orderedCats.filter((c) => !(draft?.showcase?.hidden || []).includes(c.slug));

  const enabledDeals = useMemo(
    () => [...(draft?.deals || [])].filter((d) => d.enabled !== false)
      .sort((a, b) => (b.order || 0) - (a.order || 0)),
    [draft]
  );
  const trustPreview = useMemo(() => {
    const resolved = resolveTrustCards(draft?.homepage?.trustCards);
    if (resolved) return { heading: texts.trust, cards: resolved.filter((c) => c.enabled !== false) };
    return { heading: texts.trust, cards: undefined };
  }, [draft, texts]);

  const announcementDraft = draft?.site?.announcementBar || { enabled: true, speed: 30, messages: [] };
  const announcementPreviewTexts = announcementTexts(announcementDraft).slice(0, MSG_MAX);

  if (loading || !draft) {
    return (
      <div className="cv">
        <div className="cv-container" style={{ paddingTop: 24 }}>
          <div className="cv-skeleton" style={{ height: 60, marginBottom: 14 }} />
          <div className="cv-skeleton" style={{ height: 420 }} />
        </div>
      </div>
    );
  }

  const patchHomepage = (patch) => setDraft((d) => ({ ...d, homepage: { ...d.homepage, ...patch } }));
  const patchText = (key, patch) => setDraft((d) => ({
    ...d,
    homepage: { ...d.homepage, sectionText: { ...d.homepage.sectionText, [key]: { ...d.homepage.sectionText[key], ...patch } } },
  }));
  const patchSite = (patch) => setDraft((d) => ({ ...d, site: { ...d.site, ...patch } }));
  const patchBar = (patch) => setDraft((d) => ({ ...d, site: { ...d.site, announcementBar: { ...d.site.announcementBar, ...patch } } }));
  const patchStable = (patch) => setDraft((d) => ({ ...d, site: { ...d.site, stableMessage: { ...d.site.stableMessage, ...patch } } }));
  const moveBuilderSection = (id, dir) => setDraft((d) => ({
    ...d, builder: { ...d.builder, sections: moveSection(d.builder.sections, id, dir) },
  }));

  /* ================= section workspaces ================= */

  const heroFull = heroBanners.length >= HERO_MAX;

  const editors = {
    hero: (
      <>
        <WorkspaceHead title="Hero Section" desc="Manage the main homepage hero banners." enabled={sectionEnabled('hero')} />
        <Field>
          <Toggle checked={sectionEnabled('hero')} onChange={(v) => setBuilderEnabled('hero', v)} label="Enabled" />
        </Field>
        <Field label="Auto rotate (seconds)" hint="3 – 12 seconds.">
          <input
            type="number" min={3} max={12} className="cv-input"
            value={draft.homepage.carouselDurationSec || 5}
            onChange={(e) => patchHomepage({ carouselDurationSec: Math.max(3, Math.min(12, Number(e.target.value) || 5)) })}
          />
        </Field>
        <p className="cv-label" style={{ marginTop: 12 }}>Banners · {heroBanners.length} / {HERO_MAX}</p>
        <div className="cv-rows">
          {heroBanners.map((b, i) => (
            <div
              key={b.id || i}
              className={`cv-row${b.enabled === false ? ' is-disabled' : ''}${dropTarget === `hero:${i}` ? ' is-over' : ''}`}
              {...dnd('hero', i, (from, to) => moveInDraft(
                (d) => d.homepage.heroBanners,
                (d, list) => ({ ...d, homepage: { ...d.homepage, heroBanners: list.map((x, n) => ({ ...x, order: n })) } }),
                from, to
              ))}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              {(b.imageDesktop || b.image) && <img src={b.imageDesktop || b.image} alt="" className="cv-row-thumb" />}
              <div className="cv-row-main">
                <p className="cv-row-title">Banner {i + 1} · {b.alt || b.heading || 'Untitled'}</p>
                <p className="cv-row-sub">{b.enabled === false ? 'Disabled' : 'Active'}{b.imageMobile ? ' · has mobile image' : ''}</p>
                {isLocalOnlyUrl(heroImageOf(b)) && (
                  <p className="cv-row-sub" style={{ color: 'var(--delta-down)', fontWeight: 700 }}>
                    Local-only image — will NOT load on the public site
                  </p>
                )}
              </div>
              <div className="cv-row-actions">
                <button type="button" className="cv-icon-btn" aria-label={`Edit Banner ${i + 1}`} onClick={() => setBannerModal({ mode: 'hero', title: `Edit Banner ${i + 1}`, initial: b, index: i })}>
                  <Pencil aria-hidden="true" />
                </button>
                <RowMenu
                  onMoveUp={() => moveInDraft((d) => d.homepage.heroBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, heroBanners: list } }), i, i - 1)}
                  onMoveDown={() => moveInDraft((d) => d.homepage.heroBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, heroBanners: list } }), i, i + 1)}
                  onDelete={() => { if (confirm(`Delete Banner ${i + 1}?`)) setDraft((d) => ({ ...d, homepage: { ...d.homepage, heroBanners: d.homepage.heroBanners.filter((_, n) => n !== i) } })); }}
                  onDuplicate={() => {
                    if (heroFull) { toast.error(`Maximum ${HERO_MAX} hero banners.`); return; }
                    setDraft((d) => {
                      const list = [...d.homepage.heroBanners];
                      list.splice(i + 1, 0, { ...list[i], id: uid('hb') });
                      return { ...d, homepage: { ...d.homepage, heroBanners: list.slice(0, HERO_MAX).map((x, n) => ({ ...x, order: n })) } };
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button" className="cv-add-btn" disabled={heroFull}
          style={heroFull ? { opacity: 0.5, cursor: 'default' } : undefined}
          onClick={() => setBannerModal({ mode: 'hero', title: 'Upload Banner', initial: null, index: -1 })}
        >
          <Plus aria-hidden="true" /> {heroFull ? `Maximum ${HERO_MAX} / ${HERO_MAX} banners` : 'Upload Banner'}
        </button>
        {heroBanners.some((b) => isLocalOnlyUrl(heroImageOf(b))) && (
          <p className="cv-error" style={{ marginTop: 8 }}>
            One or more banners use a local-only image URL (API disk fallback — Firebase Storage
            unreachable). They preview here but will NOT load on the public homepage. Re-upload
            after fixing Storage, or replace with a public image URL.
          </p>
        )}

        <p className="cv-label" style={{ marginTop: 14 }}>Side promo cards (2 slots)</p>
        <div className="cv-rows">
          {[0, 1].map((slot) => {
            const card = promoCards[slot];
            return (
              <div key={slot} className={`cv-row${card?.enabled === false ? ' is-disabled' : ''}`}>
                {(card?.imageDesktop || card?.image) && <img src={card.imageDesktop || card.image} alt="" className="cv-row-thumb" />}
                <div className="cv-row-main">
                  <p className="cv-row-title">{card?.alt || card?.heading || `Promo card ${slot + 1}`}</p>
                  <p className="cv-row-sub">{card ? (card.enabled === false ? 'Disabled' : 'Active') : 'Empty slot'}</p>
                </div>
                <div className="cv-row-actions">
                  <button type="button" className="cv-icon-btn" aria-label={`Edit promo card ${slot + 1}`} onClick={() => setBannerModal({ mode: 'card', title: `Promo card ${slot + 1}`, initial: card || null, index: slot })}>
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    ),

    messages: (
      <>
        <WorkspaceHead title="Scrolling Message" desc="Scrolling messages above the navbar." enabled={announcementDraft.enabled !== false} />
        <Field>
          <Toggle checked={announcementDraft.enabled !== false} onChange={(v) => patchBar({ enabled: v })} label="Enabled" />
        </Field>
        <p className="cv-label">Messages · {(announcementDraft.messages || []).length} / {MSG_MAX}</p>
        <div className="cv-rows">
          {(announcementDraft.messages || []).map((m, i) => (
            <div
              key={m.id || i}
              className={`cv-row${m.enabled === false ? ' is-disabled' : ''}${dropTarget === `msg:${i}` ? ' is-over' : ''}`}
              {...dnd('msg', i, (from, to) => {
                const list = [...(announcementDraft.messages || [])];
                const [item] = list.splice(from, 1);
                list.splice(to, 0, item);
                patchBar({ messages: list });
              })}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              <input
                className="cv-input" style={{ minHeight: 32 }} value={m.text}
                onChange={(e) => {
                  const list = [...(announcementDraft.messages || [])];
                  list[i] = { ...list[i], text: e.target.value };
                  patchBar({ messages: list });
                }}
                aria-label={`Message ${i + 1}`}
              />
              <div className="cv-row-actions">
                <span className="cv-switch" title="Enable message">
                  <input
                    type="checkbox" checked={m.enabled !== false} aria-label={`Enable message ${i + 1}`}
                    onChange={(e) => {
                      const list = [...(announcementDraft.messages || [])];
                      list[i] = { ...list[i], enabled: e.target.checked };
                      patchBar({ messages: list });
                    }}
                  />
                  <i aria-hidden="true" />
                </span>
                <button type="button" className="cv-icon-btn is-danger" aria-label="Delete message" onClick={() => patchBar({ messages: (announcementDraft.messages || []).filter((_, n) => n !== i) })}>
                  <Trash2 aria-hidden="true" />
                </button>
                <RowMenu
                  onMoveUp={() => {
                    const list = [...(announcementDraft.messages || [])];
                    if (i === 0) return;
                    [list[i - 1], list[i]] = [list[i], list[i - 1]];
                    patchBar({ messages: list });
                  }}
                  onMoveDown={() => {
                    const list = [...(announcementDraft.messages || [])];
                    if (i >= list.length - 1) return;
                    [list[i + 1], list[i]] = [list[i], list[i + 1]];
                    patchBar({ messages: list });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {(announcementDraft.messages || []).length < MSG_MAX && (
          <button type="button" className="cv-add-btn" onClick={() => patchBar({ messages: [...(announcementDraft.messages || []), { id: uid('msg'), text: 'New message', enabled: true }] })}>
            <Plus aria-hidden="true" /> Add Message
          </button>
        )}
        <div style={{ height: 12 }} />
        <Field label={`Scrolling speed (${announcementDraft.speed || 30}s per loop)`} hint={`Minimum ${MSG_MIN_ENABLED} enabled messages when the bar is on.`}>
          <input
            type="range" min={10} max={60} className="w-full"
            value={announcementDraft.speed || 30}
            onChange={(e) => patchBar({ speed: Number(e.target.value) })}
          />
        </Field>
      </>
    ),

    stable: (
      <>
        <WorkspaceHead title="Stable Message" desc="Static message below the hero." enabled={draft.site?.stableMessage?.enabled !== false} />
        <Field>
          <Toggle checked={draft.site?.stableMessage?.enabled !== false} onChange={(v) => patchStable({ enabled: v })} label="Enabled" />
        </Field>
        <Field label="Stable Message">
          <textarea
            className="cv-textarea" rows={3} value={draft.site?.stableMessage?.text || ''}
            onChange={(e) => patchStable({ text: e.target.value })}
          />
        </Field>
      </>
    ),

    sections: (
      <>
        <WorkspaceHead title="Homepage Sections" desc="Reorder sections and toggle visibility." />
        <div className="cv-rows">
          {orderedSections.map((s, i) => (
            <div
              key={s.id}
              className={`cv-row${s.enabled === false ? ' is-disabled' : ''}${dropTarget === `sec:${i}` ? ' is-over' : ''}`}
              {...dnd('sec', i, (from, to) => {
                const list = [...orderedSections];
                const [item] = list.splice(from, 1);
                list.splice(to, 0, item);
                setDraft((d) => ({ ...d, builder: { ...d.builder, sections: list.map((x, n) => ({ ...x, order: n })) } }));
              })}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              <div className="cv-row-main">
                <p className="cv-row-title">{s.label}</p>
                <p className="cv-row-sub">{s.type} · {s.enabled === false ? 'Disabled' : 'Active'}</p>
              </div>
              <div className="cv-row-actions">
                <span className="cv-switch" title="Enable section">
                  <input
                    type="checkbox" checked={s.enabled !== false} aria-label={`Enable ${s.label}`}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      builder: { ...d.builder, sections: d.builder.sections.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) },
                    }))}
                  />
                  <i aria-hidden="true" />
                </span>
                <RowMenu
                  onMoveUp={() => moveBuilderSection(s.id, -1)}
                  onMoveDown={() => moveBuilderSection(s.id, 1)}
                  onDuplicate={() => setDraft((d) => ({ ...d, builder: { ...d.builder, sections: duplicateSection(d.builder.sections, s.id) } }))}
                  onDelete={() => { if (confirm(`Delete "${s.label}"?`)) setDraft((d) => ({ ...d, builder: { ...d.builder, sections: d.builder.sections.filter((x) => x.id !== s.id) } })); }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="cv-btn-sm" onClick={() => setDraft((d) => ({ ...d, builder: { ...d.builder, sections: [...d.builder.sections, BANNER_SECTION_TEMPLATE(d.builder.sections.length)] } }))}>
            <Plus aria-hidden="true" /> Banner section
          </button>
          <Link to="/categories" className="cv-btn-sm">Manage Categories →</Link>
        </div>
      </>
    ),

    categories: (
      <>
        <WorkspaceHead title="Category Manager" desc="Reorder categories and toggle visibility." enabled={sectionEnabled('categories')} />
        <Field>
          <Toggle checked={sectionEnabled('categories')} onChange={(v) => setBuilderEnabled('categories', v)} label="Enabled" />
        </Field>
        <div className="cv-row2" style={{ marginBottom: 10 }}>
          <Field label="Eyebrow">
            <input className="cv-input" value={texts.categories.eyebrow} onChange={(e) => patchText('categories', { eyebrow: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className="cv-input" value={texts.categories.title} onChange={(e) => patchText('categories', { title: e.target.value })} />
          </Field>
        </div>
        <Field label="Subtitle">
          <input className="cv-input" value={texts.categories.subtitle} onChange={(e) => patchText('categories', { subtitle: e.target.value })} />
        </Field>
        <div className="cv-rows">
          {orderedCats.map((cat, i) => {
            const hidden = (draft.showcase.hidden || []).includes(cat.slug);
            return (
              <div
                key={cat.slug}
                className={`cv-row${hidden ? ' is-disabled' : ''}${dropTarget === `cat:${i}` ? ' is-over' : ''}`}
                {...dnd('cat', i, (from, to) => {
                  const list = [...orderedCats];
                  const [item] = list.splice(from, 1);
                  list.splice(to, 0, item);
                  setDraft((d) => ({ ...d, showcase: { ...d.showcase, order: list.map((c) => c.slug) } }));
                })}
              >
                <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
                <div className="cv-row-main">
                  <p className="cv-row-title">{cat.name}</p>
                  <p className="cv-row-sub">{hidden ? 'Hidden' : `${countInCategory(cat.match)} items`}</p>
                </div>
                <div className="cv-row-actions">
                  <span className="cv-switch" title={hidden ? 'Show category' : 'Hide category'}>
                    <input
                      type="checkbox" checked={!hidden} aria-label={`Show ${cat.name}`}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        showcase: {
                          ...d.showcase,
                          hidden: e.target.checked
                            ? (d.showcase.hidden || []).filter((s) => s !== cat.slug)
                            : [...(d.showcase.hidden || []), cat.slug],
                        },
                      }))}
                    />
                    <i aria-hidden="true" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link to="/categories" className="cv-btn-sm">Manage Categories →</Link>
        </div>
        <p className="cv-note" style={{ marginTop: 8 }}>Categories come from the shared catalogue — hiding here only hides them on the homepage.</p>
      </>
    ),

    products: (
      <>
        <WorkspaceHead title="Products" desc="Featured rail and best-sellers rail." />
        <ProductSectionEditor
          texts={texts.featured} onText={(p) => patchText('featured', p)}
          enabled={sectionEnabled('featured')} onEnabled={(v) => setBuilderEnabled('featured', v)}
          showOrdering="Featured flag first, then admin order" paneTitle="Featured products"
        />
        <div style={{ height: 18 }} />
        <ProductSectionEditor
          texts={texts.bestSellers} onText={(p) => patchText('bestSellers', p)}
          enabled={sectionEnabled('bestSellers')} onEnabled={(v) => setBuilderEnabled('bestSellers', v)}
          showOrdering="Highest sales first" paneTitle="Best sellers"
        />
        <div style={{ height: 18 }} />
        <WorkspaceHead title="Product Banners" desc="16:9 banners bound to catalogue products — clicking opens the product page." enabled={sectionEnabled('productBanners')} />
        <Field>
          <Toggle checked={sectionEnabled('productBanners')} onChange={(v) => setBuilderEnabled('productBanners', v)} label="Enabled" />
        </Field>
        <div className="cv-rows">
          {(draft.homepage.productBanners || []).map((b, i) => {
            const target = (products || []).find((p) => p.id === b.productId);
            return (
              <div
                key={b.id || i}
                className={`cv-row${b.enabled === false ? ' is-disabled' : ''}${dropTarget === `pb:${i}` ? ' is-over' : ''}`}
                {...dnd('pb', i, (from, to) => moveInDraft(
                  (d) => d.homepage.productBanners,
                  (d, list) => ({ ...d, homepage: { ...d.homepage, productBanners: list.map((x, n) => ({ ...x, order: n })) } }),
                  from, to
                ))}
              >
                <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
                {b.image && <img src={b.image} alt="" className="cv-row-thumb" />}
                <div className="cv-row-main">
                  <p className="cv-row-title">{b.productName || 'No product selected'}</p>
                  <p className="cv-row-sub">
                    {b.enabled === false ? 'Disabled · ' : ''}/product/{b.productSlug || b.productId || '…'}
                    {target ? '' : ' · product missing from catalogue'}
                  </p>
                  {isLocalOnlyUrl(b.image) && (
                    <p className="cv-row-sub" style={{ color: 'var(--delta-down)', fontWeight: 700 }}>
                      Local-only image — will NOT load on the public site
                    </p>
                  )}
                </div>
                <div className="cv-row-actions">
                  <button type="button" className="cv-icon-btn" aria-label="Edit product banner" onClick={() => setBannerModal({ mode: 'product', title: `Edit ${b.productName || 'product banner'}`, initial: b, index: i })}>
                    <Pencil aria-hidden="true" />
                  </button>
                  <RowMenu
                    onMoveUp={() => moveInDraft((d) => d.homepage.productBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, productBanners: list } }), i, i - 1)}
                    onMoveDown={() => moveInDraft((d) => d.homepage.productBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, productBanners: list } }), i, i + 1)}
                    onDelete={() => { if (confirm('Delete this product banner?')) setDraft((d) => ({ ...d, homepage: { ...d.homepage, productBanners: d.homepage.productBanners.filter((_, n) => n !== i) } })); }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="cv-add-btn" onClick={() => setBannerModal({ mode: 'product', title: 'Add Product Banner', initial: null, index: -1 })}>
          <Plus aria-hidden="true" /> Add Product Banner
        </button>
      </>
    ),

    promos: (
      <>
        <WorkspaceHead title="Secondary Banners" desc="Independent strip below the hero (1–10, 16:9)." enabled={sectionEnabled('secondaryBanners')} />
        <Field>
          <Toggle checked={sectionEnabled('secondaryBanners')} onChange={(v) => setBuilderEnabled('secondaryBanners', v)} label="Enabled" />
        </Field>
        <p className="cv-label">Banners · {(draft.homepage.secondaryBanners || []).length} / {SECONDARY_MAX}</p>
        <div className="cv-rows">
          {(draft.homepage.secondaryBanners || []).map((b, i) => (
            <div
              key={b.id || i}
              className={`cv-row${b.enabled === false ? ' is-disabled' : ''}${dropTarget === `sec2:${i}` ? ' is-over' : ''}`}
              {...dnd('sec2', i, (from, to) => moveInDraft(
                (d) => d.homepage.secondaryBanners,
                (d, list) => ({ ...d, homepage: { ...d.homepage, secondaryBanners: list.map((x, n) => ({ ...x, order: n })) } }),
                from, to
              ))}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              {(b.imageDesktop || b.image) && <img src={b.imageDesktop || b.image} alt="" className="cv-row-thumb" />}
              <div className="cv-row-main">
                <p className="cv-row-title">{b.alt || `Banner ${i + 1}`}</p>
                <p className="cv-row-sub">{b.enabled === false ? 'Disabled' : 'Active'}{b.imageMobile ? ' · has mobile image' : ''}</p>
                {isLocalOnlyUrl(b.imageDesktop || b.image) && (
                  <p className="cv-row-sub" style={{ color: 'var(--delta-down)', fontWeight: 700 }}>
                    Local-only image — will NOT load on the public site
                  </p>
                )}
              </div>
              <div className="cv-row-actions">
                <button type="button" className="cv-icon-btn" aria-label="Edit secondary banner" onClick={() => setBannerModal({ mode: 'secondary', title: `Edit Banner ${i + 1}`, initial: b, index: i })}>
                  <Pencil aria-hidden="true" />
                </button>
                <RowMenu
                  onMoveUp={() => moveInDraft((d) => d.homepage.secondaryBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, secondaryBanners: list } }), i, i - 1)}
                  onMoveDown={() => moveInDraft((d) => d.homepage.secondaryBanners, (d, list) => ({ ...d, homepage: { ...d.homepage, secondaryBanners: list } }), i, i + 1)}
                  onDelete={() => { if (confirm(`Delete secondary Banner ${i + 1}?`)) setDraft((d) => ({ ...d, homepage: { ...d.homepage, secondaryBanners: d.homepage.secondaryBanners.filter((_, n) => n !== i) } })); }}
                />
              </div>
            </div>
          ))}
        </div>
        {(draft.homepage.secondaryBanners || []).length < SECONDARY_MAX ? (
          <button type="button" className="cv-add-btn" onClick={() => setBannerModal({ mode: 'secondary', title: 'Add Secondary Banner', initial: null, index: -1 })}>
            <Plus aria-hidden="true" /> Add Banner
          </button>
        ) : (
          <p className="cv-note" style={{ marginTop: 6 }}>Maximum {SECONDARY_MAX} / {SECONDARY_MAX} secondary banners.</p>
        )}

        <div style={{ height: 18 }} />
        <WorkspaceHead title="Promotional Banners" desc="Image rail above the offer cards." enabled={sectionEnabled('promoBanners')} />
        <Field>
          <Toggle checked={sectionEnabled('promoBanners')} onChange={(v) => setBuilderEnabled('promoBanners', v)} label="Enabled" />
        </Field>
        <div className="cv-rows">
          {(draft.promos || []).map((b, i) => (
            <div
              key={b.id}
              className={`cv-row${b.enabled === false ? ' is-disabled' : ''}${dropTarget === `promo:${i}` ? ' is-over' : ''}`}
              {...dnd('promo', i, (from, to) => moveInDraft((d) => d.promos, (d, list) => ({ ...d, promos: list }), from, to))}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              {b.imageUrl && <img src={b.imageUrl} alt="" className="cv-row-thumb" />}
              <div className="cv-row-main">
                <p className="cv-row-title">Banner {draft.promos.length - i}</p>
                <p className="cv-row-sub">{b.enabled === false ? 'Disabled' : 'Active'}{b.link ? ` · ${b.link}` : ''}</p>
                {isLocalOnlyUrl(b.imageUrl) && (
                  <p className="cv-row-sub" style={{ color: 'var(--delta-down)', fontWeight: 700 }}>
                    Local-only image — will NOT load on the public site
                  </p>
                )}
              </div>
              <div className="cv-row-actions">
                <button type="button" className="cv-icon-btn" aria-label="Edit promotional banner" onClick={() => setBannerModal({ mode: 'promo', title: 'Edit Promotional Banner', initial: b, index: i })}>
                  <Pencil aria-hidden="true" />
                </button>
                <RowMenu
                  onMoveUp={() => moveInDraft((d) => d.promos, (d, list) => ({ ...d, promos: list }), i, i - 1)}
                  onMoveDown={() => moveInDraft((d) => d.promos, (d, list) => ({ ...d, promos: list }), i, i + 1)}
                  onDelete={() => { if (confirm('Delete this banner?')) setDraft((d) => ({ ...d, promos: d.promos.filter((_, n) => n !== i) })); }}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="cv-add-btn" onClick={() => setBannerModal({ mode: 'promo', title: 'Add Promotional Banner', initial: null, index: -1 })}>
          <Plus aria-hidden="true" /> Add Banner
        </button>
      </>
    ),

    deals: (
      <>
        <WorkspaceHead title="Festive Deals" desc="Deal cards from your deals collection." enabled={sectionEnabled('festiveDeals')} />
        <Field>
          <Toggle checked={sectionEnabled('festiveDeals')} onChange={(v) => setBuilderEnabled('festiveDeals', v)} label="Enabled" />
        </Field>
        <div className="cv-row2">
          <Field label="Eyebrow">
            <input className="cv-input" value={texts.deals.eyebrow} onChange={(e) => patchText('deals', { eyebrow: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className="cv-input" value={texts.deals.title} onChange={(e) => patchText('deals', { title: e.target.value })} />
          </Field>
        </div>
        <Field label="Subtitle">
          <input className="cv-input" value={texts.deals.subtitle} onChange={(e) => patchText('deals', { subtitle: e.target.value })} />
        </Field>
        <Field label="Number of products" hint="0 shows all enabled deals.">
          <input
            type="number" min={0} max={24} className="cv-input"
            value={texts.deals.maxItems || 0}
            onChange={(e) => patchText('deals', { maxItems: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <p className="cv-label" style={{ marginTop: 12 }}>Deals</p>
        <div className="cv-rows">
          {(draft.deals || []).map((d, i) => (
            <div
              key={d.id}
              className={`cv-row${d.enabled === false ? ' is-disabled' : ''}${dropTarget === `deal:${i}` ? ' is-over' : ''}`}
              {...dnd('deal', i, (from, to) => moveInDraft((d2) => d2.deals, (d2, list) => ({ ...d2, deals: list }), from, to))}
            >
              <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
              <div className="cv-row-main">
                <p className="cv-row-title">{d.title || `Deal ${i + 1}`}</p>
                <p className="cv-row-sub">{d.enabled === false ? 'Disabled' : (d.offerText || 'Festive Offer')}</p>
              </div>
              <div className="cv-row-actions">
                <button type="button" className="cv-icon-btn" aria-label="Edit deal" onClick={() => setDealModal({ title: `Edit ${d.title || 'deal'}`, initial: d, index: i })}>
                  <Pencil aria-hidden="true" />
                </button>
                <RowMenu
                  onMoveUp={() => moveInDraft((d2) => d2.deals, (d2, list) => ({ ...d2, deals: list }), i, i - 1)}
                  onMoveDown={() => moveInDraft((d2) => d2.deals, (d2, list) => ({ ...d2, deals: list }), i, i + 1)}
                  onDelete={() => { if (confirm('Delete this deal?')) setDraft((d2) => ({ ...d2, deals: d2.deals.filter((_, n) => n !== i) })); }}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="cv-add-btn" onClick={() => setDealModal({ title: 'Add Deal', initial: null, index: -1 })}>
          <Plus aria-hidden="true" /> Add Deal
        </button>
      </>
    ),

    trust: (
      <>
        <WorkspaceHead title="Why Choose Us" desc="Trust cards below the deals." enabled={sectionEnabled('trust')} />
        <Field>
          <Toggle checked={sectionEnabled('trust')} onChange={(v) => setBuilderEnabled('trust', v)} label="Enabled" />
        </Field>
        <div className="cv-row2">
          <Field label="Eyebrow">
            <input className="cv-input" value={texts.trust.eyebrow} onChange={(e) => patchText('trust', { eyebrow: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className="cv-input" value={texts.trust.title} onChange={(e) => patchText('trust', { title: e.target.value })} />
          </Field>
        </div>
        <Field label="Subtitle">
          <input className="cv-input" value={texts.trust.subtitle} onChange={(e) => patchText('trust', { subtitle: e.target.value })} />
        </Field>
        <TrustCardEditor
          cards={draft.homepage.trustCards}
          onChange={(trustCards) => patchHomepage({ trustCards })}
          dnd={dnd} dropTarget={dropTarget}
          openModal={(payload) => setTrustModal(payload)}
        />
      </>
    ),

    newsletter: (
      <>
        <WorkspaceHead title="Newsletter" desc="Sign-up band beside order tracking." enabled={sectionEnabled('newsletter')} />
        <Field>
          <Toggle checked={sectionEnabled('newsletter')} onChange={(v) => setBuilderEnabled('newsletter', v)} label="Enabled" />
        </Field>
        <Field label="Heading">
          <input className="cv-input" value={texts.newsletter.heading} onChange={(e) => patchText('newsletter', { heading: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className="cv-textarea" rows={2} value={texts.newsletter.description} onChange={(e) => patchText('newsletter', { description: e.target.value })} />
        </Field>
        <Field label="Button text">
          <input className="cv-input" value={texts.newsletter.buttonText} onChange={(e) => patchText('newsletter', { buttonText: e.target.value })} />
        </Field>
        <p className="cv-note">Sign-ups are handled by the live site — the preview form does not subscribe.</p>
      </>
    ),

    wholesale: (
      <>
        <WorkspaceHead title="Wholesale" desc="Bulk-order positioning band." enabled={sectionEnabled('wholesale')} />
        <Field>
          <Toggle checked={sectionEnabled('wholesale')} onChange={(v) => setBuilderEnabled('wholesale', v)} label="Enabled" />
        </Field>
        <div className="cv-row2">
          <Field label="Eyebrow">
            <input className="cv-input" value={texts.wholesale.eyebrow} onChange={(e) => patchText('wholesale', { eyebrow: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className="cv-input" value={texts.wholesale.title} onChange={(e) => patchText('wholesale', { title: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="cv-textarea" rows={3} value={texts.wholesale.description} onChange={(e) => patchText('wholesale', { description: e.target.value })} />
        </Field>
        <div className="cv-row2">
          <Field label="CTA text">
            <input className="cv-input" value={texts.wholesale.ctaText} onChange={(e) => patchText('wholesale', { ctaText: e.target.value })} />
          </Field>
          <Field label="CTA URL">
            <input className="cv-input" value={texts.wholesale.ctaUrl} onChange={(e) => patchText('wholesale', { ctaUrl: e.target.value })} />
          </Field>
        </div>
      </>
    ),

    footer: (
      <>
        <WorkspaceHead title="Footer" desc="Contact and social columns." />
        <Field label="Phone">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} aria-hidden="true" />
            <input className="cv-input pl-9" value={draft.footer.phone || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, phone: e.target.value } }))} />
          </div>
        </Field>
        <Field label="Address">
          <input className="cv-input" value={draft.footer.address || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, address: e.target.value } }))} />
        </Field>
        <Field label="Contact email" hint="Shown in the footer contact column.">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} aria-hidden="true" />
            <input className="cv-input pl-9" value={draft.site?.contact?.email || ''} onChange={(e) => patchSite({ contact: { ...(draft.site?.contact || {}), email: e.target.value } })} />
          </div>
        </Field>
        <Field label="Instagram URL" hint="Footer icon hides when empty.">
          <input
            className="cv-input" value={draft.site?.socialLinks?.instagram || ''}
            onChange={(e) => patchSite({ socialLinks: { ...(draft.site?.socialLinks || {}), instagram: e.target.value } })}
            placeholder="https://instagram.com/..."
          />
        </Field>
        <p className="cv-note">Quick links and category columns follow the site navigation. Logo and favicon live under Admin.</p>
      </>
    ),

    admin: (
      <>
        <WorkspaceHead title="Business Information" desc="Contact details and brand assets." />
        <p className="cv-pane-title">Contact</p>
        <div className="cv-row2">
          <Field label="Phone Number">
            <input className="cv-input" value={draft.footer.phone || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, phone: e.target.value } }))} />
          </Field>
          <Field label="WhatsApp Number">
            <input className="cv-input" value={draft.footer.whatsapp || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, whatsapp: e.target.value } }))} placeholder="+91 ..." />
          </Field>
        </div>
        <Field label="Email">
          <input className="cv-input" value={draft.site?.contact?.email || ''} onChange={(e) => patchSite({ contact: { ...(draft.site?.contact || {}), email: e.target.value } })} />
        </Field>
        <Field label="Instagram">
          <input
            className="cv-input" value={draft.site?.socialLinks?.instagram || ''}
            onChange={(e) => patchSite({ socialLinks: { ...(draft.site?.socialLinks || {}), instagram: e.target.value } })}
            placeholder="https://instagram.com/..."
          />
        </Field>
        <div className="cv-row2">
          <Field label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} aria-hidden="true" />
              <input className="cv-input pl-9" value={draft.footer.location || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, location: e.target.value } }))} placeholder="Hyderabad, Telangana" />
            </div>
          </Field>
          <Field label="Address">
            <input className="cv-input" value={draft.footer.address || ''} onChange={(e) => setDraft((d) => ({ ...d, footer: { ...d.footer, address: e.target.value } }))} />
          </Field>
        </div>

        <p className="cv-pane-title" style={{ marginTop: 16 }}>Branding</p>
        <Field label="Main Logo" hint="Navbar, footer, login. Uploading here never touches the favicon.">
          <div className="cv-upload-box">
            {draft.site?.branding?.logoUrl && (
              <img src={draft.site.branding.logoUrl} alt="Main logo preview" style={{ maxHeight: 64 }} />
            )}
            <AssetUploadButton
              label={draft.site?.branding?.logoUrl ? 'Replace logo' : 'Upload logo'}
              uploading={logoUploading}
              onFile={(f) => uploadAsset(f, setLogoUploading, (url) => patchSite({ branding: { ...(draft.site?.branding || {}), logoUrl: url } }))}
            />
          </div>
        </Field>
        <Field label="Favicon" hint="Browser tab icon only. Uploading here never touches the main logo.">
          <div className="cv-upload-box">
            {draft.site?.branding?.faviconUrl && (
              <img src={draft.site.branding.faviconUrl} alt="Favicon preview" style={{ maxHeight: 40 }} />
            )}
            <AssetUploadButton
              label={draft.site?.branding?.faviconUrl ? 'Replace favicon' : 'Upload favicon'}
              uploading={faviconUploading}
              onFile={(f) => uploadAsset(f, setFaviconUploading, (url) => {
                patchSite({ branding: { ...(draft.site?.branding || {}), faviconUrl: url } });
                try {
                  let link = document.querySelector("link[rel*='icon']");
                  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
                  link.href = url;
                } catch { /* favicon preview is best-effort */ }
              })}
            />
          </div>
        </Field>
      </>
    ),
  };

  /* ================= previews (real components, draft data) ================= */

  const previews = {
    hero: sectionEnabled('hero') ? (
      <>
        <StorefrontHero
          banners={heroBanners.length > 0 ? heroBanners : DEFAULT_HERO_BANNERS}
          cards={promoCards.length > 0 ? promoCards : DEFAULT_PROMO_CARDS}
          durationSec={draft.homepage.carouselDurationSec} loading={false} mode={modeOf('hero')}
        />
        {heroBanners.length === 0 && (
          <p className="cv-note" style={{ padding: '8px 2px 0' }}>No banners yet — showing defaults. Upload a banner to replace them.</p>
        )}
      </>
    ) : <p className="cv-empty-preview">Hero is hidden on the homepage.</p>,

    messages: (
      <>
        <TopBannerPreview messages={announcementPreviewTexts} enabled={announcementDraft.enabled !== false} />
        {(announcementDraft.enabled === false || announcementPreviewTexts.length === 0) && (
          <p className="cv-empty-preview">Announcement bar is hidden on the homepage.</p>
        )}
      </>
    ),

    stable: draft.site?.stableMessage?.enabled !== false && draft.site?.stableMessage?.text ? (
      <div style={{ borderTop: '1px solid rgba(210,166,79,0.22)', background: 'rgba(26,23,20,0.42)' }}>
        <div className="px-4 py-3.5 text-center">
          <p className="text-xs font-semibold sm:text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-on-dark)' }}>
            {draft.site.stableMessage.text}
          </p>
        </div>
      </div>
    ) : <p className="cv-empty-preview">Stable message is hidden on the homepage.</p>,

    sections: (
      <div className="cv-structure">
        {orderedSections.filter((s) => s.enabled !== false).map((s, i) => (
          <div key={s.id} className="cv-structure-row is-on">
            <span className="tabular" style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{String(i + 1).padStart(2, '0')}</span>
            {s.label}
          </div>
        ))}
        {orderedSections.filter((s) => s.enabled !== false).length === 0 && (
          <p className="cv-empty-preview">All sections are disabled.</p>
        )}
        {orderedSections.some((s) => s.enabled === false) && (
          <p className="cv-note" style={{ marginTop: 8 }}>
            Hidden: {orderedSections.filter((s) => s.enabled === false).map((s) => s.label).join(', ')}
          </p>
        )}
      </div>
    ),

    categories: sectionEnabled('categories') && visibleCats.length > 0 ? (
      <CategoryShowcase countInCategory={countInCategory} categories={visibleCats} heading={texts.categories} />
    ) : <p className="cv-empty-preview">Categories are hidden on the homepage.</p>,

    products: (
      <>
        {sectionEnabled('featured') && (
          <FeaturedSection products={maxOrAll(featuredBase, texts.featured.maxItems)} heading={texts.featured} loading={false} />
        )}
        {sectionEnabled('bestSellers') && (
          <section className="section-pad" style={{ background: 'var(--surface-page)' }}>
            <div className="shell-wide">
              <HomeProductRail
                eyebrow={texts.bestSellers.eyebrow} title={texts.bestSellers.title} subtitle={texts.bestSellers.subtitle}
                products={maxOrAll(bestBase, texts.bestSellers.maxItems)} loading={false} railLabel="best sellers"
              />
            </div>
          </section>
        )}
        {sectionEnabled('productBanners') && (
          <ProductBannerGrid banners={draft.homepage.productBanners || []} />
        )}
        {!sectionEnabled('featured') && !sectionEnabled('bestSellers') && !sectionEnabled('productBanners') && (
          <p className="cv-empty-preview">All product sections are hidden on the homepage.</p>
        )}
      </>
    ),

    promos: (() => {
      const showSecondary = sectionEnabled('secondaryBanners')
        && (draft.homepage.secondaryBanners || []).some((b) => b.enabled !== false);
      const showRail = sectionEnabled('promoBanners');
      if (!showSecondary && !showRail) {
        return <p className="cv-empty-preview">All banner sections are hidden on the homepage.</p>;
      }
      return (
        <>
          {sectionEnabled('secondaryBanners') && (
            <SecondaryBannerGrid banners={draft.homepage.secondaryBanners || []} />
          )}
          {showRail && (
            <PromoSection promotionalBanners={[...(draft.promos || [])].sort((a, b) => (b.order || 0) - (a.order || 0))} />
          )}
        </>
      );
    })(),

    deals: sectionEnabled('festiveDeals') && maxOrAll(enabledDeals, texts.deals.maxItems).length > 0 ? (
      <DealsSection deals={maxOrAll(enabledDeals, texts.deals.maxItems)} heading={texts.deals} />
    ) : <p className="cv-empty-preview">Festive deals are hidden on the homepage.</p>,

    trust: sectionEnabled('trust') ? (
      <TrustSection heading={texts.trust} cards={trustPreview.cards} />
    ) : <p className="cv-empty-preview">Why Choose Us is hidden on the homepage.</p>,

    newsletter: sectionEnabled('newsletter') ? (
      <section className="section-pad" style={{ background: 'var(--surface-sunken)' }}>
        <div className="shell-wide">
          <div className="grid gap-6 lg:grid-cols-[48fr_52fr] lg:gap-6">
            <NewsletterBlock
              email={newsletterTest}
              onEmailChange={(e) => setNewsletterTest(e.target.value)}
              onSubmit={(e) => { e.preventDefault(); toast.success('Preview only — subscribe on the live site.'); }}
              copy={texts.newsletter}
            />
            <TrackOrderBlock orderId="" onOrderIdChange={() => {}} onSubmit={(e) => e.preventDefault()} />
          </div>
        </div>
      </section>
    ) : <p className="cv-empty-preview">Newsletter is hidden on the homepage.</p>,

    wholesale: sectionEnabled('wholesale') ? (
      <WholesaleSection copy={texts.wholesale} />
    ) : <p className="cv-empty-preview">Wholesale is hidden on the homepage.</p>,

    footer: (
      <Footer
        preview={{
          phone: draft.footer.phone,
          email: draft.site?.contact?.email || draft.footer.email,
          address: draft.footer.address,
          logoUrl: draft.site?.branding?.logoUrl,
          instagram: draft.site?.socialLinks?.instagram || '',
        }}
      />
    ),

    admin: (
      <div className="cv-preview-frame" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {draft.site?.branding?.logoUrl && (
            <img src={draft.site.branding.logoUrl} alt="Brand logo" style={{ height: 44, width: 44, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-strong)' }}>
              Crackers Hyderabad
            </p>
            <p className="cv-note">Live brand + contact preview</p>
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <AdminPreviewRow label="Phone" value={draft.footer.phone} />
          <AdminPreviewRow label="WhatsApp" value={draft.footer.whatsapp} empty="Not set" />
          <AdminPreviewRow label="Email" value={draft.site?.contact?.email} />
          <AdminPreviewRow label="Instagram" value={draft.site?.socialLinks?.instagram} empty="Hidden in footer" />
          <AdminPreviewRow label="Location" value={draft.footer.location} empty="Not set" />
          <AdminPreviewRow label="Address" value={draft.footer.address} />
        </ul>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
          <span className="cv-note">Favicon:</span>
          {draft.site?.branding?.faviconUrl
            ? <img src={draft.site.branding.faviconUrl} alt="Favicon" style={{ height: 28, width: 28, borderRadius: 6 }} />
            : <span className="cv-note">Not set</span>}
        </div>
      </div>
    ),
  };

  const showDeviceToggle = !['sections', 'admin'].includes(active);

  /* ================= render: ONE section at a time ================= */

  return (
    <div className="cv cv-app">
      <CanvasNav dirty={dirty} saving={saving} saveError={saveError} onSave={handleSave} />
      <SectionTabs sections={CANVAS_SECTIONS} active={active} onSelect={setActive} />

      <div className="cv-workspace">
        <div className="cv-editor" key={`ed-${active}`}>
          {editors[active]}
        </div>
        <div className="cv-preview" key={`pv-${active}`}>
          <div className="cv-preview-head-fixed">
            {showDeviceToggle
              ? <DeviceToggle mode={modeOf(active)} onChange={(m) => setMode(active, m)} />
              : <p className="cv-pane-title" style={{ marginBottom: 0 }}>Live preview</p>}
          </div>
          <div className="cv-preview-body">
            <PreviewFrame mode={showDeviceToggle ? modeOf(active) : 'desktop'}>
              {previews[active]}
            </PreviewFrame>
          </div>
        </div>
      </div>

      {/* ---------- modals ---------- */}
      {bannerModal && (
        <BannerModal
          mode={bannerModal.mode}
          title={bannerModal.title}
          initial={bannerModal.initial}
          products={bannerModal.mode === 'product' ? products : undefined}
          onClose={() => setBannerModal(null)}
          onSave={(saved) => {
            const { mode, index } = bannerModal;
            if (mode === 'hero' && index < 0 && heroBanners.length >= HERO_MAX) {
              toast.error(`Maximum ${HERO_MAX} hero banners.`);
              return;
            }
            if (mode === 'secondary' && index < 0 && (draft.homepage.secondaryBanners || []).length >= SECONDARY_MAX) {
              toast.error(`Maximum ${SECONDARY_MAX} secondary banners.`);
              return;
            }
            setDraft((d) => {
              if (mode === 'hero') {
                const list = [...d.homepage.heroBanners];
                if (index >= 0) list[index] = { ...list[index], ...saved };
                else list.push({ ...defaultHeroBanner(list.length), ...saved, id: uid('hb'), order: list.length });
                return { ...d, homepage: { ...d.homepage, heroBanners: list.slice(0, HERO_MAX).map((x, n) => ({ ...x, order: n })) } };
              }
              if (mode === 'card') {
                const cards = [...(d.homepage.promoCards || [])];
                const next = { ...defaultPromoCard(index), ...(cards[index] || {}), ...saved };
                next.imageDesktop = next.imageDesktop || next.image || '';
                next.image = next.imageDesktop || next.image;
                cards[index] = next;
                if (import.meta.env.DEV) {
                  console.log('[CANVAS PROMO] draft updated', { slot: index, desktop: next.imageDesktop, mobile: next.imageMobile, enabled: next.enabled, fit: next.fit });
                }
                return { ...d, homepage: { ...d.homepage, promoCards: cards } };
              }
              if (mode === 'secondary') {
                const list = [...(d.homepage.secondaryBanners || [])];
                if (index >= 0) list[index] = { ...list[index], ...saved };
                else list.push({ ...defaultSecondaryBanner(list.length), ...saved, id: uid('sb'), order: list.length });
                return { ...d, homepage: { ...d.homepage, secondaryBanners: list.slice(0, SECONDARY_MAX).map((x, n) => ({ ...x, order: n })) } };
              }
              if (mode === 'product') {
                const list = [...(d.homepage.productBanners || [])];
                if (index >= 0) list[index] = { ...list[index], ...saved };
                else list.push({ ...defaultProductBanner(list.length), ...saved, id: uid('pb'), order: list.length });
                return { ...d, homepage: { ...d.homepage, productBanners: list.map((x, n) => ({ ...x, order: n })) } };
              }
              const list = [...d.promos];
              if (index >= 0) list[index] = { ...list[index], ...saved };
              else list.unshift({ ...saved, id: uid('new'), order: (list[0]?.order || 0) + 1 });
              return { ...d, promos: list };
            });
            setBannerModal(null);
            toast.success('Banner updated in preview — save to publish');
          }}
        />
      )}

      {dealModal && (
        <DealModal
          title={dealModal.title}
          initial={dealModal.initial}
          onClose={() => setDealModal(null)}
          onSave={(saved) => {
            const { index } = dealModal;
            setDraft((d) => {
              const list = [...d.deals];
              if (index >= 0) list[index] = { ...list[index], ...saved };
              else list.unshift({ ...saved, id: uid('new'), order: (list[0]?.order || 0) + 1 });
              return { ...d, deals: list };
            });
            setDealModal(null);
            toast.success('Deal updated in preview — save to publish');
          }}
        />
      )}

      {trustModal && (
        <TrustModal
          title={trustModal.title}
          initial={trustModal.initial}
          onClose={() => setTrustModal(null)}
          onSave={(saved) => {
            const { index } = trustModal;
            setDraft((d) => {
              const current = Array.isArray(d.homepage.trustCards) ? [...d.homepage.trustCards] : defaultTrustCards();
              if (index >= 0) current[index] = { ...current[index], ...saved };
              else current.push({ ...saved, id: uid('trust') });
              return { ...d, homepage: { ...d.homepage, trustCards: current } };
            });
            setTrustModal(null);
          }}
        />
      )}
    </div>
  );

  /* ---------- local helpers ---------- */

  async function uploadAsset(file, setBusy, apply, dir = 'general') {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file, { dir, watermark: false, allowLocal: false });
      if (!url || typeof url !== 'string') throw new Error('Upload returned no URL.');
      apply(url);
      toast.success('Uploaded — save to publish');
    } catch (e) {
      console.error('[canvas] asset upload failed:', e);
      toast.error(`Upload failed. Please try again.${e?.message ? ` (${e.message})` : ''}`);
    } finally {
      setBusy(false);
    }
  }
}

/* ---------- featured / best-sellers text editor (shared) ---------- */

function ProductSectionEditor({ texts, onText, enabled, onEnabled, showOrdering, paneTitle }) {
  return (
    <EditorPane title={paneTitle || 'Section settings'}>
      <Field>
        <Toggle checked={enabled} onChange={onEnabled} label="Enabled" />
      </Field>
      <div className="cv-row2">
        <Field label="Eyebrow">
          <input className="cv-input" value={texts.eyebrow || ''} onChange={(e) => onText({ eyebrow: e.target.value })} />
        </Field>
        <Field label="Title">
          <input className="cv-input" value={texts.title || ''} onChange={(e) => onText({ title: e.target.value })} />
        </Field>
      </div>
      <Field label="Subtitle">
        <input className="cv-input" value={texts.subtitle || ''} onChange={(e) => onText({ subtitle: e.target.value })} />
      </Field>
      <div className="cv-row2">
        <Field label="Number of products" hint="0 shows all.">
          <input
            type="number" min={0} max={24} className="cv-input"
            value={texts.maxItems || 0}
            onChange={(e) => onText({ maxItems: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Ordering" hint={showOrdering}>
          <input className="cv-input" value="Featured products" disabled style={{ opacity: 0.6 }} />
        </Field>
      </div>
      <p className="cv-note">Product source: live catalogue from Firebase — the same records the storefront sells.</p>
    </EditorPane>
  );
}

/* ---------- trust cards editor ---------- */

function TrustCardEditor({ cards, onChange, dnd, dropTarget, openModal }) {
  const list = Array.isArray(cards) ? cards : defaultTrustCards();
  const setList = (next) => onChange(next);

  return (
    <>
      <p className="cv-label" style={{ marginTop: 12 }}>Cards</p>
      <div className="cv-rows">
        {list.map((c, i) => (
          <div
            key={c.id || i}
            className={`cv-row${c.enabled === false ? ' is-disabled' : ''}${dropTarget === `trust:${i}` ? ' is-over' : ''}`}
            {...dnd('trust', i, (from, to) => {
              const next = [...list];
              const [item] = next.splice(from, 1);
              next.splice(to, 0, item);
              setList(next);
            })}
          >
            <span className="cv-drag"><GripVertical aria-hidden="true" /></span>
            <div className="cv-row-main">
              <p className="cv-row-title">{c.title || `Card ${i + 1}`}</p>
              <p className="cv-row-sub">{c.enabled === false ? 'Disabled' : (c.text || c.icon || '')}</p>
            </div>
            <div className="cv-row-actions">
              <button type="button" className="cv-icon-btn" aria-label="Edit trust card" onClick={() => openModal({ title: `Edit ${c.title || 'card'}`, initial: c, index: i })}>
                <Pencil aria-hidden="true" />
              </button>
              <RowMenu
                onMoveUp={() => { if (i === 0) return; const next = [...list]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setList(next); }}
                onMoveDown={() => { if (i >= list.length - 1) return; const next = [...list]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setList(next); }}
                onDelete={() => { if (confirm('Delete this card?')) setList(list.filter((_, n) => n !== i)); }}
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="cv-add-btn" onClick={() => openModal({ title: 'Add Trust Card', initial: null, index: -1 })}>
        <Plus aria-hidden="true" /> Add Trust Card
      </button>
    </>
  );
}

/* ---------- small pieces ---------- */

function AssetUploadButton({ label, uploading, onFile }) {
  return (
    <label className="cv-btn-sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
      {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
      {uploading ? 'Uploading…' : label}
      <input
        type="file" accept="image/*" className="sr-only" disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function AdminPreviewRow({ label, value, empty = '—' }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--hairline)', fontSize: 12.5 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <strong style={{ color: 'var(--text-strong)', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>
        {value || empty}
      </strong>
    </li>
  );
}
