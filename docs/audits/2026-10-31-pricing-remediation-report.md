# Kiểm chứng sau sửa: giá đặt phòng, cọc và checkout

STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).

Ngày kiểm chứng: 31/10/2026, UTC+7. Khách sạn thử: “Khách sạn minh 123” trên `https://vietsage.localhost`. Đây là báo cáo **sau sửa**, tiếp nối [audit trước sửa](2026-10-31-pricing-runtime-audit.md). Bằng chứng cũ vẫn giữ nguyên để đối chiếu.

Đã sửa và kiểm chứng các hành trình tiền chính bằng tài khoản chủ khách sạn, trên dữ liệu thử `AUDIT3110`. Các khoản tiền mặt là bản ghi thử trong phần mềm; không chuyển tiền ngân hàng hoặc cổng thanh toán. Không migration, SQL sửa dữ liệu, xóa lịch sử tài chính, push hoặc deploy. Lượt tiếp theo được người dùng yêu cầu commit và xử lý thêm lỗi chuyển hướng khi cookie hết hạn; kết quả xác thực nằm ở phần bổ sung bên dưới.

Baseline triển khai giá: `a1f1c933254b67280f51c9db603e1c42bfbd8111`. Trong khi kiểm tra cuối, một thao tác đồng thời tạo commit `7d5344b73ea030869b92289457132e0eca3a4f73` lúc 12:40:30 UTC+7, chứa các sửa đổi và bằng chứng hiện có. Giai đoạn kiểm chứng giá không phát lệnh commit/push; đã đối chiếu không có diff production về giá so với commit này hoặc dấu hiệu hoàn nguyên. Lượt commit tiếp theo bổ sung bằng chứng cuối và bản sửa xác thực. Không coi các kiểm tra mock là bằng chứng tranh chấp PostgreSQL hoặc provider thực.

## Ma trận website

`COMPLIANT` chỉ áp dụng cho ca đã chạy và kết quả đã đọc lại. Các bước trước sửa được ghi ở báo cáo audit riêng.

| ID | Ca đã chạy | Kết quả đã xác nhận | Phân loại | Bằng chứng |
|---|---|---|---|---|
| R01 | Mã đoàn `#VSH_GROUP_0015`, có/không `#`, chữ thường và khoảng trắng | Trả đúng phòng 1003/1004; mã sai hậu tố không khớp | VIOLATION → COMPLIANT | `filter-after-cases.json`, ảnh 20 |
| R02 | Mã booking, số phòng, timeline lệch tháng, xóa lọc | Đúng phòng; tự về kỳ có booking; xóa lọc khôi phục 71 phòng | COMPLIANT | 11 ca trong `filter-after-cases.json` |
| R03 | Nhập trực tiếp cọc 10% booking 0112 | 10% × (500k + 700k + 70k) = **127.000đ**; cọc lũy kế 862.000đ; còn 408.000đ | VIOLATION → COMPLIANT | ảnh/txt 21 |
| R04 | Chỉ sửa tên booking 0112, không sửa ngày/giá | Giữ 14:00 / 12:00, tổng 1.270.000đ, không làm phẳng hai đêm giá riêng, không ghi thêm cọc | VIOLATION → COMPLIANT | txt 22, hóa đơn 0023 |
| R05 | Check-in booking 0112 ngay sau sửa | Nhận phòng 1007 thành công; không dùng phiên bản cũ gây 409 | VIOLATION → COMPLIANT | ảnh 23, hóa đơn 0023 |
| R06 | Checkout booking 0112, cọc một phần | Hóa đơn **VSH_INVOICE_0023**, tổng 1.270.000đ; các khoản 635k + 100k + 127k + **408k**; còn **0đ**, đã checkout | VIOLATION → COMPLIANT | ảnh/txt 25, ảnh 35 |
| R07 | Booking 0113 đã trả trước 1.400.000đ, check-in đoàn rồi checkout | Folio 0066 đóng; hóa đơn **0025** tổng 1.400.000đ, chỉ một khoản thanh toán 1.400.000đ, không thu lần hai | VIOLATION → COMPLIANT | ảnh/txt 28 |
| R08 | Sửa booking 0115 về 0đ, chuyển 633 → 626, đổi ngày nhận 01/11 → 31/10 | Đọc lại đúng phòng 626, giá 0đ, hai đêm vẫn 0đ; check-in đúng phòng mới | VIOLATION → COMPLIANT | ảnh/txt 26, 27 |
| R09 | Checkout booking 0115 giá 0đ | Folio **0065** đóng, dòng tiền phòng 2 × 0đ; không lấy giá niêm yết 1,3 triệu | COMPLIANT | ảnh/txt 27 |
| R10 | Tạo mới booking 0117, nhập 0đ tại phòng 627 | Tạo thành công, đọc lại đơn giá và tổng 0đ; ngày 01–02/11, giờ 14:00 / 12:00 | VIOLATION → COMPLIANT | ảnh/txt 32 |
| R11 | Giá gốc loại thử 500k → 700k | Lưu thành công; booking 0116 cũ vẫn 500k × 2 = 1.000.000đ | VIOLATION → COMPLIANT | ảnh/txt 29, 30 |
| R12 | Khôi phục giá gốc loại thử | Đã đọc lại 500.000đ | COMPLIANT | txt 31 |
| R13 | Vãng lai 0114, phòng 603, không cọc | Folio **0063** đóng tổng 1.300.000đ; giá riêng phòng đã khôi phục trước đó; không cần reload để hiện Đã đóng | VIOLATION → COMPLIANT | ảnh/txt 33 |
| R14 | Checkout từ timeline | Mở đúng đường dẫn quầy thu ngân `/hotels/.../billing`, kèm folio/stay/phòng; tải mới URL tự chọn đúng folio 0065/phòng 626 | VIOLATION → COMPLIANT | tab checkout 626, ảnh/txt 27, txt 37 |
| R15 | Form sửa trên mobile 390px và desktop 1280px | Form mobile lưu được sau nâng lớp phủ trên thanh điều hướng; tổng gồm dịch vụ và cọc đúng | VIOLATION → COMPLIANT có giới hạn | thao tác sửa 0112; chưa thay thế full responsive audit |

## Finding ledger sau sửa

| Finding (VIOLATION → COMPLIANT trong phạm vi kiểm chứng) | Invariant và tác động trước sửa | Sửa tận gốc | Bằng chứng và giới hạn |
|---|---|---|---|
| Tổng thương mại không đồng nhất | Cọc tỷ lệ, tổng đoàn và form sửa bỏ lịch giá/dịch vụ; giá 0 bị coi là thiếu | Dùng calculator Decimal chung theo đêm địa phương + extras; `totalSnapshot` đã là tổng cuối, không cộng thuế lần nữa; UI ưu tiên tổng server kể cả 0 | R03/R04/R06/R10/R11; test calculator, property và billing |
| Snapshot bị thay bằng giá hiện tại | Đổi phòng, gia hạn hoặc thiếu lịch giá có thể lấy giá phòng mới | Giữ giá đã chốt; cập nhật ledger khi giá thực sự đổi; ngày thiếu chỉ dùng snapshot đã chốt; nghiệp vụ tiền thiếu snapshot báo lỗi | R08/R11; regression sparse/zero/missing snapshot/MOVE |
| Response sau sửa còn ledger cũ | Giá mới nhưng tổng cũ ngay sau lưu | Đọc lại reservation sau khi cập nhật ledger; projection reservation và stay dựa quote/folio | R04/R06; regression trả ledger mới |
| Giờ bị lệch khi chỉ sửa tên/giá | 14:00/12:00 bị đổi 7 giờ | Dùng Temporal theo múi giờ khách sạn; giữ instant gốc khi người dùng không sửa giờ | R04/R10; test UTC, Việt Nam, New York |
| Cọc không bù trừ invoice | Thu trước vẫn có thể thu nguyên invoice lần hai | Consume allocation đúng một lần trong transaction; tách phần dư; legacy group không lấy cọc riêng phòng khác; ngày thu giữ nguyên | R06/R07; stateful mock hai invoice chia cọc đoàn |
| Thu cọc sau phát hành invoice | Tiền vào booking không được áp vào invoice đã có | Chặn khoản mới và hướng về invoice; replay idempotency vẫn dùng giao dịch cũ; Serializable | Test billing; GAP tranh chấp đồng thời thật |
| Liên kết đoàn cũ bằng mã | Guard mới chặn booking có `groupCode`, chưa có `groupId` | Chấp nhận mã đoàn khớp khi chưa có ID; ID khác vẫn không được chấp nhận; cơ sở cọc riêng không đổi thành cả đoàn | R03; regression reservation + legacy group code |
| Giá và phiên bản cũ trong check-in | Sau sửa/gán phòng, thao tác dùng arrival cũ; lọc mã làm mất phòng trong danh sách nội bộ | Chi tiết dùng arrival đã cập nhật; tải lại arrivals khi mở danh sách; tape lọc hiển thị mà không lọc mất dữ liệu phòng cho thao tác | R05/R08 |
| Quầy thu ngân còn Đang mở sau checkout | UI cho thấy trạng thái cũ và nút thu vẫn hiện tới khi reload | Refresh chi tiết và SSR list; khóa submit lúc loading/saving/đã đóng; chọn folio mục tiêu URL | R13: Đã đóng ngay, nút đổi sang xem hóa đơn |
| Các BFF route trả HTML 404 | Chặn check-in, checkout, gán phòng, giá loại phòng | Route source tồn tại; khởi động lại frontend dev hiện hữu phục hồi đăng ký route; không thêm handler trùng | Probe 6 route JSON và R03–R14; chưa kết luận chi tiết cơ chế cache nội bộ |
| Filter mã đặt/mã đoàn | Dấu `#` và cách tìm phòng/block không thống nhất, data có nhưng 0 phòng | Chuẩn hóa từ khóa, dùng cùng matching cho room/block/highlight/auto align; bỏ match ngược gây dương tính giả | R01/R02, 4 helper tests |

## Dữ liệu thử còn lại

| Tài nguyên | Trạng thái sau kiểm chứng |
|---|---|
| Booking 0112, phòng 1007 | Đã checkout; invoice 0023/folio 0064; 1.270.000đ, còn 0đ. Khoản 100.000đ sai ở audit trước vẫn giữ lịch sử, không xóa âm thầm. |
| Booking 0113, phòng 200 | Đã checkout; invoice 0025/folio 0066; 1.400.000đ trả trước được bù trừ toàn bộ. Giờ 07:00/05:00 do lỗi audit trước không tự sửa lịch sử. |
| Booking 0114, phòng 603 | Đã checkout; folio 0063; 1.300.000đ. |
| Booking 0115, phòng 626 | Đã checkout 0đ; folio 0065; đã chuyển từ 633 và đổi ngày nhận thành 31/10. |
| Booking 0116, QA3110-A | Còn đặt trước ngày 01–03/11, giá chốt 500k × 2 = 1 triệu. |
| Booking 0117, phòng 627 | Mới tạo, sau đó sửa tên thành `AUDIT3110-ZERO-CREATE-RETEST`; đọc lại vẫn ngày 01–02/11, 14:00/12:00, 0đ, chưa check-in. |
| Loại AUDIT3110-TYPE | Khôi phục và đọc lại giá gốc 500.000đ. |

Sau lượt này ghi thêm 127.000đ tiền cọc thử và các khoản checkout thử; các bản ghi này có thể xuất hiện trên báo cáo nội bộ. Không coi chúng là tiền thực thu. Check-in hiển thị quy trình BCA chạy nền; lượt kiểm chứng không gửi lệnh provider riêng và không xác minh kết quả khai báo/phí bên ngoài.

## Phần chưa thể kết luận COMPLIANT

- **GAP — PostgreSQL concurrency:** chưa chạy hai giao dịch đồng thời tranh cùng cọc đoàn, invoice-vs-deposit, serialization retry/rollback thật. Test hiện tại dùng DB giả lập; website chỉ chứng minh luồng tuần tự trên DB thật.
- **GAP — providers:** webhook/cổng thanh toán, hoàn tiền ngoài hệ thống, BCA, Channex và phí SaaS không nằm trong kiểm chứng tiền thực.
- **GAP — lịch nâng cao:** sparse schedule, thiếu snapshot, undated ledger, thuế/discount và idempotency có test nguồn; chưa tạo DB lỗi để kiểm chứng browser. Chưa chạy browser toàn bộ MOVE/SWAP kéo thả, trả sớm/ở quá hạn, gia hạn với lịch giá hoặc checkout nhiều phòng đồng thời.
- **GAP — responsive:** đã thao tác mobile/desktop tại form cần sửa; chưa hoàn thành ma trận mọi kích thước, mọi modal và các locale.

## Nguồn sửa và lệnh kiểm chứng

Các vị trí dưới đây là nguồn hiện tại sau sửa, đối chiếu với runtime ở ma trận phía trên. Phân loại `COMPLIANT` có phạm vi nguồn/test tương ứng; không mở rộng sang các GAP.

| Phân loại | Vị trí nguồn | Invariant đã sửa | Kiểm chứng |
|---|---|---|---|
| COMPLIANT | `services/auth-service/src/common/pricing/reservation-charge-total.ts:30` | Tổng theo lịch từng đêm, extras cộng một lần, giữ 0, thiếu giá chốt thì chặn | B1, R03/R06 |
| COMPLIANT | `services/auth-service/src/modules/property/infrastructure/repositories/reservations.repository.ts:3085` | Cập nhật charge lines đồng bộ, giữ lịch giá khi không đổi rate; response đọc ledger mới | B1, R04/R08 |
| COMPLIANT | `services/auth-service/src/modules/property/infrastructure/repositories/reservations.repository.ts:2136,2250` | Projection reservation/stay dựa quote/folio, không lấy giá phòng hiện tại | B1, R08/R09 |
| COMPLIANT | `services/auth-service/src/modules/billing/application/billing.service.ts:1119` | Bù trừ cọc đúng một lần, giữ phần dư và ngày thu | B1, R06/R07 |
| COMPLIANT | `services/auth-service/src/modules/billing/application/billing.service.ts:3147,3171,3244,3349` | Cọc dựa tổng đúng, hỗ trợ liên kết đoàn cũ, chặn khoản mới sau phát hành invoice, transaction Serializable | B1, R03 |
| COMPLIANT | `frontends/front-end-vietsage/src/libs/vietnam-temporal.ts:36,50` | Giờ khách sạn độc lập múi giờ máy chạy | F1, R04/R10 |
| COMPLIANT | `frontends/front-end-vietsage/src/features/hotel-ops/components/edit-reservation-modal.tsx:312,444,594,616,714` | Bảo toàn instant/quote gốc, giữ 0, cộng extras và cọc đúng, modal trên thanh điều hướng | F2, R04/R08/R10/R15, txt/ảnh 36 |
| COMPLIANT | `frontends/front-end-vietsage/src/features/hotel-ops/components/front-desk-arrival-detail-panel.tsx:142,1541` | Check-in dùng bản arrival vừa lưu | F2, R05 |
| COMPLIANT | `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx:750,1904,6409,6765` | Query ngoài đồng bộ, lọc tape không làm mất dữ liệu thao tác, arrivals mới và đúng route checkout | F2, R05/R08/R14 |
| COMPLIANT | `frontends/front-end-vietsage/src/app/(vietsage)/hotels/[hotelId]/billing/staff-billing-workspace-client.tsx:262,406,569,940,1145` | Chọn đúng folio URL, tổng 0 có thẩm quyền, không lấy giá hiện tại, refresh và khóa submit khi trạng thái không hợp lệ | F2, R09/R13/R14 |
| COMPLIANT | `frontends/front-end-vietsage/src/features/hotel-ops/utils/tape-chart-filter-helpers.ts:13,27,135` | Chuẩn hóa `#`, khớp mã đặt/đoàn và phòng theo cùng quy tắc | F3, R01/R02 |

| Mã | Lệnh đã chạy | Kết quả | Phân loại |
|---|---|---|---|
| B1 | `pnpm -C services/auth-service test -- --runInBand --runTestsByPath` với 8 spec liệt kê bên dưới | **8 suites, 203/203 tests, exit 0** | COMPLIANT cho các assertions đã chạy |
| F1 | `node frontends/front-end-vietsage/scripts/run-unit-tests.mjs src/features/hotel-ops/reservation-timezone-pricing.test.ts` | **5/5 tests, exit 0** | COMPLIANT |
| F2 | `pnpm -C frontends/front-end-vietsage exec tsc --noEmit --incremental false` | **exit 0**, sau sửa state snapshot gốc | COMPLIANT về typecheck |
| F3 | `node --test frontends/front-end-vietsage/src/features/hotel-ops/utils/tape-chart-filter-helpers.test.ts` | **4/4 tests, exit 0** | COMPLIANT |
| B2 | `pnpm -C services/auth-service exec tsc --noEmit --incremental false` | **exit 0** sau STAY projection; sau đó chỉ sửa format và `let` → `const` | COMPLIANT về typecheck |
| U1 | `node scripts/verify-ui-rules.cjs` | **exit 0, 855 files** | COMPLIANT với gate tĩnh; không thay thế responsive audit |
| G1 | `git diff --check` | **exit 0** | COMPLIANT |
| L1 | ESLint 4 file production backend thay đổi | **exit 1: 2 errors, 92 warnings**; 2 lỗi Prettier có sẵn tại `reservations.service.ts:219,222`; không lỗi mới | VIOLATION tồn tại ở baseline; không coi là lint PASS |
| L2 | ESLint 9 file production frontend thay đổi, so sánh nguồn baseline `a1f1c933` bằng Node ESLint API | **exit 1: 47 errors, 52 warnings**; 35 lỗi `staff-rooms-client.tsx` và 12 lỗi `tape-chart-view.tsx` khớp baseline. **0 introduced errors, 0 errors trong hunk sửa**; baseline 55 errors/51 warnings | VIOLATION tồn tại ở baseline; comparison exit 0, không coi là lint PASS |

B1 gồm: `src/common/pricing/reservation-charge-total.spec.ts`, `src/modules/property/tests/reservation-pricing-regression.spec.ts`, `reservations.repository.spec.ts`, `reservations.service.spec.ts`, `room-type-price.spec.ts`, `src/modules/billing/tests/billing.service.checkout-safety.spec.ts`, `billing-receivables-and-deposits.spec.ts`, `checkout-service-reconciliation.spec.ts`. Các tên ngắn ở cùng thư mục với spec liền trước thuộc module tương ứng. Tổng **212 tests riêng biệt** (203 backend + 9 frontend), không cộng lại các lượt chạy lặp.

**VIOLATION còn lại về lint:** frontend có lỗi cũ tiêu biểu `staff-rooms-client.tsx:676` (`no-explicit-any`) và `tape-chart-view.tsx:1747` (`set-state-in-effect`); backend hai lỗi format nêu ở L1. Chúng làm scoped ESLint không đạt. Sửa tối thiểu trong lượt riêng là thay kiểu `any` bằng contract có sẵn, đồng bộ state theo quy tắc hook và định dạng hai dòng; không tắt rule/suppress. Chạy lại đúng L1/L2 để xác nhận. Hai warning mới được ghi riêng: `baseRoutePrefix` không dùng sau đổi route và cảnh báo tương thích virtualizer; không tuyên bố không có warning mới.

Detector Impeccable ghi 106 heuristics ở các file lớn hiện hữu; không nằm trong các hunk sửa của lượt detector đó. Hai nhãn chữ xám trên nền tím ở form sửa đã đổi sang màu tím đậm, không thêm suppression. Không coi detector là chứng nhận chất lượng toàn UI. Bằng chứng đối chiếu lint frontend nằm trong `frontend-lint-classification-final.json`, `frontend-lint-current.json`, `frontend-lint-head.json`.

## Bằng chứng

Tất cả ảnh/text/JSON nằm tại [thư mục bằng chứng](evidence/2026-10-31-pricing-runtime/). Ảnh 01–18 là trước sửa; 19–20 là filter trước/sau; 21–36 là hành trình sau sửa, txt 37 là kiểm tra tải mới URL folio. File 24 ghi trạng thái trước khi sửa refresh quầy thu ngân; ảnh 33 mới là bằng chứng trạng thái cập nhật ngay sau sửa.

Orca: run `run_cf55034a8beb`, bốn lane A/B/C/D đã hoàn tất và được giải phóng; coordinator đã đóng. Kiểm tra terminal cuối chỉ còn frontend/API dev server. Không còn Antigravity worker chạy từ lượt này.

## Bổ sung: cookie hết hạn và vòng lặp chuyển hướng

Người dùng yêu cầu xử lý thêm tình trạng “chuyển hướng quá nhiều” khi phiên hết hạn và commit kết quả. Phạm vi sửa là proxy và helper phiên phía frontend; không đổi API công khai hoặc guard refresh backend. Không lưu thông tin đăng nhập hay giá trị cookie trong bằng chứng.

| Phân loại | Invariant, nguồn và tác động trước sửa | Sửa tận gốc | Bằng chứng kiểm chứng |
|---|---|---|---|
| VIOLATION → COMPLIANT | `frontends/front-end-vietsage/src/proxy.ts:57,281`: Auth.js nối cookie rolling sau callback, có thể ghi lại phiên cũ sau lệnh xóa và tiếp tục chuyển hướng | Xóa cookie trên response cuối sau Auth.js; bao gồm cookie request/response, tên secure/plain, legacy và chunk; giữ thuộc tính Secure của cookie có tiền tố | Regression module proxy thật: 3 ca thất bại trước sửa, 5/5 đạt sau sửa; A1. Browser forced reauth trả login 200, session cookie rỗng; ảnh/JSON 38 |
| VIOLATION → COMPLIANT | `frontends/front-end-vietsage/src/libs/auth-session-refresh.ts:38,72`: nhiều request dùng chung promise bao gồm ghi cookie, chỉ context đầu nhận phiên mới | Chỉ gộp backend rotation; mỗi request tự ghi cookie response. Giữ idempotency key; fallback chỉ nhận token đã xoay khác token cũ và expiry hữu hạn còn hạn | 6/6 regression với hai AsyncLocalStorage context độc lập, lỗi ghi riêng, retry và expiry lỗi; A1. Không suy rộng thành bằng chứng nhiều tab/instance thực |
| VIOLATION → COMPLIANT | `frontends/front-end-vietsage/src/libs/server-session-tokens.ts:64`: thiếu JWT vẫn có thể fallback sang session khác và tự tạo chuỗi refresh token `session_valid_active` | Chỉ trả token được giải mã từ request; thiếu/hỏng/partial cookie không tạo refresh authority | 4/4 regression module thật: thiếu JWT, decode lỗi, thiếu refresh token, request hợp lệ; A1 |
| COMPLIANT | Browser cookie hết hạn | Đặt expiry của session cookie hiện hữu về quá khứ trong tab IAB thử, reload trang bảo vệ | Cookie biến mất; đúng **một HTTP 307** từ dashboard → login **HTTP 200**, không vòng lặp. Đăng nhập lại về dashboard, cookie mới Secure + HttpOnly; ảnh/JSON 39 và ảnh 40 |
| GAP | Tranh chấp refresh nhiều tab/instance với backend thật | Chưa chạy race refresh thực hoặc chờ JWT hết hạn tự nhiên | Hai request context đã có unit regression; browser chỉ chứng minh forced reauth và cookie hết hạn được mô phỏng bằng expiry, rồi đăng nhập lại tuần tự. Không đổi thời hạn/secret để tạo token thử |

| Mã | Lệnh kiểm chứng bổ sung | Kết quả | Phân loại |
|---|---|---|---|
| A1 | `node frontends/front-end-vietsage/scripts/run-unit-tests.mjs src/libs/server-session-tokens-behavior.test.mjs src/proxy.test.mjs src/libs/auth-session-refresh.test.mjs src/libs/auth-cookie-policy.test.ts src/libs/auth-refresh-idempotency.test.ts src/features/auth/utils/login-route.test.ts src/features/auth/utils/redirect-isolation.test.ts` | **60/60 tests riêng biệt, exit 0**; 15 ca mới và 45 ca hiện hữu | COMPLIANT cho các assertions đã chạy |
| A2 | `pnpm -C frontends/front-end-vietsage exec tsc --noEmit --incremental false` | **exit 0** sau toàn bộ sửa xác thực | COMPLIANT về typecheck |
| A3 | ESLint trên 6 file auth thay đổi: `src/proxy.ts`, `src/proxy.test.mjs`, `src/libs/server-session-tokens.ts`, `src/libs/server-session-tokens-behavior.test.mjs`, `src/libs/auth-session-refresh.ts`, `src/libs/auth-session-refresh.test.mjs` | Hai lượt scoped, **exit 0**; không cộng vào kết quả lint phạm vi giá L1/L2 | COMPLIANT trong 6 file này |
| A4 | `node frontends/front-end-vietsage/scripts/auth-session-contract-smoke.mjs` | **6 checks, exit 0**; không lộ token qua session, giữ private logout và stable refresh idempotency | COMPLIANT với gate tĩnh |
| A5 | `git diff --check` | **exit 0** | COMPLIANT |

Bằng chứng 38/39 chỉ chứa tên cookie, Secure/HttpOnly/expiry và URL/status điều hướng. Cookie thử đã được thay bằng phiên đăng nhập mới hoạt động; không để lại cấu hình trình duyệt hoặc dữ liệu xác thực giả. Các giới hạn giá/DB/provider và lỗi lint baseline ở phần trước vẫn giữ nguyên.
