import { Injectable, NotFoundException } from "@nestjs/common";
import {
  EmergencyCallLifecycleStatus,
  EmergencyIncidentStatus,
  EmergencyLocationConfidence,
  EmergencyLocationSource,
} from "@prisma/client";
import { GuestEmergencyContextService } from "../../guest-operations/guest-operations-public";
import { EmergencyRepository } from "../infrastructure/repositories/emergency.repository";
import type { CreateEmergencyCallBodyInput } from "../domain/schemas/emergency.schema";

const INCIDENT_WINDOW_MINUTES = 30;

@Injectable()
export class EmergencyService {
  constructor(
    private readonly emergencyRepository: EmergencyRepository,
    private readonly guestEmergencyContextService: GuestEmergencyContextService,
  ) {}

  async createGuestEmergencyCall(sessionId: string, dto: CreateEmergencyCallBodyInput) {
    const session = await this.guestEmergencyContextService.findBySessionId(sessionId);
    if (!session) {
      throw new NotFoundException("Guest session not found");
    }

    const resolvedLocation = await this.resolveLocation({
      tenantId: session.tenantId,
      hotelId: session.hotelId,
      requestedLocationId: dto.location?.emergencyLocationId,
      dispatchableAddress: dto.location?.dispatchableAddress,
      source: dto.location?.source,
      confidence: dto.location?.confidence,
    });

    const call = await this.emergencyRepository.createCallEvent({
      tenantId: session.tenantId,
      hotelId: session.hotelId,
      roomId: session.roomId,
      sessionId: session.sessionId,
      emergencyLocationId: resolvedLocation.emergencyLocationId,
      sourceType: "GUEST",
      callerReference: dto.callerReference ?? session.sessionId,
      dialedNumber: dto.dialedNumber,
      callbackNumber: dto.callbackNumber ?? session.stayGuestPhone,
      resolvedDispatchableLocation: resolvedLocation.dispatchableAddress,
      locationSource: resolvedLocation.source,
      locationConfidence: resolvedLocation.confidence,
      lifecycleStatus: EmergencyCallLifecycleStatus.ATTEMPTED,
      locationUncertain: resolvedLocation.uncertain,
      metadata: {
        ...dto.metadata,
        roomId: session.roomId,
        roomNumber: session.roomNumber,
        roomFloor: session.roomFloor,
        safetyRule: "route-every-emergency-call-independently",
      },
    });

    const incident = await this.matchOrCreateIncident({
      tenantId: session.tenantId,
      hotelId: session.hotelId,
      primaryLocationId: resolvedLocation.emergencyLocationId,
      floor: session.roomFloor,
      callId: call.id,
      locationUncertain: resolvedLocation.uncertain,
    });

    await this.emergencyRepository.linkCallToIncident(call.id, incident.id);
    const updatedIncident = await this.emergencyRepository.refreshIncidentRollup(incident.id);
    await this.emergencyRepository.createTimeline(
      incident.id,
      "CALL_LINKED",
      "Emergency call linked to incident",
      {
        callId: call.id,
        roomId: session.roomId,
        roomNumber: session.roomNumber,
      },
    );
    await this.emergencyRepository.createNotification(incident.id, call.id, {
      incidentId: incident.id,
      callId: call.id,
      severity: updatedIncident.severity,
      tenantId: session.tenantId,
      hotelId: session.hotelId,
      roomId: session.roomId,
      roomNumber: session.roomNumber,
      locationUncertain: resolvedLocation.uncertain,
    });

    return { callEvent: call, incident: updatedIncident };
  }

  private async resolveLocation(input: {
    tenantId: string;
    hotelId: string;
    requestedLocationId?: string;
    dispatchableAddress?: string;
    source?: EmergencyLocationSource;
    confidence?: EmergencyLocationConfidence;
  }) {
    if (input.requestedLocationId) {
      const location = await this.emergencyRepository.findLocation(input.requestedLocationId);
      if (location) {
        return {
          emergencyLocationId: location.id,
          dispatchableAddress: location.dispatchableAddress,
          source: input.source ?? EmergencyLocationSource.QR,
          confidence: input.confidence ?? EmergencyLocationConfidence.HIGH,
          uncertain: false,
        };
      }
    }

    if (input.dispatchableAddress) {
      const confidence = input.confidence ?? EmergencyLocationConfidence.MEDIUM;
      return {
        dispatchableAddress: input.dispatchableAddress,
        source: input.source ?? EmergencyLocationSource.MANUAL_ADDRESS,
        confidence,
        uncertain: confidence !== EmergencyLocationConfidence.HIGH,
      };
    }

    const fallback = await this.emergencyRepository.findFallbackLocation(
      input.tenantId,
      input.hotelId,
    );
    return {
      emergencyLocationId: fallback?.id,
      dispatchableAddress: fallback?.dispatchableAddress,
      source: EmergencyLocationSource.TENANT_DEFAULT,
      confidence: fallback ? EmergencyLocationConfidence.LOW : EmergencyLocationConfidence.UNKNOWN,
      uncertain: true,
    };
  }

  private async matchOrCreateIncident(input: {
    tenantId: string;
    hotelId: string;
    primaryLocationId?: string;
    floor?: string | null;
    callId: string;
    locationUncertain: boolean;
  }) {
    const since = new Date(Date.now() - INCIDENT_WINDOW_MINUTES * 60 * 1000);
    const openIncident = await this.emergencyRepository.findOpenIncident({
      tenantId: input.tenantId,
      hotelId: input.hotelId,
      primaryLocationId: input.primaryLocationId,
      since,
    });

    if (openIncident) {
      return openIncident;
    }

    const incident = await this.emergencyRepository.createIncident({
      tenantId: input.tenantId,
      hotelId: input.hotelId,
      primaryLocationId: input.primaryLocationId,
      floor: input.floor,
      status: EmergencyIncidentStatus.OPEN,
      locationUncertain: input.locationUncertain,
      callCount: 0,
    });
    await this.emergencyRepository.createTimeline(
      incident.id,
      "INCIDENT_CREATED",
      "Emergency incident created",
      {
        firstCallId: input.callId,
      },
    );
    return incident;
  }
}
