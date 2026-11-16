import { z } from "zod";

/** Query names and zero-based paging come from the checked-in Postman collection. */
export const kbttResidentListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  soPhong: z.string().trim().max(40).optional(),
  page: z.number().int().min(0).default(0),
  size: z.number().int().min(1).max(100).default(50),
}).strict();
export type KbttResidentListQuery = z.input<typeof kbttResidentListQuerySchema>;
export type KbttResidentListQueryParsed = z.output<typeof kbttResidentListQuerySchema>;


/** BCA history accepts local calendar-day boundaries (Asia/Ho_Chi_Minh).
 * Caller supplies dates only; the client expands them to whole-day provider strings.
 */
export const kbttHistoryDateQuerySchema = z.object({
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  keyword: z.string().trim().max(120).optional(),
  typeDate: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  page: z.number().int().min(0).optional(),
  size: z.number().int().min(1).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.dateFrom === undefined) !== (value.dateTo === undefined)) {
    ctx.addIssue({ code: "custom", message: "dateFrom and dateTo must be supplied together" });
  } else if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    ctx.addIssue({ code: "custom", path: ["dateTo"], message: "dateTo must not precede dateFrom" });
  }
});
export type KbttHistoryDateQuery = z.infer<typeof kbttHistoryDateQuerySchema>;

export const kbttProviderRecordIdSchema = z.string().trim().min(1).max(128)
  .refine((value) => value !== "." && value !== ".." && !/[\/\\?#\u0000-\u001f\u007f]/.test(value), "Invalid BCA record ID");

/** The captured provider envelope uses code 200 for success. Preserve unknown keys.
 * Endpoint data is validated separately after HTTP and business failures are handled.
 */
export const kbttProviderReadEnvelopeSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  message: z.string().nullable().optional(),
  data: z.unknown().optional(),
}).passthrough();
export type KbttProviderReadEnvelope = z.infer<typeof kbttProviderReadEnvelopeSchema>;
export type KbttProviderReadKind = "VIETNAMESE" | "FOREIGN";
export interface KbttProviderReadResponse<T = unknown> {
  httpStatus: number;
  envelope: KbttProviderReadEnvelope;
  data: T;
}

/** Safe connection-screen projection; never contains provider credentials or raw responses. */
export const kbttConnectionProfileSchema = z.object({
  state: z.enum(["NOT_LOADED", "READY", "FAILED"]),
  accommodation: z.object({
    name: z.string().nullable(), address: z.string().nullable(), representative: z.string().nullable(),
    phone: z.string().nullable(), email: z.string().nullable(), managingUnit: z.string().nullable(),
  }).nullable(),
  fetchedAt: z.string().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type KbttConnectionProfile = z.infer<typeof kbttConnectionProfileSchema>;
