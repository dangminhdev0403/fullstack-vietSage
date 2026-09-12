import { Injectable } from "@nestjs/common";
import type { KbttHotelConnection } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { kbttUnavailable } from "./kbtt.config";

@Injectable()
export class KbttRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(hotelId: string) {
    try {
      return await this.prisma.kbttHotelConnection.findUnique({ where: { hotelId } });
    } catch {
      throw kbttUnavailable();
    }
  }

  async save(connection: KbttHotelConnection) {
    try {
      return await this.prisma.kbttHotelConnection.upsert({
        where: { hotelId: connection.hotelId },
        create: connection,
        update: connection,
      });
    } catch {
      throw kbttUnavailable();
    }
  }

  async update(
    connection: KbttHotelConnection,
    data: Partial<
      Omit<KbttHotelConnection, "hotelId" | "ciphertext" | "iv" | "authTag" | "keyVersion">
    >,
  ) {
    try {
      const result = await this.prisma.kbttHotelConnection.updateMany({
        where: { hotelId: connection.hotelId, ciphertext: connection.ciphertext },
        data,
      });
      if (result.count !== 1) throw kbttUnavailable();
      return { ...connection, ...data };
    } catch {
      throw kbttUnavailable();
    }
  }

  async remove(hotelId: string) {
    try {
      await this.prisma.kbttHotelConnection.deleteMany({ where: { hotelId } });
    } catch {
      throw kbttUnavailable();
    }
  }
}
