# BCA / KBTT — kết quả hoàn thiện 2026-11-05

## Phạm vi và trạng thái

Hoàn thiện routing quá hạn/gia hạn và các lỗi đã xác nhận trong luồng lễ tân/KBTT. Giữ nguyên dirty work ngoài phạm vi. Không gọi BCA, đăng nhập, bật delivery, thay fixture DB, apply migration hoặc restart backend trong lượt sửa này. File điều khiển demo vẫn enabled=false, expiresAt=null.

Orca Antigravity đã thoát mà không tạo báo cáo yêu cầu; các sửa và kiểm tra dưới đây do Codex cùng các worker scoped hoàn tất. Không tính việc dispatch là bằng chứng hoàn thành.

## Kết quả theo nguyên nhân

| ID | Hành vi / nguyên nhân | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| BCA-01 | Quá hạn được gia hạn: trước đây thử GH rồi chờ lỗi missing-stay | VERIFIED | Dựa ngày đi được BCA xác nhận gần nhất; nếu đã hết hạn và có ngày mới tương lai, gọi trực tiếp API 4/5. Không thử GH. Giữ ngày đến thật/định danh gốc. Bỏ helper nhận diện lỗi missing-stay cũ. |
| BCA-02 | Gửi lặp, nhiều vòng gia hạn, lỗi chưa rõ kết quả | VERIFIED (mock) | Event/CAS/lease; ngày đã xác nhận được supersede, vòng quá hạn sau có thể tạo khai báo mới. Rejected không thành success; timeout/interruption thành UNKNOWN và chặn phụ thuộc. |
| FD-A | Gia hạn cho phép rút ngắn ngày trả | VERIFIED (mock) | Chặn trong transaction sau stay lock, trước mọi write. Ngày không đổi không có event; gia hạn mới phải ở tương lai. UI chặn trước xác nhận. |
| FD-B | Giấy tờ abc@ / DOB 31/02 đến bước xác nhận | VERIFIED (unit) | Validation cạnh input, giữ dữ liệu; backend calendar/future validation cho khách chính/đi cùng/check-in đặt phòng. |
| FD-C | Nhập sai tiền vẫn phát hành hóa đơn/chuyển CHECKOUT_PENDING | VERIFIED (unit/mock) | Chặn trước issue, thêm expectedBalanceAmount tùy chọn; kiểm tra số dư thật trong transaction Serializable và throw để rollback nếu lệch. Giữ kiểm tra sau response. |
| FD-C2 | Hóa đơn thu một phần vẫn tính lại từ tổng trừ cọc | VERIFIED (unit) | Dùng totalAmount/paidAmount/balanceAmount từ summary.invoice hiện có; không trừ cọc lần nữa. |
| FD-D | Popup chi tiết còn ngày gia hạn cũ | FIXED; browser gap | Resolve phòng đang chọn từ query list mới, fallback snapshot nếu ngoài trang. |
| FD-E | Tìm kiếm/lọc chỉ trên trang KBTT hiện tại | VERIFIED (mock) | q/status/nationality/checkInDate qua resource/repository/BFF; backend lọc sau projection trước pagination, tổng đúng, giữ room scope. |
| FD-F | Lỗi local hiển thị là BCA từ chối | VERIFIED (unit/mock) | Allowlist 8 lỗi local thành LOCAL_ERROR: lỗi dữ liệu hiển thị Cần sửa dữ liệu, lỗi khác Cần kiểm tra; từ chối thật vẫn REJECTED. |
| BCA-03 | Tự suy ra thời hạn tạm trú VN từ ngày trả phòng | VERIFIED (mock) | Bỏ fallback ở service/UI. Thiếu thời hạn thật bị LOCAL_VALIDATION và chưa gửi; giữ giá trị người dùng cung cấp. |
| BCA-04 | Chỉ biết năm sinh nhưng tự biến thành ngày sinh đầy đủ | VERIFIED (unit/mock) | PMS giữ YYYY. Khách nước ngoài map Y + YYYY-01-01 tại BCA boundary theo contract; saveDraft đảo về YYYY. Khách VN thiếu ngày đầy đủ cần bổ sung. |
| FD-G | Nghi vấn nút đóng ở đầu popup KBTT | NEEDS_REVIEW | Header/footer cùng onClose và type=button, modal không nằm trong row. Chưa tái lập trên browser; không sửa theo phỏng đoán. |

## Contract và file chính

- Routing: services/auth-service/src/modules/kbtt/application/kbtt-stay-sync.service.ts; domain/kbtt-stay-sync.ts và regression lifecycle.
- Tạo/sửa hồ sơ, lọc local, phân loại lỗi: KBTT service/schema/controller; frontend features/kbtt, BFF list.
- Gia hạn / chi tiết: hotel-rooms.repository.ts; staff-rooms-client.tsx.
- Nhập khách: check-in-workspace.tsx; check-in-validation.ts; property rooms/reservations schema.
- Quyết toán: billing issueInvoice service/schema/controller; settlement modal/helper; FolioSummary type và repository hiện có.
- Contract cập nhật: shared/kbtt/README.md (matrix trạng thái), services/docs/CONTRACT_GUIDE.md, frontend CONTRACT_GUIDE.md. OpenAPI local đã export và đồng bộ generated types.

Chỉ dùng các endpoint BCA đã cung cấp: API 4/5 (khai báo), API 12/13 (GH/TS). GET BCA 6–11 là danh mục; GET local không chứng minh hồ sơ đang tồn tại trên BCA. Mất dòng trên web sau khoảng 30 phút không được xem là TTL hoặc quyền gửi lại. Không tự tạo API sửa giấy tờ/đổi phòng/rút ngắn; cần đối soát riêng cho thay đổi sau khai báo mà contract không hỗ trợ.

## Kiểm tra thực tế (không cộng lặp các lần chạy)

| Lệnh / suite | Kết quả cuối |
| --- | --- |
| auth-service Jest kbtt.spec.ts | 75/75 PASS |
| Jest kbtt-stay-sync + kbtt-departure + kbtt-auto-submit-scheduler | 74/74 PASS, gồm lifecycle 52 |
| Jest billing.service.checkout-safety.spec.ts | 73/73 PASS |
| Jest rooms.guest-identity.spec.ts | 34/34 PASS |
| Jest hotel-rooms-extension.spec.ts | 4/4 PASS |
| Node checkout-settlement.test.ts | 18/18 PASS |
| Node check-in-validation.test.mjs | 5/5 PASS |
| Node kbtt-contract.test.mjs | 13/13 PASS |
| Backend tsc --noEmit -p tsconfig.build.json | PASS |
| Frontend tsc --noEmit --incremental false | PASS (final frozen source) |
| node scripts/verify-ui-rules.cjs | PASS (final frozen source) |
| pnpm -C services/auth-service openapi:export | PASS, 291 paths; riêng process export tắt live/lifecycle và bật kill switch, không mở HTTP server |
| pnpm -C frontends/front-end-vietsage sync:api:types | PASS |
| node shared/api-contract/scripts/verify-contract.cjs | PASS, 291 paths (gate chỉ kiểm tra file tồn tại/JSON có paths) |
| Scoped git diff --check | PASS khi nhận diện CRLF bằng cr-at-eol; không đổi line endings. File mới kiểm tra whitespace riêng. |

Các suite backend có tổng 260 ca độc lập; frontend 36 ca. Đây là unit/mock, không phải 296 giao dịch live. Log Network glitch / Hotel failure ở suite scheduler là các lỗi giả lập có chủ đích, suite vẫn PASS.

OpenAPI export lấy toàn bộ nguồn hiện có, nên có thêm drift đã tồn tại ở controller ngoài phạm vi (reservation route/query flags/Stripe tags); không sửa logic các controller đó. Lần gọi gate nhầm scripts/verify-contract.cjs đã thất bại MODULE_NOT_FOUND, sau đó xác định đúng đường dẫn canonical và chạy PASS. Sandbox ban đầu chặn đọc dependency; các lệnh test/type đã chạy thành công qua escalation được duyệt.

## Khoảng trống còn lại

- Chưa chạy lại browser trên mã cuối; đặc biệt cần tái lập FD-G và xác nhận FD-D trực quan. Không gắn browser PASS từ typecheck.
- Chưa kiểm tra provider demo mới cho các nhánh vừa sửa; không có bằng chứng chấp nhận live cho mọi case khách nước ngoài. Các lần demo trước thuộc snapshot cũ.
- Chưa chứng minh concurrency/rollback PostgreSQL bằng kiểm thử DB thật; transaction/CAS được kiểm bằng mock và typecheck.
- Snapshot lịch sử được giữ bất biến; thời hạn tạm trú từng tự suy ra không thể tự xác nhận là dữ liệu thật. Cần rà soát riêng trước sử dụng; không backfill hoặc sửa dữ liệu trong lượt này.
- Chưa restart/build production/deploy, bật gửi nền hoặc tác động BCA thật.
