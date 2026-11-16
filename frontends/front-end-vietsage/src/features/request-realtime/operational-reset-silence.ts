// Global tracker to silence spammy individual room status toasts during operational resets
const activeResetHotelIds = new Set<string>();
const resetExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setOperationalResetActive(
  hotelId: string,
  active: boolean,
  holdMs = 8000,
): void {
  if (!hotelId) return;
  const existingTimer = resetExpiryTimers.get(hotelId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    resetExpiryTimers.delete(hotelId);
  }

  if (active) {
    activeResetHotelIds.add(hotelId);
  } else {
    // Keep silencing for holdMs after API completes so late socket events are also suppressed
    const timer = setTimeout(() => {
      activeResetHotelIds.delete(hotelId);
      resetExpiryTimers.delete(hotelId);
    }, holdMs);
    resetExpiryTimers.set(hotelId, timer);
  }
}

export function isOperationalResetActive(hotelId?: string | null): boolean {
  if (!hotelId) return false;
  return activeResetHotelIds.has(hotelId);
}
