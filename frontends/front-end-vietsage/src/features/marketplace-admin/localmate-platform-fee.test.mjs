import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("./marketplace-admin-client.tsx", import.meta.url), "utf8");
const bffSource = readFileSync(
  new URL("../../app/api/admin/marketplace/route.ts", import.meta.url),
  "utf8",
);

test("admin BFF accepts partial LocalMate pricing updates", () => {
  assert.match(
    bffSource,
    /localMatePlatformFeeRate:\s*z\.number\(\)\.min\(0\)\.max\(100\)\.optional\(\)/,
  );
  assert.match(
    bffSource,
    /deliveryServiceFeeRate:\s*z\.number\(\)\.min\(0\)\.max\(100\)\.optional\(\)/,
  );
});

test("types include localMatePlatformFeeRate and updated action input", () => {
  assert.match(typesSource, /localMatePlatformFeeRate\?:/);
  assert.match(typesSource, /action:\s*"updatePricingConfig"/);
  assert.match(typesSource, /localMatePlatformFeeRate\?:\s*number/);
});

test("client supports partial pricing config update with localMatePlatformFeeRate", () => {
  assert.match(
    clientSource,
    /updatePricingConfig:\s*\(token:\s*string,\s*body:\s*Partial<MarketplacePricingConfig>\)/,
  );
  assert.match(clientSource, /"PATCH",\s*"\/admin\/marketplace\/pricing-config"/);
});

test("UI component labels VietSage revenue and explains edits affect new orders only", () => {
  // VietSage revenue collected before guide handoff
  assert.match(
    uiSource,
    /Doanh thu VietSage thu trước khi bàn giao hướng dẫn viên \(guide\)/,
  );
  // Edits affect new orders only
  assert.match(
    uiSource,
    /Thay đổi chỉ áp dụng cho các đơn hàng mới/,
  );
  assert.match(
    uiSource,
    /VietSage revenue collected before guide handoff;\s*edits affect new orders only/,
  );
});

test("UI retains zero rate without truthy fallback overwriting valid zero", () => {
  // Check that current localMate fee uses nullish check, not truthy fallback (e.g. not || 15)
  assert.match(
    uiSource,
    /pricingConfig\?\.localMatePlatformFeeRate != null\s*\?\s*Number\(pricingConfig\.localMatePlatformFeeRate\)\s*:\s*15/,
  );
  assert.doesNotMatch(
    uiSource,
    /pricingConfig\?\.localMatePlatformFeeRate\s*\|\|\s*15/,
  );

  // Validate mapping runtime helper behavior
  const extractFee = (pricingConfig) =>
    pricingConfig?.localMatePlatformFeeRate != null
      ? Number(pricingConfig.localMatePlatformFeeRate)
      : 15;

  assert.equal(extractFee({ localMatePlatformFeeRate: 0 }), 0);
  assert.equal(extractFee({ localMatePlatformFeeRate: "0.00" }), 0);
  assert.equal(extractFee({ localMatePlatformFeeRate: 15 }), 15);
  assert.equal(extractFee({ localMatePlatformFeeRate: "15.00" }), 15);
  assert.equal(extractFee({}), 15);
  assert.equal(extractFee(null), 15);
  assert.equal(extractFee(undefined), 15);
});

test("UI preserves delivery fee independently and uses SwalVietSage", () => {
  assert.match(uiSource, /pricing-delivery-service-fee-rate/);
  assert.match(uiSource, /deliveryServiceFeeRate/);
  assert.match(uiSource, /SwalVietSage\.fire/);
});

test("UI validates 0..100 inclusive range for fee rates", () => {
  assert.match(uiSource, /deliveryVal < 0 \|\| deliveryVal > 100/);
  assert.match(uiSource, /localMateVal < 0 \|\| localMateVal > 100/);
});
