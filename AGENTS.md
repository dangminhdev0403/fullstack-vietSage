# Agent Instructions for fullstack-vietSage

> **Canonical ruleset lives in [`.agents/AGENTS.md`](.agents/AGENTS.md).**
>
> This file exists for tools that only read the repo root. All rules (including the Graphify-first navigation policy) are defined in `.agents/AGENTS.md`.

See [.agents/AGENTS.md](.agents/AGENTS.md) for the full agent instructions. Agents without global Ponytail settings also read `PONYTAIL.md` before coding.

## Mandatory Tech Stack Guardrails (Step-Zero Reuse)

Before writing any code, agents MUST reuse the project's standard architectural primitives. DO NOT fall back to raw browser APIs:
- **Persistent / Shared Client State**: MUST use **Zustand** (`persist` + `createJSONStorage` + `safeStorage`). Strictly FORBIDDEN to call `localStorage` / `sessionStorage` directly in components, hooks, or pages.
- **Server State / API Calls**: MUST use **`@dangminhdev04032005/query-resource`** (repository → resource → hook → component). FORBIDDEN to write raw `useQuery`, raw `fetch`, or raw `axios` in components.
- **Dialogs & Feedback**: MUST use **`SwalVietSage`** (`src/libs/swal.ts`). FORBIDDEN to use `window.alert()`, `window.confirm()`.
- **Data Tables & Drag-and-Drop (Chuẩn bảng dữ liệu & Kéo thả)**: Các bảng dữ liệu phức tạp (quản lý phòng, tape chart, bảng có phân trang, sắp xếp, lọc, đổi thứ tự) BẮT BUỘC sử dụng **`@tanstack/react-table`** cho tầng headless table model và **`@dnd-kit`** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) cho tương tác kéo thả hàng/cột. NGHIÊM CẤM dựng table thô sơ (hardcoded raw `<table>` mà không có headless model) khi có yêu cầu tương tác nâng cao hoặc quản lý thứ tự động để đảm bảo tính đồng bộ, hiệu năng và trải nghiệm người dùng cao cấp.
- **Backend Validation**: MUST use **`Zod`** schemas + `parseWithZod(...)`. FORBIDDEN to use `class-validator`, forbidden manual type casting `as { ... }`.
- **Timezone Standard**: MUST use canonical **`Asia/Ho_Chi_Minh`** (UTC+7). FORBIDDEN to use `Asia/Saigon`.
- **UI Design, Typography, Anti-Fluff & Balance Standard**: Minimum font size is strictly 12px (`text-xs`). Strictly FORBIDDEN arbitrary micro-classes (`text-[10px]`, `text-[11px]`, sub-0.75rem, etc.). Strictly FORBIDDEN developer notes, wireframe prefixes (`"03 / "`), raw enum/role codes (`SUPER_ADMIN`), raw HTTP status codes (`(404 Not Found)`), DB terms, developer placeholders (`"VD: Test"`), or boilerplate marketing fluff slogans. Strictly FORBIDDEN decorative nested cards and duplicate action buttons. Headings MUST use `text-balance` (`text-wrap: balance`) to prevent awkward dangling orphan words ("gãy dòng cộc lốc"). Multi-line copy MUST use `text-pretty`. Badges/pills MUST use `whitespace-nowrap`. Strictly FORBIDDEN triple-layer redundant stacking (Eyebrow + Heading + Subtitle saying the same thing). Single-column forms/cards capped at `max-w-md` to `max-w-lg`. All frontend changes must pass the UI Design Gate: `node scripts/verify-ui-rules.cjs`.
- **Zero-Waste Validation & Command Exemption (Miễn trừ lệnh thừa & Tối ưu tốc độ)**:
  - Khi chỉnh sửa UI, CSS, Tailwind, spacing, layout JSX, copywriting, hoặc thêm component hiển thị thuần túy:
    - **CẤM CHẠY**: Mọi hình thức test suites (`node --test`, `npm test`, `pnpm test`, `jest`, `vitest`, `playwright`).
    - **CẤM CHẠY**: `tsc --noEmit` khi chỉ chỉnh sửa CSS/styling hoặc đổi text/giao diện JSX (chỉ được chạy nếu thêm props/types/import TypeScript mới).
    - **CẤM CHẠY**: Full-repo lint (`pnpm lint`, `eslint .`), và build bundling (`next build`).
    - **CẤM CHẠY**: `git diff` hoặc kiểm tra/soát các file không thuộc phạm vi task được giao (ví dụ: task sửa `globals.css` thì cấm soi diff `tape-chart-view.tsx`).
    - **CẤM CHẠY**: Các lệnh ad-hoc thử nghiệm như `node -e "..."`.
    - **Lệnh duy nhất được chạy**: `node scripts/verify-ui-rules.cjs` (quét tĩnh < 1s).
  - **Các lệnh thừa khác cấm chạy tự tiện**:
    - Cấm chạy `graphify update` cho các sửa đổi UI/CSS/copy nhỏ.
    - Cấm chạy migrations/seed/db scripts cho frontend tasks.
    - Cấm format diện rộng toàn bộ dự án (`prettier --write .`).
- **Root Execution Standard (Zero-CD Policy for Agents & Developers)**:
  - **CẤM TUYỆT ĐỐI**: Chạy lệnh `cd` để nhảy vào thư mục con rồi mới gọi lệnh (`cd frontends/... && pnpm dev`).
  - **BẮT BUỘC thực thi ngay tại root workspace**:
    - Chạy Frontend Dev: `pnpm dev:front` (hoặc `pnpm -C frontends/front-end-vietsage dev`)
    - Chạy Backend Dev (NestJS): `pnpm dev:api` (hoặc `pnpm -C services/auth-service start:dev`)
    - Build Frontend / API: `pnpm build:front` / `pnpm build:api`
    - Lint Frontend / API: `pnpm lint:front` / `pnpm lint:api`
    - Smoke Test Frontend: `pnpm smoke:front`
    - Database Docker: `pnpm db:up` / `pnpm db:down`
    - Prisma ORM: `pnpm prisma:generate` / `pnpm prisma:studio`
- **Nguyên tắc cốt lõi: Bảo gì làm nấy - Không làm lan man (Strict Prompt Fidelity & Zero Scope Drift)**:
  - **Chỉ làm đúng việc được giao**: User bảo kiểm tra -> CHỈ kiểm tra; bảo thêm data -> CHỈ thêm data; bảo sửa file A -> CHỈ sửa file A; bảo chạy lệnh X -> CHỈ chạy lệnh X. Cấm tự ý suy diễn, cấm "nghĩ hộ", cấm "tiện tay làm thêm".
  - **Hoàn thành là dừng ngay**: Xong việc được giao lập tức dừng gọi tool và báo cáo, cấm chạy thêm lệnh kiểm tra ngoài lề hoặc tìm kiếm loanh quanh.
  - **Phát hiện ngoài lề: CHỈ BÁO CÁO, CẤM TỰ SỬA**: Mọi phát hiện lỗi khác, guard ẩn data, permission... BẮT BUỘC chỉ báo cáo trong tin nhắn, cấm tự ý đi sửa tiếp khi chưa có lệnh rõ ràng.
  - **Khoanh vùng lỗi cùng miền (Zero Failure Drift)**: Lệnh nào lỗi thì kiểm tra và sửa đúng lệnh/môi trường đó (stderr, syntax, SSH, env). CẤM lấy cớ lỗi để nhảy sang bới móc hay sửa các file/tầng khác.
  - **Codebase Freeze khi làm DB/VPS/Ops**: Khi thực hiện tác vụ Database (insert/seed/query), chạy script VPS, Docker, SSH: CẤM SỬA bất kỳ file mã nguồn ứng dụng nào (`.ts`, `.tsx`, `.js`, guards, services, controllers, store, components). Mã nguồn là READ-ONLY.
  - **Cấm dùng Terminal/Bash để đọc file (Chống popup hỏi quyền liên tục)**: BẮT BUỘC dùng native tool (`read_file`, `edit_file`) để đọc và sửa file. CẤM TUYỆT ĐỐI gọi terminal chạy script ad-hoc như `node -e "const fs = ..."` hay `python -c "..."` chỉ để đọc file, đếm dòng hoặc duyệt code, vì chuỗi lệnh thay đổi liên tục khiến IDE dừng lại bật popup hỏi quyền xác nhận làm gián đoạn công việc.

## Strict Audit Mode

For any audit/review/verification request (`audit`, `review`, `rà soát`, `soát code`, architecture/system-design/module/repository/diff review) or explicit strict-mode trigger, follow [.agents/rules/strict-audit-mode.md](.agents/rules/strict-audit-mode.md). **Ponytail Max (`ultra`) Auto-Escalation**: Enabling Strict Audit Mode (`chế độ rà soát`) automatically sets Ponytail intensity to **max (`ultra` / `PONYTAIL_LEVEL: ultra`)** — enforcing deletion before addition, ruthless over-engineering pruning, and shortest root-cause corrections. Audit read-only by default. Derive standards from the current repository; map the scoped system flow and invariants before checking technology fit. Every delegated reviewer MUST auto-activate strict audit and Ponytail `ultra` from task intent; its card carries `STRICT_AUDIT_MODE: true` and `PONYTAIL_LEVEL: ultra`, exact scope/invariants/write policy. **Chế độ rà soát tập trung (Silent Execution & Output-Only Standard)**: Reviewer bắt buộc thực thi ngầm, cấm spam lời thoại/tiến trình trung gian trong khi gọi tool (tương tự chế độ tập trung code), và chỉ trả lời đúng một Báo cáo Cuối cùng (Final Report) hoàn chỉnh bắt đầu bằng `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).`. Khi rà soát thành phần giao diện, bắt buộc kiểm tra và báo cáo kết quả UI Design Gate (`node scripts/verify-ui-rules.cjs`: sàn font >= 12px, zero-fluff text, ruthless UI pruning). One host owns the system map/evidence while the fewest useful specialists review disjoint boundaries. Fixes require explicit implementation/remediation authorization.

## graphify

This project uses Graphify for dependency/impact navigation and Repomix for compact task-scoped source context.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- **Symbolic Anchoring (Narrow down by Symbol, DO NOT query long natural-language phrases)**: Strictly forbidden to pass long descriptive prompts (> 3 words) into `graphify query`. Extract 1–2 technical Anchor Symbols first, then use `graphify explain "<Symbol>"`, `graphify affected "<Symbol>"`, or `graphify path` to fetch the 1-hop neighborhood in 1–2 seconds.
- **Zero-Repo-Scan on Turn 1**: Strictly forbidden to use `find`, `grep` across the whole repo or walk directory trees on the first turn. Only pack 3–5 files from Anchor Symbols using Repomix (`--include`, `--compress`) under `graphify-out/repomix/`; inspect the pack before opening source code files.
- If Repomix's security scanner excludes a selected path, record it and read only that Graphify-selected file's exact source range; never bypass the scanner.
- Do not begin with broad search, repository walking, direct whole-tree grep, or guessed-file browsing. These are fallback-only after stating the exact Graphify/Repomix gap.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Run `graphify update . --force` only after completing an entire feature/module or major refactor. For routine/minor edits (minor UI tweaks, renaming, text/copy, styling tweaks), do NOT run graphify update.
