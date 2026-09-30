import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

export interface IcalSyncResult {
  success: boolean;
  eventsCount: number;
  connectionId: string;
  syncedAt: Date;
  message?: string;
}

export interface ParsedIcalEvent {
  uid: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  summary: string;
  status: string;
}

@Injectable()
export class IcalService {
  private readonly logger = new Logger(IcalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Định dạng Date thành chuỗi iCal DATE (YYYYMMDD)
   */
  private formatDateToIcalDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  /**
   * Định dạng Date thành chuỗi iCal DATETIME UTC (YYYYMMDDTHHMMSSZ)
   */
  private formatDateToIcalDateTime(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const mm = String(date.getUTCMinutes()).padStart(2, "0");
    const ss = String(date.getUTCSeconds()).padStart(2, "0");
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
  }

  /**
   * Sinh file iCal (RFC 5545) theo token outbound
   */
  async generateOutboundIcalByToken(outboundToken: string): Promise<string> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { outboundToken },
      include: {
        hotel: true,
        roomMappings: true,
      },
    });

    if (!connection) {
      throw new NotFoundException("Kết nối Channel Manager với token này không tồn tại");
    }

    return this.generateOutboundIcal(connection.hotelId, outboundToken);
  }

  /**
   * Sinh nội dung lịch RFC 5545 chứa các khoảng thời gian đã đặt hoặc đã chặn phòng
   */
  async generateOutboundIcal(hotelId: string, outboundToken: string): Promise<string> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { outboundToken },
      include: {
        hotel: true,
        roomMappings: true,
      },
    });

    if (!connection || connection.hotelId !== hotelId) {
      throw new NotFoundException("Không tìm thấy kết nối hoặc token không khớp khách sạn");
    }

    if (connection.status === "PAUSED") {
      throw new BadRequestException("Kết nối kênh đang ở trạng thái TẠM DỪNG (PAUSED)");
    }

    const now = new Date();
    const dtstamp = this.formatDateToIcalDateTime(now);

    // Lấy danh sách phòng mapped nếu có
    const mappedRoomIds = connection.roomMappings
      .map((m) => m.roomId)
      .filter((id): id is string => Boolean(id));

    // 1. Lấy danh sách đặt phòng đang hoạt động (CONFIRMED, ARRIVAL_READY, CHECKED_IN)
    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        status: {
          in: ["CONFIRMED", "ARRIVAL_READY", "CHECKED_IN"],
        },
        ...(mappedRoomIds.length > 0 ? { roomId: { in: mappedRoomIds } } : {}),
      },
      select: {
        id: true,
        reservationCode: true,
        guestDisplayName: true,
        plannedCheckInAt: true,
        plannedCheckOutAt: true,
        roomId: true,
      },
    });

    // 2. Lấy các khoảng phòng bị chặn (ChannelDailyAvailability có blockedRooms > 0)
    const blockedAvailabilities = await this.prisma.channelDailyAvailability.findMany({
      where: {
        hotelId,
        blockedRooms: { gt: 0 },
        date: { gte: new Date(now.toISOString().split("T")[0]) },
      },
    });

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//VietSage//Channel Manager 1.0//VI",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:VietSage - ${connection.title}`,
      "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    ];

    let eventsCount = 0;

    // Xuất VEVENT cho các đặt phòng
    for (const res of reservations) {
      const checkIn = new Date(res.plannedCheckInAt);
      const checkOut = new Date(res.plannedCheckOutAt);

      // Đảm bảo checkOut tối thiểu sau checkIn 1 ngày trong iCal
      if (checkOut <= checkIn) {
        checkOut.setUTCDate(checkIn.getUTCDate() + 1);
      }

      const dtStart = this.formatDateToIcalDate(checkIn);
      const dtEnd = this.formatDateToIcalDate(checkOut);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:res-${res.id}@vietsage.com`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:Reserved - VietSage (${res.reservationCode})`);
      lines.push(
        `DESCRIPTION:Đặt phòng mã ${res.reservationCode} - Khách: ${res.guestDisplayName || "Khách"}`,
      );
      lines.push("STATUS:CONFIRMED");
      lines.push("END:VEVENT");
      eventsCount++;
    }

    // Xuất VEVENT cho các ngày bị chặn
    for (const av of blockedAvailabilities) {
      const dtStart = this.formatDateToIcalDate(av.date);
      const nextDay = new Date(av.date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dtEnd = this.formatDateToIcalDate(nextDay);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:block-${av.id}@vietsage.com`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:Blocked - ${av.roomType} (${av.blockedRooms} phòng)`);
      lines.push("STATUS:CONFIRMED");
      lines.push("END:VEVENT");
      eventsCount++;
    }

    lines.push("END:VCALENDAR");

    // Ghi log đồng bộ outbound
    await this.prisma.channelSyncLog.create({
      data: {
        hotelId,
        channelConnectionId: connection.id,
        syncType: "OUTBOUND_ICAL",
        status: "SUCCESS",
        eventsCount,
        details: `Sinh file iCal outbound với ${eventsCount} sự kiện`,
      },
    });

    return lines.join("\r\n") + "\r\n";
  }

  /**
   * Parse chuỗi iCal thô trích xuất các VEVENT
   */
  parseIcalFeed(icalText: string): ParsedIcalEvent[] {
    const events: ParsedIcalEvent[] = [];
    const eventBlocks = icalText.split(/BEGIN:VEVENT/i);

    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split(/END:VEVENT/i)[0];
      if (!block) continue;

      const uidMatch = block.match(/UID:(.+?)(?:\r?\n|$)/i);
      const dtstartMatch = block.match(/DTSTART(?:;VALUE=DATE|;TZID=[^:]+)?:(\d{8}(?:T\d{6}Z?)?)/i);
      const dtendMatch = block.match(/DTEND(?:;VALUE=DATE|;TZID=[^:]+)?:(\d{8}(?:T\d{6}Z?)?)/i);
      const summaryMatch = block.match(/SUMMARY:(.+?)(?:\r?\n|$)/i);
      const statusMatch = block.match(/STATUS:(.+?)(?:\r?\n|$)/i);

      if (dtstartMatch) {
        const rawStart = dtstartMatch[1];
        const startDate = `${rawStart.substring(0, 4)}-${rawStart.substring(4, 6)}-${rawStart.substring(6, 8)}`;

        let endDate = startDate;
        if (dtendMatch) {
          const rawEnd = dtendMatch[1];
          endDate = `${rawEnd.substring(0, 4)}-${rawEnd.substring(4, 6)}-${rawEnd.substring(6, 8)}`;
        } else {
          // Mặc định 1 đêm
          const d = new Date(`${startDate}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          endDate = d.toISOString().split("T")[0];
        }

        const status = statusMatch ? statusMatch[1].trim().toUpperCase() : "CONFIRMED";
        if (status !== "CANCELLED") {
          events.push({
            uid: uidMatch ? uidMatch[1].trim() : `event-${i}-${startDate}`,
            startDate,
            endDate,
            summary: summaryMatch ? summaryMatch[1].trim() : "Channel Booking / Block",
            status,
          });
        }
      }
    }

    return events;
  }

  /**
   * Đồng bộ inbound iCal từ URL kênh (Airbnb, Booking.com, Agoda...)
   */
  async syncInboundIcal(connectionId: string): Promise<IcalSyncResult> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        hotel: true,
        roomMappings: true,
      },
    });

    if (!connection) {
      throw new NotFoundException("Kết nối kênh không tồn tại");
    }

    if (!connection.inboundIcalUrl) {
      const errMsg = "Kết nối chưa cấu hình inboundIcalUrl";
      await this.prisma.channelConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "ERROR",
          syncErrorMessage: errMsg,
        },
      });
      throw new BadRequestException(errMsg);
    }

    try {
      // 1. Tải nội dung file iCal từ URL
      const response = await fetch(connection.inboundIcalUrl, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Tải iCal thất bại với HTTP status: ${response.status}`);
      }

      const icalContent = await response.text();
      const events = this.parseIcalFeed(icalContent);

      // 2. Xác định các roomType mục tiêu từ mapping hoặc mặc định
      const mappedRoomTypes = connection.roomMappings
        .map((m) => m.roomType)
        .filter((t): t is string => Boolean(t));
      if (mappedRoomTypes.length === 0) {
        throw new BadRequestException("Kết nối iCal chưa ánh xạ hạng phòng trong DB");
      }
      const targetRoomTypes = mappedRoomTypes;

      // 3. Với mỗi event, tính toán các ngày bị chặn và cập nhật ChannelDailyAvailability
      for (const event of events) {
        const cur = new Date(`${event.startDate}T00:00:00.000Z`);
        const end = new Date(`${event.endDate}T00:00:00.000Z`);

        // Duyệt từng ngày từ check-in đến check-out (ngày check-out không tính)
        while (cur < end) {
          const date = new Date(cur);

          for (const roomType of targetRoomTypes) {
            const existing = await this.prisma.channelDailyAvailability.findUnique({
              where: {
                hotelId_roomType_date: {
                  hotelId: connection.hotelId,
                  roomType,
                  date,
                },
              },
            });

            const total =
              existing?.totalRooms ??
              (await this.prisma.room.count({
                where: { hotelId: connection.hotelId, type: roomType },
              }));
            if (total === 0) {
              throw new BadRequestException(`Hạng phòng ${roomType} không có phòng thật trong DB`);
            }
            const booked = existing ? existing.bookedRooms : 0;
            const blocked = Math.max(existing ? existing.blockedRooms : 0, 1);
            const override = existing ? existing.overrideAvailable : null;
            const available = override !== null ? override : Math.max(0, total - booked - blocked);

            await this.prisma.channelDailyAvailability.upsert({
              where: {
                hotelId_roomType_date: {
                  hotelId: connection.hotelId,
                  roomType,
                  date,
                },
              },
              create: {
                hotelId: connection.hotelId,
                roomType,
                date,
                totalRooms: total,
                bookedRooms: booked,
                blockedRooms: blocked,
                availableRooms: available,
                overrideAvailable: override,
              },
              update: {
                blockedRooms: blocked,
                availableRooms: available,
              },
            });
          }

          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      const syncedAt = new Date();

      // Cập nhật trạng thái kết nối
      await this.prisma.channelConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: syncedAt,
          lastSyncStatus: "SUCCESS",
          syncErrorMessage: null,
          status: connection.status === "ERROR" ? "ACTIVE" : connection.status,
        },
      });

      // Ghi log đồng bộ
      await this.prisma.channelSyncLog.create({
        data: {
          hotelId: connection.hotelId,
          channelConnectionId: connection.id,
          syncType: "INBOUND_ICAL",
          status: "SUCCESS",
          eventsCount: events.length,
          details: `Đồng bộ thành công ${events.length} sự kiện từ iCal`,
        },
      });

      return {
        success: true,
        eventsCount: events.length,
        connectionId,
        syncedAt,
      };
    } catch (error: any) {
      const errorMsg = error?.message || "Lỗi không xác định khi đồng bộ iCal";
      this.logger.error(`Lỗi đồng bộ inbound iCal cho connection ${connectionId}: ${errorMsg}`);

      await this.prisma.channelConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "ERROR",
          syncErrorMessage: errorMsg,
          status: "ERROR",
        },
      });

      await this.prisma.channelSyncLog.create({
        data: {
          hotelId: connection.hotelId,
          channelConnectionId: connection.id,
          syncType: "INBOUND_ICAL",
          status: "FAILED",
          eventsCount: 0,
          details: errorMsg,
        },
      });

      throw new BadRequestException(`Đồng bộ iCal thất bại: ${errorMsg}`);
    }
  }
}
