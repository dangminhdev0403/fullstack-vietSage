import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { normalizeTourDuration } from "../src/modules/localmate/domain/constants/geography.constant";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export async function seedAiKnowledge() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in environment");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log("=== 1. ĐỒNG BỘ TỌA ĐỘ VÀ ĐỊA GIỚI KHÁCH SẠN (HOTELS) ===");
    // HCA HomeStay
    await pool.query(`
      UPDATE "Hotel"
      SET "area" = 'Mù Cang Chải',
          "province" = 'Yên Bái',
          "provinceCode" = 'YEN_BAI',
          "latitude" = 21.854200,
          "longitude" = 104.085200,
          "locationAccuracyMeters" = 10,
          "locationSource" = 'MANUAL',
          "locationVerifiedAt" = CURRENT_TIMESTAMP,
          "timezone" = 'Asia/Ho_Chi_Minh',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "code" = 'HCA_HOMESTAY'
    `);
    console.log("  -> Cập nhật tọa độ Mù Cang Chải cho HCA HomeStay");

    // Khách sạn minh 123
    await pool.query(`
      UPDATE "Hotel"
      SET "area" = 'Hoàng Mai',
          "province" = 'Hà Nội',
          "provinceCode" = 'HA_NOI',
          "locationAccuracyMeters" = 10,
          "locationSource" = 'MANUAL',
          "locationVerifiedAt" = CURRENT_TIMESTAMP,
          "timezone" = 'Asia/Ho_Chi_Minh',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "code" = 'VSH_HOTEL_0005'
    `);
    console.log("  -> Cập nhật khu vực Hà Nội cho Khách sạn minh 123");

    // Test Hotel
    await pool.query(`
      UPDATE "Hotel"
      SET "area" = 'Hoàn Kiếm',
          "province" = 'Hà Nội',
          "provinceCode" = 'HA_NOI',
          "latitude" = 21.028511,
          "longitude" = 105.854167,
          "locationAccuracyMeters" = 10,
          "locationSource" = 'MANUAL',
          "locationVerifiedAt" = CURRENT_TIMESTAMP,
          "timezone" = 'Asia/Ho_Chi_Minh',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "code" = 'VSH_HOTEL_0001'
    `);
    console.log("  -> Cập nhật tọa độ Phố Cổ Hà Nội cho Test Hotel");

    console.log("\n=== 3. CẬP NHẬT TỌA ĐỘ VÀ BỔ SUNG NỘI DUNG CHI TIẾT CHO 22 TOUR HIỆN CÓ ===");
    const existingTourUpdates = [
      {
        tourCode: "HVNT-0001-24",
        lat: 21.6425,
        lng: 104.6042,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "1 Ngày",
        highlights: [
          "Chè Shan Tuyết cổ thụ 300 năm",
          "Cắm trại săn mây Lau Camping",
          "Văn hóa bản địa & Ẩm thực Tây Bắc",
        ],
      },
      {
        tourCode: "HVNT-0002-24",
        lat: 21.7828,
        lng: 104.3015,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Thung lũng ngọc Tú Lệ",
          "Đèo Khau Phạ - Tứ đại đỉnh đèo",
          "Khoáng nóng Trạm Tấu",
          "Cánh đồng Mường Lò Nghĩa Lộ",
        ],
      },
      {
        tourCode: "HVNT-0003-24",
        lat: 21.821,
        lng: 104.265,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Đèo Khau Phạ săn mây dù lượn",
          "Khoáng nóng Trạm Tấu",
          "Văn hóa xòe Thái Nghĩa Lộ",
        ],
      },
      {
        tourCode: "HVNT-0004-24",
        lat: 21.6033,
        lng: 104.5125,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Bản Sà Rèn Nghĩa Lộ",
          "Suối khoáng nóng tự nhiên Trạm Tấu",
          "Ẩm thực mâm cơm Thái truyền thống",
        ],
      },
      {
        tourCode: "HVNT-0005-24",
        lat: 21.5283,
        lng: 104.4947,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Tắm khoáng nóng Trạm Tấu ngắm ruộng bậc thang",
          "Bản Cu Vai trên mây",
          "Văn hóa người H'Mông và Thái",
        ],
      },
      {
        tourCode: "HVNT-0006-24",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "INTERPROVINCIAL",
        duration: "3 Ngày 2 Đêm",
        highlights: [
          "Hồ Thác Bà - Hạ Long trên núi",
          "Đồi chè Shan Tuyết Suối Giàng",
          "Khoáng nóng Trạm Tấu",
        ],
      },
      {
        tourCode: "HVNT-0007-24",
        lat: 21.8542,
        lng: 104.0852,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "INTERPROVINCIAL",
        duration: "3 Ngày 2 Đêm",
        highlights: [
          "Ruộng bậc thang Mù Cang Chải di sản quốc gia",
          "Đèo Khau Phạ hùng vĩ",
          "Khoáng nóng Trạm Tấu & Chè Suối Giàng",
        ],
      },
      {
        tourCode: "HVNT-0008-24",
        lat: 21.7828,
        lng: 104.3015,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "3 Ngày 2 Đêm",
        highlights: [
          "Resort suối khoáng Le Champ Tú Lệ",
          "Đồi Mâm Xôi Mù Cang Chải",
          "Cắm trại Lau Camping Suối Giàng",
          "Du thuyền Hồ Thác Bà",
        ],
      },
      {
        tourCode: "HVNT-0009-24",
        lat: 21.6425,
        lng: 104.6042,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "INTERPROVINCIAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Chè Shan Tuyết di sản Suối Giàng",
          "Lau Camping săn hoàng hôn Tây Bắc",
          "Ẩm thực Mường Lò Nghĩa Lộ",
        ],
      },
      {
        tourCode: "HVNT-0030-23",
        lat: 21.8542,
        lng: 104.0852,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Đồi Mâm Xôi La Pán Tẩn",
          "Thung lũng Tú Lệ nếp thơm",
          "Khoáng nóng Bản Hốc Văn Chấn",
        ],
      },
      {
        tourCode: "HVNT-0031-23",
        lat: 21.8542,
        lng: 104.0852,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "INTERPROVINCIAL",
        duration: "3 Ngày 2 Đêm",
        highlights: [
          "Tuyến vàng Hà Nội - Mù Cang Chải",
          "Đồi Móng Ngựa & Mâm Xôi La Pán Tẩn",
          "Ngâm khoáng nóng Bản Hốc",
        ],
      },
      {
        tourCode: "HVNT-1",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "1 Ngày",
        highlights: [
          "Du thuyền khám phá Hồ Thác Bà với 1.300 hòn đảo",
          "Tham quan Nhà máy Thủy điện Thác Bà lịch sử",
          "Thám hiểm Động Thủy Tiên kỳ ảo",
          "Thưởng thức cá nướng lòng hồ người Dao",
        ],
        content: `LỊCH TRÌNH CHI TIẾT TOUR HỒ THÁC BÀ (1 NGÀY):
- 08h00: Đón quý khách tại bến tàu du lịch Thác Bà (Yên Bình, Yên Bái). Hướng dẫn viên LocalMate giới thiệu tổng quan về hồ Thác Bà - viên ngọc xanh Tây Bắc với diện tích gần 20.000ha và hơn 1.300 hòn đảo nhấp nhô.
- 08h30: Khởi hành du thuyền trên mặt hồ phẳng lặng, hít thở không khí trong lành, ngắm nhìn khung cảnh sơn thủy hữu tình được ví như "Hạ Long trên núi".
- 09h30: Cập bến tham quan Động Thủy Tiên - hang động karst tự nhiên dài hơn 100m gắn liền với huyền tích 9 nàng tiên giáng trần, chiêm ngưỡng nhũ đá lung linh muôn hình vạn trạng.
- 11h30: Thuyền đưa đoàn đến đảo ngọc thưởng thức bữa trưa bản địa dân tộc Dao Quần Trắng với các món đặc sản: cá tầm lòng hồ nướng than hoa, nộm hoa chuối rừng, xôi nếp cẩm, gà đồi đắp đất nướng lá chanh.
- 14h00: Tham quan Nhà máy Thủy điện Thác Bà - công trình thủy điện đầu tiên được xây dựng tại miền Bắc Việt Nam, tìm hiểu lịch sử hào hùng và phòng truyền thống.
- 16h00: Thuyền cập bến Thác Bà. Quý khách tự do mua sắm đặc sản cá sấy, mật ong rừng, chè Yên Bình về làm quà.
- 17h00: Kết thúc chương trình tour. Hẹn gặp lại quý khách!`,
      },
      {
        tourCode: "HVNT-2",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Du thuyền hồ Thác Bà & chèo kayak",
          "Nghỉ đêm homestay làng văn hóa Vũ Linh",
          "Động Thủy Tiên & Đảo Xanh",
          "Đêm lửa trại, múa xòe & rượu cần người Dao",
        ],
        content: `LỊCH TRÌNH CHI TIẾT TOUR HỒ THÁC BÀ - NGHỈ ĐÊM HOMESTAY VŨ LINH (2 NGÀY 1 ĐÊM):
NGÀY 1: KHÁM PHÁ LÒNG HỒ THÁC BÀ - ĐỘNG THỦY TIÊN - LÀNG VŨ LINH
- 08h30: Đón đoàn tại bến cảng Hương Lý, lên thuyền du lịch chuyên dụng khám phá vùng lõi hồ Thác Bà.
- 10h00: Thám hiểm Động Thủy Tiên, leo lên đỉnh núi ngắm toàn cảnh hồ Thác Bà bao la xanh biếc.
- 12h00: Ăn trưa trên đảo với ẩm thực cá mương chiên giòn, tép dầu kho tương, rau dớn xào tỏi.
- 14h30: Thuyền đưa khách về Làng du lịch sinh thái Vũ Linh (xã Vũ Linh), nhận phòng homestay nhà sàn truyền thống của người Dao Quần Trắng.
- 16h00: Trải nghiệm chèo kayak / SUP dọc vịnh hồ ven làng, tắm hồ trong làn nước mát lành, check-in hoàng hôn rực rỡ.
- 19h00: Bữa tối ấm cúng với gia chủ homestay. Tham gia chương trình giao lưu văn nghệ dân gian: nhảy sạp, múa chuông, uống rượu cần bên bếp lửa bập bùng.

NGÀY 2: CHỢ QUÊ VEN HỒ - ĐẢO XANH - THỦY ĐIỆN THÁC BÀ
- 07h00: Dậy sớm hít thở sương sớm mặt hồ, thưởng thức điểm tâm bánh bao hoặc mì trứng gà ta, nhâm nhi tách trà shan tuyết.
- 08h30: Đi thuyền tham quan Đảo Xanh, trải nghiệm câu cá giải trí và tìm hiểu nghề nuôi cá lồng bè trên hồ.
- 11h30: Ăn trưa tại khu du lịch sinh thái Ruby hoặc nhà hàng nổi ven hồ.
- 13h30: Tham quan di tích lịch sử Nhà máy Thủy điện Thác Bà và Đền Mẫu Thác Bà linh thiêng.
- 16h00: Thuyền về bến xuất phát, xe đón quý khách trở về điểm hẹn.`,
      },
      {
        tourCode: "HVNT-2-21",
        lat: 21.6033,
        lng: 104.5125,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "INTERPROVINCIAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Hồ Thác Bà xanh ngắt",
          "Bản Sà Rèn Nghĩa Lộ yên bình",
          "Cây chè tổ Shan Tuyết Suối Giàng",
          "Tắm khoáng nóng phục hồi sức khỏe",
        ],
      },
      {
        tourCode: "HVTB-0001-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "Nửa Ngày",
        highlights: [
          "Nhà máy Thủy điện Thác Bà hào hùng",
          "Du thuyền Đảo Hoa rực rỡ",
          "Check-in thiên nhiên hồ Thác Bà",
        ],
        content: `TOUR YÊN BÁI - HỒ THÁC BÀ - THỦY ĐIỆN - ĐẢO HOA (NỬA NGÀY / 0.5 NGÀY):
- 08h00 hoặc 13h30: Đón quý khách tại bến cảng hồ Thác Bà (thị trấn Thác Bà). Hướng dẫn viên địa phương phát nón lá và áo phao.
- 08h30: Lên thuyền du lịch dạo quanh các vịnh nhỏ, chiêm ngưỡng mặt nước biếc xanh phản chiếu mây trời Tây Bắc.
- 09h15: Cập bến Đảo Hoa - hòn đảo được cải tạo thành công viên hoa dại và tiểu cảnh ven nước tuyệt đẹp. Quý khách tự do tản bộ, chụp ảnh và thưởng trà giữa làn gió mát rượi.
- 10h45: Thuyền đưa khách ghé tham quan quần thể Nhà máy Thủy điện Thác Bà - "đứa con đầu lòng" của ngành thủy điện Việt Nam, chụp ảnh tại đập tràn xả lũ lịch sử.
- 11h45: Trở lại bến xuất phát, thưởng thức nước ép trái cây địa phương. Kết thúc hành trình nửa ngày khám phá trọn vẹn vẻ đẹp Thác Bà.`,
      },
      {
        tourCode: "HVTB-0002-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "1 Ngày",
        highlights: [
          "Đảo Thiên Đường thơ mộng",
          "Đảo Hoa ngát hương",
          "Thủy điện Thác Bà",
          "Ẩm thực cá nướng người Tày",
        ],
        content: `TOUR YÊN BÁI - HỒ THÁC BÀ - THỦY ĐIỆN - ĐẢO THIÊN ĐƯỜNG - ĐẢO HOA (1 NGÀY TRỌN VẸN):
- 08h00: Tập trung tại bến thuyền Thác Bà, HDV LocalMate đón khách lên thuyền bắt đầu hải trình khám phá.
- 08h45: Ghé thăm Đảo Hoa với các thảm hoa cúc họa mi, cánh bướm nở rộ theo mùa. Check-in các cung đường gỗ ven hồ lãng mạn.
- 10h30: Thuyền di chuyển sang Đảo Thiên Đường - hòn đảo xanh mướt với những rặng tre, bãi cỏ thoai thoải và bến cầu gỗ vươn dài ra mặt hồ.
- 12h00: Dùng bữa trưa tại nhà hàng sinh thái trên Đảo Thiên Đường với thực đơn cá ngạnh om chuối đậu, gà đồi hấp lá chanh, xôi ngũ sắc nếp nương.
- 14h00: Quý khách tham gia các trò chơi vận động nhẹ: câu cá thư giãn, đạp vịt hoặc chèo thuyền sub mặt nước yên ả.
- 15h30: Ghé thăm công trình Thủy điện Thác Bà, nghe thuyết minh về giai đoạn xây dựng kỳ tích những năm kháng chiến.
- 17h00: Thuyền về bến. Kết thúc chuyến đi thư thái tinh thần.`,
      },
      {
        tourCode: "HVTB-0003-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "1 Ngày",
        highlights: [
          "Đảo Xanh hoang sơ",
          "Đảo Thiên Đường thư giãn",
          "Khám phá di tích Thủy điện Thác Bà",
          "Ẩm thực Tây Bắc đậm đà",
        ],
        content: `TOUR YÊN BÁI - HỒ THÁC BÀ - THỦY ĐIỆN - ĐẢO XANH - ĐẢO THIÊN ĐƯỜNG (1 NGÀY):
- 08h15: Khởi hành từ bến Hương Lý theo tuyến cáp nước trung tâm hồ Thác Bà.
- 09h30: Cập bến Đảo Xanh - hòn đảo giữ trọn nét nguyên sơ với rừng thông Caribe xanh mướt reo trong gió hồ.
- 11h00: Di chuyển sang cụm Đảo Thiên Đường nghỉ ngơi và thưởng ngoạn phong cảnh.
- 12h15: Thưởng thức bữa trưa cá lăng nướng muối ớt, nộm hoa chuối, măng rừng xào thịt lợn bản.
- 14h00: Hoạt động tự do: câu cá tĩnh tâm, chụp ảnh phong cảnh, tản bộ dưới tán rừng thông.
- 15h45: Thăm Nhà máy Thủy điện Thác Bà, chiêm ngưỡng công trình kiến trúc thời kỳ hữu nghị Việt - Xô.
- 17h00: Trả khách tại bến tàu.`,
      },
      {
        tourCode: "HVTB-0004-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "1 Ngày",
        highlights: [
          "Đền Mẫu Thác Bà linh thiêng",
          "Du ngoạn Đảo Thiên Đường",
          "Nhà máy Thủy điện Thác Bà",
          "Cầu an & vãn cảnh tâm linh",
        ],
        content: `TOUR TÂM LINH & DANH THẮNG: ĐỀN MẪU THÁC BÀ - THỦY ĐIỆN - ĐẢO THIÊN ĐƯỜNG (1 NGÀY):
- 08h00: Đón khách và di chuyển dâng hương tại Đền Mẫu Thác Bà - ngôi đền cổ linh từ thế kỷ 18, tọa lạc bên sườn núi nhìn ra hồ nước bao la, cầu bình an, may mắn và tài lộc.
- 09h30: Xuống thuyền tại bến đền Mẫu, bắt đầu chuyến du ngoạn trên mặt hồ xanh như ngọc bích.
- 10h45: Cập Đảo Thiên Đường ngắm cảnh sinh thái, hít hà không khí trong lành nguyên sơ của miền sơn cước.
- 12h15: Thưởng thức mâm cơm đặc sản bản địa với cá nướng than củi, canh chua cá lăng lá giang, xôi ngũ sắc thơm dẻo.
- 14h30: Tham quan di tích Nhà máy Thủy điện Thác Bà - công trình mở đầu cho nền điện lực cách mạng Việt Nam.
- 16h30: Thuyền về bến. Kết thúc tour tâm linh kết hợp danh thắng trọn vẹn.`,
      },
      {
        tourCode: "HVTB-0005-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Khu nghỉ dưỡng sinh thái An Bình Village",
          "Động Thủy Tiên huyền thoại",
          "Chèo thuyền SUP ngắm hoàng hôn",
          "Giao lưu ẩm thực cá sông lẩu nấm",
        ],
        content: `CHƯƠNG TRÌNH NGHỈ DƯỠNG SINH THÁI: YÊN BÁI - HỒ THÁC BÀ - AN BÌNH VILLAGE - ĐỘNG THỦY TIÊN (2 NGÀY 1 ĐÊM):
NGÀY 1: BẾN THÁC BÀ - ĐỘNG THỦY TIÊN - AN BÌNH VILLAGE
- 08h30: Đón đoàn tại bến thuyền, lên ca-nô hoặc tàu du lịch tiến thẳng vào vùng lõi lòng hồ Thác Bà.
- 09h45: Thám hiểm Động Thủy Tiên - hệ thống hang động nhũ đá tuyệt mỹ nơi tương truyền tiên nữ hay giáng trần dạo chơi.
- 12h00: Ăn trưa tại nhà hàng nổi với cá tầm nướng, tép hồ xúc bánh đa.
- 14h00: Nhận phòng bungalow view hồ tại An Bình Village - khu nghỉ dưỡng xanh biệt lập ẩn mình giữa vườn cây ăn trái và vịnh hồ tĩnh lặng.
- 16h00: Chèo SUP hoàng hôn, thưởng thức tiệc trà chiều ngắm mặt trời đỏ rực chìm dần xuống chân núi.
- 19h00: Tiệc BBQ nướng ngoài trời bên hồ với thịt lợn bản nướng mắc khén, cá hồ nướng muối ớt, ngô khoai nướng than hoa.

NGÀY 2: AN BÌNH VILLAGE - CHECK-IN ĐẢO XANH - TRỞ VỀ
- 07h00: Tập yoga/tản bộ ngắm sương sớm mặt hồ, thưởng thức buffet sáng nông trại.
- 09h00: Đi thuyền dạo quanh cụm đảo lân cận, trải nghiệm câu cá giải trí.
- 11h30: Trả phòng, ăn trưa nhẹ tại An Bình Village.
- 13h30: Thuyền đưa quý khách về bến cảng, chào tạm biệt và hẹn gặp lại.`,
      },
      {
        tourCode: "HVTB-0006-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Khu du lịch sinh thái Ruby Thác Bà",
          "Đảo Xanh & Đảo Thiên Đường",
          "Thủy điện Thác Bà",
          "Đốt lửa trại & trò chơi teambuilding",
        ],
      },
      {
        tourCode: "HVTB-0007-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Nghỉ dưỡng Vũ Linh Palm House",
          "Khám phá Đảo Xanh & Đảo Thiên Đường",
          "Trải nghiệm bản Dao và nếp sống sông nước",
        ],
      },
      {
        tourCode: "HVTB-0008-23",
        lat: 21.7483,
        lng: 104.9922,
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        scope: "LOCAL",
        duration: "2 Ngày 1 Đêm",
        highlights: [
          "Khu du lịch sinh thái Bảo Ngọc",
          "Động Thủy Tiên huyền bí",
          "Chèo thuyền kayak và câu cá đêm lòng hồ",
        ],
        content: `TOUR NGHỈ DƯỠNG TRẢI NGHIỆM: HỒ THÁC BÀ - ĐỘNG THỦY TIÊN - KDL SINH THÁI BẢO NGỌC (2 NGÀY 1 ĐÊM):
NGÀY 1: KHÁM PHÁ THỦY TIÊN - CHECK-IN BẢO NGỌC ECO-RESORT
- 08h30: Đón quý khách tại bến Thác Bà, du thuyền lướt nhẹ trên làn nước trong veo, ngắm nhìn hàng ngàn đảo đá nhấp nhô.
- 10h00: Leo núi thám hiểm Động Thủy Tiên, ngắm những cột thạch nhũ lung linh ngàn năm tuổi.
- 12h00: Cập bến Khu du lịch sinh thái Bảo Ngọc (huyện Yên Bình), ăn trưa với các món cá hồ nấu măng chua, lợn mán xào lăn, xôi ngũ sắc.
- 14h00: Nhận phòng nghỉ bungalow sinh thái hướng thẳng ra vịnh nước xanh biếc.
- 15h30: Tham gia hoạt động chèo kayak đôi, câu cá trên cầu tàu hoặc bơi lội trong hồ bơi vô cực view hồ Thác Bà.
- 18h30: Thưởng thức bữa tối ẩm thực địa phương kết hợp giao lưu âm nhạc Acoustic bên bờ hồ lộng gió.

NGÀY 2: BẢO NGỌC - THĂM LÀNG NGHỀ VEN HỒ - TRỞ VỀ
- 07h00: Ngắm bình minh tuyệt mỹ, thưởng thức cà phê sáng và điểm tâm bản địa.
- 08h30: Tham quan vườn cây ăn trái, trải nghiệm hái quả tại vườn hoặc ghé thăm làng chài nuôi cá lồng bè truyền thống.
- 11h30: Trả phòng, ăn trưa nhẹ tại nhà hàng sinh thái Bảo Ngọc.
- 13h30: Du thuyền đưa quý khách trở lại bến cảng. Kết thúc chuyến hành trình ý nghĩa.`,
      },
    ];

    for (const update of existingTourUpdates) {
      const canonicalDuration = normalizeTourDuration(update.duration);
      if (update.content) {
        await pool.query(
          `UPDATE "LocalMateTourKnowledge"
           SET "latitude" = $1,
               "longitude" = $2,
               "provinceCode" = $3,
               "province" = $4,
               "tourScope" = $5::"TourScope",
               "duration" = $6,
               "highlights" = $7,
               "content" = $8,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "tourCode" = $9`,
          [
            update.lat,
            update.lng,
            update.provinceCode,
            update.province,
            update.scope,
            canonicalDuration,
            update.highlights,
            update.content,
            update.tourCode,
          ],
        );
      } else {
        await pool.query(
          `UPDATE "LocalMateTourKnowledge"
           SET "latitude" = $1,
               "longitude" = $2,
               "provinceCode" = $3,
               "province" = $4,
               "tourScope" = $5::"TourScope",
               "duration" = $6,
               "highlights" = $7,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "tourCode" = $8`,
          [
            update.lat,
            update.lng,
            update.provinceCode,
            update.province,
            update.scope,
            canonicalDuration,
            update.highlights,
            update.tourCode,
          ],
        );
      }
      console.log(`  -> Đã cập nhật tọa độ & chi tiết tour [${update.tourCode}]`);
    }

    console.log(
      "\n=== 4. BỔ SUNG CÁC TOUR DI SẢN & ĐIỂM ĐẾN PHỔ BIẾN (HÀ NỘI, SA PA, ĐÀ NẴNG, HỘI AN) ===",
    );
    const newTours = [
      {
        tourCode: "TOUR-HN-0001",
        title: "HÀ NỘI CITY TOUR - 36 PHỐ PHƯỜNG, HOÀNG THÀNH & HỒ TÂY (1N)",
        duration: "1 Ngày",
        provinceCode: "HA_NOI",
        province: "Hà Nội",
        tourScope: "LOCAL",
        latitude: 21.0333,
        longitude: 105.85,
        highlights: [
          "Hoàng thành Thăng Long ngàn năm văn hiến",
          "Chùa Trấn Quốc & Vãn cảnh Hồ Tây",
          "Văn Miếu - Quốc Tử Giám trường đại học đầu tiên",
          "36 Phố Phường & Food tour Cà phê trứng",
        ],
        content: `LỊCH TRÌNH CHI TIẾT HÀ NỘI CITY TOUR - TINH HOA THĂNG LONG (1 NGÀY TRỌN VẸN):
- 08h00: Hướng dẫn viên LocalMate đón khách tại khách sạn ở khu vực trung tâm Hà Nội hoặc Phố Cổ.
- 08h30: Khởi đầu ngày mới tại Quảng trường Ba Đình, viếng Lăng Chủ tịch Hồ Chí Minh, tham quan Khu di tích Phủ Chủ tịch, nhà sàn Bác Hồ và Chùa Một Cột với kiến trúc hoa sen độc đáo nghìn năm.
- 10h15: Di chuyển đến Hoàng Thành Thăng Long - Di sản Văn hóa Thế giới được UNESCO vinh danh, tìm hiểu dấu ấn lịch sử qua các triều đại Lý, Trần, Lê, Nguyễn.
- 11h30: Thưởng thức bữa trưa tinh hoa ẩm thực Hà Nội: Bún chả Hàng Quạt hoặc Chả cá Lã Vọng thơm lừng ngạt ngào mùi thì là và thìa là nướng than hoa.
- 13h30: Thăm Văn Miếu - Quốc Tử Giám, ngắm Khuê Văn Các biểu tượng của thủ đô, 82 bia tiến sĩ vinh danh nhân tài đất nước.
- 15h00: Vãn cảnh Hồ Tây, ghé Chùa Trấn Quốc - ngôi chùa cổ nhất Hà Nội với niên đại hơn 1.500 năm bên bờ nước mênh mông, thưởng thức kem hồ Tây hoặc bánh tôm nóng hổi.
- 16h30: Tản bộ dạo quanh 36 Phố Phường (Hàng Ngang, Hàng Đào, Hàng Gai, Hàng Mã), dừng chân ngắm Hồ Hoàn Kiếm, Cầu Thê Húc, Đền Ngọc Sơn và nhâm nhi ly Cà phê Trứng béo ngậy nức tiếng tại Cafe Giảng.
- 18h00: Kết thúc tour, hướng dẫn viên chia tay quý khách hoặc gợi ý các điểm ăn đêm hấp dẫn (Chợ đêm Phố Cổ, Phố bia Tạ Hiện).`,
      },
      {
        tourCode: "TOUR-HN-0002",
        title: "HÀ NỘI - LÀNG GỐM CỔ BÁT TRÀNG & TRẢI NGHIỆM NẶN GỐM (0.5N)",
        duration: "Nửa Ngày",
        provinceCode: "HA_NOI",
        province: "Hà Nội",
        tourScope: "LOCAL",
        latitude: 20.978,
        longitude: 105.912,
        highlights: [
          "Làng gốm cổ Bát Tràng hơn 700 năm tuổi",
          "Trải nghiệm tự tay vuốt nặn gốm và nung sản phẩm",
          "Bảo tàng Gốm Bát Tràng (Trung tâm Tinh hoa Làng nghề Việt)",
          "Thưởng thức bánh tẻ nóng & chè sen Long Nhãn",
        ],
        content: `TOUR KHÁM PHÁ LÀNG GỐM BÁT TRÀNG - NGHỆ THUẬT ĐẤT VÀ LỬA (NỬA NGÀY):
- 08h00 (hoặc 13h30 chiều): Xe và LocalMate đón khách, khởi hành men theo bờ đê sông Hồng xuôi về làng gốm Bát Tràng (Gia Lâm, Hà Nội).
- 08h45: Tham quan Bảo tàng Gốm Bát Tràng - công trình kiến trúc 7 bàn xoay gốm khổng lồ uốn lượn tuyệt tác, chiêm ngưỡng hiện vật gốm cung đình và nghệ thuật điêu khắc hiện đại.
- 10h00: Tản bộ dọc các ngõ nhỏ cổ kính quanh co đặc trưng với những bức tường phơi than gốm độc đáo, viếng Đình làng Bát Tràng trầm mặc bên sông.
- 10h45: Trải nghiệm thực hành nặn gốm tại xưởng thủ công nghệ nhân: tự tay đặt đất sét lên bàn xoay, tạo hình cốc, bình hoa hay bát đĩa theo ý thích, sau đó tô màu trang trí và sấy nung mang về làm kỷ niệm.
- 11h45: Thưởng thức món bánh tẻ truyền thống ấm nóng, nhấp ngụm chè sen thanh mát, mua sắm đồ gốm thủ công tinh xảo với giá gốc tại chợ gốm.
- 12h30: Xe đưa đoàn trở về trung tâm Hà Nội. Kết thúc buổi trải nghiệm giàu bản sắc.`,
      },
      {
        tourCode: "TOUR-LC-0001",
        title: "SA PA - BẢN CÁT CÁT - THUNG LŨNG MƯỜNG HOA - FANSIPAN (2N1Đ)",
        duration: "2 Ngày 1 Đêm",
        provinceCode: "LAO_CAI",
        province: "Lào Cai",
        tourScope: "LOCAL",
        latitude: 22.3364,
        longitude: 103.8438,
        highlights: [
          "Chinh phục Nóc nhà Đông Dương Fansipan 3.143m",
          "Bản Cát Cát người H'Mông với cọn nước khổng lồ",
          "Trekking Thung lũng Mường Hoa ruộng bậc thang kỳ vĩ",
          "Thưởng thức Lẩu cá hồi & Thắng cố Sa Pa",
        ],
        content: `TOUR SA PA - NÓC NHÀ ĐÔNG DƯƠNG & BẢN LÀNG TÂY BẮC (2 NGÀY 1 ĐÊM):
NGÀY 1: TRUNG TÂM SA PA - THUNG LŨNG MƯỜNG HOA - BẢN CÁT CÁT
- 08h30: LocalMate đón quý khách tại điểm hẹn ở thị xã Sa Pa, khởi hành trekking thung lũng Mường Hoa - nơi có dòng suối hoa uốn lượn và bãi đá cổ Sa Pa bí ẩn.
- 10h30: Tham quan bản Cát Cát của đồng bào H'Mông Đen, ngắm thác nước Tiên Sa tung bọt trắng xóa, cọn nước róc rách, tìm hiểu kỹ nghệ dệt lanh, nhuộm chàm và chạm khắc bạc.
- 12h30: Thưởng thức bữa trưa ẩm thực vùng cao: Lợn cắp nách quay giòn bì, gà đen nướng mật ong rừng, cơm lam muối vừng, rau cải mèo xào thịt hun khói.
- 14h30: Nhận phòng khách sạn nghỉ ngơi, tự do tản bộ quanh Nhà thờ Đá Sa Pa cổ kính được xây dựng từ thời Pháp thuộc năm 1895.
- 18h30: Dạo chợ đêm Sa Pa, thưởng thức lẩu cá hồi / cá tầm tươi ngọt bên nồi lẩu nghi ngút khói giữa tiết trời se lạnh vùng cao, nhâm nhi rượu mầm thóc ấm nồng.

NGÀY 2: CHINH PHỤC ĐỈNH FANSIPAN - ĐÈO Ô QUY HỒ - TẠM BIỆT
- 07h00: Ăn sáng tại khách sạn, ngắm biển mây vờn quanh các thung lũng.
- 08h00: Trải nghiệm tàu hỏa leo núi Mường Hoa đến ga cáp treo Fansipan Legend, vượt qua mây ngàn bằng hệ thống cáp treo 3 dây hiện đại nhất thế giới để đặt chân lên cột mốc Nóc nhà Đông Dương 3.143m linh thiêng.
- 10h30: Chiêm bái Đại tượng Phật A Di Đà bằng đồng cao nhất Việt Nam, quần thể Kim Sơn Bảo Thắng Tự uy nghiêm ẩn hiện giữa ngàn mây.
- 12h30: Trả phòng, ăn trưa nhẹ tại nhà hàng thị xã.
- 14h00: Xe đưa đoàn qua Đèo Ô Quy Hồ - một trong tứ đại đỉnh đèo hiểm trở và ngoạn mục nhất Tây Bắc, ngắm cổng trời và toàn cảnh dãy Hoàng Liên Sơn hùng vĩ.
- 16h30: Kết thúc chương trình tour.`,
      },
      {
        tourCode: "TOUR-LC-0002",
        title: "SA PA - ĐÈO Ô QUY HỒ - CẦU KÍNH RỒNG MÂY - BẢN TẢ PHÌN (1N)",
        duration: "1 Ngày",
        provinceCode: "LAO_CAI",
        province: "Lào Cai",
        tourScope: "LOCAL",
        latitude: 22.355,
        longitude: 103.775,
        highlights: [
          "Chinh phục Đèo Ô Quy Hồ - Vua đèo Tây Bắc",
          "Check-in Cầu kính Rồng Mây ngắm thung lũng sâu thẳm",
          "Tắm thùng gỗ lá thuốc gia truyền người Dao Đỏ Tả Phìn",
          "Tu viện cổ Tả Phìn kiến trúc đá rêu phong",
        ],
        content: `TOUR SA PA - ĐÈO Ô QUY HỒ - TẮM LÁ THUỐC DAO ĐỎ TẢ PHÌN (1 NGÀY):
- 08h00: Đón quý khách tại Sa Pa, xe đưa đoàn hướng lên Đèo Ô Quy Hồ nối liền hai tỉnh Lào Cai và Lai Châu.
- 09h00: Check-in Cổng Trời Ô Quy Hồ và trải nghiệm Cầu Kính Rồng Mây vươn ra khỏi vách núi đá hơn 60m ở độ cao trên 2.200m so với mực nước biển, trải nghiệm cảm giác bước đi giữa mây trời kỳ ảo.
- 11h30: Thưởng thức thịt xiên nướng than hoa, cơm lam, ngô nếp nướng tại đỉnh đèo.
- 13h30: Xe đưa đoàn về thung lũng Tả Phìn - thủ phủ của đồng bào người Dao Đỏ. Ghé thăm Tu viện cổ Tả Phìn huyền bí được xây bằng đá ong từ năm 1942.
- 15h00: Trải nghiệm tắm lá thuốc cổ truyền người Dao Đỏ trong bồn gỗ pơ-mu với hơn 30 vị thảo dược quý từ rừng nguyên sinh Hoàng Liên Sơn, xua tan hoàn toàn mệt mỏi, phục hồi cơ thể sảng khoái.
- 17h30: Mua sắm thổ cẩm thủ công và quà lưu niệm do chính các cô gái Dao Đỏ thêu tay. Xe đưa quý khách về lại trung tâm thị xã.`,
      },
      {
        tourCode: "TOUR-DN-0001",
        title: "ĐÀ NẴNG - BÁN ĐẢO SƠN TRÀ - CHÙA LINH ỨNG - NGŨ HÀNH SƠN (1N)",
        duration: "1 Ngày",
        provinceCode: "DA_NANG",
        province: "Đà Nẵng",
        tourScope: "LOCAL",
        latitude: 16.1,
        longitude: 108.26,
        highlights: [
          "Bán đảo Sơn Trà & Đỉnh Bàn Cờ tiên cảnh",
          "Tượng Phật Bà Quan Âm 67m tại Chùa Linh Ứng",
          "Ngũ Hành Sơn huyền ảo với Động Huyền Không",
          "Ngắm Cầu Rồng phun lửa và phun nước bên Sông Hàn",
        ],
        content: `TOUR KHÁM PHÁ ĐÀ NẴNG - THÀNH PHỐ ĐÁNG SỐNG (1 NGÀY):
- 08h00: Xe và HDV đón khách tại khách sạn hoặc bãi biển Mỹ Khê Đà Nẵng.
- 08h30: Khởi hành dọc cung đường biển Hoàng Sa tuyệt đẹp lên Bán đảo Sơn Trà. Viếng Chùa Linh Ứng Bãi Bụt, chiêm bái tượng Bồ Tát Quán Thế Âm cao 67m hướng mắt ra biển Đông che chở cho ngư dân.
- 10h00: Tiếp tục lên Đỉnh Bàn Cờ, ngắm toàn cảnh thành phố Đà Nẵng, vịnh biển hình vòng cung và săn tìm loài Voọc chà vá chân nâu quý hiếm.
- 11h45: Thưởng thức bữa trưa đặc sản Đà Nẵng: Bánh tráng cuốn thịt heo hai đầu da chấm mắm nêm đậm đà, mì Quảng tôm thịt thơm ngon nức tiếng.
- 14h00: Thăm Quần thể Di tích Danh thắng Ngũ Hành Sơn với 5 ngọn núi biểu trưng cho Kim - Mộc - Thủy - Hỏa - Thổ. Leo núi khám phá Chùa Tam Thai, Động Huyền Không lung linh ánh sáng mặt trời chiếu qua vòm đá.
- 16h00: Ghé Làng đá mỹ nghệ Non Nước dưới chân núi, xem nghệ nhân đẽo gọt các tác phẩm tượng đá tinh xảo.
- 17h30: Tự do dạo biển Mỹ Khê - một trong sáu bãi biển quyến rũ nhất hành tinh do tạp chí Forbes bình chọn.
- 19h30: Thưởng ngoạn du thuyền sông Hàn hoặc xem Cầu Rồng phun lửa, phun nước vào tối cuối tuần.`,
      },
      {
        tourCode: "TOUR-QN-0001",
        title: "PHỐ CỔ HỘI AN - RỪNG DỪA BẢY MẪU - LÀNG GỐM THANH HÀ (1N)",
        duration: "1 Ngày",
        provinceCode: "QUANG_NAM",
        province: "Quảng Nam",
        tourScope: "LOCAL",
        latitude: 15.88,
        longitude: 108.33,
        highlights: [
          "Phố cổ Hội An - Di sản Văn hóa Thế giới UNESCO",
          "Chèo thuyền thúng xoay điệu nghệ tại Rừng Dừa Bảy Mẫu",
          "Thưởng thức Cao Lầu, Cơm gà Hội An & Nước Mót thanh tao",
          "Lồng đèn đêm phố cổ & Thả hoa đăng sông Hoài",
        ],
        content: `TOUR HỘI AN - MIỀN DI SẢN LUNG LINH HOA ĐĂNG (1 NGÀY TRỌN VẸN):
- 08h30: Đón quý khách tại Hội An hoặc Đà Nẵng, di chuyển về Khu du lịch sinh thái Rừng Dừa Bảy Mẫu (Cẩm Thanh).
- 09h00: Lên thuyền thúng tròn khám phá rặng dừa nước bạt ngàn, xem nghệ nhân biểu diễn màn xoay thúng và quăng chài bắt cá điêu luyện trên sông Cổ Cò, tự tay làm cào cào, đồng hồ bằng lá dừa.
- 11h30: Thưởng thức bữa trưa đậm vị xứ Quảng: Bánh xèo miền Trung giòn rụm, ram bắp giòn rụm, cá nướng lá chuối.
- 13h30: Thăm Làng gốm Thanh Hà có tuổi đời hơn 500 năm bên bờ sông Thu Bồn, tìm hiểu kỹ nghệ gốm đất nung truyền thống và tự nặn đồ gốm lưu niệm.
- 15h30: Bước chân vào không gian trầm lắng của Phố Cổ Hội An: tham quan Chùa Cầu biểu tượng, Nhà cổ Tấn Ký, Hội quán Phúc Kiến với kiến trúc Trung Hoa độc đáo.
- 17h00: Thưởng thức ly nước Mót thảo mộc trứ danh tại đường Trần Phú, ăn bánh mì Phượng nổi tiếng toàn cầu.
- 18h30: Chiêm ngưỡng phố cổ lên đèn lồng rực rỡ sắc màu, bước lên thuyền gỗ thả những chiếc hoa đăng giấy lấp lánh xuống dòng sông Hoài thơ mộng gửi gắm ước nguyện bình an.
- 20h00: Kết thúc hành trình tham quan ấn tượng.`,
      },
    ];

    for (const tour of newTours) {
      await pool.query(
        `INSERT INTO "LocalMateTourKnowledge" (
          "id", "tourCode", "title", "duration", "highlights", "content", "provinceCode", "province", "tourScope", "latitude", "longitude", "createdAt", "updatedAt"
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::"TourScope", $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("tourCode") DO UPDATE
        SET "title" = EXCLUDED."title",
            "duration" = EXCLUDED."duration",
            "highlights" = EXCLUDED."highlights",
            "content" = EXCLUDED."content",
            "provinceCode" = EXCLUDED."provinceCode",
            "province" = EXCLUDED."province",
            "tourScope" = EXCLUDED."tourScope",
            "latitude" = EXCLUDED."latitude",
            "longitude" = EXCLUDED."longitude",
            "updatedAt" = CURRENT_TIMESTAMP`,
        [
          tour.tourCode,
          tour.title,
          tour.duration,
          tour.highlights,
          tour.content,
          tour.provinceCode,
          tour.province,
          tour.tourScope,
          tour.latitude,
          tour.longitude,
        ],
      );
      console.log(`  -> Đã thêm/cập nhật tour di sản [${tour.tourCode}] ${tour.title}`);
    }

    console.log("\n=== 5. CẬP NHẬT TỌA ĐỘ VÀ BỔ SUNG HỒ SƠ HƯỚNG DẪN VIÊN LOCALMATE ===");
    // Cập nhật tọa độ cho 4 hướng dẫn viên Yên Bái hiện có
    await pool.query(`
      UPDATE "LocalMateProfile"
      SET "serviceLatitude" = 21.854200, "serviceLongitude" = 104.085200, "status" = 'QUALIFIED'
      WHERE "guideCode" = 'LM-YB-001'
    `);
    await pool.query(`
      UPDATE "LocalMateProfile"
      SET "serviceLatitude" = 21.603300, "serviceLongitude" = 104.512500, "status" = 'QUALIFIED'
      WHERE "guideCode" = 'LM-YB-002'
    `);
    await pool.query(`
      UPDATE "LocalMateProfile"
      SET "serviceLatitude" = 21.748300, "serviceLongitude" = 104.992200, "status" = 'QUALIFIED'
      WHERE "guideCode" = 'LM-YB-003'
    `);
    await pool.query(`
      UPDATE "LocalMateProfile"
      SET "serviceLatitude" = 21.642500, "serviceLongitude" = 104.604200, "status" = 'QUALIFIED'
      WHERE "guideCode" = 'LM-YB-004'
    `);
    console.log("  -> Đã cập nhật tọa độ dịch vụ chuẩn xác cho 4 LocalMate Yên Bái");

    // Thêm HDV chất lượng cao cho Hà Nội, Sa Pa, Đà Nẵng, Hội An (đầy đủ phủ khắp các tour)
    const additionalGuides = [
      {
        guideCode: "LM-HN-001",
        fullName: "Nguyễn Văn Minh",
        phone: "0912233445",
        email: "minh.nguyen@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English", "French"],
        operatingRegions: ["Hoàn Kiếm", "Ba Đình", "Tây Hồ", "Gia Lâm", "Bát Tràng", "Hà Nội"],
        specialties: [
          "Tour Phố Cổ & Di sản Thăng Long",
          "Food tour ẩm thực đường phố Hà Nội",
          "Kể chuyện lịch sử & kiến trúc thời Pháp",
          "Làng nghề gốm Bát Tràng & tour ngoại thành",
        ],
        bio: "Hướng dẫn viên bản địa sinh ra và lớn lên tại 36 Phố Phường Hà Nội, hơn 7 năm kinh nghiệm đưa khách quốc tế trải nghiệm ngõ ngách, di sản và văn hóa ẩm thực tinh tế đất Tràng An.",
        dailyRateVnd: 1000000,
        rating: 4.96,
        totalReviews: 62,
        serviceLatitude: 21.0333,
        serviceLongitude: 105.85,
      },
      {
        guideCode: "LM-HN-002",
        fullName: "Lê Hoàng Anh",
        phone: "0913344556",
        email: "hoanganh.le@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English"],
        operatingRegions: ["Bát Tràng", "Gia Lâm", "Long Biên", "Hà Nội"],
        specialties: [
          "Làng gốm Bát Tràng & nghệ thuật gốm cổ hơn 700 năm",
          "Trải nghiệm tự tay vuốt nặn gốm và nung men thủ công",
          "Văn hóa làng nghề ven sông Hồng & ẩm thực ngoại ô Hà Nội",
        ],
        bio: "Nghệ nhân trẻ sinh ra trong gia đình làm gốm 5 đời tại Bát Tràng, hơn 6 năm hướng dẫn du khách trong và ngoài nước khám phá bảo tàng gốm, nghệ thuật nặn gốm tại xưởng và các di tích cổ ngàn năm.",
        dailyRateVnd: 900000,
        rating: 4.95,
        totalReviews: 48,
        serviceLatitude: 20.978,
        serviceLongitude: 105.912,
      },
      {
        guideCode: "LM-LC-001",
        fullName: "Thào A Sinh",
        phone: "0983344556",
        email: "sinh.thao@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English", "H'Mông"],
        operatingRegions: ["Sa Pa", "Cát Cát", "Tả Van", "Lào Cai"],
        specialties: [
          "Trekking cung đường bản Mường Hoa",
          "Chinh phục đỉnh Fansipan đường bộ",
          "Giao lưu phong tục văn hóa người H'Mông",
        ],
        bio: "Người con H'Mông bản Cát Cát am hiểu từng khúc đèo ngọn suối, thông thạo tiếng Anh và tiếng bản địa, dẫn đoàn leo Fansipan và săn mây ruộng bậc thang chuyên nghiệp.",
        dailyRateVnd: 1100000,
        rating: 4.94,
        totalReviews: 54,
        serviceLatitude: 22.3364,
        serviceLongitude: 103.8438,
      },
      {
        guideCode: "LM-LC-002",
        fullName: "Chảo Mẩy Phin",
        phone: "0984556677",
        email: "phin.chao@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English", "Dao"],
        operatingRegions: ["Sa Pa", "Tả Phìn", "Ô Quy Hồ", "Lào Cai"],
        specialties: [
          "Văn hóa người Dao Đỏ & bài thuốc tắm thảo dược",
          "Khám phá Đèo Ô Quy Hồ & Cầu kính Rồng Mây",
          "Tu viện cổ Tả Phìn & thổ cẩm thêu tay",
        ],
        bio: "Cô gái Dao Đỏ bản Tả Phìn đam mê gìn giữ văn hóa truyền thống, thành thạo tiếng Anh du lịch, chuyên dẫn các tour tắm lá thuốc hồi phục sức khỏe và khám phá thiên nhiên Sa Pa.",
        dailyRateVnd: 950000,
        rating: 4.93,
        totalReviews: 39,
        serviceLatitude: 22.355,
        serviceLongitude: 103.775,
      },
      {
        guideCode: "LM-DN-001",
        fullName: "Trần Anh Tuấn",
        phone: "0905123456",
        email: "tuan.tran@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English", "Korean"],
        operatingRegions: ["Sơn Trà", "Ngũ Hành Sơn", "Hải Châu", "Mỹ Khê", "Bà Nà", "Đà Nẵng"],
        specialties: [
          "Bán đảo Sơn Trà & Đỉnh Bàn Cờ ngắm Voọc",
          "Danh thắng Ngũ Hành Sơn & Làng đá Non Nước",
          "Ẩm thực miền Trung & Cầu Rồng sông Hàn",
        ],
        bio: "Hướng dẫn viên kỳ cựu hơn 8 năm gắn bó với thành phố biển Đà Nẵng, am hiểu tường tận từng hang động Ngũ Hành Sơn, cung đường đèo Sơn Trà và các quán ăn bản địa đậm vị xứ Quảng.",
        dailyRateVnd: 1000000,
        rating: 4.95,
        totalReviews: 58,
        serviceLatitude: 16.1,
        serviceLongitude: 108.26,
      },
      {
        guideCode: "LM-QN-001",
        fullName: "Nguyễn Mai Lan",
        phone: "0905678901",
        email: "lan.nguyen@localmate.vietsage.vn",
        avatarUrl:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
        status: "QUALIFIED",
        position: "GUIDE",
        languages: ["Vietnamese", "English", "Japanese"],
        operatingRegions: ["Hội An", "Cẩm Thanh", "Thanh Hà", "Điện Bàn", "Quảng Nam"],
        specialties: [
          "Phố cổ Hội An & Văn hóa di sản đèn lồng",
          "Chèo thuyền thúng Rừng Dừa Bảy Mẫu",
          "Làng gốm cổ Thanh Hà & ẩm thực Cao Lầu",
        ],
        bio: "Sinh ra tại trung tâm phố cổ Hội An, chuyên gia kể chuyện văn hóa di sản, dẫn dắt du khách trải nghiệm mộc mạc từ thuyền thúng sông nước đến các làng nghề truyền thống lâu đời.",
        dailyRateVnd: 950000,
        rating: 4.97,
        totalReviews: 64,
        serviceLatitude: 15.88,
        serviceLongitude: 108.33,
      },
    ];

    for (const guide of additionalGuides) {
      await pool.query(
        `INSERT INTO "LocalMateProfile" (
          "id", "guideCode", "fullName", "phone", "email", "avatarUrl", "status", "position",
          "languages", "operatingRegions", "specialties", "bio", "dailyRateVnd", "rating", "totalReviews",
          "serviceLatitude", "serviceLongitude", "createdAt", "updatedAt"
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6::"LocalMateStatus", $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("guideCode") DO UPDATE
        SET "fullName" = EXCLUDED."fullName",
            "phone" = EXCLUDED."phone",
            "email" = EXCLUDED."email",
            "avatarUrl" = EXCLUDED."avatarUrl",
            "status" = EXCLUDED."status",
            "position" = EXCLUDED."position",
            "languages" = EXCLUDED."languages",
            "operatingRegions" = EXCLUDED."operatingRegions",
            "specialties" = EXCLUDED."specialties",
            "bio" = EXCLUDED."bio",
            "dailyRateVnd" = EXCLUDED."dailyRateVnd",
            "rating" = EXCLUDED."rating",
            "totalReviews" = EXCLUDED."totalReviews",
            "serviceLatitude" = EXCLUDED."serviceLatitude",
            "serviceLongitude" = EXCLUDED."serviceLongitude",
            "updatedAt" = CURRENT_TIMESTAMP`,
        [
          guide.guideCode,
          guide.fullName,
          guide.phone,
          guide.email,
          guide.avatarUrl,
          guide.status,
          guide.position,
          guide.languages,
          guide.operatingRegions,
          guide.specialties,
          guide.bio,
          guide.dailyRateVnd,
          guide.rating,
          guide.totalReviews,
          guide.serviceLatitude,
          guide.serviceLongitude,
        ],
      );
      console.log(`  -> Đã tạo/cập nhật hồ sơ LocalMate [${guide.guideCode}] ${guide.fullName}`);
    }

    // Chỉ quản lý service tenant chuyên biệt của LocalMate; không chiếm tenant SERVICE bất kỳ.
    const localMateTenant = await pool.query(`
      INSERT INTO "Tenant" ("id", "code", "name", "type", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'LOCALMATE_SERVICE_TENANT', 'Mạng lưới LocalMate VietSage', 'SERVICE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("code") DO UPDATE
      SET "name" = EXCLUDED."name", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "Tenant"."type" = 'SERVICE'
      RETURNING "id"
    `);
    const serviceTenantId = localMateTenant.rows[0]?.id;
    if (!serviceTenantId) {
      throw new Error("LOCALMATE_SERVICE_TENANT đã tồn tại nhưng không phải SERVICE tenant");
    }
    await pool.query(
      `
      INSERT INTO "ServiceTenantProfile" ("tenantId", "displayName", "status", "phone", "address", "createdAt", "updatedAt")
      VALUES ($1, 'Mạng lưới LocalMate Toàn Quốc', 'ACTIVE', '0901234567', 'Việt Nam', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("tenantId") DO UPDATE
      SET "displayName" = EXCLUDED."displayName", "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP
    `,
      [serviceTenantId],
    );

    // Đảm bảo Category Marketplace
    const catTourRes = await pool.query(
      `SELECT id FROM "MarketplaceCategory" WHERE "code" IN ('TOUR_TRANSPORT', 'TOURS', 'LOCALMATE') LIMIT 1`,
    );
    let catTourId = catTourRes.rows[0]?.id;
    if (!catTourId) {
      const anyCat = await pool.query(`SELECT id FROM "MarketplaceCategory" LIMIT 1`);
      catTourId = anyCat.rows[0]?.id;
      if (!catTourId) {
        const newCat = await pool.query(`
          INSERT INTO "MarketplaceCategory" ("id", "code", "nameVi", "nameEn", "sortOrder", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), 'TOUR_LOCALMATE', 'Tour & Hướng dẫn viên bản địa', 'Tours & LocalMate Guides', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING "id"
        `);
        catTourId = newCat.rows[0].id;
      }
    }

    // Tạo dịch vụ Marketplace cho từng hướng dẫn viên
    const allGuidesRes = await pool.query(
      `SELECT id, "guideCode", "fullName", "dailyRateVnd", "avatarUrl", "bio" FROM "LocalMateProfile"`,
    );
    for (const g of allGuidesRes.rows) {
      const importKey = `SVC_${g.guideCode}`;
      await pool.query(
        `
        INSERT INTO "MarketplaceService" (
          "id", "serviceTenantId", "importKey", "categoryId", "name", "description",
          "unitPrice", "pricingUnit", "currency", "imageUrls", "mode", "capacityAvailable",
          "status", "localMateProfileId", "createdAt", "updatedAt"
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'tour', 'VND', ARRAY[$7],
          'CUSTOMER_AT_SERVICE'::"MarketplaceServiceMode", 10, 'ACTIVE'::"MarketplaceRecordStatus",
          $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("serviceTenantId", "importKey") DO UPDATE
        SET "localMateProfileId" = EXCLUDED."localMateProfileId",
            "name" = EXCLUDED."name",
            "unitPrice" = EXCLUDED."unitPrice",
            "capacityAvailable" = EXCLUDED."capacityAvailable",
            "status" = 'ACTIVE'::"MarketplaceRecordStatus",
            "updatedAt" = CURRENT_TIMESTAMP
      `,
        [
          serviceTenantId,
          importKey,
          catTourId,
          `Tour trải nghiệm cùng LocalMate ${g.fullName}`,
          g.bio || `Tour đồng hành hướng dẫn viên bản địa ${g.fullName}`,
          g.dailyRateVnd || 1000000,
          g.avatarUrl ||
            "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
          g.id,
        ],
      );
    }
    console.log(
      "  -> Đã tạo gói dịch vụ Marketplace cho LocalMate; liên kết hotel và Telegram phải được cấp thật",
    );

    console.log(
      "\n=== 6. BỔ SUNG ĐỐI TÁC LÂN CẬN (LOCAL PARTNERS) CHO HCA HOMESTAY & MINH 123 ===",
    );
    // Lấy ID các category đối tác
    const catRes = await pool.query(`SELECT id, code FROM "LocalPartnerCategory"`);
    const catMap = new Map<string, string>(catRes.rows.map((r) => [r.code, r.id]));

    // Lấy ID các khách sạn
    const hcaHotel = (await pool.query(`SELECT id FROM "Hotel" WHERE "code" = 'HCA_HOMESTAY'`))
      .rows[0];
    const minhHotel = (await pool.query(`SELECT id FROM "Hotel" WHERE "code" = 'VSH_HOTEL_0005'`))
      .rows[0];

    if (hcaHotel && catMap.size > 0) {
      const hcaPartners = [
        {
          name: "Nhà hàng Hương Rừng Mù Cang Chải",
          categoryCode: "RESTAURANT",
          description:
            "Chuyên đặc sản núi rừng Tây Bắc: gà đồi nướng mắc khén, cá suối chiên giòn, xôi nếp nương Tú Lệ thơm dẻo.",
          address: "Tổ 3, Thị trấn Mù Cang Chải, Yên Bái",
          lat: 21.855,
          lng: 104.086,
          distanceMeters: 350,
          phone: "02163878999",
          coverImageUrl:
            "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Giảm 10% tổng hóa đơn ăn uống",
              description:
                "Dành riêng cho khách lưu trú xuất trình khóa phòng hoặc app VietSage GuestOS.",
              discountCode: "VIETSAGE10",
              discountType: "PERCENTAGE",
              discountValue: 10,
            },
          ],
        },
        {
          name: "Suối Mây Coffee & Homestay",
          categoryCode: "CAFE",
          description:
            "Quán cafe view ngắm trọn thung lũng ruộng bậc thang đẹp nhất Mù Cang Chải, phục vụ cafe pha phin, trà hoa cúc và điểm tâm.",
          address: "Bản La Pán Tẩn, Mù Cang Chải, Yên Bái",
          lat: 21.858,
          lng: 104.091,
          distanceMeters: 800,
          phone: "0978112233",
          coverImageUrl:
            "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Tặng 1 phần bánh ngọt khi gọi đồ uống",
              description: "Áp dụng cho mọi khách hàng đặt bàn qua ứng dụng VietSage.",
              discountCode: "FREETREAT",
              discountType: "PERCENTAGE",
              discountValue: 0,
            },
          ],
        },
        {
          name: "Cho Thuê Xe Máy Phượt A Pháo",
          categoryCode: "RENTAL_TRANSPORT",
          description:
            "Dàn xe máy Honda Wave Alpha, Blade và tay côn cào cào máy khỏe, đầy đủ mũ bảo hiểm 3/4 và đồ nghề vá xe.",
          address: "QL32, Thị trấn Mù Cang Chải, Yên Bái",
          lat: 21.853,
          lng: 104.084,
          distanceMeters: 200,
          phone: "0987654321",
          coverImageUrl:
            "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Ưu đãi giá thuê xe 130.000đ/ngày",
              description: "Giảm 20.000đ/xe/ngày khi thuê từ 2 ngày trở lên.",
              discountCode: "PHUOT20K",
              discountType: "FIXED_AMOUNT",
              discountValue: 20000,
            },
          ],
        },
        {
          name: "Tắm Khoáng & Thảo Dược Bản Hốc",
          categoryCode: "SPA_MASSAGE",
          description:
            "Khu ngâm tắm khoáng nóng tự nhiên và xông hơi thuốc lá thảo mộc gia truyền dân tộc Thái, giúp lưu thông khí huyết.",
          address: "Bản Hốc, Xã Sơn Thịnh, Văn Chấn, Yên Bái",
          lat: 21.608,
          lng: 104.52,
          distanceMeters: 1500,
          phone: "0912998877",
          coverImageUrl:
            "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Giảm 15% gói tắm khoáng thảo dược VIP",
              description: "Bao gồm bồn ngâm gỗ sồi và trà thảo dược ấm.",
              discountCode: "KHOANG15",
              discountType: "PERCENTAGE",
              discountValue: 15,
            },
          ],
        },
      ];

      for (const p of hcaPartners) {
        const catId = catMap.get(p.categoryCode) || catMap.get("OTHER")!;
        const existing = await pool.query(
          `SELECT "id" FROM "LocalPartner" WHERE "hotelId" = $1 AND "name" = $2`,
          [hcaHotel.id, p.name],
        );
        let partnerId: string;
        if (existing.rows.length > 0) {
          partnerId = existing.rows[0].id;
          await pool.query(
            `UPDATE "LocalPartner"
             SET "categoryId" = $1, "description" = $2, "address" = $3,
                 "latitude" = $4, "longitude" = $5, "distanceMeters" = $6,
                 "phone" = $7, "coverImageUrl" = $8, "updatedAt" = CURRENT_TIMESTAMP
             WHERE "id" = $9`,
            [
              catId,
              p.description,
              p.address,
              p.lat,
              p.lng,
              p.distanceMeters,
              p.phone,
              p.coverImageUrl,
              partnerId,
            ],
          );
        } else {
          const insertRes = await pool.query(
            `INSERT INTO "LocalPartner" (
              "id", "hotelId", "categoryId", "name", "description", "address",
              "latitude", "longitude", "distanceMeters", "phone", "coverImageUrl", "images",
              "createdAt", "updatedAt"
            )
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ARRAY[]::TEXT[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING "id"`,
            [
              hcaHotel.id,
              catId,
              p.name,
              p.description,
              p.address,
              p.lat,
              p.lng,
              p.distanceMeters,
              p.phone,
              p.coverImageUrl,
            ],
          );
          partnerId = insertRes.rows[0].id;
        }

        if (partnerId && p.offers.length > 0) {
          for (const offer of p.offers) {
            await pool.query(
              `INSERT INTO "LocalPartnerOffer" (
                "id", "partnerId", "title", "description", "discountCode", "discountType", "discountValue", "status", "createdAt", "updatedAt"
              )
              VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"LocalPartnerOfferDiscountType", $6, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT DO NOTHING`,
              [
                partnerId,
                offer.title,
                offer.description,
                offer.discountCode,
                offer.discountType,
                offer.discountValue,
              ],
            );
          }
        }
      }
      console.log(`  -> Đã tạo 4 đối tác lân cận và ưu đãi độc quyền cho HCA HomeStay`);
    }

    if (minhHotel && catMap.size > 0) {
      const minhPartners = [
        {
          name: "Phở Bát Đàn Truyền Thống",
          categoryCode: "RESTAURANT",
          description:
            "Thương hiệu phở bò cổ truyền Hà Nội với nước dùng ninh xương ngọt thanh trong vắt và thịt bò tái lăn mềm thơm.",
          address: "49 Bát Đàn, Hoàn Kiếm, Hà Nội",
          lat: 21.0335,
          lng: 105.8472,
          distanceMeters: 1200,
          phone: "02438234567",
          coverImageUrl:
            "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Tặng quẩy giòn & trà đá khi dùng phở",
              description: "Áp dụng cho khách quét mã từ VietSage.",
              discountCode: "PHOBATDAN",
              discountType: "PERCENTAGE",
              discountValue: 0,
            },
          ],
        },
        {
          name: "Cafe Giảng - Cà Phê Trứng Hà Nội",
          categoryCode: "CAFE",
          description:
            "Nơi khai sinh món cà phê trứng nức tiếng từ năm 1946 với lớp kem trứng béo ngậy mịn màng như tơ.",
          address: "39 Nguyễn Hữu Huân, Hoàn Kiếm, Hà Nội",
          lat: 21.0342,
          lng: 105.854,
          distanceMeters: 900,
          phone: "0989898989",
          coverImageUrl:
            "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
          offers: [
            {
              title: "Giảm 10% khi mua hạt cà phê rang xay mang về",
              description: "Cà phê mộc nguyên chất đóng gói cao cấp.",
              discountCode: "GIANG10",
              discountType: "PERCENTAGE",
              discountValue: 10,
            },
          ],
        },
      ];

      for (const p of minhPartners) {
        const catId = catMap.get(p.categoryCode) || catMap.get("OTHER")!;
        const existing = await pool.query(
          `SELECT "id" FROM "LocalPartner" WHERE "hotelId" = $1 AND "name" = $2`,
          [minhHotel.id, p.name],
        );
        let partnerId: string;
        if (existing.rows.length > 0) {
          partnerId = existing.rows[0].id;
          await pool.query(
            `UPDATE "LocalPartner"
             SET "categoryId" = $1, "description" = $2, "address" = $3,
                 "latitude" = $4, "longitude" = $5, "distanceMeters" = $6,
                 "phone" = $7, "coverImageUrl" = $8, "updatedAt" = CURRENT_TIMESTAMP
             WHERE "id" = $9`,
            [
              catId,
              p.description,
              p.address,
              p.lat,
              p.lng,
              p.distanceMeters,
              p.phone,
              p.coverImageUrl,
              partnerId,
            ],
          );
        } else {
          const insertRes = await pool.query(
            `INSERT INTO "LocalPartner" (
              "id", "hotelId", "categoryId", "name", "description", "address",
              "latitude", "longitude", "distanceMeters", "phone", "coverImageUrl", "images",
              "createdAt", "updatedAt"
            )
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ARRAY[]::TEXT[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING "id"`,
            [
              minhHotel.id,
              catId,
              p.name,
              p.description,
              p.address,
              p.lat,
              p.lng,
              p.distanceMeters,
              p.phone,
              p.coverImageUrl,
            ],
          );
          partnerId = insertRes.rows[0].id;
        }

        if (partnerId && p.offers.length > 0) {
          for (const offer of p.offers) {
            await pool.query(
              `INSERT INTO "LocalPartnerOffer" (
                "id", "partnerId", "title", "description", "discountCode", "discountType", "discountValue", "status", "createdAt", "updatedAt"
              )
              VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"LocalPartnerOfferDiscountType", $6, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT DO NOTHING`,
              [
                partnerId,
                offer.title,
                offer.description,
                offer.discountCode,
                offer.discountType,
                offer.discountValue,
              ],
            );
          }
        }
      }
      console.log(`  -> Đã tạo đối tác lân cận cho Khách sạn minh 123`);
    }

    console.log("\n=== 7. TẠO DANH MỤC DỊCH VỤ NỘI KHU CHO HCA HOMESTAY (HOTEL SERVICES) ===");
    if (hcaHotel) {
      // 1. Tạo category Ẩm thực tại phòng
      const catFoodRes = await pool.query(
        `INSERT INTO "HotelServiceCategory" ("id", "hotelId", "importKey", "name", "sortOrder", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'CAT_FOOD', 'Ẩm thực tại phòng (In-room Dining)', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("hotelId", "importKey") DO UPDATE SET "name" = EXCLUDED."name"
         RETURNING "id"`,
        [hcaHotel.id],
      );
      const catFoodId = catFoodRes.rows[0].id;

      // 2. Tạo category Dịch vụ phòng
      const catHkRes = await pool.query(
        `INSERT INTO "HotelServiceCategory" ("id", "hotelId", "importKey", "name", "sortOrder", "status", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'CAT_HK', 'Dịch vụ phòng & Tiện ích (Housekeeping & Amenities)', 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("hotelId", "importKey") DO UPDATE SET "name" = EXCLUDED."name"
         RETURNING "id"`,
        [hcaHotel.id],
      );
      const catHkId = catHkRes.rows[0].id;

      // Items ẩm thực
      const foodItems = [
        {
          importKey: "FOOD_CHICKEN",
          name: "Gà đồi nướng mắc khén & Xôi nương Tú Lệ",
          description:
            "Gà chạy bộ vùng cao tẩm ướp hạt dổi, mắc khén nướng than hồng giòn thơm, ăn kèm xôi nếp thơm nương Tú Lệ.",
          price: 180000,
        },
        {
          importKey: "FOOD_FISH",
          name: "Cá suối chiên giòn chấm muối ớt chanh",
          description:
            "Cá suối Mù Cang Chải tươi rói bắt trong ngày, chiên giòn nguyên con ăn kèm rau thơm rừng và nước chấm chua ngọt.",
          price: 95000,
        },
        {
          importKey: "DRINK_TEA",
          name: "Ấm trà Shan Tuyết cổ thụ Suối Giàng",
          description:
            "Búp chè Shan Tuyết 1 tôm 2 lá cổ thụ 300 năm tuổi, nước vàng sánh óng ả, vị ngọt hậu sâu lắng.",
          price: 45000,
        },
        {
          importKey: "DRINK_WATER",
          name: "Set 2 chai nước khoáng thiên nhiên 500ml",
          description: "Nước khoáng đóng chai bổ sung thêm theo yêu cầu của khách lưu trú.",
          price: 20000,
        },
      ];

      for (const item of foodItems) {
        await pool.query(
          `INSERT INTO "HotelServiceItem" (
            "id", "hotelId", "categoryId", "importKey", "name", "description", "priceOverride", "quantityEnabled", "status", "createdAt", "updatedAt"
          )
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("hotelId", "importKey") DO UPDATE
          SET "name" = EXCLUDED."name",
              "description" = EXCLUDED."description",
              "priceOverride" = EXCLUDED."priceOverride",
              "updatedAt" = CURRENT_TIMESTAMP`,
          [hcaHotel.id, catFoodId, item.importKey, item.name, item.description, item.price],
        );
      }

      // Items tiện ích phòng
      const hkItems = [
        {
          importKey: "HK_CLEAN",
          name: "Yêu cầu dọn phòng & Thay ga khăn sạch",
          description:
            "Nhân viên buồng phòng sẽ đến hút bụi, dọn phòng và thay mới khăn tắm, ga trải giường trong vòng 15-30 phút.",
          price: 0,
        },
        {
          importKey: "HK_TOWEL",
          name: "Thêm bộ khăn tắm & Khăn mặt sạch",
          description: "Giao thêm 02 khăn tắm lớn và 02 khăn mặt cotton mềm mại tận phòng.",
          price: 0,
        },
        {
          importKey: "HK_IRON",
          name: "Mượn bàn ủi & Cầu là quần áo",
          description: "Bộ bàn ủi hơi nước cầm tay phục vụ ủi đồ tại phòng.",
          price: 0,
        },
        {
          importKey: "HK_LAUNDRY",
          name: "Dịch vụ giặt ủi lấy nhanh trong ngày",
          description: "Giặt sấy thơm tho và gấp gọn gàng, trả đồ trước 18h cùng ngày.",
          price: 50000,
        },
      ];

      for (const item of hkItems) {
        await pool.query(
          `INSERT INTO "HotelServiceItem" (
            "id", "hotelId", "categoryId", "importKey", "name", "description", "priceOverride", "quantityEnabled", "status", "createdAt", "updatedAt"
          )
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT ("hotelId", "importKey") DO UPDATE
          SET "name" = EXCLUDED."name",
              "description" = EXCLUDED."description",
              "priceOverride" = EXCLUDED."priceOverride",
              "updatedAt" = CURRENT_TIMESTAMP`,
          [hcaHotel.id, catHkId, item.importKey, item.name, item.description, item.price],
        );
      }
      console.log(
        `  -> Đã tạo 2 danh mục dịch vụ phòng & ẩm thực với 8 dịch vụ tiêu chuẩn cho HCA HomeStay`,
      );
    }

    console.log("\n=======================================================");
    console.log("HOÀN THÀNH ĐỒNG BỘ TOÀN DIỆN KHO TRI THỨC CHO AI!");
    console.log("=======================================================");

    return { success: true };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedAiKnowledge()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Lỗi đồng bộ tri thức AI:", err);
      process.exit(1);
    });
}
