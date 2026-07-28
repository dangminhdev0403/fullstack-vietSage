const GUEST_DEVICE_ID_STORAGE_KEY = "vietsage.guest-os.device-id.v1";
const GUEST_DEVICE_ID_PREFIX = "guest-device-";

function createGuestDeviceId(): string | null {
  if (typeof crypto === "undefined") {
    return null;
  }

  if (typeof crypto.randomUUID === "function") {
    return `${GUEST_DEVICE_ID_PREFIX}${crypto.randomUUID()}`;
  }

  if (typeof crypto.getRandomValues !== "function") {
    return null;
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const randomId = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${GUEST_DEVICE_ID_PREFIX}${randomId}`;
}

export function getOrCreateGuestDeviceId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const existingDeviceId = window.localStorage.getItem(GUEST_DEVICE_ID_STORAGE_KEY)?.trim();
    if (existingDeviceId) {
      return existingDeviceId;
    }

    const newDeviceId = createGuestDeviceId();
    if (!newDeviceId) {
      return undefined;
    }

    window.localStorage.setItem(GUEST_DEVICE_ID_STORAGE_KEY, newDeviceId);
    return newDeviceId;
  } catch {
    return createGuestDeviceId() ?? undefined;
  }
}
