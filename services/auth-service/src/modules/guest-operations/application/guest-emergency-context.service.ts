import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

export type GuestEmergencyContext = {
  sessionId: string;
  guestSessionId: string;
  tenantId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  roomFloor?: string | null;
  stayGuestPhone?: string | null;
};

@Injectable()
export class GuestEmergencyContextService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySessionId(sessionId: string): Promise<GuestEmergencyContext | null> {
    const session = await this.prisma.guestSession.findUnique({
      where: { id: sessionId },
      include: { hotel: true, room: true, stay: true },
    });

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      guestSessionId: session.id,
      tenantId: session.hotel.tenantId,
      hotelId: session.hotelId,
      roomId: session.roomId,
      roomNumber: session.room.roomNumber,
      roomFloor: session.room.floor,
      stayGuestPhone: session.stay.guestPhone,
    };
  }
}
