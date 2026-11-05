import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RoomQRCodeStatus } from "@prisma/client";
import { HotelAccessService } from "../../property/application/hotel-access.service";
import { HotelRoomsService } from "../../property/application/hotel-rooms.service";
import { HotelRequestsService } from "../../guest-operations/application/hotel-requests.service";
import { HotelStaffAssignmentsRepository } from "../../property/infrastructure/repositories/hotel-staff-assignments.repository";
import { housekeepingScopeSchema } from "../../property/domain/schemas/hotel-staff-assignments.schema";
import { HousekeepingService } from "../application/housekeeping.service";
import { HousekeepingRepository } from "../infrastructure/repositories/housekeeping.repository";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

const floorScope = { mode: "FLOORS" as const, floors: ["1"], roomIds: [], label: null };
const allScope = { mode: "ALL" as const, floors: [], roomIds: [], label: null };

function accessSetup(scope: unknown = floorScope) {
  const repository = {
    findActorById: jest.fn().mockResolvedValue({ id: "staff", userRoles: [{ role: { code: "CUSTOM_CLEANER", baseRole: { code: "HOTEL_HOUSEKEEPING" } } }],
      tenantUsers: [{ tenantId: "tenant" }], hotelAssignments: [{ hotelId: "hotel" }] }),
    findHotelById: jest.fn().mockResolvedValue({ id: "hotel", tenantId: "tenant", staffScopeMode: "HOTEL_WIDE" }),
    findHousekeepingAssignment: jest.fn().mockResolvedValue({ housekeepingScope: scope }),
    findHousekeepingScopeRooms: jest.fn().mockResolvedValue([{ id: "room-101" }]),
    findRoomById: jest.fn().mockResolvedValue({ id: "room-201", hotelId: "hotel" }),
  };
  return { repository, access: new HotelAccessService(repository as never) };
}

describe("Housekeeping responsibility boundary", () => {
  it("resolves custom housekeeping role floor scope using current hotel rooms", async () => {
    const { access, repository } = accessSetup();
    await expect(access.resolveHousekeepingScope("staff", "role", "hotel")).resolves.toEqual({ ...floorScope, allowedRoomIds: ["room-101"] });
    expect(repository.findHousekeepingScopeRooms).toHaveBeenCalledWith("hotel", floorScope);
  });

  it("preserves existing null scope as hotel wide", async () => {
    const { access, repository } = accessSetup(null);
    await expect(access.resolveHousekeepingScope("staff", "role", "hotel")).resolves.toEqual({ ...allScope, allowedRoomIds: null });
    expect(repository.findHousekeepingScopeRooms).not.toHaveBeenCalled();
  });

  it("denies a missing or revoked assignment", async () => {
    const { access, repository } = accessSetup();
    repository.findHousekeepingAssignment.mockResolvedValue(null);
    await expect(access.resolveHousekeepingScope("staff", "role", "hotel")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("fails closed for malformed stored scope", async () => {
    const { access } = accessSetup({ mode: "ROOMS", roomIds: [] });
    await expect(access.resolveHousekeepingScope("staff", "role", "hotel")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects another hotel and tenant before reading responsibility", async () => {
    const { access, repository } = accessSetup();
    repository.findHotelById.mockResolvedValue({ id: "other-hotel", tenantId: "other-tenant", staffScopeMode: "HOTEL_WIDE" });
    await expect(access.resolveHousekeepingScope("staff", "role", "other-hotel")).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findHousekeepingAssignment).not.toHaveBeenCalled();
  });

  it("legacy room access rejects an otherwise valid room outside assigned floor", async () => {
    const { access } = accessSetup();
    await expect(access.assertRoomAccess("staff", "role", "hotel", "room-201")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generic room scope retains effective responsibility and synchronous object access fails closed", async () => {
    const { access } = accessSetup();
    const scope = await access.resolveRoomScope("staff", "role", "hotel");
    expect(scope.allowedRoomIds).toEqual(["room-101"]);
    expect(() => access.assertRoomAccess(scope, "room-201")).toThrow(NotFoundException);
    expect(() => access.assertRoomAccess(scope, "room-101")).not.toThrow();
    expect(() => access.assertRoomAccess({ ...scope, allowedRoomIds: [] }, "room-101")).toThrow(NotFoundException);
  });

  it("generic room scope denies invalid stored responsibility instead of becoming hotel wide", async () => {
    const { access } = accessSetup({ mode: "ROOMS", floors: [], roomIds: [] });
    await expect(access.resolveRoomScope("staff", "role", "hotel")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("generic room list preserves responsibility together with status/search/unassigned filters", async () => {
    const { access } = accessSetup();
    const repository = { listRooms: jest.fn().mockResolvedValue({ items: [], total: 0, floors: [], types: [] }),
      listAssignedRoomIds: jest.fn().mockResolvedValue(["room-101"]) };
    const service = new HotelRoomsService(repository as never, {} as never, access);
    await service.listRooms("staff", "role", "hotel", { page: 1, limit: 20, status: "AVAILABLE", q: "101", unassignedOnly: true });
    expect(repository.listRooms).toHaveBeenCalledWith(expect.objectContaining({ hotelId: "hotel", id: { in: ["room-101"], notIn: ["room-101"] }, AND: expect.any(Array) }), 0, 20);
  });

  it("generic request detail and mutations reject outside the room set before returning or writing", async () => {
    const { access } = accessSetup();
    const repository = { findRequestDetailInHotel: jest.fn().mockResolvedValue({ id: "request", roomId: "room-201" }), updateRequestStatus: jest.fn() };
    const service = new HotelRequestsService(repository as never, access);
    await expect(service.getRequestDetail("staff", "role", "hotel", "request")).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateRequestStatus).not.toHaveBeenCalled();
  });

  it("rejects empty and conflicting responsibility selections", () => {
    expect(housekeepingScopeSchema.safeParse({ ...floorScope, floors: [] }).success).toBe(false);
    expect(housekeepingScopeSchema.safeParse({ ...allScope, roomIds: ["room"] }).success).toBe(false);
    expect(housekeepingScopeSchema.safeParse({ mode: "ROOMS", floors: [], roomIds: ["room"], label: "Khu A" }).success).toBe(true);
  });
});

describe("Housekeeping assignment writes", () => {
  it("kicks the user's active socket only after successfully revoking the hotel assignment", async () => {
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const repository = new HotelStaffAssignmentsRepository({ hotelStaffAssignment: { updateMany } } as never);
    const invalidate = jest.spyOn(RequestRealtimeEmitter, "invalidateOwnerScope").mockImplementation(() => undefined);
    await expect(repository.revoke("hotel", "staff", "owner")).resolves.toEqual({ count: 1 });
    expect(invalidate).toHaveBeenCalledWith("hotel", "staff");
    expect(invalidate).toHaveBeenCalledTimes(1);
    await expect(repository.revoke("hotel", "staff", "owner")).resolves.toEqual({ count: 0 });
    expect(invalidate).toHaveBeenCalledTimes(1);
    invalidate.mockRestore();
  });

  function setup() {
    const tx = {
      hotelStaffAssignment: { findFirst: jest.fn().mockResolvedValue({ id: "assignment" }), update: jest.fn().mockResolvedValue({ id: "assignment" }) },
      room: { findMany: jest.fn().mockResolvedValue([{ id: "room-101", floor: "1" }]) },
      auditLog: { create: jest.fn() },
    };
    const repository = new HotelStaffAssignmentsRepository({ $transaction: async (callback) => callback(tx) } as never);
    return { tx, repository };
  }

  it("requires active hotel, tenant membership, user and canonical/custom housekeeping role", async () => {
    const { tx, repository } = setup();
    tx.hotelStaffAssignment.findFirst.mockResolvedValue(null);
    await expect(repository.updateHousekeepingScope("hotel", "staff", "owner", "tenant", floorScope)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.hotelStaffAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hotelId: "hotel", userId: "staff", status: "ACTIVE",
      user: expect.objectContaining({ status: "ACTIVE", tenantUsers: { some: { tenantId: "tenant", status: "ACTIVE" } }, userRoles: expect.any(Object) }) }) }));
    expect(tx.hotelStaffAssignment.update).not.toHaveBeenCalled();
  });

  it.each([
    { ...floorScope, floors: ["2"] },
    { mode: "ROOMS" as const, floors: [], roomIds: ["other-hotel-room"], label: "Khu B" },
  ])("rejects floor/room not returned from the target hotel", async (scope) => {
    const { tx, repository } = setup();
    await expect(repository.updateHousekeepingScope("hotel", "staff", "owner", "tenant", scope)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.hotelStaffAssignment.update).not.toHaveBeenCalled();
  });

  it("persists a named area and audit event within the transaction", async () => {
    const { tx, repository } = setup();
    const invalidate = jest.spyOn(RequestRealtimeEmitter, "invalidateOwnerScope").mockImplementation(() => {
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });
    const scope = { mode: "ROOMS" as const, floors: [], roomIds: ["room-101"], label: "Khu A" };
    await repository.updateHousekeepingScope("hotel", "staff", "owner", "tenant", scope);
    expect(tx.hotelStaffAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { housekeepingScope: scope } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant", action: "HOTEL_HOUSEKEEPING_SCOPE_UPDATED" }) }));
    expect(invalidate).toHaveBeenCalledWith("hotel", "staff");
    invalidate.mockRestore();
  });
});

describe("Housekeeping task and QR access", () => {
  const room = { id: "room-101", hotelId: "hotel", roomNumber: "101", floor: "1", status: "PROCESSING", updatedAt: new Date(), roomType: { name: "Standard" } };

  it("denies completion before any transition outside responsibility", async () => {
    const repository = { findById: jest.fn().mockResolvedValue({ roomId: "room-201" }), completeTask: jest.fn() };
    const access = { assertHotelAccess: jest.fn(), assertHousekeepingRoomAccess: jest.fn().mockRejectedValue(new NotFoundException()) };
    const service = new HousekeepingService(repository as never, access as never);
    await expect(service.completeTask("staff", "role", "hotel", "task", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.completeTask).not.toHaveBeenCalled();
  });

  it("filters list and summary by effective room IDs", async () => {
    const repository = { listTasks: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }), getSummary: jest.fn() };
    const access = { resolveHousekeepingScope: jest.fn().mockResolvedValue({ ...floorScope, allowedRoomIds: ["room-101"] }) };
    const service = new HousekeepingService(repository as never, access as never);
    await service.listTasks("staff", "role", "hotel", { page: 1, limit: 20 });
    await service.getTasksSummary("staff", "role", "hotel");
    expect(repository.listTasks).toHaveBeenCalledWith("hotel", expect.objectContaining({ allowedRoomIds: ["room-101"] }), 1, 20);
    expect(repository.getSummary).toHaveBeenCalledWith("hotel", ["room-101"]);
  });

  it("only resolves active, unrevoked and unexpired public QR codes", async () => {
    const prisma = { roomQRCode: { findFirst: jest.fn().mockResolvedValue({ room }) } };
    const repository = new HousekeepingRepository(prisma as never);
    await expect(repository.findRoomByQr("qr-code")).resolves.toEqual(room);
    expect(prisma.roomQRCode.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ publicCode: "qr-code", status: RoomQRCodeStatus.ACTIVE, revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }) }));
  });

  it("returns minimal QR room data after checking hotel and assigned room", async () => {
    const repository = { findRoomByQr: jest.fn().mockResolvedValue(room) };
    const access = { assertHousekeepingRoomAccess: jest.fn() };
    const service = new HousekeepingService(repository as never, access as never);
    await expect(service.getRoomByQr("staff", "role", "qr")).resolves.toEqual({ id: room.id, hotelId: room.hotelId, roomNumber: "101", floor: "1", status: "PROCESSING", updatedAt: room.updatedAt.toISOString(), roomTypeName: "Standard" });
    expect(access.assertHousekeepingRoomAccess).toHaveBeenCalledWith("staff", "role", "hotel", "room-101");
  });

  it("denies QR from another scope and rejects missing/expired QR", async () => {
    const repository = { findRoomByQr: jest.fn().mockResolvedValue(room) };
    const access = { assertHousekeepingRoomAccess: jest.fn().mockRejectedValue(new NotFoundException()) };
    const service = new HousekeepingService(repository as never, access as never);
    await expect(service.getRoomByQr("staff", "role", "qr")).rejects.toBeInstanceOf(NotFoundException);
    repository.findRoomByQr.mockResolvedValue(null as never);
    await expect(service.getRoomByQr("staff", "role", "expired")).rejects.toBeInstanceOf(NotFoundException);
  });
});
