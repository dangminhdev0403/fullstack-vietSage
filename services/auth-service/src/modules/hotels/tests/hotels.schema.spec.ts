import { createStayBodySchema } from "../schemas/hotels.schema";

describe("hotel stay schemas", () => {
  it("rejects reservationCode in create stay requests", () => {
    const result = createStayBodySchema.safeParse({
      roomId: "room-1",
      reservationCode: "RSV-001",
      guestDisplayName: "Nguyen Van A",
      plannedCheckInAt: "2026-06-10T07:00:00.000Z",
      plannedCheckOutAt: "2026-06-12T05:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects guestPhoneMasked in create stay requests", () => {
    const result = createStayBodySchema.safeParse({
      roomId: "room-1",
      guestPhoneMasked: "******1234",
      guestDisplayName: "Nguyen Van A",
      plannedCheckInAt: "2026-06-10T07:00:00.000Z",
      plannedCheckOutAt: "2026-06-12T05:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});
