import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
const repoSource = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
const resourceSource = readFileSync(new URL("./resource.ts", import.meta.url), "utf8");
const uiSource = readFileSync(
  new URL("./components/localmate-guides-view.tsx", import.meta.url),
  "utf8",
);
const bffSource = readFileSync(
  new URL("../../app/api/admin/localmate/route.ts", import.meta.url),
  "utf8",
);

test("LocalMate BFF supports pricing config query and update", () => {
  assert.match(
    bffSource,
    /action:\s*z\.literal\("updatePricingConfig"\)/,
  );
  assert.match(
    bffSource,
    /localMatePlatformFeeRate:\s*z\.coerce\.number\(\)\.min\(0\)\.max\(100\)/,
  );
  assert.match(
    bffSource,
    /actionParam === "pricingConfig"/,
  );
  assert.match(
    bffSource,
    /case "updatePricingConfig":/,
  );
});

test("LocalMate types include pricing config interfaces", () => {
  assert.match(typesSource, /export type LocalMatePricingConfig/);
  assert.match(typesSource, /localMatePlatformFeeRate:\s*number\s*\|\s*string/);
  assert.match(typesSource, /export type UpdateLocalMatePricingConfigInput/);
  assert.match(typesSource, /pricingConfig\?:\s*LocalMatePricingConfig/);
});

test("LocalMate client and repository expose pricing config operations", () => {
  assert.match(clientSource, /getPricingConfig:\s*\(token:\s*string\)/);
  assert.match(clientSource, /updatePricingConfig:\s*\(token:\s*string/);
  assert.match(clientSource, /"\/localmate-admin\/pricing-config"/);

  assert.match(repoSource, /pricingConfig:\s*async\s*\(\)/);
  assert.match(repoSource, /updatePricingConfig:\s*async\s*\(localMatePlatformFeeRate:/);
});

test("LocalMate resource includes query and mutation", () => {
  assert.match(resourceSource, /pricingConfig:\s*defineQuery\(/);
  assert.match(resourceSource, /updatePricingConfig:\s*defineMutation\(/);
});

test("LocalMate UI provides dedicated pricing button, modal, revenue breakdown and SwalVietSage", () => {
  // Dedicated button in toolbar
  assert.match(uiSource, /Biểu phí nền tảng/);
  assert.match(uiSource, /Cấu hình biểu phí LocalMate/);

  // Revenue breakdown: VietSage online payment vs Guide collection
  assert.match(uiSource, /VietSage thu trước \(Stripe\)/);
  assert.match(uiSource, /HDV thu trực tiếp từ khách/);
  assert.match(uiSource, /100 - feeRateInput/);

  // SweetAlert2 usage
  assert.match(uiSource, /SwalVietSage\.fire/);
  assert.match(uiSource, /Cập nhật biểu phí thành công/);
});
