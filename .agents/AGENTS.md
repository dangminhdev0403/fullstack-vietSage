# Agent Instructions for fullstack-vietSage

These instructions are mandatory for Codex and any delegated coding agent working in this repository.

---

## Graphify + Repomix Code Navigation Policy

### Primary Rule

Do NOT scan the entire repository by default.

Always use `graphify-out/` as the primary navigation index, then use Repomix to pack only the graph-selected working set before reading source files.

Treat `graphify-out/graph.json` as the authoritative project map.

### Graph Schema Reference

#### `graphify-out/graph.json`

NetworkX node-link format (~160k lines, ~7 MB). Top-level keys:

| Key | Purpose |
|---|---|
| `nodes[]` | Every symbol/file in the project. Each node has `id`, `label`, `source_file`, `source_location`, `community`, `norm_label`. |
| `links[]` | Directed/undirected edges. Each link has `relation` (`contains`, `imports`, `imports_from`, `calls`, …), `source`, `target`, `source_file`, `source_location`, `confidence` (`EXTRACTED` / `INFERRED`), `weight`, `confidence_score`. |
| `hyperedges[]` | Multi-target relationships (currently empty). |
| `built_at_commit` | Git SHA the graph was built from. |

#### `graphify-out/.graphify_analysis.json`

Higher-level structural analysis (~5k lines). Top-level keys:

| Key | Purpose |
|---|---|
| `communities` | Map of `community_id → [node_id, …]`. Groups of tightly-coupled symbols. |
| `cohesion` | Map of `community_id → float`. Internal coupling density. |
| `gods` | Array of hub nodes sorted by degree (highest-degree first). |
| `surprises` | Unexpected cross-community edges with `source`, `target`, `source_files`, `confidence`, `relation`, `why`. |
| `tokens` | LLM token accounting (informational). |

#### `graphify-out/manifest.json`

File-level metadata: `source_file → { mtime, ast_hash, semantic_hash }`. Use to check whether a file has changed since the graph was built.

#### `graphify-out/cache/stat-index.json`

Full filesystem stat index: absolute path → `{ size, mtime_ns, word_count, hashes }`.

#### `graphify-out/cache/ast/v0.9.20/*.json`

Per-file AST caches keyed by content hash.

### Required Workflow

For every coding task:

1. **Start from the graph, not the filesystem.**
   - Grep or parse `graph.json` to find relevant nodes by `label`, `norm_label`, or `source_file`.
   - Use `links[]` to trace `imports`, `imports_from`, `calls`, `contains` relationships.
   - Use `.graphify_analysis.json → communities` to identify related symbol clusters.
   - Use `.graphify_analysis.json → gods` to identify high-coupling hub nodes.
   - Use `.graphify_analysis.json → surprises` to catch non-obvious cross-boundary dependencies.

2. **Build the smallest possible working set.**
   - Identify the target symbol(s) in `nodes[]`.
   - Traverse `links[]` one hop at a time to find direct dependencies.
   - Resolve `source_file` paths to actual files only after the working set is defined.

3. **Read only those files.**
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

---

## Required Reading Before Changes

Start from the closest relevant documentation scope. Do not load every markdown file by default.

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
3. The task-specific guide:
   - feature/module work: `frontends/front-end-vietsage/docs/MODULE_GUIDE.md`
   - API/contract work: `frontends/front-end-vietsage/docs/CONTRACT_GUIDE.md`
   - runtime/UI/state/realtime/error/i18n work: `frontends/front-end-vietsage/docs/RUNTIME_UI_GUIDE.md`
   - planning/progress work: `frontends/front-end-vietsage/docs/PLANS.md`

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
   - planning/progress work: `services/docs/PLANS.md`

## Hard Rules

- Do not create architecture/rules/plans docs outside the canonical docs folders.
- Do not modify any `package.json` unless explicitly approved by the user.
- Do not add dependencies unless explicitly approved by the user.
- **Backend Validation Standard**: All NestJS controller endpoints MUST validate payloads using Zod schemas in `src/modules/<module>/domain/schemas/<module>.schema.ts` combined with `parseWithZod(schema, payload)`. Never use `class-validator` decorators (`@IsString`, `@IsNumber`, `@IsEnum`, etc.).
- **Timezone Standard**: The canonical timezone for Vietnam is `Asia/Ho_Chi_Minh` (UTC+7). All default timezone schema properties MUST use `Asia/Ho_Chi_Minh` (NOT `Asia/Saigon`). In raw SQL queries using `AT TIME ZONE`, handle legacy aliases safely with `CASE WHEN tz = 'Asia/Saigon' OR tz IS NULL THEN 'Asia/Ho_Chi_Minh' ELSE tz END`.
- **Frontend Dropdown Rule**: Forms selecting entities (hotels, rooms, users) MUST render a `<select>` dropdown with human-readable names and codes. Never ask users to manually type raw UUID strings.
- **Frontend Navigation Compatibility**: When adding workspace navigation definitions in `workspace-registry.ts`, include active session fallback capabilities so active JWT sessions display navigation immediately without needing re-login.
- **SweetAlert2 Standard**: Use `SwalVietSage` (`src/libs/swal.ts`) for all confirm dialogs and alert notifications. Confirm dialogs must use `reverseButtons: false` (Confirm left, Cancel right). Success alerts must show the OK button (`showConfirmButton: true`, `confirmButtonText: "OK"`). Error alerts must extract human-readable error details from backend response payloads, suppressing raw status codes.
- **Excel & Google Sheets Synchronization Standard**:
  - **Replace-Mode Hard Sync**: In `replace` synchronization mode, items existing in the database but absent from the sheet MUST be hard-deleted. Before deleting parent rows (e.g., `MarketplaceCategory`), clean up or delete dependent child records (e.g., `MarketplaceService`) to prevent foreign key restriction (`onDelete: Restrict`) errors.
  - **Spreadsheet URL Auto-Persistence**: Frontends MUST auto-save entered Google Sheets / Excel URLs into `localStorage` (e.g., `vietsage_marketplace_category_sheet_url`) and auto-restore the input on load to eliminate repeated copying and pasting.
  - **Header Normalization & Parenthesized Aliases**: Import adapters MUST support normalized lowercase matching and parenthesized column header aliases (e.g., `"tên danh mục (tiếng việt)"`, `"tên (tiếng anh)"`, `"tên (tiếng trung)"`, `"tên (tiếng hàn)"`, `"tên (tiếng nga)"`, `"tên (tiếng ấn độ)"`).
  - **Summary Metric Key Fallbacks**: Preview summary API payloads and UI metric cards MUST align key names (`creates`/`create`, `updates`/`update`) with safe fallbacks (`creates ?? create ?? 0`) to prevent undefined or blank metrics.
- For frontend client server-state, use `@dangminhdev04032005/query-resource`: repository → resource → feature hook → component. Do not add a local copy of the package or write raw TanStack Query `queryKey`/`queryFn`/`mutationFn` configurations in pages or feature hooks. Raw hooks consume resource-generated options; the application `QueryClient` provider is exempt.
- Do not write secrets, tokens, passwords, API keys, or connection strings into docs or code.
- Do not commit unrelated modified/untracked files.
- Keep frontend/backend/shared API boundaries explicit.
- API behavior changes must update the relevant contract docs in the same task.
- Architecture docs should stay short; put detailed guidance in companion guide files.

## Before Final Report

Report:

- files inspected;
- files changed;
- validation commands run and real results;
- docs updated;
- remaining risks/blockers.
