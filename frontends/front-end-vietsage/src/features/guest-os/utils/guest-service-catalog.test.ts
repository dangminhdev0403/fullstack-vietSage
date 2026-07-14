import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { adaptGuestServiceCatalog } from "./guest-service-catalog.ts";

test("adapts effective pricing while preserving category and item order", () => {
  const result = adaptGuestServiceCatalog({
    hotelId: "hotel-a",
    categories: [
      {
        id: "cat-2",
        hotelId: "hotel-a",
        name: "Dining",
        description: null,
        sortOrder: 20,
        status: "ACTIVE",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        items: [
          {
            id: "item-2",
            name: "Tea",
            description: null,
            effectivePrice: "45000",
            effectiveCurrency: "VND",
            quantityEnabled: true,
            minQuantity: 2,
            maxQuantity: 5,
          },
          {
            id: "item-1",
            name: "Water",
            description: null,
            effectivePrice: null,
            effectiveCurrency: "VND",
            quantityEnabled: false,
            minQuantity: 1,
            maxQuantity: null,
          },
        ],
      },
      {
        id: "cat-empty",
        hotelId: "hotel-a",
        name: "Empty",
        description: "No services",
        sortOrder: 30,
        status: "ACTIVE",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        items: [],
      },
    ],
  });

  assert.deepEqual(result.categories.map((category) => category.id), ["cat-2"]);
  assert.deepEqual(result.categories[0]?.items.map((item) => item.id), ["item-2", "item-1"]);
  assert.equal(result.categories[0]?.items[0]?.price, "45000");
  assert.equal(result.categories[0]?.items[0]?.currency, "VND");
  assert.equal(result.categories[0]?.items[0]?.minQuantity, 2);
});
