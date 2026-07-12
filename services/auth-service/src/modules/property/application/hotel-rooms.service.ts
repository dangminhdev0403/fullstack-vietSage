import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GuestStayStatus, Prisma, RoomQRCodeStatus, RoomStatus } from "@prisma/client";
import {
  addHours,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../common/security/token-hash.util";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { CodesService } from "../../codes/codes.service";
import { HotelAccessService } from "./hotel-access.service";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";
import type { RoomListRow } from "../infrastructure/repositories/hotel-repository.types";
import type {
  CheckOutBodyInput,
  CreateRoomBodyInput,
  CreateRoomsBodyInput,
  CreateStayBodyInput,
  ListRoomsQueryInput,
  QrReasonBodyInput,
  UpdateRoomBodyInput,
} from "../domain/schemas/rooms.schema";

@Injectable()
export class HotelRoomsService {
  constructor(
    private readonly hotelRoomsRepository: HotelRoomsRepository,
    private readonly codesService: CodesService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}
  async createRoom(actorUserId: string, hotelId: string, dto: CreateRoomBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    return this.createRoomRecord(hotelId, dto);
  }

  async createRooms(actorUserId: string, hotelId: string, dto: CreateRoomsBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const items: Array<Awaited<ReturnType<typeof this.createRoomRecord>>> = [];

    for (const item of dto.items) {
      items.push(await this.createRoomRecord(hotelId, item));
    }

    return { total: items.length, items };
  }

  private async createRoomRecord(hotelId: string, dto: CreateRoomBodyInput) {
    const roomCode = await this.codesService.generateEntityCode("ROOM");
    const publicCode = this.generateQrCode();
    const room = await this.hotelRoomsRepository.createRoomWithQr({
      hotelId,
      code: roomCode,
      roomNumber: dto.roomNumber.trim(),
      floor: dto.floor?.trim(),
      type: dto.type?.trim(),
      price: dto.price,
      maxActiveGuestDevices: dto.maxActiveGuestDevices,
      publicCode,
    });

    this.logBusinessEvent("Room created with initial QR code", "ROOM_CREATED", "createRoomRecord", {
      hotelId,
      roomId: room.id,
      roomNumber: room.roomNumber,
      qrCodeId: room.qrCodes[0]?.id,
    });
    return this.toRoomData(room);
  }

  async listRooms(actorUserId: string, hotelId: string, query: ListRoomsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.RoomWhereInput = {
      hotelId,
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.roomNumber = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelRoomsRepository.listRooms(
      where,
      (page - 1) * limit,
      limit,
    );
    return { page, limit, total, items: rows.map((row) => this.toRoomData(row)) };
  }

  async updateRoom(actorUserId: string, hotelId: string, roomId: string, dto: UpdateRoomBodyInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const room = await this.hotelRoomsRepository.updateRoomInHotel(hotelId, roomId, {
      roomNumber: dto.roomNumber?.trim(),
      floor: dto.floor === null ? null : dto.floor?.trim(),
      type: dto.type === null ? null : dto.type?.trim(),
      price: dto.price,
      maxActiveGuestDevices: dto.maxActiveGuestDevices,
      status: dto.status,
    } satisfies Prisma.RoomUpdateInput);

    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    this.logBusinessEvent("Room updated", "ROOM_UPDATED", "updateRoom", {
      actorUserId,
      hotelId,
      roomId,
      status: room.status,
    });
    return this.toRoomData(room);
  }

  async createStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, dto.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.AVAILABLE && room.status !== RoomStatus.PROCESSING) {
      throw new BadRequestException("Phòng không khả dụng để đặt giữ chỗ");
    }

    const stay = await this.hotelRoomsRepository.createStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      tenantId: hotel.tenantId,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return this.toStayData(stay);
  }

  async checkInStay(actorUserId: string, hotelId: string, stayId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const stay = await this.hotelRoomsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }

    if (stay.status !== GuestStayStatus.RESERVED && stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-in lượt lưu trú từ trạng thái hiện tại");
    }

    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, stay.roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    if (room.status !== RoomStatus.PROCESSING && room.status !== RoomStatus.AVAILABLE) {
      throw new ConflictException("Phòng chưa sẵn sàng để check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelRoomsRepository.checkInStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async createAndCheckInStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    if (!dto.guestDisplayName?.trim()) {
      throw new BadRequestException("Tên khách là bắt buộc để check-in");
    }

    if (dto.plannedCheckOutAt <= dto.plannedCheckInAt) {
      throw new BadRequestException("Thời gian check-out phải sau thời gian check-in");
    }

    const accessCode = this.generateAccessCode();
    const result = await this.hotelRoomsRepository.createAndCheckInStay({
      hotelId,
      roomId: dto.roomId,
      guestDisplayName: dto.guestDisplayName.trim(),
      guestPhone: dto.guestPhone?.trim(),
      plannedCheckInAt: dto.plannedCheckInAt,
      plannedCheckOutAt: dto.plannedCheckOutAt,
      createdByUserId: actorUserId,
      actorUserId,
      accessCodeHash: hashOpaqueToken(accessCode),
      accessCodeExpiresAt: addHours(new Date(), 24),
      tenantId: hotel.tenantId,
      generateReservationCode: (tx) => this.codesService.generateEntityCode("RESERVATION", tx),
      generateFolioNumber: (tx) => this.codesService.generateEntityCode("FOLIO", tx),
    });

    return {
      stay: this.toStayData(result.stay),
      roomQrCode: this.toQrData(result.roomQrCode),
      accessCode,
    };
  }

  async checkOutStay(actorUserId: string, hotelId: string, stayId: string, dto: CheckOutBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const stay = await this.hotelRoomsRepository.findStayInHotel(hotelId, stayId);
    if (!stay) {
      throw new NotFoundException("Không tìm thấy lượt lưu trú");
    }

    if (stay.status !== GuestStayStatus.ACTIVE) {
      throw new BadRequestException("Không thể check-out lượt lưu trú từ trạng thái hiện tại");
    }

    const blockingFolio = await this.hotelRoomsRepository.findBlockingBillingFolio(hotelId, stayId);
    if (blockingFolio) {
      throw new ConflictException("Please complete billing checkout before closing the stay.");
    }

    const checkedOut = await this.hotelRoomsRepository.checkOutStay({
      hotelId,
      stayId,
      roomId: stay.roomId,
      actorUserId,
      tenantId: hotel.tenantId,
      nextRoomStatus: dto.nextRoomStatus ?? RoomStatus.AVAILABLE,
    });

    return this.toStayData(checkedOut);
  }

  async rotateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);

    const publicCode = this.generateQrCode();
    const qr = await this.hotelRoomsRepository.rotateQr({
      hotelId,
      roomId,
      publicCode,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return this.toQrData(qr);
  }

  async activateQr(actorUserId: string, hotelId: string, roomId: string) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);
    const qr = await this.hotelRoomsRepository.activateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      publicCode: this.generateQrCode(),
    });
    return this.toQrData(qr);
  }

  async deactivateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertRoomInHotel(hotelId, roomId);
    const result = await this.hotelRoomsRepository.deactivateQr({
      hotelId,
      roomId,
      tenantId: hotel.tenantId,
      reason: dto.reason?.trim(),
    });

    return { deactivated: result.count };
  }

  private async assertRoomInHotel(hotelId: string, roomId: string) {
    const room = await this.hotelRoomsRepository.findRoomInHotel(hotelId, roomId);
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng");
    }

    return room;
  }

  private logBusinessEvent(
    message: string,
    event: string,
    operation: string,
    metadata: Record<string, unknown>,
  ): void {
    this.logger.info(message, {
      module: "hotels",
      service: "HotelRoomsService",
      operation,
      event,
      ...metadata,
    });
  }

  private generateQrCode(): string {
    return generateOpaqueToken(24);
  }

  private generateAccessCode(): string {
    return generateOpaqueToken(9).slice(0, 12).toUpperCase();
  }

  private toRoomData(row: RoomListRow) {
    const latestQr = row.qrCodes[0] ?? null;
    const activeStay = row.guestStays[0] ?? null;

    return {
      id: row.id,
      hotelId: row.hotelId,
      code: row.code,
      roomNumber: row.roomNumber,
      floor: row.floor,
      type: row.type,
      price: row.price,
      maxActiveGuestDevices: row.maxActiveGuestDevices ?? 3,
      activeGuestDeviceCount: row.activeGuestDeviceCount,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      qr: latestQr ? this.toQrData(latestQr) : null,
      activeStay: activeStay ? this.toStayData(activeStay) : null,
    };
  }

  private toStayData(row: {
    id: string;
    hotelId: string;
    roomId: string;
    reservationCode: string;
    guestDisplayName: string;
    guestPhone?: string | null;
    guestPhoneMasked?: string | null;
    status: GuestStayStatus;
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    checkedInAt: Date | null;
    activatedAt: Date | null;
    checkedOutAt: Date | null;
    accessCodeExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      reservationCode: row.reservationCode,
      guestDisplayName: row.guestDisplayName,
      guestPhone: row.guestPhone ?? row.guestPhoneMasked ?? null,
      status: row.status,
      plannedCheckInAt: row.plannedCheckInAt,
      plannedCheckOutAt: row.plannedCheckOutAt,
      checkedInAt: row.checkedInAt,
      activatedAt: row.activatedAt,
      checkedOutAt: row.checkedOutAt,
      accessCodeExpiresAt: row.accessCodeExpiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toQrData(row: {
    id: string;
    hotelId: string;
    roomId: string;
    publicCode: string;
    status: RoomQRCodeStatus;
    version: number;
    activatedAt: Date | null;
    deactivatedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      roomId: row.roomId,
      publicCode: row.publicCode,
      status: row.status,
      version: row.version,
      activatedAt: row.activatedAt,
      deactivatedAt: row.deactivatedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
