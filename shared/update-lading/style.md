# VietSage — Style Guide

## 1. Design direction

**Mood:** premium hospitality, calm, warm, trustworthy, human-friendly.  
Avoid a heavy “dark green corporate” look. The page should feel like a boutique resort / modern concierge product.

Use the two supplied standalone images **as-is**:
- `assets/images/hero-lake-vietsage.png`
- `assets/images/spa-towel.png`

Do **not** create cropped derivative image files. Keep the originals untouched.

## 2. Core palette

| Token | Hex | Use |
|---|---|---|
| `--vs-forest` | `#215744` | brand text, primary icons, CTA |
| `--vs-forest-2` | `#2C5E4B` | hover / premium green blocks |
| `--vs-sage` | `#DDE9D9` | icon chips, soft panels |
| `--vs-sage-2` | `#EEF4EA` | large light sections |
| `--vs-cream` | `#F8F3E7` | page background |
| `--vs-ivory` | `#FFFDF8` | cards, nav |
| `--vs-gold` | `#C69A4A` | tiny luxury accent only |
| `--vs-ink` | `#17382F` | headings |
| `--vs-body` | `#5E6A64` | paragraph copy |
| `--vs-line` | `#E7E0D1` | borders |

**Gold rule:** use sparingly, about 5–10% of visible accents. Never turn the whole page gold/beige.

## 3. Typography

- Headings: `Cormorant Garamond`, `Playfair Display`, or another elegant serif.
- UI/body: `Be Vietnam Pro`, `Inter`, or a clean Vietnamese-capable sans-serif.
- Hero H1 desktop: 64–76 px, line-height 0.98–1.05.
- Section H2: 42–56 px.
- Card title: 18–22 px, semibold.
- Body: 15–17 px, line-height 1.55–1.7.

Use serif for emotional/luxury statements; sans-serif for product UI and operational content.

## 4. Radius and geometry

- Main hero / large section: `32–40px`
- Cards: `22–28px`
- Pills / search / buttons: `999px`
- Icon chip: `18–22px`
- Keep shapes soft and rounded, but not bubbly.

## 5. Shadows

Primary card shadow:

```css
box-shadow:
  0 18px 50px rgba(39, 54, 45, 0.08),
  0 2px 10px rgba(39, 54, 45, 0.05);
```

Hover:

```css
transform: translateY(-3px);
box-shadow:
  0 24px 60px rgba(39, 54, 45, 0.12),
  0 4px 14px rgba(39, 54, 45, 0.06);
```

## 6. Image treatment

### Hero lake
Use the original `hero-lake-vietsage.png`.
- Never export a cropped copy.
- In CSS, keep the source untouched.
- Prefer `object-fit: cover` only as a viewport treatment.
- Position toward the right on desktop so the chair / lake stay visible.
- On mobile, use a separate full-width media block instead of an aggressive crop.

### Spa towel
Use the original `spa-towel.png`.
- Keep natural warm lighting.
- Combine with a light ivory text card or a soft forest/sage overlay.
- Avoid dark-black overlays.

## 7. Sections

Recommended order:

1. Sticky / floating white navigation
2. Hero with lake image
3. Trust / utility row (24/7, QR, instant, multilingual)
4. Concierge assistant panel
5. “Số hóa mọi điểm chạm” feature cards
6. Premium towel banner / “Từ yêu cầu đến hành động”
7. Benefit grid
8. Final CTA
9. Full footer

Alternate large cream and light-sage surfaces. Use one darker muted-green section only for contrast.

## 8. Buttons

Primary:
```css
background: #215744;
color: #fff;
border-radius: 999px;
padding: 14px 22px;
```

Secondary:
```css
background: rgba(255,255,255,.78);
border: 1px solid #E7E0D1;
color: #17382F;
backdrop-filter: blur(14px);
```

Hover:
- primary → `#2C5E4B`
- secondary → subtle sage fill
- 180–240ms ease-out

## 9. Icons

All icons are in `assets/icons/*.svg`.
- Default stroke: `#215744`
- Icon-chip background: `#EEF4EA`
- Alternate accent chip: `#FAEFD9`
- Keep icon size around 20–26px in cards.
- Do not mix filled 3D icons with outline SVG icons in the same section.

## 10. Motion

Use quiet micro-interactions:
- cards: translateY(-2px to -4px)
- icon chips: scale 1 → 1.04
- buttons: arrow shift +3px
- section reveal: opacity + 12–18px upward motion
- duration: 180–500ms
- avoid excessive parallax or large bounce effects

## 11. Responsive behavior

Desktop: max width `1280–1360px`.  
Tablet: 2-column feature grids.  
Mobile: single-column cards, 18–22px page gutter.

For mobile hero:
- content first
- image second
- retain full source image
- minimum tap target 44px

## 12. Non-negotiables

- No destructive cropping of supplied image files.
- No heavy dark-green page background.
- No neon green.
- No generic SaaS blue.
- Keep Vietnamese copy readable and high-contrast.
- Premium ≠ black everywhere; premium here comes from ivory + sage + warm gold + typography + whitespace.
