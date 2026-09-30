export const GUEST_AI_FLOATING_CHAT = "guest.ai_floating_chat" as const;
export const FRONTDESK_HN2N_CCCD_SCANNER = "frontdesk.hn2n_cccd_scanner" as const;
export const HOTEL_CHANNEL_MANAGER = "hotel.channel_manager" as const;

export const CANONICAL_HOTEL_FEATURE_KEYS = [
  GUEST_AI_FLOATING_CHAT,
  FRONTDESK_HN2N_CCCD_SCANNER,
  HOTEL_CHANNEL_MANAGER,
] as const;

export type HotelFeatureKey = (typeof CANONICAL_HOTEL_FEATURE_KEYS)[number];

export const HOTEL_FEATURE_DEFINITIONS = [
  {
    key: GUEST_AI_FLOATING_CHAT,
    label: "Trợ lý AI nổi trên GuestOS",
    description: "Hiển thị và cho phép sử dụng trợ lý LocalMate AI trong GuestOS.",
  },
  {
    key: FRONTDESK_HN2N_CCCD_SCANNER,
    label: "Máy quét CCCD HN2N/HN-212 tại lễ tân",
    description: "Kết nối và vận hành máy quét CCCD HN2N/HN-212 cho luồng check-in tại lễ tân.",
  },
  {
    key: HOTEL_CHANNEL_MANAGER,
    label: "Kho phòng & kênh bán (Channel Manager)",
    description:
      "Bật/tắt tính năng quản lý tồn kho, giá bán và đồng bộ đa kênh OTA (Channex, Booking, Agoda, Airbnb...).",
  },
] as const;

export type HotelFeatureDefinition = (typeof HOTEL_FEATURE_DEFINITIONS)[number];

const HOTEL_FEATURE_REGISTRY: ReadonlyMap<HotelFeatureKey, HotelFeatureDefinition> = new Map(
  HOTEL_FEATURE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function isHotelFeatureKey(key: string): key is HotelFeatureKey {
  return HOTEL_FEATURE_REGISTRY.has(key as HotelFeatureKey);
}

export function getHotelFeatureDefinition(key: HotelFeatureKey): HotelFeatureDefinition {
  return HOTEL_FEATURE_REGISTRY.get(key)!;
}
