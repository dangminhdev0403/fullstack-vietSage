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

export type GuestRealtimeHandlers = OwnerRealtimeHandlers;

type Entry = {
  subscribers: Set<GuestRealtimeHandlers>;
  socket?: GuestSocket;
  generation: number;
  cancelReconnect?: () => void;
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastReconnectAt?: number;
};

export function createGuestConnectionManager(deps: {
  enabled: boolean;
  createSocket(auth: { mode: "guest"; sessionToken: string }): GuestSocket;
  scheduleReconnect?: (callback: () => void, attempt: number) => () => void;
}) {
  const entries = new Map<string, Entry>();

  function connect(token: string, entry: Entry) {
    if (!deps.enabled || entry.subscribers.size === 0 || entry.socket) return;

    const now = Date.now();
    if (entry.lastFailureAt && entry.consecutiveFailures > 0) {
      const cooldownMs = Math.min(300_000, Math.pow(2, entry.consecutiveFailures) * 1_000);
      if (now - entry.lastFailureAt < cooldownMs) {
        return;
      }
    }

    const generation = entry.generation;
    const current = deps.createSocket({ mode: "guest", sessionToken: token });
    let terminal = false;
    let wasConnected = false;
    entry.socket = current;

    const fanout = (name: keyof GuestRealtimeHandlers) => (event?: unknown) => {
      const request =
        typeof event === "object" && event !== null && "request" in event
          ? (event as { request?: unknown }).request
          : event;
      entry.subscribers.forEach((subscriber) => {
        (subscriber[name] as ((value?: unknown) => void) | undefined)?.(request);
      });
    };
    const fanoutRaw = (name: keyof GuestRealtimeHandlers) => (event?: unknown) => {
      entry.subscribers.forEach((subscriber) => {
        (subscriber[name] as ((value?: unknown) => void) | undefined)?.(event);
      });
    };

    current.on("connect", () => {
      if (entry.generation !== generation) return;
      entry.consecutiveFailures = 0;
      entry.lastFailureAt = undefined;
      if (wasConnected) {
        const now = Date.now();
        if (!entry.lastReconnectAt || now - entry.lastReconnectAt >= 5_000) {
          entry.lastReconnectAt = now;
          entry.subscribers.forEach((subscriber) => subscriber.onReconnect?.());
        }
      }
      wasConnected = true;
    });

    current.on("request_realtime.ready", fanout("onReady"));
    current.on("guest_request.created", fanout("onCreated"));
    current.on("guest_request.updated", fanout("onUpdated"));
    current.on("guest_request.answered", fanout("onAnswered"));
    current.on("guest_message.created", fanoutRaw("onGuestMessageCreated"));
    current.on("conversation.closed", fanoutRaw("onConversationClosed"));
    current.on("external_service_order.created", fanoutRaw("onExternalOrderCreated"));
    current.on("external_service_order.status_changed", fanoutRaw("onExternalOrderStatusChanged"));
    current.on("external_service_order.hotel_acknowledged", fanoutRaw("onExternalOrderHotelAcknowledged"));
    current.on("external_service_order.voucher_issued", fanoutRaw("onExternalOrderVoucherIssued"));
    current.on("request_realtime.error", (error) => {
      terminal = isTerminalRealtimeError(error);
      fanout("onError")(error);
    });
    const reconnect = () => {
      if (entry.socket !== current || entry.subscribers.size === 0) return;
      entry.socket = undefined;
      entry.consecutiveFailures += 1;
      entry.lastFailureAt = Date.now();
      if (terminal) return;

      entry.generation += 1;
      const currentAttempt = entry.consecutiveFailures;
      const retry = () => {
        entry.cancelReconnect = undefined;
        connect(token, entry);
      };
      entry.cancelReconnect = deps.scheduleReconnect?.(retry, currentAttempt) ?? (retry(), () => undefined);
    };
    current.on("connect_error", reconnect);
    current.on("disconnect", reconnect);
    current.connect();
  }

  return {
    subscribe(sessionToken: string, handlers: GuestRealtimeHandlers) {
      let entry = entries.get(sessionToken);
      if (!entry) {
        entry = { subscribers: new Set(), generation: 0, consecutiveFailures: 0 };
        entries.set(sessionToken, entry);
      }
      entry.subscribers.add(handlers);
      connect(sessionToken, entry);

      return () => {
        entry!.subscribers.delete(handlers);
        if (entry!.subscribers.size === 0) {
          entry!.generation += 1;
          entry!.cancelReconnect?.();
          entry!.cancelReconnect = undefined;
          const socket = entry!.socket;
          entry!.socket = undefined;
          socket?.disconnect();
          entries.delete(sessionToken);
        }
      };
    },
  };
}
