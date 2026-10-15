/**
 * Hero artwork animation configuration (Canvas → Hero → Artwork Animation).
 *
 * Stored in the existing settings/homepageConfig document, alongside
 * heroCopy — one config, no second state system:
 *
 *   heroArtworkAnimation: { enabled, type, speed }
 *
 * The customer hero (HeroProductShowcase) derives its CSS class and animation
 * duration from this config; nothing is hardcoded in the component. Speed maps
 * to SAFE durations only (no extreme movement ever), and the artwork stays
 * completely static when disabled or when the visitor prefers reduced motion.
 */

export const HERO_ARTWORK_TYPES = [
  { id: 'gentle-float', label: 'Gentle Float' },
  { id: 'slow-sway', label: 'Slow Sway' },
  { id: 'float-sway', label: 'Float + Sway' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'hover', label: 'Hover' },
  { id: 'none', label: 'None' },
];

export const HERO_ARTWORK_TYPE_IDS = HERO_ARTWORK_TYPES.map((t) => t.id);

/* Retired style ids from the earlier iteration keep resolving to the closest
   current style, so a previously saved config never breaks or goes static. */
const LEGACY_TYPE_ALIASES = {
  'subtle-rock': 'slow-sway',
};

export const DEFAULT_HERO_ARTWORK_ANIMATION = {
  enabled: true,
  type: 'float-sway',
  speed: 60,
};

export const ARTWORK_SPEED_MIN = 5;
export const ARTWORK_SPEED_MAX = 100;

/* Presets — Slow/Normal/Fast are primarily a TIMING change (14s / 10s / 7s),
   never a movement-intensity change. */
export const ARTWORK_SPEED_PRESETS = { Slow: 20, Normal: 60, Fast: 90 };

const clampSpeed = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_HERO_ARTWORK_ANIMATION.speed;
  return Math.min(ARTWORK_SPEED_MAX, Math.max(ARTWORK_SPEED_MIN, Math.round(v)));
};

export const normalizeHeroArtworkAnimation = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const rawType = typeof raw.type === 'string' ? raw.type : '';
  return {
    enabled: raw.enabled !== false,
    type: HERO_ARTWORK_TYPE_IDS.includes(rawType)
      ? rawType
      : (LEGACY_TYPE_ALIASES[rawType] || DEFAULT_HERO_ARTWORK_ANIMATION.type),
    speed: clampSpeed(raw.speed),
  };
};

/**
 * Safe animation duration for a speed value: 5% → 15.5s, 60% → 10s,
 * 90% → 7s, 100% → 6s. Always a finite value inside 6–16s, so an admin can
 * never produce an invalid or frantic animation.
 */
export const artworkDurationSec = (speed) => {
  const s = clampSpeed(speed);
  const duration = 16 - (s / 100) * 10;
  return Math.round(duration * 10) / 10;
};
