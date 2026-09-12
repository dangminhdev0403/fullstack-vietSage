import { z } from "zod";
export { hotelIdParamSchema } from "../../../property/property-public";

export const kbttCredentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(
        (value) =>
          ![...value].some((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127;
          }),
      ),
    password: z.string().min(1).max(256),
  })
  .strict();

const providerId = z.string().regex(/^\d{1,32}$/);

export const kbttSessionSchema = z.object({
  AccessToken: z.string().min(1).max(8192),
  RefreshToken: z.string().min(1).max(8192),
  TokenType: z.literal("bearer"),
  Exp: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
  Authorities: z
    .array(z.string().max(120))
    .max(100)
    .refine((authorities) => authorities.includes("kbtt:create-3th")),
  ClientId: z.number().int().nonnegative(),
  LoaiTK: z.literal("CSLT"),
  CsltId: providerId,
  CsltKhuVuc: z.number().int().nonnegative().max(2147483647),
  CsltDonVi: z.number().int().nonnegative().max(2147483647),
  MaTTCuaCslt: providerId,
  MaPxCuaCslt: providerId,
  IsCsltChinh: z.boolean(),
});

export type KbttCredentials = z.infer<typeof kbttCredentialsSchema>;
export type KbttSession = z.infer<typeof kbttSessionSchema>;

export function kbttMetadata(session: KbttSession) {
  return {
    csltId: session.CsltId,
    csltKhuVuc: session.CsltKhuVuc,
    csltDonVi: session.CsltDonVi,
    maTTCuaCslt: session.MaTTCuaCslt,
    maPxCuaCslt: session.MaPxCuaCslt,
    isCsltChinh: session.IsCsltChinh,
  };
}
