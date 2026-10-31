# Kiểm chứng website: đặt trước → check-in → thanh toán → check-out

STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).

**Verdict: FAIL.** Đã thao tác trực tiếp trên `https://vietsage.localhost`, phiên chủ khách sạn “Khách sạn minh 123”, ngày 31/10/2026 (UTC+7). Website có lỗi tiền và lỗi chặn luồng; chưa thể xác nhận toàn bộ hành trình kết thúc thành công.

Phạm vi: giá chung, giá riêng từng đêm, dịch vụ đặt trước, cọc nhanh, cọc theo tỷ lệ nhập trực tiếp, thu toàn bộ trước check-in, sửa giá, đổi giá riêng phòng đang ở, sửa giá gốc loại phòng, gán phòng, kế hoạch phòng, nhận khách lẻ/đoàn/vãng lai và hai đường checkout. Chỉ tạo dữ liệu thử có tiền tố `AUDIT3110`; không sửa mã nguồn, không chạy SQL/migration, không chuyển tiền qua ngân hàng/cổng thanh toán. Các khoản tiền mặt bên dưới là bản ghi thử trong phần mềm, không có thu tiền thực tế.

Baseline đầu phiên `c6fbdabe`, `master...origin/master [ahead 1]`, file `tape-chart-view.tsx` đã có thay đổi sẵn. Trong lúc kiểm chứng HEAD chuyển sang `f10170b5`, trạng thái source trở thành sạch. Đối chiếu hai revision cho các file giá/billing/edit đã đọc: chỉ tape-chart thay đổi. Đây là thay đổi đồng thời bên ngoài lượt kiểm chứng; không quy toàn bộ bằng chứng cho một revision cố định. Lỗi tape-chart được ghi theo runtime thực tế tại thời điểm quan sát.

## Ma trận kiểm chứng

`COMPLIANT` chỉ áp dụng cho bước và ca đã thực hiện. `VIOLATION` là kết quả sai hoặc thao tác thực sự thất bại. `GAP` là kết quả phía sau chưa thể thực hiện; không phải PASS.

| ID | Ca kiểm chứng | Kỳ vọng | Kết quả website | Phân loại |
|---|---|---|---|---|
| C01 | Tạo đoàn 2 phòng, 2 đêm giá 500k/700k, thêm 70k dịch vụ | 2.470.000đ | Tạo thành công `VSH_GROUP_0018`, các booking 0112/0113 | COMPLIANT tại bước tạo |
| C02 | Đọc tổng tiền tại chi tiết đoàn sau tải lại | Tiền phòng 2.400.000đ; có dịch vụ thì 2.470.000đ | Hiện “Tổng tiền phòng” 1.000.000đ, mỗi phòng 500.000đ | VIOLATION |
| C03 | Đọc chi tiết booking 0112 và 0113 trước sửa | 1.270.000đ và 1.200.000đ | Hiện đúng từng booking | COMPLIANT tại bước đọc |
| C04 | Nút cọc nhanh 50% booking 0112 | Thu 635.000đ | Lưu 635.000đ, còn 635.000đ; đọc lại vẫn có giao dịch | COMPLIANT |
| C05 | Chọn “Theo tỷ lệ (%)”, nhập 10 cho booking 0112 | 10% × 1.270.000 = 127.000đ | Request `PERCENT`, `percentValue=10`, không truyền amount; backend ghi 100.000đ, HTTP 200 | VIOLATION |
| C06 | Sửa giá booking 0113 từ 500k thành 700k/đêm | 2 đêm = 1.400.000đ | PATCH 200; tải lại hiển thị 1.400.000đ | COMPLIANT sau đọc lại |
| C07 | Hiển thị ngay sau sửa giá ở C06 | Phải đồng bộ tổng mới | Hiện giá 700k nhưng tổng cũ 1.200.000đ; tải lại mới đúng | VIOLATION |
| C08 | Sửa tên/giá, không sửa giờ nhận/trả | Giữ 14:00 / 12:00 | Lưu thành 07:00 / 05:00; request ISO và đọc lại xác nhận lệch 7 giờ | VIOLATION |
| C09 | Thu toàn bộ booking 0113 sau C06 | Thu 1.400.000đ, còn 0đ | Hiện đúng khoản thu và số dư 0đ | COMPLIANT trước check-in |
| C10 | Check-in booking 0112 qua chi tiết khách | Tạo lượt ở + folio | UI báo “Không tìm thấy tài nguyên yêu cầu” | VIOLATION |
| C11 | Check-in đoàn 0018 cho 200 và 1007 | Nhận hai phòng hoặc lỗi nghiệp vụ cụ thể | Hai POST `/reservations/{id}/check-in` trả 404, `text/html`; cả hai phòng thất bại | VIOLATION |
| C12 | Check-in vãng lai tại phòng trống 603 | Tạo lượt ở thử một đêm | Thành công `AUDIT3110-WALKIN`, mã 0114, folio `VSH_FOLIO_0063` | COMPLIANT tại check-in |
| C13 | Tăng giá riêng phòng 603 khi khách đã ở: 1,3 triệu → 2 triệu | Giá lượt ở đã chốt giữ 1,3 triệu | Settings đọc lại giá 2 triệu; mở lại bảng checkout vẫn 1,3 triệu | COMPLIANT ở preview, chưa phải hóa đơn đã trả |
| C14 | Khôi phục giá riêng 603 | Trở lại 1.300.000đ | Bảng settings đọc lại đúng 1.300.000đ | COMPLIANT |
| C15 | Checkout 603 qua modal quyết toán | Phát hành hóa đơn, ghi tiền mặt, đóng lượt ở | GET `active-folio` 404; POST `/stays/{id}/check-out` 404; UI không hoàn tất | VIOLATION |
| C16 | Checkout 603 qua quầy thu ngân chính | Phát hành hóa đơn và trả phòng | Chọn đúng `VSH_FOLIO_0063`, tổng 1,3 triệu; xác nhận rồi báo không tìm thấy tài nguyên | VIOLATION |
| C17 | Tạo loại/phòng thử riêng để thử giá gốc | Loại `AUDIT3110-TYPE`, phòng `QA3110-A`, giá 500k | Tạo thành công; booking 0116 có báo giá 2 đêm = 1 triệu | COMPLIANT tại bước tạo |
| C18 | Lưu giá gốc loại thử 500k → 700k | Lưu được, sau đó kiểm tra booking cũ giữ giá | UI “Không thể lưu giá gốc / Không tìm thấy tài nguyên yêu cầu”; giá niêm yết đọc lại còn 500k | VIOLATION thao tác; GAP về tác động tới booking cũ |
| C19 | Đặt lẻ 0115, chủ động nhập giá 0, không dùng giá từng đêm | Snapshot và tổng = 0 | Form báo 0; POST không có `nightlyRateSnapshot`; HTTP 201 trả snapshot và base = 1.300.000; đọc lại đúng mức sai này | VIOLATION |
| C20 | Gán booking 0115 từ 633 sang phòng 626 cùng loại | Gán được và giữ giá đã chốt | PUT `/reservations/{id}/room` trả 404; phòng vẫn 633 | VIOLATION thao tác; GAP về giá sau gán |
| C21 | Mở “Kế hoạch phòng” để thử kéo chuyển/đổi ngày | Timeline hoạt động | Trang lỗi; console `ReferenceError: Cannot access 'selectedBlock' before initialization` tại `TapeChartView` | VIOLATION; GAP về giá sau kéo chuyển |
| C22 | Hóa đơn checkout trừ khoản cọc đã ghi nhận | Thu đúng phần còn lại, không thu lặp | Booking có cọc chưa check-in được; ca vãng lai chưa hoàn tất checkout được | GAP runtime; giữ kết luận source/mock trước đó, không nâng thành bằng chứng website |
| C23 | Thiếu snapshot, trả sớm, gia hạn với lịch giá, webhook, đồng thời/idempotency | Theo hợp đồng tương ứng | Chưa có hành trình website hoàn chỉnh để kiểm chứng; không sửa DB để tạo dữ liệu thiếu snapshot | GAP |

## Finding ledger và hướng sửa tối thiểu

1. **VIOLATION — Nhiều endpoint website chặn nghiệp vụ.** Check-in lẻ/đoàn, gán phòng, tra active-folio, checkout và lưu giá loại phòng thất bại. Hai check-in đoàn và gán phòng có request/response metadata đã lưu; check-in đoàn trả HTML 404. Các file route tương ứng vẫn tồn tại trong checkout nguồn. Chưa xác định nguyên nhân định tuyến/runtime từ bằng chứng này; không kết luận dữ liệu DB mất. Sửa tối thiểu: làm cho route đang được UI gọi thực sự khả dụng, rồi chạy lại các booking thử hiện có, đối soát trạng thái trước khi thử ghi tiền lần nữa.

2. **VIOLATION — Giá 0 bị mất trong payload tạo đặt trước.** `staff-rooms-client.tsx:1568` chỉ gửi snapshot khi `baseRateNum > 0`; backend tại `reservations.repository.ts:543` lấy giá phòng khi không có giá truyền vào. Ca 0115 chứng minh 0 → 1.300.000đ. Sửa tối thiểu: phân biệt không nhập với nhập 0; kiểm tra request, snapshot và tổng đọc lại đều bằng 0. Form sửa cũng dùng `numericRate > 0 ? numericRate : null` tại `edit-reservation-modal.tsx:586`; nhánh sửa giá 0 chưa thực hiện trong lượt này.

3. **VIOLATION — Tính phần trăm trên tổng phẳng, bỏ lịch giá/dịch vụ.** `billing.service.ts:2894` lấy reservation không kèm charge lines và tính rate × nights; nhánh phần trăm tại dòng 3007 dùng tổng đó. Ca 0112: cơ sở đúng 1.270.000đ, nhưng 10% chỉ ghi 100.000đ. Sửa tối thiểu: dùng tổng thương mại có thẩm quyền gồm giá từng đêm và extras, thống nhất với xác nhận booking. Nút cọc nhanh theo số tiền đã qua C04; không gộp kết quả này với nhánh nhập tỷ lệ.

4. **VIOLATION — Các projection tiền không đồng nhất.** Tổng đoàn 1 triệu trái với báo giá tạo 2,47 triệu và tổng hai booking 1,27 + 1,2 triệu. Ngay sau sửa 0113 cũng dùng tổng cũ; sau reload là 1,4 triệu. Repository cập nhật reservation và include charge lines trước khi tái tạo ledger (`reservations.repository.ts:2986`, `:3014`, `:3040`), nên không dùng response cũ để chứng minh giá lưu sai. Sửa tối thiểu: tính tổng từ ledger hiện tại, trả hoặc refetch projection sau giao dịch; kiểm tra ngay sau lưu và sau reload phải giống nhau.

5. **VIOLATION — Sửa giá làm đổi giờ không được yêu cầu.** `edit-reservation-modal.tsx:101` cộng đồng thời UTC+7 và `getTimezoneOffset()`, rồi dùng `toISOString().slice(0,16)`; payload ở dòng 567–583 tiếp tục parse chuỗi local. Ca 0113 chỉ sửa tên và giá nhưng giờ 14/12 thành 07/05, tồn tại sau reload. Sửa tối thiểu: dùng helper thời gian khách sạn thống nhất và bảo toàn instant khi người dùng không sửa giờ. Test ở UTC+7 và múi giờ trình duyệt khác.

6. **VIOLATION — Kế hoạch phòng lỗi trước khi thao tác.** `tape-chart-view.tsx:1808` dùng `selectedBlock` trong dependency array trước khai báo tại dòng 1811; console và ảnh màn hình xác nhận lỗi runtime. File này có thay đổi sẵn lúc bắt đầu và được commit đồng thời trong quá trình kiểm chứng; không sửa file trong audit. Sửa thứ tự khai báo trước khi chạy lại MOVE/SWAP/đổi ngày.

7. **COMPLIANT có giới hạn — snapshot hợp lệ bảo vệ preview.** Đổi giá riêng phòng 603 lên 2 triệu không đổi mức 1,3 triệu tại bảng checkout đã mở lại. Đây là bằng chứng website của preview, không thay thế hóa đơn đã phát hành, payment settlement hoặc khóa DB đồng thời.

8. **GAP — Các kết luận source/mock của lượt trước chưa thành runtime end-to-end.** Chưa xác nhận bằng hóa đơn thật trong phần mềm rằng cọc được bù trừ đúng, các nhánh assign/dates/MOVE đồng bộ ledger, hoặc dữ liệu thiếu snapshot bị chặn. Không dùng các ca chưa chạy để tuyên bố hệ thống đảm bảo giá.

## Bằng chứng

Ảnh nằm tại [thư mục bằng chứng](evidence/2026-10-31-pricing-runtime/):

- [Tạo đoàn thành công](evidence/2026-10-31-pricing-runtime/01-group-created.jpg), [tổng đoàn sai](evidence/2026-10-31-pricing-runtime/02-group-wrong-total.jpg).
- [Cọc nhanh 635.000đ](evidence/2026-10-31-pricing-runtime/03-deposit-635000.jpg), [cọc phần trăm thực tế](evidence/2026-10-31-pricing-runtime/16-percent-payment.jpg), [request/response phần trăm](evidence/2026-10-31-pricing-runtime/percent-payment-network.json).
- [Lỗi check-in lẻ](evidence/2026-10-31-pricing-runtime/04-checkin-blocked.jpg), [lỗi check-in đoàn](evidence/2026-10-31-pricing-runtime/05-group-checkin-404.jpg), [metadata check-in](evidence/2026-10-31-pricing-runtime/checkin-network.json).
- [Giá mới nhưng tổng cũ](evidence/2026-10-31-pricing-runtime/06-edited-rate-stale-total.jpg), [sau reload và giờ đã lệch](evidence/2026-10-31-pricing-runtime/07-edited-rate-after-reload.jpg), [thu toàn bộ](evidence/2026-10-31-pricing-runtime/08-full-payment-booking.jpg).
- [Preview giữ 1,3 triệu sau đổi giá](evidence/2026-10-31-pricing-runtime/09-base-change-preserves-1300000.jpg), [checkout modal lỗi](evidence/2026-10-31-pricing-runtime/10-checkout-blocked-404.jpg), [quầy thu ngân lỗi](evidence/2026-10-31-pricing-runtime/11-cashier-checkout-blocked.jpg), [metadata checkout](evidence/2026-10-31-pricing-runtime/checkout-network.json).
- [Nhập giá 0](evidence/2026-10-31-pricing-runtime/12-zero-before-create.jpg), [đọc lại thành 1,3 triệu](evidence/2026-10-31-pricing-runtime/13-zero-saved-as-1300000.jpg), [request/response giá 0](evidence/2026-10-31-pricing-runtime/zero-price-network.json).
- [Kế hoạch phòng lỗi](evidence/2026-10-31-pricing-runtime/14-room-plan-crash.jpg), [lưu giá gốc loại phòng lỗi](evidence/2026-10-31-pricing-runtime/15-room-type-price-save-blocked.jpg), [gán phòng lỗi](evidence/2026-10-31-pricing-runtime/17-room-assignment-result.jpg), [metadata gán phòng](evidence/2026-10-31-pricing-runtime/assignment-network.json).
- [Các hồ sơ thử còn lại](evidence/2026-10-31-pricing-runtime/18-final-test-records.jpg).

## Trạng thái dữ liệu sau kiểm chứng

Không xóa dữ liệu thử hoặc hoàn tiền bằng SQL. Bản ghi tài chính và trạng thái bị chặn được giữ để đối soát; các số dưới đây không phải tiền mặt thực thu:

| Tài nguyên | Trạng thái cuối |
|---|---|
| `VSH_GROUP_0018` | Đoàn hai phòng thử, chưa check-in |
| `VSH_RESERVATION_0112`, phòng 1007 | `AUDIT3110-NIGHTLY`, lịch giá 500k/700k + 70k; hai khoản cọc 635k và 100k = 735k; UI còn 535k |
| `VSH_RESERVATION_0113`, phòng 200 | `AUDIT3110-EDIT700`, 700k × 2 = 1,4 triệu; đã ghi thu trước 1,4 triệu, còn 0; giờ bị đổi thành 07:00/05:00 trong ca sửa |
| Mã 0114, phòng 603, `VSH_FOLIO_0063` | `AUDIT3110-WALKIN` đang ở; checkout chưa thành công; chưa có bằng chứng thu tiền checkout thành công |
| `VSH_RESERVATION_0115`, phòng 633 | `AUDIT3110-ZERO`, nhập 0 nhưng bị chốt 1,3 triệu; đổi sang 626 thất bại nên vẫn phòng 633 |
| `VSH_RESERVATION_0116`, phòng `QA3110-A` | `AUDIT3110-BASE`, 01–03/11/2026, báo giá 500k × 2 = 1 triệu |
| Loại `AUDIT3110-TYPE`, phòng `QA3110-A` | Tài nguyên mới dành riêng kiểm chứng; giá loại vẫn 500k vì cập nhật 700k thất bại |
| Giá riêng phòng 603 | Đã khôi phục và đọc lại 1.300.000đ |
| Website | Trả về sơ đồ phòng dạng grid, ngày 31/10, lọc `AUDIT3110`; đóng tab cấu hình tạm |

Ba giao dịch thu trước thử đã lưu: **635.000 + 100.000 + 1.400.000 = 2.135.000đ**. Chúng làm thay đổi sổ phần mềm; không coi là doanh thu thật và không xóa lịch sử tài chính âm thầm. Check-in thử cũng có thể phát sinh bản ghi phí SaaS/BCA theo cơ chế hiện hành; không xác minh thu phí provider hoặc gửi khai báo bên ngoài.

Không chạy lại Jest/build trong lượt browser vì không sửa implementation. Kết quả 169 tests (168 đạt, 1 lỗi) thuộc lượt source/mock trước đó, không cộng vào số ca website. Không dùng agent phụ. Không commit/push/deploy.

Ưu tiên: sửa route/runtime và crash để thông luồng; bảo toàn giá 0 và giờ; dùng một tổng thương mại cho tỷ lệ cọc và các projection; sau đó chạy lại chính các hồ sơ thử để xác nhận bù trừ cọc, hóa đơn và trạng thái checkout trong một hành trình đầy đủ.
