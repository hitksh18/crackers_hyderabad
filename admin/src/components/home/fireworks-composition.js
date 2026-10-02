/* =========================================================================
   Fireworks director — composition rules for the hero show.

   A motion-designer's rundown, not a particle function:

     1. pick a launch lane (five fixed pads, centre rarely used)
     2. pick a size on the 70 / 25 / 5 curve (small-medium / large /
        spectacular, with cooldowns so the big ones stay special)
     3. pick an apex almost directly above the pad — near-vertical flight
     4. REJECT anything whose burst would touch the protected brand block,
        whose lane is occupied, or that crowds a recent explosion
     5. pick a firework type different from the previous one

   Pure planner: no DOM, no frame loop. The renderer asks for the next shot
   and gets a plan back, or null when the sky says "not yet".
   ========================================================================= */

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TAU = Math.PI * 2;

const weighted = (items) => {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
};

/* Hard protected brand block, as fractions of hero size. No burst disc may
   touch it; no rocket may pass through it. */
export const SAFE = { x0: 0.28, x1: 0.72, y0: 0.3, y1: 0.72 };

/* Bursts must stay above this fraction of hero height — shells climb out of
   the dark bottom band and break in the open sky. */
export const SKYLINE_TOP = 0.875;

/* Four launch pads across the bottom edge; the centre stays clear for the
   brand. Shells emerge from below the hero's bottom edge. */
export const LANES = [
  { x: 0.15, weight: 26 },
  { x: 0.3, weight: 24 },
  { x: 0.7, weight: 24 },
  { x: 0.85, weight: 26 },
];

/* Six sky zones (A-F: far left through far right). The director remembers
   recently used zones and spends its early attempts elsewhere, so the show
   spreads across the whole sky instead of camping one corner. */
const ZONE_COUNT = 6;
const zoneOf = (x, w) => Math.min(ZONE_COUNT - 1, Math.max(0, Math.floor((x / w) * ZONE_COUNT)));

/* Apex altitude bands per size, as fractions of hero height. */
const ALTITUDE = {
  small: [0.12, 0.35],
  medium: [0.1, 0.3],
  large: [0.06, 0.22],
  spectacular: [0.05, 0.18],
};

/* Size classes. `r` = burst radius as a fraction of hero width, i.e. the
   diameter reads 6-9% (small), 9-14% (medium), 14-22% (large) and 20-25%
   (spectacular) before depth scaling. Counts are ray totals for a midground
   shell; depth scales them. */
export const SIZES = {
  small: { key: 'small', weight: 38, r: [0.05, 0.08], count: [28, 45] },
  medium: { key: 'medium', weight: 30, r: [0.09, 0.14], count: [50, 75] },
  large: { key: 'large', weight: 26, r: [0.15, 0.22], count: [90, 130] },
  spectacular: { key: 'spectacular', weight: 6, r: [0.2, 0.27], count: [150, 190] },
};

const LARGE_COOLDOWN = 6000;
const SPECTACULAR_COOLDOWN = 30000;

/* Depth planes: distant shells are small, dim and soft; foreground shells
   are large, bright and sharp. `off` is pointer-parallax travel in px. */
export const DEPTHS = {
  bg: { scale: 0.7, alpha: 0.5, speed: 0.85, soft: true, off: 1 },
  mid: { scale: 1.0, alpha: 0.9, speed: 1.0, soft: false, off: 2.5 },
  fg: { scale: 1.15, alpha: 1.0, speed: 1.08, soft: false, off: 5 },
};

/* Firework patterns in the gold / red / yellow Diwali palette. `retention` =
   velocity kept per second (low = draggy). `tail` = ray length in seconds of
   travel. `inner` = share of rays fired as a slower, brighter inner shell.
   `outer` = rays past `from` (reach fraction) burn in a second palette, the
   red-gold signature structure. `droplet` = per-frame chance a fast ray
   sheds a cooling spark. `sway` = lateral breathing for hanging trails.
   `gapAt` = chance of one dark wedge so rings never look drawn. */
export const TYPES = {
  chrys: { key: 'chrys', weight: 30, pal: 'gold', count: 1, speed: 1, retention: 0.5, tail: 0.06, len: 1, life: 1.1, gravity: 1, size: [1.8, 3.0], wobble: 0.06, inner: 0.38, droplet: 0.012, gapAt: 0.55 },
  redgold: { key: 'redgold', weight: 24, pal: 'gold', outer: { from: 0.6, pal: 'crimson' }, count: 1, speed: 1, retention: 0.5, tail: 0.06, len: 1, life: 1.1, gravity: 1, size: [1.8, 3.0], wobble: 0.06, inner: 0.45, droplet: 0.012, gapAt: 0.5, coreBoost: 1.3 },
  willow: { key: 'willow', weight: 18, pal: 'gold', count: 0.8, speed: 0.72, retention: 0.32, tail: 0.085, len: 1.45, life: 1.6, gravity: 1.6, size: [1.7, 2.6], wobble: 0.09, inner: 0.25, droplet: 0.02, sway: 26, gapAt: 0.4 },
  peony: { key: 'peony', weight: 14, pal: 'champagne', count: 0.95, speed: 0.92, retention: 0.68, tail: 0.028, len: 0.7, life: 0.9, gravity: 1.05, size: [1.6, 2.6], wobble: 0.035, inner: 0.5, droplet: 0.004, gapAt: 0.15, coreBoost: 1.6 },
  starburst: { key: 'starburst', weight: 10, pal: 'champagne', count: 0.7, speed: 1.15, retention: 0.85, tail: 0.02, len: 0.9, life: 0.6, gravity: 0.5, size: [1.5, 2.4], wobble: 0.015, inner: 0, droplet: 0, gapAt: 0, coreBoost: 1.2 },
  ring: { key: 'ring', weight: 8, pal: 'gold', outer: { from: 0.55, pal: 'crimson' }, band: [0.85, 1.02], count: 0.9, speed: 1.0, retention: 0.62, tail: 0.035, len: 0.8, life: 0.9, gravity: 1.0, size: [1.6, 2.6], wobble: 0.03, inner: 0.4, droplet: 0.006, gapAt: 0.2, coreBoost: 1.3 },
  crackle: { key: 'crackle', weight: 14, pal: 'ember', count: 1.2, speed: 1.05, retention: 0.6, tail: 0.02, len: 0.5, life: 0.7, gravity: 0.9, size: [1.1, 1.9], wobble: 0.08, inner: 0, droplet: 0, flick: true, gapAt: 0.25, dim: 0.85 },
};

/* Premium Diwali palette: warm white -> champagne -> gold -> amber, plus
   deep red / crimson accents over a gold-dominant show. No blue, no green,
   no purple, ever. */
export const PALETTES = {
  gold: ['#FFF1C2', '#F7D36A', '#E5AE3F', '#C88725'],
  champagne: ['#FFF1C2', '#F7D36A', '#E5AE3F'],
  ivory: ['#FFF1C2', '#F7D36A', '#C88725'],
  crimson: ['#ff9a5a', '#D94A32', '#A83224', '#7c1f14'],
  ember: ['#FFD98A', '#D94A32', '#A83224'],
  duo: ['#FFF1C2', '#E5AE3F', '#a02712', '#C88725'],
};

/* Minimum lateral gap between a new flight line and a live one, in px. With
   near-vertical flights this is a lane-occupancy test, not a curve solver. */
const LANE_PX = 90;

const rectHitsSafe = (cx, cy, r, w, h) => {
  const sx0 = SAFE.x0 * w;
  const sx1 = SAFE.x1 * w;
  const sy0 = SAFE.y0 * h;
  const sy1 = SAFE.y1 * h;
  const nx = clamp(cx, sx0, sx1);
  const ny = clamp(cy, sy0, sy1);
  return Math.hypot(cx - nx, cy - ny) < r;
};

const pickSize = (now, lastLargeAt, lastSpectacularAt) => {
  const pool = [SIZES.small, SIZES.medium, SIZES.large, SIZES.spectacular].filter((s) => {
    if (s.key === 'large' && now - lastLargeAt < LARGE_COOLDOWN) return false;
    if (s.key === 'spectacular' && now - lastSpectacularAt < SPECTACULAR_COOLDOWN) return false;
    return true;
  });
  return weighted(pool.length ? pool : [SIZES.small, SIZES.medium]);
};

const pickDepth = (size, type) => {
  if (type.key === 'crackle') return 'bg';
  if (size.key === 'spectacular') return Math.random() < 0.6 ? 'fg' : 'mid';
  const r = Math.random();
  if (r < 0.3) return 'bg';
  if (r < 0.8) return 'mid';
  return 'fg';
};

const pickType = (lastType, size) => {
  for (let i = 0; i < 4; i++) {
    const keys = Object.keys(TYPES);
    const bag = keys.map((k) => ({ ...TYPES[k], weight: TYPES[k].weight }));
    const t = weighted(bag);
    if (t.key !== lastType) {
      /* Crackle is background activity: never a showpiece. The ring reads
         best at medium/large sizes; the starburst snap stays below hero
         scale so spectaculars keep their weight. */
      if (t.key === 'crackle' && size.key !== 'small') continue;
      if (t.key === 'ring' && (size.key === 'small' || size.key === 'spectacular')) continue;
      if (t.key === 'starburst' && size.key === 'spectacular') continue;
      return t;
    }
  }
  return { ...TYPES.chrys };
};

/** Delay before the next launch, in ms. A living sky breathes: usually a
   short pause, sometimes a real quiet spell — but quiet never means empty,
   with embers, smoke and distant sparks still alight. */
export const nextGap = () => {
  const r = Math.random();
  if (r < 0.15) return rand(2800, 4000);
  return rand(1000, 2200);
};

/**
 * Plan the next shot.
 *
 * @param scene { w, h, rockets, bursts, lastLane, lastType, lastLargeAt,
 *                lastSpectacularAt, recentBins }
 *   rockets: live [{ x }] in px — a new flight too close is rejected.
 *   bursts: recent [{ x, y, r, at }] in px — crowding one is rejected.
 *   recentBins: [{ bin, at }] of recently used sky zones A-F.
 * @param opts { avoidX, forceLane, forceSize, forceType }
 *   avoidX: px x to stay away from (companions take the far side).
 *   force*: pin the show moment (structured finales) — still validated.
 * @returns a plan, or null when nothing composes right now.
 */
export const planShot = (scene, now, opts) => {
  const { w, h } = scene;
  const avoidX = opts?.avoidX;
  const bins = scene.recentBins || [];

  for (let attempt = 0; attempt < 12; attempt++) {
    const lane = opts?.forceLane != null
      ? { x: opts.forceLane, weight: 1 }
      : weighted(LANES.map((l) => ({ ...l })));
    if (lane.x === scene.lastLane && attempt < 9) continue;
    /* Companions and finale shells belong on the far side. */
    if (avoidX != null && Math.abs(lane.x * w - avoidX) < w * 0.25 && attempt < 9) continue;

    const size = opts?.forceSize
      ? SIZES[opts.forceSize]
      : pickSize(now, scene.lastLargeAt, scene.lastSpectacularAt);
    if (!size) continue;
    const type = opts?.forceType
      ? { ...TYPES[opts.forceType] }
      : pickType(scene.lastType, size);
    if (type.key === 'crackle' && size.key !== 'small') continue;
    const depth = pickDepth(size, type);
    const D = DEPTHS[depth];

    const x0 = (lane.x + rand(-0.015, 0.015)) * w;
    /* Near-vertical by construction: the apex sits almost directly overhead,
       never across the screen. */
    const apexX = x0 + rand(-0.025, 0.025) * w;
    const band = ALTITUDE[size.key];
    const apexY = rand(band[0], band[1]) * h;

    /* Spread across zones A-F: early attempts refuse recently used sky. */
    const bin = zoneOf(apexX, w);
    if (attempt < 8 && bins.some((b) => b.bin === bin && now - b.at < 9000)) continue;

    let radius = (rand(size.r[0], size.r[1]) * w) / 2;
    radius *= D.scale;

    /* The whole burst disc must clear the brand block with margin — streaks
       and glow travel past the nominal radius. */
    if (rectHitsSafe(apexX, apexY, radius * 1.15, w, h)) continue;
    /* Bursts live in the sky, never in the skyline band. */
    if (apexY / h > SKYLINE_TOP - 0.03) continue;

    /* Lane occupied by a live flight? Wait for it. */
    if (scene.rockets.some((r) => Math.abs(r.x - x0) < LANE_PX)) continue;

    /* Crowding a fresh explosion? Give it room. */
    let crowded = false;
    for (const b of scene.bursts) {
      if (now - b.at > 2600) continue;
      if (Math.hypot(b.x - apexX, b.y - apexY) < (b.r + radius) * 1.1 + 40) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;

    if (scene.recentBins) {
      scene.recentBins.push({ bin, at: now });
      if (scene.recentBins.length > 6) scene.recentBins.splice(0, scene.recentBins.length - 6);
    }
    return { x0, apexX, apexY, radius, type, size, depth, lane: lane.x };
  }
  return null;
};
