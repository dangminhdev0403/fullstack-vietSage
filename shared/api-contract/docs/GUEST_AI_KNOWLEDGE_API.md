# Guest AI Knowledge & Action API Catalog (LocalMate AI)

Tài liệu đặc tả danh mục API chuyên biệt dành riêng cho hệ thống **LocalMate AI Agent (n8n, LangChain, Chatbot Concierge, LLM Tool Calling)** sử dụng làm **Kho Tri Thức Bản Địa (Knowledge Base)** và **Công Cụ Tác Vụ Đặt Hướng Dẫn Viên (Action Calling)** khi giao tiếp với du khách lưu trú (Guest).

Tài liệu này được tách riêng khỏi bộ API quản trị chung (`API_CATALOG.md`) nhằm đảm bảo **tính bảo mật (Least Privilege)**, **tối ưu context window của LLM**, và **phân định ranh giới kiến trúc rõ ràng**.

---

## 1. Ranh Giới Kiến Trúc & Nguyên Tắc Phân Định (Architectural Boundaries)

### 1.1. Phạm vi tập trung duy nhất: Trợ lý bản địa LocalMate
- Khung chat floating message và hệ thống AI Agent được thiết kế **tập trung chuyên biệt 100% cho phân hệ LocalMate**:
  - Tư vấn cẩm nang du lịch bản địa, điểm tham quan, nét đẹp văn hóa, lễ hội.
  - Gợi ý ẩm thực truyền thống và các điểm check-in, ngắm cảnh đặc sắc.
  - Tra cứu lịch trình tour khám phá trong ngày hoặc ngắn ngày trong tỉnh/khu vực.
  - Tìm kiếm, đối sánh và kết nối với các Hướng dẫn viên bản địa (LocalMate) đã được kiểm duyệt.
  - Hỗ trợ tạo đơn đặt Hướng dẫn viên LocalMate đồng hành (`LOCALMATE_BOOKING`).

### 1.2. Tách biệt hoàn toàn với Nghiệp vụ Buồng phòng / Dịch vụ Khách sạn
- Khung chat LocalMate AI **hoàn toàn KHÔNG quản lý, không can thiệp và không lan sang các dịch vụ khách sạn khác (In-Stay Hotel Services)**:
  - **Không** tra cứu danh mục dịch vụ phòng (ẩm thực tại phòng, spa, giặt là, mượn đồ dùng).
  - **Không** tạo hay theo dõi yêu cầu buồng phòng (Housekeeping, dọn phòng, thêm nước suối, xin khăn tắm, mật khẩu Wi-Fi, giờ check-out).
- **Lý do phân định**:
  - Dịch vụ khách sạn yêu cầu SLA nghiêm ngặt, điều phối trực tiếp tới nhân viên ca trực lễ tân/buồng phòng và quản lý tồn kho/phí phòng nội bộ.
  - Du khách thực hiện các nhu cầu này trực tiếp qua giao diện phân hệ GuestOS chuyên biệt (Tab **Dịch vụ phòng** `/g/services` và Tab **Yêu cầu của tôi** `/g/requests`).
  - Nếu khách hỏi về các dịch vụ này trong khung chat, LocalMate AI sẽ lịch sự hướng dẫn khách mở tab Dịch vụ phòng trên màn hình hoặc liên hệ trực tiếp quầy lễ tân.

### 1.3. Cơ chế xác thực (Authentication Boundaries)
1. **Machine-to-Machine (M2M) API Key**:
   - Header bắt buộc: `X-VietSage-Knowledge-Key: <LOCALMATE_KNOWLEDGE_API_KEY>`
   - Dành riêng cho n8n AI Agent và các tác vụ server-to-server tra cứu kho tri thức LocalMate.
   - Thích hợp cấu hình cố định trong n8n Header Auth Credentials hoặc LangChain Tool headers.

2. **Guest Chat Proxy (BFF Gateway)**:
   - Endpoint: `POST /api/guest/chat`
   - Header: `Authorization: Bearer <GUEST_SESSION_TOKEN>`
   - Trình duyệt **tuyệt đối không** gọi trực tiếp n8n và không nắm giữ API Key kho tri thức. Mọi yêu cầu chat đi qua Next.js BFF để xác thực phiên lưu trú, kiểm tra tính năng `guest.ai_floating_chat`, gắn mốc `hotelId` và giới hạn bán kính bản địa trước khi chuyển tiếp tới webhook n8n với secret `X-VietSage-Chat-Key`. Timeout tối đa 45 giây (`CHAT_UPSTREAM_TIMEOUT`).

---

## 2. Danh Mục API Tri Thức Bản Địa & Du Lịch (LocalMate Knowledge)

> **Cơ chế xác thực**: Header `X-VietSage-Knowledge-Key: <API_KEY>`

### 2.1. Truy vấn Kho Tri Thức LocalMate (Structured Knowledge)

Cung cấp dữ liệu tri thức có cấu trúc (gồm cả tour gợi ý và hồ sơ hướng dẫn viên bản địa) theo địa phương và câu hỏi của khách. Khi có `hotelId`, tỉnh của khách sạn là ranh giới bắt buộc: câu hỏi về tỉnh khác chỉ nhận gợi ý trong tỉnh của khách sạn; backend không trả tour hoặc hướng dẫn viên ngoài tỉnh.

- **Endpoint (GET)**: `/localmate/knowledge`
  - **Query Params**:
    - `query` *(string, optional)*: Câu hỏi của du khách (vd: `"gợi ý tour ruộng bậc thang"`). Backend tự suy ra điểm đến theo taxonomy canonical và chỉ giữ từ khóa trải nghiệm cần thiết cho tìm kiếm.
    - `destination` *(string, optional)*: Điểm đến mong muốn (vd: `"Mù Cang Chải"`, `"Yên Bái"`).
    - `hotelId` *(string, optional)*: Mốc khách sạn do BFF lấy từ phiên GuestOS đã xác thực; browser không được tự chọn giá trị này.
    - `radiusKm` *(number, optional, default: 50, range: 1–300)*: Bán kính quanh khách sạn; áp dụng khi khách không nêu điểm đến nội tỉnh rõ ràng.
    - `limit` *(number, optional, default: 5)*: Số lượng kết quả tối đa mỗi loại (1–10).

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
        "summary": "Trải nghiệm chụp ảnh mâm xôi, đi đèo Khau Phạ và thưởng thức nếp Tú Lệ.",
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
        "bio": "Sinh ra và lớn lên tại La Pán Tẩn, am hiểu từng góc ruộng bậc thang đẹp nhất.",
        "candidateKey": "cand_LM-YB-001_service_abc"
      }
    ],
    "metadata": {
      "locationScope": {
        "hotelName": "VietSage Ecolodge Resort",
        "province": "Yên Bái",
        "radiusKm": 50,
        "mode": "RADIUS"
      }
    }
  }
  ```

---

### 2.2. Tìm kiếm Lịch trình Tour (Tour Knowledge)

Tra cứu sâu các tour du lịch bản địa theo bộ lọc chi tiết để AI tư vấn lịch trình cụ thể cho du khách.

- **Endpoint**: `GET /localmate/tours`
- **Query Params**:
  - `destination` *(string, optional)*: Tên tỉnh/thành phố hoặc khu vực.
  - `category` *(string, optional)*: Thể loại (`CULTURE`, `TREKKING`, `PHOTOGRAPHY`, `FOOD`, `RELAX`).
  - `durationDays` *(number, optional)*: Số ngày mong muốn.
  - `maxPriceVnd` *(number, optional)*: Ngân sách tối đa.
- **Response `data`**: Danh sách tour chi tiết kèm điểm nổi bật, lịch trình và giá ước tính.

---

### 2.3. Đối Soát Hướng Dẫn Viên Phù Hợp (LocalMate AI Matching)

Sử dụng engine đối soát để chọn ra Top hướng dẫn viên bản địa phù hợp nhất với sở thích và ngôn ngữ của khách.

- **Endpoint**: `POST /localmate/ai/match`
- **Headers**: `X-VietSage-Knowledge-Key: <API_KEY>`
- **Body JSON**:
  ```json
  {
    "destination": "Mù Cang Chải",
    "language": "English",
    "preferences": ["trekking", "chụp ảnh ruộng bậc thang"],
    "limit": 3
  }
  ```
- **Response `data`**: Danh sách hướng dẫn viên đạt điểm đối soát cao nhất kèm lý do phù hợp (`matchReasons`).

---

### 2.4. Tra cứu Hồ sơ Hướng dẫn viên (Guide Profile)

Lấy thông tin chi tiết đầy đủ của một hướng dẫn viên khi du khách muốn tìm hiểu kỹ lưỡng.

- **Endpoint**: `GET /localmate/guides/:guideCode`
- **Params**:
  - `guideCode` *(string)*: Mã định danh của HDV (vd: `LM-YB-001`).

---

### 2.5. Xác Thực Ứng Viên Đặt Lịch (Resolve Booking Candidate)

Xác thực tính hợp lệ của LocalMate và gói dịch vụ khả dụng từ máy chủ trước khi mở popup đặt dịch vụ cho khách.

- **Endpoint**: `GET /localmate/booking-candidate/:candidateKey?hotelId=:hotelId`
- **Headers**: `X-VietSage-Knowledge-Key: <API_KEY>`
- **Response `data`**:
  ```json
  {
    "candidateKey": "cand_LM-YB-001_service_abc",
    "guide": {
      "fullName": "Giàng A Páo",
      "avatarUrl": "https://...",
      "languages": ["Vietnamese", "H'Mông"],
      "specialties": ["Văn hóa người H'Mông"],
      "rating": 4.9,
      "totalReviews": 38
    },
    "service": {
      "id": "srv-guide-daily",
      "name": "Hướng dẫn viên bản địa theo ngày",
      "price": 800000,
      "currency": "VND"
    },
    "hotel": {
      "id": "hotel-123",
      "name": "VietSage Ecolodge Resort",
      "province": "Yên Bái"
    },
    "telegramReady": true
  }
  ```

---

## 3. Quy Trình Tác Vụ Đặt LocalMate (LocalMate Action Calling Flow)

Khung chat LocalMate AI chỉ có **duy nhất một hành vi tác vụ (Action Calling)** là đặt Hướng dẫn viên bản địa:

```
[Du khách chat]
       │
       ▼
[LocalMate AI Agent (n8n)]
  - Nhận diện nhu cầu đặt HDV
  - Trả về JSON: { reply: "...", action: { type: "LOCALMATE_BOOKING", candidateKey: "..." } }
       │
       ▼
[Next.js BFF (/api/guest/chat)]
  - Gọi GET /localmate/booking-candidate/:candidateKey?hotelId=:hotelId (Server-to-Server M2M)
  - Xác thực gói dịch vụ, giá tiền, tính sẵn sàng của Telegram bridge
  - Đính kèm resolved action vào response
       │
       ▼
[Guest Floating Chat UI]
  - Hiển thị LocalMateBookingCard trong dòng tin nhắn
  - Du khách bấm "Đặt dịch vụ ngay"
  - Mở LocalMateOrderRequestDialog: chọn ngày giờ, số lượng khách, ghi chú
  - Gửi POST /guest/marketplace/orders với Session Token của khách
       │
       ▼
[Đơn Hàng & Telegram Bridge]
  - Đơn tạo ở trạng thái PENDING
  - Bot Telegram thông báo tới HDV với nút [Nhận đơn] / [Từ chối]
  - Khi HDV nhận đơn -> Kích hoạt phòng chat 2 chiều Web ↔ Telegram
```

---

## 4. Hướng Dẫn Tích Hợp n8n AI Agent / LangChain

Khi cấu hình AI Agent chuyên biệt cho LocalMate (vd: n8n `AI Agent` node hoặc LLM Tool Calling):

### 4.1. System Prompt Định Hướng
- **Vai trò**: Em là **LocalMate AI** — Trợ lý du lịch bản địa thân thiện, am hiểu văn hóa và phong cảnh địa phương.
- **Phạm vi phục vụ**: Chỉ tư vấn về cẩm nang du lịch, văn hóa, ẩm thực đặc sản, lịch trình tour và kết nối hướng dẫn viên bản địa LocalMate.
- **Ranh giới dịch vụ phòng**: Khi khách yêu cầu dọn phòng, thêm nước suối, mượn đồ dùng, hỏi mật khẩu Wi-Fi hoặc giờ trả phòng, AI sẽ từ chối khéo léo và hướng dẫn khách mở tab **Dịch vụ phòng** trên thanh điều hướng hoặc liên hệ trực tiếp quầy lễ tân.

### 4.2. Khai Báo Công Cụ (Tools)
1. `get_localmate_knowledge`:
   - URL: `http://auth-service:8080/localmate/knowledge`
   - Method: `POST` (hoặc `GET`)
   - Header: `X-VietSage-Knowledge-Key: <LOCALMATE_KNOWLEDGE_API_KEY>`
   - Params: `query`, `hotelId`, `radiusKm`
2. `match_localmate_guide`:
   - URL: `http://auth-service:8080/localmate/ai/match`
   - Method: `POST`
   - Header: `X-VietSage-Knowledge-Key: <LOCALMATE_KNOWLEDGE_API_KEY>`
   - Params: `destination`, `language`, `preferences`
3. `list_localmate_tours`:
   - URL: `http://auth-service:8080/localmate/tours`
   - Method: `GET`
   - Header: `X-VietSage-Knowledge-Key: <LOCALMATE_KNOWLEDGE_API_KEY>`
   - Params: `destination`, `category`, `durationDays`

*(Tuyệt đối không cấp các tool phòng/khách sạn như `get_hotel_services` hay `create_room_request` cho LocalMate AI).*
