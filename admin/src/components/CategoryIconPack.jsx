import { useEffect, useState } from 'react';

/**
 * Category icons — the approved PNG asset set, one exact file per category.
 *
 * `noCrop` renders the full source asset as-is inside whatever fixed box the
 * caller provides (object-fit: contain, fully visible, never cropped). The
 * Products pill row uses this so every icon shares one identical bounding
 * box with no per-icon runtime resizing and no post-load src swap.
 * Everywhere else keeps the legacy cropped rendering, unchanged.
 */

const SLUG_FILES = {
  rockets: 'rockets.png',
  sparkles: 'sparklers.png',
  'ground-chakkars': 'ground chakkar.png',
  fancy: 'sky shots.png',
  'fancy-fireworks': 'fancy fireworks.png',
  'gift-boxes': 'gift boxes.png',
  'flower-pots': 'flowerpots.png',
  bombs: 'bombs.png',
  garlands: 'garlands.png',
  kids: 'kids special.png',
  'guns-rolls-pop-pop': 'Guns, Rolls & Pop Pop.png',
  'threads-novelties': 'Threads and Novelties.png',
};

const ALPHA_THRESHOLD = 8;
const CROP_MARGIN = 2;
const CROP_CACHE = new Map();

const computeCrop = (src) =>
  new Promise((resolve) => {
    if (CROP_CACHE.has(src)) return resolve(CROP_CACHE.get(src));

    const img = new Image();
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y += 1) {
          const row = y * w;
          for (let x = 0; x < w; x += 1) {
            if (data[(row + x) * 4 + 3] > ALPHA_THRESHOLD) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < 0) return resolve(null);

        const bx = Math.max(0, minX - CROP_MARGIN);
        const by = Math.max(0, minY - CROP_MARGIN);
        const bw = Math.min(w - bx, maxX - minX + 1 + CROP_MARGIN * 2);
        const bh = Math.min(h - by, maxY - minY + 1 + CROP_MARGIN * 2);

        const cropped = document.createElement('canvas');
        cropped.width = bw;
        cropped.height = bh;
        cropped.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);

        const result = { dataUrl: cropped.toDataURL('image/png'), w: bw, h: bh };
        CROP_CACHE.set(src, result);
        resolve(result);
      } catch (error) {
        console.warn('Category icon crop failed:', error.message);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const CategoryIcon = ({ category, className, glow = false, noCrop = false }) => {
  const src = `/product_icons/${SLUG_FILES[category] || SLUG_FILES.rockets}`;
  const [crop, setCrop] = useState(null);

  useEffect(() => {
    if (noCrop) return;
    let cancelled = false;
    computeCrop(src).then((result) => {
      if (!cancelled) setCrop(result);
    });
    return () => {
      cancelled = true;
    };
  }, [src, noCrop]);

  /* Normalised pill rendering: one shared fixed box owned by CSS
     (.catalogue-pill-icon), artwork centred, fully visible, never cropped,
     identical for every category regardless of source aspect ratio. */
  if (noCrop) {
    return (
      <img
        src={src}
        alt=""
        className={className ?? 'h-full w-full'}
        draggable={false}
        style={{ objectFit: 'contain', objectPosition: 'center', display: 'block' }}
      />
    );
  }

  return (
    <span className="relative block h-full w-full">
      {glow && <span className="category-icon-glow" aria-hidden="true" />}
      <img
        src={crop ? crop.dataUrl : src}
        alt=""
        className={className ?? 'h-full w-full'}
        draggable={false}
        style={{ position: 'relative', objectFit: 'contain', objectPosition: 'center' }}
      />
    </span>
  );
};

export default CategoryIcon;