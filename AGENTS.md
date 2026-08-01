# Agent Instructions for fullstack-vietSage

> **Canonical ruleset lives in [`.agents/AGENTS.md`](.agents/AGENTS.md).**
>
> This file exists for tools that only read the repo root. All rules (including the Graphify-first navigation policy) are defined in `.agents/AGENTS.md`.

See [.agents/AGENTS.md](.agents/AGENTS.md) for the full agent instructions.

## graphify

This project uses Graphify for dependency/impact navigation and Repomix for compact task-scoped source context.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"`, `graphify explain "<concept>"`, and `graphify affected "<symbol>"` to produce a minimal file set.
- Pack only that file set with Repomix (`--include`, `--compress`) under `graphify-out/repomix/`; inspect the pack before opening exact current source ranges.
- If Repomix's security scanner excludes a selected path, record it and read only that Graphify-selected file's exact source range; never bypass the scanner.
- Do not begin with broad search, repository walking, direct whole-tree grep, or guessed-file browsing. These are fallback-only after stating the exact Graphify/Repomix gap.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
