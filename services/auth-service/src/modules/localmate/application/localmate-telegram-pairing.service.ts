import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import type { TelegramStartPairingInput } from "../domain/schemas/localmate-telegram.schema";

const PAIRING_TOKEN_TTL_SECONDS = 600; // 10 minutes

@Injectable()
export class LocalMateTelegramPairingService {
  constructor(private readonly prisma: PrismaService) {}

  async createPairingLinkForProfile(profileId: string) {
    const profile = await this.prisma.localMateProfile.findUnique({
      where: { id: profileId },
      select: { id: true, fullName: true, status: true },
    });
    if (!profile) {
      throw new NotFoundException("Không tìm thấy hồ sơ LocalMate");
    }

    // Invalidate prior unconsumed tokens
    await this.prisma.localMateTelegramPairingToken.deleteMany({
      where: {
        localMateProfileId: profile.id,
        consumedAt: null,
      },
    });

    const rawToken = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.localMateTelegramPairingToken.create({
      data: {
        localMateProfileId: profile.id,
        tokenHash,
        expiresAt,
      },
    });

    const botUsername =
      process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() || "viet_sage_bot";
    const pairingUrl = `https://t.me/${botUsername}?start=${rawToken}`;

    return {
      pairingUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: PAIRING_TOKEN_TTL_SECONDS,
    };
  }

  async createPairingLink(userId: string) {
    const profile = await this.prisma.localMateProfile.findUnique({
      where: { userId },
      select: { id: true, fullName: true, status: true },
    });
    if (!profile) {
      throw new NotFoundException("Không tìm thấy hồ sơ LocalMate cho tài khoản này");
    }

    return this.createPairingLinkForProfile(profile.id);
  }

  async handleStartPairing(input: TelegramStartPairingInput) {
    if (input.chatType !== "private") {
      throw new BadRequestException("Chỉ hỗ trợ liên kết qua cuộc trò chuyện riêng tư với Bot");
    }

    const tokenHash = createHash("sha256").update(input.token).digest("hex");

    const tokenRecord = await this.prisma.localMateTelegramPairingToken.findUnique({
      where: { tokenHash },
      include: { localMateProfile: true },
    });

    if (!tokenRecord || tokenRecord.consumedAt != null) {
      throw new BadRequestException("Mã liên kết không hợp lệ hoặc đã được sử dụng");
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException("Mã liên kết đã hết hạn");
    }

    // Check conflict: Telegram user or chat bound to a DIFFERENT active LocalMate profile
    const conflictingUser = await this.prisma.localMateTelegramBinding.findFirst({
      where: {
        telegramUserId: input.telegramUserId,
        localMateProfileId: { not: tokenRecord.localMateProfileId },
        revokedAt: null,
      },
    });
    if (conflictingUser) {
      throw new ConflictException(
        "Tài khoản Telegram này đã được liên kết với một hướng dẫn viên khác",
      );
    }

    const conflictingChat = await this.prisma.localMateTelegramBinding.findFirst({
      where: {
        telegramChatId: input.telegramChatId,
        localMateProfileId: { not: tokenRecord.localMateProfileId },
        revokedAt: null,
      },
    });
    if (conflictingChat) {
      throw new ConflictException(
        "Cuộc trò chuyện Telegram này đã được liên kết với một hướng dẫn viên khác",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.localMateTelegramPairingToken.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() },
      });

      await tx.localMateTelegramBinding.upsert({
        where: { localMateProfileId: tokenRecord.localMateProfileId },
        create: {
          localMateProfileId: tokenRecord.localMateProfileId,
          telegramUserId: input.telegramUserId,
          telegramChatId: input.telegramChatId,
          pairedAt: new Date(),
          revokedAt: null,
          blockedAt: null,
        },
        update: {
          telegramUserId: input.telegramUserId,
          telegramChatId: input.telegramChatId,
          pairedAt: new Date(),
          revokedAt: null,
          blockedAt: null,
        },
      });
    });

    return {
      success: true,
      localMateProfileId: tokenRecord.localMateProfileId,
      fullName: tokenRecord.localMateProfile.fullName,
    };
  }

  async disconnectForProfile(profileId: string) {
    const profile = await this.prisma.localMateProfile.findUnique({
      where: { id: profileId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Không tìm thấy hồ sơ LocalMate");
    }

    const binding = await this.prisma.localMateTelegramBinding.findUnique({
      where: { localMateProfileId: profile.id },
    });
    if (!binding || binding.revokedAt != null) {
      return { disconnected: true, alreadyDisconnected: true };
    }

    await this.prisma.localMateTelegramBinding.update({
      where: { localMateProfileId: profile.id },
      data: { revokedAt: new Date() },
    });

    return { disconnected: true, alreadyDisconnected: false };
  }

  async disconnect(userId: string) {
    const profile = await this.prisma.localMateProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Không tìm thấy hồ sơ LocalMate");
    }

    return this.disconnectForProfile(profile.id);
  }

  async getBindingStatus(userId: string) {
    const profile = await this.prisma.localMateProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException("Không tìm thấy hồ sơ LocalMate");
    }

    const binding = await this.prisma.localMateTelegramBinding.findUnique({
      where: { localMateProfileId: profile.id },
    });

    const isBound = Boolean(binding && !binding.revokedAt && !binding.blockedAt);

    return {
      isBound,
      pairedAt: binding?.pairedAt ?? null,
      revokedAt: binding?.revokedAt ?? null,
      blockedAt: binding?.blockedAt ?? null,
    };
  }
}
