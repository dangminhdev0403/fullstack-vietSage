# VietSage — Complete Visual Style

## Direction
Luxury hospitality + friendly concierge. Warm, calm, editorial and premium — not a dark-green SaaS page.

## Color tokens
- Forest: `#215744`
- Forest 2: `#2C5E4B`
- Sage: `#DDE9D9`
- Pale sage: `#EEF4EA`
- Ivory: `#FFFDF8`
- Cream: `#F8F3E7`
- Champagne gold: `#C69A4A`
- Ink: `#17382F`
- Body: `#5E6A64`
- Border: `#E7E0D1`

## Typography
- Headlines: `Cormorant Garamond` or `Playfair Display`
- UI/body: `Be Vietnam Pro` or `Inter`
- Use serif for emotional/luxury statements and sans-serif for operational/product copy.

## Asset policy
All files inside `assets/images`, `assets/decor`, `assets/icons`, and `assets/backgrounds` are standalone source assets.

**Do not crop images out of any page screenshot.**
**Do not create derivative cropped image files.**
Use CSS `object-fit`, `object-position`, masking, or overflow clipping only at render time.

### Main imagery
- `hero-lake-clean.png`: clean hero photography, no UI baked in.
- `hero-lake-with-script.png`: alternate standalone hero with VietSage script.
- `spa-towel.png`: standalone spa/wellness photography.
- `testimonial-avatar.png`: recreated standalone avatar illustration.

### Decorative images
- `leaf-blur-top-left.png`: blurred foreground leaf accent.
- `leaf-branch-left.png`
- `leaf-branch-right.png`
- `leaf-sprig.png`
- `cta-foliage-overlay.png`

These were recreated independently and are not screenshot crops.

## Icon rules
Use icons from `assets/icons/`.
- Default stroke: `#215744`
- Chip background: `#EEF4EA`
- Warm highlight chip: `#FAEFD9`
- Typical icon size: 20–26px
- Hero/form icons: 18–22px
- Trust icon: 24–30px
- Service card icon: 28–36px
- Use filled service variants only in the service card section.

## Layout
- Max page width: 1280–1360px
- Desktop gutter: 32–48px
- Tablet: 24–32px
- Mobile: 18–22px
- Section spacing: 88–128px desktop, 64–88px tablet, 48–64px mobile

## Radius
- large panels: 32–40px
- cards: 20–28px
- icon chips: 16–22px
- buttons/inputs: 999px

## Shadows
```css
box-shadow:
  0 18px 50px rgba(39,54,45,.08),
  0 2px 10px rgba(39,54,45,.05);
```

## Hero
Use `hero-lake-clean.png` or `hero-lake-with-script.png`.
Do not make a dark overlay. Prefer a left ivory/transparent gradient and keep the scenic right half bright.

## Key section styling
- Nav: ivory glass, thin warm border.
- Hero: scenic, bright, airy.
- Booking/search panel: floating ivory card.
- Trust row: no heavy container; use soft icon chips.
- Services: cream section + white cards.
- Spa section: image-forward.
- Review section: bright ivory.
- Final CTA: one muted forest/sage contrast block.
- Footer: ivory, never black.

## Motion
- 180–240ms hover
- 350–500ms reveal
- cards move up 2–4px
- arrow shifts 3px
- honor `prefers-reduced-motion`

## Non-negotiables
- no screenshot slicing
- no destructive image crop
- no neon green
- no generic SaaS blue
- no repeated dark-green blocks
- no mixed icon families in one section
- no low-contrast body copy
