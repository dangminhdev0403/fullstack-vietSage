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

describe("BookingConfirmationModal & StaffRoomsResource query-resource integration", () => {
  it("exposes reservationConfirmation, groupConfirmation, bookingPayments, and receivables on staffRoomsResource.queries", async () => {
    const { staffRoomsResource } = (await import(
      pathToFileURL(
        path.join(frontendRoot, "src/features/hotel-ops/resources/staff-rooms-resource.ts"),
      ).href
    )) as typeof import("@/features/hotel-ops/resources/staff-rooms-resource");

    const singleOpts = staffRoomsResource.queries.reservationConfirmation.options({
      hotelId: "hotel-1",
      reservationId: "res-101",
    });
    assert.ok(Array.isArray(singleOpts.queryKey));
    assert.equal(typeof singleOpts.queryFn, "function");
    assert.ok(singleOpts.queryKey.includes("reservationConfirmation"));
    assert.ok(singleOpts.queryKey.includes("res-101"));

    const groupOpts = staffRoomsResource.queries.groupConfirmation.options({
      hotelId: "hotel-1",
      groupCode: "GRP-2026-01",
    });
    assert.ok(Array.isArray(groupOpts.queryKey));
    assert.equal(typeof groupOpts.queryFn, "function");
    assert.ok(groupOpts.queryKey.includes("groupConfirmation"));
    assert.ok(groupOpts.queryKey.includes("GRP-2026-01"));

    const paymentsOpts = staffRoomsResource.queries.bookingPayments.options({
      hotelId: "hotel-1",
      reservationId: "res-101",
    });
    assert.ok(Array.isArray(paymentsOpts.queryKey));
    assert.ok(paymentsOpts.queryKey.includes("bookingPayments"));

    const receivablesOpts = staffRoomsResource.queries.receivables.options({
      hotelId: "hotel-1",
      reservationId: "res-101",
    });
    assert.ok(Array.isArray(receivablesOpts.queryKey));
    assert.ok(receivablesOpts.queryKey.includes("receivables"));
  });

  it("uses staffRoomsResource.queries in booking-confirmation-modal.tsx instead of raw queryKey", () => {
    const modalSource = readFileSync(
      path.join(
        frontendRoot,
        "src/features/hotel-ops/components/booking-confirmation-modal.tsx",
      ),
      "utf8",
    );

    assert.ok(
      modalSource.includes("staffRoomsResource.queries.groupConfirmation.options"),
      "Expected BookingConfirmationModal to use staffRoomsResource.queries.groupConfirmation.options",
    );
    assert.ok(
      modalSource.includes("staffRoomsResource.queries.reservationConfirmation.options"),
      "Expected BookingConfirmationModal to use staffRoomsResource.queries.reservationConfirmation.options",
    );
    assert.ok(
      !modalSource.includes('queryKey: ["booking-confirmation"'),
      "Expected raw booking-confirmation queryKey to be removed",
    );
  });

  it("uses staffRoomsRepository methods in front-desk-arrival-detail-panel.tsx without direct requestInternalApiEnvelope calls", () => {
    const panelSource = readFileSync(
      path.join(
        frontendRoot,
        "src/features/hotel-ops/components/front-desk-arrival-detail-panel.tsx",
      ),
      "utf8",
    );

    assert.ok(!panelSource.includes("requestInternalApiEnvelope"));
    assert.ok(panelSource.includes("staffRoomsRepository.listBookingPayments"));
    assert.ok(panelSource.includes("staffRoomsRepository.createBookingPayment"));
    assert.ok(panelSource.includes("staffRoomsRepository.listReceivables"));
    assert.ok(panelSource.includes("staffRoomsRepository.transferStayToReceivable"));
    assert.ok(panelSource.includes("staffRoomsRepository.collectReceivable"));
  });

  it("implements getGroupDetails and updateGroupSharedFields on HotelOpsService", async () => {
    const { createHotelOpsService } = (await import(
      pathToFileURL(
        path.join(frontendRoot, "src/features/hotel-ops/service/hotel-ops-service.ts"),
      ).href
    )) as typeof import("@/features/hotel-ops/service/hotel-ops-service");
    const service = createHotelOpsService({ baseUrl: "http://localhost:4000" });
    assert.equal(typeof service.getGroupConfirmation, "function");
    assert.equal(typeof service.getGroupDetails, "function");
    assert.equal(typeof service.updateGroupSharedFields, "function");
  });
});
