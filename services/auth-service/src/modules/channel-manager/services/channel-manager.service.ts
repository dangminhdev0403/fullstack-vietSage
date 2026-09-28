import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateChannelConnectionDto,
  UpdateChannelConnectionDto,
} from "../domain/schemas/channel-manager.schema";
import { IcalService, IcalSyncResult } from "./ical.service";

@Injectable()
export class ChannelManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly icalService: IcalService,
  ) {}

  /**
   * Tạo kết nối kênh mới (Airbnb, Booking.com, Agoda, Direct Booking)
   */
  async createConnection(hotelId: string, dto: CreateChannelConnectionDto) {
    const outboundToken = randomBytes(16).toString("hex");

    return this.prisma.channelConnection.create({
      data: {
        hotelId,
        channelCode: dto.channelCode,
        title: dto.title,
        inboundIcalUrl: dto.inboundIcalUrl || null,
        outboundToken,
        priceMultiplier: dto.priceMultiplier ?? 1.0,
        roomMappings: {
          create: (dto.roomMappings || []).map((m) => ({
            roomId: m.roomId || null,
            roomType: m.roomType || null,
            channelRoomCode: m.channelRoomCode,
            channelRoomName: m.channelRoomName,
          })),
        },
      },
      include: {
        roomMappings: true,
      },
    });
  }

  /**
   * Lấy danh sách kết nối kênh của khách sạn
   */
  async getConnections(hotelId: string) {
    return this.prisma.channelConnection.findMany({
      where: { hotelId },
      include: {
        roomMappings: true,
        syncLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Lấy chi tiết một kết nối kênh
   */
  async getConnectionById(hotelId: string, id: string) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: { id, hotelId },
      include: {
        roomMappings: true,
        syncLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!connection) {
      throw new NotFoundException("Không tìm thấy kết nối kênh yêu cầu");
    }

    return connection;
  }

  /**
   * Cập nhật thông tin kết nối và room mappings
   */
  async updateConnection(hotelId: string, id: string, dto: UpdateChannelConnectionDto) {
    await this.getConnectionById(hotelId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.roomMappings) {
        await tx.channelRoomMapping.deleteMany({
          where: { channelConnectionId: id },
        });

        if (dto.roomMappings.length > 0) {
          await tx.channelRoomMapping.createMany({
            data: dto.roomMappings.map((m) => ({
              channelConnectionId: id,
              roomId: m.roomId || null,
              roomType: m.roomType || null,
              channelRoomCode: m.channelRoomCode,
              channelRoomName: m.channelRoomName,
            })),
          });
        }
      }

      return tx.channelConnection.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.inboundIcalUrl !== undefined
            ? { inboundIcalUrl: dto.inboundIcalUrl || null }
            : {}),
          ...(dto.priceMultiplier !== undefined ? { priceMultiplier: dto.priceMultiplier } : {}),
        },
        include: {
          roomMappings: true,
        },
      });
    });
  }

  /**
   * Xóa kết nối kênh
   */
  async deleteConnection(hotelId: string, id: string) {
    await this.getConnectionById(hotelId, id);

    return this.prisma.channelConnection.delete({
      where: { id },
    });
  }

  /**
   * Thực hiện đồng bộ ngay lập tức cho 1 kết nối
   */
  async syncNow(id: string): Promise<IcalSyncResult> {
    return this.icalService.syncInboundIcal(id);
  }
}
