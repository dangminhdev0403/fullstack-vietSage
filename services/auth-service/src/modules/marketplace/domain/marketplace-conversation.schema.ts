import { z } from "zod";

export const marketplaceConversationSenderTypeSchema = z.enum(["GUEST", "SERVICE_STAFF", "SYSTEM"]);

export const marketplaceMessageDeliveryStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "RECEIVED",
]);

export const marketplaceConversationMessageSchema = z.object({
  id: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  senderType: marketplaceConversationSenderTypeSchema,
  body: z.string().trim().min(1).max(1000),
  deliveryStatus: marketplaceMessageDeliveryStatusSchema,
  createdAt: z.string().trim().min(1),
});

export const sendMarketplaceConversationMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Tin nhắn phải có từ 1 đến 1000 ký tự")
    .max(1000, "Tin nhắn không được vượt quá 1000 ký tự"),
  clientMessageId: z.string().trim().min(1, "clientMessageId là bắt buộc").max(80),
});

export const listMarketplaceConversationMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().trim().optional(),
});

export type MarketplaceConversationSenderType = z.infer<
  typeof marketplaceConversationSenderTypeSchema
>;
export type MarketplaceMessageDeliveryStatus = z.infer<
  typeof marketplaceMessageDeliveryStatusSchema
>;
export type MarketplaceConversationMessage = z.infer<typeof marketplaceConversationMessageSchema>;
export type SendMarketplaceConversationMessageInput = z.infer<
  typeof sendMarketplaceConversationMessageSchema
>;
export type ListMarketplaceConversationMessagesQuery = z.infer<
  typeof listMarketplaceConversationMessagesQuerySchema
>;
