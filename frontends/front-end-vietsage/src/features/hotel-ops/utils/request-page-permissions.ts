export function canLoadRequestServiceCatalog(permissions: readonly string[]): boolean {
  return permissions.includes("hotel.services.view") || permissions.includes("hotel.services.manage");
}