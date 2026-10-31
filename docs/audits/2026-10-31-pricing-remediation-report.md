# Kiểm chứng sau sửa: giá đặt phòng, cọc và checkout

STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).

Ngày kiểm chứng: 31/10/2026, UTC+7. Khách sạn thử: “Khách sạn minh 123” trên `https://vietsage.localhost`. Đây là báo cáo **sau sửa**, tiếp nối [audit trước sửa](2026-10-31-pricing-runtime-audit.md). Bằng chứng cũ vẫn giữ nguyên để đối chiếu.

Đã sửa và kiểm chứng các hành trình tiền chính bằng tài khoản chủ khách sạn, trên dữ liệu thử `AUDIT3110`. Các khoản tiền mặt là bản ghi thử trong phần mềm; không chuyển tiền ngân hàng hoặc cổng thanh toán. Không migration, SQL sửa dữ liệu, xóa lịch sử tài chính, commit, push hoặc deploy.

Baseline triển khai: `a1f1c933254b67280f51c9db603e1c42bfbd8111`. Source sửa vẫn ở worktree, chưa commit. Không coi các kiểm tra mock là bằng chứng tranh chấp PostgreSQL hoặc provider thực.

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
| R14 | Checkout từ timeline | Mở đúng đường dẫn quầy thu ngân `/hotels/.../billing`, kèm folio/stay/phòng; chọn chế độ phòng lẻ theo mục tiêu URL | VIOLATION → COMPLIANT | tab checkout 626, ảnh/txt 27 |
| R15 | Form sửa trên mobile 390px và desktop 1280px | Form mobile lưu được sau nâng lớp phủ trên thanh điều hướng; tổng gồm dịch vụ và cọc đúng | VIOLATION → COMPLIANT có giới hạn | thao tác sửa 0112; chưa thay thế full responsive audit |

## Finding ledger sau sửa

| Finding | Invariant và tác động trước sửa | Sửa tận gốc | Bằng chứng và giới hạn |
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
| Booking 0117, phòng 627 | Mới tạo `AUDIT3110-ZERO-CREATE`, ngày 01–02/11, 0đ, chưa check-in. |
| Loại AUDIT3110-TYPE | Khôi phục và đọc lại giá gốc 500.000đ. |

Sau lượt này ghi thêm 127.000đ tiền cọc thử và các khoản checkout thử; các bản ghi này có thể xuất hiện trên báo cáo nội bộ. Không coi chúng là tiền thực thu. Check-in hiển thị quy trình BCA chạy nền; lượt kiểm chứng không gửi lệnh provider riêng và không xác minh kết quả khai báo/phí bên ngoài.

## Phần chưa thể kết luận COMPLIANT

- **GAP — PostgreSQL concurrency:** chưa chạy hai giao dịch đồng thời tranh cùng cọc đoàn, invoice-vs-deposit, serialization retry/rollback thật. Test hiện tại dùng DB giả lập; website chỉ chứng minh luồng tuần tự trên DB thật.
- **GAP — providers:** webhook/cổng thanh toán, hoàn tiền ngoài hệ thống, BCA, Channex và phí SaaS không nằm trong kiểm chứng tiền thực.
- **GAP — lịch nâng cao:** sparse schedule, thiếu snapshot, undated ledger, thuế/discount và idempotency có test nguồn; chưa tạo DB lỗi để kiểm chứng browser. Chưa chạy browser toàn bộ MOVE/SWAP kéo thả, trả sớm/ở quá hạn, gia hạn với lịch giá hoặc checkout nhiều phòng đồng thời.
- **GAP — responsive:** đã thao tác mobile/desktop tại form cần sửa; chưa hoàn thành ma trận mọi kích thước, mọi modal và các locale.

## Bằng chứng

Tất cả ảnh/text/JSON nằm tại [thư mục bằng chứng](evidence/2026-10-31-pricing-runtime/). Ảnh 01–18 là trước sửa; 19–20 là filter trước/sau; 21–35 là hành trình sau sửa. File 24 ghi trạng thái trước khi sửa refresh quầy thu ngân; ảnh 33 mới là bằng chứng trạng thái cập nhật ngay sau sửa.

Orca: run `run_cf55034a8beb`, bốn lane A/B/C/D đã hoàn tất và được giải phóng; coordinator đã đóng. Kiểm tra terminal cuối chỉ còn frontend/API dev server. Không còn Antigravity worker chạy từ lượt này.
