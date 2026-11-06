export function resolveRequestRealtimeAddTrailingSlash(
  socketUrl: string,
  browserOrigin: string | undefined,
  isDevelopment: boolean,
): boolean {
  if (!isDevelopment || !browserOrigin) {
    return true;
  }

  try {
    // Next's dev proxy redirects the slash; direct Engine.IO endpoints require it.
    return new URL(socketUrl, browserOrigin).origin !== new URL(browserOrigin).origin;
  } catch {
    return true;
  }
}
