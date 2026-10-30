import { EmergencyCallLifecycleStatus, EmergencyIncidentStatus, Prisma } from "@prisma/client";
import { EmergencyRepository } from "../infrastructure/repositories/emergency.repository";

describe("EmergencyRepository regression guards", () => {
  const location = {
    id: "location-1",
    tenantId: "tenant-1",
    hotelId: "hotel-1",
    usableForEmergencyRouting: true,
  };

  it.each([
    ["same tenant and hotel", location, true],
    ["foreign tenant", { ...location, tenantId: "tenant-2" }, false],
    ["other hotel", { ...location, hotelId: "hotel-2" }, false],
    ["disabled location", { ...location, usableForEmergencyRouting: false }, false],
    ["missing location", null, false],
  ])("scopes explicit lookup: %s", async (_name, candidate, allowed) => {
    const findFirst = jest.fn(({ where }: { where: typeof location }) =>
      Promise.resolve(
        candidate &&
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof typeof candidate] === value,
          )
          ? candidate
          : null,
      ),
    );
    const repository = new EmergencyRepository({ emergencyLocation: { findFirst } } as never);
    await expect(repository.findLocation("location-1", "tenant-1", "hotel-1")).resolves.toEqual(
      allowed ? candidate : null,
    );
    expect(findFirst).toHaveBeenCalledWith({ where: location });
  });

  it.each(
    Object.values(EmergencyIncidentStatus).flatMap((status) =>
      [false, true].map((high) => ({ status, high })),
    ),
  )("preserves or escalates $status with high severity=$high", async ({ status, high }) => {
    let currentStatus = status;
    const updateMany = jest.fn(
      ({
        where,
        data,
      }: {
        where: { status: { in: EmergencyIncidentStatus[] } };
        data: { status: EmergencyIncidentStatus };
      }) => {
        const matches = where.status.in.includes(currentStatus);
        if (matches) currentStatus = data.status;
        return Promise.resolve({ count: matches ? 1 : 0 });
      },
    );
    const update = jest.fn(({ data }: { data: Prisma.EmergencyIncidentUpdateInput }) =>
      Promise.resolve({ ...data, status: currentStatus }),
    );
    const repository = new EmergencyRepository({
      emergencyCallEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "call-1",
            roomId: "room-1",
            sessionId: "session-1",
            lifecycleStatus: high
              ? EmergencyCallLifecycleStatus.FAILED
              : EmergencyCallLifecycleStatus.CONNECTED,
            locationUncertain: false,
          },
        ]),
      },
      emergencyIncident: { updateMany, update },
    } as never);
    const result = await repository.refreshIncidentRollup("incident-1");
    expect(result.status).toBe(
      high && status !== EmergencyIncidentStatus.RESOLVED
        ? EmergencyIncidentStatus.ESCALATING
        : status,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "incident-1" },
      data: expect.objectContaining({
        callCount: 1,
        connectedCallCount: high ? 0 : 1,
        failedCallCount: high ? 1 : 0,
      }),
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
    if (high) {
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: "incident-1",
          status: {
            in: [
              EmergencyIncidentStatus.OPEN,
              EmergencyIncidentStatus.REOPENED,
              EmergencyIncidentStatus.ACKNOWLEDGED,
              EmergencyIncidentStatus.MONITORING,
            ],
          },
        },
        data: { status: EmergencyIncidentStatus.ESCALATING },
      });
    } else {
      expect(updateMany).not.toHaveBeenCalled();
    }
  });
});
