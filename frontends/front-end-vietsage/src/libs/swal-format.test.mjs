import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  formatTextContent,
  formatAlertErrorMessage,
  extractErrorMessage,
} from "./swal.ts";

test("escapeHtml prevents HTML injection and escapes special characters", () => {
  const unsafe = `<script>alert("XSS & danger")</script>`;
  const safe = escapeHtml(unsafe);
  assert.equal(safe.includes("<script>"), false);
  assert.equal(safe.includes("&lt;script&gt;"), true);
  assert.equal(safe.includes("&amp;"), true);
});

test("formatTextContent highlights quoted text and ISO dates cleanly", () => {
  const text = "Số giấy tờ '034205005952' từ 2026-09-14 đến 2026-09-15";
  const formatted = formatTextContent(text);
  assert.match(formatted, /034205005952/);
  assert.match(formatted, /font-bold text-slate-900 bg-white/);
  assert.match(formatted, /2026-09-14/);
  assert.match(formatted, /2026-09-15/);
});

test("formatAlertErrorMessage formats the user's exact BCA rejection case into structured cards and guidance", () => {
  const userCase =
    "Bản khai báo 1: Loại giấy tờ 'Thẻ Căn Cước' và Số giấy tờ '034205005952' đang tạm trú tại CSLT và chưa checkout, Bản khai báo 1: Khách đã có khai báo tạm trú từ 2026-09-14 đến 2026-09-15 tại cơ sở lưu trú này. Vui lòng kiểm tra tại chức năng Quản lý khách đang tạm trú.";

  const html = formatAlertErrorMessage(userCase);

  // Group header
  assert.match(html, /Bản khai báo 1/);

  // Both errors grouped under the declaration
  assert.match(html, /đang tạm trú tại CSLT và chưa checkout/);
  assert.match(html, /Khách đã có khai báo tạm trú từ/);

  // Quoted values and dates highlighted
  assert.match(html, /Thẻ Căn Cước/);
  assert.match(html, /034205005952/);
  assert.match(html, /2026-09-14/);
  assert.match(html, /2026-09-15/);

  // Guidance box extracted and formatted
  assert.match(html, /Hướng dẫn:/);
  assert.match(html, /Vui lòng kiểm tra tại chức năng Quản lý khách đang tạm trú\./);
});

test("formatAlertErrorMessage formats multiple declarations into distinct cards", () => {
  const multiDecl =
    "Bản khai báo 1: Số hộ chiếu không hợp lệ. Bản khai báo 2: Quốc tịch không đúng định dạng. Vui lòng kiểm tra lại thông tin khách lưu trú.";

  const html = formatAlertErrorMessage(multiDecl);
  assert.match(html, /Bản khai báo 1/);
  assert.match(html, /Bản khai báo 2/);
  assert.match(html, /Số hộ chiếu không hợp lệ/);
  assert.match(html, /Quốc tịch không đúng định dạng/);
  assert.match(html, /Hướng dẫn:/);
});

test("formatAlertErrorMessage formats row-based Excel errors (Dòng X:)", () => {
  const excelError =
    "Dòng 4: Cột 'Giá phòng' không hợp lệ. Dòng 8: 'Mã phòng' bị trùng lặp. Vui lòng kiểm tra lại file Excel.";

  const html = formatAlertErrorMessage(excelError);
  assert.match(html, /Dòng 4/);
  assert.match(html, /Dòng 8/);
  assert.match(html, /Giá phòng/);
  assert.match(html, /Mã phòng/);
  assert.match(html, /Hướng dẫn:/);
  assert.match(html, /Vui lòng kiểm tra lại file Excel\./);
});

test("formatAlertErrorMessage handles multiline bullet lists", () => {
  const bulletError = `Dữ liệu không hợp lệ:
- Họ tên không được để trống
- Số CMND/CCCD phải có 12 chữ số
Vui lòng kiểm tra lại.`;

  const html = formatAlertErrorMessage(bulletError);
  assert.match(html, /Dữ liệu không hợp lệ/);
  assert.match(html, /Họ tên không được để trống/);
  assert.match(html, /Số CMND\/CCCD phải có 12 chữ số/);
  assert.match(html, /Hướng dẫn:/);
  assert.match(html, /Vui lòng kiểm tra lại\./);
});

test("formatAlertErrorMessage handles semicolon-separated items", () => {
  const semiError =
    "Họ tên không được để trống; Ngày sinh không hợp lệ; Số phòng chưa chọn.";

  const html = formatAlertErrorMessage(semiError);
  assert.match(html, /Họ tên không được để trống/);
  assert.match(html, /Ngày sinh không hợp lệ/);
  assert.match(html, /Số phòng chưa chọn/);
});

test("formatAlertErrorMessage handles simple single messages without card clutter", () => {
  const simple = "Khách sạn chưa cấu hình kết nối KBTT.";
  const html = formatAlertErrorMessage(simple);
  assert.match(html, /text-center text-base font-medium/);
  assert.match(html, /Khách sạn chưa cấu hình kết nối KBTT\./);
  // No declaration cards or guidance
  assert.equal(html.includes("Bản khai báo"), false);
  assert.equal(html.includes("Hướng dẫn:"), false);
});

test("extractErrorMessage handles strings, Error objects, and structured payloads", () => {
  assert.equal(extractErrorMessage("Lỗi kết nối"), "Lỗi kết nối");
  assert.equal(extractErrorMessage(new Error("Lỗi mạng")), "Lỗi mạng");
  assert.equal(extractErrorMessage({ message: "Lỗi dữ liệu" }), "Lỗi dữ liệu");
  assert.equal(extractErrorMessage({ detail: "Chi tiết lỗi" }), "Chi tiết lỗi");
  assert.equal(extractErrorMessage(null), "Đã xảy ra lỗi không xác định. Vui lòng thử lại.");
});
