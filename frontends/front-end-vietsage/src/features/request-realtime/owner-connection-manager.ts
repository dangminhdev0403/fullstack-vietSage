export type OwnerRealtimeHandlers = {
  onReady?: (scope: unknown) => void;
  onCreated?: (request: unknown) => void;
  onUpdated?: (request: unknown) => void;
  onAnswered?: (request: unknown) => void;
  onReconnect?: () => void;
  onError?: (error: unknown) => void;
};

type ManagedSocket = {
  on(event: string, handler: (value?: unknown) => void): void;
  connect(): void;
  disconnect(): void;
};

type Entry = {
  subscribers: Set<OwnerRealtimeHandlers>;
  socket?: ManagedSocket;
  generation: number;
  pending?: Promise<void>;
  cancelReconnect?: () => void;
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

export function createOwnerConnectionManager(deps: {
  enabled: boolean;
  getTicket(hotelId: string): Promise<{ ticket: string; expiresAt: string }>;
  createSocket(auth: { mode: "owner"; ticket: string }): ManagedSocket;
  scheduleReconnect?: (callback: () => void) => () => void;
}) {
  const entries = new Map<string, Entry>();

  function acquire(hotelId: string, entry: Entry): Promise<void> {
    if (!deps.enabled || entry.subscribers.size === 0 || entry.socket) return Promise.resolve();
    if (entry.pending) return entry.pending;

    const generation = entry.generation;
    const acquisition = deps
      .getTicket(hotelId)
      .then(({ ticket }) => {
        if (entry.generation !== generation || entry.subscribers.size === 0) return;

        const socket = deps.createSocket({ mode: "owner", ticket });
        let terminal = false;
        entry.socket = socket;

        const fanout = (name: keyof OwnerRealtimeHandlers) => (event?: unknown) => {
          const request =
            typeof event === "object" && event !== null && "request" in event
              ? event.request
              : event;
          entry.subscribers.forEach((subscriber) => {
            (subscriber[name] as ((value?: unknown) => void) | undefined)?.(request);
          });
        };

        socket.on("request_realtime.ready", fanout("onReady"));
        socket.on("guest_request.created", fanout("onCreated"));
        socket.on("guest_request.updated", fanout("onUpdated"));
        socket.on("guest_request.answered", fanout("onAnswered"));
        socket.on("request_realtime.error", (error) => {
          terminal = isTerminalRealtimeError(error);
          fanout("onError")(error);
        });
        const reconnect = () => {
          if (entry.socket !== socket || entry.subscribers.size === 0) return;
          entry.socket = undefined;
          if (terminal) return;

          entry.generation += 1;
          entry.subscribers.forEach((subscriber) => subscriber.onReconnect?.());
          const retry = () => {
            entry.cancelReconnect = undefined;
            void acquire(hotelId, entry);
          };
          entry.cancelReconnect = deps.scheduleReconnect?.(retry) ?? (retry(), () => undefined);
        };
        socket.on("connect_error", reconnect);
        socket.on("disconnect", reconnect);
        socket.connect();
      })
      .catch((error: unknown) => {
        if (entry.generation !== generation) return;
        entry.subscribers.forEach((subscriber) => subscriber.onError?.(error));
      })
      .finally(() => {
        if (entry.pending === acquisition) entry.pending = undefined;
      });

    entry.pending = acquisition;
    return acquisition;
  }

  return {
    subscribe(hotelId: string, handlers: OwnerRealtimeHandlers) {
      let entry = entries.get(hotelId);
      if (!entry) {
        entry = { subscribers: new Set(), generation: 0 };
        entries.set(hotelId, entry);
      }
      entry.subscribers.add(handlers);
      void acquire(hotelId, entry);

      return () => {
        entry!.subscribers.delete(handlers);
        if (entry!.subscribers.size === 0) {
          entry!.generation += 1;
          entry!.cancelReconnect?.();
          entry!.cancelReconnect = undefined;
          const socket = entry!.socket;
          entry!.socket = undefined;
          socket?.disconnect();
          entries.delete(hotelId);
        }
      };
    },
    settled(hotelId: string) {
      return entries.get(hotelId)?.pending ?? Promise.resolve();
    },
  };
}
