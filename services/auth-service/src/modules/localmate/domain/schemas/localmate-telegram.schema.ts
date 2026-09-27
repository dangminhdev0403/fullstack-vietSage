import { z } from "zod";

export const localMateTelegramPairingLinkResponseSchema = z.object({
  pairingUrl: z.string().url(),
  expiresAt: z.string(),
  expiresInSeconds: z.number().int().positive(),
});

export type LocalMateTelegramPairingLinkResponse = z.infer<
  typeof localMateTelegramPairingLinkResponseSchema
>;

export const telegramStartPairingInputSchema = z.object({
  token: z.string().trim().min(16).max(128),
  telegramUserId: z.string().trim().min(1).max(128),
  telegramChatId: z.string().trim().min(1).max(128),
  chatType: z.literal("private", {
    message: "Chỉ hỗ trợ liên kết qua cuộc trò chuyện riêng tư (private chat)",
  }),
});

export type TelegramStartPairingInput = z.infer<
  typeof telegramStartPairingInputSchema
>;
