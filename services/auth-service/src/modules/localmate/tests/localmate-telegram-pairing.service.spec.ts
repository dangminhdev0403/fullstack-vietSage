import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { LocalMateTelegramPairingService } from "../application/localmate-telegram-pairing.service";

describe("T2 - LocalMate Telegram Pairing Service", () => {
  describe("createPairingLink", () => {
    it("generates an opaque one-time pairing link and stores hash", async () => {
      const mockProfile = { id: "profile-1", fullName: "Giàng A Mẩy", status: "QUALIFIED" };
      let createdData: any = null;

      const prisma = {
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue(mockProfile),
        },
        localMateTelegramPairingToken: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockImplementation(({ data }) => {
            createdData = data;
            return { id: "token-row-1", ...data };
          }),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      const result = await service.createPairingLink("user-1");

      expect(result.pairingUrl).toContain("https://t.me/");
      expect(result.pairingUrl).toContain("start=");
      expect(result.expiresInSeconds).toBe(600);
      expect(createdData).toBeDefined();
      expect(createdData.localMateProfileId).toBe("profile-1");
      expect(createdData.tokenHash).toHaveLength(64); // SHA-256
    });

    it("throws NotFoundException if user has no LocalMate profile", async () => {
      const prisma = {
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      await expect(service.createPairingLink("user-none")).rejects.toThrow(NotFoundException);
    });
  });

  describe("handleStartPairing", () => {
    const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef";
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    it("binds Telegram user and chat atomically on first private /start", async () => {
      const validTokenRecord = {
        id: "tok-1",
        localMateProfileId: "profile-1",
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        localMateProfile: { id: "profile-1", fullName: "Giàng A Mẩy" },
      };

      const tx = {
        localMateTelegramPairingToken: {
          update: jest.fn().mockResolvedValue({}),
        },
        localMateTelegramBinding: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        localMateTelegramPairingToken: {
          findUnique: jest.fn().mockResolvedValue(validTokenRecord),
        },
        localMateTelegramBinding: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      const result = await service.handleStartPairing({
        token: rawToken,
        telegramUserId: "tg-user-123",
        telegramChatId: "tg-chat-123",
        chatType: "private",
      });

      expect(result.success).toBe(true);
      expect(result.fullName).toBe("Giàng A Mẩy");
      expect(tx.localMateTelegramPairingToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tok-1" },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      expect(tx.localMateTelegramBinding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { localMateProfileId: "profile-1" },
          create: expect.objectContaining({
            telegramUserId: "tg-user-123",
            telegramChatId: "tg-chat-123",
          }),
        }),
      );
    });

    it("rejects non-private chat", async () => {
      const service = new LocalMateTelegramPairingService({} as never);
      await expect(
        service.handleStartPairing({
          token: rawToken,
          telegramUserId: "tg-user-123",
          telegramChatId: "tg-group-456",
          chatType: "group" as never,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects expired token", async () => {
      const expiredRecord = {
        id: "tok-exp",
        localMateProfileId: "profile-1",
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // in the past
        consumedAt: null,
      };

      const prisma = {
        localMateTelegramPairingToken: {
          findUnique: jest.fn().mockResolvedValue(expiredRecord),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      await expect(
        service.handleStartPairing({
          token: rawToken,
          telegramUserId: "tg-user-123",
          telegramChatId: "tg-chat-123",
          chatType: "private",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects replayed / already-consumed token", async () => {
      const consumedRecord = {
        id: "tok-consumed",
        localMateProfileId: "profile-1",
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: new Date(Date.now() - 10_000),
      };

      const prisma = {
        localMateTelegramPairingToken: {
          findUnique: jest.fn().mockResolvedValue(consumedRecord),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      await expect(
        service.handleStartPairing({
          token: rawToken,
          telegramUserId: "tg-user-123",
          telegramChatId: "tg-chat-123",
          chatType: "private",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects if Telegram user is already bound to another active profile", async () => {
      const validTokenRecord = {
        id: "tok-1",
        localMateProfileId: "profile-1",
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        localMateProfile: { id: "profile-1", fullName: "Giàng A Mẩy" },
      };

      const conflictingBinding = {
        id: "bind-other",
        localMateProfileId: "profile-other",
        telegramUserId: "tg-user-123",
        telegramChatId: "tg-chat-other",
        revokedAt: null,
      };

      const prisma = {
        localMateTelegramPairingToken: {
          findUnique: jest.fn().mockResolvedValue(validTokenRecord),
        },
        localMateTelegramBinding: {
          findFirst: jest.fn().mockResolvedValue(conflictingBinding),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      await expect(
        service.handleStartPairing({
          token: rawToken,
          telegramUserId: "tg-user-123",
          telegramChatId: "tg-chat-123",
          chatType: "private",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("disconnect", () => {
    it("marks binding revokedAt without deleting row", async () => {
      const prisma = {
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: "profile-1" }),
        },
        localMateTelegramBinding: {
          findUnique: jest.fn().mockResolvedValue({ id: "bind-1", revokedAt: null }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const service = new LocalMateTelegramPairingService(prisma as never);
      const result = await service.disconnect("user-1");

      expect(result.disconnected).toBe(true);
      expect(prisma.localMateTelegramBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { localMateProfileId: "profile-1" },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
