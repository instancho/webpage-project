# Project Brief: Landing Page with Glass UI

**Repo:** https://github.com/instancho/webpage-project
**Figma:** [Get link from design team]
**Deployed:** Render (Static Site)

---

## Tech Stack (Recommended for Production)

| Layer | Tool | Why |
|-------|------|-----|
| Framework | **Next.js** or **Astro** | SSG, image optimization, component structure |
| Smooth scroll | **Lenis** | Inertia-based smooth scrolling, pairs with GSAP |
| Scroll animations | **GSAP + ScrollTrigger** | Scroll-to-animation mapping, pinning, scrubbing |
| PNG scroll sequence | **Canvas API** | Best performance for frame-by-frame rendering |
| Styling | **Tailwind CSS** or **CSS Modules** | Current prototype is vanilla CSS — migrate as needed |
| Font | **Hashgraph-Title.ttf** | Custom font, loaded via @font-face |

---

## What's Built (Prototype)

The current prototype is vanilla HTML/CSS/JS. It establishes all visual specs, interactions, and effects. Use it as the **pixel-perfect reference** alongside Figma.

### 1. Hero Section
- Full-screen background image (`assets/bg.png`), `background-size: cover`
- Black overlay at 50% opacity

### 2. Outline Frame (Fixed)
- Chamfered corner rectangle, fixed on screen during scroll
- SVG path generated dynamically via JS to maintain pixel-accurate corner sizes at any viewport
- Corner specs: top-left 4px rounded, top-right 46x45px diagonal, bottom-right 31x40px diagonal, bottom-left 35x45px diagonal
- Stroke: `#ffffff`, 20% opacity, 1.5px
- Figma source SVG for the frame is in the codebase (viewBox 1403x877)

### 3. SOUND ON Button (Bottom Left)
- **Irregular shape** — exported as SVG path from Figma, applied via `clip-path: path()`
- Glass texture (Figma Glass settings: Light 45deg 80%, Refraction 9, Depth 23, Dispersion 42, Frost 25, Splay 37)
- CSS implementation: `backdrop-filter: blur(10px)`, layered gradients for light/depth/dispersion, noise texture via SVG feTurbulence filter
- Fill: `#000000` at 70% idle, 100% hover
- Border: 2px SVG stroke with `linearGradient` (white, fading from 50% to 3% opacity at 45deg)
- **Hover: gradient stroke angle follows cursor** (JS: mouse position -> atan2 -> lerp -> update SVG gradient x1/y1/x2/y2 via requestAnimationFrame)
- Hover: translate 1px right + 1px down
- Speaker icon inline SVG, white, 18x18

### 4. CHAT WITH US Button (Bottom Right)
- Same glass/stroke treatment as SOUND ON, mirrored shape
- Hover: translate 1px left + 1px down
- Chat icon inline SVG, white, 18x18

### 5. Nav Buttons (CENTER — HOME, ABOUT, PRODUCTS, REACH)
- **Standard rounded rectangles** — `border-radius: 8px`, no SVG paths needed
- Transparent background idle, `rgba(0,0,0,0.15)` on hover
- Glass settings (Figma: Light -45deg 80%, Refraction 0, Depth 12.38, Dispersion 50, Frost 12.38, Splay 13) — very subtle, near-transparent gradients
- `backdrop-filter: blur(5px)`
- Border: 1px `conic-gradient` stroke via CSS mask technique (::after pseudo-element), 50% opacity idle, 100% hover
- **Hover: conic-gradient angle follows cursor** (JS: same lerp logic, updates CSS custom property `--shine-angle`)
- Inner shadow: `inset 0 1px 2px rgba(0,0,0,0.3)` idle, deepens to `inset 0 1px 6px rgba(0,0,0,0.35)` on hover
- Drop shadow: `0px 3.3px 9.16px rgba(0,0,0,0.39)`
- Active section button: slightly darker fill (0.12), thicker border (1.5px), brighter border (80% opacity)
- Font: Hashgraph, 10px, 500 weight, 1.5px letter-spacing, uppercase
- Icons: 14x14px, white SVG, loaded from `assets/icons/`
- Gap between nav buttons: 56px

### 6. CONTACT US Button
- Solid white fill, black text
- `border-radius: 8px`
- Same drop shadow as other nav buttons
- Icon: contact.svg with `filter: invert(1)` to make it dark
- Hover: `#f0f0f0`

### 7. Progress Bar
- Sits ON the frame's bottom stroke line (fixed, `bottom: 24px`)
- White fill bar, 1.5px height
- Starts from the first marker's left edge (under HOME)
- Width driven by scroll position (0% at top, 100% at bottom)
- 5x5px white square markers positioned below each nav button (bottom edge touches frame stroke)
- Markers: 20% opacity idle, 100% white when progress fill reaches them
- 18px gap between markers and nav buttons above

---

## What Needs to Be Built

### A. PNG Scroll Sequence (Hero Section)
**This is the main development task.**

The hero section background should be a scroll-driven PNG (or WebP) frame sequence — like Apple's product pages.

**Implementation approach:**
1. Use `<canvas>` element sized to viewport
2. Preload all frames using `new Image()` + Promise.all
3. Use **GSAP ScrollTrigger** to pin the hero section and scrub through frames
4. Map scroll progress to frame index: `Math.floor(progress * (totalFrames - 1))`
5. Draw current frame to canvas via `ctx.drawImage()`
6. Use **Lenis** for smooth scroll input

**Performance requirements:**
- Preload frames before section is visible (intersection observer)
- Use WebP over PNG where possible (30-50% smaller)
- Resize frames to actual display dimensions, not source resolution
- Provide lower-res frames for mobile
- Target 60fps playback

**GSAP ScrollTrigger setup:**
```js
gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.create({
  trigger: ".hero",
  start: "top top",
  end: "+=3000",          // scroll distance for full sequence
  pin: true,
  scrub: 0.5,             // smooth scrubbing
  onUpdate: (self) => {
    const frameIndex = Math.floor(self.progress * (totalFrames - 1));
    ctx.drawImage(frames[frameIndex], 0, 0, canvas.width, canvas.height);
  }
});
```

**Lenis setup:**
```js
const lenis = new Lenis({ lerp: 0.1 });

lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);
```

### B. Section Content
- 5 sections: HOME (hero), ABOUT, PRODUCTS, REACH, CONTACT
- Each section is currently a placeholder `100vh` div
- Design content per Figma specs for each section

### C. Header / Top Bar
- Not yet implemented
- From Figma: LOGO (left), EN language selector (right), CONTACT US button (right)
- Should be fixed, inside the frame's top area

### D. Hero Text
- Not yet implemented
- Large centered text: "FROM FOOD AND AGRICULTURE TO INDUSTRIAL AND CONSUMER GOODS"
- Font: Hashgraph, white, uppercase, centered

### E. Nav Button Click → Scroll to Section
- Clicking a nav button should smooth-scroll to the corresponding section
- Use Lenis `scrollTo()` for smooth navigation

### F. Mobile Responsiveness
- Current prototype is desktop-only
- Nav buttons may need to collapse into a hamburger or simplified layout on mobile
- Frame outline may need adjusted insets on smaller screens
- Side buttons (SOUND ON, CHAT WITH US) may need repositioning

### G. Sound Toggle
- SOUND ON button should toggle background audio/ambient sound
- Implement play/pause with icon swap (speaker on/off)

---

## File Structure

```
webpage-project/
  index.html          -- Full prototype with all interactions
  style.css           -- All styles, glass effects, animations
  assets/
    bg.png            -- Hero background image
    Hashgraph-Title.ttf -- Custom font
    icons/
      home.svg
      about.svg
      products.svg
      reach.svg
      contact.svg
```

---

## Key Technical Patterns to Preserve

1. **Irregular button shapes** — Use `clip-path: path()` with SVG paths from Figma. This clips the backdrop-filter AND constrains hover/click area to the shape.

2. **Glass texture** — Layered CSS gradients (light, depth, dispersion) + `backdrop-filter: blur()` + SVG feTurbulence noise. Do NOT export glass as a flat image — it must be a live CSS effect.

3. **Gradient border on rounded rects** — CSS mask technique with `::after` pseudo-element. `border-image` doesn't work with `border-radius`.

4. **Cursor-following shine** — JS tracks mouse position relative to button center, calculates angle via `atan2`, lerps toward target angle at 0.08 rate using `requestAnimationFrame`. For SVG buttons: updates gradient x1/y1/x2/y2. For CSS buttons: updates `--shine-angle` custom property on a `conic-gradient`.

5. **Responsive frame outline** — JS generates SVG path with fixed pixel corner sizes on resize, not a stretched viewBox. This keeps chamfer angles accurate at any viewport.

6. **Progress bar** — Marker positions are calculated from nav button centers via `getBoundingClientRect()`. Progress fill width is driven by scroll ratio.

---

## Figma Glass Settings Reference

| Element | Light | Refraction | Depth | Dispersion | Frost | Splay |
|---------|-------|------------|-------|------------|-------|-------|
| Side buttons (SOUND ON, CHAT WITH US) | 45deg, 80% | 9 | 23 | 42 | 25 | 37 |
| Nav buttons (HOME, ABOUT, etc.) | -45deg, 80% | 0 | 12.38 | 50 | 12.38 | 13 |

---

## Dependencies to Install

```bash
npm install gsap lenis
```

Or via CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@latest/dist/lenis.min.js"></script>
```
