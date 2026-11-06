process.env.NODE_ENV = "test";
process.env.PORT ??= "8080";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/vietsage_auth";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-with-at-least-32-characters";
process.env.JWT_ACCESS_TTL ??= "15m";
process.env.JWT_REFRESH_TTL ??= "30d";

import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";
import { GuestStayStatus } from "@prisma/client";

function fixture() {
  const departure = new Date("2099-11-07T05:00:00Z");
  const stay = { id: "stay", hotelId: "hotel", status: GuestStayStatus.ACTIVE,
    plannedCheckOutAt: departure, hotel: { tenantId: "tenant" } };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "stay" }]),
    guestStay: { findFirst: jest.fn().mockResolvedValue(stay), update: jest.fn().mockResolvedValue(stay) },
    guestStayOccupant: { updateMany: jest.fn() },
    domainEvent: { create: jest.fn() },
  };
  const repository = new HotelRoomsRepository({ $transaction: (fn: (arg: typeof tx) => unknown) => fn(tx) } as never);
  return { repository, tx, stay, departure };
}

describe("stay extension transaction", () => {
  it.each([GuestStayStatus.CHECKED_OUT, GuestStayStatus.CANCELLED])(
    "rejects a departure change when the locked stay is already %s", async (status) => {
      const f = fixture();
      f.tx.guestStay.findFirst.mockResolvedValue({ ...f.stay, status });
      await expect(f.repository.updateStay("hotel", "stay", {
        plannedCheckOutAt: new Date("2099-11-08T05:00:00Z"), guestDisplayName: "Changed name",
      })).rejects.toThrow("Không thể gia hạn lượt lưu trú đã kết thúc");
      expect(f.tx.guestStay.update).not.toHaveBeenCalled();
      expect(f.tx.guestStayOccupant.updateMany).not.toHaveBeenCalled();
      expect(f.tx.domainEvent.create).not.toHaveBeenCalled();
    },
  );
  it("rejects shortening against locked current stay before any write", async () => {
    const f = fixture();
    await expect(f.repository.updateStay("hotel", "stay", {
      plannedCheckOutAt: new Date("2099-11-06T05:00:00Z"), guestDisplayName: "Changed name",
    })).rejects.toThrow("Thời gian gia hạn phải sau hạn trả phòng hiện tại");
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.guestStay.update).not.toHaveBeenCalled();
    expect(f.tx.guestStayOccupant.updateMany).not.toHaveBeenCalled();
    expect(f.tx.domainEvent.create).not.toHaveBeenCalled();
  });
  it("keeps same-date requests idempotent without a delivery event", async () => {
    const f = fixture();
    await f.repository.updateStay("hotel", "stay", { plannedCheckOutAt: f.departure });
    expect(f.tx.guestStay.update).toHaveBeenCalledTimes(1);
    expect(f.tx.domainEvent.create).not.toHaveBeenCalled();
  });
  it("emits a confirmed future extension with its prior departure", async () => {
    const f = fixture();
    const desired = new Date("2099-11-08T05:00:00Z");
    f.tx.guestStay.update.mockResolvedValue({ ...f.stay, plannedCheckOutAt: desired });
    await f.repository.updateStay("hotel", "stay", { plannedCheckOutAt: desired });
    expect(f.tx.domainEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      eventType: "GUEST_STAY_DEPARTURE_CHANGED", payload: expect.objectContaining({
        previousPlannedCheckOutAt: f.departure.toISOString(), plannedCheckOutAt: desired.toISOString(), wasOverdue: false,
      }),
    }) }));
  });
  it("rejects a new departure still in the past without writes", async () => {
    const f = fixture();
    f.tx.guestStay.findFirst.mockResolvedValue({ ...f.stay, plannedCheckOutAt: new Date("2000-01-01T00:00:00Z") });
    await expect(f.repository.updateStay("hotel", "stay", { plannedCheckOutAt: new Date("2000-01-02T00:00:00Z") })).rejects.toThrow("Thời gian gia hạn phải ở tương lai");
    expect(f.tx.guestStay.update).not.toHaveBeenCalled();
    expect(f.tx.domainEvent.create).not.toHaveBeenCalled();
  });
});
