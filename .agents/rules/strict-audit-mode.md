# STRICT AUDIT MODE (SYSTEM DESIGN COMPLIANCE AUDIT)

## Activation

Activate when the user requests an audit/review, focused execution/remediation of audited findings, or says:

- `ACTIVATE STRICT AUDIT MODE ON`
- `BẬT CHẾ ĐỘ SIÊU RÀ SOÁT`
- `CHẾ ĐỘ SIÊU RÀ SOÁT`
- `SIÊU RÀ SOÁT`
- `BẬT CHẾ ĐỘ RÀ SOÁT KHÓ TÍNH`
- `RÀ SOÁT SIÊU KHÓ TÍNH`
- `SOAT CODE`
- `BẬT CHẾ ĐỘ TẬP TRUNG RÀ SOÁT`
- `CHẾ ĐỘ TẬP TRUNG RÀ SOÁT`
- `RÀ SOÁT TẬP TRUNG`
- `TẬP TRUNG RÀ SOÁT`
- `BẬT CHẾ ĐỘ TẬP TRUNG THỰC THI`
- `CHẾ ĐỘ TẬP TRUNG THỰC THI`
- `TẬP TRUNG THỰC THI`
- `BẬT CHẾ ĐỘ TẬP TRUNG CODE`
- `CHẾ ĐỘ TẬP TRUNG CODE`
- `TẬP TRUNG CODE`
- `STRICT AUDIT FOCUS`
- `FOCUS AUDIT`

Deactivate only on:

- `TURN OFF STRICT AUDIT MODE`
- `TẮT CHẾ ĐỘ SIÊU RÀ SOÁT`
- `TẮT CHẾ ĐỘ RÀ SOÁT KHÓ TÍNH`
- `TẮT CHẾ ĐỘ TẬP TRUNG RÀ SOÁT`

A review request is read-only by default. Non-destructive inspection and verification are allowed. Do not edit, autofix, install dependencies, mutate data, commit, deploy, or create remediation tasks unless the user explicitly requests implementation/fixes. Strict mode increases evidence quality; it does not expand authorization.

### Silent Execution, Ponytail Max (`ultra`) & Output-Only Standard (Chuẩn Thực Thi Ngầm 100% — Siêu Rà Soát, Tập Trung Code & Tập Trung Thực Thi)

Khi bật **Chế độ Siêu Rà Soát (`Strict Audit Mode`)**, **Tập Trung Code (`Code Focus`)**, hoặc **Tập Trung Thực Thi (`Focused Execution / Remediation`)**, mức độ **Ponytail tự động kích hoạt ở mức tối đa (`ultra` / max)** và **khóa cứng cơ chế Thực Thi Ngầm 100% (100% Silent Execution)** xuyên suốt cả lượt rà soát lẫn lượt sửa lỗi / điều phối đa agent (`orca-cli`):
- **Ponytail Max (`ultra`)**: Áp dụng triết lý *deletion before addition* — chất vấn sự cần thiết của mọi tầng trung gian, abstraction, helper, config hoặc đoạn code phình đại; ưu tiên cắt bỏ code thừa trước khi đề xuất thêm code mới; hướng khắc phục (`Minimum correction`) bắt buộc là phương án tối giản nhất, ngắn nhất và đi thẳng vào nguyên nhân gốc (root cause).

Bắt buộc thực thi trong trạng thái **hoàn toàn im lặng (100% ngầm) và chỉ trả lời đúng một lần ở đầu ra cuối cùng**:

1. **Zero Pre-Tool Preamble & Zero Intermediate Chatter (CẤM TUYỆT ĐỐI spam tin nhắn mở đầu hoặc trung gian khi gọi tool)**:
   - Ngay khi nhận lệnh (dù là rà soát, code trực tiếp, hay sửa lỗi hàng loạt qua `orca-cli` nhiều tab Codex/Antigravity), agent **BẮT BUỘC gọi tool ngay lập tức mà KHÔNG kèm bất kỳ đoạn văn bản mở đầu nào**.
   - **NGHIÊM CẤM** phát sinh các câu tự thuật kế hoạch trước hoặc giữa các lần gọi tool (ví dụ: CẤM viết *"Tôi sẽ sửa các lỗi đã xác nhận trong cả hai lượt rà soát..."*, *"Tôi sẽ dùng skill orca-cli để kiểm tra các tab..."*, *"Tôi đang đọc file X..."*, *"Chờ tôi chạy lệnh test..."*).
   - Trên Codex CLI / Codex Desktop, **CẤM phát thông điệp ở kênh `commentary`** trước/giữa chuỗi tool calls. Mọi phân tích, lập kế hoạch chia lane `orca-cli`, đối chiếu invariants và kiểm tra kết quả diễn ra 100% trong suy nghĩ nội bộ (`<thought>`) và payload công cụ.
2. **Single Consolidated Output (Đầu ra duy nhất - Báo cáo Cuối cùng hoàn chỉnh với bằng chứng `VIOLATION | GAP | COMPLIANT`)**:
   - Chỉ xuất ra tin nhắn trả lời người dùng **ĐÚNG MỘT LẦN DUY NHẤT** khi toàn bộ quá trình rà soát HOẶC toàn bộ quá trình sửa lỗi + gom kết quả worker + chạy lệnh kiểm chứng (validation gates) đã hoàn thành 100%.
   - Bắt đầu báo cáo tổng hợp cuối cùng này với marker `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).` Tuyệt đối không gửi marker này trơ trọi thành một tin nhắn rác trước khi chạy tool.
   - Cả ở lượt **Rà soát (Audit)** lẫn lượt **Thực thi sửa lỗi (Remediation / Focused Execution)**, báo cáo cuối cùng BẮT BUỘC có bảng đối chiếu bằng chứng xác thực phân loại rõ từng mục theo chuẩn `VIOLATION | GAP | COMPLIANT` (nếu là lượt sửa lỗi thì chứng minh rõ từng mục từ `VIOLATION -> COMPLIANT` kèm `file:line`, diff tóm tắt, lệnh test đã chạy + exit code, và các mục còn là `GAP` nếu chưa chạy môi trường thực).
3. **Quiet Subagent & `orca-cli` Multi-Tab Aggregation (Điều phối đa agent 100% ngầm)**:
   - Khi fan-out subagent hoặc điều phối nhiều tab Codex/Antigravity qua `orca-cli` (P1–P4 theo Ponytail), Lead Host thực hiện kiểm tra terminal, tạo run, gửi prompt, chờ hoàn tất và kiểm chứng diff **hoàn toàn ngầm**; không thông báo kế hoạch chia tab hay cập nhật trạng thái chờ giữa chừng cho người dùng.
   - Lead Host tự tổng hợp kết quả, loại bỏ trùng lặp, kiểm tra lại bằng chứng thực tế trên mã nguồn/test, và chỉ xuất trình duy nhất một Báo cáo Cuối cùng (Final Report) chuẩn mực.

### Mandatory agent auto-activation

Any delegated agent assigned audit, review, verification, architecture assessment, code review, QA review, or security review MUST activate this mode and **Ponytail `ultra` (max)** from task intent. This is mandatory, not subjective.

Every review card/prompt MUST include:

```text
STRICT_AUDIT_MODE: true
PONYTAIL_LEVEL: ultra
AUDIT_SCOPE: <exact paths, symbols, flows, or boundary>
AUDIT_INVARIANTS: <repository-backed behavior to verify>
WRITE_POLICY: read-only | remediation-authorized
```

The reviewer runs all evidence collection silently, includes `STRICT AUDIT MODE: ACTIVE.` at the top of its single consolidated final report/handoff, and presents only verified findings. Missing marker: self-activate, report orchestration drift, never downgrade to an informal review. Descendant review cards inherit the marker and exact boundary. Unrelated implementation cards do not. Combined review-and-fix tasks audit first; fixes run only under explicit remediation authorization and existing protected gates.

## Core Standard

Audit the system the repository actually implements. The audit is **design-first and stack-agnostic**. Technology compliance is one final dimension, not the audit's organizing principle.

Resolve the expected standard in this order:

1. User goal, acceptance criteria, and protected constraints.
2. Current runtime behavior, manifests, schemas, contracts, configuration, and tests.
3. Canonical architecture/rules/ADRs and nearest-scope instructions.
4. Existing shared project primitives and established local patterns.
5. Language/framework/platform idioms.
6. Generic best practices.

Current source is capability truth. Canonical architecture docs are intent truth. A material mismatch is a finding; neither silently overrides the other. Never impose VietSage-specific libraries, folders, commands, or any other project's technology choices on an unrelated project.

Strictness means:

- no finding without a violated invariant or repository-backed standard;
- no `COMPLIANT` claim without positive evidence;
- no scanner/agent opinion treated as proof;
- no personal style, speculative rewrite, or equivalent technology choice reported as a violation;
- no broad file scan substituted for end-to-end system coverage.

## Required Workflow

### 1. Freeze the audit boundary

Record:

- requested repository/module/flow/diff;
- baseline and dirty/untracked state;
- included and excluded paths;
- expected behavior and negative cases;
- protected actions;
- available runtime and test evidence.

For diff review, include tracked changes and relevant untracked files. Never stash, reset, stage, or rewrite unrelated work.

### 2. Build the minimum system map

Map only the scoped flow:

- actors and entry points;
- components/modules and ownership;
- dependency direction and trust boundaries;
- API/contracts/events/data stores/external systems;
- critical state transitions and failure paths;
- deployment/runtime boundary when relevant.

Use Graphify/Repomix under repository policy when available. Start from target symbols or flows; expand one dependency hop at a time. Widen only when the map has a stated evidence gap.

### 3. Define invariants

State the observable rules the system must preserve: authorization, tenancy/ownership, business state, money/precision, idempotency, consistency, compatibility, privacy, failure handling, accessibility, and operational readiness as applicable.

Trace each invariant through producer, transport, consumer, persistence, and verification where relevant.

### 4. Audit in design-first order

| Area | Required questions |
|---|---|
| Requirements | Does behavior satisfy the stated goal and negative cases? |
| Architecture and boundaries | Is ownership clear? Are dependency directions and public interfaces respected? |
| End-to-end flow | Do actors, entry points, services, contracts, data, UI/clients, and failure paths agree? |
| Data and state | Are invariants, transactions, concurrency, ordering, idempotency, lifecycle, migration, and recovery correct? |
| Trust and safety | Are validation, authn/authz, tenant/resource isolation, secrets/PII, abuse controls, and auditability correct? |
| Reliability | Are timeouts, retries, partial failure, restart behavior, fallbacks, and data-loss prevention explicit? |
| Operability | Are configuration, deployment, compatibility, observability, diagnostics, rollback, and support paths adequate? |
| Performance | Are bottlenecks, fan-out, unbounded work, scaling assumptions, and resource ceilings acceptable for the real workload? |
| User boundary | When applicable: accessibility, error/loading/empty states, locale/i18n hygiene, responsive behavior, safe feedback, clean professional copywriting (zero technical/dev leakage, no wireframe numbering, no raw enums/HTTP errors, no test strings), **UI Design Gate compliance**: typography floor >= 12px (strictly no sub-12px micro-fonts), zero fluff/boilerplate sentences, ruthless UI pruning (no nested cards, no duplicate actions, no banner/blur bloat), verified via `node scripts/verify-ui-rules.cjs`. |
| Maintainability | **Ponytail Max (`ultra`) compliance**: Is complexity necessary, or can code/abstractions be deleted outright (deletion before addition)? Are shared primitives reused? Does duplication create inconsistent behavior or duplicate/orphan i18n keys? |
| Technology fit | Does implementation follow the current project's actual stack, installed dependencies, platform primitives, and local conventions? |

Technology fit comes last. A preferred library does not excuse a broken system invariant. A raw platform primitive is not automatically wrong when the repository permits it or the abstraction cannot satisfy the requirement.

### 5. Verify every finding

A `VIOLATION` requires:

1. an explicit invariant or repository-backed expected design;
2. exact source/runtime evidence;
3. a concrete system effect or credible failure path;
4. the minimum correction direction;
5. a verification method.

Use `GAP` when evidence or test coverage is missing. Use `COMPLIANT` only with positive evidence. Run only project-defined, non-destructive checks needed for the scoped claims. Discover commands from manifests/docs; never hardcode one language's gates. Typecheck/build alone does not prove business behavior, authorization, async behavior, or runtime integration.

## Agent Coordination

When agents are requested or orchestration is available:

1. One host orchestrator owns scope, system map, invariant ledger, shared assumptions, evidence rules, and final deduplication.
2. Use the fewest useful reviewers. A small local diff may need one specialist. A cross-layer/module/repository audit normally uses 2–4 disjoint read-only lanes.
3. Split by system boundary or invariant, not merely by language: architecture/dependencies; contracts/data/state; trust/security/reliability; runtime/UX/QA.
4. Every lane receives exact paths/flows, invariants, allowed non-destructive commands, forbidden actions, and the finding schema below.
5. Do not launch duplicate general reviewers or all available agents by default.
6. The host verifies every candidate finding against current source/runtime. Agent consensus is not evidence.
7. Use one independent tester/reviewer at the frozen combined boundary only when explicit or justified by high-risk/shared-contract scope.
8. Review cards remain read-only. Create remediation cards only after the user explicitly requests fixes; writers then get disjoint ownership and focused checks.
9. If agents are unavailable, the host performs the same matrix directly and reports that orchestration was skipped.

## Finding & Remediation Verification Format

```text
ID:
Classification: VIOLATION | GAP | COMPLIANT
Impact: Blocking | Non-blocking
Confidence: High | Medium | Low
Location: file:line, symbol, endpoint, schema, or runtime boundary
Invariant / expected design:
Evidence (or Applied Root-Cause Fix + Diff):
System effect / failure path:
Minimum correction:
Verification (exact command, exit code, unique test count, or runtime proof):
```

Do not emit severity labels disconnected from a violated invariant. `Impact` controls remediation order; `Confidence` states evidence quality. During a remediation / focused execution turn (`Tập trung thực thi`), every previously identified `VIOLATION` must be re-verified and explicitly transitioned to `COMPLIANT` (with positive code + test evidence) or `GAP` (if a runtime/environment gate could not be executed).

## Final Report

Emit a **single consolidated Final Report** (after 100% silent execution of all reads, edits, `orca-cli` workers, and validation commands) starting with `STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).`:

1. `Verdict: PASS | FAIL | PARTIAL | BLOCKED`.
2. Scope, baseline, and compact system map.
3. Coverage & Verification Matrix: `COMPLIANT | VIOLATION | GAP | N/A`, each backed by concrete source/test/runtime evidence.
4. Deduplicated findings / remediated items ledger (`VIOLATION | GAP | COMPLIANT`) ordered by dependency and user impact.
5. Commands/tools run with real outcomes (exact command, exit code, unique test count).
6. Agents/`orca-cli` tabs used or skipped, exact lane ownership, and disagreements resolved (executed 100% silently without intermediate user messages).
7. Untested surfaces, blockers, and protected next actions.

## Closure

The **audit** is complete when the scoped system map and invariants are explicit, every applicable matrix area has evidence or a declared gap, findings are verified/deduplicated, and skipped checks are named. Audit completion does not require code changes.

**Remediation / Focused Execution (`Tập trung thực thi`)** follows the exact same **100% Silent Execution & Single Final Report** discipline: confirmed violations fixed at the root cause with zero pre-tool or mid-turn chatter, invalidated checks rerun, integrated behavior verified, and every item reported in the final `VIOLATION | GAP | COMPLIANT` ledger. Never claim audit or remediation success from 100% line coverage, a scanner-only result, or one generic build command.
