# Guest AI Knowledge & Action API Catalog

Tài liệu đặc tả danh mục API chuyên biệt dành riêng cho các hệ thống **AI Agent (n8n, LangChain, Voicebot, Chatbot Concierge, LLM Tool Calling)** sử dụng làm **Kho Tri Thức (Knowledge Base)** và **Công Cụ Tác Vụ (Tool Calling)** khi tương tác, giao tiếp với khách lưu trú (Guest).

Tài liệu này được tách riêng khỏi bộ API quản trị chung (`API_CATALOG.md`) nhằm đảm bảo **tính bảo mật (Least Privilege)**, **tối ưu context window của LLM**, và **phân định ranh giới xác thực**.

---

## 1. Tổng Quan Kiến Trúc & Ranh Giới Xác Thực (Authentication Boundaries)

Các API dành cho AI giao tiếp với khách được chia thành 2 cơ chế xác thực riêng biệt:

1. **Machine-to-Machine (M2M) API Key**: Dành cho các endpoint kho tri thức chung (tri thức bản địa, cẩm nang du lịch, danh sách tour, hồ sơ HDV LocalMate).
   - Header bắt buộc: `X-VietSage-Knowledge-Key: <LOCALMATE_KNOWLEDGE_API_KEY>`
   - Không yêu cầu phiên đăng nhập hay JWT của người dùng.
   - Thích hợp cấu hình cố định trong n8n Credentials hoặc LangChain Tool headers.

2. **Guest Session Token (In-Stay Context)**: Dành cho các endpoint mang tính ngữ cảnh phòng lưu trú (dịch vụ khách sạn, yêu cầu dọn phòng, thông tin phòng ở, đối tác lân cận của khách sạn đang ở).
   - Header bắt buộc: `Authorization: Bearer <GUEST_SESSION_TOKEN>`
   - Token này được sinh ra khi khách quét mã QR tại phòng (`/guest/qr/scan`) và được hệ thống gửi kèm trong phiên chat của khách.

Guest chat BFF waits at most 45 seconds for the authenticated n8n webhook. An upstream timeout returns HTTP `504` with stable code `CHAT_UPSTREAM_TIMEOUT`; other invalid/upstream responses remain `502` errors. Browsers never receive the webhook secret or call n8n directly.

### Chuẩn dữ liệu phản hồi (Response Envelope)

Mọi phản hồi thành công tuân theo format chuẩn của VietSage Core API:

```json
{
  "status": 200,
  "error": null,
  "message": "Thông điệp thành công",
  "data": {}
}
```

---

## 2. Danh Mục API Tri Thức Bản Địa & Du Lịch (LocalMate Knowledge)

> **Cơ chế xác thực**: Header `X-VietSage-Knowledge-Key: <API_KEY>`

### 2.1. Truy vấn Kho Tri Thức LocalMate (Structured Knowledge)

Cung cấp dữ liệu tri thức có cấu trúc (gồm cả tour gợi ý và thông tin hướng dẫn viên bản địa) theo địa phương và câu hỏi của khách. Khi có `hotelId`, tỉnh của khách sạn là ranh giới bắt buộc: câu hỏi về tỉnh khác chỉ nhận gợi ý trong tỉnh của khách sạn; backend không trả tour hoặc hướng dẫn viên ngoài tỉnh dù dữ liệu đó tồn tại.

- **Endpoint (GET)**: `/localmate/knowledge`
  - **Query Params**:
    - `query` *(string, optional)*: Toàn bộ câu hỏi đã giới hạn độ dài của khách (vd: `"gợi ý tour ruộng bậc thang"`). Backend tự suy ra điểm đến theo taxonomy canonical và chỉ giữ từ khóa trải nghiệm cần thiết cho tìm kiếm.
    - `destination` *(string, optional)*: Điểm đến (vd: `"Mù Cang Chải"`, `"Yên Bái"`, `"Hà Giang"`).
    - `hotelId` *(string, optional)*: Mốc khách sạn do BFF lấy từ phiên GuestOS đã xác thực; browser không được tự chọn giá trị này.
    - `radiusKm` *(number, optional, default: 50, range: 1–300)*: Bán kính quanh khách sạn; áp dụng khi khách không nêu điểm đến nội tỉnh rõ ràng.
    - `limit` *(number, optional, default: 5)*: Số lượng kết quả tối đa mỗi loại.

- **Endpoint (POST)**: `/localmate/knowledge`
  - **Body JSON**:
    ```json
    {
      "query": "Tour ẩm thực bản địa 2 ngày 1 đêm",
      "hotelId": "hotel-from-authenticated-guest-session",
      "radiusKm": 50,
      "limit": 3
    }
    ```

- **Response `data`**:
  ```json
  {
    "knowledgeVersion": "2026-09-25",
    "destination": "Mù Cang Chải",
    "tours": [
      {
        "id": "tour-001",
        "title": "Khám phá Mùa Vàng Mù Cang Chải",
        "destination": "Mù Cang Chải",
        "durationDays": 2,
        "summary": "Trải nghiệm chụp ảnh mâm xôi, đi đèo Khau Phạ và thưởng thức nếp tú lệ.",
        "highlights": ["Đồi mâm xôi La Pán Tẩn", "Đèo Khau Phạ", "Bản Lìm Mông"],
        "priceVnd": 1500000,
        "suitableFor": ["chụp ảnh", "văn hóa", "trekking nhẹ"]
      }
    ],
    "guides": [
      {
        "guideCode": "LM-YB-001",
        "fullName": "Giàng A Páo",
        "avatarUrl": "https://...",
        "specialties": ["Văn hóa người H'Mông", "Chụp ảnh phong cảnh"],
        "languages": ["Vietnamese", "H'Mông", "English cơ bản"],
        "dailyRateVnd": 800000,
        "rating": 4.9,
        "totalReviews": 38,
        "bio": "Sinh ra và lớn lên tại La Pán Tẩn, am hiểu từng góc ruộng bậc thang đẹp nhất."
      }
    ]
  }
  ```

#### Phạm vi theo vị trí khách sạn

- Backend tự đọc tọa độ khách sạn từ `hotelId`, tạo bounding box có giới hạn, sau đó tính khoảng cách Haversine chính xác.
- Khi có `hotelId`, tỉnh khách sạn luôn là hard boundary. Điểm đến nội tỉnh trong `destination` hoặc `query` được dùng để thu hẹp kết quả; điểm đến ngoài tỉnh không thay đổi phạm vi và backend fallback về tỉnh khách sạn.
- Nếu câu hỏi không nêu điểm đến, `hotelId` là mốc bắt buộc của luồng GuestOS và backend chỉ truy vấn trong bán kính/địa giới fallback tương ứng.
- Tour và LocalMate trong bán kính được xếp gần nhất trước; mỗi item có `distanceKm` hoặc `null`.
- `metadata.locationScope` mô tả `hotelName`, `area`, `province`, `provinceCode`, `requestedDestination`, `outsideHotelProvince`, `radiusKm` và mode `RADIUS`, `HOTEL_PROVINCE_DESTINATION`, `HOTEL_PROVINCE_FALLBACK` hoặc `ADMINISTRATIVE_FALLBACK`.
- Bản ghi cũ chưa có tọa độ chỉ được fallback trong cùng tỉnh/khu vực; API không tải full list cho n8n tự lọc.
- Response không trả tọa độ điểm phục vụ của LocalMate cho AI/browser.

---

### 2.2. Tìm kiếm Lịch trình Tour (Tour Knowledge)

Tra cứu sâu các tour du lịch bản địa theo bộ lọc chi tiết để AI tư vấn lịch trình cho khách.

- **Endpoint**: `GET /localmate/tours`
- **Query Params**:
  - `destination` *(string, optional)*: Tên tỉnh/thành phố hoặc khu vực.
  - `category` *(string, optional)*: Thể loại (`CULTURE`, `TREKKING`, `PHOTOGRAPHY`, `FOOD`, `RELAX`).
  - `durationDays` *(number, optional)*: Số ngày mong muốn.
  - `maxPriceVnd` *(number, optional)*: Ngân sách tối đa.

- **Response `data`**: Danh sách các tour chi tiết kèm lịch trình từng ngày (itinerary).

---

### 2.3. AI Matching LocalMate (Gợi ý Hướng dẫn viên phù hợp)

Sử dụng engine đối soát để chọn ra Top 3 hướng dẫn viên bản địa phù hợp nhất với nhu cầu cụ thể của khách.

- **Endpoint**: `POST /localmate/ai/match`
- **Headers**: Không bắt buộc token (hoặc dùng `X-VietSage-Knowledge-Key`).
- **Body JSON**:
  ```json
  {
    "destination": "Mù Cang Chải",
    "language": "English",
    "preferences": ["trekking", "chụp ảnh ruộng bậc thang"],
    "limit": 3
  }
  ```
- **Response `data`**:
  ```json
  {
    "matches": [
      {
        "guideCode": "LM-YB-001",
        "fullName": "Giàng A Páo",
        "avatarUrl": "https://...",
        "matchScore": 0.95,
        "matchReasons": ["Nói được tiếng Anh", "Chuyên môn trekking và chụp ảnh", "Bản địa Yên Bái"],
        "dailyRateVnd": 800000,
        "rating": 4.9,
        "phone": "0987654321"
      }
    ]
  }
  ```

---

### 2.4. Tra cứu Hồ sơ Hướng dẫn viên (Guide Profile)

Lấy đầy đủ thông tin chi tiết của một hướng dẫn viên khi khách muốn xem kỹ trước khi đặt.

- **Endpoint**: `GET /localmate/guides/:guideCode`
- **Params**:
  - `guideCode` *(string)*: Mã định danh của HDV (vd: `LM-YB-001`).

---

## 3. Danh Mục API Tri Thức Khách Sạn & Tiện Ích Phòng (In-Stay Hotel Knowledge)

> **Cơ chế xác thực**: Header `Authorization: Bearer <GUEST_SESSION_TOKEN>`

### 3.1. Ngữ Cảnh Phòng của Khách (Guest Session Context)

Cho phép AI biết khách đang ở khách sạn nào, phòng số mấy, lưu trú từ ngày nào đến ngày nào.

- **Endpoint**: `GET /guest/session/me`
- **Response `data`**:
  ```json
  {
    "session": {
      "id": "uuid-session",
      "status": "ACTIVE",
      "room": {
        "id": "uuid-room",
        "roomNumber": "302",
        "roomType": "Deluxe Mountain View"
      },
      "hotel": {
        "id": "uuid-hotel",
        "name": "VietSage Ecolodge Resort",
        "address": "Bản Ít Thái, Mù Cang Chải"
      },
      "stay": {
        "checkInAt": "2026-09-24T14:00:00.000Z",
        "plannedCheckOutAt": "2026-09-27T12:00:00.000Z"
      }
    }
  }
  ```

---

### 3.2. Danh Mục Dịch Vụ Khách Sạn (Hotel Services Catalog)

Cung cấp thông tin về các dịch vụ do chính khách sạn cung cấp (menu đồ ăn tại phòng, giặt là, spa, mượn đồ dùng).

- **Endpoint**: `GET /guest/services`
- **Response `data`**:
  ```json
  {
    "categories": [
      {
        "id": "cat-dining",
        "name": "Ẩm thực tại phòng (In-room Dining)",
        "serviceCount": 12
      },
      {
        "id": "cat-housekeeping",
        "name": "Dịch vụ phòng (Housekeeping)",
        "serviceCount": 6
      }
    ]
  }
  ```

- **Endpoint**: `GET /guest/service-categories/:categoryId/services`
  - Tra cứu chi tiết từng món/dịch vụ trong danh mục (tên món, giá tiền, thời gian mở bán).

---

### 3.3. Đối Tác Lân Cận Khách Sạn (Local Partners)

Cung cấp danh sách các quán ăn, quán cafe, hiệu thuốc, điểm thuê xe máy đã được khách sạn kiểm duyệt và có chính sách ưu đãi cho khách.

- **Endpoint**: `GET /guest/local-partners/categories`: Danh mục đối tác (Cafe, Nhà hàng, Y tế, Phương tiện...).
- **Endpoint**: `GET /guest/local-partners`: Danh sách đối tác kèm khoảng cách tính từ khách sạn (vd: cách 250m).
- **Endpoint**: `GET /guest/local-partners/:partnerId`: Chi tiết đối tác, địa chỉ, menu nổi bật, ưu đãi cho khách của khách sạn.

---

### 3.4. Dịch Vụ Mở Rộng (Marketplace Experiences)

- **Endpoint**: `GET /guest/marketplace/categories`: Danh mục dịch vụ liên kết (Tour trải nghiệm, xe đưa đón sân bay...).
- **Endpoint**: `GET /guest/marketplace/services`: Danh sách dịch vụ kèm giá niêm yết.
- **Endpoint**: `GET /guest/marketplace/services/:serviceId`: Chi tiết điều khoản dịch vụ.

---

## 4. Danh Mục API Tác Vụ Cho AI (Action / Tool Calling APIs)

> **Cơ chế xác thực**: Header `Authorization: Bearer <GUEST_SESSION_TOKEN>`

Khi khách trò chuyện với AI và đưa ra yêu cầu thực tế, AI có thể gọi các tool này để thay khách tạo phiếu yêu cầu:

### 4.1. Tạo Yêu Cầu Phục Vụ Phòng (Create Guest Request)

Khi khách chat: *"Mang thêm cho tôi 2 chai nước suối và 1 bộ khăn tắm lên phòng 302"*
AI parse thành payload và gọi:

- **Endpoint**: `POST /guest/requests`
- **Body JSON**:
  ```json
  {
    "serviceItemId": "optional-uuid-neu-la-dich-vu-cu-the",
    "title": "Yêu cầu thêm nước uống và khăn tắm",
    "description": "Khách cần 2 chai nước suối và 1 bộ khăn tắm sạch",
    "guestNotes": "Giao trước 21h",
    "priority": "NORMAL"
  }
  ```
- **Response**: Trả về phiếu yêu cầu đã tạo thành công với mã `requestId` và trạng thái `CREATED`. Khách sạn nhận thông báo realtime qua chuông lễ tân và Telegram bot.

---

### 4.2. Tra Cứu Trạng Thái Yêu Cầu (Check Guest Request Status)

Khi khách hỏi: *"Yêu cầu nước uống của tôi đã có ai mang lên chưa?"*

- **Endpoint**: `GET /guest/requests`
- **Response**: Danh sách các yêu cầu đang thực hiện kèm trạng thái (`CREATED` -> `ACKNOWLEDGED` -> `IN_PROGRESS` -> `COMPLETED`).

---

## 5. Hướng Dẫn Tích Hợp n8n AI Agent / LangChain

Khi cấu hình AI Agent (vd: n8n `AI Agent` node hoặc Custom GPT):

1. **System Prompt / Tool Setup**:
   - Khai báo tool `get_localmate_knowledge` trỏ tới `GET /localmate/knowledge` với Header `X-VietSage-Knowledge-Key`.
   - Khai báo tool `match_localmate_guide` trỏ tới `POST /localmate/ai/match`.
   - Khai báo tool `get_hotel_services` trỏ tới `GET /guest/services` với Header `Authorization: Bearer {{ $json.sessionToken }}`.
   - Khai báo tool `create_room_request` trỏ tới `POST /guest/requests`.

2. **Ưu điểm khi sử dụng Catalog này**:
   - AI chỉ thấy các công cụ phục vụ khách, **không bao giờ thấy** các API quản lý nhân viên, doanh thu, thanh toán hay hệ thống nội bộ.
   - Dung lượng prompt của tool cực nhỏ (~2 KB so với 389 KB của toàn hệ thống), giúp giảm tối đa chi phí token và tăng tốc độ phản hồi cho khách.
