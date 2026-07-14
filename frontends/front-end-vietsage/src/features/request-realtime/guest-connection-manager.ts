import type { OwnerRealtimeHandlers } from "./owner-connection-manager";

type GuestSocket = {
  on(event: string, handler: (value?: unknown) => void): void;
  connect(): void;
  disconnect(): void;
};

type RealtimeError = { retryable?: unknown };

function isTerminalRealtimeError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "retryable" in value &&
    (value as RealtimeError).retryable === false
  );
}

export function createGuestConnectionManager(deps: {
  enabled: boolean;
  createSocket(auth: { mode: "guest"; sessionToken: string }): GuestSocket;
  scheduleReconnect?: (callback: () => void) => () => void;
}) {
  let socket: GuestSocket | undefined;
  let token: string | null = null;
  let handlers: OwnerRealtimeHandlers = {};
  let cancelReconnect: (() => void) | undefined;

  const unwrapRequest = (event: unknown) =>
    typeof event === "object" && event !== null && "request" in event ? event.request : event;

  function connect(expectedToken: string) {
    if (!deps.enabled || token !== expectedToken || socket) return;

    const current = deps.createSocket({ mode: "guest", sessionToken: expectedToken });
    let terminal = false;
    socket = current;
    current.on("request_realtime.ready", (event) => handlers.onReady?.(event));
    current.on("guest_request.created", (event) => handlers.onCreated?.(unwrapRequest(event)));
    current.on("guest_request.updated", (event) => handlers.onUpdated?.(unwrapRequest(event)));
    current.on("guest_request.answered", (event) => handlers.onAnswered?.(unwrapRequest(event)));
    current.on("request_realtime.error", (error) => {
      terminal = isTerminalRealtimeError(error);
      handlers.onError?.(error);
    });
    const reconnect = () => {
      if (socket !== current) return;
      socket = undefined;
      if (terminal || token !== expectedToken) return;
      handlers.onReconnect?.();
      const retry = () => {
        cancelReconnect = undefined;
        connect(expectedToken);
      };
      cancelReconnect = deps.scheduleReconnect?.(retry) ?? (retry(), () => undefined);
    };
    current.on("connect_error", reconnect);
    current.on("disconnect", reconnect);
    current.connect();
  }

  return {
    update(nextToken: string | null | undefined, nextHandlers: OwnerRealtimeHandlers) {
      handlers = nextHandlers;
      const normalized = nextToken?.trim() || null;
      if (!deps.enabled) return;
      if (normalized === token) return;

      const previous = socket;
      socket = undefined;
      cancelReconnect?.();
      cancelReconnect = undefined;
      token = normalized;
      previous?.disconnect();
      if (token) connect(token);
    },
    disconnect() {
      const previous = socket;
      socket = undefined;
      cancelReconnect?.();
      cancelReconnect = undefined;
      token = null;
      previous?.disconnect();
    },
  };
}
