# Crackers Hyderabad — Design System

**Direction: Festive Editorial Luxury.** One committed direction, executed cleanly.

Deep maroon and warm ink give the structure. Warm ivory carries the content.
Vermilion is the only action colour. Antique gold is ornament and emphasis —
never a field. Indian motifs (rangoli lattice, diya, arch, filigree) appear at
most **once per section** and always at low opacity.

The storefront is festive. **The admin panel is not** — it uses the same tokens
in an operational register: neutral ink surfaces, dense data, gold reserved for
status only, no ornament.

---

## Hard constraints

These are not stylistic preferences. Breaking one is a bug.

1. **Never change business logic.** Firestore collection names, document
   shapes, field names, order codes, role checks, minimum-order rules, tracking
   codes, email/SMS calls and cart maths stay exactly as they are. This is a
   re-skin, not a rewrite.
2. **Never remove a route or a role guard.** `ProtectedRoute` props
   (`adminOnly`, `adminOrSales`, `staffOnly`) must survive untouched.
3. **No emojis anywhere in the UI.** Use `lucide-react` icons, inline SVG, or
   the ornaments in `components/ui/Ornaments.jsx`.
4. **No new npm dependencies.**
5. **Touch targets ≥ 44 px** on anything tappable.
6. **No horizontal overflow at 320 px.** Wide content goes inside `.scroll-x`
   or `.rail`.
7. **Animate only `transform` and `opacity`.** Never width, height, top, left.
8. **Motion is never the only signal.** Every state animation communicates is
   also carried by colour, text or position.

---

## Tokens

All tokens live in `src/index.css` under `:root` / `.dark`. Prefer them over
literal values. Tailwind scales in `tailwind.config.js` mirror them.

### Colour

| Role | Token | Tailwind | Notes |
|---|---|---|---|
| Action / CTA | `--ember-600` `#C33A14` | `primary-600` | The one action colour |
| Action hover | `--ember-500` `#DF4C21` | `primary-500` | |
| Structure | `--maroon-700` `#761713` | `maroon-700` | Headers, footers, deep panels |
| Deep structure | `--maroon-900` `#3A0B0C` | `maroon-900` | |
| Ornament / emphasis | `--gold-400` `#D2A64F` | `accent-400` | Decoration and large text only |
| Gold text | `--gold-600` `#9E7029` | `accent-600` | Use this for small text on light |
| Warm mid | `--saffron-400` `#F7AE2C` | `saffron-400` | Flame, highlight, dark-mode accent |
| Alert / discount | `--crimson-600` `#CB2A2A` | `vermilion-600` | |
| Success / in stock | `--leaf-600` `#2C7A53` | `leaf-600` | |

> **Contrast trap:** `accent-500` is only ~3.2:1 on white. It is legal for
> ornament and large display text. For small text on a light surface use
> `accent-600` or darker.

### Surfaces and text

`--surface-page` `--surface-card` `--surface-raised` `--surface-sunken`
`--surface-warm` (warm off-white for the cream Products/catalogue ground)
`--hairline` `--hairline-strong`
`--text-strong` `--text-body` `--text-muted` `--text-subtle`

All of these flip automatically under `.dark`. **Use them instead of
`bg-white` / `text-gray-900`** in new work — the compatibility layer at the
bottom of `index.css` only exists to keep untouched legacy markup readable.

### Type

- Display: `var(--font-display)` — Playfair Display
- Body / UI: `var(--font-body)` — Inter
- Poppins has been removed. There must be no `'Poppins'` string left anywhere.

Roles: `.display-title` `.hero-title` `.section-title` `.subsection-title`
`.card-title` `.category-title` `.label-caps` `.tabular`

`.tabular` is required on any number that sits in a column — prices, totals,
order counts.

### Rhythm, radius, elevation

- Sections: `.section-pad` (large) / `.section-pad-sm`
- Container: `.shell` (max 80rem) or `.shell-narrow` (max 56rem) — one width
  everywhere, never a bespoke `max-w-*`
- Radius: `--r-sm|md|lg|xl|2xl|pill`
- Shadow: `--shadow-xs|sm|md|lg|xl`, plus `--shadow-ember` and `--shadow-gold`.
  Shadows are warm-tinted; never use neutral grey shadow.

### Z-index scale

`raised 10` · `sticky 20` · `nav 30` · `overlay 40` · `modal 50` · `toast 60`.
Tailwind: `z-raised z-sticky z-nav z-overlay z-modal z-toast`. No arbitrary
values.

---

## Component classes

Already defined — reuse rather than re-inventing:

**Surfaces** `.card-premium` `.panel-editorial` `.glass-panel` `.glass-strong`
`.glass-card` `.bg-festive`

**Buttons** `.btn-primary` `.btn-outline` `.btn-gold` `.btn-maroon`
`.btn-quiet` (dense admin), `.btn-shine` (sweep — primary action only, one per
view)

**Form** `.input-premium` (supports `aria-invalid="true"`)

**Badges** `.badge` + `.badge-gold|leaf|crimson|ember|neutral`

**Layout** `.shell` `.shell-narrow` `.rail` `.scroll-x` `.section-pad`

**Other** `.section-eyebrow` `.rule-gold` `.ribbon` `.arrow-btn` `.skeleton`
`.nav-link` `.category-card` `.product-img-panel`

---

## Shared React primitives

| Import | Purpose |
|---|---|
| `hooks/useReducedMotion` | Boolean. Gate anything CSS can't reach. |
| `lib/motion` | `pageVariants` `revealVariants` `staggerParent` `modalVariants` `popoverVariants` `sheetVariants` `inViewOnce` `SPRING` `DURATION` |
| `components/ui/ScrollReveal` | Reveal on scroll; `stagger` prop + `ScrollReveal.Item` |
| `components/ui/SectionHeading` | `eyebrow` `title` `subtitle` `align` `action` |
| `components/ui/FireworksCanvas` | Single-canvas ambient fireworks. Self-throttling. Renders nothing under reduced motion. |
| `components/ui/Skeleton` | `Skeleton` `SkeletonText` `ProductCardSkeleton` `ProductGridSkeleton` `ProductDetailSkeleton` `TableSkeleton` `StatCardSkeleton` |
| `components/ui/EmptyState` | `icon` (Lucide component) `title` `description` `action` `tone` |
| `components/ui/AnimatedCounter` | Counts up in view; exact value for screen readers |
| `components/ui/Ornaments` | `Diya` `RangoliDivider` `CornerFiligree` `ArchFrame` |

---

## Motion rules

- **At most one or two focal animations per view.** A single well-staged reveal
  beats twenty hover tricks.
- Entering uses ease-out; leaving uses ease-in.
- Micro-interactions 150–300 ms. Section reveals ~480 ms. Nothing over 900 ms.
- Infinite animation is for loading indicators and ambient atmosphere only —
  never for icons or CTAs demanding attention.
- Every variant helper in `lib/motion` already takes `reduced` as its first
  argument. Pass it. `useReducedMotion()` is the source.

---

## Accessibility floor

- Visible focus on every interactive element (the global style handles it —
  don't remove outlines).
- `aria-label` on every icon-only button.
- Real `<label>` for every input; `aria-invalid` + a text error on failure.
- Loading regions: `role="status"` `aria-live="polite"` `aria-busy`.
- Decorative SVG and ornament: `aria-hidden="true"`.
- Images: meaningful `alt`, or `alt=""` when decorative.
- Never communicate state with colour alone — pair it with an icon or a word.

---

## Responsive

Design explicitly at **320 / 375 / 430 / 768 / 1024 / 1280 / 1440 / 1920**.

- Fluid type via `clamp()` — already baked into the type roles.
- Product grid: 2 columns on mobile (cards must stay legible, never shrink to
  unusable), 3 at `md`, 4 at `lg`.
- Mobile priority order: navigation → hero → CTA → categories → best sellers →
  wholesale → products → offers → footer.
- Reduce animation density on small screens; `FireworksCanvas` already does.
- No hover-only functionality. Anything reachable by hover must also be
  reachable by tap and keyboard.

---

## Copy and claims

Wholesale positioning is wanted: bulk ordering, festival stock for retailers,
competitive pricing, variety, tracking, support, seasonal supply.

**Do not invent claims.** No certifications, licences, safety guarantees,
delivery promises, ratings or review counts that are not already in the data or
already in the existing copy. If a number is not in Firestore, it does not go
on the page.
