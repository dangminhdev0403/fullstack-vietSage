import { z } from "zod";

export const TelegramFromSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

export const TelegramChatSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  title: z.string().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export const TelegramMessageSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    message_id: z.number().int(),
    from: TelegramFromSchema.optional(),
    chat: TelegramChatSchema,
    date: z.number().int().optional(),
    text: z.string().optional(),
    reply_to_message: TelegramMessageSchema.optional(),
  }),
);

export const TelegramCallbackQuerySchema = z.object({
  id: z.string().min(1),
  from: TelegramFromSchema.optional(),
  message: TelegramMessageSchema.optional(),
  data: z.string().optional(),
});

export const TelegramUpdateSchema = z.object({
  update_id: z.number().int().optional(),
  message: TelegramMessageSchema.optional(),
  callback_query: TelegramCallbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof TelegramMessageSchema>;
export type TelegramCallbackQuery = z.infer<typeof TelegramCallbackQuerySchema>;
