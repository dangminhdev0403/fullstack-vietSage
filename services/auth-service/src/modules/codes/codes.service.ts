import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CodesRepository } from "./codes.repository";

@Injectable()
export class CodesService {
  constructor(private readonly codesRepository: CodesRepository) {}

  async generateEntityCode(name: string, tx?: Prisma.TransactionClient): Promise<string> {
    const normalizedName = name.trim().toUpperCase();
    const updated = await this.codesRepository.generateEntityCode(normalizedName, tx);
    if (!updated) {
      throw new NotFoundException("Không tìm thấy chuỗi mã" + normalizedName);
    }

    const currentSequence = updated.sequenceNext;
    return `VSH_${normalizedName}_${currentSequence.toString().padStart(4, "0")}`;
  }
}
