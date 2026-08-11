import { z } from "zod";

export const categorySheetInputSchema = z.object({
  spreadsheetUrl: z.string().trim().url({ message: "URL Google Sheets không hợp lệ" }),
});

export const categorySheetCommitInputSchema = categorySheetInputSchema.extend({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/, { message: "Hash xem trước không hợp lệ" }),
});

export type CategorySheetInput = z.infer<typeof categorySheetInputSchema>;
export type CategorySheetCommitInput = z.infer<typeof categorySheetCommitInputSchema>;
