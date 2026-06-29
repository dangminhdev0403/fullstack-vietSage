import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type PrismaClientLike = PrismaService | Prisma.TransactionClient;
type CodeSequenceSnapshot = {
  id: string;
  name: string;
  sequenceNext: number;
};

@Injectable()
export class CodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async generateEntityCode(name: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      return this.reserveCodeSequence(name, tx);
    }

    return this.prisma.$transaction((transaction) => this.reserveCodeSequence(name, transaction));
  }

  async reserveCodeSequence(name: string, client: PrismaClientLike) {
    const rows = await client.$queryRaw<CodeSequenceSnapshot[]>(Prisma.sql`
      SELECT "id", "name", "sequenceNext"
      FROM "Code"
      WHERE "name" = ${name} AND "isActive" = true
      FOR UPDATE
    `);

    const code = rows[0] ?? null;
    if (!code) {
      return null;
    }

    await client.code.update({
      where: { id: code.id },
      data: { sequenceNext: { increment: 1 } },
      select: { id: true },
    });

    return code;
  }
}
