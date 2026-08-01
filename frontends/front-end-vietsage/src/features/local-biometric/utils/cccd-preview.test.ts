import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requires explicit extension.
import { buildCccdPreviewModel } from "./cccd-preview.ts";

test("CCCD Preview Model", async (t) => {
  await t.test("Full payload yields all fields in order", () => {
    const payload = {
      schemaVersion: 2 as const,
      transferId: "uuid",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "Nguyen Van A",
        identityNumber: "012345678912",
        dateOfBirth: "1990-01-01",
        gender: "Nam",
        nationality: "VN",
        race: "Kinh",
        residencePlace: "Hanoi",
        identityIssueDate: "2021-01-01",
        identityExpiryDate: "2031-01-01"
      },
      verification: {
        chipAuthenticated: true,
        sodVerified: false
      },
      portrait: {
        mimeType: "image/jpeg" as const,
        base64: "base64data"
      }
    };
    
    const now = new Date("2026-07-31T10:00:00Z");
    const model = buildCccdPreviewModel(payload, now);
    
    assert.equal(model.portraitDataUrl, "data:image/jpeg;base64,base64data");
    const labels = model.fields.map(f => f.label);
    
    assert.deepEqual(labels, [
      "Họ tên", "CCCD", "Ngày sinh", "Tuổi", "Giới tính", 
      "Quốc tịch", "Dân tộc", "Địa chỉ", "Ngày cấp", "Hết hạn", 
      "Giờ quét", "Xác thực chip", "Toàn vẹn SOD"
    ]);
    
    const chipField = model.fields.find(f => f.label === "Xác thực chip");
    assert.equal(chipField?.value, "Đạt");
    
    const sodField = model.fields.find(f => f.label === "Toàn vẹn SOD");
    assert.equal(sodField?.value, "Không đạt");
  });
  
  await t.test("Blank/missing optional fields yield no row", () => {
    const payload = {
      schemaVersion: 2 as const,
      transferId: "uuid",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "Nguyen Van A",
        identityNumber: "012345678912"
      }
    };
    
    const model = buildCccdPreviewModel(payload, new Date("2026-07-31T10:00:00Z"));
    const labels = model.fields.map(f => f.label);
    assert.deepEqual(labels, ["Họ tên", "CCCD", "Giờ quét"]);
    assert.equal(model.portraitDataUrl, null);
  });
  
  await t.test("Age calculated correctly", () => {
    const payload = {
      schemaVersion: 2 as const,
      transferId: "uuid",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "Nguyen Van A",
        identityNumber: "012345678912",
        dateOfBirth: "2000-08-01"
      }
    };
    
    // Before birthday
    let model = buildCccdPreviewModel(payload, new Date("2020-07-31T10:00:00Z"));
    assert.equal(model.fields.find(f => f.label === "Tuổi")?.value, "19");
    
    // After birthday
    model = buildCccdPreviewModel(payload, new Date("2020-08-02T10:00:00Z"));
    assert.equal(model.fields.find(f => f.label === "Tuổi")?.value, "20");
  });
});
