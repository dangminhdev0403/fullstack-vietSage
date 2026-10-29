# Agent Instructions for fullstack-vietSage

These instructions are mandatory for Codex and any delegated coding agent working in this repository.

## Execution Priority

- Follow the current user intent. Audit-only stays read-only; explicit fixes authorize the scoped implementation through validation and handoff. Internal verification during an implementation task does not start another repository audit.
- Apply [Efficient Execution and Validation](rules/zero-waste-validation.md) to every task. It is the canonical policy for file/read budgets, navigation exceptions, worker coordination, check selection and completion; it replaces older blanket quotas and repeated-check defaults. It does not override protected operations, explicit user limits or mandatory project gates.
- Reuse instructions and evidence already loaded in this conversation. Read only missing or changed relevant sections. No new plan file, worker or full-system discovery for a local correction or documentation-only task.

---

## Graphify + Repomix Code Navigation Policy

### Primary Rule

When the user types `/graphify`, use the installed Graphify skill/instructions first. Dirty `graphify-out/` files alone are not a reason to skip navigation.

Do NOT scan the entire repository by default.

Always use `graphify-out/` as the primary navigation index, then use Repomix to pack only the graph-selected working set before reading source files.

Treat `graphify-out/graph.json` as the authoritative project map.

### Navigation References

- `graphify-out/graph.json`: `nodes[]` identify symbols and source locations; `links[]` identify dependencies; `built_at_commit` records the graph revision.
- `graphify-out/manifest.json`: check selected-file freshness before trusting cached relationships.
- For broad architecture work, start from `graphify-out/wiki/index.md` when present. Read `graphify-out/GRAPH_REPORT.md` only when that scope needs it. Do not dump full graphs, manifests or AST caches.

### Required Workflow

For implementation discovery (reuse a valid scoped map on continuation; docs/rules-only tasks use their exact named paths):

1. **Start from the graph, not the filesystem — with Symbolic Anchoring.**
   - **DO NOT run `graphify query` with long natural-language user prompts** (> 3 words or descriptive error reports). Naive NL queries trigger broad BFS traversal and explode irrelevant nodes across the 14MB graph.
   - **Extract 1–2 Domain Anchor Symbols first** (e.g., `HotelOpsRealtimeNotifier`, `useOwnerRequestRealtime`, `RequestRealtimeGateway`).
   - Run `graphify explain "<Symbol>"` or `graphify affected "<Symbol>"` (or inspect `graph.json` directly) to retrieve the exact 1-hop neighborhood in 1–2 seconds.
   - Use `links[]` to trace direct `imports`, `calls`, `contains` relationships.
   - Use `.graphify_analysis.json → communities` to identify related symbol clusters.
   - Use `.graphify_analysis.json → gods` to identify high-coupling hub nodes.

2. **Build the smallest possible working set (Zero Repo Scan).**
   - Identify the target symbol(s) in `nodes[]`.
   - Never search, grep, or walk the entire filesystem at turn 1 (zero-repo-scan policy).
   - Traverse `links[]` one hop at a time to find direct dependencies (typically 3–5 files).
   - Resolve `source_file` paths to actual files only after the working set is defined.

3. **Pack with Scoped Repomix & read only those files.**
   - Pack the resolved paths into `graphify-out/repomix/task-scope.xml`.
   - Open only files identified by the graph traversal.
   - Prefer reading specific line ranges using `source_location`.

4. **Perform the requested analysis or modification.**

### File Reading Policy

**Forbidden:**
- Reading every controller, service, or module
- Walking the entire repository tree
- Globbing entire `src/**` or `services/**`
- Expanding to unrelated files "just in case"

**Required:**
- Navigate through graph relationships
- Open only directly relevant files
- Expand one dependency hop at a time
- Check `manifest.json` to verify graph freshness before trusting cached data

### Escalation Rule

Only widen the search beyond the graph if:

- The required symbol is absent from `nodes[]`
- Generated/dynamic code is missing from the graph
- Dynamic imports prevent static resolution
- The `manifest.json` timestamps show the graph is outdated vs. the file

Before expanding, **explain clearly why the graph is insufficient** for the current task.

### Performance Goal

Minimize:
- Token usage
- Repository scanning
- Unnecessary file reads

**Mandatory pipeline:** Graphify query/impact map → minimal file list → scoped Repomix pack → exact current source ranges → edit/test.

**The graph is the source of navigation.**
**Repomix is the compact working-set context.**
**The filesystem is only the source of implementation truth.**

### Scoped Repomix Rule

After Graphify identifies the minimal working set, pack only those paths:

```bash
npx repomix@latest . --include "path/a.ts,path/b.ts,path/a.spec.ts" --compress --style xml --output graphify-out/repomix/task-scope.xml
```

- Never pack the whole repository when Graphify produced a bounded file set.
- Search/read the scoped pack before opening current source ranges.
- If Repomix excludes a selected path through its security scanner, record the exclusion; never bypass the scanner. Read only that Graphify-selected file's exact current source range directly.
- If Repomix is unavailable, record the command/error, then read only Graphify-selected ranges; do not widen scope.
- Broad `search_files`, repository walking, guessed-file browsing, and direct whole-tree grep are fallback-only. State the exact Graphify/Repomix gap before fallback.

### Graphify Maintenance

After completing an entire feature, module, or major refactor (NOT after every individual code change), refresh the project graph by executing:

```bash
graphify update . --force
```

A "module completed" includes examples such as:

- Authentication
- RBAC
- User Management
- Hotel Workspace
- Table Management
- Order Management
- Payment Integration
- Any major refactor

**Do NOT** run Graphify after every file edit. Reuse the existing graph throughout implementation. Only refresh the graph once when the module is considered complete, so future tasks use the latest project structure.

For minor edits and all validation selection, follow [Efficient Execution and Validation](rules/zero-waste-validation.md). Do not refresh Graphify for local corrections or documentation changes.

---

## Scope and Protected Boundaries

- Implement only the requested outcome. Report unrelated findings without fixing them. Preserve unrelated dirty/untracked work.
- Local UI/alert/style tasks stay in their assigned UI surface; do not change backend, BFF, contracts or other screens to hide an error.
- During database/data/seed/VPS/Docker operations, application source is read-only. Diagnose failures in the requested environment. Application remediation needs separate authorization.
- Migrations applied to a database, destructive data changes, user-file deletion, credentials, global configuration, package/lockfile changes, infrastructure, provider writes, deployment and commit/push/merge retain their existing approval gates. Finish independent safe work while a protected operation waits.
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
