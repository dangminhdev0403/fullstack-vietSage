export const GUEST_AI_FLOATING_CHAT = "guest.ai_floating_chat" as const;
export const FRONTDESK_HN2N_CCCD_SCANNER =
  "frontdesk.hn2n_cccd_scanner" as const;

export type CanonicalHotelFeatureKey =
  typeof GUEST_AI_FLOATING_CHAT | typeof FRONTDESK_HN2N_CCCD_SCANNER;

export function hasHotelFeature(
  enabledFeatures: readonly string[] | undefined | null,
  featureKey: CanonicalHotelFeatureKey,
): boolean {
  return Array.isArray(enabledFeatures) && enabledFeatures.includes(featureKey);
}
