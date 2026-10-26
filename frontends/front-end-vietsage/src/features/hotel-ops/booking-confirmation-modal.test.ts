import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("./components/booking-confirmation-modal.tsx", import.meta.url),
  "utf8",
);

test("BookingConfirmationModal complies with accessibility, dialog role and print styles", () => {
  // Modal dialog attributes
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-labelledby=/);

  // Print trigger
  assert.match(modalSource, /window\.print\(\)/);

  // Screen-only classes for actions
  assert.match(modalSource, /no-print/);
  assert.match(modalSource, /@media print/);

  // QR Code integration
  assert.match(modalSource, /QRCodeSVG/);

  // Sàn font >= 12px (không dùng font micro-classes)
  assert.doesNotMatch(modalSource, /text-\[10px\]/);
  assert.doesNotMatch(modalSource, /text-\[11px\]/);
  assert.doesNotMatch(modalSource, /text-\[9px\]/);

  // Typography balance & pretty copy
  assert.match(modalSource, /text-balance/);
  assert.match(modalSource, /text-pretty/);
  assert.match(modalSource, /whitespace-nowrap/);

  // Hospitality information completeness
  assert.match(modalSource, /checkInTime/);
  assert.match(modalSource, /checkOutTime/);
  assert.match(modalSource, /cancellationPolicy/);
  assert.match(modalSource, /policies\.terms/);
  assert.match(modalSource, /balanceAmount/);
  assert.match(modalSource, /nightlyBreakdown/);
});

test("BookingConfirmationPrintView handles both individual and group booking projections", () => {
  // Single reservation details
  assert.match(modalSource, /guestDisplayName/);
  assert.match(modalSource, /nights/);
  assert.match(modalSource, /roomSubtotal/);
  assert.match(modalSource, /paidAmount/);

  // Group booking details
  assert.match(modalSource, /totalRooms/);
  assert.match(modalSource, /leadGuestName/);
  assert.match(modalSource, /groupCode/);
  assert.match(modalSource, /Danh sách phòng đặt theo đoàn/);
});
