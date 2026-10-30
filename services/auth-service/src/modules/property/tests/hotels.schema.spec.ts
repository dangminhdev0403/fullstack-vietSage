import { createStayBodySchema } from "../domain/schemas/rooms.schema";

describe("hotel stay schemas", () => {
  it("accepts the optional reservation code used for linked and group stays", () => {
    const result = createStayBodySchema.safeParse({
      roomId: "room-1",
      reservationCode: "RSV-001",
      guestDisplayName: "Nguyen Van A",
      plannedCheckInAt: "2026-06-10T07:00:00.000Z",
      plannedCheckOutAt: "2026-06-12T05:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reservationCode).toBe("RSV-001");
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
