import { z } from "zod";

export const kbttReconciliationQuerySchema = z.object({
  localOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  force: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
}).strict().refine((value) => !(value.force && value.localOnly), "Choose local preview or provider refresh, not both");
export const kbttReconciliationSourceSchema = z.object({
  state: z.enum(["PENDING", "COMPLETE", "FAILED", "NOT_CONNECTED", "NEEDS_LOGIN", "INCOMPLETE"]),
  checkedAt: z.string().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type ReconciliationSource = z.infer<typeof kbttReconciliationSourceSchema>;
export const kbttReconciliationRowSchema = z.object({
  id: z.string(), source: z.enum(["VIETSAGE", "BCA_ONLY"]),
  kind: z.enum(["VIETNAMESE", "FOREIGN"]).nullable(), occupantId: z.string().nullable(), stayId: z.string().nullable(),
  roomId: z.string().nullable(), roomNumber: z.string().nullable(), groupCode: z.string().nullable(), fullName: z.string(),
  identityNumber: z.string().nullable(), documentType: z.number().nullable(), nationality: z.string().nullable(),
  checkedInAt: z.string().nullable(), plannedCheckOutAt: z.string().nullable(),
  status: z.enum(["MATCHED", "NOT_FOUND", "REVIEW"]).nullable(), reason: z.string().nullable(), bcaRecordId: z.string().nullable(),
  declarationStatus: z.string().nullable(), providerMessage: z.string().nullable(), canRetry: z.boolean(),
});
export const kbttReconciliationResponseSchema = z.object({
  items: z.array(kbttReconciliationRowSchema), checkedAt: z.string().nullable(),
  range: z.object({ dateFrom: z.string(), dateTo: z.string() }),
  sources: z.object({ VIETNAMESE: kbttReconciliationSourceSchema, FOREIGN: kbttReconciliationSourceSchema }),
});
export type KbttReconciliationResponse = z.infer<typeof kbttReconciliationResponseSchema>;

const nullableString = { type: "string", nullable: true };
const rowProperties = {
  ...Object.fromEntries(["occupantId", "stayId", "roomId", "roomNumber", "groupCode", "identityNumber", "nationality", "checkedInAt", "plannedCheckOutAt", "reason", "bcaRecordId", "declarationStatus", "providerMessage"].map((key) => [key, nullableString])),
  id: { type: "string" }, source: { type: "string", enum: ["VIETSAGE", "BCA_ONLY"] },
  kind: { type: "string", enum: ["VIETNAMESE", "FOREIGN"], nullable: true },
  fullName: { type: "string" }, documentType: { type: "number", nullable: true },
  status: { type: "string", enum: ["MATCHED", "NOT_FOUND", "REVIEW"], nullable: true }, canRetry: { type: "boolean" },
};
const sourceProperties = {
  state: { type: "string", enum: ["PENDING", "COMPLETE", "FAILED", "NOT_CONNECTED", "NEEDS_LOGIN", "INCOMPLETE"] }, checkedAt: nullableString,
  error: { type: "object", nullable: true, additionalProperties: false, required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } },
};
const sourceOpenApi = { type: "object", additionalProperties: false, required: Object.keys(sourceProperties), properties: sourceProperties };
export const kbttReconciliationOpenApiSchema = {
  type: "object", additionalProperties: false, required: ["items", "checkedAt", "range", "sources"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: Object.keys(rowProperties), properties: rowProperties } },
    checkedAt: nullableString,
    range: { type: "object", additionalProperties: false, required: ["dateFrom", "dateTo"], properties: { dateFrom: { type: "string", format: "date" }, dateTo: { type: "string", format: "date" } } },
    sources: { type: "object", additionalProperties: false, required: ["VIETNAMESE", "FOREIGN"], properties: { VIETNAMESE: sourceOpenApi, FOREIGN: sourceOpenApi } },
  },
};
