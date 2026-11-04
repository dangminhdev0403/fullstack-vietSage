# Website visual and runtime verification

Status: **FAIL**

Reanalysis of captured evidence; this CLI does not operate the browser. See captured_at per case.

Cases: {'PASS': 0, 'FAIL': 4, 'GAP': 4}
Components: {'PASS': 27, 'FAIL': 4, 'GAP': 5, 'NOT_REQUIRED': 0}

| Case | Behavior | YOLO | Runtime | Overall |
|---|---|---|---|---|
| AUTH_VALID | PASS | PASS | FAIL | FAIL |
| FILTER_GROUP | PASS | GAP | FAIL | FAIL |
| AUTH_COOKIE_EXPIRED | PASS | PASS | FAIL | FAIL |
| FILTER_BOOKING_RANGE | GAP | GAP | GAP | GAP |
| PRICE_ZERO | PASS | PASS | FAIL | FAIL |
| PRICE_BASE_CHANGE | GAP | GAP | GAP | GAP |
| PRICE_NAME_ONLY | GAP | GAP | GAP | GAP |
| CHECKOUT_PREPAID | GAP | GAP | GAP | GAP |

Canceled requests remain visible in the strict runtime gate; an ERR_ABORTED alone is not a confirmed product defect.
YOLO PASS means a reference target was found in its expected region; other detections can still be false positives.

## AUTH_VALID: Phiên hợp lệ mở dashboard chủ khách sạn — FAIL

**Nhận xét: NEEDS_REVIEW**

- 3/3 assertion nghiệp vụ đạt trong khoảng capture đã ghi.
- Runtime có 2 sự kiện ngoài ngoại lệ, trong đó 2 request bị hủy.
- YOLO tìm đủ vùng mục tiêu theo ngưỡng; không xác nhận chữ, tiền hoặc loại trừ nhận nhầm ở vùng khác.
- Bước tiếp: Đối chiếu request hủy với navigation/unmount và request thay thế; chưa kết luận lỗi sản phẩm chỉ từ ERR_ABORTED.

**Nhận xét phạm vi của agent:** Chỉ xác nhận dashboard với phiên hợp lệ; chưa chứng minh refresh đồng thời hoặc nhiều instance.

Capture: 2026-10-31T06:46:57.561Z · URL: https://vietsage.localhost/owner/dashboard

[Capture JSON](<evidence/2026-10-31-yolo-runtime/AUTH_VALID.json>)

[Screenshot](<evidence/2026-10-31-yolo-runtime/AUTH_VALID.jpg>)

- **PASS** evidence: Capture and screenshot present
- **PASS** `owner_dashboard` — Nguồn: DOM; kỳ vọng: Heading dashboard chủ khách sạn hiển thị; quan sát: Heading Tổng quan vận hành — Khách sạn minh 123.
- **PASS** `logout_visible` — Nguồn: DOM; kỳ vọng: Nút Đăng xuất hiển thị; quan sát: Nút Đăng xuất được đối chiếu hiển thị.
- **PASS** `document_200` — Nguồn: CDP; kỳ vọng: Document /owner/dashboard trả 200; quan sát: CDP: /owner/dashboard status 200.

**Luồng — PASS**

1. Mở dashboard với phiên đã đăng nhập và thu ảnh tham chiếu.
2. Bắt đầu CDP, tải lại dashboard, đợi nội dung vận hành hiện.
3. Đọc heading, nút đăng xuất và HTTP document; lưu screenshot/capture.

Nguồn ghi bước: Bổ sung mô tả từ trace thao tác của lượt capture trước; không phải log timestamp từng bước hoặc lượt browser mới.


**Runtime gate — FAIL**; capture đầy đủ: True

| Loại | Endpoint | Status | Canceled | Thông báo |
|---|---|---|---|---|
| request_failed | /api/owner/hotels |  | True | net::ERR_ABORTED |
| request_failed | /g/collect |  | True | net::ERR_ABORTED |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |

Ngoại lệ đã khai báo và khớp chính xác: []

**YOLO — PASS** (confidence ≥ 0.25; IoU ≥ 0.30)

| Vùng mục tiêu | IoU tốt nhất |
|---|---|
| logout_button | 0.823 |

[Ảnh YOLO đánh dấu](<evidence/2026-10-31-yolo-runtime/AUTH_VALID-yolo.jpg>)

Toàn bộ detections (kể cả vùng có thể nhận nhầm): [{"class_id": 0, "label": "logout_button", "confidence": 0.28098732233047485, "box": [1077.933349609375, 8.7262601852417, 1180.3382568359375, 57.423370361328125]}]


## FILTER_GROUP: Mã đoàn có thật hiển thị đúng phòng trên timeline — FAIL

**Nhận xét: NEEDS_REVIEW**

- 4/4 assertion nghiệp vụ đạt trong khoảng capture đã ghi.
- Runtime có 4 sự kiện ngoài ngoại lệ, trong đó 4 request bị hủy.
- YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.
- Vùng YOLO chưa tìm được: room_button.
- Bước tiếp: Đối chiếu request hủy với navigation/unmount và request thay thế; chưa kết luận lỗi sản phẩm chỉ từ ERR_ABORTED.
- Bước tiếp: Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.

**Nhận xét phạm vi của agent:** Chỉ kiểm chứng query #VSH_GROUP_0015 trong lượt capture này; phòng 1003/1004 dựa DOM. YOLO bỏ sót nút phòng không phủ định kết quả lọc.

Capture: 2026-10-31T06:47:33.284Z · URL: https://vietsage.localhost/owner/hotels/cmq2k2lm0003f2oui3ifqp808/rooms?view=tape-chart&startDate=2026-10-31

[Capture JSON](<evidence/2026-10-31-yolo-runtime/FILTER_GROUP.json>)

[Screenshot](<evidence/2026-10-31-yolo-runtime/FILTER_GROUP.jpg>)

- **PASS** evidence: Capture and screenshot present
- **PASS** `query_exact` — Nguồn: DOM; kỳ vọng: Ô tìm kiếm chứa #VSH_GROUP_0015; quan sát: Searchbox: #VSH_GROUP_0015.
- **PASS** `room_1003` — Nguồn: DOM; kỳ vọng: Có nút phòng 1003 trong kết quả; quan sát: DOM có P.1003.
- **PASS** `room_1004` — Nguồn: DOM; kỳ vọng: Có nút phòng 1004 trong kết quả; quan sát: DOM có P.1004.
- **PASS** `no_empty_result` — Nguồn: DOM; kỳ vọng: Không hiện thông báo không tìm thấy phòng; quan sát: DOM không có Không tìm thấy phòng phù hợp; hiển thị 2/71 phòng.

**Luồng — PASS**

1. Mở timeline từ 31/10/2026 và bật thu CDP.
2. Nhập #VSH_GROUP_0015 vào ô tìm mã đặt/đoàn.
3. Đọc phòng 1003/1004, trạng thái kết quả; lưu ảnh và box mẫu.

Nguồn ghi bước: Bổ sung mô tả từ trace thao tác của lượt capture trước; không phải log timestamp từng bước hoặc lượt browser mới.


**Runtime gate — FAIL**; capture đầy đủ: True

| Loại | Endpoint | Status | Canceled | Thông báo |
|---|---|---|---|---|
| request_failed | /api/owner/hotels |  | True | net::ERR_ABORTED |
| request_failed | /api/hotel-ops/hotels/cmq2k2lm0003f2oui3ifqp808/room-plan |  | True | net::ERR_ABORTED |
| request_failed | /g/collect |  | True | net::ERR_ABORTED |
| request_failed | /g/collect |  | True | net::ERR_ABORTED |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |

Ngoại lệ đã khai báo và khớp chính xác: []

**YOLO — GAP** (confidence ≥ 0.25; IoU ≥ 0.30)

| Vùng mục tiêu | IoU tốt nhất |
|---|---|
| clear_filter_button | 0.841 |
| room_button | 0.000 |

[Ảnh YOLO đánh dấu](<evidence/2026-10-31-yolo-runtime/FILTER_GROUP-yolo.jpg>)

Toàn bộ detections (kể cả vùng có thể nhận nhầm): [{"class_id": 0, "label": "clear_filter_button", "confidence": 0.3688798248767853, "box": [768.368408203125, 407.020751953125, 857.0887451171875, 440.1003723144531]}]


## AUTH_COOKIE_EXPIRED: Cookie hết hạn về đăng nhập một lần rồi khôi phục phiên — FAIL

**Nhận xét: NEEDS_REVIEW**

- 6/6 assertion nghiệp vụ đạt trong khoảng capture đã ghi.
- Runtime có 3 sự kiện ngoài ngoại lệ, trong đó 3 request bị hủy.
- YOLO tìm đủ vùng mục tiêu theo ngưỡng; không xác nhận chữ, tiền hoặc loại trừ nhận nhầm ở vùng khác.
- Bước tiếp: Đối chiếu request hủy với navigation/unmount và request thay thế; chưa kết luận lỗi sản phẩm chỉ từ ERR_ABORTED.

**Nhận xét phạm vi của agent:** Expiry được đặt về quá khứ để tái hiện; chưa chờ JWT hết hạn tự nhiên. Ảnh YOLO có thêm vùng email bị nhận như nút login; không dùng detection để tự click.

Capture: 2026-10-31T06:48:38.156Z · URL: https://vietsage.localhost/dangnhap?callbackUrl=%2Fowner%2Fdashboard&reauth=1

[Capture JSON](<evidence/2026-10-31-yolo-runtime/AUTH_COOKIE_EXPIRED.json>)

[Screenshot](<evidence/2026-10-31-yolo-runtime/AUTH_COOKIE_EXPIRED.jpg>)

- **PASS** evidence: Capture and screenshot present
- **PASS** `session_cookie_expired` — Nguồn: COOKIE_METADATA; kỳ vọng: Session cookie biến mất sau khi expiry về quá khứ; quan sát: Trước thử có session cookie; sau đặt expiry quá khứ danh sách session cookie rỗng.
- **PASS** `one_redirect` — Nguồn: CDP; kỳ vọng: Đúng một 307 từ dashboard về login; quan sát: CDP ghi một 307 từ /owner/dashboard.
- **PASS** `login_200` — Nguồn: CDP; kỳ vọng: Document login trả 200; quan sát: CDP /dangnhap status 200.
- **PASS** `login_form` — Nguồn: DOM; kỳ vọng: Form đăng nhập hiển thị; quan sát: DOM có textbox email trên form login.
- **PASS** `relogin_dashboard` — Nguồn: DOM; kỳ vọng: Đăng nhập lại về dashboard; quan sát: Sau login, DOM có heading dashboard chủ khách sạn.
- **PASS** `new_secure_httponly_cookie` — Nguồn: COOKIE_METADATA; kỳ vọng: Có cookie phiên mới với Secure và HttpOnly; quan sát: Metadata cookie phục hồi: Secure=true, HttpOnly=true; không lưu giá trị.

**Luồng — PASS**

1. Bật CDP; đặt expiry của session cookie hiện hữu về quá khứ trong tab thử.
2. Mở dashboard; đối chiếu một 307 tới login 200 và form đăng nhập.
3. Thu ảnh login trước khi đăng nhập; dùng tài khoản được người dùng cấp để đăng nhập lại.
4. Đọc dashboard và thuộc tính Secure/HttpOnly của cookie mới; không ghi cookie value.

Nguồn ghi bước: Bổ sung mô tả từ trace thao tác của lượt capture trước; không phải log timestamp từng bước hoặc lượt browser mới.


**Runtime gate — FAIL**; capture đầy đủ: True

| Loại | Endpoint | Status | Canceled | Thông báo |
|---|---|---|---|---|
| request_failed | /g/collect |  | True | net::ERR_ABORTED |
| request_failed | /api/owner/hotels |  | True | net::ERR_ABORTED |
| request_failed | /g/collect |  | True | net::ERR_ABORTED |
| redirect | /owner/dashboard | 307 |  |  |
| redirect | /api/auth/post-login | 303 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |

Ngoại lệ đã khai báo và khớp chính xác: []

**YOLO — PASS** (confidence ≥ 0.25; IoU ≥ 0.30)

| Vùng mục tiêu | IoU tốt nhất |
|---|---|
| login_button | 0.897 |

[Ảnh YOLO đánh dấu](<evidence/2026-10-31-yolo-runtime/AUTH_COOKIE_EXPIRED-yolo.jpg>)

Toàn bộ detections (kể cả vùng có thể nhận nhầm): [{"class_id": 0, "label": "login_button", "confidence": 0.8333372473716736, "box": [858.2725830078125, 501.53863525390625, 1170.7952880859375, 560.36767578125]}, {"class_id": 0, "label": "login_button", "confidence": 0.2530113160610199, "box": [856.8040161132812, 324.1024169921875, 1170.5716552734375, 374.1848449707031]}]


## FILTER_BOOKING_RANGE: Mã booking ngoài kỳ timeline tự căn ngày và xóa lọc khôi phục phòng — GAP

**Nhận xét: INCOMPLETE**

- Chưa đủ bằng chứng nghiệp vụ để kết luận ca đạt.
- Thiếu bằng chứng ảnh hoặc luồng ghi nhận chưa khớp thứ tự dự kiến.
- Cửa sổ runtime chưa đủ để xác nhận.
- YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.
- Bước tiếp: Chạy luồng còn thiếu và thu observation cho từng assertion.
- Bước tiếp: Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.

- **GAP** evidence: asset is missing or outside evidence directory

## PRICE_ZERO: Đọc lại booking giá 0 giữ đơn giá và tổng bằng 0 — FAIL

**Nhận xét: NEEDS_REVIEW**

- 3/3 assertion nghiệp vụ đạt trong khoảng capture đã ghi.
- Runtime có 1 sự kiện ngoài ngoại lệ, trong đó 1 request bị hủy.
- YOLO tìm đủ vùng mục tiêu theo ngưỡng; không xác nhận chữ, tiền hoặc loại trừ nhận nhầm ở vùng khác.
- Bước tiếp: Đối chiếu request hủy với navigation/unmount và request thay thế; chưa kết luận lỗi sản phẩm chỉ từ ERR_ABORTED.

**Nhận xét phạm vi của agent:** Đối chiếu form đọc lại booking 0117: đơn giá/tổng 0, giá gốc 1.300.000. Không lưu form, check-in, checkout hoặc đối soát ledger trong ca này; YOLO nhận nhiều vùng giống ô nhập nên không tự đọc tiền.

Capture: 2026-10-31T07:03:43.198Z · URL: https://vietsage.localhost/owner/hotels/cmq2k2lm0003f2oui3ifqp808/rooms?view=tape-chart&startDate=2026-11-01&businessDate=2026-11-01

[Capture JSON](<evidence/2026-10-31-yolo-runtime/PRICE_ZERO.json>)

[Screenshot](<evidence/2026-10-31-yolo-runtime/PRICE_ZERO.jpg>)

- **PASS** evidence: Capture and screenshot present
- **PASS** `rate_zero` — Nguồn: DOM; kỳ vọng: Đơn giá đã chốt bằng 0; quan sát: Value ô đơn giá: 0.
- **PASS** `total_zero` — Nguồn: DOM; kỳ vọng: Tổng tiền phòng bằng 0; quan sát: DOM: Tổng tiền phòng: 0 ₫.
- **PASS** `no_current_price_fallback` — Nguồn: DOM; kỳ vọng: Form giữ giá 0 khi giá gốc hiện tại 1.300.000; quan sát: DOM: Giá gốc 1.300.000 ₫; Đơn giá 0 ₫/đêm và tổng 0 ₫.

**Luồng — PASS**

1. Từ timeline đã tải, mở booking thử 0117 tại phòng 627; bật CDP trước khi mở modal.
2. Đọc đơn giá 0, tổng 0 và giá gốc 1.300.000 trong form; thu ảnh và box ô đơn giá.
3. Đóng bằng Hủy bỏ; không lưu hoặc thu tiền.

Nguồn ghi bước: Bổ sung mô tả từ trace thao tác của lượt capture trước; không phải log timestamp từng bước hoặc lượt browser mới.


**Runtime gate — FAIL**; capture đầy đủ: True

| Loại | Endpoint | Status | Canceled | Thông báo |
|---|---|---|---|---|
| request_failed | /api/hotel-ops/hotels/cmq2k2lm0003f2oui3ifqp808/billing/booking-payments |  | True | net::ERR_ABORTED |
| redirect | /socket.io/ | 308 |  |  |
| redirect | /socket.io/ | 308 |  |  |

Ngoại lệ đã khai báo và khớp chính xác: []

**YOLO — PASS** (confidence ≥ 0.25; IoU ≥ 0.30)

| Vùng mục tiêu | IoU tốt nhất |
|---|---|
| nightly_rate_input | 0.841 |

[Ảnh YOLO đánh dấu](<evidence/2026-10-31-yolo-runtime/PRICE_ZERO-yolo.jpg>)

Toàn bộ detections (kể cả vùng có thể nhận nhầm): [{"class_id": 0, "label": "nightly_rate_input", "confidence": 0.6431607604026794, "box": [577.1412963867188, 418.36358642578125, 1165.753662109375, 461.8093566894531]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.6010123491287231, "box": [550.4512939453125, 456.3338623046875, 1167.1165771484375, 504.47210693359375]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.502476692199707, "box": [105.65681457519531, 206.94375610351562, 510.6338195800781, 250.12149047851562]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.46692249178886414, "box": [72.63328552246094, 461.65728759765625, 528.7315673828125, 527.2500610351562]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.4388110041618347, "box": [539.5416259765625, 353.26959228515625, 1179.020751953125, 416.5660400390625]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.4100610017776489, "box": [555.4402465820312, 455.0143737792969, 1140.1845703125, 492.1977233886719]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.34623467922210693, "box": [547.9681396484375, 441.28204345703125, 1167.19873046875, 512.8583374023438]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.33478713035583496, "box": [549.9105224609375, 585.8441162109375, 1228.7388916015625, 646.70263671875]}, {"class_id": 0, "label": "nightly_rate_input", "confidence": 0.2857414484024048, "box": [495.36212158203125, 502.1154479980469, 1167.7918701171875, 575.92041015625]}]


## PRICE_BASE_CHANGE: Đổi giá gốc không đổi giá đã chốt của booking cũ — GAP

**Nhận xét: INCOMPLETE**

- Chưa đủ bằng chứng nghiệp vụ để kết luận ca đạt.
- Thiếu bằng chứng ảnh hoặc luồng ghi nhận chưa khớp thứ tự dự kiến.
- Cửa sổ runtime chưa đủ để xác nhận.
- YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.
- Bước tiếp: Chạy luồng còn thiếu và thu observation cho từng assertion.
- Bước tiếp: Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.

- **GAP** evidence: asset is missing or outside evidence directory

## PRICE_NAME_ONLY: Chỉ sửa tên không đổi giờ, tổng, lịch giá hoặc cọc — GAP

**Nhận xét: INCOMPLETE**

- Chưa đủ bằng chứng nghiệp vụ để kết luận ca đạt.
- Thiếu bằng chứng ảnh hoặc luồng ghi nhận chưa khớp thứ tự dự kiến.
- Cửa sổ runtime chưa đủ để xác nhận.
- YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.
- Bước tiếp: Chạy luồng còn thiếu và thu observation cho từng assertion.
- Bước tiếp: Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.

- **GAP** evidence: asset is missing or outside evidence directory

## CHECKOUT_PREPAID: Checkout đã trả trước không thu lần hai — GAP

**Nhận xét: INCOMPLETE**

- Chưa đủ bằng chứng nghiệp vụ để kết luận ca đạt.
- Thiếu bằng chứng ảnh hoặc luồng ghi nhận chưa khớp thứ tự dự kiến.
- Cửa sổ runtime chưa đủ để xác nhận.
- YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.
- Bước tiếp: Chạy luồng còn thiếu và thu observation cho từng assertion.
- Bước tiếp: Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.

- **GAP** evidence: asset is missing or outside evidence directory

## Limits

- YOLO detects reference objects; it does not validate text, money, permissions or database transactions.
- Visual misses remain GAP until a UI model and thresholds are validated.
- Only captured cases/runtime intervals are covered; missing or truncated evidence never passes.
