import { z } from "zod";

import type { KbttCatalogItem, KbttCatalogKind } from "./types/kbtt-contract";

const providerEnvelopeSchema = z.object({
  code: z.union([z.string(), z.number()]).transform(String),
  data: z.unknown(),
});

const countrySchema = z.object({
  maQT: z.string().trim().min(1),
  tenQT: z.string().trim().min(1),
  tenQTEn: z.string().trim().nullish(),
});

const provinceSchema = z.object({
  maTT: z.string().trim().min(1),
  tenTT: z.string().trim().min(1),
  tenTTEn: z.string().trim().nullish(),
});

const wardSchema = z.object({
  maPhuongXa: z.string().trim().min(1),
  tenPhuongXa: z.string().trim().min(1),
  tenPhuongXaEn: z.string().trim().nullish(),
  trucThuocTinh: z.string().trim().nullish(),
});

const namedItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1),
});

export function parseKbttPublicCatalog(
  kind: KbttCatalogKind,
  rawEnvelope: unknown,
  parentCode?: string,
  fetchedAt = new Date().toISOString(),
): KbttCatalogItem[] {
  const envelope = providerEnvelopeSchema.parse(rawEnvelope);
  if (envelope.code !== "200") throw new Error("KBTT_PROVIDER_REJECTED");

  const rows: Array<
    Omit<KbttCatalogItem, "id" | "kind" | "isActive" | "fetchedAt">
  > =
    kind === "NATIONALITY"
      ? z
          .array(countrySchema)
          .max(5_000)
          .parse(envelope.data)
          .map((item) => ({
            code: item.maQT,
            parentCode: null,
            nameVi: item.tenQT,
            nameEn: item.tenQTEn || null,
          }))
      : kind === "PROVINCE"
        ? z
            .array(provinceSchema)
            .max(1_000)
            .parse(envelope.data)
            .map((item) => ({
              code: item.maTT,
              parentCode: null,
              nameVi: item.tenTT,
              nameEn: item.tenTTEn || null,
            }))
        : kind === "WARD"
          ? z
              .array(wardSchema)
              .max(20_000)
              .parse(envelope.data)
              .map((item) => ({
                code: item.maPhuongXa,
                parentCode: item.trucThuocTinh || parentCode || null,
                nameVi: item.tenPhuongXa,
                nameEn: item.tenPhuongXaEn || null,
              }))
              .filter((item) => item.parentCode === parentCode)
          : z
              .array(namedItemSchema)
              .max(1_000)
              .parse(envelope.data)
              .map((item) => ({
                code: item.id,
                parentCode: null,
                nameVi: item.name,
                nameEn: null,
              }));

  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows)
    unique.set(`${row.parentCode ?? ""}:${row.code}`, row);

  return [...unique.values()]
    .sort((left, right) =>
      left.nameVi.localeCompare(right.nameVi, "vi", { sensitivity: "base" }),
    )
    .map((item) => ({
      ...item,
      id: `${kind}:${item.parentCode ?? ""}:${item.code}`,
      kind,
      isActive: true,
      fetchedAt,
    }));
}
