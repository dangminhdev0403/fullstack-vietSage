STRICT AUDIT MODE: ACTIVE (PONYTAIL: ULTRA).

# Rà soát luồng lễ tân và responsive — 04/11/2026

> Cập nhật sau khi được cho phép sửa: đã triển khai remediation F1–F9 và kiểm tra lại bên dưới. Phần audit gốc giữ nguyên làm bằng chứng trước sửa; kết luận hiện tại áp dụng theo mục “Kết quả remediation”, không thay thế các GAP ngoài phạm vi.

**Kết luận: chưa đạt để xác nhận vận hành ổn định.** Có lỗi chọn sai khách khi mở checkout, dữ liệu cũ sau mutation và modal xung đột mất vùng thao tác trên mobile. Không được diễn giải các ca thành công bên dưới thành chứng nhận toàn bộ luồng.

## Phạm vi và snapshot

- HEAD: `8cd2040e38681c5a89cbbcda0db71d48699615d0`; kiểm tra trên worktree đang có chỉnh sửa, không phải commit nguyên bản. Các chỉnh sửa có trước được giữ nguyên; đợt rà soát này không sửa mã ứng dụng.
- Local thật: Next.js + NestJS + PostgreSQL Docker, hotel `cmq2k2lm0003f2oui3ifqp808`; tài khoản tenant được người dùng cho phép. Không lưu thông tin đăng nhập trong báo cáo.
- Dữ liệu giả lập riêng: 11 phòng QA04-A…K, 9 đơn AUDIT04, 2 khách đang ở ban đầu; thêm đơn UI 0119 và đoàn VSH_GROUP_0019 gồm đơn 0120/0121. Manifest trong [fixtures.json](evidence/2026-11-04-full-flow/fixtures.json).
- DB được tạo tình huống hôm qua/hôm nay/ngày mai theo quyền đã cấp. Không migration/reset/xóa dữ liệu. Fixture được giữ để tái hiện; các ca nhận phòng/thanh toán thử có ảnh hưởng số liệu local.
- Lần tiếp tục gặp runtime đã dừng, đã khởi động lại Docker Desktop, container PostgreSQL và hai dev server. Đăng nhập lại thành công; Nest watch compile báo 0 lỗi. Không coi lần đăng nhập lỗi khi API chưa sẵn sàng là lỗi sản phẩm.

## Finding ledger

Đường dẫn component viết tắt dưới đây nằm trong `frontends/front-end-vietsage/src/features/hotel-ops/components/`. Mỗi hướng sửa là đề xuất, chưa được triển khai trong đợt audit này.

| ID / mức | Trạng thái | Bằng chứng và ảnh hưởng | Sửa tối thiểu / kiểm chứng lại |
|---|---|---|---|
| F1 / P1 | VIOLATION | `front-desk-room-detail-panel.tsx:1655-1660`: callback bỏ qua stayId/phòng xung đột. Mở QA04-D, chọn đổi sang QA04-E, nút nói checkout khách E nhưng settlement mở khách D và folio D. [Ảnh](evidence/2026-11-04-full-flow/wrong-stay-checkout.png). Đã dừng trước submit checkout sai khách. | Lưu target stayId/roomId do trạm trả về, tải đúng stay/folio theo target; chặn nếu identity không khớp. Browser regression D→E phải hiển thị E/folio E và D không đổi. |
| F2 / P1 | VIOLATION | Modal xung đột 390×844: vùng form cuộn chỉ còn clientHeight khoảng 40px, scrollHeight khoảng 1900px; footer tới y≈903 vượt viewport. `edit-reservation-modal.tsx:1205,1270,1344,1442,2139` có nhiều khối `shrink-0`. [390px](evidence/2026-11-04-full-flow/reservation-conflict-390x844.png), [landscape](evidence/2026-11-04-full-flow/reservation-conflict-844x390.png). | Một body cuộn chứa cả cảnh báo/đổi phòng; header gọn, một footer hành động; dùng chiều cao khả dụng theo dvh, min-height:0 đúng chuỗi flex. Chạy lại 11 kích thước và thao tác nút cuối thật. |
| F3 / P1 | VIOLATION | `daily-movements-modal.tsx:965-973`: sau assign + await refresh vẫn đọc `arrivalsList` trong closure cũ. AUDIT04-UNASSIGNED gán H rồi check-in báo stale dù không có người sửa khác; tải lại và nhập cùng khách thì thành công. | Mutation trả record mới hoặc fetch authoritative theo id rồi mở workspace với updatedAt mới. Tái hiện assign→check-in một mạch không reload; test stale thật vẫn phải bị từ chối. Ảnh `assign-checkin-stale.png` lưu sau đóng modal, không chứng minh riêng thông báo lỗi. |
| F4 / P2 | VIOLATION | Express check-in AUDIT04-NOQR thành công, DB OCCUPIED nhưng panel cha còn RESERVED và nút nhận phòng. [Ảnh](evidence/2026-11-04-full-flow/stale-reserved-after-checkin.png). `front-desk-room-detail-panel.tsx:1672-1676` chỉ thay localReservation/invalidate. | Đồng bộ selectedRoom bằng id từ query mới hoặc đóng panel sau thành công; tránh giữ snapshot object cũ. Kiểm tra panel không cho check-in lại khi stay đã ACTIVE. |
| F5 / P2 | VIOLATION | QA04-G có physical BLOCKED nhưng grid ghi “Khách in hôm nay”, cho “Làm thủ tục nhận phòng”; danh sách đến còn ghi sẵn sàng cho phòng bị chặn/xung đột. Backend vẫn từ chối đổi đơn vào G. [Ảnh từ chối](evidence/2026-11-04-full-flow/blocked-room-denied.png). | Dùng cùng status/conflict model cho grid, arrivals, panel và tape chart; physical veto phải được giữ, CTA mở đúng trạm giải quyết. Kiểm tra OCCUPIED/OVERDUE/PROCESSING/BLOCKED riêng. |
| F6 / P2 | VIOLATION | Khách đi cùng có tên, bỏ trống CCCD tùy chọn → HTTP400 `occupants.0.identityNumber` không được trống; UI chỉ báo chung. `check-in-workspace.tsx:1189,1280` gửi occupants, backend `services/auth-service/src/modules/property/domain/schemas/rooms.schema.ts:239-258` cho optional nhưng không chấp nhận chuỗi rỗng. [Ảnh](evidence/2026-11-04-full-flow/multi-guest-empty-id-error.png). | Chuẩn hóa blank optional thành omitted, giữ kiểm tra định dạng khi có giá trị; hiển thị lỗi theo khách/trường. Test 2 khách tên hợp lệ + ID trống phải theo đúng contract. |
| F7 / P2 | VIOLATION | Đặt đoàn J/K giá phòng DB=0: input hiển thị 900.000 mỗi phòng trong khi tổng=0. Đã nhập tường minh 0 trước tạo đoàn. [Ảnh](evidence/2026-11-04-full-flow/group-zero-price-input-mismatch.png). `staff-rooms-client.tsx:9213-9230` kết hợp extractRoomBasePrice/catalog fallback; root helper cần truy tiếp trước sửa. | Một nguồn tính giá dùng chung cho input/tổng/payload; giá 0 phải được giữ. Kiểm tra 0/null/override/daily rates, không chữa bằng thay nhãn tổng. |
| F8 / P2 | VIOLATION | Đoàn mới không có trong danh sách tới khi reload; sau nhận QA04, danh sách từ 3 thành 0, reload khôi phục 2 đoàn còn chờ. [Trước reload](evidence/2026-11-04-full-flow/groups-disappear-after-checkin.png), [sau reload](evidence/2026-11-04-full-flow/groups-restored-after-reload.png). `staff-rooms-client.tsx:1716-1758,9950-9990`: dùng chung arrivalsList, background week nhưng onSuccess loadArrivals(arrivalsRange) có thể là today. | Tách query đoàn với phạm vi riêng và invalidation sau create/check-in; không ghi đè dataset week bằng today. Test create→list ngay và check-in→các đoàn chưa nhận còn nguyên. |
| F9 / P2 | VIOLATION | `group-check-in-modal.tsx:1001-1004` luôn gửi allow/confirm early/late=true. Đoàn dự kiến 05/11 được nhận ngày04/11 qua xác nhận chung không nêu ngoại lệ ngày. DB cả0120/0121 ACTIVE. [DB](evidence/2026-11-04-full-flow/group-result.json), [thành công](evidence/2026-11-04-full-flow/group-success.png). | Chỉ gửi confirmation sau khi người dùng thấy và xác nhận ngoại lệ đúng phòng/ngày; dùng cùng cơ chế lỗi nghiệp vụ như nhận đơn lẻ. Test cancel không tạo stay, accept mới nhận. |

## Ma trận ca nghiệp vụ đã chạy

COMPLIANT chỉ áp dụng cho kết quả cụ thể của từng ca, không bao phủ mọi nhánh. Browser là kiểm thử tương tác thủ công, không có số lượng assertion tự động hay exit code riêng.

| Ca | Trạng thái | Kết quả / đối chiếu |
|---|---|---|
| Đặt đơn từ UI, đặt lại phòng vừa trả | COMPLIANT | Tạo VSH_RESERVATION_0119 ở A thành công, sau đó hủy; DB CANCELLED và roomId=null. [Ảnh tạo](evidence/2026-11-04-full-flow/ui-booking-created-0119.png). |
| Đơn hôm nay → nhận → cọc → thanh toán còn lại → trả → dọn xong | COMPLIANT | AUDIT04-TODAY: stay CHECKED_OUT, phòng A AVAILABLE; tổng200.000, paid200.000, balance0; cọc100.000 được đối chiếu trong phiên test. Không chứng minh các nhánh hoàn tiền/công nợ. |
| Phòng đang dọn → xác nhận sạch → nhận đơn | COMPLIANT | AUDIT04-DIRTY/C chuyển CHECKED_IN, stay ACTIVE; không nhận khi chưa hoàn tất bước phòng sạch. |
| Nhận muộn: hủy xác nhận rồi thử lại | COMPLIANT | AUDIT04-LATE/B nhận thành công sau xác nhận, stay ACTIVE; [hộp xác nhận](evidence/2026-11-04-full-flow/late-confirmation.png). |
| Nhận sớm đơn lẻ, hủy | COMPLIANT | Không tạo stay ở bước hủy; sau đó dùng cùng đơn kiểm tra no-show riêng. |
| Không có QR phòng → express check-in | COMPLIANT | AUDIT04-NOQR/I được tự tạo QR, một stay ACTIVE; UI panel cũ vẫn lỗi F4. |
| Nhiều khách sau tải dữ liệu mới | COMPLIANT | AUDIT04-UNASSIGNED/H có2 occupants, một stay ACTIVE; không phủ nhận lỗi F3/F6 ở lần đầu. |
| Đổi vào phòng BLOCKED | COMPLIANT | Bị từ chối “Phòng hiện không khả dụng để đặt”; không đổi thành G. |
| Tạo đoàn rồi nhận2 phòng | COMPLIANT | 0120/J và0121/K CHECKED_IN,2 stays ACTIVE đúng tên QA04 GROUP J/K. Có ngoại lệ F8/F9. |
| Checkout khách đang ở/quá hạn qua trạm đổi phòng | VIOLATION | Sai target settlement F1; chưa submit để tránh tác động sai fixture. |
| Assign→check-in không reload | VIOLATION | F3, cần reload để hoàn tất. |
| Khách đi cùng không CCCD | VIOLATION | F6, HTTP400. |
| No-show cho đơn ngày mai | GAP | UI chấp nhận AUDIT04-EARLY thành NO_SHOW, roomId=null. Cần xác nhận quy tắc sản phẩm có cho đánh dấu trước ngày đến; chưa tự kết luận bug chính sách. |
| 999 khách | COMPLIANT | Bị từ chối giới hạn ≤50; thông báo tiếng Anh là điểm cần chỉnh i18n. Ca này không chứng minh sức chứa loại phòng. |

DB snapshot trước tiếp tục: [db-state.json](evidence/2026-11-04-full-flow/db-state.json); sau khôi phục trước nhận đoàn: [db-state-resumed.json](evidence/2026-11-04-full-flow/db-state-resumed.json); kết quả đoàn nằm riêng trong group-result.json.

## Responsive và xác minh kỹ thuật

| Kiểm tra | Trạng thái | Bằng chứng |
|---|---|---|
| 7 bề mặt ×11 kích thước | COMPLIANT cho việc thu thập | 77 ảnh: grid, room-detail, reservation-conflict, checkout, arrivals-list, checkin-workspace, group-booking; kích thước320×740,360×800,390×844,430×932,768×1024,820×1180,1024×768,1280×900,1440×1000,1920×1080,844×390. Không đồng nghĩa 77 ca đều usable. |
| Modal xung đột mobile/landscape | VIOLATION | F2. Tràn vùng hành động theo chiều dọc; không chỉ là vấn đề trang có thanh cuộn ngang hay không. |
| Modal nhận đoàn390×844,844×390 | COMPLIANT có giới hạn | Nút Hủy/Nhận không bị che tại tâm nút trong lần đo lại; [hit test390](evidence/2026-11-04-full-flow/group-mobile-hit-test.json), hai ảnh group-checkin-mobile-overlay/landscape. Không suy rộng mọi chiều cao. |
| Click modal điều hướng nhầm ở viewport mặc định | GAP | Đã thấy click nhận đoàn dẫn sang trang Báo cáo lúc nối lại phiên; chưa giữ được kích thước/hit-test tại thời điểm đó. Không gộp vào lỗi overlay đã chứng minh. |
| `git diff --check` | COMPLIANT | Chạy khi tiếp tục, exit0; không chứng minh logic/runtime. |
| Nest watch compilation | COMPLIANT | Sau khởi động lại báo0 TypeScript errors và application successfully started; không phải unit/integration test. |
| Log/CDP toàn phiên | GAP | Phiên trước có HTTP400/409 và GET canceled ERR_ABORTED cần phân loại; bộ đệm JS không còn khi nối lại, chưa có export đầy đủ. Không tuyên bố runtime clean. |
| Postman collection/contract assertions | GAP | Đã đọc skill api-testing; không chạy collection, không có assertion count/API contract pass. Bằng chứng hiện tại là UI thật và DB, không phải Postman certification. |

## Hướng xử lý và điều kiện đóng lỗi

1. Sửa F1 và F3 trước: identity của stay/folio và version của reservation phải theo dữ liệu mới từ server. Giữ optimistic concurrency; không bỏ expectedUpdatedAt để che stale.
2. Hợp nhất modal thành header gọn + body cuộn + một footer; đưa danh sách phòng thay thế vào phần mở rộng có giới hạn chiều cao. Mobile dùng hàng thông tin ngắn, chi tiết mở theo phòng; không lặp nhiều nút checkout/nhận cùng nhiệm vụ.
3. Tách query theo nghiệp vụ/ngày: room plan, daily movements và group arrivals có key/phạm vi riêng. Mutation invalidation phải cập nhật cả record đang chọn và danh sách, không chỉ grid.
4. Chuẩn hóa dữ liệu đầu vào/giá một lần theo contract; dùng chung quy tắc xác nhận sớm/muộn cho đơn và đoàn.
5. Sau sửa chạy các test hành vi đúng mục tiêu và replay bằng browser+DB: D→E không checkout D; assign→receive một mạch; optional blank2 khách; zero-price đoàn; đoàn còn lại sau nhận;11 kích thước có thể tiếp cận footer bằng chuột/bàn phím.

## GAP còn lại — chưa thể gọi là full coverage

- Chưa kiểm thử đồng thời hai phiên/transaction lock thật, race checkout/dọn/nhận, rollback sau partial group failure và retry không tạo stay trùng.
- Chưa chạy đủ từng nhánh trên cả4 bề mặt (room detail, arrival detail, tape chart, trạm sửa đơn); ảnh responsive tập trung grid/modal liên quan, không chứng minh parity4 bề mặt.
- Chưa kiểm thử đầy đủ walk-in, gia hạn chạm booking kế tiếp, chuyển phòng sau nhận, đổi ngày qua đêm/DST, room-type capacity, long names/i18n, keyboard/screen-reader và mất mạng giữa mutation.
- Chưa phủ trả phòng thiếu tiền/chuyển công nợ, trả một phần/hoàn tiền, dịch vụ/phụ thu/discount và mọi cách phân bổ cọc; không có giao dịch provider thật.
- Không chạy gửi BCA/OTA, scanner thật, provider hoặc production. Test dữ liệu giả lập local không chứng minh tích hợp bên ngoài.
- Không chạy lại toàn bộ lint/build/test suite trong audit này; các kết quả27 test ở đợt sửa trước không được dùng để kết luận findings hiện tại đã sửa.

Các GAP trên cần được thực thi trước khi kết luận “đầy đủ mọi trường hợp” hoặc “không lỗi khi chạy”.

## Kết quả remediation — 04/11/2026

Mã sửa nằm trên worktree hiện tại, chưa commit. Không đổi API/schema, không migration hay cài package. Các phần dirty có trước, bao gồm logic phục hồi đoàn, được giữ lại. Thêm fixture riêng QA04-L/M/N/O, đơn AUDIT04-FIX-ASSIGN/EXPRESS và đoàn VSH_GROUP_0020 để chạy lại; không xóa dữ liệu cũ.

| Finding | Trạng thái sau sửa | Thay đổi và bằng chứng |
|---|---|---|
| F1 | VIOLATION → COMPLIANT trong ca kiểm tra | `front-desk-room-detail-panel.tsx:1662` chuyển quyết toán bằng stayId mục tiêu; arrival detail bỏ roomId của đơn cũ khỏi link mục tiêu. Browser D→E mở `AUDIT04-FOLIO-E`, không còn D. [Ảnh sau sửa](evidence/2026-11-04-full-flow/remediation/checkout-target-E-after.png). Test callback đúng target và thiếu quyền có trong bộ27 ca. Không submit checkout D/E. |
| F2 | VIOLATION → COMPLIANT trong matrix11 kích thước | `edit-reservation-modal.tsx:1202,1269,2143`: giới hạn theo dvh, một vùng cuộn bao gồm quick actions/cảnh báo, footer gọn giữ nhận/lưu/hủy. [Geometry đã chờ ổn định](evidence/2026-11-04-full-flow/remediation/responsive.json): cả11 footer trong viewport và hit-test tâm các nút không bị che; mobile390 body516px, landscape225px. [Ảnh mobile](evidence/2026-11-04-full-flow/remediation/conflict-mobile-after.png). Không dùng số đo ngay trong resize transition để kết luận. |
| F3 | VIOLATION → COMPLIANT | `daily-movements-modal.tsx:977`: đọc reservation từ server sau assign, đưa nguyên record mới vào workspace, không bỏ expectedUpdatedAt. Browser gán N→nhận2 khách thành công trong cùng phiên không reload; DB một stay ACTIVE. Unit có fetch thất bại không mở workspace bằng bản cũ. |
| F4 | VIOLATION → COMPLIANT | `front-desk-room-detail-panel.tsx:1682`: express success CHECKED_IN đóng panel giữ snapshot cũ. Browser O: modal/panel đóng, grid OCCUPIED; DB một stay ACTIVE. [Ảnh N/O](evidence/2026-11-04-full-flow/remediation/assign-and-express-after.png). |
| F5 | VIOLATION → COMPLIANT trong ca đã chạy | Model status giữ physical veto; grid ưu tiên blocked/maintenance/processing trước incoming reservation; arrivals đối chiếu phòng vật lý và active stay, không gắn nhãn sẵn sàng theo roomId đơn thuần. Browser G ghi Đã khóa phòng; daily list D/E ghi Chưa trả phòng, G ghi Phòng bị chặn. Unit phủ BLOCKED/MAINTENANCE/OUT_OF_SERVICE và PROCESSING/DIRTY so với projected reservation; giữ projection tương lai cho dirty. |
| F6 | VIOLATION → COMPLIANT cho blank optional | `check-in-workspace.tsx:1198`: bỏ trống CCCD/DOB thành undefined; đoàn cũng không gửi null cho các trường optional. Browser N nhận hai người với ID/DOB trống thành công. [DB replay](evidence/2026-11-04-full-flow/remediation/db-replay.json) có2 occupants; không tuyên bố đã cải thiện mọi thông báo validation theo trường. |
| F7 | VIOLATION → COMPLIANT | `staff-rooms-client.tsx:676-690,9345`: giá0 được giữ ở số/decimal-string, input hiển thị0, không fallback catalog900.000; nhãn giá0 cũng hiện0. Browser L/M input0, tổng0, tạo0020; [ảnh](evidence/2026-11-04-full-flow/remediation/group-zero-price-after.png). |
| F8 | VIOLATION → COMPLIANT trong ca đã chạy | `staff-rooms-client.tsx:1740-1745,9967,9991`: query đoàn theo tuần riêng khỏi arrivalsRange; dùng resource/repository và invalidation hiện có. Đoàn0020 xuất hiện ngay sau tạo; sau nhận hết,2 đoàn cũ vẫn còn không reload. [Sau tạo](evidence/2026-11-04-full-flow/remediation/new-group-without-reload-after.png), [sau nhận](evidence/2026-11-04-full-flow/remediation/remaining-groups-after-checkin.png). |
| F9 | VIOLATION → COMPLIANT | `group-check-in-modal.tsx:55`: request đầu không có cờ early/late; server yêu cầu mới xác nhận rõ tên/phòng/ngày rồi retry đúng ngoại lệ, giữ version. State đoàn giữ plannedCheckInAt khi khởi tạo/refresh. Browser0020 hủy L, nhận M: [DB partial](evidence/2026-11-04-full-flow/remediation/group-partial.json) L chưa có stay/M ACTIVE; retry L: [DB cuối](evidence/2026-11-04-full-flow/remediation/group-retry-final.json) mỗi phòng đúng1 stay. [Cảnh báo](evidence/2026-11-04-full-flow/remediation/group-early-confirm-after.png). Unit phủ accept/cancel cả early và late. |

### Gates đã chạy

| Gate / command | Kết quả |
|---|---|
| `pnpm -C frontends/front-end-vietsage exec node --experimental-strip-types --test src/features/hotel-ops/turnaround-regression.test.mjs src/features/hotel-ops/front-desk-remediation.test.mjs src/features/hotel-ops/utils/check-in-error.test.ts` | COMPLIANT: exit0, **27/27 unique tests**,0 skipped/failed. Kiểm tra logic và wiring hiện tại qua TypeScript AST/VM; không thay cho React integration hoặc DB concurrency. Node báo MODULE_TYPELESS_PACKAGE_JSON warning của runner, không thay package để dập cảnh báo. |
| `pnpm -C frontends/front-end-vietsage exec tsc --noEmit` | COMPLIANT: exit0 sau bản sửa cuối. |
| `node scripts/verify-ui-rules.cjs` | COMPLIANT: exit0, static UI gate; không phải chứng nhận WCAG. |
| `git diff --check` | COMPLIANT: exit0. |
| ESLint8 component/repository/resource paths sửa | COMPLIANT cho không có error: exit0,15 warning ở lần chạy; không gọi là warning-free. |
| ESLint `staff-rooms-client.tsx` | **VIOLATION tồn tại trước sửa:** exit1,35 errors. So sánh lintText HEAD/current cùng config: HEAD35 errors/16 warnings; current35 errors/15 warnings; không phát sinh diagnostic mới sau chuẩn hóa số dòng. [Delta](evidence/2026-11-04-full-flow/remediation/lint-client-delta.json). Hai dòng status compatibility thêm cuối không thay hook/any contract. Không tuyên bố toàn frontend lint sạch. |
| Browser+DB replay | COMPLIANT có phạm vi như9 dòng trên; giữ dữ liệu giả lập để tái hiện. Không giao dịch provider thật. |

Hook thiết kế báo5 vị trí gray-on-color: đã đổi màu nút chi tiết theo sky/purple/amber và nút xóa khách theo red, không thêm suppression; không để lại5 finding đó.

### GAP còn lại sau sửa

Chưa chứng minh toàn bộ parity4 bề mặt, race hai phiên/lock và rollback lỗi DB thật, API contract assertions, scanner/BCA/provider thật, tất cả nhánh tiền/công nợ/hoàn tiền và a11y. Ca partial+retry đoàn nay đã chạy thật nhưng không đại diện mọi lỗi mạng/transaction. Query đoàn giữ giới hạn100 bản ghi và phạm vi tuần như truy vấn có trước; chưa chứng nhận khách sạn vượt100 arrivals/tuần. Quy tắc no-show trước ngày đến chưa được quyết định. Các lỗi lint35 của trang phòng còn nguyên ngoài phạm vi9 finding; các GAP này không được đổi thành PASS.

## Calendar workspace verification — production start, 2026-11-04

Verdict: **FAIL against the requested calendar workspace acceptance**, despite passing core/static checks. This pass reviewed and tested the delivered UI; no application source or database records were edited.

Runtime: `pnpm build:front` exit 0; build ID `pvAyB9uGIb1fpjd8foaI6`. Frontend `pnpm -C frontends/front-end-vietsage start` (Next start, port 3000); API `pnpm -C services/auth-service start:prod` (compiled dist, port 8080); existing PostgreSQL running. The two calendar source files were last changed at 19:15, before BUILD_ID at 19:28 local time. Runtime is not watching subsequent source edits. API dist was reused, not rebuilt in this pass.

Core first: existing three regression files passed **27/27 unique tests**, zero failures/skips, exit 0. Frontend `tsc --noEmit` exit 0; UI gate exit 0; scoped `git diff --check` exit 0. These are unit/wiring/static evidence, not full transaction coverage.

### Browser measurements

Logged in with the authorized tenant account, opened the calendar, collapsed desktop navigation, and measured at the top of the page. Visible height is the intersection of the calendar rectangle with the viewport, not its CSS height. Room rows are 36px; count includes only complete visible room rows.

| Viewport | Calendar top | Visible calendar | Full room rows | Result |
|---|---:|---:|---:|---|
| 1366×768 | 328px | 440px / 57.3% | 9 | Misses 75% and 12 rows |
| 1440×900 | 328px | 572px / 63.6% | 13 | Misses 75% and 16 rows |
| 320×740 | 798px | 0px | 0 | Calendar below initial viewport |
| 390×844 | 696px | 148px / 17.5% | 1 | Toolbar/header dominates |
| 768×1024 | 484px | 540px / 52.7% | 12 | Requires substantial outer scrolling |
| 1024×768 | 368px | 400px / 52.1% | 8 | Requires substantial outer scrolling |
| 1920×1080 | 288px | 792px / 73.3% | 19 | Still below requested 75% |

Evidence: [measurements](evidence/2026-11-04-full-flow/calendar-start/measurements.json), [desktop 1366](evidence/2026-11-04-full-flow/calendar-start/desktop-1366.png), [desktop 1440](evidence/2026-11-04-full-flow/calendar-start/desktop-1440.png), [mobile 320](evidence/2026-11-04-full-flow/calendar-start/viewport-320.png), [mobile 390](evidence/2026-11-04-full-flow/calendar-start/viewport-390.png).

### Confirmed findings

- **P1 — Workspace height remains incorrect.** The page heading and wrapping toolbar push the calendar down; `max-h: calc(100vh - 165px)` does not account for its actual top. At 1366 the two logical toolbar rows wrap into three physical rows. Use a viewport-bounded workspace with a compact header and `min-height:0`/remaining-space calendar, plus responsive overflow controls. Do not count offscreen calendar pixels toward acceptance.
- **P1 — Mobile navigation covers primary detail actions.** At 390×844 the detail sheet is 844px high; Check-out occupies y748–788 and Edit y796–832, beneath the persistent bottom navigation. [Evidence](evidence/2026-11-04-full-flow/calendar-start/mobile-footer-offscreen.png). The sheet/footer needs correct stacking and bottom inset/safe-area allocation.
- **P2 — Escape does not close details.** Reproduced on desktop and mobile; mobile dialog count remains 1 after Escape. The close control advertises Esc, but the keyboard handler returns whenever selectedBlock exists without handling Escape. Explicit close button works. Restore Escape, focus management and focus return.
- **P2 — Calendar is not the initial default.** A fresh authenticated entry opened grid with large KPI cards; current StaffRoomsClient fallback remains `grid` at line 898. Preserve explicit URL/preference choices while selecting the requested calendar default when neither exists.
- **P1 source finding — Stay payment/debt can be fabricated from incomplete data.** BookingDetailPanel around lines 1774–1783 casts summary/folio to generic records, reads undeclared `paid`/`balance`, defaults paid to 0 and derives debt. The actual FolioSummary/FolioListItem contracts do not declare those amounts. Browser showed a stay's full total as debt, but this pass did not establish that stay's actual paid amount; no incorrect transaction amount is claimed as reproduced. Use authoritative invoice/payment balance data or an unavailable state, and verify a deposited/part-paid stay.
- **P2 source finding — Edit affordance lacks read-only gate.** Both desktop/mobile `onOpenEdit` props around lines 5539 and 5582 depend on booking kind without `!isReadOnly`. Owner browser session cannot prove the read-only-user outcome; verify that role explicitly.

### Browser behavior observed

- Search QA04 filters room rows; clear restores them. Group price is shown once; neutral room backgrounds and 36px row geometry are present. Seven/fourteen-day controls work and wide content remains inside the calendar scroll container.
- Vertical scroll to calendar scrollTop 900 preserved the header at y328 and category header at y392. Full horizontal sticky-column verification remains a GAP.
- Booking keyboard Enter opens the correct record; desktop inline details and mobile sheet load selected guest data. Explicit close works. Escape fails as described above.
- Reservation `QA04 ACTIVE` on occupied `QA04-D` correctly shows the active-stay conflict confirmation naming `QA04 Existing D`. Choosing the alternative opens the edit/room-coordination form. Canceled before saving; no new check-in, checkout, reservation or room move was committed. [Conflict evidence](evidence/2026-11-04-full-flow/calendar-start/active-conflict-confirm.png).
- One pointer attempt after changing viewport opened an empty-room creation form instead of the requested booking, while keyboard Enter opened the correct stay. Preserve as **NEEDS_REVIEW**, not a confirmed product defect, until reproduced at a stable viewport. The form was canceled.
- Browser captured no console errors/warnings in the exercised actions. No claim of complete network, a11y, drag/resize, all-role or full-flow coverage.

Runtime notes: Next's current start script warns about `output: standalone`; actual tested pages and assets rendered. API startup reports Telegram polling conflict with another instance; this is an observed runtime conflict outside the calendar pass and was not repaired. Further writes/builds were not used to chase the user's other in-progress cases.

## Calendar remediation after approval — 2026-11-04

The user approved fixes for the calendar findings and explicitly reserved Auth/GuestOS/storage for another agent. Changes preserve the concurrent worktree; no DB writes, package/config changes or provider actions were added.

### Delivered changes

- `rooms/page.tsx`: remove the duplicate operational banner from the normal workspace while retaining an accessible H1 and the housekeeping header.
- `staff-rooms-client.tsx`: default to calendar when neither URL nor stored preference chooses another view. Derive the view from the persisted Zustand value instead of capturing an unhydrated initial value; wait for hydration before the calendar writes its URL. Explicit grid selection uses `view=grid`. Browser confirmed both a previous grid preference on the plain rooms URL and grid persistence across reload.
- `tape-chart-view.tsx`: bounded flex workspace using its actual top and viewport height, two non-wrapping horizontally scrollable toolbar rows, remaining-space grid and 36px rooms. Remove guessed max-height offsets. Keep mobile bottom-nav space only below the shell's md breakpoint.
- Detail sheet stacks above mobile navigation; body scrolls while footer remains reachable. Escape closes desktop/mobile detail, returns focus to the booking, and Tab/Shift+Tab stay inside the mobile dialog. Both edit entry points now honor `isReadOnly`.
- Stay financial data no longer reads undeclared paid/balance fields or derives debt from total. Missing authoritative payment data shows an unavailable state. Reservation amounts use finite values from confirmation pricing without a total-minus-paid fallback. New `booking-detail-finance.ts` parser preserves server zero/credit values and rejects missing/non-finite/non-scalar evidence.
- Three mutation error callbacks now use the resource's Error contract, resolving calendar type errors caused by the concurrent resource contract update.

### Verification

The four scoped regression files (the previous three plus `utils/booking-detail-finance.test.mjs`) passed **30/30 unique tests**, zero failed/skipped, exit 0 after the final behavioral changes. `node scripts/verify-ui-rules.cjs` eventually passed, exit 0; its earlier 11 print-font findings were resolved by concurrent work, not by this calendar patch. Scoped `git diff --check` passed.

During development a normal build was blocked by concurrent Auth/GuestOS/storage errors. Calendar mutation type errors were corrected; the later typecheck had only one Auth `inputKey` error. Auth was left untouched per the user's instruction. Browser verification used an explicitly separate `next build --experimental-build-mode compile` artifact, build ID `HXRjgmfbjL312jhmbRRcT`, served by `pnpm -C frontends/front-end-vietsage start`; this compile success is not a typecheck PASS. A scoped ESLint invocation was stopped without output after prolonged contention and is not claimed passed.

Final browser matrix, measured from the top with calendar scrollTop 0:

| Viewport | Visible calendar | Complete room rows |
|---|---:|---:|
| 1366×768 | 585px / 76.2% | 13 |
| 1440×900 | 717px / 79.7% | 17 |
| 320×740 | 477px / 64.5% | 10 |
| 390×844 | 581px / 68.8% | 13 |
| 768×1024 | 841px / 82.1% | 20 |
| 1024×768 | 585px / 76.2% | 13 |
| 844×390 landscape | 207px / 53.1% | 3 |
| 1920×1080 | 897px / 83.1% | 22 |

Desktop reaches the requested height/row acceptance. Narrow/landscape views reserve shell/navigation and toolbar space; they are usable but are not claimed to provide 75% calendar height. The calendar remains within viewport bounds and page width stays within the viewport at each tested size.

Browser verified: desktop and mobile Escape/focus return; mobile focus cycle; both mobile footer action centers hit their own buttons instead of navigation; stable pointer and Enter both opened room 1003 correctly. The earlier pointer anomaly was not reproduced. At scrollLeft 310 / scrollTop 900, room column remained x113 and date header remained aligned with calendar top y168. Search, 7/14-day span and secondary operations menu worked. Occupied-room conflict still named QA04 Existing D and opened coordination; canceled before saving. Stay payment/debt display unknown, reservation QA04 ACTIVE displays server total 200,000 / paid 0 / balance 200,000. No browser console warnings/errors were captured in these exercised actions.

Evidence: [measurements](evidence/2026-11-04-full-flow/calendar-fixed/measurements.json), [desktop](evidence/2026-11-04-full-flow/calendar-fixed/final-desktop.png), [mobile detail](evidence/2026-11-04-full-flow/calendar-fixed/mobile-detail-final.png), [sticky scroll](evidence/2026-11-04-full-flow/calendar-fixed/sticky-scroll.png), [conflict](evidence/2026-11-04-full-flow/calendar-fixed/active-conflict.png).

Remaining scope limits: no read-only-role browser session, no payment/checkout commit, no all-branch drag/resize/transaction/race certification. Stay invoice paid/debt data still needs an authoritative client read API if it must be shown inline; no such API was invented. Runtime retains the existing standalone start warning and Telegram poll conflict. Server logs also contained 500s for message summary/marketplace revenue during concurrent work, outside this calendar verification; no clean whole-system runtime verdict is claimed.

### Final build and runtime — supersedes the intermediate blockers above

- After the other agent corrected Auth, **`pnpm build:front` passed, exit 0**, including TypeScript and generation of 77 pages. Final normal build ID: `zp8fuWp2_dFGSBbgMCPDr`. No Auth/GuestOS/storage source was edited in this calendar task.
- Started the generated standalone server using `portless vietsage --app-port 3000 node frontends/front-end-vietsage/.next/standalone/server.js`, after copying generated static/public assets into the standalone artifact. This is a non-watching start and removes the configuration warning from using `next start` with `output: standalone`. Package scripts were not changed.
- Reloaded the real browser against this normal build and measured 1440×900 again: calendar y167–884, 717px, 79.7%, 17 complete room rows. Current page and assets rendered; browser warnings/errors were empty in the final check. Final desktop screenshot was refreshed from this normal build.
- An attempt to disable polling via production NODE_ENV correctly failed closed on the existing production auth configuration. It was not bypassed. The local API was restarted from compiled `dist` with its original development environment and optional Telegram credential omitted only from that process; `.env` and credentials on disk were not modified. Startup explicitly reports polling disabled instead of competing with the other bot instance. API listens on 8080; frontend on 3000. The duplicate Telegram polling and standalone start warning are resolved for this test runtime, not claimed repaired globally.
- Final outcome: **calendar acceptance verified within the tested scope**. Preserve the remaining transaction/role/API coverage limits above and the unrelated concurrent endpoint errors as separate issues; this is not a whole-system production-readiness verdict.
