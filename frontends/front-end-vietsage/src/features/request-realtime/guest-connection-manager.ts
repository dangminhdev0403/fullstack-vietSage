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
  cancelReconnect?: () => void;
};

export function createGuestConnectionManager(deps: {
  enabled: boolean;
  createSocket(auth: { mode: "guest"; sessionToken: string }): GuestSocket;
  scheduleReconnect?: (callback: () => void) => () => void;
}) {
  const entries = new Map<string, Entry>();

  function connect(token: string, entry: Entry) {
    if (!deps.enabled || entry.subscribers.size === 0 || entry.socket) return;

    const current = deps.createSocket({ mode: "guest", sessionToken: token });
    let terminal = false;
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

    current.on("request_realtime.ready", fanout("onReady"));
    current.on("guest_request.created", fanout("onCreated"));
    current.on("guest_request.updated", fanout("onUpdated"));
    current.on("guest_request.answered", fanout("onAnswered"));
    current.on("guest_message.created", fanoutRaw("onGuestMessageCreated"));
    current.on("conversation.closed", fanoutRaw("onConversationClosed"));
    current.on("request_realtime.error", (error) => {
      terminal = isTerminalRealtimeError(error);
      fanout("onError")(error);
    });
    const reconnect = () => {
      if (entry.socket !== current) return;
      entry.socket = undefined;
      if (terminal || entry.subscribers.size === 0) return;
      entry.subscribers.forEach((subscriber) => subscriber.onReconnect?.());
      const retry = () => {
        entry.cancelReconnect = undefined;
        connect(token, entry);
      };
      entry.cancelReconnect = deps.scheduleReconnect?.(retry) ?? (retry(), () => undefined);
    };
    current.on("connect_error", reconnect);
    current.on("disconnect", reconnect);
    current.connect();
  }

  return {
    subscribe(sessionToken: string, handlers: GuestRealtimeHandlers) {
      let entry = entries.get(sessionToken);
      if (!entry) {
        entry = { subscribers: new Set() };
        entries.set(sessionToken, entry);
      }
      entry.subscribers.add(handlers);
      connect(sessionToken, entry);

      return () => {
        entry!.subscribers.delete(handlers);
        if (entry!.subscribers.size === 0) {
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
