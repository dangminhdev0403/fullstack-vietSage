export function ownerAttentionRoute(route: string, hotelId: string): string {
  const encodedHotelId = encodeURIComponent(hotelId);
  const genericPrefix = `/hotels/${hotelId}/`;
  if (!route.startsWith(genericPrefix)) return route;

  const relative = route.slice(genericPrefix.length);
  if (relative.startsWith("requests/")) {
    const requestId = relative
      .slice("requests/".length)
      .split(/[?#]/)[0]
      ?.trim();
    return requestId
      ? `/owner/hotels/${encodedHotelId}/requests?requestId=${encodeURIComponent(requestId)}`
      : `/owner/hotels/${encodedHotelId}/requests`;
  }

  return `/owner/hotels/${encodedHotelId}/${relative}`;
}
