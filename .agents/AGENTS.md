# Agent Instructions for fullstack-vietSage

These instructions are mandatory for Codex and any delegated coding agent working in this repository.

---

## Graphify-first Code Navigation Policy

### Primary Rule

Do NOT scan the entire repository by default.

Always use `graphify-out/` as the primary navigation index before reading any source files.

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

**The graph is the source of navigation.**
**The filesystem is only the source of implementation details.**

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
