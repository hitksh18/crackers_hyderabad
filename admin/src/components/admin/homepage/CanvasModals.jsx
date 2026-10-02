import { useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { uploadImage } from '../../../utils/uploadImage';
import { DEAL_ICON_OPTIONS } from '../../../lib/dealIcons';
import { TRUST_ICON_OPTIONS } from '../../../lib/trustIcons';
import { Field } from './CanvasChrome';

const EMPTY_HERO = {
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  heading: '',
  description: '',
  ctaText: 'Shop Now',
  ctaLink: '/products',
  enabled: true,
};

const EMPTY_CARD = {
  image: '',
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  ctaLink: '/products',
  enabled: true,
};

const EMPTY_PROMO = { imageUrl: '', link: '/products', enabled: true, order: 0 };

const EMPTY_SECONDARY = {
  imageDesktop: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  ctaLink: '/products',
  enabled: true,
};

const EMPTY_PRODUCT = {
  image: '',
  imageMobile: '',
  alt: '',
  fit: 'cover',
  productId: '',
  productSlug: '',
  productName: '',
  enabled: true,
};

/* Non-blocking aspect check: warn when artwork is far from 16:9. */
function probeRatio(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight
      ? { w: img.naturalWidth, h: img.naturalHeight, ratio: img.naturalWidth / img.naturalHeight }
      : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const DIR_FOR_MODE = {
  hero: 'canvas/hero',
  card: 'canvas/side-promos',
  secondary: 'canvas/banners',
  product: 'canvas/product-banners',
  promo: 'canvas/banners',
  general: 'general',
};

async function uploadSlot(file, setUploading, setError, dir = 'general') {
  setUploading(true);
  setError('');
  try {
    const url = await uploadImage(file, { dir, watermark: false, allowLocal: false });
    if (!url || typeof url !== 'string') throw new Error('Upload returned no URL.');
    return url;
  } catch (e) {
    console.error('[canvas] banner upload failed:', e);
    setError(`Banner upload failed. Please try again.${e?.message ? ` (${e.message})` : ''}`);
    return null;
  } finally {
    setUploading(false);
  }
}

function ImageSlot({ label, url, uploading, onPick, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="cv-upload-box">
        {url ? <img src={url} alt="" /> : <p className="cv-note">No image yet.</p>}
        <label className="cv-btn-sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
          {uploading
            ? <Loader2 className="animate-spin" aria-hidden="true" />
            : <ImagePlus aria-hidden="true" />}
          {url ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </Field>
  );
}

/**
 * Banner editor modal. `mode` is 'hero' (main carousel), 'card' (the two
 * small hero cards), 'secondary' (the independent strip below the hero),
 * 'product' (a banner bound to one catalogue product) or 'promo'
 * (promotionalBanners collection rail).
 * Uploads go to Hostinger KVM media storage (/api/upload); only the permanent
 * public URL (https://crackershyderabad.com/uploads/...) is stored in Firestore.
 */
export function BannerModal({ mode = 'hero', title, initial, products, onSave, onClose }) {
  const base = mode === 'hero' ? EMPTY_HERO
    : mode === 'card' ? EMPTY_CARD
    : mode === 'secondary' ? EMPTY_SECONDARY
    : mode === 'product' ? EMPTY_PRODUCT
    : EMPTY_PROMO;
  const [form, setForm] = useState({ ...base, ...(initial || {}) });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [ratio, setRatio] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const pick = async (field, file) => {
    const dir = DIR_FOR_MODE[mode] || 'general';
    if (import.meta.env.DEV && mode === 'card') {
      console.log('[CANVAS PROMO] upload started', { field, dir, name: file?.name, size: file?.size });
    }
    const url = await uploadSlot(file, setUploading, setError, dir);
    if (url) {
      if (import.meta.env.DEV && mode === 'card') {
        console.log('[CANVAS PROMO] upload response permanent URL', { field, url });
      }
      set({ [field]: url });
      if (field === 'imageDesktop' || field === 'image' || field === 'imageUrl') {
        setRatio(null);
        probeRatio(url).then(setRatio);
      }
    } else if (import.meta.env.DEV && mode === 'card') {
      console.warn('[CANVAS PROMO] upload failed — card state NOT updated');
    }
  };

  const desktopUrl = form.imageDesktop || form.image || form.imageUrl || '';
  const valid = mode === 'promo'
    ? !!form.imageUrl
    : mode === 'product'
      ? !!(form.image && form.productId)
      : !!(form.imageDesktop || form.image);

  const save = () => {
    if (mode === 'product' && !form.productId) {
      setError('Select a product for this banner first.');
      return;
    }
    if (!valid) {
      setError(mode === 'promo' ? 'Upload a banner image first.' : 'Upload a desktop image first.');
      return;
    }
    /* Promo cards store the desktop image under `imageDesktop` (the field the
       storefront renders) and mirror `image` for legacy readers. Sync both so
       a stale desktop URL can never shadow a freshly uploaded image. */
    const payload = { ...form };
    if (mode === 'card') {
      payload.imageDesktop = payload.imageDesktop || payload.image || '';
      payload.image = payload.imageDesktop || payload.image;
      if (import.meta.env.DEV) {
        console.log('[CANVAS PROMO] Firestore save payload', { desktop: payload.imageDesktop, mobile: payload.imageMobile, alt: payload.alt, enabled: payload.enabled, fit: payload.fit });
      }
    }
    onSave(payload);
  };

  const offRatio = ratio && Math.abs(ratio.ratio - 16 / 9) / (16 / 9) > 0.15;

  return (
    <div className="cv-modal-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p className="cv-note" style={{ margin: '2px 0 12px' }}>
          {mode === 'hero'
            ? 'Hero creatives are image-only on the homepage — upload the finished design. Text fields are stored with the banner.'
            : 'Uploads go to KVM media storage (https://crackershyderabad.com/uploads/); the permanent URL is saved.'}
        </p>

        {mode === 'promo' ? (
          <ImageSlot label="Banner image" url={form.imageUrl} uploading={uploading} onPick={(f) => pick('imageUrl', f)} />
        ) : mode === 'product' ? (
          <>
            <ImageSlot label="Desktop image (16:9 recommended)" url={form.image} uploading={uploading} onPick={(f) => pick('image', f)} />
            <ImageSlot
              label="Mobile image (optional)"
              url={form.imageMobile}
              uploading={uploading}
              onPick={(f) => pick('imageMobile', f)}
              hint="Used on phones when present, otherwise the desktop image is used."
            />
          </>
        ) : (
          <>
            <ImageSlot label="Desktop image" url={form.imageDesktop || form.image} uploading={uploading} onPick={(f) => pick('imageDesktop', f)} hint={mode === 'hero' ? 'Wide creative, e.g. 1600 × 900.' : undefined} />
            <ImageSlot
              label="Mobile image (optional)"
              url={form.imageMobile}
              uploading={uploading}
              onPick={(f) => pick('imageMobile', f)}
              hint="Used on phones when present, otherwise the desktop image is used."
            />
          </>
        )}

        {offRatio && desktopUrl && (
          <p className="cv-note" style={{ color: 'var(--gold-400)' }}>
            Recommended: 16:9 image — this one is {ratio.w}×{ratio.h} ({ratio.ratio.toFixed(2)}:1).
            It will still save, but may letterbox or crop.
          </p>
        )}

        {mode === 'product' ? (
          <Field label="Product" hint="Clicking the banner opens this product's page.">
            <select
              className="cv-select"
              value={form.productId || ''}
              onChange={(e) => {
                const p = (products || []).find((x) => x.id === e.target.value);
                if (p) set({ productId: p.id, productSlug: p.slug || '', productName: p.name || '' });
                else set({ productId: '', productSlug: '', productName: '' });
              }}
            >
              <option value="">Select a product…</option>
              {(products || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || 'Untitled'}
                </option>
              ))}
            </select>
          </Field>
        ) : (
        <div className="cv-row2">
          <Field label="Alt text">
            <input className="cv-input" value={form.alt || ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Festive crackers banner" />
          </Field>
          <Field label="Link URL">
            <input className="cv-input" value={form.ctaLink || form.link || ''} onChange={(e) => set(mode === 'promo' ? { link: e.target.value } : { ctaLink: e.target.value })} placeholder="/products" />
          </Field>
        </div>
        )}

        {mode === 'product' && (
          <Field label="Alt text">
            <input className="cv-input" value={form.alt || form.productName || ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Product offer" />
          </Field>
        )}

        {mode !== 'promo' && (
          <Field
            label="Image fit"
            hint={form.fit === 'contain'
              ? 'Show whole image — the homepage shows the complete creative with the hero field around it.'
              : 'Fill the frame — the homepage crops sides/top as needed, exactly like the storefront.'}
          >
            <div className="cv-device" role="group" aria-label="Image fit">
              <button
                type="button"
                aria-pressed={(form.fit || 'cover') === 'cover'}
                onClick={() => set({ fit: 'cover' })}
              >
                Fill frame
              </button>
              <button
                type="button"
                aria-pressed={form.fit === 'contain'}
                onClick={() => set({ fit: 'contain' })}
              >
                Whole image
              </button>
            </div>
          </Field>
        )}

        {mode === 'hero' && (
          <>
            <div className="cv-row2">
              <Field label="Title (stored)">
                <input className="cv-input" value={form.heading || ''} onChange={(e) => set({ heading: e.target.value })} placeholder="Light Up Your Celebrations" />
              </Field>
              <Field label="CTA text (stored)">
                <input className="cv-input" value={form.ctaText || ''} onChange={(e) => set({ ctaText: e.target.value })} placeholder="Shop Now" />
              </Field>
            </div>
            <Field label="Subtitle (stored)">
              <textarea className="cv-textarea" rows={2} value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </>
        )}

        <label className="cv-check">
          <span className="cv-switch">
            <input type="checkbox" checked={form.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} />
            <i aria-hidden="true" />
          </span>
          Enabled
        </label>

        {error && (
          <>
            <p className="cv-error">{error}</p>
            <p className="cv-note">Uploads go through the API server (/api/upload) with your admin session and are stored on the Hostinger KVM server beneath /uploads/canvas/…. If this keeps failing, make sure you are signed in as an administrator and retry with a JPG, PNG or WebP under 6 MB.</p>
          </>
        )}

        <div className="cv-modal-actions">
          <button type="button" className="cv-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={save} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Save Banner'}
          </button>
        </div>
      </div>
    </div>
  );
}

const GRADIENT_PRESETS = [
  { from: '#7A2410', to: '#9E2C10' },
  { from: '#C33A14', to: '#DF4C21' },
  { from: '#7C5622', to: '#BE8C36' },
  { from: '#5C1A24', to: '#8F2433' },
];

const EMPTY_DEAL = {
  title: '',
  description: '',
  offerText: 'Festive Offer',
  icon: 'Gift',
  gradientFrom: '#C33A14',
  gradientTo: '#DF4C21',
  ctaText: 'Shop Now',
  ctaLink: '/products',
  enabled: true,
};

/** Festive deal editor modal (festiveDeals collection docs). */
export function DealModal({ title, initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_DEAL, ...(initial || {}) });
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (!String(form.title || '').trim()) {
      setError('Give the deal a title first.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="cv-modal-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div style={{ height: 12 }} />
        <div className="cv-row2">
          <Field label="Title">
            <input className="cv-input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Diwali Dhamaka" />
          </Field>
          <Field label="Offer badge">
            <input className="cv-input" value={form.offerText} onChange={(e) => set({ offerText: e.target.value })} placeholder="Festive Offer" />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="cv-textarea" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="cv-row2">
          <Field label="Icon">
            <select className="cv-select" value={form.icon} onChange={(e) => set({ icon: e.target.value })}>
              {Object.keys(DEAL_ICON_OPTIONS).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </Field>
          <Field label="CTA text">
            <input className="cv-input" value={form.ctaText} onChange={(e) => set({ ctaText: e.target.value })} />
          </Field>
        </div>
        <Field label="CTA link">
          <input className="cv-input" value={form.ctaLink} onChange={(e) => set({ ctaLink: e.target.value })} placeholder="/products" />
        </Field>
        <Field label="Card gradient">
          <div className="flex flex-wrap items-center gap-2">
            {GRADIENT_PRESETS.map((g) => {
              const active = form.gradientFrom === g.from && form.gradientTo === g.to;
              return (
                <button
                  key={`${g.from}${g.to}`}
                  type="button"
                  onClick={() => set({ gradientFrom: g.from, gradientTo: g.to })}
                  aria-label={`Gradient ${g.from} to ${g.to}`}
                  aria-pressed={active}
                  style={{
                    width: 40,
                    height: 26,
                    borderRadius: 8,
                    background: `linear-gradient(128deg, ${g.from}, ${g.to})`,
                    outline: active ? '2px solid var(--gold-400)' : '1px solid var(--hairline-strong)',
                    outlineOffset: 1,
                  }}
                />
              );
            })}
            <input type="color" value={form.gradientFrom} onChange={(e) => set({ gradientFrom: e.target.value })} aria-label="Gradient from" style={{ width: 34, height: 26, padding: 0, border: 'none', background: 'none' }} />
            <input type="color" value={form.gradientTo} onChange={(e) => set({ gradientTo: e.target.value })} aria-label="Gradient to" style={{ width: 34, height: 26, padding: 0, border: 'none', background: 'none' }} />
          </div>
        </Field>
        <label className="cv-check">
          <span className="cv-switch">
            <input type="checkbox" checked={form.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} />
            <i aria-hidden="true" />
          </span>
          Enabled
        </label>
        {error && <p className="cv-error">{error}</p>}
        <div className="cv-modal-actions">
          <button type="button" className="cv-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={save}>
            Save Deal
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_TRUST = { icon: 'ShieldCheck', title: '', text: '', enabled: true };

/** Trust card editor modal (stored in settings/homepageConfig.trustCards). */
export function TrustModal({ title, initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_TRUST, ...(initial || {}) });
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (!String(form.title || '').trim()) {
      setError('Give the card a title first.');
      return;
    }
    onSave(form);
  };

  return (
    <div className="cv-modal-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cv-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div style={{ height: 12 }} />
        <div className="cv-row2">
          <Field label="Title">
            <input className="cv-input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fast Delivery" />
          </Field>
          <Field label="Icon">
            <select className="cv-select" value={form.icon} onChange={(e) => set({ icon: e.target.value })}>
              {Object.keys(TRUST_ICON_OPTIONS).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea className="cv-textarea" rows={2} value={form.text} onChange={(e) => set({ text: e.target.value })} placeholder="Same-day doorstep delivery across Hyderabad" />
        </Field>
        <label className="cv-check">
          <span className="cv-switch">
            <input type="checkbox" checked={form.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} />
            <i aria-hidden="true" />
          </span>
          Enabled
        </label>
        {error && <p className="cv-error">{error}</p>}
        <div className="cv-modal-actions">
          <button type="button" className="cv-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={save}>
            Save Card
          </button>
        </div>
      </div>
    </div>
  );
}
