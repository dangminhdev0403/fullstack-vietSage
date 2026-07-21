---
name: Heritage Luxe
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#464653'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#767684'
  outline-variant: '#c6c5d5'
  surface-tint: '#4b53bc'
  primary: '#00003c'
  on-primary: '#ffffff'
  primary-container: '#000080'
  on-primary-container: '#777eea'
  inverse-primary: '#bfc2ff'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#0b0c02'
  on-tertiary: '#ffffff'
  tertiary-container: '#212313'
  on-tertiary-container: '#898b75'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e0e0ff'
  primary-fixed-dim: '#bfc2ff'
  on-primary-fixed: '#00006e'
  on-primary-fixed-variant: '#3239a3'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#e4e4cc'
  tertiary-fixed-dim: '#c8c8b0'
  on-tertiary-fixed: '#1b1d0e'
  on-tertiary-fixed-variant: '#474836'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style
The design system is crafted for a premium hotel service, blending traditional Vietnamese hospitality with modern luxury. The brand personality is **Elegant, Calm, and Trustworthy**, aiming to evoke a sense of serene exclusivity and high-end professional service.

The visual style is **Corporate Modern with a Minimalist focus**. It utilizes heavy whitespace to allow the premium content to breathe, while employing a sophisticated card-based architecture to organize complex service offerings. The interface feels light and airy, yet grounded by high-quality typography and structured layouts.

## Colors
This design system uses a palette that balances authority and warmth. 
- **Deep Navy (#000080)**: Used for primary branding, navigation, and core interaction points to establish trust.
- **Muted Gold (#D4AF37)**: Used sparingly for accents, highlights, and "premium" status indicators to convey luxury without ostentation.
- **Warm Beige (#F5F5DC)**: Used as a secondary background or subtle section separator to soften the high-contrast navy and white.
- **White (#FFFFFF)**: The primary canvas color to ensure a clean, modern aesthetic.

Status colors are slightly desaturated to maintain the "calm" brand personality, ensuring they provide information without breaking the visual harmony.

## Typography
The typography strategy relies on a sophisticated contrast between **Playfair Display** and **Inter**. 

All headings and display text use Playfair Display to signal heritage and luxury. Headlines should use "Sentence case" in Vietnamese to maintain a friendly yet professional tone. For body copy, Inter provides high legibility and a modern, systematic feel. Use generous line-heights (1.5 - 1.6) for body text to improve readability and reinforce the "calm" emotional response.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for desktop (12 columns) and a **Fluid** model for mobile. 

- **Desktop**: 12-column grid, 1200px max-width, 24px gutters.
- **Mobile**: Single column with 16px side margins.
- **Rhythm**: All spacing (padding, margins) must be increments of 8px. Use 32px or 40px for vertical section spacing to maintain "generous whitespace."

Components should be grouped logically within cards, using internal padding of 24px to ensure content does not feel cramped.

## Elevation & Depth
Depth is created through **Ambient Shadows** and **Tonal Layers**. 

The design system avoids harsh borders. Instead, cards use a very soft, diffused shadow (`0px 4px 20px rgba(0, 0, 0, 0.05)`). To indicate hierarchy, secondary cards can use a subtle **Warm Beige** fill with no shadow. Background blurs (Glassmorphism) should be reserved for sticky mobile navigation bars or floating action buttons to maintain context without obscuring the background colors.

## Shapes
The shape language is defined by **Large, Soft Radii**. 

- Standard components (inputs, small buttons) use `rounded-md` (8px).
- Service cards and containers use `rounded-2xl` (24px) to emphasize a modern, premium feel. 
- Status badges use a full pill-shape to distinguish them from interactive buttons.

## Components

### Premium Service Cards
Cards should feature a high-quality image with a `rounded-xl` top. The content area below should use `body-md` for descriptions and a `label-md` in Muted Gold for the category name.

### Sticky Mobile Buttons
Primary actions on mobile (e.g., "Đặt ngay") must be contained in a sticky bottom container with a `backdrop-filter: blur(10px)` and a soft top border. The button itself should be full-width, Navy, with White text.

### Status Badges
Badges use a low-opacity background version of the status color with high-contrast text. 
- **Chờ duyệt (Pending)**: Grey.
- **Đã nhận (Accepted)**: Light Blue.
- **Đang xử lý (In Progress)**: Muted Gold.
- **Hoàn thành (Completed)**: Green.
- **Đã hủy (Cancelled)**: Red.

### Admin Data Visualization
Charts should use the primary Navy and Muted Gold for data series. Use a clean, sans-serif font (Inter) for all chart labels and axes. Grid lines in charts should be kept at extremely low opacity (10%) to maintain the minimalist aesthetic.

### Input Fields
Inputs are borderless with a `Warm Beige` background or use a very thin `1px` border in a light neutral. Focus states should be indicated by a `1px` Navy border.