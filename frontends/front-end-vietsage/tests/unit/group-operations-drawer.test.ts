import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const frontendRoot = path.resolve(import.meta.dirname, "../..");

type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (spec: string, ctx: unknown) => unknown,
) => unknown;

const moduleWithHooks = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: ResolveHook }) => void;
};

moduleWithHooks.registerHooks?.({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const baseTarget = path.join(frontendRoot, "src", specifier.slice(2));
      for (const candidate of [
        baseTarget,
        `${baseTarget}.ts`,
        `${baseTarget}.tsx`,
        path.join(baseTarget, "index.ts"),
      ]) {
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

describe("GroupOperationsDrawer & listGroupArrivals integration", () => {
  it("maps CHECKED_IN rooms with activeStayId from group details endpoint in listGroupArrivals", async () => {
    const { staffRoomsRepository } = (await import(
      pathToFileURL(
        path.join(frontendRoot, "src/features/hotel-ops/repositories/staff-rooms-repository.ts"),
      ).href
    )) as typeof import("@/features/hotel-ops/repositories/staff-rooms-repository");

    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            groupCode: "GRP-2026-99",
            leadGuestName: "Đoàn VietSage",
            leadGuestPhone: "0901234567",
            checkInDate: "2026-10-27T07:00:00.000Z",
            checkOutDate: "2026-10-29T05:00:00.000Z",
            rooms: [
              {
                id: "res-1",
                reservationCode: "VS-R001",
                status: "CHECKED_IN",
                guestDisplayName: "Nguyễn Văn A",
                guestPhone: "0901111222",
                assignedRoomId: "room-101",
                assignedRoomNumber: "101",
                roomTypeId: "rt-deluxe",
                roomTypeName: "Deluxe",
                guestCount: 2,
                ratePerNight: 1200000,
                totalAmount: 2400000,
                depositAmount: 500000,
                activeStayId: "stay-active-101",
              },
              {
                id: "res-2",
                reservationCode: "VS-R002",
                status: "ARRIVAL_READY",
                guestDisplayName: "Trần Thị B",
                assignedRoomId: "room-102",
                assignedRoomNumber: "102",
                roomTypeId: "rt-deluxe",
                roomTypeName: "Deluxe",
                guestCount: 2,
                ratePerNight: 1200000,
                activeStayId: null,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      const items = await staffRoomsRepository.listGroupArrivals("hotel-1", "GRP-2026-99");
      assert.ok(
        requestedUrl.includes("/api/hotel-ops/hotels/hotel-1/reservations/groups/GRP-2026-99"),
      );
      assert.equal(items.length, 2);
      assert.equal(items[0].id, "res-1");
      assert.equal(items[0].status, "CHECKED_IN");
      assert.equal(items[0].activeStayId, "stay-active-101");
      assert.equal(items[0].roomId, "room-101");
      assert.equal(items[0].room?.roomNumber, "101");
      assert.equal(items[0].roomTypeName, "Deluxe");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("populates activeStayId on GroupOperationsDrawer items from fetchedArrivals and supports batch check-out", () => {
    const drawerSource = readFileSync(
      path.join(
        frontendRoot,
        "src/features/hotel-ops/components/group-operations-drawer.tsx",
      ),
      "utf8",
    );

    assert.ok(
      drawerSource.includes("activeStayId: item.activeStayId ?? existing?.activeStayId ?? undefined"),
      "Expected GroupOperationsDrawer to map activeStayId from fetchedArrivals",
    );
    assert.ok(
      drawerSource.includes("const targetStayId = item.activeStayId || item.stayId"),
      "Expected handleBatchCheckOut to use activeStayId or stayId",
    );
  });
});
