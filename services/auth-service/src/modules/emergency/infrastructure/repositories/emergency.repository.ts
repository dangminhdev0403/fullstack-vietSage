import { Injectable } from "@nestjs/common";
import {
  EmergencyCallLifecycleStatus,
  EmergencyIncidentSeverity,
  EmergencyIncidentStatus,
  EmergencyLocationConfidence,
  EmergencyLocationSource,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

@Injectable()
export class EmergencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLocation(locationId: string) {
    return this.prisma.emergencyLocation.findUnique({ where: { id: locationId } });
  }

  findFallbackLocation(tenantId: string, hotelId?: string | null) {
    return this.prisma.emergencyLocation.findFirst({
      where: {
        tenantId,
        hotelId: hotelId ?? undefined,
        usableForEmergencyRouting: true,
      },
      orderBy: [{ lastValidatedAt: "desc" }, { createdAt: "asc" }],
    });
  }

  createCallEvent(data: Prisma.EmergencyCallEventUncheckedCreateInput) {
    return this.prisma.emergencyCallEvent.create({ data });
  }

  findOpenIncident(params: {
    tenantId: string;
    hotelId?: string | null;
    primaryLocationId?: string | null;
    since: Date;
  }) {
    return this.prisma.emergencyIncident.findFirst({
      where: {
        tenantId: params.tenantId,
        hotelId: params.hotelId ?? undefined,
        primaryLocationId: params.primaryLocationId ?? undefined,
        status: {
          in: [
            EmergencyIncidentStatus.OPEN,
            EmergencyIncidentStatus.ESCALATING,
            EmergencyIncidentStatus.ACKNOWLEDGED,
            EmergencyIncidentStatus.MONITORING,
          ],
        },
        lastActivityAt: { gte: params.since },
      },
      orderBy: { lastActivityAt: "desc" },
    });
  }

  createIncident(data: Prisma.EmergencyIncidentUncheckedCreateInput) {
    return this.prisma.emergencyIncident.create({ data });
  }

  async linkCallToIncident(callId: string, incidentId: string) {
    await this.prisma.emergencyCallEvent.update({ where: { id: callId }, data: { incidentId } });
  }

  async refreshIncidentRollup(incidentId: string) {
    const calls = await this.prisma.emergencyCallEvent.findMany({ where: { incidentId } });
    const rooms = new Set(calls.map((call) => call.roomId).filter(Boolean));
    const callers = new Set(calls.map((call) => call.callerReference ?? call.sessionId ?? call.id));
    const floors = new Set(
      calls
        .map((call) => {
          const metadata = call.metadata as { roomFloor?: string } | null;
          return metadata?.roomFloor;
        })
        .filter(Boolean),
    );
    const failed = calls.filter(
      (call) => call.lifecycleStatus === EmergencyCallLifecycleStatus.FAILED,
    ).length;
    const abandoned = calls.filter(
      (call) => call.lifecycleStatus === EmergencyCallLifecycleStatus.ABANDONED,
    ).length;
    const connected = calls.filter(
      (call) => call.lifecycleStatus === EmergencyCallLifecycleStatus.CONNECTED,
    ).length;
    const locationUncertain = calls.some((call) => call.locationUncertain);
    const severity = this.calculateSeverity({
      callCount: calls.length,
      roomCount: rooms.size,
      floorCount: floors.size,
      failed,
      abandoned,
      locationUncertain,
    });

    return this.prisma.emergencyIncident.update({
      where: { id: incidentId },
      data: {
        callCount: calls.length,
        uniqueCallerCount: callers.size,
        uniqueRoomCount: rooms.size,
        uniqueFloorCount: floors.size,
        failedCallCount: failed,
        abandonedCallCount: abandoned,
        connectedCallCount: connected,
        locationUncertain,
        severity,
        status:
          severity === EmergencyIncidentSeverity.HIGH ||
          severity === EmergencyIncidentSeverity.CRITICAL
            ? EmergencyIncidentStatus.ESCALATING
            : EmergencyIncidentStatus.OPEN,
        lastActivityAt: new Date(),
      },
    });
  }

  createTimeline(
    incidentId: string,
    eventType: string,
    note: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.emergencyIncidentTimeline.create({
      data: { incidentId, eventType, note, metadata },
    });
  }

  createNotification(incidentId: string, callEventId: string, payload: Prisma.InputJsonValue) {
    return this.prisma.emergencyNotification.create({
      data: {
        incidentId,
        callEventId,
        recipientGroup: "operations",
        deliveryChannel: "internal",
        type: "INITIAL",
        payload,
      },
    });
  }

  private calculateSeverity(input: {
    callCount: number;
    roomCount: number;
    floorCount: number;
    failed: number;
    abandoned: number;
    locationUncertain: boolean;
  }): EmergencyIncidentSeverity {
    if (input.floorCount > 1 || input.roomCount >= 5 || input.callCount >= 10 || input.failed > 0) {
      return EmergencyIncidentSeverity.CRITICAL;
    }
    if (
      input.roomCount >= 2 ||
      input.callCount >= 3 ||
      input.abandoned > 0 ||
      input.locationUncertain
    ) {
      return EmergencyIncidentSeverity.HIGH;
    }
    if (input.callCount >= 2) {
      return EmergencyIncidentSeverity.MEDIUM;
    }
    return EmergencyIncidentSeverity.LOW;
  }
}

export type ResolvedEmergencyLocation = {
  emergencyLocationId?: string;
  dispatchableAddress?: string;
  source: EmergencyLocationSource;
  confidence: EmergencyLocationConfidence;
  uncertain: boolean;
};
