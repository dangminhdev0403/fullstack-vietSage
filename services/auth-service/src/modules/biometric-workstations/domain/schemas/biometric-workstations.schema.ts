import { z } from "zod";

export const pairBiometricWorkstationSchema = z
  .object({
    code: z.string().trim().min(1, "Pairing code is required"),
  })
  .strict();

export type PairBiometricWorkstationInput = z.infer<typeof pairBiometricWorkstationSchema>;
