---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- **Symbolic Anchoring (Thu hẹp theo Symbol, KHÔNG query câu văn tự nhiên dài)**:
  - TUYỆT ĐỐI KHÔNG nạp cả câu mô tả/prompt tự nhiên dài của người dùng (> 3 từ hoặc câu văn mô tả lỗi) vào `graphify query "<câu prompt>"`. Việc này khiến BFS bung ra hàng chục node rác không liên quan (từ OCR, README, KBTT, enum...).
  - BẮT BUỘC phân loại domain và trích xuất 1–2 **Anchor Symbols** kỹ thuật (tên Component, Hook, Service, Gateway, Schema) trước.
  - Ưu tiên chạy `graphify explain "<Symbol>"` hoặc `graphify affected "<Symbol>"` (hoặc MCP `get_node`) để lấy chính xác 1-hop lân cận trong 1–2 giây thay vì chạy query toàn đồ thị.
- **Zero-Repo-Scan ở lượt đầu (Chưa cần quét repo)**:
  - CẤM TUYỆT ĐỐI agents dùng `find_files`, `grep_search` toàn repo, duyệt cây thư mục `src/**` hoặc `services/**` ở turn đầu tiên.
  - Sau khi lấy được 3–5 file nguồn từ Anchor Symbol, BẮT BUỘC đóng gói bằng Repomix (`npx repomix@latest . --include "path/a,path/b" --compress --style xml --output graphify-out/repomix/task-scope.xml`) và chỉ đọc file đó.
- **Realtime & Alert Domain Symbols Cheat Sheet**:
  - *Lễ tân / Hotel Ops*: `HotelOpsRealtimeNotifier`, `useOwnerRequestRealtime`, `ownerRequestRealtimeManager`, `invalidateHotelRealtimeQueries`.
  - *Khách / Guest OS*: `GuestRequestRealtimeNotifier`, `GuestSocket`, `guestRequestRealtimeManager`.
  - *Backend Gateway*: `RequestRealtimeGateway`, `GuestRequestEventPublisher`, `RequestRealtimeEmitter`.
  - *Alert & Notifications*: `toast` (Sonner - default 3s auto-dismiss), `SwalVietSage` (`src/libs/swal.ts`).
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Refresh graphify with `graphify update . --force` only after completing an entire module/feature. For routine/minor changes (chỉnh UI nhẹ, đổi tên, text/copy, CSS tweaks), do NOT run graphify update or tests.
