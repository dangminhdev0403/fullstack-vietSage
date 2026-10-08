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
- **Backend Validation**: MUST use **`Zod`** schemas + `parseWithZod(...)`. FORBIDDEN to use `class-validator`, forbidden manual type casting `as { ... }`.
- **Timezone Standard**: MUST use canonical **`Asia/Ho_Chi_Minh`** (UTC+7). FORBIDDEN to use `Asia/Saigon`.
- **UI Copywriting & Clean UI Text Standard**: Strictly FORBIDDEN to expose internal dev notes, architectural comments, wireframe prefixes (`"03 / "`), raw enum/role codes (`SUPER_ADMIN`), raw HTTP status codes (`(404 Not Found)`, `(Mã lỗi 500)`), DB terms (`"trong DB"`), or developer test placeholders (`"VD: Test"`). All user-facing text MUST use professional hospitality phrasing, clean Vietnamese/English without slang or filler words (`"tại đây"`), and all i18n keys must be synchronized without duplicate/orphan keys.

## Strict Audit Mode

For any audit/review/verification request (`audit`, `review`, `rà soát`, `soát code`, architecture/system-design/module/repository/diff review) or explicit strict-mode trigger, follow [.agents/rules/strict-audit-mode.md](.agents/rules/strict-audit-mode.md). Audit read-only by default. Derive standards from the current repository; map the scoped system flow and invariants before checking technology fit. Every delegated reviewer MUST auto-activate strict audit from task intent; its card carries `STRICT_AUDIT_MODE: true`, exact scope/invariants/write policy, and its first substantive handoff starts `STRICT AUDIT MODE: ACTIVE.`. One host owns the system map/evidence while the fewest useful specialists review disjoint boundaries. Fixes require explicit implementation/remediation authorization.

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
