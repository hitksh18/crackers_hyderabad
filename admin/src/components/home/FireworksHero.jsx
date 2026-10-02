import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  DEPTHS,
  PALETTES,
  TAU,
  nextGap,
  planShot,
  rand,
} from './fireworks-composition';
import './fireworks-hero.css';

/* =========================================================================
   FireworksHero — a pure night-sky Diwali show behind the hero content.

   One canvas, one persistent loop, one director. Shells rise from the
   bottom edge on near-vertical physics ascents, brake visibly, detonate
   through a staged ignition (flash -> core -> two shell waves), and their
   rays expand, slow, droop and fade with gravity and drag. Bursts light the
   sky around them (halos), exhale tinted smoke, and shed embers; the
   director keeps 1-3 shells composing across five lanes with companions
   and rare structured finales, forever, with quiet breathing room.

   No skyline, no monuments, no images — canvas particles only. The brand
   block is protected by the director's safe zone plus a CSS vignette.
   ========================================================================= */

/* Thin tapering trails. Pre-baked so the frame loop never builds strings. */
const HIST = 14;
const TAIL_A = Array.from({ length: HIST }, (_, i) => {
  const a = (i / (HIST - 1)) ** 2 * 0.8;
  return a.toFixed(3);
});
const TAIL_W = Array.from({ length: HIST }, (_, i) => 0.4 + (i / (HIST - 1)) * 1.0);

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* A single ray: transparent tip, colour body, white-hot head, soft across
   its thickness. Drawn rotated and stretched per ray. */
const streakSprite = (hex, soft) => {
  const W = 96;
  const H = 18;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (soft) g.filter = 'blur(2.5px)';
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, rgba(hex, 0));
  grd.addColorStop(0.4, rgba(hex, 0.14));
  grd.addColorStop(0.78, rgba(hex, 0.72));
  grd.addColorStop(0.93, rgba(hex, 0.95));
  grd.addColorStop(1, 'rgba(255,241,194,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const vg = g.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.5, 'rgba(0,0,0,1)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return c;
};

const glowSprite = (inner, outer, size, blur) => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (blur) g.filter = `blur(${blur}px)`;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.34, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
};

const FireworksHero = () => {
  const reduced = useReducedMotion();
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  /* Pointer in -1..1. Read by the renderer only — physics never sees it. */
  const pointerRef = useRef({ x: 0, y: 0 });

  const isMobile = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
    []
  );
  const isTablet = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches,
    []
  );
  const canParallax = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    []
  );

  /* ======================= the simulation ============================= */
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const MAX_MAJOR = isMobile ? 1 : isTablet ? 2 : 3;
    const MAX_PARTS = isMobile ? 260 : isTablet ? 450 : 700;
    const PART_SCALE = isMobile ? 0.45 : isTablet ? 0.7 : 1;
    const SMOKE_SCALE = isMobile ? 0.45 : isTablet ? 0.7 : 1;

    /* Sprite banks keyed exactly by PALETTES so a palette can never miss
       its streak set and take the page down with it. */
    const streaks = {};
    const streaksSoft = {};
    Object.keys(PALETTES).forEach((k) => {
      streaks[k] = [];
      streaksSoft[k] = [];
      PALETTES[k].forEach((hex) => {
        streaks[k].push(streakSprite(hex, false));
        streaksSoft[k].push(streakSprite(hex, true));
      });
    });
    const headGlow = glowSprite('rgba(255,241,194,0.95)', 'rgba(229,174,63,0.5)', 64, 1);
    const flashSpriteC = glowSprite('rgba(255,252,240,0.95)', 'rgba(247,211,106,0.5)', 128, 2);
    const smokeSpriteC = glowSprite('rgba(190,172,148,0.5)', 'rgba(120,104,88,0.2)', 128, 6);
    const warmSmokeC = glowSprite('rgba(216,186,150,0.55)', 'rgba(150,120,95,0.22)', 128, 6);
    const redSmokeC = glowSprite('rgba(214,150,120,0.5)', 'rgba(140,70,50,0.2)', 128, 6);
    const horizonGlowC = glowSprite('rgba(255,166,66,0.5)', 'rgba(154,44,16,0.2)', 160, 8);
    const goldHaloC = glowSprite('rgba(255,196,100,0.6)', 'rgba(229,174,63,0.25)', 160, 8);
    const redHaloC = glowSprite('rgba(217,74,50,0.55)', 'rgba(124,31,20,0.22)', 160, 8);

    const st = {
      w: 1,
      h: 1,
      dpr: 1,
      rockets: [],
      ignitions: [],
      parts: [],
      smoke: [],
      halos: [],
      twinkles: [],
      bursts: [],
      queue: [],
      recentBins: [],
      nextAt: 0,
      lastEventAt: 0,
      lastLane: -1,
      lastType: '',
      lastLargeAt: -1e5,
      lastSpectacularAt: -1e5,
      lastFinaleAt: -1e5,
      lastFinaleX: 0,
      paused: true,
      raf: 0,
      last: 0,
    };

    const setBase = () => ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dpr = Math.min(isMobile ? 1.75 : 2, window.devicePixelRatio || 1);
      st.w = w;
      st.h = h;
      st.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      setBase();
    };

    const clearScene = () => {
      st.rockets.length = 0;
      st.ignitions.length = 0;
      st.parts.length = 0;
      st.smoke.length = 0;
      st.halos.length = 0;
      st.twinkles.length = 0;
      st.bursts.length = 0;
      st.queue.length = 0;
      st.recentBins.length = 0;
    };

    /* Faint warmth pooled along the bottom of the sky so bursts melt into
       atmosphere instead of popping against flat black. */
    const drawHorizonWarmth = () => {
      const gy = st.h * 0.96;
      ctx.globalAlpha = 0.1;
      const gr = st.w * 0.45;
      ctx.drawImage(horizonGlowC, st.w * 0.25 - gr, gy - gr * 0.35, gr * 2, gr * 0.7);
      ctx.globalAlpha = 0.08;
      const gr2 = st.w * 0.36;
      ctx.drawImage(horizonGlowC, st.w * 0.74 - gr2, gy - gr2 * 0.32, gr2 * 2, gr2 * 0.64);
      ctx.globalAlpha = 1;
    };

    /* ------------------------------ shells ----------------------------- */
    const launch = (plan) => {
      const y0 = st.h * 1.02;
      const rise = y0 - plan.apexY;
      const vy0 = -st.h * rand(0.85, 1.0);
      const est = rise / Math.abs(vy0);
      st.rockets.push({
        x: plan.x0,
        y: y0,
        vx: (plan.apexX - plan.x0) / est,
        vy: vy0,
        thrust: Math.abs(vy0) * 0.28,
        plan,
        rise,
        hist: [],
        ph: Math.random() * TAU,
        age: 0,
        smokeAt: 0,
        sparkAt: 0,
      });
      st.lastLane = plan.lane;
      st.lastType = plan.type.key;
      if (plan.size.key === 'large' || plan.size.key === 'spectacular') st.lastLargeAt = performance.now();
      if (plan.size.key === 'spectacular') st.lastSpectacularAt = performance.now();
      st.bursts.push({ x: plan.apexX, y: plan.apexY, r: plan.radius, at: performance.now(), major: plan.size.key !== 'small' });
    };

    /* One wave of the shell, in six layers: flash+core are drawn by the
       ignition, then inner rays, long primary rays, secondary sparks,
       embers, and tinted smoke. */
    const fireShell = (x, y, plan, frac) => {
      const D = DEPTHS[plan.depth];
      const type = plan.type;
      const radius = plan.radius;
      const set = D.soft ? streaksSoft[type.pal] : streaks[type.pal];
      /* A visual effect must never take down the page: skip a shell whose
         sprites are missing instead of throwing mid-frame. */
      if (!set || !set.length) return;
      let n = Math.round(rand(plan.size.count[0], plan.size.count[1]) * type.count * frac * PART_SCALE * (D.soft ? 0.85 : 1));
      n = Math.max(6, n);
      const gravity = 300 * (st.h / 700) * type.gravity;
      const maxLen = radius * 0.95 + 26;

      /* Real shells are never perfect rings: leave one dark wedge. */
      let gapAt = -1;
      let gapHalf = 0;
      if (Math.random() < (type.gapAt || 0)) {
        gapAt = Math.random() * TAU;
        gapHalf = rand(0.08, 0.2);
      }
      const inGap = (a) => {
        let d = Math.abs((((a - gapAt) % TAU) + TAU) % TAU);
        d = Math.min(d, TAU - d);
        return d < gapHalf;
      };

      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + rand(-0.085, 0.085) + rand(-type.wobble, type.wobble);
        if (gapAt >= 0 && inGap(ang)) continue;
        const u = Math.random();
        const tier = u < 0.25 ? rand(0.4, 0.6) : u < 0.6 ? rand(0.6, 0.85) : rand(0.85, 1.05);
        const inner = Math.random() < (type.inner || 0);
        /* Banded shells (the red ring) keep every outer ray on one sphere;
           the inner gold heart stays free-form. */
        const banded = !inner && type.band;
        const reach = banded
          ? radius * rand(type.band[0], type.band[1])
          : radius * tier * (inner ? rand(0.3, 0.55) : 1);
        const sp = reach * rand(1.6, 2.4) * type.speed * D.speed * (inner ? 0.62 : 1);
        const ember = Math.random() < 0.2;
        /* Signature red-gold structure: long outer rays burn crimson while
           gold stays dominant in the heart. */
        const outer = type.outer && !inner && tier >= type.outer.from;
        const spriteSet = outer ? (D.soft ? streaksSoft[type.outer.pal] : streaks[type.outer.pal]) : set;
        st.parts.push({
          x,
          y,
          vx: Math.cos(ang) * sp * (ember ? 0.5 : 1),
          vy: Math.sin(ang) * sp * (type.key === 'willow' ? rand(0.7, 1.05) : 1) * (ember ? 0.5 : 1),
          life: 0,
          max: rand(0.72, 1.6) * type.life * 1000 * (ember ? rand(1.8, 2.8) : 1),
          retention: ember ? Math.min(0.99, type.retention + 0.04) : type.retention,
          gravity: gravity * (ember ? 0.4 : 1),
          tail: type.tail * (inner ? 0.7 : 1),
          lenMul: type.len * rand(0.6, 1.35),
          size: rand(type.size[0], type.size[1]) * (D.scale * 0.6 + 0.55) * (type.dim || 1),
          bright: rand(0.7, 1.05) * (Math.random() < 0.07 ? 1.15 : 1) * (ember ? 0.5 : 1) * (inner ? 1.15 : 1) * D.alpha,
          sprite: spriteSet[(Math.random() * spriteSet.length) | 0],
          flick: !!type.flick,
          ember,
          drop: false,
          droplet: type.droplet || 0,
          sway: (type.sway || 0) * rand(0.5, 1.2),
          swayPh: Math.random() * TAU,
          maxLen,
          off: D.off,
        });
      }

      /* Secondary sparks between the major rays: small, quick, supporting. */
      const secs = Math.round(n * 0.5);
      for (let i = 0; i < secs; i++) {
        const ang = Math.random() * TAU;
        const reach = radius * rand(0.25, 0.7);
        const sp = reach * rand(1.8, 2.6) * type.speed * D.speed;
        st.parts.push({
          x: x + rand(-4, 4),
          y: y + rand(-4, 4),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0,
          max: rand(400, 900) * type.life,
          retention: 0.55,
          gravity: gravity * 1.1,
          tail: 0.025,
          lenMul: 0.5,
          size: rand(1, 1.7) * (type.dim || 1),
          bright: rand(0.4, 0.7) * D.alpha,
          sprite: set[(Math.random() * set.length) | 0],
          flick: type.key === 'crackle',
          ember: true,
          drop: true,
          droplet: 0,
          sway: 0,
          swayPh: 0,
          maxLen: 18,
          off: D.off,
        });
      }

      /* The break point exhales slow embers that outlive the rays. */
      const shed = Math.round(rand(6, 12) * (D.soft ? 0.6 : 1) * PART_SCALE);
      for (let i = 0; i < shed; i++) {
        st.parts.push({
          x: x + rand(-radius * 0.2, radius * 0.2),
          y: y + rand(-radius * 0.15, radius * 0.15),
          vx: rand(-24, 24),
          vy: rand(-30, 10),
          life: 0,
          max: rand(800, 2000),
          retention: 0.86,
          gravity: 90 * (st.h / 700),
          tail: 0.03,
          lenMul: 0.5,
          size: rand(1, 1.8),
          bright: 0.55 * D.alpha,
          sprite: streaks.gold[0],
          flick: false,
          ember: true,
          drop: false,
          droplet: 0,
          sway: 0,
          swayPh: 0,
          maxLen: 16,
          off: D.off,
        });
      }

      /* First wave only: the sky halo. Smoke on every wave. */
      if (frac > 0.5) {
        const red = !!(type.outer || type.pal === 'ember');
        const big = plan.size.key === 'large' || plan.size.key === 'spectacular';
        st.halos.push({
          x, y,
          r0: radius * 0.5,
          r1: radius * (big ? 1.7 : 1.45),
          t: 0,
          dur: big ? 1.2 : 0.8,
          red,
          a: big ? 0.5 : 0.35,
        });
      }

      if (plan.size.key !== 'small' || Math.random() < 0.3) {
        const puffs = Math.max(1, Math.round(rand(2, 4) * (D.soft ? 0.7 : 1) * SMOKE_SCALE));
        /* Burst smoke catches the shell's light: gold or dusty red. */
        const tint = type.outer || type.pal === 'ember' ? 'red' : 'warm';
        for (let i = 0; i < puffs; i++) {
          const a = Math.random() * TAU;
          const d = radius * rand(0, 0.5);
          st.smoke.push({
            x: x + Math.cos(a) * d,
            y: y + Math.sin(a) * d,
            r0: radius * rand(0.2, 0.34),
            r1: radius * rand(0.75, 1.3) + 30,
            t: 0,
            dur: rand(2000, 4000) / 1000,
            a: (D.soft ? 0.5 : 1) * rand(0.6, 1),
            drift: rand(-14, 14),
            tint,
          });
        }
      }
    };

    /* --------------------------- simulation ---------------------------- */
    const step = (dt, now) => {
      /* Rockets: thrust upward, ease off near the top, then detonate. */
      for (let i = st.rockets.length - 1; i >= 0; i--) {
        const r = st.rockets[i];
        r.age += dt;
        r.vy -= r.thrust * dt;
        r.vx += Math.sin(r.age * 7 + r.ph) * 10 * dt;
        const brakeLine = r.plan.apexY + r.rise * 0.15;
        if (r.y < brakeLine) r.vy *= Math.pow(0.02, dt);
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.hist.push(r.x + rand(-1, 1), r.y);
        if (r.hist.length > HIST * 2) r.hist.splice(0, 2);

        r.smokeAt -= dt;
        if (r.smokeAt <= 0) {
          r.smokeAt = isMobile ? rand(0.1, 0.18) : rand(0.07, 0.13);
          st.smoke.push({
            x: r.x + rand(-3, 3),
            y: r.y + rand(6, 16),
            r0: 2,
            r1: rand(12, 22),
            t: 0,
            dur: rand(700, 1100) / 1000,
            a: 0.3,
            drift: rand(-8, 8),
            tint: null,
          });
        }
        r.sparkAt -= dt;
        if (r.sparkAt <= 0) {
          r.sparkAt = 0.06;
          if (Math.random() < 0.4 && st.parts.length < MAX_PARTS) {
            st.parts.push({
              x: r.x, y: r.y,
              vx: rand(-14, 14), vy: rand(20, 60),
              life: 0, max: rand(240, 420),
              retention: 0.02, gravity: 60,
              tail: 0.02, lenMul: 0.8, size: 1.1, bright: 0.7,
              sprite: streaks.gold[1], flick: false,
              ember: true, drop: true, droplet: 0, sway: 0, swayPh: 0,
              maxLen: 20, off: DEPTHS[r.plan.depth].off,
            });
          }
        }

        if (r.y <= r.plan.apexY || (r.y < brakeLine && r.vy > -30)) {
          st.rockets.splice(i, 1);
          st.ignitions.push({ x: r.x, y: Math.max(r.y, r.plan.apexY - 4), t: 0, plan: r.plan, f150: false, f250: false });
        }
      }

      /* Ignition staging: flash (0-80ms) -> core (to 250ms) -> two shell
         waves at 150ms and 250ms. The projectile visibly becomes the burst. */
      for (let i = st.ignitions.length - 1; i >= 0; i--) {
        const ig = st.ignitions[i];
        ig.t += dt * 1000;
        if (!ig.f150 && ig.t >= 150) {
          ig.f150 = true;
          fireShell(ig.x, ig.y, ig.plan, 0.7);
        }
        if (!ig.f250 && ig.t >= 250) {
          ig.f250 = true;
          fireShell(ig.x, ig.y, ig.plan, 0.3);
          st.ignitions.splice(i, 1);
        }
      }

      /* Rays: expand fast, drag down, droop under gravity, fade out. */
      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        p.life += dt * 1000;
        if (p.life >= p.max) {
          st.parts.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        if (p.sway) p.vx += Math.sin((p.life / 1000) * 2.2 + p.swayPh) * p.sway * dt;
        const k = Math.pow(p.retention, dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.droplet && p.life < p.max * 0.55 && Math.random() < p.droplet && st.parts.length < MAX_PARTS) {
          st.parts.push({
            x: p.x, y: p.y,
            vx: p.vx * 0.08 + rand(-8, 8),
            vy: p.vy * 0.08 + rand(-6, 10),
            life: 0, max: rand(500, 1100),
            retention: 0.9, gravity: p.gravity * 0.9,
            tail: 0.02, lenMul: 0.45,
            size: p.size * 0.55, bright: p.bright * 0.6,
            sprite: p.sprite, flick: false,
            ember: true, drop: true, droplet: 0, sway: 0, swayPh: 0,
            maxLen: 14, off: p.off,
          });
        }
      }
      /* Over budget the cooling fragments go first — never live rays. */
      if (st.parts.length > MAX_PARTS) {
        for (let i = 0; i < st.parts.length && st.parts.length > MAX_PARTS;) {
          const p = st.parts[i];
          if (p.drop || (p.ember && p.life > p.max * 0.5)) st.parts.splice(i, 1);
          else i++;
        }
        if (st.parts.length > MAX_PARTS) st.parts.splice(0, st.parts.length - MAX_PARTS);
      }

      for (let i = st.smoke.length - 1; i >= 0; i--) {
        const s = st.smoke[i];
        s.t += dt;
        if (s.t >= s.dur) st.smoke.splice(i, 1);
      }
      for (let i = st.halos.length - 1; i >= 0; i--) {
        const hl = st.halos[i];
        hl.t += dt;
        if (hl.t >= hl.dur) st.halos.splice(i, 1);
      }
      for (let i = st.bursts.length - 1; i >= 0; i--) {
        if (now - st.bursts[i].at > 3000) st.bursts.splice(i, 1);
      }

      /* Distant sparks: the sky always has a faint pulse of life. */
      if (st.twinkles.length < 5 && Math.random() < dt * 0.3) {
        st.twinkles.push({ x: Math.random() * st.w, y: rand(0.05, 0.6) * st.h, t: 0, dur: rand(800, 1400) / 1000, ph: Math.random() * TAU });
      }
      for (let i = st.twinkles.length - 1; i >= 0; i--) {
        const t = st.twinkles[i];
        t.t += dt;
        if (t.t >= t.dur) st.twinkles.splice(i, 1);
      }
    };

    /* --------------------------- rendering ----------------------------- */
    const rayAlpha = (p) => {
      const t = p.life / p.max;
      if (t < 0.05) return t / 0.05;
      if (p.ember) {
        if (t < 0.08) return t / 0.08;
        return Math.pow(1 - (t - 0.08) / 0.92, 0.7);
      }
      if (t < 0.2) return 1;
      const u = (t - 0.2) / 0.8;
      return Math.pow(1 - u, 1.8);
    };

    const draw = (now) => {
      setBase();
      ctx.clearRect(0, 0, st.w, st.h);
      ctx.globalCompositeOperation = 'source-over';
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;

      ctx.globalCompositeOperation = 'lighter';
      drawHorizonWarmth();

      /* atmospheric halos: the sky itself catches the explosion */
      for (let i = 0; i < st.halos.length; i++) {
        const hl = st.halos[i];
        const t = Math.min(1, hl.t / hl.dur);
        const r = hl.r0 + (hl.r1 - hl.r0) * (1 - (1 - t) * (1 - t));
        const a = Math.sin(Math.PI * Math.min(1, t * 1.1)) * hl.a;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        const spr = hl.red ? redHaloC : goldHaloC;
        ctx.drawImage(spr, hl.x - r, hl.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      /* smoke: barely-there haze that catches the burst light */
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < st.smoke.length; i++) {
        const s = st.smoke[i];
        const t = Math.min(1, s.t / s.dur);
        const r = s.r0 + (s.r1 - s.r0) * (1 - (1 - t) * (1 - t));
        const a = Math.sin(Math.PI * t) * 0.1 * s.a * (s.tint ? 1.3 : 1);
        if (a <= 0.002) continue;
        ctx.globalAlpha = a;
        const spr = s.tint === 'red' ? redSmokeC : s.tint ? warmSmokeC : smokeSpriteC;
        ctx.drawImage(spr, s.x + s.drift * t - r, s.y - r, r * 2, r * 2);
      }

      ctx.globalCompositeOperation = 'lighter';

      /* staged ignition: white flash, then the glowing core */
      for (let i = 0; i < st.ignitions.length; i++) {
        const ig = st.ignitions[i];
        const boost = (ig.plan.type.coreBoost || 1) * (ig.plan.size.key === 'small' ? 1 : 1.35);
        if (ig.t < 80) {
          const r = ig.plan.radius * 0.16 * boost;
          ctx.globalAlpha = (1 - ig.t / 80) * 0.95;
          ctx.drawImage(flashSpriteC, ig.x - r, ig.y - r, r * 2, r * 2);
        }
        if (ig.t < 250) {
          const u = ig.t / 250;
          const r = ig.plan.radius * (0.1 + 0.12 * u) * boost;
          ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.85;
          ctx.drawImage(headGlow, ig.x - r, ig.y - r, r * 2, r * 2);
        }
      }

      /* rockets: one bright head on a thin irregular golden line */
      for (let i = 0; i < st.rockets.length; i++) {
        const r = st.rockets[i];
        const off = DEPTHS[r.plan.depth].off;
        const ox = px * off;
        const oy = py * off;
        const n = r.hist.length / 2;
        if (n < 2) continue;
        ctx.lineCap = 'round';
        /* The trail breathes a little — a burning fuse, not a vector line. */
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(now / 47 + r.ph * 3);
        for (let j = 1; j < n; j++) {
          const a = j - 1;
          ctx.strokeStyle = `rgba(247,211,106,${TAIL_A[a]})`;
          ctx.lineWidth = TAIL_W[a] * DEPTHS[r.plan.depth].scale;
          ctx.beginPath();
          ctx.moveTo(r.hist[(j - 1) * 2] + ox, r.hist[(j - 1) * 2 + 1] + oy);
          ctx.lineTo(r.hist[j * 2] + ox, r.hist[j * 2 + 1] + oy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const hx = r.hist[(n - 1) * 2] + ox;
        const hy = r.hist[(n - 1) * 2 + 1] + oy;
        const flick = 0.85 + 0.15 * Math.sin(now / 13 + hx);
        const hr = 7 * DEPTHS[r.plan.depth].scale * flick;
        ctx.drawImage(headGlow, hx - hr, hy - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#fffdf4';
        ctx.beginPath();
        ctx.arc(hx, hy, 1.6 * DEPTHS[r.plan.depth].scale * flick, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* rays: one rotated stretched sprite each, depth-parallaxed */
      const dpr = st.dpr;
      for (let i = 0; i < st.parts.length; i++) {
        const p = st.parts[i];
        let a = rayAlpha(p) * p.bright;
        if (a <= 0.01) continue;
        if (p.flick) a *= 0.4 + 0.6 * Math.random();
        if (a > 0.95) a = 0.95;
        const speed = Math.hypot(p.vx, p.vy);
        let len = speed * p.tail * p.lenMul;
        if (len < 2.5) len = 2.5;
        if (len > p.maxLen) len = p.maxLen;
        const ang = Math.atan2(p.vy, p.vx);
        const co = Math.cos(ang);
        const si = Math.sin(ang);
        const ox = px * p.off;
        const oy = py * p.off;
        const hh = p.size;
        ctx.globalAlpha = a;
        ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * (p.x + ox), dpr * (p.y + oy));
        ctx.drawImage(p.sprite, -len, -hh, len, hh * 2);
      }
      setBase();

      /* distant sparks, faint */
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < st.twinkles.length; i++) {
        const t = st.twinkles[i];
        const u = t.t / t.dur;
        ctx.globalAlpha = Math.sin(Math.PI * u) * 0.25;
        ctx.fillStyle = '#ffe9bb';
        ctx.fillRect(t.x + px - 1, t.y + py - 1, 2, 2);
      }

      setBase();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /* ---------------------------- director -----------------------------
       One beautiful firework, its full lifecycle, then the next — usually
       with company. The loop never ends and never repeats a fixed order. */
    const sceneOf = () => ({
      w: st.w,
      h: st.h,
      rockets: st.rockets.map((r) => ({ x: r.x })),
      bursts: st.bursts,
      lastLane: st.lastLane,
      lastType: st.lastType,
      lastLargeAt: st.lastLargeAt,
      lastSpectacularAt: st.lastSpectacularAt,
      recentBins: st.recentBins,
    });

    const activeMajors = (now) =>
      st.rockets.length + st.bursts.filter((b) => now - b.at < 1200 && b.major).length;

    const frame = (now) => {
      st.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.034, Math.max(0, (now - st.last) / 1000));
      st.last = now;

      if (!st.paused) {
        const finaleWindow = now - st.lastFinaleAt < 2500;
        const limit = finaleWindow ? 3 : MAX_MAJOR;

        for (let i = st.queue.length - 1; i >= 0; i--) {
          const q = st.queue[i];
          if (now >= q.at) {
            st.queue.splice(i, 1);
            /* Queued shells still respect the hard concurrency ceiling. */
            if (activeMajors(now) > (isMobile ? 2 : isTablet ? 3 : 4)) {
              st.queue.push({ ...q, at: now + 400, retries: q.retries });
              continue;
            }
            const avoid = q.finale ? (st.lastFinaleX ?? q.avoidX) : q.avoidX;
            const opts = {};
            if (avoid != null) opts.avoidX = avoid;
            if (q.forceLane != null) opts.forceLane = q.forceLane;
            if (q.forceSize) opts.forceSize = q.forceSize;
            if (q.forceType) opts.forceType = q.forceType;
            const plan = planShot(sceneOf(), now, opts);
            if (plan) {
              if (q.finale) {
                st.lastFinaleX = plan.x0;
                st.lastFinaleAt = now;
              }
              launch(plan);
              st.lastEventAt = now;
            } else if (q.retries > 0) {
              st.queue.push({ ...q, at: now + 350, retries: q.retries - 1 });
            }
          }
        }

        if (now >= st.nextAt && activeMajors(now) < limit) {
          st.nextAt = now + nextGap();
          const plan = planShot(sceneOf(), now);
          if (plan) {
            launch(plan);
            st.lastEventAt = now;
            const roll = Math.random();
            if (!isMobile && roll < 0.05 && now - st.lastFinaleAt > 60000) {
              /* Celebration: big gold left, red+gold right, small yellow
                 behind — staggered, spread, then silence. */
              st.lastFinaleAt = now;
              st.lastFinaleX = plan.x0;
              st.queue.push({ at: now + 300, forceLane: 0.15, forceSize: 'large', forceType: 'chrys', finale: true, retries: 2 });
              st.queue.push({ at: now + 750, forceLane: 0.85, forceSize: 'large', forceType: 'redgold', finale: true, retries: 2 });
              st.queue.push({ at: now + 1200, forceSize: 'small', forceType: 'peony', finale: true, retries: 2 });
            } else if (roll < 0.3 && !isMobile) {
              /* Companion from the far side, half a beat later. */
              st.queue.push({ at: now + rand(300, 700), avoidX: plan.x0, retries: 1 });
              if (roll < 0.08) {
                st.queue.push({ at: now + rand(800, 1300), avoidX: plan.x0, retries: 1 });
              }
            } else if (roll < 0.38 && isMobile) {
              st.queue.push({ at: now + rand(400, 800), avoidX: plan.x0, retries: 1 });
            }
          } else {
            st.nextAt = now + rand(300, 500);
          }
        }

        /* Idle watchdog: the sky is never empty for long. */
        if (now - st.lastEventAt > 6000) {
          const plan = planShot(sceneOf(), now);
          if (plan) {
            launch(plan);
            st.lastEventAt = now;
          } else {
            st.nextAt = now + 300;
          }
        }

        step(dt, now);
      }
      draw(now);
    };

    /* ------------------------------ wiring ---------------------------- */
    resize();

    /* Reduced motion: one beautiful static night sky, no loop. */
    if (reduced) {
      const renderStatic = () => {
        setBase();
        ctx.clearRect(0, 0, st.w, st.h);
        ctx.globalCompositeOperation = 'lighter';
        drawHorizonWarmth();
        ctx.fillStyle = '#ffe9bb';
        for (let i = 0; i < 26; i++) {
          ctx.globalAlpha = rand(0.06, 0.2);
          ctx.fillRect(Math.random() * st.w, rand(0.04, 0.6) * st.h, 2, 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      };
      renderStatic();
      const ro = new ResizeObserver(() => {
        resize();
        renderStatic();
      });
      ro.observe(root);
      return () => ro.disconnect();
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(root);

    const setPaused = (p) => {
      st.paused = p;
      if (p) {
        clearScene();
        return;
      }
      st.last = performance.now();
      st.nextAt = st.last + rand(600, 1200);
      st.lastEventAt = st.last;
    };

    let inView = true;
    const onVis = () => {
      const ok = document.visibilityState === 'visible' && inView;
      setPaused(!ok);
    };
    document.addEventListener('visibilitychange', onVis);

    let io;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          inView = entries[0]?.isIntersecting !== false;
          onVis();
        },
        { threshold: 0.01 }
      );
      io.observe(root);
    }

    /* Opening shell, then the director owns the sky forever. */
    st.last = performance.now();
    st.nextAt = st.last + 700;
    st.lastEventAt = st.last;
    st.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(st.raf);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      clearScene();
    };
  }, [reduced, isMobile, isTablet]);

  /* ------------------------- mouse parallax --------------------------
     Pointer input never touches the physics — it only offsets the drawn
     layers by a few pixels each. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || !canParallax) return undefined;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const apply = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      pointerRef.current.x = cx;
      pointerRef.current.y = cy;
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
        raf = requestAnimationFrame(apply);
      } else {
        raf = 0;
      }
    };
    const onMove = (e) => {
      const r = root.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      root.style.setProperty('--mouse-x', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      root.style.setProperty('--mouse-y', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    root.addEventListener('mousemove', onMove);
    return () => {
      root.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced, canParallax]);

  return (
    <div ref={rootRef} className="fx-hero" role="img" aria-label="Crackers Hyderabad fireworks celebration">
      <div aria-hidden="true" className="fx-bg" />
      <div aria-hidden="true" className="fx-mouselight" />
      <canvas aria-hidden="true" ref={canvasRef} className="fx-canvas" />

      <div className="fx-content">
        <p className="fx-eyebrow fx-rise" style={{ '--d': '0.15s' }}>
          <span>PREMIUM FIREWORKS STORE</span>
        </p>
        <h1 className="fx-title fx-rise" style={{ '--d': '0.3s' }} aria-label="Crackers Hyderabad">
          <span className="fx-title-crackers">Crackers</span>
          <span className="fx-title-hyd">Hyderabad</span>
        </h1>
        <p className="fx-sub fx-rise" style={{ '--d': '0.45s' }}>
          PREMIUM FIREWORKS&nbsp;&nbsp;•&nbsp;&nbsp;HYDERABAD
        </p>
        <div className="fx-ctas fx-rise" style={{ '--d': '0.6s' }}>
          <Link to="/products" className="fx-btn-primary">
            <ShoppingBag className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
            <span>SHOP NOW</span>
          </Link>
        </div>
      </div>

      <div aria-hidden="true" className="fx-grade" />
    </div>
  );
};

export default FireworksHero;
