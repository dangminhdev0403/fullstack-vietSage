# Sổ Tay Vấn Đề & Lộ Trình Cải Thiện Channel Manager (VietSage PMS & Channex)

> **Mã tài liệu**: `CM-SYNC-PROB-001`  
> **Ngày ghi nhận**: 30/09/2026  
> **Trạng thái**: Đã áp dụng giải pháp Pha 1 (Graceful Fallback) — Đang mở theo dõi Pha 2  

---

## 1. Bối Cảnh & Vấn Đề Gặp Phải (Problem Statement)

### Triệu chứng (Symptoms)
Khi Super Admin thực hiện thao tác **"Tự Động Khởi Tạo Khách Sạn Lên Channex"** cho một khách sạn mới (ví dụ `Khách sạn minh 123`), hệ thống báo lỗi:
> **Lỗi khởi tạo Channex**: `Các hạng phòng chưa có giá trong DB: STANDARD`

Toàn bộ luồng khởi tạo bị gián đoạn, khách sạn không thể liên kết với Channex dù thông tin cơ sở và phòng ốc đã tồn tại đầy đủ trong cơ sở dữ liệu VietSage PMS.

---

## 2. Phân Tích Nguyên Nhân Kỹ Thuật (Root Cause)

1. **Thực trạng dữ liệu PMS**:
   - Khách sạn có các phòng thuộc hạng phòng `STANDARD`.
   - Trong bảng `Room` của PMS, trường `price` của các phòng này đang là `null` hoặc bằng `0` do quản lý khách sạn chưa kịp cập nhật bảng giá cố định.
2. **Kiểm tra cứng nhắc ở Backend (`ChannexSyncService`)**:
   - Backend trước đây áp dụng đoạn mã kiểm tra:
     ```typescript
     if (roomTypesWithoutPrice.length > 0) {
       throw new BadRequestException(`Các hạng phòng chưa có giá trong DB: ${roomTypesWithoutPrice.join(", ")}`);
     }
     ```
   - Lập trình viên trước đó cho rằng khi tạo Rate Plan trên Channex (`POST /api/v1/rate_plans`), trường `options[0].rate` phải có giá trị thực tế lớn hơn 0.
3. **Đặc tả thực tế của Channex API (`POST /api/v1/rate_plans`)**:
   - Channex API quy định: Rate Plan chỉ cần cấu trúc tối thiểu `options: [{ occupancy: 2, is_primary: true, rate: 0 }]`. Channex **hoàn toàn cho phép `rate: 0` hoặc giá sàn ban đầu**.
   - Trong kiến trúc Channel Manager chuẩn, giá bán thực tế không phụ thuộc vào giá ban đầu của Rate Plan mà được điều khiển động qua **Bảng Giá & Quỹ Phòng (ARI Grid - `POST /restrictions`)** theo từng ngày.
4. **Không đồng nhất Tiền tệ (Currency Mismatch)**:
   - Rate Plan trước đây bị gán cứng `currency: "VND"`. Khi người dùng tạo Property với đơn vị tiền tệ khác (như `GBP` để test Booking.com 5868189), Channex sẽ từ chối do xung đột tiền tệ giữa Property và Rate Plan.

---

## 3. Giải Pháp Đã Triển Khai Ngay (Implemented Solution - Phase 1)

Nhằm đảm bảo trải nghiệm người dùng **1-Click Auto-Provisioning** mượt mà không bao giờ bị nghẽn:

1. **Gỡ bỏ bộ lọc chặn cứng (Remove Strict Blocker)**:
   - Loại bỏ ngoại lệ `BadRequestException` khi phòng chưa có giá trong DB.
2. **Tự động áp dụng Giá Sàn An Toàn Dự Phòng (Safe Fallback Base Rate)**:
   - Nếu hạng phòng đã có giá $\rightarrow$ Giữ nguyên giá thực tế của PMS.
   - Nếu hạng phòng chưa có giá $\rightarrow$ Hệ thống tự động gán giá sàn an toàn:
     - `VND`: `500.000 ₫`
     - `GBP`: `50 £` (Dành cho test Booking.com 5868189)
     - `USD` / `EUR`: `50 $` / `50 €`
3. **Đồng bộ Tiền Tệ Toàn Diện (Dynamic Currency Propagation)**:
   - Rate Plan tự động nhận `currency` từ lựa chọn của Super Admin (`options.currency || "VND"`).
4. **Cảnh Báo Minh Bạch Trên Giao Diện (UI Feedback)**:
   - Nếu có hạng phòng áp dụng giá sàn dự phòng, popup thông báo thành công sẽ ghi chú rõ danh sách hạng phòng cần Super Admin vào Tab **Bảng Giá & Quỹ Phòng (ARI Grid)** để cấu hình lại trước khi mở bán.

---

## 4. Lộ Trình Cải Thiện Trong Tương Lai (Roadmap - Phase 2)

Sau khi luồng thử nghiệm vận hành ổn định, đội ngũ kỹ thuật sẽ tiếp tục nâng cấp các tính năng sau:

| Mã Task | Hạng Mục Cải Thiện | Giải Pháp Kỹ Thuật Đề Xuất | Mức Độ Ưu Tiên |
| :--- | :--- | :--- | :--- |
| **CM-IMPR-01** | **Modal Cấu Hình Nhanh Giá Khởi Điểm** | Nếu phát hiện hạng phòng thiếu giá trước khi gọi API, Frontend tự động mở một popover nhỏ cho phép Super Admin gõ nhanh giá khởi điểm thay vì dùng giá sàn hệ thống. | Trung bình |
| **CM-IMPR-02** | **Tự Động Đóng Bán (Stop Sell Lock)** | Khi khởi tạo Rate Plan với giá sàn dự phòng, tự động ghi bản ghi `ChannelDailyRestriction` với cờ `stopSell: true` cho 365 ngày tới. Chỉ khi người dùng lưu giá mới trên ARI Grid thì cờ Stop Sell mới được gỡ bỏ. | Cao (Bảo vệ doanh thu) |
| **CM-IMPR-03** | **Huy Hiệu Nhận Diện Giá Sàn Trên ARI Grid** | Thêm visual cue (viền cam / biểu tượng cảnh báo) tại các ô ngày trên ARI Grid nếu giá đó đang là giá sàn tự sinh chứ chưa phải giá do nhân viên khách sạn thiết lập. | Thấp |
| **CM-IMPR-04** | **Cơ Chế Đồng Bộ Nhiều Rate Plan (Multi-Rate Plan Mapping)** | Hỗ trợ cấu hình gói giá linh hoạt (Không hoàn tiền - Non-refundable, Đã bao gồm bữa sáng - Breakfast included) song song với Standard Rate. | Dài hạn |

---

## 5. Sự Cố 2: Request Timed Out (Mã `CM-SYNC-PROB-002`)

### Triệu chứng
Khi khách sạn có nhiều hạng phòng (ví dụ `Khách sạn minh 123` có 13 hạng phòng), thao tác khởi tạo Channex bị báo lỗi:
> **Lỗi khởi tạo Channex**: `Request timed out`

### Nguyên nhân
- Để đồng bộ một khách sạn có 13 hạng phòng, backend phải thực hiện tới **30 cuộc gọi HTTP ra Internet** tới server Channex Staging:
  - 1 POST tạo Property
  - 13 POST tạo Room Types
  - 13 POST tạo Rate Plans
  - 2 GET đọc kiểm chéo (readback)
  - 1 POST đăng ký Webhook
  - Tổng thời gian mạng quốc tế kéo dài khoảng $20 - 30$ giây.
- Trong khi đó, Next.js BFF proxy (`httpServer.request`) đặt timeout mặc định cứng là **`DEFAULT_TIMEOUT_MS = 10_000` (10 giây)**.
- Khi vượt quá 10 giây, Next.js tự động hủy kết nối và ném lỗi `Request timed out` (Status 408) lên trình duyệt, mặc dù ở dưới backend NestJS vẫn tiếp tục thực thi và đã tạo thành công toàn bộ 27 mappings vào cơ sở dữ liệu!

### Giải pháp khắc phục
1. Tăng timeout cho các proxy requests của Channel Manager (`_backend.ts`) lên **60 giây** (`timeoutMs: 60_000`) để thích ứng với độ trễ mạng quốc tế của Channex API.
2. Do `syncContent` tuân thủ nguyên tắc **Idempotent**, toàn bộ dữ liệu đã được lưu trữ an toàn trong DB và trên Channex Staging. Người dùng chỉ cần tải lại trang sẽ thấy trạng thái đã chuyển sang **`🟢 Đã kết nối Channex`**.

---

## 6. Sự Cố 3: 403 Forbidden "Không có quyền truy cập" tại Tab ARI Grid (Mã `CM-SYNC-PROB-003`)

### Triệu chứng
Khi Super Admin chuyển sang Tab **"📊 Bảng Giá & Quỹ Phòng (ARI Grid)"**, giao diện hiển thị khung lỗi:
> **Không thể tải dữ liệu phòng & giá**: `Không có quyền truy cập.`

### Nguyên nhân
- Thành phần `InventoryGrid` trước đây gọi hook `useInventoryGrid` mà không truyền `roleScope`. Mặc định hook gọi vào route `/api/owner/hotels/[hotelId]/channel-manager/grid`.
- Tuy nhiên, middleware thẩm định quyền của khu vực Owner (`getOwnerAuthTokens` trong `api/owner/_utils.ts`) chỉ cho phép tài khoản có vai trò `tenant_owner`. Khi Super Admin (`SUPER_ADMIN` / `admin`) truy cập, hệ thống lập tức chặn và trả về `403 FORBIDDEN`.
- Đồng thời, nhánh API dành cho quản trị viên nền tảng (`/api/admin/hotels/[hotelId]/channel-manager/`) chưa có các route `grid`, `restrictions`, `availability`, và `bulk-update`.

### Giải pháp khắc phục
1. **Bổ sung 4 Route API Admin**:
   - `src/app/api/admin/hotels/[hotelId]/channel-manager/grid/route.ts`
   - `src/app/api/admin/hotels/[hotelId]/channel-manager/restrictions/route.ts`
   - `src/app/api/admin/hotels/[hotelId]/channel-manager/availability/route.ts`
   - `src/app/api/admin/hotels/[hotelId]/channel-manager/bulk-update/route.ts`
2. **Hỗ trợ `roleScope` xuyên suốt**:
   - Cập nhật `channel-manager.repository.ts`, `channel-manager.resource.ts`, `use-channel-manager.ts` và `inventory-grid.tsx` để truyền tham số `roleScope: "admin"` khi Super Admin thao tác.
   - Tại `AdminChannelManagerClient`, truyền tường minh `roleScope="admin"` vào `<InventoryGrid roleScope="admin" />`.

---

## 7. Sự Cố 4: Ép Cứng Validate 30 Ngày & Văng Lỗi Khi Thiếu Giá (Mã `CM-SYNC-PROB-004`)

### Triệu chứng (Symptoms)
Khi Super Admin bấm nút **"Đồng bộ giá & phòng ngay (30 ngày)"** tại Card 2 của Tab Channex Pro Hub, hệ thống báo lỗi:
> **Lỗi đồng bộ giá & phòng**: `Hạng phòng STANDARD chưa có giá trong DB cho ngày 2026-10-28`

Tiến trình đẩy ARI bị chặn đứng hoàn toàn, không thể đồng bộ bất kỳ ngày nào sang Channex.

### Nguyên nhân (Root Cause)
1. **Ép cứng 30 ngày tương lai**:
   - Backend `ChannexAriSyncService.pushAri` trước đây nếu không nhận `endDate` thì tự động cộng thêm 30 ngày (`effectiveEnd = effectiveStart + 30 days`).
   - Khách sạn thường chỉ mới cập nhật giá cho một khoảng thời gian ngắn phía trước (ví dụ 7 ngày, 14 ngày trên ARI Grid) hoặc chưa kịp điền đủ tất cả các ngày trong 1 tháng.
2. **Kiểm tra cứng nhắc ném BadRequestException**:
   - Trong vòng lặp từng ngày của từng hạng phòng, code kiểm tra:
     ```typescript
     if (d.rate === null) {
       throw new BadRequestException(`Hạng phòng ${rt.roomType} chưa có giá trong DB cho ngày ${d.date}`);
     }
     ```
   - Khi phòng trong PMS chưa có giá cơ sở (`price = null` trong bảng `Room`), và ngày đó chưa có bản ghi giá tùy biến trong `ChannelDailyRestriction`, `d.rate` bằng `null`, dẫn đến ném lỗi làm crash toàn bộ tiến trình.
3. **Frontend thiếu tùy chọn khoảng ngày**:
   - Giao diện Card 2 trước đây chỉ có 1 ô chọn `ariStartDate` và nhãn nút ghi cứng `(30 ngày)`, không cho phép người dùng linh hoạt chọn ngày kết thúc hoặc tự động dừng ở ngày có dữ liệu.

### Giải pháp đã triển khai (Implemented Solution)
1. **Xác định ngày kết thúc linh hoạt (Dynamic Date Range Resolution)**:
   - Nếu người dùng chỉ định `endDate` trên giao diện: hệ thống tôn trọng khoảng ngày người dùng chọn.
   - Nếu người dùng không chỉ định: hệ thống **tự động truy vấn ngày cập nhật mới nhất (`maxConfiguredDate`)** trong cơ sở dữ liệu (`ChannelDailyRestriction` và `ChannelDailyAvailability`). Hệ thống chỉ đẩy chính xác đến ngày có dữ liệu thay vì ép cứng 30 ngày.
   - Nếu chưa có bất kỳ dữ liệu cập nhật nào trong tương lai: hệ thống chỉ đẩy đúng ngày bắt đầu (`effectiveStart`).
2. **Cơ chế Bù Giá Cơ Sở An Toàn (Safe Base Rate Fallback)**:
   - Nếu ngày nào đó chưa có giá tùy biến (`d.rate === null` hoặc $\le 0$):
     - Hệ thống tự động tìm giá từ phòng bất kỳ có giá trong khách sạn (`room.price > 0`).
     - Nếu khách sạn hoàn toàn chưa thiết lập giá cho bất kỳ phòng nào, tự động bù giá sàn an toàn (`500.000 ₫` / `50` ngoại tệ).
     - Ghi log cảnh báo `this.logger.warn(...)` thay vì ném `BadRequestException`.
3. **Cập nhật Giao diện Card 2 (Channex Pro Hub UI)**:
   - Bổ sung ô chọn `Đến ngày (tùy chọn)` song song với `Từ ngày`.
   - Có nút "Đặt lại tự động" để người dùng dễ dàng chuyển về chế độ tự động dò ngày cập nhật.
   - Đổi nhãn nút thành: **"Đẩy giá & phòng sang Channex"**.
   - Báo cáo rõ khoảng ngày đã đồng bộ thành công (ví dụ: `Từ ngày 2026-09-30 đến 2026-10-14`).


