process.env.NODE_ENV = "test";
process.env.PORT ||= "8080";
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/vietsage_auth";
process.env.JWT_ACCESS_SECRET ||= "replace-with-local-docker-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET ||= "replace-with-local-docker-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL ||= "15m";
process.env.JWT_REFRESH_TTL ||= "30d";

import { FolioItemType, GuestStayStatus, Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { calculateReservationChargeTotal } from "../../../common/pricing/reservation-charge-total";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";

type LedgerLine = {
  id: string; lineType: "ROOM_NIGHT" | "EXTRA"; serviceDate: Date | null;
  quantity: number; unitPriceSnapshot: Prisma.Decimal; totalSnapshot: Prisma.Decimal;
  taxAmountSnapshot: Prisma.Decimal; discountAmountSnapshot: Prisma.Decimal; currency: string;
};
const line = (id: string, date: string | null, amount: number): LedgerLine => ({
  id, lineType: date ? "ROOM_NIGHT" : "EXTRA", serviceDate: date ? new Date(`${date}T07:00:00Z`) : null,
  quantity: 1, unitPriceSnapshot: new Prisma.Decimal(amount), totalSnapshot: new Prisma.Decimal(amount),
  taxAmountSnapshot: new Prisma.Decimal(0), discountAmountSnapshot: new Prisma.Decimal(0), currency: "VND",
});

describe("room plan stay price projection", () => {
  const folioItem = (itemType: FolioItemType, amount: number) => ({
    itemType, nameSnapshot: itemType, quantity: 1,
    unitPriceSnapshot: new Prisma.Decimal(amount),
    totalSnapshot: new Prisma.Decimal(amount),
    discountAmountSnapshot: new Prisma.Decimal(itemType === FolioItemType.DISCOUNT ? Math.abs(amount) : 0),
  });
  const room = {
    id: "room-1", roomNumber: "1007", floor: "10", roomTypeId: "rt-1",
    roomType: { name: "Single", basePrice: new Prisma.Decimal(900000) },
    price: new Prisma.Decimal(900000), status: RoomStatus.OCCUPIED,
  };
  const dates = {
    plannedCheckInAt: new Date("2030-11-01T07:00:00Z"),
    plannedCheckOutAt: new Date("2030-11-03T05:00:00Z"),
  };
  async function project(rate: number | null, charges: LedgerLine[], items: ReturnType<typeof folioItem>[] = []) {
    const stay = {
      id: "stay-1", reservationId: "res-1", roomId: room.id, room,
      ...dates, checkedInAt: dates.plannedCheckInAt, checkedOutAt: null,
      status: GuestStayStatus.ACTIVE, reservationCode: "VSH_RESERVATION_0112",
      nightlyRateSnapshot: rate == null ? null : new Prisma.Decimal(rate),
      baseNightlyRateSnapshot: rate == null ? null : new Prisma.Decimal(rate),
      guestDisplayName: "Agreed price", guestPhone: null, occupants: [],
      updatedAt: new Date("2030-11-01T07:00:00Z"),
      reservation: { groupCode: "VSH_GROUP_0018", chargeLines: charges },
      folios: [{ items }],
    };
    const prisma = {
      room: { findMany: jest.fn().mockResolvedValue([room]) },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      guestStay: { findMany: jest.fn().mockResolvedValueOnce([stay]).mockResolvedValueOnce([]) },
    };
    const result = await new ReservationsRepository(prisma as never).getRoomPlan({
      hotelId: "hotel-1", from: dates.plannedCheckInAt, to: dates.plannedCheckOutAt,
    });
    return result.blocks.find((block) => block.stayId === stay.id);
  }

  it("keeps dated agreed room prices and includes posted extras once after check-in", async () => {
    const block = await project(500000, [
      line("first", "2030-11-01", 500000), line("second", "2030-11-02", 700000),
      line("breakfast", null, 70000),
    ], [folioItem(FolioItemType.SERVICE, 70000)]);
    expect(block).toMatchObject({ roomSubtotal: 1200000, serviceSubtotal: 70000, totalAmount: 1270000 });
    expect(block?.services).toHaveLength(1);
  });

  it("uses posted room charges, services and adjustments ahead of the original reservation quote", async () => {
    const block = await project(500000, [
      line("first", "2030-11-01", 500000), line("second", "2030-11-02", 700000),
      line("breakfast", null, 70000),
    ], [
      folioItem(FolioItemType.ROOM_CHARGE, 1100000), folioItem(FolioItemType.SERVICE, 90000),
      folioItem(FolioItemType.MANUAL_CHARGE, 30000), folioItem(FolioItemType.DISCOUNT, -20000),
    ]);
    expect(block).toMatchObject({ roomSubtotal: 1100000, serviceSubtotal: 100000, totalAmount: 1200000 });
  });

  it("preserves a free stay even when the current room price is nonzero", async () => {
    const block = await project(0, []);
    expect(block).toMatchObject({
      nightlyRate: 0, nightlyRateSnapshot: "0", roomSubtotal: 0, serviceSubtotal: 0, totalAmount: 0,
    });
  });

  it("rejects a stay without agreed prices instead of projecting the current room price", async () => {
    await expect(project(null, [])).rejects.toThrow("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
  });
});

function harness(rate: number | null = 500, initialLines = [
  line("first", "2026-11-01", 500), line("second", "2026-11-02", 700), line("extra", null, 70),
]) {
  let lines = [...initialLines];
  let reservation = {
    id: "res-1", hotelId: "hotel-1", roomId: null as string | null,
    room: { price: new Prisma.Decimal(900) }, roomTypeId: "rt-1",
    status: ReservationStatus.CONFIRMED, guestDisplayName: "Pricing regression",
    plannedCheckInAt: new Date("2026-11-01T07:00:00Z"),
    plannedCheckOutAt: new Date("2026-11-03T05:00:00Z"),
    nightlyRateSnapshot: rate == null ? null : new Prisma.Decimal(rate),
    baseNightlyRateSnapshot: rate == null ? null : new Prisma.Decimal(rate),
    updatedAt: new Date("2026-10-31T00:00:00Z"),
  };
  const tx = {
    $queryRawUnsafe: jest.fn(),
    reservation: {
      findFirst: jest.fn(async ({ where }) => where.id === "res-1" ? reservation : null),
      update: jest.fn(async ({ data }) => {
        reservation = { ...reservation, ...data };
        return { ...reservation, chargeLines: [...lines] };
      }),
      findUniqueOrThrow: jest.fn(async () => ({ ...reservation, chargeLines: [...lines] })),
    },
    room: { findFirst: jest.fn(async () => ({
      id: "room-2", status: RoomStatus.AVAILABLE, price: new Prisma.Decimal(900), roomTypeId: "rt-1",
    })) },
    guestStay: { findFirst: jest.fn(async () => null) },
    hotel: { findUnique: jest.fn(async () => ({ timezone: "Asia/Ho_Chi_Minh" })) },
    auditLog: { create: jest.fn(async () => ({ id: "audit-1" })) },
    reservationChargeLine: {
      findMany: jest.fn(async ({ where }) => lines.filter((entry) => !where.lineType || entry.lineType === where.lineType)),
      deleteMany: jest.fn(async ({ where }) => {
        lines = where.id ? lines.filter((entry) => !where.id.in.includes(entry.id)) : [];
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }) => {
        lines = lines.map((entry) => entry.id === where.id ? { ...entry, ...data } : entry);
        return lines.find((entry) => entry.id === where.id);
      }),
      createMany: jest.fn(async ({ data }: { data: Omit<LedgerLine, "id">[] }) => {
        lines.push(...data.map((entry, index) => ({ ...entry, id: `new-${index}` })));
        return { count: data.length };
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) };
  return { tx, repository: new ReservationsRepository(prisma as never) };
}
const input = {
  hotelId: "hotel-1", tenantId: "tenant-1", reservationId: "res-1", actorUserId: "actor-1",
  expectedUpdatedAt: "2026-10-31T00:00:00Z",
};

describe("reservation price and ledger synchronization", () => {
  it("keeps custom dated prices during a same-rate/name edit", async () => {
    const { tx, repository } = harness();
    const result = await repository.updateReservation({ ...input, guestDisplayName: "Renamed", nightlyRateSnapshot: 500 });
    expect(calculateReservationChargeTotal(result).totalAmount.toNumber()).toBe(1270);
    expect(tx.reservationChargeLine.deleteMany).not.toHaveBeenCalled();
    expect(tx.reservationChargeLine.createMany).not.toHaveBeenCalled();
  });

  it("returns the new zero-rate ledger immediately and preserves extras", async () => {
    const { repository } = harness();
    const result = await repository.updateReservation({ ...input, nightlyRateSnapshot: 0 });
    expect(result.chargeLines.filter((entry) => entry.lineType === "ROOM_NIGHT")).toHaveLength(2);
    expect(calculateReservationChargeTotal(result).totalAmount.toNumber()).toBe(70);
  });

  it("replaces retained night prices when the dates endpoint changes the agreed flat rate", async () => {
    const { repository } = harness();
    const result = await repository.updateReservationDates({ ...input, nightlyRateSnapshot: 800 });
    expect(calculateReservationChargeTotal(result).roomSubtotal.toNumber()).toBe(1600);
    expect(result.chargeLines.find((entry) => entry.id === "extra")).toBeDefined();
  });

  it("extends sparse prices from the agreement rather than the changed room list price", async () => {
    const { repository } = harness(500, [line("override", "2026-11-01", 700)]);
    const result = await repository.updateReservationDates({ ...input, endDate: "2026-11-04" });
    expect(calculateReservationChargeTotal(result).roomSubtotal.toNumber()).toBe(1700);
  });

  it("rejects extension without an agreed snapshot instead of using the current room price", async () => {
    const { repository, tx } = harness(null, [line("first", "2026-11-01", 700)]);
    await expect(repository.updateReservationDates({ ...input, endDate: "2026-11-04" }))
      .rejects.toThrow("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
    expect(tx.reservationChargeLine.createMany).not.toHaveBeenCalled();
  });

  it("preserves a fully dated free schedule without a scalar snapshot", async () => {
    const { repository } = harness(null, [line("first", "2026-11-01", 0), line("second", "2026-11-02", 0)]);
    const result = await repository.updateReservationDates(input);
    expect(calculateReservationChargeTotal(result).totalAmount.toNumber()).toBe(0);
  });

  it("honors explicit dated charge lines on the dates endpoint", async () => {
    const { repository } = harness();
    const result = await repository.updateReservationDates({ ...input, chargeLines: [400, 900].map((amount, index) => ({
      lineType: "ROOM_NIGHT", serviceDate: `2026-11-0${index + 1}T07:00:00Z`, nameSnapshot: "Agreed night",
      quantity: 1, unitPriceSnapshot: amount, totalSnapshot: amount,
      taxAmountSnapshot: 0, discountAmountSnapshot: 0, currency: "VND",
    })) });
    expect(calculateReservationChargeTotal(result).totalAmount.toNumber()).toBe(1300);
  });

  it("assignment with an explicit free rate synchronizes all booked nights", async () => {
    const { repository } = harness();
    const result = await repository.assignRoom({ ...input, roomId: "room-2", nightlyRateSnapshot: 0 });
    if (result === null) throw new Error("Assignment must return the updated reservation");
    expect(result.roomId).toBe("room-2");
    expect(calculateReservationChargeTotal(result).roomSubtotal.toNumber()).toBe(0);
  });

  it("preserves undated agreed night prices when moving dates without a scalar snapshot", async () => {
    const undated = [line("first", "2026-11-01", 500), line("second", "2026-11-02", 700)]
      .map((entry) => ({ ...entry, serviceDate: null }));
    const { repository } = harness(null, undated);
    const result = await repository.updateReservationDates({
      ...input, startDate: "2026-11-02", endDate: "2026-11-04",
    });
    expect(calculateReservationChargeTotal(result).roomSubtotal.toNumber()).toBe(1200);
    expect(result.chargeLines.map((entry) => entry.serviceDate?.toISOString()))
      .toEqual(["2026-11-02T07:00:00.000Z", "2026-11-03T07:00:00.000Z"]);
  });
});
