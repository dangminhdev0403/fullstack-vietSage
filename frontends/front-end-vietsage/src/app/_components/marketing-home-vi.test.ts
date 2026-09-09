import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./marketing-home.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../components/marketing/marketing-shell.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../components/marketing/marketing-header.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

test("trangchu renders complete Vietnamese marketing copy without changing shared English defaults", () => {
  assert.match(home, /title: "VietSage \| Nền tảng trợ lý số tại phòng"/);
  assert.match(home, /<MarketingShell locale="vi">/);
  assert.match(home, /<Hero[\s\S]*locale="vi"/);
  assert.match(home, /<Cta locale="vi"/);
  assert.match(shell, /locale === "vi" \? "text-\[clamp\(2rem,5vw,3\.75rem\)\]/);
  assert.match(shell, /Bạn cần gì để kỳ lưu trú thoải mái hơn\?/);
  assert.match(home, /mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4/);
  assert.match(home, /text-\[10px\] leading-4 uppercase tracking-\[\.1em\]/);
  assert.match(shell, /VietSage Assistant/);
  assert.match(shell, /Chọn nhu cầu của bạn, chúng tôi sẽ hỗ trợ ngay/);
  assert.match(shell, /Sẵn sàng phục vụ/);
  assert.match(shell, /grid-cols-1[^\"]*sm:grid-cols-2/);
  assert.match(shell, /Khăn và tiện ích/);
  assert.match(shell, /Ăn uống tại phòng/);
  assert.match(shell, /Dọn phòng/);
  assert.match(shell, /Hỗ trợ địa phương/);
  assert.match(shell, /icon-amenities\.png/);
  assert.match(shell, /icon-dining\.png/);
  assert.match(shell, /Trải nghiệm nghỉ dưỡng trọn vẹn/);
  assert.match(shell, /Phản hồi trong/);
  assert.match(shell, /3 phút/);
  assert.match(shell, /vs-device-card[^\"]*bg-white/);
  assert.doesNotMatch(styles, /\.vs-concierge-stack|\.vs-service-tile:nth-child/);
  assert.match(styles, /@media \(max-width: 1599px\)[\s\S]*?\.vs-scene-rail[\s\S]*?display: none/);
  assert.doesNotMatch(styles, /scroll-snap-type: y proximity/);
  assert.match(home, /Trợ lý E-Concierge số tại từng phòng nghỉ/);
  assert.match(home, /Trợ lý số tại phòng qua mã QR/);
  assert.match(home, /Câu hỏi thường gặp/);
  assert.doesNotMatch(home, /Room concierge by QR|Guest comfort, not guest database management|Clear positioning before a demo/);

  assert.match(shell, /locale = "en"/);
  assert.match(shell, /locale=\{locale\}/);
  assert.match(shell, /aria-label=\{locale === "vi" \? "Danh mục điều hướng trang chủ" : "Landing page sections"\}/);
  assert.match(shell, /Đặt lịch demo/);
  assert.match(shell, /Xem trải nghiệm khách/);
  assert.match(shell, /Công ty/);
  assert.match(shell, /Bảo lưu mọi quyền/);

  assert.match(header, /locale = "en"/);
  assert.match(header, /Trang chủ/);
  assert.match(header, /Giải pháp/);
  assert.match(header, /Yêu cầu demo/);
  assert.match(header, /Mở menu điều hướng/);
  assert.match(header, /Đăng nhập/);
  assert.match(header, /label: "Home"/);
});
