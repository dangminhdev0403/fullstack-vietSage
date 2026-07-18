import { NotFoundException } from "@nestjs/common";
import { GuestRequestStatus } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { HotelAccessService } from "../../property/application/hotel-access.service";
import { HotelCoreRepository } from "../../property/infrastructure/repositories/hotel-core.repository";
import { GuestOsService } from "../application/guest-os.service";
import { HotelRequestsService } from "../application/hotel-requests.service";
import { GuestOsRepository } from "../infrastructure/repositories/guest-os.repository";
import { HotelRequestsRepository } from "../infrastructure/repositories/hotel-requests.repository";
import {
  createQaSimulationPrisma,
  HotelSimulationFixture,
  provisionHotelSimulation,
  QA_SIM_PREFIX,
  QA_SIM_ROOM_COUNT,
} from "./fixtures/hotel-simulation.fixture";

const databaseUrl = process.env.QA_HOTEL_SIM_DATABASE_URL?.trim();
const describeWithQaDatabase = databaseUrl ? describe : describe.skip;

describeWithQaDatabase("local production-like hotel request simulation", () => {
  const prisma = createQaSimulationPrisma(databaseUrl ?? "postgresql://qa-simulation.invalid/skip");
  const logger = new AppLogger();
  const guestRepository = new GuestOsRepository(prisma as never);
  const guestService = new GuestOsService(guestRepository, logger);
  const hotelAccessService = new HotelAccessService(new HotelCoreRepository(prisma as never));
  const ownerService = new HotelRequestsService(
    new HotelRequestsRepository(prisma as never),
    hotelAccessService,
  );
  let fixture: HotelSimulationFixture;

  beforeAll(async () => {
    await prisma.$connect();
    fixture = await provisionHotelSimulation(prisma);
  });

  afterAll(async () => {
    if (process.env.QA_HOTEL_SIM_KEEP_DATA !== "1") {
      await prisma.tenant.deleteMany({ where: { id: `${QA_SIM_PREFIX}_TENANT` } });
    }
    await prisma.$disconnect();
  });

  it("creates concurrent requests after independent checked-in guests scan active room QRs", async () => {
    const scans = await Promise.all(
      fixture.primaryRooms.map((room, index) =>
        guestService.scanQr({ qrCode: room.qrCode, deviceFingerprint: `qa-device-${index}` }, {
          headers: { "user-agent": "qa-hotel-simulation" },
          ip: `127.0.0.${index + 1}`,
        } as never),
      ),
    );
    const contexts = await Promise.all(
      scans.map((scan) => guestService.authenticateGuestToken(scan.sessionToken)),
    );

    const created = await Promise.all(
      contexts.map((context, index) =>
        guestService.createRequest(context, {
          serviceItemId: fixture.serviceItemId,
          quantity: (index % 3) + 1,
          description: `${QA_SIM_PREFIX} concurrent request ${index}`,
        }),
      ),
    );

    expect(created).toHaveLength(QA_SIM_ROOM_COUNT);
    expect(new Set(created.map((request) => request.id)).size).toBe(QA_SIM_ROOM_COUNT);
    const persisted = await prisma.guestRequest.findMany({
      where: { id: { in: created.map((request) => request.id) } },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    expect(persisted).toHaveLength(QA_SIM_ROOM_COUNT);
    for (const request of persisted) {
      expect(request.status).toBe(GuestRequestStatus.CREATED);
      expect(request.events).toHaveLength(1);
      expect(request.events[0]).toMatchObject({
        actorType: "GUEST",
        eventType: "REQUEST_CREATED",
        fromStatus: null,
        toStatus: GuestRequestStatus.CREATED,
      });
    }

    const ownerQueue = await ownerService.listRequests(
      fixture.ownerUserId,
      fixture.primaryHotelId,
      { limit: 20 },
    );
    expect(ownerQueue.total).toBe(QA_SIM_ROOM_COUNT);
    expect(ownerQueue.items.every((request) => request.roomNumber.startsWith("QA-A-"))).toBe(true);

    const lifecycleTarget = created[0];
    await ownerService.updateRequestStatus(
      fixture.ownerUserId,
      fixture.primaryHotelId,
      lifecycleTarget.id,
      { status: "ACKNOWLEDGED", note: `${QA_SIM_PREFIX} acknowledged` },
    );
    await ownerService.updateRequestStatus(
      fixture.ownerUserId,
      fixture.primaryHotelId,
      lifecycleTarget.id,
      { status: "IN_PROGRESS", note: `${QA_SIM_PREFIX} started` },
    );
    await ownerService.updateRequestStatus(
      fixture.ownerUserId,
      fixture.primaryHotelId,
      lifecycleTarget.id,
      { status: "COMPLETED", note: `${QA_SIM_PREFIX} completed` },
    );

    const completed = await prisma.guestRequest.findUniqueOrThrow({
      where: { id: lifecycleTarget.id },
      include: { events: { orderBy: { createdAt: "asc" } }, billingFolioItem: true },
    });
    expect(completed.status).toBe(GuestRequestStatus.COMPLETED);
    expect(completed.events.map((event) => event.toStatus)).toEqual([
      GuestRequestStatus.CREATED,
      GuestRequestStatus.ACKNOWLEDGED,
      GuestRequestStatus.IN_PROGRESS,
      GuestRequestStatus.COMPLETED,
    ]);
    expect(completed.billingFolioItem).toMatchObject({ quantity: completed.quantity });
  });

  it("enforces owner hotel scoping and guest stay isolation", async () => {
    const secondaryScan = await guestService.scanQr(
      { qrCode: fixture.secondaryRoom.qrCode, deviceFingerprint: "qa-secondary-device" },
      { headers: {}, ip: "127.0.1.1" } as never,
    );
    const secondaryContext = await guestService.authenticateGuestToken(secondaryScan.sessionToken);

    await expect(
      guestService.createRequest(secondaryContext, {
        serviceItemId: fixture.serviceItemId,
        quantity: 1,
      }),
    ).rejects.toThrow("Service item is not available");

    const primaryScan = await guestService.scanQr(
      { qrCode: fixture.primaryRooms[0].qrCode, deviceFingerprint: "qa-scope-primary" },
      { headers: {}, ip: "127.0.1.2" } as never,
    );
    const primaryContext = await guestService.authenticateGuestToken(primaryScan.sessionToken);
    const primaryRequest = await guestService.createRequest(primaryContext, {
      serviceItemId: fixture.serviceItemId,
      quantity: 1,
      description: `${QA_SIM_PREFIX} owner scope target`,
    });
    await expect(
      ownerService.getRequestDetail(
        fixture.ownerUserId,
        fixture.secondaryHotelId,
        primaryRequest.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const isolatedScans = await Promise.all(
      fixture.primaryRooms.slice(1, 3).map((room, index) =>
        guestService.scanQr({ qrCode: room.qrCode, deviceFingerprint: `qa-isolation-${index}` }, {
          headers: {},
          ip: `127.0.2.${index + 1}`,
        } as never),
      ),
    );
    const [firstContext, secondContext] = await Promise.all(
      isolatedScans.map((scan) => guestService.authenticateGuestToken(scan.sessionToken)),
    );
    const isolatedRequest = await guestService.createRequest(firstContext, {
      serviceItemId: fixture.serviceItemId,
      quantity: 1,
      description: `${QA_SIM_PREFIX} isolation target`,
    });
    await expect(
      guestService.cancelRequest(secondContext, isolatedRequest.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    const secondGuestList = await guestService.listRequests(secondContext, { limit: 20 });
    expect(secondGuestList.items.every((request) => request.id !== isolatedRequest.id)).toBe(true);
  });

  it("preserves current double-submit contract as two independent atomic requests", async () => {
    const scan = await guestService.scanQr(
      { qrCode: fixture.primaryRooms[3].qrCode, deviceFingerprint: "qa-double-submit" },
      { headers: {}, ip: "127.0.3.1" } as never,
    );
    const context = await guestService.authenticateGuestToken(scan.sessionToken);
    const payload = {
      serviceItemId: fixture.serviceItemId,
      quantity: 2,
      description: `${QA_SIM_PREFIX} intentional double submit`,
    };

    const [first, second] = await Promise.all([
      guestService.createRequest(context, payload),
      guestService.createRequest(context, payload),
    ]);
    expect(first.id).not.toBe(second.id);
    await expect(
      prisma.guestRequestEvent.count({
        where: { requestId: { in: [first.id, second.id] }, eventType: "REQUEST_CREATED" },
      }),
    ).resolves.toBe(2);
  });
});
