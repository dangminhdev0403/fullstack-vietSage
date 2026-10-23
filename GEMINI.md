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

---

## 2. Mandatory Tech Stack Guardrails (Step-Zero Reuse)
- **Client State**: Wrap all persistent, session, and shared client state in a Zustand store under `src/features/<feature>/store/` using `persist` + `createJSONStorage` and `safeStorage`. NEVER call `localStorage` / `sessionStorage` directly in components.
- **Server State**: Use `@dangminhdev04032005/query-resource` (repository -> resource -> feature hook -> component). Never write raw `fetch`, `axios`, or raw `useQuery` in components.
- **Dialogs & Feedback**: All confirm dialogs and alerts MUST use `SwalVietSage` (`src/libs/swal.ts`). Never use `window.alert()` or `window.confirm()`.
- **Data Tables & Drag-and-Drop**: Complex tables MUST use `@tanstack/react-table` and `@dnd-kit`.
- **UI Typography Floor**: Minimum font size is strictly 12px (`text-xs`). Never use micro-classes (`text-[10px]`, `text-[11px]`). Headings must use `text-balance`, body copy `text-pretty`, badges `whitespace-nowrap`. Enforce via `node scripts/verify-ui-rules.cjs`.
