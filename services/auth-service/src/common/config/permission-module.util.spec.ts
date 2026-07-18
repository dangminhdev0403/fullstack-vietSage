import { resolveModuleKeyFromPath } from "./permission-module.util";

describe("reservation permission module mapping", () => {
  it.each([
    "/hotels/:hotelId/reservations",
    "/hotels/:hotelId/arrivals",
    "/hotels/:hotelId/reservations/:reservationId/room",
    "/hotels/:hotelId/reservations/:reservationId/check-in",
  ])("maps %s to hotel-reservations", (path) => {
    expect(resolveModuleKeyFromPath(path)).toBe("hotel-reservations");
  });

  it("preserves the existing generic hotels module", () => {
    expect(resolveModuleKeyFromPath("/hotels/:hotelId/rooms")).toBe("hotels");
  });
});
