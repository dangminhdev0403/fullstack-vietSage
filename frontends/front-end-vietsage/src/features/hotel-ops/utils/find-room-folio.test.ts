import assert from "node:assert/strict";
import test from "node:test";
import type { FolioListItem } from "@/features/billing/types/billing-contract";
// @ts-expect-error Node strip-types requires explicit extensions.
import { findRoomFolio } from "./find-room-folio.ts";

function folio(id: string, roomId: string, status = "OPEN"): FolioListItem {
  return { id, status, room: { id: roomId }, subtotal: 0, tax: 0, discount: 0, total: 0, itemCount: 0 };
}

test("finds a target after page one without selecting another room's folio", async () => {
  const pages: number[] = [];
  const result = await findRoomFolio("target", async (page) => {
    pages.push(page);
    return { page, limit: 1, total: 2, totalPages: 2, items: [folio(`folio-${page}`, page === 1 ? "other" : "target", "CHECKOUT_PENDING")] };
  });
  assert.equal(result?.id, "folio-2");
  assert.deepEqual(pages, [1, 2]);
});

test("returns no match only after all pages and ignores closed folios", async () => {
  assert.equal(await findRoomFolio("target", async (page) => ({
    page, limit: 100, total: 1, totalPages: 1, items: [folio("closed", "target", "CLOSED")],
  })), null);
});

test("incomplete pagination rejects rather than claiming the room has no bill", async () => {
  await assert.rejects(findRoomFolio("target", async (page) => ({
    page, limit: 100, total: 200, totalPages: 2, items: [],
  })), /Incomplete/);
});
