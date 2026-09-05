# Primitives

## Color
Canvas #f9f9f9; surface #ffffff; text #1a1c1c; muted text #464653; deep navy #00003c; action navy #000080; muted gold #735c00; warm gold #fed65b; success #166534; error #ba1a1a.

Use semantic CSS variables/Tailwind tokens. Raw colors require a documented exceptional role.

## Typography
Body: Manrope. Display: Fraunces. Vietnamese glyphs must load through next/font; fallbacks must not become the normal rendered face.

- Body/default: 16px, line-height 1.5–1.65, weight 400–500.
- Small metadata: 14px minimum, line-height at least 1.4.
- Body large: 18px, line-height 1.55–1.65.
- Headings: 24/32/48px with compact responsive steps; sentence case.
- Primary controls: 16px minimum. Never use 10–12px for actions or normal content.

## Spacing
8px base unit; 16px mobile margin; 24px gutter/card padding; 32–40px section rhythm; 1200px max container.

## Shape
8px controls; 12–24px cards by prominence; pills only for status.

## Elevation
Borders and tonal layers first. Soft shadow only for raised cards/overlays; no heavy generic dashboard shadows.

## Motion
160ms quick feedback; 240–420ms transitions; restrained entrance motion; always honor `prefers-reduced-motion`.
