# Agent Instructions for fullstack-vietSage

These instructions are mandatory for Codex and any delegated coding agent working in this repository.

## Execution Priority

- Follow the current user intent. Audit-only stays read-only; explicit fixes authorize the scoped implementation through validation and handoff. Internal verification during an implementation task does not start another repository audit.
- Apply [Efficient Execution and Validation](rules/zero-waste-validation.md) to every task. It is the canonical policy for file/read budgets, navigation exceptions, worker coordination, check selection and completion; it replaces older blanket quotas and repeated-check defaults. It does not override protected operations, explicit user limits or mandatory project gates.
- Reuse instructions and evidence already loaded in this conversation. Read only missing or changed relevant sections. Local corrections and documentation-only tasks normally need no new plan, worker or full-system discovery; explicit delegation requests and substantial independent policy-review work follow the shared profile's task-size policy.

---

## Scoped source navigation

- Reuse current symbols, exact named paths and the host's validated map. Use the existing Graphify index when it helps locate callers or dependencies; it is not a prerequisite for every source read. A direct `/graphify` request follows the installed Graphify instructions.
- Before trusting cached relationships, check the relevant entries in `graphify-out/manifest.json` and graph revision/source locations in `graphify-out/graph.json`. Current source remains implementation truth. Start from concrete symbols or flows and expand one dependency hop only to close a stated caller/invariant gap; do not dump graphs, AST caches or scan the whole repository.
- If the relevant tool/map is missing, stale or cannot resolve the boundary, record that concrete gap once and use bounded `rg` searches or exact current source ranges. Change navigation after at most two unsuccessful targeted attempts; do not rebuild an index or survey unrelated modules to proceed.
- Use a scoped Repomix pack when it reduces useful context, through an already-installed or pinned available command. Do not acquire `@latest` tooling or install packages as part of navigation. Reuse valid context rather than repacking unchanged files.
- Pack only selected paths. Never bypass Repomix security exclusions; for an excluded path, record the exclusion and inspect only the relevant exact source range when permitted. No whole-repository pack or speculative file expansion.
- Where artifact writes are authorized, use a distinct `graphify-out/repomix/<task>-<agent>.xml` per owner, or a host-owned immutable pack shared for reading. Audit-only work creates no pack/index/tracking artifacts without explicit artifact authorization; use existing context and bounded reads.
- Exact-path documentation/rules changes and exact user commands need no graph, pack or application-source discovery. Read only missing or changed relevant instructions.
- Do not refresh Graphify after every edit or as a completion hook. Refresh only a relevant stale relationship needed to finish the scoped outcome, using available tooling and authorized artifact writes; no unconditional forced whole-project rebuild.

## Scope and Protected Boundaries

- Implement only the requested outcome. Report unrelated findings without fixing them. Preserve unrelated dirty/untracked work.
- Local UI/alert/style tasks stay in their assigned UI surface; do not change backend, BFF, contracts or other screens to hide an error.
- During database/data/seed/VPS/Docker operations, application source is read-only. Diagnose failures in the requested environment. Application remediation needs separate authorization.
- Migrations applied to a database, destructive data changes, user-file deletion, credentials, global configuration, package/lockfile changes, infrastructure, provider writes, deployment and commit/push/merge retain their existing approval gates. Finish independent safe work while a protected operation waits.

### BCA / KBTT: user-controlled login; demo first; real operations require the user's command

- Use only the approved demo origin `https://api-kbtt.ai-vlab.com` and the user's `test_kblt` account for integration testing. Keep its password, Basic auth values and tokens in ignored local runtime configuration; never put them in tracked documentation, source, logs or screenshots.
- Demo exception authorized by the user: agents may log in, check, refresh and operate the test account `demo_tich_hop` only at the approved origin `https://api-kbtt.ai-vlab.com`, including use of its ignored saved test credentials. Verify both the origin and account before authentication or delivery. Use synthetic guests and isolated, bounded delivery; never replay old/real guest queues. This exception does not authorize any other account or origin.
- For every other BCA account or origin, agents must not initiate login or reauthentication through the UI, direct HTTP/API calls, Postman, scripts, helpers or saved credentials. For login, only open `https://vietsage.localhost/owner/hotels/cmq2k2lm0003f2oui3ifqp808/settings?tab=integrations`; the user enters credentials and submits the login. Do not fill credentials, click login/connect, or bypass this page.
- Except for the approved demo account/origin above, pause the BCA workflow until the user explicitly confirms that login is complete. An existing connected badge, screenshot, saved session or successful page load is not that confirmation. While waiting, do not trigger connection checks, disconnect/reconnect, login/refresh/revoke requests, other provider calls or background BCA jobs. If login is needed again, return to the same manual workflow.
- The user's login confirmation allows resuming only the already authorized BCA work; real-provider operations and enabling background delivery still require their existing explicit authorization.
- Do not contact a real BCA origin, use real BCA credentials, authenticate/refresh/revoke a real session, read real provider data, submit declarations, extend stays or check out guests without a clear user command authorizing that real operation. Treat every origin other than the approved demo origin as real until the user identifies it otherwise.
- Permission to edit, test, build, migrate or run the project does not authorize real BCA operations or enabling real background delivery. Wait for the user's command before those actions.
- Keep automatic delivery disabled during demo setup; an authorized demo test may enable a short, guarded window for its exact synthetic fixtures and must disable delivery again afterward. Isolate demo credentials and synthetic guest fixtures from saved real connections, tokens, queues and submission history. Never replay real guest data into the demo or reuse real tokens after changing origins.
- Use native file tools. If unavailable, use an available native runtime filesystem API on exact scoped paths; do not run shell snippets merely to read/edit files. Never dump environment variables, credentials or full process command lines.
- Routine file/read limits and their justified exceptions are defined once in [Efficient Execution and Validation](rules/zero-waste-validation.md).

## Required Reading Before Changes

Start from the closest relevant documentation scope. The lists below route to missing relevant context; they are not a requirement to reload documents already supplied or read in this conversation. For local fixes, read only the needed section. Do not load every markdown file by default.

### Cross-system / repository-wide work

Read:

1. `docs/README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RULES.md`
4. A task-specific root doc when relevant:
   - API/runtime notes: `docs/API_SPEC.md`
   - service boundaries: `docs/SERVICE_BOUNDARY.md`
   - event/lifecycle flow: `docs/EVENT_FLOW.md`
   - RBAC: `docs/RBAC_ARCHITECTURE.md`
   - deployment: `docs/DEPLOYMENT.md`
   - secrets policy: `docs/SECRETS.md`

### Frontend work

Read:

1. `frontends/front-end-vietsage/docs/ARCHITECTURE.md`
2. `frontends/front-end-vietsage/docs/RULES.md`
3. For every UI creation, modification, or review task, load `.agents/skills/design-dna/SKILL.md`. This includes typography, spacing, color, components, layout, responsive behavior, motion, accessibility, UI states, and visual stability. Skip it only when the task has no rendered UI effect.
4. The task-specific guide:
   - feature/module work: `frontends/front-end-vietsage/docs/MODULE_GUIDE.md`
   - API/contract work: `frontends/front-end-vietsage/docs/CONTRACT_GUIDE.md`
   - runtime/UI/state/realtime/error/i18n work: `frontends/front-end-vietsage/docs/RUNTIME_UI_GUIDE.md`
   - complex planning/continuation: `docs/RULES.md`, then the selected root `.hermes/plans/<timestamp>-<slug>.md`

### Backend work

Read:

1. `services/docs/ARCHITECTURE.md`
2. `services/docs/RULES.md`
3. The task-specific guide:
   - module work: `services/docs/MODULE_GUIDE.md`
   - API/contract/data work: `services/docs/CONTRACT_GUIDE.md`
   - service extension/extraction work: `services/docs/EXTENSION_GUIDE.md`
   - migration work: `services/docs/MIGRATION_GUIDE.md`
   - i18n backend work: `services/docs/MULTILINGUAL_BACKEND_PLAN.md`
   - complex planning/continuation: `docs/RULES.md`, then the selected root `.hermes/plans/<timestamp>-<slug>.md`

## Hard Rules

- **Database-First & End-to-End Optimization (Không chỉ nhìn giao diện cho bài toán dữ liệu)**:
  - Khi yêu cầu liên quan đến **truy vấn, lọc trạng thái/ngày (`quá hạn`, `đến ngày`, `xung đột`), tổng hợp nhiều thực thể, đếm số liệu, hoặc hàng đợi điều hành**, áp dụng [database-first and end-to-end optimization](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md#database-first-and-end-to-end-optimization). Truy vết nguồn dữ liệu và toàn luồng trước khi chọn tầng sửa; không bù bằng request thừa, cửa sổ quét lùi tùy tiện (`-30d`), hoặc kéo cả bảng về client lọc.
  - Kiểm tra phần liên quan trong `services/auth-service/prisma/schema.prisma` (`@@index`) và `services/auth-service/src/modules/*/infrastructure/repositories/*.repository.ts`: điều kiện `where` và composite index, tham số như `includeOverdue`, `select`/`include`, sắp xếp/phân trang/tổng hợp và N+1. Chỉ dùng `Promise.all` cho công việc độc lập khi phù hợp với tải DB và tính nhất quán của luồng.
  - Tối ưu nguyên nhân gốc tại tầng cần thiết trong phạm vi đã được phép; phối hợp DB, Backend và Frontend theo luồng dữ liệu, không bắt buộc sửa cả ba tầng hoặc chuyển chi phí sang tầng khác. Tuyên bố cải thiện hiệu năng cần bằng chứng runtime trước/sau có thể so sánh theo quy tắc chung; thiếu bằng chứng phải ghi `GAP`. Thay đổi migration/dữ liệu và thao tác được bảo vệ vẫn cần quyền riêng. Chỉnh CSS, layout hoặc câu chữ không đổi luồng dữ liệu không buộc rà soát DB.
- **Mandatory Existing Tech Stack Reuse (Step-Zero Guardrail)**: Before writing code, agents MUST reuse the project's standard architectural primitives. DO NOT fall back to raw browser APIs or ad-hoc solutions:
  - **Client State**: Wrap all persistent, session, and shared client state in a Zustand store under `src/features/<feature>/store/` using `persist` / `createJSONStorage` and `safeStorage`. NEVER call `window.localStorage` or `sessionStorage` directly inside components, hooks, or pages.
  - **Server State**: Use `@dangminhdev04032005/query-resource`: repository → resource → feature hook → component. Do not write raw `useQuery({ queryKey: ... })`, raw `useMutation`, or direct `fetch()` / `axios()` in UI components or pages.
  - **Dialogs & Feedback**: All confirm dialogs and alerts MUST use `SwalVietSage` (`src/libs/swal.ts`) via helper functions (`showSuccessAlert`, `showErrorAlert`, `showConfirmDialog`). Never use `window.alert()`, `window.confirm()`, or unconfigured `Swal.fire()`.
  - **Data Tables & Drag-and-Drop Standard**: Bảng dữ liệu phức tạp (quản lý phòng, tape chart, bảng có phân trang, sắp xếp, lọc, kéo thả đổi thứ tự) BẮT BUỘC sử dụng **`@tanstack/react-table`** cho tầng headless table model và **`@dnd-kit`** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) cho tương tác kéo thả hàng/cột. NGHIÊM CẤM dựng table thô sơ (hardcoded raw table state) khi có yêu cầu tương tác sắp xếp/kéo thả động để đảm bảo tính module hóa, hiệu năng render và trải nghiệm mượt mà.
  - **Backend Validation**: All NestJS controller endpoints MUST validate payloads using Zod schemas in `src/modules/<module>/domain/schemas/<module>.schema.ts` combined with `parseWithZod(schema, payload)`. Never use `class-validator` decorators (`@IsString`, `@IsNumber`, `@IsEnum`, etc.) or unchecked type casts (`as { ... }`).
  - **Timezone Standard**: The canonical timezone for Vietnam is `Asia/Ho_Chi_Minh` (UTC+7). All default timezone schema properties MUST use `Asia/Ho_Chi_Minh` (NOT `Asia/Saigon`). In raw SQL queries using `AT TIME ZONE`, handle legacy aliases safely with `CASE WHEN tz = 'Asia/Saigon' OR tz IS NULL THEN 'Asia/Ho_Chi_Minh' ELSE tz END`.
- Do not create architecture/rules/plans docs outside the canonical docs folders.
- Do not modify any `package.json` unless explicitly approved by the user.
- Do not add dependencies unless explicitly approved by the user.
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
- **Frontend Dropdown Rule**: Forms selecting entities (hotels, rooms, users) MUST render a `<select>` dropdown with human-readable names and codes. Never ask users to manually type raw UUID strings.
- **Frontend Navigation Compatibility**: When adding workspace navigation definitions in `workspace-registry.ts`, include active session fallback capabilities so active JWT sessions display navigation immediately without needing re-login.
- **SweetAlert2 Standard**: Use `SwalVietSage` (`src/libs/swal.ts`) for all confirm dialogs and alert notifications. Confirm dialogs must use `reverseButtons: false` (Confirm left, Cancel right). Success alerts must show the OK button (`showConfirmButton: true`, `confirmButtonText: "OK"`). Error alerts must extract human-readable error details from backend response payloads, suppressing raw status codes.
- **Excel & Google Sheets Synchronization Standard**:
  - **Replace-Mode Hard Sync**: In `replace` synchronization mode, items existing in the database but absent from the sheet MUST be hard-deleted. Before deleting parent rows (e.g., `MarketplaceCategory`), clean up or delete dependent child records (e.g., `MarketplaceService`) to prevent foreign key restriction (`onDelete: Restrict`) errors.
  - **Spreadsheet URL Auto-Persistence**: Frontends MUST auto-save entered Google Sheets / Excel URLs via a dedicated Zustand store with `persist` and `safeStorage` (e.g., `useMarketplaceAdminImportStore`) and auto-restore the input on load to eliminate repeated copying and pasting. Never read or write `localStorage` directly in feature components.
  - **Header Normalization & Parenthesized Aliases**: Import adapters MUST support normalized lowercase matching and parenthesized column header aliases (e.g., `"tên danh mục (tiếng việt)"`, `"tên (tiếng anh)"`, `"tên (tiếng trung)"`, `"tên (tiếng hàn)"`, `"tên (tiếng nga)"`, `"tên (tiếng ấn độ)"`).
  - **Summary Metric Key Fallbacks**: Preview summary API payloads and UI metric cards MUST align key names (`creates`/`create`, `updates`/`update`) with safe fallbacks (`creates ?? create ?? 0`) to prevent undefined or blank metrics.
- **UI Design, Typography, Copywriting & Ruthless Pruning Standard (Chuẩn mực UI, Cỡ Chữ & Tối Giản Giao Diện)**:
  - **Typography Floor Limit (Sàn Cỡ Chữ Tối Thiểu >= 12px)**: Strictly FORBIDDEN arbitrary micro-font classes (`text-[10px]`, `text-[11px]`, `text-[9px]`, sub-0.75rem, etc.). The absolute floor is `text-xs` (12px / 0.75rem). All text must satisfy WCAG AA contrast (>= 4.5:1).
  - **Typographic Balance & Anti-Widow/Orphan Standard**: Headings (`h1`, `h2`, `h3`, `h4`, card titles, modal titles) MUST use `text-balance` (CSS `text-wrap: balance`) to eliminate dangling orphan words ("gãy dòng cộc lốc" / single trailing words). Multi-line body copy / descriptions MUST use `text-pretty`. Badges, status pills, tags, chips, and action buttons MUST use `whitespace-nowrap`.
  - **Anti-Triple-Stacking & Semantic Partitioning**: Strictly FORBIDDEN triple-layer redundant stacking (Eyebrow + Heading + Subtitle repeating the same message). Eyebrow defines scope/category; Heading defines the primary action/entity; Subtitle defines instructions/value. Form containers for single-column auth/dialogs capped at `max-w-md` to `max-w-lg`.
  - **Ruthless UI Pruning (Cắt Giảm UI Dư Thừa)**: Strictly FORBIDDEN decorative nested cards (card-in-card syndrome), duplicate action buttons performing identical actions within the same view, giant decorative banners lacking fresh actionable information, and ambient blur overload (`blur-[160px]`).
  - **Zero Technical & Dev Leakage**: Strictly FORBIDDEN to expose internal developer notes, architectural reminders, or implementation comments on user interfaces (e.g., *"Nguồn dữ liệu có thể chuyển sang API..."*, *"tuyệt đối không động đến..."*). Never expose raw backend enum or role codes (e.g., `SUPER_ADMIN` must map to `Quản trị nền tảng`). Never display raw HTTP status codes in user toasts/dialogs (e.g., `(404 Not Found)`, `(Mã lỗi 500)` -> extract clean, human-readable error sentences). Never leak database or backend terms into user copy (e.g., *"trong DB"*, *"test đẩy lại BCA"*).
  - **Zero Wireframe & Draft Residue**: Strictly FORBIDDEN to leave wireframe index prefixes in section headings or subtitles (e.g., `"01 / "`, `"02 / "`, `"03 / "`). Never use developer test strings in placeholders or demo inputs (e.g., `"VD: Test"` -> use realistic hospitality examples like `"VD: Grand Saigon, SGSTAR"`).
  - **Professional Hospitality Tone & No Chinglish/Filler Words**: Do not use informal hybrid slang (e.g., `"full size"` -> `"ảnh gốc / bản gốc"`, `"Service Catalog / Danh mục dịch vụ"` -> `"Danh mục dịch vụ đối tác"`). Eliminate redundant trailing filler phrases (e.g., `"tại đây"`, `"ngay tại đây."`, `"tại đây ạ"`). Ensure concise, professional, hospitality-grade phrasing.
  - **Structured i18n Hygiene**: Multi-lingual user flows (Guest OS, Public, Marketing) MUST NOT hardcode strings in components. Never create duplicate or orphan translation keys with identical meanings (e.g., `messages.loadError` vs `messages.errorLoad`). When adding new dictionary keys, define them synchronously across all 6 supported locales (`vi`, `en`, `zh`, `ko`, `ru`, `hi`).
  - **Dialog & Modal Layout Standard (Chuẩn Box Ngang - Cấm Tuyệt Đối Box Dọc)**: Mọi màn hình popup thao tác, bảng dữ liệu, form nghiệp vụ, chi tiết đặt phòng, quản lý đoàn hoặc tác vụ hàng loạt BẮT BUỘC dùng **Box Ngang** căn giữa màn hình (Centered Horizontal Modal / Dialog: `max-w-4xl` đến `max-w-6xl`, `max-h-[92vh]`, `rounded-2xl`, `shadow-2xl`). CẤM TUYỆT ĐỐI dùng **Box Dọc** (Side Drawer / Right Slide-over chạy suốt mép phải màn hình `fixed inset-y-0 right-0`) cho các bảng dữ liệu hay tác vụ nghiệp vụ, vì gây chèn ép cột, bó hẹp tương tác và để trống lãng phí không gian hiển thị bên trái.
  - **Table Lean-Information Standard (Chuẩn Bảng Tinh Gọn - Tách Biệt Table & Detail View)**: Bảng dữ liệu (Table) CHỈ phục vụ quét nhanh và chọn dòng/thao tác hàng loạt. NGHIÊM CẤM nhồi nhét full thông tin, text phụ rườm rà (mã kỹ thuật dài, số điện thoại, giá tiền phụ, danh sách liệt kê số phòng `P.101, P.102...`) vào ô của table. Mỗi cell tối đa 1 thông tin chính kèm 1 badge gọn; toàn bộ thông tin chi tiết đầy đủ thuộc về màn hình **Xem Chi Tiết (Box Ngang)** khi click vào dòng.
  - **UI Verification Gate**: Frontend code modifications must pass the UI static verification check: `node scripts/verify-ui-rules.cjs` (auto-upgrade available via `--fix`).
- For frontend client server-state, use `@dangminhdev04032005/query-resource`: repository → resource → feature hook → component. Do not add a local copy of the package or write raw TanStack Query `queryKey`/`queryFn`/`mutationFn` configurations in pages or feature hooks. Raw hooks consume resource-generated options; the application `QueryClient` provider is exempt.
- Do not write secrets, tokens, passwords, API keys, or connection strings into docs or code.
- Do not commit unrelated modified/untracked files.
- Keep frontend/backend/shared API boundaries explicit.
- API behavior changes must update the relevant contract docs in the same task.
- Architecture docs should stay short; put detailed guidance in companion guide files.

## Mandatory UI/UX Quality Routing

For any task whose primary intent is UI inspection, UI repair, UX review, visual polish, responsive stabilization, typography/icon/layout correction, redesign of an existing frontend surface, or rendered-browser quality, load and follow:

- `.agents/skills/ui-quality-promax/SKILL.md`

The UI Quality Pro-Max skill is mandatory even when the user does not name it explicitly. Natural-language requests such as `soi lại giao diện`, `fix UI`, `fix UX`, `polish`, `responsive`, `review giao diện`, `ổn định dashboard`, `kiểm tra UI`, or `redesign existing page` trigger it.

When relevant local taste/design skills exist under `.agents/skills/`, they may be consulted only as supporting heuristics through UI Quality Pro-Max. Preserve VietSage's existing product identity, repository architecture, current design system, and security/business rules over taste-skill suggestions.

## Strict Audit Mode

For any audit/review request (`audit`, `review`, `rà soát`, `soát code`, architecture/system-design/module/repository/diff review) or explicit strict-mode trigger, follow:

- `.agents/rules/strict-audit-mode.md`

Audit/review deliverables use Ponytail ultra and the evidence/reporting format in the linked audit rules. Code Focus, Focused Execution and authorized remediation use [focused-execution](C:/Users/Dangminhdev0403/.agents/skills/focused-execution/SKILL.md) and [Efficient Execution and Validation](rules/zero-waste-validation.md); they do not become a fresh audit.

Worker briefs contain outcome, owned files, invariants/negative cases and the completion check. Reuse loaded instructions and source maps. The runtime owns dispatch identity and lifecycle; do not paste its preamble or after-completion boilerplate into each brief. One host consolidates worker evidence and runs remaining shared gates after files freeze.

## Before Final Report

For implementation, report changed behavior/files, actual validation outcomes and remaining blockers or unverified surfaces. Include docs only when changed or materially relevant. No mandatory file-inspection inventory, audit marker or evidence table unless that deliverable was requested. For audits, use the linked audit report format.
