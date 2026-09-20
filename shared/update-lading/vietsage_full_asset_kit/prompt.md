# VietSage — Full Page Rebuild Prompt

Redesign and implement the VietSage full landing page as a premium hospitality concierge experience.

## Core objective
Upgrade the existing page from a visually heavy dark-green SaaS look into a warm luxury-hospitality interface using ivory, cream, sage, restrained forest green, and champagne-gold accents.

The page must feel:
- premium
- calm
- human
- trustworthy
- hospitality-first
- editorial rather than generic SaaS

## Strict asset rule
Use the supplied standalone assets directly.

DO NOT crop assets from a screenshot.
DO NOT export screenshot fragments.
DO NOT generate derivative cropped files.

Use CSS `object-fit`, `object-position`, clipping/masks, and responsive containers only at render time.

### Photo assets
- `assets/images/hero-lake-clean.png`
- `assets/images/hero-lake-with-script.png`
- `assets/images/spa-towel.png`
- `assets/images/testimonial-avatar.png`

### Decorative image assets
- `assets/decor/leaf-blur-top-left.png`
- `assets/decor/leaf-branch-left.png`
- `assets/decor/leaf-branch-right.png`
- `assets/decor/leaf-sprig.png`
- `assets/decor/cta-foliage-overlay.png`

### Backgrounds
- `assets/backgrounds/page-cream.svg`
- `assets/backgrounds/sage-wash.svg`
- `assets/backgrounds/forest-cta.svg`

### Brand
- `assets/icons/brand-mark.svg`
- `assets/icons/brand-horizontal.svg`

### Icons
Use only `assets/icons/*.svg`.
Do not pull icons from the reference screenshot.

## Page structure

### 1. Floating navigation
Ivory/white glass nav.
Brand on left.
Links: `Trang chủ`, `Dịch vụ`, `Trải nghiệm`, `Ưu đãi`, `Về chúng tôi`.
Right controls: search, notification, green status/CTA, profile.

### 2. Hero
Use `hero-lake-clean.png` as the large scenic background.
Optional alternate: `hero-lake-with-script.png`.

Eyebrow:
`NGHỈ DƯỠNG KHÔNG CHỈ LÀ LƯU TRÚ`

Headline:
`Hành trình tuyệt vời hơn cùng VietSage`

Body:
`Khám phá những không gian nghỉ dưỡng tinh tế, dịch vụ chu đáo và trải nghiệm được cá nhân hóa cho riêng bạn.`

CTA:
`Đặt lịch ngay`
Secondary:
`Xem trải nghiệm`

Add a left-to-right ivory transparency gradient so typography is readable without making the image dark.

### 3. Floating booking panel
Tabs:
- Đặt phòng
- Ẩm thực
- Dọn phòng
- Hỗ trợ địa phương
- Trải nghiệm đặc biệt

Fields:
- Địa điểm
- Ngày nhận phòng
- Ngày trả phòng
- Số khách
- Tìm kiếm

Use the provided icons.

### 4. Trust row
Four lightweight blocks:
- An toàn & tin cậy
- Dịch vụ 24/7
- Trải nghiệm cá nhân hóa
- Đối tác uy tín

### 5. Services
Left editorial content:
`Mọi nhu cầu lưu trú đều trong tầm tay`

Right service cards:
- Khăn và tiện ích
- Ẩm thực tại phòng
- Dọn phòng
- Hỗ trợ địa phương

Use filled variants:
- `bed-filled.svg`
- `cloche-filled.svg`
- `broom-filled.svg`
- `map-pin-filled.svg`

### 6. Spa/wellness section
Use `spa-towel.png`.
Headline:
`Nghỉ dưỡng trọn vẹn đến từng chi tiết`

Keep image bright and warm. No dark overlay.

### 7. Why VietSage
Heading:
`Vì sao chọn VietSage?`

Four cards:
- Chất lượng tuyển chọn
- Giá cả minh bạch
- Đánh giá chân thực
- Hỗ trợ tận tâm

Use diamond, feather, star, heart icons.

### 8. Reviews
Left intro:
`Những hành trình đáng nhớ`

Center testimonial card with `testimonial-avatar.png`.
Right rating card: `4.9/5`.

Use `leaf-sprig.png` as a light decorative corner detail.

### 9. Final CTA
Muted forest/sage panel.
Heading:
`Chuyển hóa mọi yêu cầu tại phòng thành tác vụ chính xác.`

Use `cta-foliage-overlay.png` above the green background with very low opacity.

### 10. Footer
Bright ivory footer.
Brand, navigation, support links, socials.
Never use a black footer.

## Visual tokens
- `#215744`
- `#2C5E4B`
- `#DDE9D9`
- `#EEF4EA`
- `#FFFDF8`
- `#F8F3E7`
- `#C69A4A`
- `#17382F`
- `#5E6A64`
- `#E7E0D1`

Typography:
- `Cormorant Garamond` / `Playfair Display`
- `Be Vietnam Pro` / `Inter`

## UX
- max width 1280–1360px
- 44px min touch target
- desktop 3–4 column grids
- tablet 2 columns
- mobile 1 column
- `prefers-reduced-motion`
- 180–240ms micro-interactions
- avoid huge empty dead zones
- preserve a strong visual rhythm between image-led and content-led sections

## Final quality check
Before completion, verify:
1. No image is sourced by cropping the reference screenshot.
2. All visible UI icons are loaded from `assets/icons/`.
3. Hero and spa images use the standalone supplied files.
4. Decorative leaves use `assets/decor/`.
5. Page is not dominated by dark green.
6. Gold appears only as a restrained accent.
7. Mobile remains readable and image crops are performed only via CSS presentation, never by writing cropped image files.
