function openHotelChannel(hotelId: string): BroadcastChannel | null {
  if (!hotelId || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(`vietsage-hotel-ops:${hotelId}`);
  } catch {
    return null;
  }
}

export function publishHotelRoomChange(hotelId: string): void {
  const channel = openHotelChannel(hotelId);
  if (!channel) return;
  try {
    channel.postMessage({ type: "rooms-changed" });
  } catch {
    // Focus refresh and server realtime remain available if tab messaging fails.
  } finally {
    channel.close();
  }
}

export function subscribeHotelRoomChanges(hotelId: string, onChange: () => void): () => void {
  const channel = openHotelChannel(hotelId);
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data === "object" && data !== null && "type" in data && data.type === "rooms-changed") {
      onChange();
    }
  };
  return () => { channel.close(); };
}
