# Agent Instructions for fullstack-vietSage

> **Canonical ruleset lives in [`.agents/AGENTS.md`](.agents/AGENTS.md).**
>
> This file exists for tools that only read the repo root. All rules (including the Graphify-first navigation policy) are defined in `.agents/AGENTS.md`.

See [.agents/AGENTS.md](.agents/AGENTS.md) for the full agent instructions. Agents without global Ponytail settings also read `PONYTAIL.md` before coding.

## graphify

This project uses Graphify for dependency/impact navigation and Repomix for compact task-scoped source context.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- **Symbolic Anchoring (Thu hẹp theo Symbol, KHÔNG query câu văn tự nhiên dài)**: Tuyệt đối không nạp câu mô tả/prompt tự nhiên dài (> 3 từ) vào `graphify query`. Bắt buộc trích xuất 1–2 Anchor Symbols kỹ thuật trước, rồi dùng `graphify explain "<Symbol>"`, `graphify affected "<Symbol>"`, hoặc `graphify path` để lấy 1-hop lân cận trong 1–2 giây.
- **Zero-Repo-Scan ở lượt đầu (Chưa cần quét repo)**: Cấm tuyệt đối `find`, `grep` toàn repo hay duyệt cây thư mục ở bước đầu. Chỉ đóng gói 3–5 file từ Anchor Symbol bằng Repomix (`--include`, `--compress`) dưới `graphify-out/repomix/`; đọc pack trước khi mở source code chi tiết.
- If Repomix's security scanner excludes a selected path, record it and read only that Graphify-selected file's exact source range; never bypass the scanner.
- Do not begin with broad search, repository walking, direct whole-tree grep, or guessed-file browsing. These are fallback-only after stating the exact Graphify/Repomix gap.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Run `graphify update . --force` only after completing an entire feature/module or major refactor. For routine/minor edits (chỉnh UI nhẹ, đổi tên, text/copy, styling tweaks), do NOT run graphify update.
