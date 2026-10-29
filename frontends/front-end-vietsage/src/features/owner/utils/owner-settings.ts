export type OwnerSettingsTab = "rooms" | "staff" | "services" | "partners" | "integrations" | "confirmation-template";

const TAB_PERMISSIONS: Record<OwnerSettingsTab, readonly string[]> = {
  rooms: ["hotel.rooms.view", "hotel.rooms.manage", "hotel.rooms.qr.manage"],
  staff: ["hotel.staff.view", "hotel.staff.manage"],
  services: ["hotel.services.view", "hotel.services.manage"],
  partners: ["hotel.local-partners.view", "hotel.local-partners.manage"],
  integrations: ["hotel.kbtt.view", "hotel.kbtt.manage", "hotel.channels.view", "hotel.channels.manage"],
  "confirmation-template": ["hotel.reservations.view", "hotel.reservations.manage"],
};

export function getOwnerSettingsTabs(permissions: readonly string[]): OwnerSettingsTab[] {
  return (Object.keys(TAB_PERMISSIONS) as OwnerSettingsTab[]).filter((tab) =>
    TAB_PERMISSIONS[tab].some((permission) => permissions.includes(permission)),
  );
}

export async function collectCatalogPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number; limit: number }>,
): Promise<T[]> {
  const first = await fetchPage(1);
  const items = [...first.items];
  if (!Number.isInteger(first.limit) || first.limit < 1 || !Number.isInteger(first.total) || first.total < 0) {
    throw new Error("Không thể xác định phân trang danh mục dịch vụ.");
  }
  for (let page = 2; page <= Math.ceil(first.total / first.limit); page++) {
    const result = await fetchPage(page);
    if (result.items.length === 0) throw new Error("Danh mục đã thay đổi. Vui lòng tải lại.");
    items.push(...result.items);
  }
  if (items.length < first.total) throw new Error("Không thể tải đủ danh mục dịch vụ. Vui lòng thử lại.");
  return items;
}
