# Agent Instructions for fullstack-vietSage

The canonical ruleset is [`.agents/AGENTS.md`](.agents/AGENTS.md). Read it and follow its task-specific routes; do not duplicate its rules here.

All agents (Codex, Antigravity and other runners) MUST apply [Efficient Execution and Validation](.agents/rules/zero-waste-validation.md): reuse context, freeze the scoped acceptance criteria, coordinate disjoint ownership, run only necessary checks, and stop when the work is verified.

Audit/review requests also follow [Strict Audit Mode](.agents/rules/strict-audit-mode.md). An authorized fix remains implementation through its scoped validation. Protected operations still require their existing approval.

Agents without global Ponytail settings also read `PONYTAIL.md` before coding.

---

## Mandatory Codex & Runner Silent Execution Contract (100% Thực Thi Ngầm)

This rule is injected at Turn 0 and overrides default conversational/commentary habits across **all three operational modes**:

1. **Chế độ Siêu Rà Soát / Rà Soát Tập Trung (`Strict Audit Mode` — `PONYTAIL_LEVEL: ultra`)**:
   - Triggered by: `siêu rà soát`, `bật chế độ siêu rà soát`, `rà soát khó tính`, `rà soát tập trung`, `soát code`, `audit`, `review`, `STRICT_AUDIT_MODE: true`.
2. **Chế độ Tập Trung Code (`Code Focus Mode` — `PONYTAIL_LEVEL: full | ultra`)**:
   - Triggered by: `tập trung code`, `bật chế độ tập trung code`, `code focus`, or any direct coding/refactoring request.
3. **Chế độ Tập Trung Thực Thi (`Focused Execution / Remediation Mode` — `PONYTAIL_LEVEL: ultra`)**:
   - Triggered by: `tập trung thực thi`, `bật chế độ tập trung thực thi`, or any follow-up command to fix/remediate audited issues (including multi-agent `orca-cli` fan-out across Codex/Antigravity tabs).

### Hard Execution Invariants (Zero Exceptions in Codex & Antigravity)

- **100% Silent Tool & Orchestration Execution (CẤM spam tin nhắn trung gian)**:
  - **STRICTLY FORBIDDEN**: Sending any pre-tool preamble, plan announcement, or intermediate progress commentary before or between tool calls (e.g., *"Tôi sẽ sửa các lỗi..."*, *"Tôi sẽ dùng skill orca-cli để kiểm tra..."*, *"Đang đọc file..."*, *"Chờ worker hoàn tất..."*).
  - In Codex, do **NOT** emit assistant text or `commentary` messages alongside or prior to tool invocations (`Read`, `Edit`, `Write`, `apply_patch`, `powershell`/`bash`, `orca`, subagents). Keep all planning and step transitions strictly inside internal reasoning (`<thought>`) until the entire task and verification gates are 100% finished.
- **Single Consolidated Final Report (Chỉ xuất DUY NHẤT 1 Báo cáo Cuối cùng)**:
  - Emit **exactly one** user-visible response at the very end of the turn after all inspections, edits, subagent/`orca` fan-in, and scoped validation commands have completed.
  - Begin Audit reports (and Post-Audit Remediation reports) with: `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).`
- **Mandatory Verified Evidence Ledger (`VIOLATION | GAP | COMPLIANT`)**:
  - Every Audit report AND every Post-Audit Remediation / Focused Execution report MUST include an explicit verification matrix and finding ledger classifying each item as `VIOLATION | GAP | COMPLIANT`:
    - `VIOLATION`: Violated invariant + exact `file:line` / runtime evidence + system effect + minimum root-cause correction + verification command.
    - `GAP`: Unverified surface or blocked runtime check (e.g., real browser/DB/VPS not run) with exact reason. Never claim `PASS` or `COMPLIANT` on unrun checks.
    - `COMPLIANT`: Positive source + executed test/gate evidence (command + exit code + unique test count), or `VIOLATION -> COMPLIANT` with exact diff and passing verification output after remediation.

