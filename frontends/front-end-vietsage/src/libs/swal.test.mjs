import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeHtml,
  formatAlertErrorMessage,
  formatBatchResultHtml,
  formatTextContent,
} from "./swal.ts";

test("swal formatBatchResultHtml renders metrics, room badges, guest names, and scroll container", () => {
  const html = formatBatchResultHtml({
    total: 17,
    success: 0,
    failed: 17,
    errors: [
      {
        room: "1054",
        name: "Bùi Hồng Hạnh",
        message: "Hồ sơ của lần lưu trú này đã gửi BCA và tạm thời không thể gửi lại.",
      },
      {
        room: "1078",
        name: "MIA SCHNEIDER",
        message: "Bản khai báo 1: quốc tịch DEU không tồn tại trong hệ thống",
      },
    ],
    itemTypeLabel: "khách",
    guidance: "Vui lòng kiểm tra lại thông tin.",
  });

  assert.ok(html.includes("Thành công"), "Must show Thành công stat card");
  assert.ok(html.includes("Lỗi / Từ chối"), "Must show Lỗi stat card");
  assert.ok(html.includes("Tổng cộng"), "Must show Tổng cộng stat card");
  assert.ok(html.includes("Phòng 1054"), "Must show Room 1054 badge");
  assert.ok(html.includes("Bùi Hồng Hạnh"), "Must show Guest Name");
  assert.ok(html.includes("MIA SCHNEIDER"), "Must show Guest Name");
  assert.ok(html.includes("DEU"), "Must highlight country code DEU");
  assert.ok(html.includes("custom-scrollbar"), "Must provide custom scrollbar");
  assert.ok(html.includes("Hướng dẫn:"), "Must render guidance section");
});

test("swal formatAlertErrorMessage automatically detects raw batch summary string and renders elegant batch result HTML", () => {
  const rawBatchError = `Thành công: 0/17 khách.

Lỗi:
Phòng 1054 (Bùi Hồng Hạnh) : Hồ sơ của lần lưu trú này đã gửi BCA và tạm thời không thể gửi lại.
Phòng 1055 (Hồ Tiến Phong): Hồ sơ của lần lưu trú này đã gửi BCA và tạm thời không thể gửi lại.
Phòng 1078 (MIA SCHNEIDER) : Bản khai báo 1: quốc tịch DEU không tồn tại trong hệ thống`;

  const html = formatAlertErrorMessage(rawBatchError);

  assert.ok(html.includes("Thành công"), "Must detect success metric");
  assert.ok(html.includes("Phòng 1054"), "Must parse room 1054 badge");
  assert.ok(html.includes("Bùi Hồng Hạnh"), "Must parse guest name Bùi Hồng Hạnh");
  assert.ok(html.includes("MIA SCHNEIDER"), "Must parse guest name MIA SCHNEIDER");
  assert.ok(!html.includes("Chi tiết<"), "Must not fall back to unformatted Chi tiết blob");
});

test("swal formatAlertErrorMessage formats simple messages and preserves guidance", () => {
  const msgWithGuidance = "Số giấy tờ không được để trống. Vui lòng nhập đầy đủ CCCD hoặc hộ chiếu.";
  const html = formatAlertErrorMessage(msgWithGuidance);

  assert.ok(html.includes("Số giấy tờ không được để trống"), "Must render error text");
  assert.ok(html.includes("Hướng dẫn:"), "Must render guidance label");
  assert.ok(html.includes("Vui lòng nhập đầy đủ"), "Must render guidance content");
});
