import { KbttRepository } from "../infrastructure/kbtt.repository";

describe("durable BCA token cooldown selection", () => {
  it("selects only enabled temporary disconnects after 60 seconds with a bounded oldest-first batch", async () => {
    const findMany = jest.fn().mockResolvedValue([{ hotelId: "hotel-a" }]);
    const repository = new KbttRepository({ kbttHotelConnection: { findMany } } as never);
    await expect(repository.findHotelsForTokenRecovery(new Date("2026-11-19T00:01:00Z"))).resolves.toEqual([{ hotelId: "hotel-a" }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { autoSubmitEnabled: true, status: "DISCONNECTED", lastErrorCode: "KBTT_TEMP_DISCONNECTED", lastCheckedAt: { lte: new Date("2026-11-19T00:00:00Z") } },
      select: { hotelId: true }, orderBy: [{ lastCheckedAt: "asc" }, { hotelId: "asc" }], take: 100,
    });
  });
  it("does not turn a database failure into an empty successful recovery scan", async () => {
    const repository = new KbttRepository({ kbttHotelConnection: { findMany: jest.fn().mockRejectedValue(new Error("offline")) } } as never);
    await expect(repository.findHotelsForTokenRecovery()).rejects.toMatchObject({ response: { code: "KBTT_UNAVAILABLE" } });
  });
});
