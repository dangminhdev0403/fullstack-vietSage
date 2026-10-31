import { calculateReservationChargeTotal } from "./reservation-charge-total";

const booking = {
  plannedCheckInAt: new Date("2026-11-01T07:00:00Z"),
  plannedCheckOutAt: new Date("2026-11-04T05:00:00Z"),
  nightlyRateSnapshot: 500,
};
const night = (date: string, total: number) => ({
  lineType: "ROOM_NIGHT", serviceDate: `${date}T07:00:00Z`, totalSnapshot: total,
});

describe("authoritative reservation quote", () => {
  it("fills sparse dates using the agreed rate and adds extras once", () => {
    const quote = calculateReservationChargeTotal({ ...booking, chargeLines: [
      night("2026-11-02", 700), { lineType: "EXTRA", totalSnapshot: 70 },
    ] });
    expect(quote.roomSubtotal.toString()).toBe("1700");
    expect(quote.totalAmount.toString()).toBe("1770");
  });

  it("accepts a fully dated free booking with no scalar snapshot", () => {
    const input = { ...booking, nightlyRateSnapshot: null, room: { price: 9000 }, chargeLines: [
      night("2026-11-01", 0), night("2026-11-02", 0), night("2026-11-03", 0),
    ] };
    expect(calculateReservationChargeTotal(input).totalAmount.toString()).toBe("0");
  });

  it("rejects uncovered dates without an immutable agreed rate", () => {
    expect(() => calculateReservationChargeTotal({ ...booking, nightlyRateSnapshot: null,
      chargeLines: [night("2026-11-01", 700)],
    })).toThrow("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
  });

  it("ignores dated rates outside the booked date range", () => {
    expect(calculateReservationChargeTotal({ ...booking, chargeLines: [
      night("2026-10-31", 9999), night("2026-11-04", 9999),
    ] }).totalAmount.toString()).toBe("1500");
  });

  it("preserves undated positional prices and fills only their missing nights", () => {
    expect(calculateReservationChargeTotal({ ...booking, chargeLines: [
      { lineType: "ROOM_NIGHT", totalSnapshot: 0 },
      { lineType: "ROOM_NIGHT", totalSnapshot: 700 },
    ] }).totalAmount.toString()).toBe("1200");
  });

  it("preserves an explicit scalar zero", () => {
    expect(calculateReservationChargeTotal({ ...booking, nightlyRateSnapshot: 0 })
      .totalAmount.toString()).toBe("0");
  });

  it("does not add tax or discount metadata to final totals a second time", () => {
    expect(calculateReservationChargeTotal({ ...booking, chargeLines: [
      { ...night("2026-11-01", 900), taxAmountSnapshot: 90 },
      { ...night("2026-11-02", 1100), taxAmountSnapshot: 110 },
      night("2026-11-03", 0),
      { lineType: "EXTRA", totalSnapshot: 350, taxAmountSnapshot: 35 },
    ] }).totalAmount.toString()).toBe("2350");
  });

  it("rejects mixed currencies", () => {
    expect(() => calculateReservationChargeTotal({ ...booking, currency: "VND", chargeLines: [
      { lineType: "EXTRA", totalSnapshot: 10, currency: "USD" },
    ] })).toThrow("RESERVATION_CURRENCY_MISMATCH");
  });

  it("uses hotel-local dates across a daylight-saving boundary", () => {
    const quote = calculateReservationChargeTotal({
      plannedCheckInAt: new Date("2026-10-31T18:00:00Z"),
      plannedCheckOutAt: new Date("2026-11-02T17:00:00Z"),
      nightlyRateSnapshot: 500,
      chargeLines: [{ lineType: "ROOM_NIGHT", serviceDate: "2026-11-01T04:00:00Z", totalSnapshot: 700 }],
    }, "America/New_York");
    expect(quote.nights).toBe(2);
    expect(quote.totalAmount.toString()).toBe("1200");
  });
});
