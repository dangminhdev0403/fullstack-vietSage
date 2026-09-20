# VietSage — Implementation Prompt

You are redesigning the full VietSage landing page for a hospitality concierge / hotel guest-experience platform.

## Goal

Rebuild the page into a more premium, warm, friendly hospitality experience. The current version is too dark-green and visually heavy. Keep VietSage recognizable, but move the visual language toward:

- warm ivory / cream
- soft sage green
- restrained forest green
- muted champagne gold accents
- elegant editorial typography
- generous whitespace
- rounded premium cards
- subtle shadows
- quiet hospitality imagery

The result should feel closer to a boutique resort concierge than a generic SaaS dashboard.

## Mandatory assets

Use these exact standalone assets:

- `assets/images/hero-lake-vietsage.png`
- `assets/images/spa-towel.png`

IMPORTANT:
- Do not generate new cropped image files.
- Do not edit, resize, or destructively crop the supplied originals.
- You may use CSS `object-fit` / `background-position` for responsive presentation, but the source files must remain unchanged.

Background assets:
- `assets/backgrounds/page-cream.svg`
- `assets/backgrounds/sage-wash.svg`
- `assets/backgrounds/luxury-cta.svg`
- `assets/backgrounds/card-pearl.svg`

Icons:
- use only the provided SVG files from `assets/icons/`
- keep icon style consistent within each section

## Page structure

### 1. Navigation
Floating white/ivory rounded navigation with:
- VietSage brand
- “Giải pháp”
- “Khách hàng”
- “Về chúng tôi”
- primary CTA “Yêu cầu demo”
- compact menu icon on smaller layouts

Use a light frosted-glass effect; no dark navbar.

### 2. Hero
Headline:
“Kết nối lễ tân, buồng phòng và trải nghiệm lưu trú trong một quy trình liền mạch.”

Supporting copy:
“VietSage mang đến giải pháp trợ lý QR thông minh hỗ trợ vật dụng phòng, ẩm thực tại phòng, dịch vụ buồng phòng, cẩm nang địa phương và đa ngôn ngữ — giúp giảm tải vận hành và xử lý từng yêu cầu nhanh chóng, chính xác.”

CTA:
- “Đặt lịch demo”
- “Xem trải nghiệm khách”

Use `hero-lake-vietsage.png` as the major visual.
Blend content and image using ivory gradient / glass treatment.
Do not cover the whole image with dark green.

### 3. Trust / utility row
Four compact cards:
- 24/7
- QR
- Tức thì
- Đa ngữ

Use matching provided icons.

### 4. Concierge assistant panel
Create a polished embedded assistant UI:
- header “Trợ lý số VietSage”
- status pill “Sẵn sàng phục vụ”
- large request/search field
- quick actions:
  - Khăn và tiện ích
  - Ẩm thực tại phòng
  - Dọn phòng
  - Hỗ trợ địa phương

This panel should be ivory with thin sage borders and subtle depth.

### 5. Digital guest journey section
Eyebrow:
“GIẢI PHÁP CHUYỂN ĐỔI SỐ TỪ VIETSAGE”

Heading:
“Số hóa mọi điểm chạm trong suốt kỳ lưu trú của khách.”

Feature cards:
1. Trợ lý số tại phòng qua mã QR
2. Tự động điều phối tác vụ
3. Nâng tầm trải nghiệm lưu trú

Use large whitespace, light sage accents, and premium icon chips.

### 6. Request-to-action banner
Use `spa-towel.png` as the visual.

Eyebrow:
“TỪ YÊU CẦU ĐẾN HÀNH ĐỘNG”

Heading:
“Chuyển hóa mọi yêu cầu tại phòng thành tác vụ chính xác.”

Explain:
- guest scans room QR
- request goes to correct department
- staff confirm / complete
- operational data is logged

Use a muted forest/sage panel or a cream split-layout.
Do not use black.

### 7. Why VietSage
Heading:
“Giải tỏa áp lực lễ tân. Nâng chuẩn tiện nghi phòng. Tối ưu hiệu suất vận hành.”

Benefit cards:
- Chuyên biệt cho trải nghiệm lưu trú
- Giải tỏa áp lực quầy lễ tân
- Nâng chuẩn tiện nghi & riêng tư
- Giao tiếp đa ngôn ngữ
- Minh bạch dữ liệu vận hành
- Tương thích hoàn hảo với PMS

Use alternating ivory / pale-sage cards.

### 8. Final CTA
Short, premium, calm:
“Trải nghiệm vận hành liền mạch hơn cùng VietSage.”

CTA:
“Yêu cầu demo”

Use `luxury-cta.svg` or an equivalent muted green gradient.
Do not make this section near-black.

### 9. Footer
Light ivory footer with:
- brand
- Giải pháp
- Khách hàng
- Về chúng tôi
- Hỗ trợ
- social icons
- copyright

## Visual tokens

Primary forest: `#215744`  
Secondary green: `#2C5E4B`  
Soft sage: `#DDE9D9`  
Pale sage: `#EEF4EA`  
Ivory: `#FFFDF8`  
Cream: `#F8F3E7`  
Muted gold: `#C69A4A`  
Heading ink: `#17382F`  
Body: `#5E6A64`  
Border: `#E7E0D1`

Typography:
- heading: Cormorant Garamond / Playfair Display
- body/UI: Be Vietnam Pro / Inter

## UX rules

- Max content width: 1280–1360px
- Desktop feature grids: 3 or 4 columns
- Tablet: 2 columns
- Mobile: 1 column
- touch targets >= 44px
- section spacing 88–128px desktop
- use 22–40px border radius
- subtle shadows only
- hover transitions 180–240ms
- reveal transitions 350–500ms
- respect `prefers-reduced-motion`

## Quality bar

The implementation must look intentionally designed, not template-generated:
- no huge empty dead zones
- no cramped copy
- no repeated identical card layouts for every section
- no dark-green block after dark-green block
- no mismatched icon styles
- no low-contrast pale text
- no arbitrary gradients
- do not replace the supplied resort/spa images with stock placeholders

Match the content hierarchy of the supplied full-page reference, but improve the composition, spacing, color balance, image usage, and premium hospitality character.
