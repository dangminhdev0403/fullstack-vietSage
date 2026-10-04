import { ChannexBookingIngestionService } from "./services/channex-booking-ingestion.service";

const modified = {
  id: "revision-1",
  type: "booking_revision",
  attributes: {
    booking_id: "booking-1",
    property_id: "property-1",
    status: "modified" as const,
    arrival_date: "2026-10-15",
    departure_date: "2026-10-17",
    amount: "100.00",
    currency: "VND",
  },
};

describe("Channex booking reconciliation/recovery", () => {
  let prisma: any;
  let client: any;
  let service: ChannexBookingIngestionService;

  beforeEach(() => {
    prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findFirst: jest.fn().mockResolvedValueOnce({ hotelId: "hotel-1" }).mockResolvedValue({
          localId: "reservation-1",
          metadata: {},
        }),
      },
      channelSyncLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    };
    client = {
      ackBookingRevision: jest.fn().mockResolvedValue({ data: {} }),
      getBookings: jest.fn(),
    };
    service = new ChannexBookingIngestionService(prisma, client);
  });

  it("does not ack a modified revision when its actionable record cannot be persisted", async () => {
    prisma.channelSyncLog.create.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(service.processSingleRevision(modified)).rejects.toThrow("db unavailable");
    expect(client.ackBookingRevision).not.toHaveBeenCalled();
  });

  it("deduplicates a repeated modified revision without closing its pending reconciliation", async () => {
    const first = await service.processSingleRevision(modified);
    prisma.channexMapping.findFirst.mockResolvedValue({
      hotelId: "hotel-1",
      localId: "reservation-1",
    });
    prisma.channelSyncLog.findFirst.mockResolvedValue({ id: "log-1", status: "WARNING" });
    const repeated = await service.processSingleRevision(modified);
    expect(first.action).toBe("RECONCILIATION_REQUIRED");
    expect(repeated.action).toBe("RECONCILIATION_REQUIRED");
    expect(prisma.channelSyncLog.create).toHaveBeenCalledTimes(1);
    expect(client.ackBookingRevision).not.toHaveBeenCalled();
  });

  it("acks a modified revision only after reconciliation is resolved", async () => {
    prisma.channelSyncLog.findFirst.mockResolvedValue({ id: "log-1", status: "RESOLVED" });
    expect(await service.processSingleRevision(modified)).toEqual({
      action: "MODIFIED",
      reservationId: "reservation-1",
    });
    expect(prisma.channelSyncLog.create).not.toHaveBeenCalled();
    expect(client.ackBookingRevision).toHaveBeenCalledWith("revision-1", undefined);
  });

  it("reports unresolved modifications without claiming feed drain complete", async () => {
    client.getBookingFeed = jest.fn().mockResolvedValue({ data: [modified], meta: { total: 1 } });
    const result = await service.drainFeed({ hotelId: "hotel-1" });
    expect(result).toEqual(expect.objectContaining({ success: false, modifiedBookingsCount: 1 }));
    expect(client.ackBookingRevision).not.toHaveBeenCalled();
  });

  it("does not report success when feed exceeds the bounded drain", async () => {
    client.getBookingFeed = jest.fn().mockResolvedValue({ data: [modified], meta: { total: 2 } });
    jest.spyOn(service, "processSingleRevision").mockResolvedValue({ action: "MODIFIED" });
    const result = await service.drainFeed({ hotelId: "hotel-1" });
    expect(result.success).toBe(false);
    expect(client.getBookingFeed).toHaveBeenCalledTimes(20);
  });

  it("does not close reconciliation before its revision is processed", async () => {
    prisma.channelSyncLog.findMany.mockResolvedValue([]);
    expect(await service.getPendingModifications("hotel-1")).toEqual([]);
  });

  it("fails closed when reconciliation details are malformed", async () => {
    prisma.channelSyncLog.findMany.mockResolvedValue([
      { id: "broken-json", details: "{" },
      { id: "wrong-shape", details: JSON.stringify({ bookingId: 1 }) },
    ]);
    await expect(service.getPendingModifications("hotel-1")).rejects.toThrow(
      "Dữ liệu đối soát booking không hợp lệ",
    );
  });

  it("lists unresolved modifications and resolves only a log belonging to this hotel", async () => {
    prisma.channelSyncLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        hotelId: "hotel-1",
        status: "WARNING",
        details: JSON.stringify({ bookingId: "booking-1", revisionId: "revision-1" }),
      },
    ]);
    expect(await service.getPendingModifications("hotel-1")).toEqual([
      expect.objectContaining({ id: "log-1", bookingId: "booking-1", revisionId: "revision-1" }),
    ]);
    prisma.channelSyncLog.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await expect(service.resolveModification("hotel-2", "log-1")).rejects.toThrow();
    await expect(service.resolveModification("hotel-1", "log-1")).resolves.toEqual({
      success: true,
    });
    expect(prisma.channelSyncLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: "log-1",
        hotelId: "hotel-1",
        syncType: "CHANNEX_INBOUND_BOOKING_MODIFIED",
        status: "WARNING",
      },
      data: { status: "RESOLVED" },
    });
  });

  it("recovers every page, not only the first 100 bookings", async () => {
    const booking = (id: string) => ({ id, attributes: { ...modified.attributes, status: "new" } });
    client.getBookings
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => booking(`b-${i}`)),
        meta: { total: 101, page: 1, limit: 100 },
      })
      .mockResolvedValueOnce({
        data: [booking("b-100")],
        meta: { total: 101, page: 2, limit: 100 },
      });
    jest.spyOn(service, "processSingleRevision").mockResolvedValue({ action: "CREATED" });
    const result = await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");
    expect(result).toEqual(
      expect.objectContaining({ success: true, totalChecked: 101, recoveredCount: 101 }),
    );
    expect(client.getBookings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ "pagination[page]": "2" }),
      undefined,
    );
  });

  it("preserves a known booking status during outage recovery", async () => {
    client.getBookings.mockResolvedValue({
      data: [
        {
          id: "cancelled-booking",
          attributes: { ...modified.attributes, status: "cancelled" },
        },
      ],
      meta: { total: 1, page: 1 },
    });
    const process = jest
      .spyOn(service, "processSingleRevision")
      .mockResolvedValue({ action: "CANCELLED" });

    await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");

    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ status: "cancelled" }),
      }),
      undefined,
      false,
    );
  });

  it("does not claim complete recovery without provider pagination proof", async () => {
    client.getBookings.mockResolvedValue({
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `b-${i}`,
        attributes: modified.attributes,
      })),
    });
    jest.spyOn(service, "processSingleRevision").mockResolvedValue({ action: "CREATED" });
    const result = await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");
    expect(result.success).toBe(false);
    expect(result.totalChecked).toBe(100);
  });

  it("does not claim full recovery when a booking lacks dates", async () => {
    client.getBookings.mockResolvedValue({
      data: [{ id: "broken", attributes: { property_id: "property-1" } }],
      meta: { total: 1, page: 1 },
    });
    const result = await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");
    expect(result.success).toBe(false);
    expect(result.totalChecked).toBe(1);
  });

  it("does not ingest a booking belonging to a different property", async () => {
    client.getBookings.mockResolvedValue({
      data: [{ id: "foreign", attributes: { ...modified.attributes, property_id: "property-2" } }],
      meta: { total: 1, page: 1 },
    });
    const process = jest.spyOn(service, "processSingleRevision");
    const result = await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");
    expect(result.success).toBe(false);
    expect(process).not.toHaveBeenCalled();
  });

  it("does not loop forever or report success on a repeated page", async () => {
    client.getBookings.mockResolvedValue({
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `b-${i}`,
        attributes: modified.attributes,
      })),
      meta: { total: 200, page: 1, limit: 100 },
    });
    jest.spyOn(service, "processSingleRevision").mockResolvedValue({ action: "CREATED" });
    const result = await service.recoverOutage("hotel-1", "2026-10-01T00:00:00Z");
    expect(result.success).toBe(false);
    expect(client.getBookings).toHaveBeenCalledTimes(2);
  });
});
