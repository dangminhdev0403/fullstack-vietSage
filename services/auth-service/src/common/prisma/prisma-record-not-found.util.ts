import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function isPrismaRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function mapPrismaRecordNotFound<T>(
  operation: Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (isPrismaRecordNotFound(error)) {
      throw new BadRequestException(message);
    }

    throw error;
  }
}
