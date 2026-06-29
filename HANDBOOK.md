# Developer Handbook: Yiwu Anchang Landing Page

**Repo:** https://github.com/instancho/webpage-project
**Stack:** Vanilla HTML/CSS/JS + GSAP + Lenis + Liquid Glass
**Deployed:** Render (Static Site — no build command, publish dir `.`)

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Tech Stack & Dependencies](#tech-stack--dependencies)
3. [Font](#font)
4. [Color Palette](#color-palette)
5. [Frame Outline](#frame-outline)
6. [Canvas Scroll Sequence](#canvas-scroll-sequence)
7. [Image Optimization Pipeline](#image-optimization-pipeline)
8. [Glass Effects](#glass-effects)
9. [Liquid Glass (iOS 26 Style)](#liquid-glass-ios-26-style)
10. [Button System](#button-system)
11. [Navigation Buttons](#navigation-buttons)
12. [Contact Us Button (Top Right)](#contact-us-button-top-right)
13. [Hero Text Animation](#hero-text-animation)
14. [Progress Bar](#progress-bar)
15. [Scroll Architecture (GSAP + Lenis)](#scroll-architecture-gsap--lenis)
16. [Hover Effects](#hover-effects)
17. [Mobile Responsive](#mobile-responsive)
18. [Z-Index Stack](#z-index-stack)
19. [Browser Compatibility](#browser-compatibility)
20. [Known Issues & Notes](#known-issues--notes)
21. [Future Development](#future-development)

---

## Project Structure

```
webpage-project/
  index.html                  -- Single-page app, all HTML + inline JS
  style.css                   -- All styles including mobile responsive
  PROJECT-BRIEF.md            -- Original project brief for developer handoff
  HANDBOOK.md                 -- This file
  assets/
    bg.png                    -- Original hero background (unused, replaced by frames)
    Hashgraph-Title.ttf       -- Custom font
    Logo.svg                  -- Desktop logo (full wordmark)
    Logo-mobile.svg           -- Mobile logo (icon only)
    icons/
      home.svg                -- 10x10 SVG, stroke-width 1
      about.svg               -- 10x10 SVG, stroke-width 1
      products.svg            -- 10x10 SVG, stroke-width 1
      reach.svg               -- 10x10 SVG (fill-based)
      contact.svg             -- 10x10 SVG (fill-based)
    frames-webp/
      0001.webp ... 0300.webp -- 300 scroll animation frames (960x540, q85 WebP, 11MB total)
```

---

## Tech Stack & Dependencies

| Tool | Purpose | Loaded via |
|------|---------|------------|
| **GSAP 3** | Scroll-driven animations (ScrollTrigger) | CDN: `cdn.jsdelivr.net/npm/gsap@3` |
| **GSAP ScrollTrigger** | Scrub-based scroll-to-animation mapping | CDN (same) |
| **Lenis** | Smooth inertia scrolling | CDN: `unpkg.com/lenis@1` |
| **Liquid Glass** | iOS 26 refraction effect | Inlined from [archisvaze/liquid-glass](https://github.com/archisvaze/liquid-glass) |
| **pngquant** | PNG compression (lossy, visually lossless) | CLI tool (`brew install pngquant`) |
| **cwebp** | PNG to WebP conversion | CLI tool (part of `webp` package) |

### CDN URLs
```html
<link rel="stylesheet" href="https://unpkg.com/lenis@1/dist/lenis.css">
<script src="https://unpkg.com/lenis@1/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
```

---

## Font

- **Name:** Hashgraph Title
- **File:** `assets/Hashgraph-Title.ttf`
- **Format:** TrueType
- **Usage:** All UI text (buttons, labels, hero text, nav)
- **Loaded via:** `@font-face` in CSS

---

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Orange | `#F95303` | Contact button fill, text cursor highlight |
| White | `#FFFFFF` | Text, borders, icons |
| Black | `#000000` | Button fills, backgrounds |
| Frame stroke | `#FFFFFF` @ 20% opacity | Outline box border |

---

## Frame Outline

The decorative border frame around the viewport.

### Shape
- **Figma source:** 1403x877 SVG with chamfered corners
- **Implementation:** JS-generated SVG path with fixed pixel corner sizes, recalculated on resize
- **NOT using `preserveAspectRatio="none"`** — that distorts angles. Instead, JS computes path coordinates from actual container dimensions

### Corner Specs (fixed pixels)
| Corner | Type | Size (px) |
|--------|------|-----------|
| Top-left | 4px rounded (bezier) | `r = 4` |
| Top-right | Diagonal chamfer | `46px × 45px` |
| Bottom-right | Diagonal chamfer | `31px × 40px` |
| Bottom-left | Diagonal chamfer | `35px × 45px` |

### CSS
```css
.frame {
  position: fixed;
  inset: 24px;        /* desktop */
  z-index: 5;
  pointer-events: none;
}
```
Mobile: `inset: 16px`

### Stroke
- Color: `#FFFFFF`
- Opacity: 20% (`stroke-opacity="0.2"`)
- Width: `1.5px`
- `vector-effect="non-scaling-stroke"` not used (JS handles sizing)

---

## Canvas Scroll Sequence

### Overview
300 PNG frames (960x540) rendered on a `<canvas>` element, driven by scroll position via GSAP ScrollTrigger.

### Architecture
1. Canvas is `position: fixed`, fills viewport
2. Hero section is `400vh` tall — provides scroll distance for the full sequence
3. ScrollTrigger maps scroll progress (0-1) to frame index (0-299)
4. `ctx.drawImage()` with **cover/crop** logic (not stretch)

### Cover/Crop Logic
```javascript
// Calculate source rect to maintain aspect ratio (like background-size: cover)
if (canvasRatio > imgRatio) {
  sw = iw; sh = iw / canvasRatio;
  sx = 0; sy = (ih - sh) / 2;
} else {
  sh = ih; sw = ih * canvasRatio;
  sx = (iw - sw) / 2; sy = 0;
}
ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
```

### First Frame Loading
Frame 0001 is loaded with a dedicated `onload` callback to ensure immediate rendering — prevents black screen on page load.

### ScrollTrigger Config
```javascript
ScrollTrigger.create({
  trigger: '.hero',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 0.5,
  onUpdate: function(self) {
    var frameIndex = Math.min(Math.floor(self.progress * TOTAL_FRAMES), TOTAL_FRAMES - 1);
    drawFrame(frameIndex);
  }
});
```

---

## Image Optimization Pipeline

### Process
1. **Source:** PNG frames from Blender/After Effects (960x540, RGBA)
2. **Step 1 — pngquant:** `pngquant --quality=85-100 --speed 1 --ext .png --force *.png`
   - Lossy but visually lossless, ~70% reduction
3. **Step 2 — cwebp:** `cwebp -q 85 input.png -o output.webp`
   - Additional ~60% reduction over compressed PNG

### Results
| Stage | Size |
|-------|------|
| Original PNG (300 frames) | 202MB |
| After pngquant | 62MB |
| After WebP (q85) | 11MB |
| **Total reduction** | **95%** |

### Quality Notes
- `q85` WebP is indistinguishable from original at 960x540
- Below `q80` shows compression artifacts on dark gradients
- `q95` gives 29MB if higher quality is needed

---

## Glass Effects

### Two glass systems are used:

#### 1. CSS Glass (Nav Buttons — Figma Glass Settings)
Layered CSS gradients simulating Figma's glass texture.

**Nav button settings (from Figma):**
| Setting | Value | CSS |
|---------|-------|-----|
| Light | -45°, 80% | `linear-gradient(-45deg, ...)` very subtle (2-3% opacity) |
| Refraction | 0 | None |
| Depth | 12.38 | Edge shading gradient |
| Dispersion | 50 | Chromatic fringe (blue/warm tint at edges) |
| Frost | 12.38 | `backdrop-filter: blur(5px)` |
| Splay | 13 | Tight gradient stops |

**Side button settings (SOUND ON / CHAT WITH US):**
| Setting | Value |
|---------|-------|
| `--glass-blur` | 6 |
| `--glass-tint` | 0.08 |
| `--glass-shadow` | 0.25 |
| Base fill | `rgba(0, 0, 0, 0.25)` |

#### 2. Liquid Glass (iOS 26 Style — All Buttons)
Physics-based refraction from [archisvaze/liquid-glass](https://github.com/archisvaze/liquid-glass).

**Locked settings:**
| Setting | Value |
|---------|-------|
| Thickness | 100 |
| Bezel | 8 |
| IOR | 1.0 |
| Blur | 3.1 |
| Specular | 0.1 |
| Tint | 0% |
| Shadow | 0.15 |
| Border Width | 0.75px |
| Shine | 0.55 |
| Idle Opacity | 1 |

---

## Liquid Glass (iOS 26 Style)

### How It Works
1. **Displacement map** generated on `<canvas>` — encodes refraction vectors per-pixel
2. **Specular map** generated similarly — light reflection highlights
3. Both fed into SVG `<filter>` with `feDisplacementMap`
4. Applied via `backdrop-filter: url(#filter-id)` on a `::before` pseudo-element

### Key Functions (inlined in JS)
- `calcRefractionProfile()` — Snell's law refraction through convex squircle surface
- `genDisplacementMap()` — Canvas-based displacement texture
- `genSpecularMap()` — Canvas-based specular highlight texture
- `initLiquidGlass()` — Generates unique SVG filters per button (different widths need different maps)

### Per-Button Filters
Each `.liquid-glass` element gets its own `<filter id="liquid-glass-filter-N">` because displacement maps must match element dimensions exactly. The JS iterates all `.liquid-glass` elements and builds filters individually.

### Side Button Overrides
Side buttons (`.glass-btn`) use CSS custom properties for stronger glass:
```css
.glass-btn {
  --glass-blur: 6;    /* vs 3.1 default */
  --glass-tint: 0.08; /* vs 0 */
  --glass-shadow: 0.25; /* vs 0.15 */
}
```

### Browser Compatibility
- **Chrome/Chromium:** Full SVG backdrop-filter support
- **Firefox/Safari:** SVG backdrop-filter with `feDisplacementMap` does NOT work — falls back to no refraction, still shows tint/shadow/specular overlay

### Glass Controls Panel
A hidden dev tool (`display: none !important`) for real-time tuning. To re-enable:
1. Remove `style="display:none !important"` from `#glass-controls` and `#gc-toggle` in HTML
2. Adjust sliders — changes apply immediately to all `.liquid-glass` elements
3. Note the final values and hardcode them in `initLiquidGlass()`

---

## Button System

### Side Buttons (SOUND ON / CHAT WITH US)

**Irregular SVG shapes** exported from Figma, applied via `clip-path: path()`.

| Button | Desktop Size | Mobile Size |
|--------|-------------|-------------|
| SOUND ON (left) | 180 × 53px | 149 × 44px |
| CHAT WITH US (right) | 211 × 54px | 160 × 44px |

**Mobile shape adaptation:**
JS swaps clip-path and SVG path data on resize (`updateMobileButtons()` function). Mobile uses proportionally scaled paths with matching corner roundness.

**Border stroke:**
- SVG `<linearGradient>` with **chromatic colors** (pink → sky blue → purple → emerald → amber)
- 6 stops cycling through the spectrum
- Width: 2.5px
- Gradient angle follows cursor on hover via JS (`requestAnimationFrame` lerp loop)

**Hover effects:**
- Left button: `translate(1px, 1px)`
- Right button: `translate(-1px, 1px)`
- Gradient opacity boost: 1.5x

### Icon Sizes
- Side button icons: 18 × 18px (inline SVG)
- Nav button icons: 14 × 14px desktop, 14 × 14px mobile (loaded from `assets/icons/`)

---

## Navigation Buttons

5 buttons: HOME, ABOUT, PRODUCTS, REACH, CONTACT

### Shape
Simple CSS rounded rectangles: `border-radius: 8px`

### Desktop Layout
- Horizontal row, centered in bottom bar
- Gap: 56px between buttons
- Positioned 15px above the progress bar markers
- Font: Hashgraph, 10px, weight 500, letter-spacing 1.5px, uppercase

### Mobile Layout
- Vertical stack on the left side
- `position: fixed; left: 31px; top: 50%; transform: translateY(-50%)`
- Gap: 24px
- Font: 8px

### Sizing
- Desktop: `padding: 8px 14px`
- Mobile: `padding: 6px 12px`

### Border (Conic Gradient Shine)
```css
.glass-nav::after {
  padding: 0.75px;
  background: conic-gradient(
    from var(--shine-angle, 135deg),
    rgba(255,255,255, 0.55) 0deg,
    rgba(255,255,255, 0.1) 60deg,
    rgba(255,255,255, 0.03) 120deg,
    rgba(255,255,255, 0.03) 180deg,
    rgba(255,255,255, 0.1) 300deg,
    rgba(255,255,255, 0.55) 360deg
  );
  /* mask technique for gradient border with border-radius */
}
```

### Active State
- Background: `rgba(0, 0, 0, 0.12)`
- Border: `padding: 0.5px`, `opacity: 0.8`
- Updated via JS based on scroll progress

### Shadow
```css
box-shadow: 0px 3.3px 9.16px rgba(0,0,0,0.39),  /* drop shadow */
            inset 0 1px 2px rgba(0,0,0,0.3),      /* inner top */
            inset 0 -1px 1px rgba(255,255,255,0.04); /* inner bottom highlight */
```
Hover deepens inner shadow to `inset 0 1px 6px rgba(0,0,0,0.35)` + adds outer glow `0 0 12px rgba(255,255,255,0.08)`

---

## Contact Us Button (Top Right)

### Shape
Irregular SVG with diagonal cut on top-right corner, matching the frame's chamfer.

| | Desktop | Mobile |
|--|---------|--------|
| Size | 152 × 46px | 133 × 41px |
| Fill | `#F95303` (solid orange) | Same |
| Position | `top: 32px; right: 39px` | `top: 26px; right: 36px` |

Mobile uses JS-swapped SVG path data (`updateMobileButtons()`).

### Hover
`transform: translate(-1px, 1px)` — same as right side button.

### Font
- Desktop: 12px
- Mobile: 8px

---

## Hero Text Animation

### Content (3 sentences, 3 lines each)
1. "BUILT IN YIWU, WE CONNECT / GLOBAL MARKETS WITH / TRUSTED CHINESE PRODUCTS"
2. "FROM FOOD AND / AGRICULTURE TO INDUSTRIAL / AND CONSUMER GOODS,"
3. "THROUGH QUALITY / ASSURANCE, TRACEABILITY / AND INTELLIGENT SOURCING."

### Animation Type
**Letter-by-letter reveal** tied to scroll progress.

### How It Works
1. On page load, JS splits each `.hero-line` text into individual `<span class="hero-char">` elements
2. Spaces get additional class `is-space` with `white-space: pre`
3. Each sentence gets 1/3 of the hero scroll range
4. Within each segment:
   - **0% – 65%:** Reveal phase — characters appear one at a time
   - **65% – 80%:** Hold phase — all characters visible
   - **80% – 100%:** Exit phase — characters disappear from the end (last first)

### Orange Cursor
The last visible character during reveal/exit is colored `#F95303`. Applied via `ch.style.color`.

### Positioning
- Desktop: `bottom: 20%; padding-bottom: 16px`
- Mobile: `bottom: 14%; width: 90%`

### Font
- Desktop: `clamp(22px, 3.2vw, 42px)`, weight 600, letter-spacing 2px
- Mobile: `clamp(16px, 4.5vw, 26px)`

### Drop Shadow
`filter: drop-shadow(0 2px 12px rgba(0, 0, 0, 0.6))` on `.hero-sentence`

### ScrollTrigger Config
```javascript
ScrollTrigger.create({
  trigger: '.hero',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 0.15,  // tight response
  onUpdate: function(self) { /* letter logic */ }
});
```

---

## Progress Bar

### Desktop (Horizontal)
- Position: fixed on the frame's bottom stroke line (`bottom: 24px`)
- Height: 1.5px
- Fill gradient: `linear-gradient(to right, #ffffff calc(100% - 32px), transparent 100%)`
- Starts from first marker's left edge

### Mobile (Vertical)
- Position: fixed on the frame's left stroke line (`left: 16px`)
- Width: 1.5px
- Fill gradient: `linear-gradient(to bottom, #ffffff calc(100% - 32px), transparent 100%)`

### Square Markers
- Size: 5 × 5px
- Color: `#FFFFFF`
- Idle opacity: 0.2
- Active (progress reaches marker): opacity 1
- Desktop: positioned below each nav button (centered), bottom edge touching frame stroke
- Mobile: positioned to the right of the progress bar, left edge touching frame outline
- Marker positions calculated via `getBoundingClientRect()` in `positionMarkers()` function

---

## Scroll Architecture (GSAP + Lenis)

### Lenis Setup
```javascript
const lenis = new Lenis({ lerp: 0.1 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(function(time) { lenis.raf(time * 1000); });
gsap.ticker.lagSmoothing(0);
```

### ScrollTrigger Instances
| Instance | Trigger | Scrub | Purpose |
|----------|---------|-------|---------|
| Frame sequence | `.hero` | 0.5 | Canvas frame rendering |
| Hero text (×3) | `.hero` | 0.15 | Letter-by-letter reveal per sentence |
| Progress bar | `documentElement` | 0.3 | Fill width + marker activation + active nav button |

### Page Structure for Scrolling
```
.hero (400vh) — frame sequence + text animation
#about (100vh) — placeholder
#products (100vh) — placeholder
#reach (100vh) — placeholder
#contact (100vh) — placeholder
```
Total: 800vh scrollable.

---

## Hover Effects

### Cursor-Following Gradient Shine

**How it works (all button types):**
1. `mousemove` listener tracks cursor position relative to button center
2. `Math.atan2(my, mx)` calculates angle from center to cursor
3. Angle is lerped toward target at rate `0.08` (side buttons) or `0.15` (nav buttons) per frame
4. `requestAnimationFrame` loop updates the gradient angle

**Side buttons (SVG gradient):**
- Updates `x1, y1, x2, y2` attributes on `<linearGradient>`
- Chromatic stops brighten by 1.5x on hover

**Nav buttons (CSS conic-gradient):**
- Updates `--shine-angle` CSS custom property
- `::after` pseudo-element opacity goes from `var(--gc-idle, 1)` to `1`

**On mouse leave:**
- Lerps back to default angle (45° for side buttons, 135° for nav buttons)

---

## Mobile Responsive

### Breakpoint
`@media (max-width: 768px)`

### Key Changes
| Element | Desktop | Mobile |
|---------|---------|--------|
| Frame inset | 24px | 16px |
| Logo | Full wordmark (Logo.svg, 41px) | Icon only (Logo-mobile.svg, 36px) |
| Nav layout | Horizontal bottom center | Vertical left side |
| Nav gap | 56px | 24px |
| Nav font | 10px | 8px |
| Progress bar | Horizontal bottom | Vertical left |
| Bottom buttons | Irregular SVG shapes | Scaled-down SVG paths (JS-swapped) |
| Contact button | 152×46 | 133×41 (JS-swapped SVG) |
| Hero text | `clamp(22px, 3.2vw, 42px)` | `clamp(16px, 4.5vw, 26px)` |
| Bottom bar | `left/right: 32px` | `left/right: 30px` |

### JS Shape Swapping
`updateMobileButtons()` detects `window.innerWidth <= 768` and swaps:
- `clip-path` values on `.btn-left` and `.btn-right`
- SVG `width`, `height`, `viewBox`, and `<path d>` attributes
- `.top-contact` SVG dimensions and path
- Restores desktop values on resize above 768px

---

## Z-Index Stack

| Z-Index | Element |
|---------|---------|
| 0 | `#frame-canvas` |
| 1 | `.overlay` (currently `display: none`) |
| 4 | `.hero-text` |
| 5 | `.frame` (outline) |
| 10 | `.bottom-bar`, `.logo`, `.lang-selector`, `.top-contact`, `.nav-buttons` |
| 11 | `.progress-bar` |
| 100-101 | Glass controls panel (hidden) |

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Canvas scroll sequence | Yes | Yes | Yes |
| GSAP + Lenis | Yes | Yes | Yes |
| CSS `backdrop-filter` | Yes | Yes | Yes |
| SVG `backdrop-filter` (liquid glass) | Yes | **No** | **No** |
| `clip-path: path()` | Yes | Yes | Yes |
| CSS `mask-composite` | Yes | Yes | Yes (`-webkit-mask-composite: xor`) |
| `conic-gradient` | Yes | Yes | Yes |

**Critical:** Liquid glass refraction only works in Chromium. For production, consider the WebGL fallback from the liquid-glass repo, or accept graceful degradation (buttons still show tint/shadow/border, just no refraction distortion).

---

## Known Issues & Notes

1. **Liquid glass is Chrome-only** — SVG `backdrop-filter` with `feDisplacementMap` isn't supported in Firefox/Safari
2. **Frame sequence memory** — 300 `Image` objects are held in memory (~50-80MB decoded). On low-memory mobile devices, consider lazy-loading chunks
3. **Glass controls panel** is hidden via `display: none !important` — remove to re-enable for tuning
4. **Icon stroke widths** — `about.svg` and `products.svg` were originally 0.5px (invisible at small sizes), manually bumped to 1px
5. **`overflow-x: hidden`** on body prevents horizontal scroll but allows vertical
6. **Nav marker positioning** uses `setTimeout(positionMarkers, 100)` — DOM must be rendered before measuring. If layout shifts, markers may misalign

---

## Future Development

### Remaining Tasks
- [ ] Section content (ABOUT, PRODUCTS, REACH, CONTACT) — currently placeholder `100vh` divs
- [ ] Header area — LOGO and top elements may need section-specific styling
- [ ] Nav button click → smooth scroll to section (use `lenis.scrollTo()`)
- [ ] Sound toggle functionality on SOUND ON button
- [ ] CHAT WITH US integration (WhatsApp/live chat widget)
- [ ] Language switcher (EN/中文) — actual i18n implementation
- [ ] WebGL fallback for liquid glass on Firefox/Safari
- [ ] Performance audit — consider `IntersectionObserver` for lazy-loading frame chunks
- [ ] Mobile touch interactions — nav shine effect may need `touchmove` handlers
- [ ] SEO — meta tags, Open Graph, structured data
- [ ] Accessibility — ARIA labels, keyboard navigation, reduced motion preference

### Recommended Production Stack
For full production build, consider migrating to:
- **Next.js** or **Astro** — SSG, image optimization, component architecture
- **Tailwind CSS** — utility-first, replaces current vanilla CSS
- **npm packages** for GSAP/Lenis instead of CDN
- **Git LFS** for frame sequences if they grow larger
