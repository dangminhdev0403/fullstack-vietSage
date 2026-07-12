import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import {
  GuestRequestPriority,
  GuestRequestStatus as InternalGuestRequestStatus,
  GuestSessionStatus,
  Prisma,
} from "@prisma/client";
import type { Request } from "express";
import { I18nService } from "../../../common/i18n/i18n.service";
import type { SupportedLocale } from "../../../common/i18n/i18n.types";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../common/security/token-hash.util";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../../shared/events";
import { TelegramNotificationService } from "../../notifications/notifications-public";
import {
  GuestOsRepository,
  type GuestRequestGuestRow,
  type GuestSessionContextRow,
} from "../infrastructure/repositories/guest-os.repository";
import type {
  CreateGuestRequestBodyInput,
  GuestPortalRequestPriority,
  GuestPortalRequestStatus,
  GuestPortalRequestStatusFilter,
  ListGuestCategoryServicesQueryInput,
  ListGuestRequestsQueryInput,
  ScanQrBodyInput,
} from "../domain/schemas/guest-os.schema";

export const ROOM_ACCESS_UNAVAILABLE_MESSAGE =
  "Guest portal access is currently unavailable. Please contact the front desk.";

export interface GuestSessionContext {
  sessionId: string;
  hotelId: string;
  roomId: string;
  stayId: string;
  status: GuestSessionStatus;
  expiresAt: Date;
}

export interface GuestRequestResponse {
  id: string;
  service: {
    id: string | null;
    name: string | null;
  };
  status: GuestPortalRequestStatus;
  priority: GuestPortalRequestPriority;
  quantity: number;
  note: string | null;
  answer: string | null;
  createdAt: Date;
}

export interface GuestRequestListItemResponse {
  id: string;
  displayName: string;
  status: GuestPortalRequestStatus;
  priority: GuestPortalRequestPriority;
  quantity: number;
  currency: string;
  unitPrice: Prisma.Decimal;
  estimatedTotalAmount: Prisma.Decimal;
  service?: {
    id: string;
    name: string;
    price: Prisma.Decimal;
    currency: string;
  };
  description: string | null;
  answer: string | null;
  createdAt: string;
  canCancel: boolean;
}

const SESSION_SWITCH_REQUIRED_CODE = "GUEST_SESSION_SWITCH_REQUIRED";

@Injectable()
export class GuestOsService {
  private readonly i18n = new I18nService();

  private readonly guestRequestEventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly guestOsRepository: GuestOsRepository,
    private readonly logger: AppLogger = new AppLogger(),
    private readonly telegramNotificationService?: TelegramNotificationService,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    guestRequestEventPublisher?: GuestRequestEventPublisher,
  ) {
    this.guestRequestEventPublisher =
      guestRequestEventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }

  async scanQr(dto: ScanQrBodyInput, request: Request) {
    const publicCode = dto.qrCode.trim();
    const qr = await this.guestOsRepository.findQrForScan(publicCode);

    if (!qr) {
      await this.recordDeniedScan("unknown", "UNKNOWN_QR", publicCode, dto, request);
      this.denyAccess();
    }

    await this.guestOsRepository.recordQrScan({
      aggregateId: qr.id,
      hotelId: qr.hotelId,
      tenantId: qr.hotel.tenantId,
      payload: { roomId: qr.roomId, qrStatus: qr.status },
    });

    const stay = await this.guestOsRepository.findActiveStayForRoom(qr.hotelId, qr.roomId);
    if (!stay) {
      await this.recordDeniedScan(qr.id, "NO_ACTIVE_STAY", publicCode, dto, request, {
        hotelId: qr.hotelId,
        tenantId: qr.hotel.tenantId,
        roomId: qr.roomId,
        qrStatus: qr.status,
        roomStatus: qr.room.status,
      });
      this.denyAccess();
    }

    if (
      !this.guestOsRepository.isAccessOpen({
        qrStatus: qr.status,
        roomStatus: qr.room.status,
        stayStatus: stay.status,
      })
    ) {
      await this.recordDeniedScan(qr.id, "ACCESS_CLOSED", publicCode, dto, request, {
        hotelId: qr.hotelId,
        tenantId: qr.hotel.tenantId,
        roomId: qr.roomId,
        stayId: stay.id,
        qrStatus: qr.status,
        roomStatus: qr.room.status,
        stayStatus: stay.status,
      });
      this.denyAccess();
    }

    const currentSession = await this.resolveCurrentSessionForScan(dto.currentSessionToken);
    if (currentSession) {
      if (currentSession.stayId === stay.id && currentSession.roomId === qr.roomId) {
        return this.toScanQrResponse(currentSession, dto.currentSessionToken?.trim() ?? "");
      }

      if (!dto.forceSwitch) {
        throw new ConflictException({
          code: SESSION_SWITCH_REQUIRED_CODE,
          detail: "This device is already linked to another room. Confirm before switching rooms.",
          currentRoom: {
            roomNumber: currentSession.room.roomNumber,
            floor: currentSession.room.floor,
            type: currentSession.room.type,
          },
          targetRoom: {
            roomNumber: qr.room.roomNumber,
            floor: qr.room.floor,
            type: qr.room.type,
          },
        });
      }

      await this.guestOsRepository.closeSession(currentSession.id);
    }

    const sessionToken = generateOpaqueToken(32);
    const now = new Date();
    const ttlExpiry = addHours(now, 24);
    const stayExpiry = stay.plannedCheckOutAt < ttlExpiry ? stay.plannedCheckOutAt : ttlExpiry;

    try {
      const session = await this.guestOsRepository.createGuestSession({
        hotelId: qr.hotelId,
        tenantId: qr.hotel.tenantId,
        roomId: qr.roomId,
        stayId: stay.id,
        roomQrCodeId: qr.id,
        sessionTokenHash: hashOpaqueToken(sessionToken),
        deviceFingerprintHash: dto.deviceFingerprint
          ? hashOpaqueToken(dto.deviceFingerprint)
          : undefined,
        ipHash: this.hashOptional(this.resolveIp(request)),
        userAgent: this.truncate(request.headers["user-agent"], 255),
        expiresAt: stayExpiry,
        maxDistinctDevices: qr.room.maxActiveGuestDevices ?? 3,
      });

      this.logger.info("Guest session created after successful QR scan", {
        module: "guest_os",
        service: "GuestOsService",
        operation: "scanQr",
        event: "GUEST_SESSION_CREATED",
        hotelId: qr.hotelId,
        tenantId: qr.hotel.tenantId,
        roomId: qr.roomId,
        stayId: stay.id,
        sessionId: session.id,
        qrCodeId: qr.id,
      });
      return this.toScanQrResponse(session, sessionToken);
    } catch (error) {
      if (error instanceof Error && error.message === "GUEST_SESSION_LIMIT_REACHED") {
        throw new ForbiddenException("Too many active sessions for this stay");
      }

      throw error;
    }
  }

  private async resolveCurrentSessionForScan(sessionToken?: string) {
    const token = sessionToken?.trim();
    if (!token) {
      return null;
    }

    const session = await this.guestOsRepository.findSessionByTokenHash(hashOpaqueToken(token));
    if (!session) {
      return null;
    }

    try {
      return await this.refreshSessionState(session, new Date());
    } catch {
      return null;
    }
  }

  private toScanQrResponse(session: GuestSessionContextRow, sessionToken: string) {
    return {
      sessionToken,
      expiresAt: session.expiresAt,
      hotel: {
        name: session.hotel.name,
        timezone: session.hotel.timezone,
        brandSettings: session.hotel.brandSettings,
      },
      room: {
        roomNumber: session.room.roomNumber,
        floor: session.room.floor,
        type: session.room.type,
      },
      guest: {
        displayName: session.stay.guestDisplayName,
        plannedCheckOutAt: session.stay.plannedCheckOutAt,
      },
    };
  }

  async authenticateGuestToken(sessionToken: string): Promise<GuestSessionContext> {
    const token = sessionToken.trim();
    if (!token) {
      throw new UnauthorizedException("Token phiên khách là bắt buộc");
    }

    const session = await this.guestOsRepository.findSessionByTokenHash(hashOpaqueToken(token));
    if (!session) {
      throw new UnauthorizedException("Phiên khách không hợp lệ");
    }

    const now = new Date();
    const stale = await this.refreshSessionState(session, now);

    return {
      sessionId: stale.id,
      hotelId: stale.hotelId,
      roomId: stale.roomId,
      stayId: stale.stayId,
      status: stale.status,
      expiresAt: stale.expiresAt,
    };
  }

  async getCurrentSession(context: GuestSessionContext) {
    const current = await this.guestOsRepository.updateSessionHeartbeat(
      context.sessionId,
      GuestSessionStatus.ACTIVE,
    );

    return {
      session: this.toSessionData(current),
    };
  }

  async listServices(context: GuestSessionContext, request?: Request) {
    const current = await this.loadUsableSession(context.sessionId);
    const locale = this.i18n.resolveLocale(request);
    const categories = await this.guestOsRepository.listActiveServiceCatalog(current.hotelId);

    return {
      hotelId: current.hotelId,
      categories: categories.map((category) => {
        const localizedCategory = this.resolveCatalogText(category, locale);
        return {
          ...category,
          name: localizedCategory.name,
          description: localizedCategory.description,
          items: category.items.map((item) => {
            const localizedItem = this.resolveCatalogText(item, locale);
            return {
              ...item,
              name: localizedItem.name,
              description: localizedItem.description,
              effectivePrice: item.priceOverride ?? category.defaultPrice,
              effectiveCurrency: category.currency,
              quantityEnabled: item.quantityEnabled,
              minQuantity: item.minQuantity,
              maxQuantity: item.maxQuantity,
            };
          }),
        };
      }),
    };
  }

  async listCategoryServices(
    context: GuestSessionContext,
    categoryId: string,
    query: ListGuestCategoryServicesQueryInput,
    request?: Request,
  ) {
    const current = await this.loadUsableSession(context.sessionId);
    const locale = this.i18n.resolveLocale(request);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.guestOsRepository.findActiveServiceCategoryWithItems({
      hotelId: current.hotelId,
      categoryId: categoryId.trim(),
      skip: (page - 1) * limit,
      take: limit,
    });

    if (!result) {
      throw new NotFoundException("Service category is not available");
    }

    const localizedCategory = this.resolveCatalogText(result.category, locale);

    return {
      page,
      limit,
      total: result.total,
      category: {
        id: result.category.id,
        name: localizedCategory.name,
        description: localizedCategory.description,
      },
      services: result.category.items.map((item) => {
        const localizedItem = this.resolveCatalogText(item, locale);
        return {
          id: item.id,
          name: localizedItem.name,
          description: localizedItem.description,
          price: Number(item.priceOverride ?? result.category.defaultPrice),
          currency: result.category.currency,
          quantityEnabled: item.quantityEnabled,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity,
        };
      }),
    };
  }

  async createRequest(context: GuestSessionContext, dto: CreateGuestRequestBodyInput) {
    const current = await this.loadUsableSession(context.sessionId);
    const serviceItem = await this.guestOsRepository.findActiveServiceItemInHotel(
      current.hotelId,
      dto.serviceItemId,
    );

    if (!serviceItem) {
      throw new BadRequestException("Service item is not available");
    }

    const description = dto.description?.trim() ?? dto.details?.trim();
    const quantity = this.resolveRequestQuantity(dto.quantity, serviceItem);

    const request = await this.guestOsRepository.createRequest({
      hotelId: current.hotelId,
      tenantId: current.hotel.tenantId,
      roomId: current.roomId,
      stayId: current.stayId,
      sessionId: current.id,
      serviceItemId: serviceItem.id,
      priority: this.toInternalRequestPriority(dto.priority ?? "NORMAL"),
      description,
      quantity,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    });

    const guestRequest = this.toGuestRequestData(request);
    this.logger.info("Guest request created from guest portal", {
      module: "guest_os",
      service: "GuestOsService",
      operation: "createRequest",
      event: "GUEST_REQUEST_CREATED",
      hotelId: current.hotelId,
      tenantId: current.hotel.tenantId,
      roomId: current.roomId,
      stayId: current.stayId,
      sessionId: current.id,
      requestId: request.id,
      serviceItemId: serviceItem.id,
      priority: request.priority,
      quantity: request.quantity,
    });
    this.guestRequestEventPublisher.publishGuestRequestCreated({
      hotelId: current.hotelId,
      sessionId: current.id,
      requestId: request.id,
      ownerRequest: {
        id: request.id,
        displayName: request.serviceItem?.name ?? request.title ?? "Request",
        status: request.status,
        priority: guestRequest.priority,
        quantity: request.quantity,
        description: request.description,
        latestNote: null,
        createdAt: request.createdAt.toISOString(),
        roomNumber: current.room.roomNumber,
        guestName: current.stay.guestDisplayName,
        categoryName: null,
        assignedToName: null,
        actions: ["ACCEPT", "CANCEL"],
      },
      guestRequest: this.toGuestRequestListItem(request),
    });

    void this.telegramNotificationService
      ?.sendServiceRequestNotification(request.id)
      .catch((error) =>
        this.logger.error(error, {
          module: "telegram",
          service: "GuestOsService",
          operation: "createRequest",
          event: "TELEGRAM_NOTIFY_FAILED",
          hotelId: current.hotelId,
          guestRequestId: request.id,
        }),
      );

    return guestRequest;
  }

  async listRequests(context: GuestSessionContext, query: ListGuestRequestsQueryInput) {
    const current = await this.loadUsableSession(context.sessionId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const requestId = query.id?.trim();
    const where: Prisma.GuestRequestWhereInput = {
      stayId: current.stayId,
      ...(requestId ? { id: requestId } : {}),
      ...(query.status ? { status: { in: this.toInternalRequestStatuses(query.status) } } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(search
        ? {
            OR: [
              { serviceItem: { is: { name: { contains: search, mode: "insensitive" } } } },
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.guestOsRepository.listRequests(
      where,
      (page - 1) * limit,
      limit,
    );

    return { page, limit, total, items: rows.map((row) => this.toGuestRequestListItem(row)) };
  }

  async cancelRequest(context: GuestSessionContext, requestId: string) {
    const current = await this.loadUsableSession(context.sessionId);
    const trimmedRequestId = requestId.trim();
    const existing = await this.guestOsRepository.findRequestForGuest(
      trimmedRequestId,
      current.stayId,
    );

    if (!existing) {
      throw new NotFoundException("Guest request not found");
    }

    if (existing.status !== InternalGuestRequestStatus.NEW) {
      throw new BadRequestException("Only requests in CREATED status can be cancelled by guests");
    }

    const cancelled = await this.guestOsRepository.cancelCreatedRequest({
      hotelId: current.hotelId,
      tenantId: current.hotel.tenantId,
      stayId: current.stayId,
      sessionId: current.id,
      requestId: trimmedRequestId,
    });

    if (!cancelled) {
      throw new BadRequestException("Only requests in CREATED status can be cancelled by guests");
    }

    this.logger.info("Guest request cancelled from guest portal", {
      module: "guest_os",
      service: "GuestOsService",
      operation: "cancelRequest",
      event: "GUEST_REQUEST_CANCELLED",
      hotelId: current.hotelId,
      tenantId: current.hotel.tenantId,
      roomId: current.roomId,
      stayId: current.stayId,
      sessionId: current.id,
      requestId: trimmedRequestId,
    });
    return this.toGuestRequestData(cancelled);
  }

  async closeSession(context: GuestSessionContext) {
    const closed = await this.guestOsRepository.closeSession(context.sessionId);
    this.logger.info("Guest session closed", {
      module: "guest_os",
      service: "GuestOsService",
      operation: "closeSession",
      event: "GUEST_SESSION_CLOSED",
      sessionId: context.sessionId,
      hotelId: context.hotelId,
      roomId: context.roomId,
      stayId: context.stayId,
    });
    return { closed: true, session: this.toSessionData(closed) };
  }

  private resolveCatalogText(
    row: {
      name: string;
      description?: string | null;
      translations?: Array<{ locale: string; name: string; description?: string | null }>;
    },
    locale: SupportedLocale,
  ) {
    if (locale === "vi-VN") {
      return { name: row.name, description: row.description ?? null };
    }

    const selected = row.translations?.find((translation) => translation.locale === locale);

    return {
      name: selected?.name ?? row.name,
      description:
        selected && selected.description !== undefined
          ? selected.description
          : (row.description ?? null),
    };
  }

  private async loadUsableSession(sessionId: string) {
    const current = await this.guestOsRepository.findSessionById(sessionId);
    if (!current) {
      throw new UnauthorizedException("Phiên khách không hợp lệ");
    }

    return this.refreshSessionState(current, new Date());
  }

  private async refreshSessionState(
    session: GuestSessionContextRow,
    now: Date,
  ): Promise<GuestSessionContextRow> {
    if (
      session.status === GuestSessionStatus.CLOSED ||
      session.status === GuestSessionStatus.EXPIRED ||
      session.expiresAt <= now ||
      session.stay.status !== "ACTIVE" ||
      session.room.status !== "OCCUPIED"
    ) {
      const closed = await this.guestOsRepository.closeSession(session.id);
      throw new UnauthorizedException(
        closed.status === GuestSessionStatus.CLOSED
          ? "Phiên khách đã đóng hoặc hết hạn"
          : "Phiên khách không hợp lệ",
      );
    }

    const lastSeenAt = session.lastSeenAt ?? session.createdAt;
    const idleAfterMs = 30 * 60 * 1000;
    const nextStatus =
      now.getTime() - lastSeenAt.getTime() > idleAfterMs
        ? GuestSessionStatus.IDLE
        : GuestSessionStatus.ACTIVE;

    return this.guestOsRepository.updateSessionHeartbeat(session.id, nextStatus);
  }

  private toSessionData(row: GuestSessionContextRow) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      stayId: row.stayId,
      status: row.status,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
      lastSeenAt: row.lastSeenAt,
      idleAt: row.idleAt,
      expiresAt: row.expiresAt,
      closedAt: row.closedAt,
      hotel: row.hotel,
      room: row.room,
      stay: row.stay,
    };
  }

  private toGuestRequestData(row: GuestRequestGuestRow): GuestRequestResponse {
    return {
      id: row.id,
      service: {
        id: row.serviceItem?.id ?? null,
        name: row.serviceItem?.name ?? row.title ?? null,
      },
      status: this.toGuestRequestStatus(row.status),
      priority: this.toGuestRequestPriority(row.priority),
      quantity: row.quantity,
      note: row.description,
      answer: row.events?.[0]?.note ?? null,
      createdAt: row.createdAt,
    };
  }

  private toGuestRequestListItem(row: GuestRequestGuestRow): GuestRequestListItemResponse {
    const price = this.resolveGuestRequestUnitPrice(row);
    const currency = row.serviceItem?.category.currency ?? "VND";

    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: this.toGuestRequestStatus(row.status),
      priority: this.toGuestRequestPriority(row.priority),
      quantity: row.quantity,
      currency,
      unitPrice: price,
      estimatedTotalAmount: price.mul(row.quantity),
      service: row.serviceItem
        ? {
            id: row.serviceItem.id,
            name: row.serviceItem.name,
            price,
            currency,
          }
        : undefined,
      description: row.description,
      answer: row.events?.[0]?.note ?? null,
      createdAt: row.createdAt.toISOString(),
      canCancel: row.status === InternalGuestRequestStatus.NEW,
    };
  }

  private resolveGuestRequestUnitPrice(row: GuestRequestGuestRow) {
    const value = row.serviceItem?.priceOverride ?? row.serviceItem?.category.defaultPrice ?? 0;

    return new Prisma.Decimal(value);
  }

  private toGuestRequestStatus(status: GuestRequestGuestRow["status"]): GuestPortalRequestStatus {
    return status;
  }

  private toInternalRequestStatuses(
    status: GuestPortalRequestStatusFilter,
  ): InternalGuestRequestStatus[] {
    switch (status) {
      case "NEW":
        return [InternalGuestRequestStatus.NEW];
      case "CONFIRMED":
        return [InternalGuestRequestStatus.CONFIRMED];
      case "PENDING":
        return [InternalGuestRequestStatus.PENDING];
      case "ACCEPTED":
        return [InternalGuestRequestStatus.ACCEPTED];
      case "ON_THE_WAY":
        return [InternalGuestRequestStatus.ON_THE_WAY];
      case "REJECTED":
        return [InternalGuestRequestStatus.REJECTED];
      case "CREATED":
      case "CREATE":
        return [InternalGuestRequestStatus.CREATED];
      case "ACKNOWLEDGED":
        return [InternalGuestRequestStatus.ACKNOWLEDGED];
      case "IN_PROGRESS":
        return [InternalGuestRequestStatus.IN_PROGRESS];
      case "COMPLETED":
        return [InternalGuestRequestStatus.COMPLETED];
      case "CANCELLED":
        return [InternalGuestRequestStatus.CANCELLED];
      case "FAILED":
        return [InternalGuestRequestStatus.FAILED];
    }
  }

  private toGuestRequestPriority(
    priority: GuestRequestGuestRow["priority"],
  ): GuestPortalRequestPriority {
    return String(priority) === "URGENT" || String(priority) === "HIGH" ? "URGENT" : "NORMAL";
  }

  private toInternalRequestPriority(priority: GuestPortalRequestPriority): GuestRequestPriority {
    switch (priority) {
      case "NORMAL":
        return GuestRequestPriority.NORMAL;
      case "URGENT":
        return GuestRequestPriority.URGENT;
    }
  }

  private toInternalRequestPriorities(
    priority: GuestPortalRequestPriority,
  ): GuestRequestPriority[] {
    switch (priority) {
      case "NORMAL":
        return [GuestRequestPriority.NORMAL];
      case "URGENT":
        return [GuestRequestPriority.URGENT];
    }
  }

  private denyAccess(): never {
    throw new ForbiddenException(ROOM_ACCESS_UNAVAILABLE_MESSAGE);
  }

  private async recordDeniedScan(
    aggregateId: string,
    deniedReason: string,
    publicCode: string,
    dto: ScanQrBodyInput,
    request: Request,
    context?: {
      hotelId?: string;
      tenantId?: string;
      roomId?: string;
      stayId?: string;
      qrStatus?: string;
      roomStatus?: string;
      stayStatus?: string;
    },
  ) {
    const ip = this.resolveIp(request);

    const payload = this.compactJson({
      deniedReason,
      publicCodeTail: this.tail(publicCode),
      deviceFingerprintHashTail: dto.deviceFingerprint
        ? this.tail(hashOpaqueToken(dto.deviceFingerprint))
        : undefined,
      ipHashTail: ip ? this.tail(hashOpaqueToken(ip)) : undefined,
      roomId: context?.roomId,
      stayId: context?.stayId,
      qrStatus: context?.qrStatus,
      roomStatus: context?.roomStatus,
      stayStatus: context?.stayStatus,
    });

    const requestId =
      "requestId" in request && typeof request.requestId === "string" ? request.requestId : "n/a";
    this.logger.warn("Guest QR scan denied", {
      module: "guest_os",
      service: "GuestOsService",
      operation: "scanQr",
      event: "QR_SCAN_DENIED",
      requestId,
      reason: deniedReason,
      publicCodeTail: payload.publicCodeTail,
      hotelId: context?.hotelId,
      tenantId: context?.tenantId,
      roomId: context?.roomId,
      stayId: context?.stayId,
      qrStatus: context?.qrStatus,
      roomStatus: context?.roomStatus,
      stayStatus: context?.stayStatus,
    });

    await this.guestOsRepository.recordQrScan({
      aggregateId,
      hotelId: context?.hotelId,
      tenantId: context?.tenantId,
      payload,
    });
  }

  private compactJson(input: Record<string, string | undefined>): Prisma.InputJsonObject {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  }

  private resolveIp(request: Request): string | undefined {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
      return forwardedFor.split(",")[0]?.trim();
    }

    return request.ip;
  }

  private hashOptional(value: string | undefined): string | undefined {
    return value ? hashOpaqueToken(value) : undefined;
  }

  private truncate(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }

  private tail(value: string, length = 8): string {
    return value.slice(-length);
  }

  private resolveRequestQuantity(
    submittedQuantity: number | undefined,
    serviceItem: {
      quantityEnabled: boolean;
      minQuantity: number;
      maxQuantity: number | null;
    } | null,
  ): number {
    if (!serviceItem?.quantityEnabled) {
      return 1;
    }

    if (submittedQuantity === undefined) {
      throw new BadRequestException("Quantity is required for this service item");
    }

    if (submittedQuantity < serviceItem.minQuantity) {
      throw new BadRequestException(
        `Quantity must be greater than or equal to ${serviceItem.minQuantity}`,
      );
    }

    if (serviceItem.maxQuantity !== null && submittedQuantity > serviceItem.maxQuantity) {
      throw new BadRequestException(
        `Quantity must be less than or equal to ${serviceItem.maxQuantity}`,
      );
    }

    return submittedQuantity;
  }
}
