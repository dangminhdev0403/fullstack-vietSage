import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, ReservationStatus, RoomStatus, type ChannexMapping } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ChannexApiClient, ChannexRevisionItem } from "./channex-api-client.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import type {
  ChannexWebhookDto,
  ChannexSimulateBookingDto,
  ChannexCancelBookingDto,
} from "../domain/schemas/channel-manager.schema";

export interface FeedDrainResult {
  success: boolean;
  totalProcessed: number;
  newBookingsCount: number;
  cancelledBookingsCount: number;
  modifiedBookingsCount: number;
  skippedCount: number;
  errorsCount: number;
  details: Array<{
    revisionId: string;
    bookingId: string;
    status: string;
    action: string;
    reservationId?: string;
    error?: string;
  }>;
}

@Injectable()
export class ChannexBookingIngestionService {
  private readonly logger = new Logger(ChannexBookingIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channexClient: ChannexApiClient,
  ) {}

  /**
   * Drain toàn bộ feed unacked revisions từ Channex.
   * Chạy vòng lặp drain liên tục cho đến khi rỗng hoặc meta.total == 0.
   */
  async drainFeed(
    options: {
      hotelId?: string;
      limit?: number;
      apiKey?: string;
    } = {},
  ): Promise<FeedDrainResult> {
    const limit = options.limit || 10;
    const propertyId = options.hotelId ? await this.resolvePropertyId(options.hotelId) : undefined;
    let totalProcessed = 0;
    let newCount = 0;
    let cancelCount = 0;
    let modCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    const details: FeedDrainResult["details"] = [];

    let hasMore = true;
    let blockedByReconciliation = false;
    let iteration = 0;
    const MAX_ITERATIONS = 20; // Phòng ngừa vòng lặp vô hạn

    while (hasMore && iteration < MAX_ITERATIONS) {
      iteration++;
      const feedRes = await this.channexClient.getBookingFeed(limit, options.apiKey, propertyId);
      const revisions = feedRes.data || [];

      if (revisions.length === 0) {
        hasMore = false;
        break;
      }

      for (const rev of revisions) {
        try {
          const outcome = await this.processSingleRevision(rev, options.apiKey);
          totalProcessed++;

          if (outcome.action === "RECONCILIATION_REQUIRED") {
            modCount++;
            blockedByReconciliation = true;
          } else if (outcome.action === "CREATED") newCount++;
          else if (outcome.action === "CANCELLED") cancelCount++;
          else if (outcome.action === "MODIFIED") modCount++;
          else if (outcome.action === "SKIPPED" || outcome.action === "DEDUPLICATED")
            skippedCount++;

          details.push({
            revisionId: rev.id,
            bookingId: rev.attributes.booking_id,
            status: rev.attributes.status,
            action: outcome.action,
            reservationId: outcome.reservationId,
          });
        } catch (err: any) {
          errorsCount++;
          this.logger.error(
            `[Channex Ingestion] Lỗi khi xử lý revision ${rev.id} (Booking ${rev.attributes?.booking_id}): ${err.message}`,
          );
          details.push({
            revisionId: rev.id,
            bookingId: rev.attributes?.booking_id || "UNKNOWN",
            status: rev.attributes?.status || "UNKNOWN",
            action: "ERROR",
            error: err.message,
          });
          // Không break để tránh 1 poison revision làm nghẽn toàn bộ feed
        }
      }

      // Kiểm tra nếu feed còn nhiều hơn trang vừa lấy thì tiếp tục loop
      const metaTotal = feedRes.meta?.total ?? 0;
      if (blockedByReconciliation || metaTotal <= revisions.length) {
        hasMore = false;
      }
    }

    return {
      success: errorsCount === 0 && !blockedByReconciliation && !hasMore,
      totalProcessed,
      newBookingsCount: newCount,
      cancelledBookingsCount: cancelCount,
      modifiedBookingsCount: modCount,
      skippedCount,
      errorsCount,
      details,
    };
  }

  private async resolvePropertyId(hotelId: string): Promise<string> {
    const mapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: { hotelId, kind: "property", localId: hotelId },
      },
      select: { channexId: true },
    });
    if (!mapping) {
      throw new BadRequestException("Khách sạn chưa liên kết Property Channex");
    }
    return mapping.channexId;
  }

  /**
   * Xử lý 1 revision đơn lẻ (áp dụng cho cả Feed Poller và Webhook Handler)
   */
  async processSingleRevision(
    rev: ChannexRevisionItem,
    apiKey?: string,
    acknowledge = true,
  ): Promise<{ action: string; reservationId?: string }> {
    const revisionId = rev.id;
    const attrs = rev.attributes;
    const propertyMapping = await this.prisma.channexMapping.findFirst({
      where: { kind: "property", channexId: attrs.property_id },
      select: { hotelId: true },
    });

    if (!propertyMapping) {
      this.logger.warn(
        `[Channex Ingestion] Revision ${revisionId} thuộc property lạ ${attrs.property_id}. Ack và bỏ qua.`,
      );
      if (acknowledge) await this.channexClient.ackBookingRevision(revisionId, apiKey);
      return { action: "SKIPPED" };
    }

    const hotelId = propertyMapping.hotelId;

    if (attrs.status === "new") {
      try {
        const outcome = await this.prisma.$transaction(
          async (tx) => {
            const existingMapping = await tx.channexMapping.findFirst({
              where: { hotelId, kind: "booking", channexId: attrs.booking_id },
            });
            if (existingMapping) {
              return { action: "DEDUPLICATED", reservationId: existingMapping.localId };
            }

            const segments = attrs.rooms?.length
              ? attrs.rooms
              : [
                  {
                    checkin_date: attrs.arrival_date,
                    checkout_date: attrs.departure_date,
                    room_type_id: "",
                    rate_plan_id: "",
                    amount: attrs.amount,
                  },
                ];
            const guestName =
              `${attrs.customer?.name || ""} ${attrs.customer?.surname || ""}`.trim() ||
              "Khách đặt qua OTA";
            const otaCode = attrs.ota_reservation_code || attrs.booking_id.slice(0, 8);
            const baseReservationCode = `${attrs.ota_name || "OTA"}-${otaCode}`;
            const usedRoomIds: string[] = [];
            const reservationIds: string[] = [];
            const assignedRoomNumbers: string[] = [];

            for (const [index, segment] of segments.entries()) {
              const plannedCheckInAt = this.vietnamStayTime(
                segment.checkin_date || attrs.arrival_date,
                14,
              );
              const plannedCheckOutAt = this.vietnamStayTime(
                segment.checkout_date || attrs.departure_date,
                12,
              );
              const roomTypeMapping = segment.room_type_id
                ? await tx.channexMapping.findFirst({
                    where: {
                      hotelId,
                      kind: "room_type",
                      channexId: segment.room_type_id,
                    },
                  })
                : null;
              const mappedCatalogType = roomTypeMapping
                ? await tx.roomType.findFirst({
                    where: {
                      hotelId,
                      OR: [
                        { id: roomTypeMapping.localId },
                        {
                          normalizedKey: roomTypeMapping.localId
                            .normalize("NFKC")
                            .trim()
                            .replace(/\s+/g, " ")
                            .toLowerCase(),
                        },
                      ],
                    },
                    select: { id: true, name: true },
                  })
                : null;
              const mappedTypeName =
                mappedCatalogType?.name ??
                (roomTypeMapping &&
                typeof (roomTypeMapping.metadata as { title?: unknown } | null)?.title === "string"
                  ? (roomTypeMapping.metadata as { title: string }).title
                  : (roomTypeMapping?.localId ?? null));
              const candidateRoom = roomTypeMapping
                ? await tx.room.findFirst({
                    where: {
                      hotelId,
                      OR: [
                        ...(mappedCatalogType ? [{ roomTypeId: mappedCatalogType.id }] : []),
                        ...(mappedTypeName ? [{ type: mappedTypeName }] : []),
                      ],
                      status: RoomStatus.AVAILABLE,
                      ...(usedRoomIds.length ? { id: { notIn: usedRoomIds } } : {}),
                      reservations: {
                        none: {
                          status: {
                            in: [
                              ReservationStatus.CONFIRMED,
                              ReservationStatus.ARRIVAL_READY,
                              ReservationStatus.CHECKED_IN,
                            ],
                          },
                          plannedCheckInAt: { lt: plannedCheckOutAt },
                          plannedCheckOutAt: { gt: plannedCheckInAt },
                        },
                      },
                    },
                    orderBy: { roomNumber: "asc" },
                  })
                : null;
              if (candidateRoom) {
                usedRoomIds.push(candidateRoom.id);
                if (candidateRoom.roomNumber) {
                  assignedRoomNumbers.push(candidateRoom.roomNumber);
                }
              }

              const suffix = segments.length > 1 ? `-${index + 1}` : "";
              const reservation = await tx.reservation.create({
                data: {
                  hotelId,
                  roomId: candidateRoom?.id ?? null,
                  roomTypeSnapshot: mappedTypeName,
                  reservationCode: `${baseReservationCode.slice(0, 80 - suffix.length)}${suffix}`,
                  guestDisplayName: guestName,
                  guestPhone: attrs.customer?.phone || null,
                  status: ReservationStatus.CONFIRMED,
                  plannedCheckInAt,
                  plannedCheckOutAt,
                },
              });
              reservationIds.push(reservation.id);
            }

            await tx.channexMapping.create({
              data: {
                hotelId,
                kind: "booking",
                localId: reservationIds[0],
                channexId: attrs.booking_id,
                metadata: {
                  revisionId,
                  reservationIds,
                  otaName: attrs.ota_name,
                  otaReservationCode: attrs.ota_reservation_code,
                  amount: attrs.amount,
                  currency: attrs.currency,
                  requiresRoomAssignment: usedRoomIds.length < segments.length,
                },
              },
            });
            await tx.channelSyncLog.create({
              data: {
                hotelId,
                syncType: "CHANNEX_INBOUND_BOOKING_NEW",
                status: "SUCCESS",
                eventsCount: reservationIds.length,
                details: JSON.stringify({
                  bookingId: attrs.booking_id,
                  reservationIds,
                  ota: attrs.ota_name,
                }),
              },
            });
            return {
              action: "CREATED",
              reservationId: reservationIds[0],
              roomNumber: assignedRoomNumbers[0] ?? null,
              guestName,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        if (outcome.action === "CREATED") {
          try {
            RequestRealtimeEmitter.emitChannelBookingCreated({
              hotelId,
              bookingId: attrs.booking_id,
              reservationId: outcome.reservationId,
              otaName: attrs.ota_name || "OTA",
              reservationCode: attrs.ota_reservation_code || attrs.booking_id.slice(0, 8),
              guestName: (outcome as any).guestName || "Khách OTA",
              roomNumber: (outcome as any).roomNumber ?? null,
              amount: attrs.amount,
              currency: attrs.currency,
            });
          } catch (emitErr) {
            this.logger.warn(`[Channex Ingestion] Realtime booking emit thất bại: ${emitErr}`);
          }
        }
        if (acknowledge) await this.channexClient.ackBookingRevision(revisionId, apiKey);
        if (outcome.action === "DEDUPLICATED") {
          this.logger.log(
            `[Channex Ingestion] Booking ${attrs.booking_id} đã tồn tại trong PMS. Ack và bỏ qua trùng lặp.`,
          );
        }
        return outcome;
      } catch (error) {
        if (this.isBookingMappingConflict(error)) {
          const winner = await this.prisma.channexMapping.findFirst({
            where: { hotelId, kind: "booking", channexId: attrs.booking_id },
          });
          if (winner) {
            if (acknowledge) await this.channexClient.ackBookingRevision(revisionId, apiKey);
            return { action: "DEDUPLICATED", reservationId: winner.localId };
          }
        }
        throw error;
      }
    }

    if (attrs.status === "cancelled") {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const bookingMapping = await tx.channexMapping.findFirst({
            where: { hotelId, kind: "booking", channexId: attrs.booking_id },
          });
          const reservationIds = this.mappedReservationIds(bookingMapping);
          const meta = (bookingMapping?.metadata as any) || {};
          let resCode: string | undefined = meta.otaReservationCode;

          if (reservationIds.length) {
            const firstRes = await tx.reservation.findUnique({
              where: { id: reservationIds[0] },
              select: { reservationCode: true },
            });
            if (firstRes?.reservationCode) {
              resCode = firstRes.reservationCode;
            }

            await tx.reservation.updateMany({
              where: {
                id: { in: reservationIds },
                hotelId,
                status: { not: ReservationStatus.CHECKED_IN },
              },
              data: { status: ReservationStatus.CANCELLED },
            });
          }
          await tx.channelSyncLog.create({
            data: {
              hotelId,
              syncType: "CHANNEX_INBOUND_BOOKING_CANCEL",
              status: reservationIds.length ? "SUCCESS" : "WARNING",
              eventsCount: reservationIds.length,
              details: JSON.stringify({ bookingId: attrs.booking_id, reservationIds }),
            },
          });
          return {
            action: "CANCELLED",
            reservationId: reservationIds[0],
            reservationCode: resCode || attrs.ota_reservation_code,
            otaName: meta.otaName || attrs.ota_name,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (outcome.action === "CANCELLED") {
        try {
          RequestRealtimeEmitter.emitChannelBookingCancelled({
            hotelId,
            bookingId: attrs.booking_id,
            reservationId: outcome.reservationId,
            reservationCode: (outcome as any).reservationCode,
            otaName: (outcome as any).otaName || attrs.ota_name,
          });
        } catch (emitErr) {
          this.logger.warn(`[Channex Ingestion] Realtime cancel emit thất bại: ${emitErr}`);
        }
      }
      if (acknowledge) await this.channexClient.ackBookingRevision(revisionId, apiKey);
      return outcome;
    }

    if (attrs.status === "modified") {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const bookingMapping = await tx.channexMapping.findFirst({
            where: { hotelId, kind: "booking", channexId: attrs.booking_id },
          });
          const existing = await tx.channelSyncLog.findFirst({
            where: {
              hotelId,
              syncType: "CHANNEX_INBOUND_BOOKING_MODIFIED",
              details: { contains: JSON.stringify({ revisionId }).slice(1, -1) },
            },
          });
          if (existing?.status === "RESOLVED") {
            return { action: "MODIFIED", reservationId: bookingMapping?.localId };
          }
          if (!existing) {
            await tx.channelSyncLog.create({
              data: {
                hotelId,
                syncType: "CHANNEX_INBOUND_BOOKING_MODIFIED",
                status: "WARNING",
                eventsCount: 1,
                details: JSON.stringify({
                  bookingId: attrs.booking_id,
                  revisionId,
                  reservationIds: this.mappedReservationIds(bookingMapping),
                  proposedArrival: attrs.arrival_date,
                  proposedDeparture: attrs.departure_date,
                  actionRequired: "MANUAL_RECONCILIATION",
                }),
              },
            });
          }
          return {
            action: "RECONCILIATION_REQUIRED",
            reservationId: bookingMapping?.localId,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (acknowledge && outcome.action === "MODIFIED") {
        await this.channexClient.ackBookingRevision(revisionId, apiKey);
      }
      return outcome;
    }

    throw new BadRequestException("Trạng thái booking revision không hỗ trợ");
  }

  private vietnamStayTime(date: string, localHour: 12 | 14): Date {
    const value = new Date(`${date}T${localHour === 14 ? "07" : "05"}:00:00.000Z`);
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException("Ngày lưu trú từ Channex không hợp lệ");
    }
    return value;
  }

  private mappedReservationIds(mapping: { localId: string; metadata?: unknown } | null): string[] {
    if (!mapping) return [];
    const metadata = mapping.metadata;
    if (metadata && typeof metadata === "object" && "reservationIds" in metadata) {
      const ids = (metadata as { reservationIds?: unknown }).reservationIds;
      if (Array.isArray(ids)) {
        const validIds = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
        if (validIds.length) return validIds;
      }
    }
    return [mapping.localId];
  }

  private isBookingMappingConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return false;
    }
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((field): field is string => typeof field === "string")
      : typeof target === "string"
        ? [target]
        : [];
    return fields.some((field) => field.includes("channexId"));
  }

  /**
   * Xử lý Webhook gửi tới từ Channex: POST /api/v1/channel-manager/channex/webhook
   */
  async handleWebhook(payload: ChannexWebhookDto, apiKey?: string) {
    const revisionId = payload.payload.revision_id;

    // Theo kiến trúc Channex: Webhook chỉ là Notification, kéo trực tiếp GET /booking_revisions/:id để lấy bản ghi chuẩn
    const revisionRes = await this.channexClient.getBookingRevision(revisionId, apiKey);
    if (!revisionRes || !revisionRes.data) {
      throw new BadRequestException(`Không tìm thấy revision ${revisionId} trên Channex`);
    }

    const outcome = await this.processSingleRevision(revisionRes.data, apiKey);
    return { success: outcome.action !== "RECONCILIATION_REQUIRED", outcome };
  }

  async getPendingModifications(hotelId: string) {
    const logs = await this.prisma.channelSyncLog.findMany({
      where: { hotelId, syncType: "CHANNEX_INBOUND_BOOKING_MODIFIED", status: "WARNING" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return logs.map(({ id, createdAt, details }) => ({
      id,
      createdAt,
      ...(details ? JSON.parse(details) : {}),
    }));
  }

  async resolveModification(hotelId: string, logId: string) {
    const result = await this.prisma.channelSyncLog.updateMany({
      where: {
        id: logId,
        hotelId,
        syncType: "CHANNEX_INBOUND_BOOKING_MODIFIED",
        status: "WARNING",
      },
      data: { status: "RESOLVED" },
    });
    if (result.count !== 1) throw new NotFoundException("Không tìm thấy đối soát booking đang chờ");
    return { success: true };
  }

  /**
   * Khôi phục sau sự cố (Manual Time-scoped Outage Recovery)
   * Sử dụng endpoint GET /bookings?filter[inserted_at][gte]=... để quét các booking bị trễ quá 30 phút
   */
  async recoverOutage(hotelId: string, sinceIsoDate: string, apiKey?: string) {
    const propertyId = await this.resolvePropertyId(hotelId);
    const seen = new Set<string>();
    let totalChecked = 0;
    let recoveredCount = 0;
    let complete = false;
    let invalidBookings = false;
    // ponytail: limit one recovery to 100 pages/10k bookings; split the time window for larger outages.
    for (let page = 1; page <= 100; page++) {
      const bookingsRes = await this.channexClient.getBookings(
        {
          "filter[property_id]": propertyId,
          "filter[inserted_at][gte]": sinceIsoDate,
          "pagination[limit]": "100",
          "pagination[page]": String(page),
        },
        apiKey,
      );
      const bookings = bookingsRes.data || [];
      if (
        !Array.isArray(bookings) ||
        bookings.length > 100 ||
        (bookingsRes.meta?.page !== undefined && bookingsRes.meta.page !== page) ||
        bookings.some((booking) => !booking.id || seen.has(booking.id))
      ) {
        break;
      }
      for (const booking of bookings) {
        seen.add(booking.id);
        totalChecked++;
        const attributes = booking.attributes ?? {};
        if (attributes.property_id !== propertyId) {
          invalidBookings = true;
          this.logger.warn(`[Channex Recovery] Booking ${booking.id} thuộc property khác; bỏ qua`);
          continue;
        }
        if (!attributes.arrival_date || !attributes.departure_date) {
          invalidBookings = true;
          this.logger.warn("[Channex Recovery] Bỏ qua booking thiếu ngày lưu trú");
          continue;
        }
        const outcome = await this.processSingleRevision(
          {
            id: `recovery:${booking.id}`,
            type: "booking_revision",
            attributes: {
              ...attributes,
              booking_id: booking.id,
              property_id: attributes.property_id ?? propertyId,
              status: "new",
            },
          },
          apiKey,
          false,
        );
        if (outcome.action === "CREATED") recoveredCount++;
      }
      const total = bookingsRes.meta?.total;
      if (typeof total === "number" && Number.isSafeInteger(total) && total >= 0) {
        if (totalChecked >= total) {
          complete = true;
          break;
        }
        if (bookings.length === 0) break;
      } else if (bookings.length < 100) {
        complete = true;
        break;
      }
    }

    return {
      success: complete && !invalidBookings,
      hotelId,
      since: sinceIsoDate,
      totalChecked,
      recoveredCount,
    };
  }

  /**
   * Giả lập một đặt phòng từ sàn OTA (Agoda, Booking.com, v.v.) trực tiếp vào PMS.
   * Channex Staging POST /bookings không khả dụng với PMS client (chỉ OTA thật mới được),
   * nên ta tạo synthetic ChannexRevisionItem và xử lý qua processSingleRevision.
   */
  async simulateOtaBooking(hotelId: string, input: ChannexSimulateBookingDto, apiKey?: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { rooms: true },
    });
    if (!hotel) {
      throw new NotFoundException("Không tìm thấy khách sạn");
    }

    const propertyMapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: {
          hotelId,
          kind: "property",
          localId: hotelId,
        },
      },
    });
    if (!propertyMapping) {
      throw new BadRequestException(
        "Khách sạn chưa đồng bộ với Channex (thiếu Property Mapping). Vui lòng chạy Đồng Bộ Nội Dung trước.",
      );
    }

    // Xác định roomType cần đặt
    const roomTypeMappings = await this.prisma.channexMapping.findMany({
      where: { hotelId, kind: "room_type" },
    });
    if (roomTypeMappings.length === 0) {
      throw new BadRequestException(
        "Chưa có hạng phòng nào được đồng bộ sang Channex. Vui lòng chạy Đồng Bộ Nội Dung trước.",
      );
    }

    const catalogTypes = await this.prisma.roomType.findMany({ where: { hotelId } });
    const typeName = (localId: string) =>
      catalogTypes.find((item) => item.id === localId)?.name ?? localId;
    const targetRoomTypeMapping = input.roomType
      ? roomTypeMappings.find(
          (m) => typeName(m.localId).toLowerCase() === input.roomType?.toLowerCase(),
        )
      : roomTypeMappings[0];

    if (!targetRoomTypeMapping) {
      throw new BadRequestException(
        `Không tìm thấy hạng phòng "${input.roomType}" trong danh sách mapping Channex. Các hạng phòng hiện có: ${roomTypeMappings.map((m) => m.localId).join(", ")}`,
      );
    }

    // Tìm Rate Plan tương ứng (optional — không throw nếu thiếu)
    const ratePlanMapping = await this.prisma.channexMapping.findFirst({
      where: {
        hotelId,
        kind: "rate_plan",
        localId: `${targetRoomTypeMapping.localId}:STANDARD`,
      },
    });

    // Tính ngày check-in / check-out mặc định nếu không truyền
    const now = new Date();
    const checkin =
      input.checkinDate || new Date(now.getTime() + 86400000).toISOString().split("T")[0];
    const checkout =
      input.checkoutDate || new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0];

    // Lấy giá từ phòng thực tế hoặc mặc định
    const selectedCatalog = catalogTypes.find(
      (item) =>
        item.id === targetRoomTypeMapping.localId ||
        item.normalizedKey ===
          typeName(targetRoomTypeMapping.localId)
            .normalize("NFKC")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase(),
    );
    const amountVal =
      input.amount ?? (selectedCatalog?.basePrice ? Number(selectedCatalog.basePrice) * 2 : null);
    if (amountVal === null || !Number.isFinite(amountVal) || amountVal <= 0) {
      throw new BadRequestException(
        "Hạng phòng chưa có giá gốc. Cập nhật danh mục trước khi mô phỏng booking",
      );
    }
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const otaCode = `${input.otaName.toUpperCase()}-${randomSuffix}`;
    const syntheticBookingId = `sim-${Date.now()}-${randomSuffix}`;

    this.logger.log(
      `[Channex Simulate] Bắn đơn test: Property=${propertyMapping.channexId}, Room=${targetRoomTypeMapping.localId}, OTA=${input.otaName}`,
    );

    // Channex Staging POST /bookings => 500 (chỉ OTA thật mới được tạo booking).
    // Tạo synthetic revision object và xử lý qua processSingleRevision để
    // tạo reservation trong DB PMS mà không cần gọi Channex API.
    const syntheticRevision: ChannexRevisionItem = {
      id: `sim-rev-${randomSuffix}`,
      type: "booking_revision",
      attributes: {
        booking_id: syntheticBookingId,
        property_id: propertyMapping.channexId,
        status: "new",
        ota_name: input.otaName,
        ota_reservation_code: otaCode,
        arrival_date: checkin,
        departure_date: checkout,
        currency: "VND",
        amount: String(amountVal),
        payment_collect: "property",
        customer: {
          name: input.customerName || "Khách Test OTA",
          surname: `(${input.otaName})`,
          mail: input.customerEmail || "guest.test@vietsage.vn",
          phone: input.customerPhone || "0901234567",
          country: "VN",
        },
        rooms: [
          {
            room_type_id: targetRoomTypeMapping.channexId,
            rate_plan_id: ratePlanMapping?.channexId || "",
            checkin_date: checkin,
            checkout_date: checkout,
            amount: String(amountVal),
            occupancy: { adults: 2, children: 0, infants: 0 },
          },
        ],
      },
    };

    // acknowledge=false vì đây là synthetic revision, không cần ack Channex
    const outcome = await this.processSingleRevision(syntheticRevision, apiKey, false);

    // Kéo feed thực sau khi tạo reservation để drain bất kỳ đơn thật nào đang chờ
    const drainResult = await this.drainFeed({ hotelId, apiKey });

    const reservation = outcome.reservationId
      ? await this.prisma.reservation.findUnique({
          where: { id: outcome.reservationId },
          select: {
            id: true,
            reservationCode: true,
            status: true,
            roomId: true,
            room: { select: { roomNumber: true } },
            plannedCheckInAt: true,
            plannedCheckOutAt: true,
          },
        })
      : null;

    return {
      success: true,
      channexBookingId: syntheticBookingId,
      otaName: input.otaName,
      otaReservationCode: otaCode,
      roomType: typeName(targetRoomTypeMapping.localId),
      checkinDate: checkin,
      checkoutDate: checkout,
      amount: amountVal,
      feedProcessed: {
        totalProcessed: drainResult.totalProcessed,
        newBookingsCount: drainResult.newBookingsCount,
      },
      reservation: reservation
        ? {
            id: reservation.id,
            bookingCode: reservation.reservationCode,
            status: reservation.status,
            roomId: reservation.roomId,
            roomNumber: reservation.room?.roomNumber ?? null,
            checkInDate: reservation.plannedCheckInAt.toISOString().split("T")[0],
            checkOutDate: reservation.plannedCheckOutAt.toISOString().split("T")[0],
            totalAmount: amountVal,
          }
        : null,
      message: `Đã tạo thành công đơn đặt phòng giả lập (${input.otaName} - ${otaCode}) trực tiếp vào VietSage PMS!`,
    };
  }

  /**
   * Super Admin: Hủy đơn đặt phòng OTA test và giải phóng phòng trong PMS.
   * Tạo synthetic cancellation revision và xử lý qua processSingleRevision,
   * đồng thời phát realtime event channel_booking.cancelled.
   */
  async simulateCancelOtaBooking(hotelId: string, input: ChannexCancelBookingDto, apiKey?: string) {
    let bookingMapping: ChannexMapping | null = null;
    if (input.bookingId) {
      bookingMapping = await this.prisma.channexMapping.findFirst({
        where: { hotelId, kind: "booking", channexId: input.bookingId },
      });
    }
    if (!bookingMapping && input.reservationId) {
      bookingMapping = await this.prisma.channexMapping.findFirst({
        where: { hotelId, kind: "booking", localId: input.reservationId },
      });
    }
    if (!bookingMapping && input.otaReservationCode) {
      const allBookingMappings = await this.prisma.channexMapping.findMany({
        where: { hotelId, kind: "booking" },
      });
      bookingMapping =
        allBookingMappings.find((m) => {
          const meta = m.metadata as any;
          return meta?.otaReservationCode === input.otaReservationCode;
        }) || null;
    }

    if (!bookingMapping) {
      // Fallback: nếu không tìm thấy mapping nhưng có reservationId trong PMS
      if (input.reservationId) {
        const res = await this.prisma.reservation.findUnique({
          where: { id: input.reservationId, hotelId },
          include: { room: true },
        });
        if (!res) {
          throw new BadRequestException("Không tìm thấy đơn đặt phòng để hủy");
        }
        await this.prisma.reservation.update({
          where: { id: res.id },
          data: { status: ReservationStatus.CANCELLED },
        });
        RequestRealtimeEmitter.emitChannelBookingCancelled({
          hotelId,
          bookingId: res.id,
          reservationId: res.id,
          otaName: "PMS",
        });
        return {
          success: true,
          bookingId: res.id,
          reservationId: res.id,
          status: "CANCELLED",
          message: `Đã hủy đơn đặt phòng ${res.reservationCode} thành công!`,
        };
      }
      throw new BadRequestException("Không tìm thấy thông tin đơn đặt phòng OTA để hủy");
    }

    const propertyMapping = await this.prisma.channexMapping.findUnique({
      where: {
        hotelId_kind_localId: { hotelId, kind: "property", localId: hotelId },
      },
      select: { channexId: true },
    });

    if (!propertyMapping) {
      throw new BadRequestException("Khách sạn chưa liên kết Property Channex");
    }

    const meta = (bookingMapping.metadata as any) || {};
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const syntheticRevision: ChannexRevisionItem = {
      id: `sim-rev-cancel-${randomSuffix}`,
      type: "booking_revision",
      attributes: {
        booking_id: bookingMapping.channexId,
        property_id: propertyMapping.channexId,
        status: "cancelled",
        ota_name: meta.otaName || "OTA",
        ota_reservation_code: meta.otaReservationCode || bookingMapping.channexId,
        arrival_date: "",
        departure_date: "",
        currency: meta.currency || "VND",
        amount: String(meta.amount || "0"),
        customer: {
          name: "Khách Đã Hủy",
        },
        rooms: [],
      },
    };

    const outcome = await this.processSingleRevision(syntheticRevision, apiKey, false);

    return {
      success: true,
      bookingId: bookingMapping.channexId,
      reservationId: outcome.reservationId || bookingMapping.localId,
      status: "CANCELLED",
      otaName: meta.otaName || "OTA",
      otaReservationCode: meta.otaReservationCode || bookingMapping.channexId,
      message: `Đã hủy đơn đặt phòng (${meta.otaName || "OTA"} - ${meta.otaReservationCode || bookingMapping.channexId}) thành công và giải phóng phòng trong PMS!`,
    };
  }

  /**
   * Lấy danh sách các đơn đặt phòng OTA gần đây (dành cho Lễ tân và Quản trị)
   */
  async getRecentSimulatedBookings(hotelId: string) {
    const mappings = await this.prisma.channexMapping.findMany({
      where: { hotelId, kind: "booking" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const reservationIds = mappings.map((m) => m.localId);
    const reservations = await this.prisma.reservation.findMany({
      where: { id: { in: reservationIds }, hotelId },
      include: {
        room: { select: { id: true, roomNumber: true, type: true } },
        stay: { select: { id: true, status: true, checkedInAt: true, checkedOutAt: true } },
      },
    });
    const reservationMap = new Map(reservations.map((r) => [r.id, r]));

    return mappings.map((m) => {
      const meta = (m.metadata as any) || {};
      const res = reservationMap.get(m.localId);
      return {
        bookingId: m.channexId,
        reservationId: m.localId,
        reservationCode: res?.reservationCode || meta.otaReservationCode || m.channexId,
        otaName: meta.otaName || "OTA",
        otaReservationCode: meta.otaReservationCode || null,
        guestName: res?.guestDisplayName || "Khách OTA",
        guestPhone: res?.guestPhone || null,
        roomId: res?.roomId || res?.room?.id || null,
        roomType: res?.roomTypeSnapshot || res?.room?.type || null,
        roomNumber: res?.room?.roomNumber || null,
        status: res?.status || "CONFIRMED",
        stayId: res?.stay?.id || null,
        stayStatus: res?.stay?.status || null,
        checkInDate: res?.plannedCheckInAt?.toISOString().split("T")[0] || null,
        checkOutDate: res?.plannedCheckOutAt?.toISOString().split("T")[0] || null,
        amount: meta.amount ? Number(meta.amount) : null,
        currency: meta.currency || "VND",
        createdAt: m.createdAt.toISOString(),
      };
    });
  }
}
