# Zero-Waste Validation Gate

This rule is mandatory for all agents (Codex, Antigravity, and any automated runner) working in `fullstack-vietSage`.

## 0. Focused Scope Gate & Anti-Expansion (Bắt buộc trước khi đụng code)
- **Task Alert UI / Toast / Notification / Dialog / Feedback**:
  * CHỈ sửa file toaster/alert hoặc đúng component gọi alert (Ví dụ: duration, styling, wording).
  * **NGHIÊM CẤM**: Chạm vào backend repository (`reservations.repository.ts`, `hotel-rooms.repository.ts`), BFF route, OpenAPI schema, Prisma schema, hay các màn hình/panel khác (`tape-chart`, `front-desk-arrival-detail-panel`, `front-desk-room-detail-panel`, `swal.ts`).
  * Lỗi từ backend chỉ được bắt và hiển thị thông báo lỗi thân thiện tại UI. **CẤM sửa logic backend khi task là UI Alert**.
- **File Quota**: Tối đa **1 - 3 files** cho mỗi task. Chạm file thứ 4 mà không có yêu cầu rõ ràng từ người dùng là vi phạm nghiêm trọng.
- **Read Budget & Anti-Loop**:
  * Tối đa đọc đúng 1-3 file đích cần sửa. CẤM đọc lại `AGENTS.md`, `ARCHITECTURE.md`, `RULES.md` khi làm task cụ thể.
  * Đọc 1 lần duy nhất tại vị trí cần sửa (`StartLine`/`EndLine`). CẤM đọc lại file đã đọc.
  * Đọc xong -> Xác định diff tối thiểu -> Sửa ngay.

## 1. Scope: Pure UI / CSS / Styling / JSX Layout / Copywriting
When the task involves editing CSS, Tailwind classes, spacing, colors, JSX layout, UI text, or presentation components:

### The ONLY Validation Command Allowed:
```bash
node scripts/verify-ui-rules.cjs
```

### STRICTLY FORBIDDEN (DO NOT EXECUTE):
1. **NEVER run ANY test suite or unit test**:
   - Strictly forbidden: `node --test`, `npm test`, `pnpm test`, `jest`, `vitest`, `playwright`.
   - Never run arbitrary test files (e.g. NEVER run `marketing-home-vi.test.ts` when editing CSS or layout).
2. **NEVER run `tsc --noEmit` on pure CSS / styling / copy**:
   - `tsc` is only permitted if new TypeScript interfaces, types, or props were introduced.
   - For pure CSS edits (`globals.css`), running `tsc` is strictly forbidden.
3. **NEVER run full build or full lint**:
   - Strictly forbidden: `next build`, `pnpm build`, `eslint .`, `pnpm lint`.
4. **NEVER inspect unrelated files via git**:
   - Strictly forbidden to run `git diff` on files not assigned to the task (e.g., inspecting `tape-chart-view.tsx` when task was `globals.css`).
5. **NEVER execute ad-hoc node scripts**:
   - Strictly forbidden: `node -e "..."`.

---

## 2. Scope: Backend Services / DTO / Business Logic
- Run ONLY the single scoped unit test for that specific modified file (e.g., `jest path/to/service.spec.ts`).
- NEVER run full-repo test suites.

---

## 3. Scope: Database Schema / Prisma
- Run ONLY `npx prisma validate`.
- NEVER run `prisma migrate reset` or seed production.

---

## 4. Scope: Markdown / Documentation
- Read `git diff` for the documentation file only.
- NEVER run tests, lint, build, or typecheck.

---

## 5. Scope: Database Operations / Seed Data / VPS Ops / Docker / Shell Commands
Khi thực hiện thao tác dữ liệu (insert/seed/query DB), chạy script VPS, Docker, SSH:
1. **Lệnh được chạy**: Lệnh SQL (SELECT, INSERT), seed script, Docker logs/restart, SSH command tương ứng.
2. **NGHIÊM CẤM TUYỆT ĐỐI**:
   - **CẤM SỬA BẤT KỲ FILE MÃ NGUỒN ỨNG DỤNG NÀO** (`.ts`, `.tsx`, `.js`, guards, services, controllers, store, components). Mã nguồn là READ-ONLY (chỉ đọc schema khi cần biết tên cột).
   - **CẤM NHẢY MIỀN KHI LỖI (Zero Failure Drift)**: Khi lệnh script/DB trên VPS lỗi (`exit code != 0`), CHỈ sửa lỗi tại môi trường VPS/DB (xem stderr, SQL syntax, SSH, env). CẤM lấy cớ đi lục lọi và sửa code `authorization.guard.ts` hay `authorization.service.ts`.
   - **CẤM CHẠY application unit test suites** hoặc app build khi đang làm task dữ liệu/ops.
   - **CẤM TỰ Ý MỞ RỘNG PHẠM VI**: Nếu nghi ngờ code ứng dụng ẩn data, BẮT BUỘC DỪNG LẠI và BÁO CÁO CHO USER. Tuyệt đối không tự ý mở file code để debug/sửa.
