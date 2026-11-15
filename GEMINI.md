# Gemini & Codex Agent Instructions for fullstack-vietSage

> **Canonical ruleset lives in [`.agents/AGENTS.md`](.agents/AGENTS.md) and [`.agents/rules/zero-waste-validation.md`](.agents/rules/zero-waste-validation.md).**

All agents working in this repository MUST follow these rules:

## 1. Zero-Waste Validation Gate (Strictly Enforced)

### Khi chỉnh sửa UI, CSS, Tailwind, spacing, layout JSX, copywriting, hoặc presentation components:
- **Lệnh DUY NHẤT được phép chạy**:
  ```bash
  node scripts/verify-ui-rules.cjs
  ```
- **TUYỆT ĐỐI CẤM CHẠY (Strictly Forbidden)**:
  - CẤM chạy bất kỳ unit test nào: `node --test`, `npm test`, `pnpm test`, `jest`, `vitest`, `playwright`. (Tuyệt đối không chạy bừa test file như `marketing-home-vi.test.ts` khi sửa CSS/UI!).
  - CẤM chạy `tsc --noEmit` khi chỉ sửa pure CSS/styling hoặc đổi text (chỉ được chạy scoped `tsc` nếu có thêm props/types TypeScript mới).
  - CẤM chạy `next build`, `pnpm build`, `eslint .`, `pnpm lint`.
  - CẤM chạy `git diff` trên các file không thuộc phạm vi task được giao (ví dụ: task sửa `globals.css` thì cấm soi diff `tape-chart-view.tsx`).
  - CẤM chạy các lệnh ad-hoc như `node -e "..."` hoặc script terminal để đọc file hay duyệt code (bắt buộc dùng `read_file`, `edit_file` tool chuyên dụng để tránh bị IDE chặn hỏi quyền liên tục).
  - CẤM TUYỆT ĐỐI tự ý bật trình duyệt (Google Chrome, Chromium, Edge), cấm gọi MCP `chrome-devtools-mcp` (như `list_pages`, `new_page`, `navigate_page`...) hoặc subagent `browser`. Dù prompt có URL (`https://...`, `localhost:...`) thì CHỈ kiểm tra code, API, DB, hoặc log; CẤM mở trình duyệt trừ khi người dùng có lệnh rõ ràng bằng văn bản: *"mở trình duyệt"* hoặc *"bật chrome/browser"*.

---

## 2. Mandatory Tech Stack Guardrails (Step-Zero Reuse)
- **Client State**: Wrap all persistent, session, and shared client state in a Zustand store under `src/features/<feature>/store/` using `persist` + `createJSONStorage` and `safeStorage`. NEVER call `localStorage` / `sessionStorage` directly in components.
- **Server State**: Use `@dangminhdev04032005/query-resource` (repository -> resource -> feature hook -> component). Never write raw `fetch`, `axios`, or raw `useQuery` in components.
- **Dialogs & Feedback**: All confirm dialogs and alerts MUST use `SwalVietSage` (`src/libs/swal.ts`). Never use `window.alert()` or `window.confirm()`.
- **Data Tables & Drag-and-Drop**: Complex tables MUST use `@tanstack/react-table` and `@dnd-kit`.
- **UI Typography Floor**: Minimum font size is strictly 12px (`text-xs`). Never use micro-classes (`text-[10px]`, `text-[11px]`). Headings must use `text-balance`, body copy `text-pretty`, badges `whitespace-nowrap`. Enforce via `node scripts/verify-ui-rules.cjs`.
- **Dialog & Modal Layout Standard**: BẮT BUỘC dùng **Box Ngang** căn giữa màn hình (Centered Horizontal Modal / Dialog: `max-w-4xl` đến `max-w-6xl`, `max-h-[92vh]`, `rounded-2xl`, `shadow-2xl`) cho các thao tác quản lý, bảng dữ liệu, và tác vụ hàng loạt. CẤM TUYỆT ĐỐI dùng **Box Dọc** (Side Drawer / Right Slide-over chạy suốt mép phải `fixed inset-y-0 right-0`).
- **Table Lean-Information Standard**: Bảng dữ liệu (Table) CHỈ hiển thị thông tin cốt lõi để quét nhanh và chọn dòng. CẤM nhồi nhét full thông tin, mã dài ngoằng, số điện thoại, giá phụ, danh sách số phòng trong 1 cell (text linh tinh). Toàn bộ thông tin chi tiết đầy đủ thuộc về màn hình **Xem Chi Tiết (Box Ngang)** khi click vào dòng.

---

## 3. Root-Cause First & Zero Symptom-Masking (Truy tìm gốc rễ - Cấm che đậy lỗi)
- **Truy vết tới cùng nguyên nhân gốc (Root Cause First)**: Khi gặp lỗi hệ thống, màn hình đỏ, Console Error, 500 Internal Server Error, Prisma error hoặc Database Failure:
  - BẮT BUỘC kiểm tra log backend thực tế (terminal/stdout/stderr), database schema, và network request để tìm chính xác nơi phát sinh lỗi gốc.
  - Sửa lỗi PHẢI sửa đúng tại nơi sinh ra lỗi (Root Cause): nếu thiếu migration thì chạy migration, nếu sai query/schema thì sửa query/schema, nếu thiếu bảng DB thì tạo bảng, nếu backend trả sai contract thì sửa backend contract.
- **CẤM TUYỆT ĐỐI sửa ngoài / che đậy lỗi (Zero Symptom-Masking)**:
  - CẤM hạ log level (đổi `error` thành `warn`/`info`) hay xóa log chỉ để né overlay/popup đỏ của Next.js hoặc browser.
  - CẤM bọc `.catch(() => null)` hay nuốt lỗi (silent error swallowing) ở tầng client/caller để "làm cho hết đỏ" trong khi backend/database thực tế đang lỗi.
  - CẤM sửa code frontend để giấu lỗi khi bản chất vấn đề nằm ở backend hoặc database.

