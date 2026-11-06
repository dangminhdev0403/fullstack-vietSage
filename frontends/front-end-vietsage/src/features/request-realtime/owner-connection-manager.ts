export type OwnerRealtimeHandlers = {
  onReady?: (scope: unknown) => void;
  onCreated?: (request: unknown) => void;
  onUpdated?: (request: unknown) => void;
  onAnswered?: (request: unknown) => void;
  onGuestMessageCreated?: (event: unknown) => void;
  onConversationClosed?: (event: unknown) => void;
  onMarketplaceConversationMessageCreated?: (event: unknown) => void;
  onExternalOrderCreated?: (event: unknown) => void;
  onExternalOrderStatusChanged?: (event: unknown) => void;
  onExternalOrderHotelAcknowledged?: (event: unknown) => void;
  onExternalOrderVoucherIssued?: (event: unknown) => void;
  onPartnerSettlementCreated?: (event: unknown) => void;
  onPartnerSettlementUpdated?: (event: unknown) => void;
  onChannelBookingCreated?: (event: unknown) => void;
  onChannelBookingCancelled?: (event: unknown) => void;
  onRoomStatusUpdated?: (event: unknown) => void;
  onHousekeepingTaskCreated?: (event: unknown) => void;
  onHousekeepingTaskClaimed?: (event: unknown) => void;
  onHousekeepingTaskStarted?: (event: unknown) => void;
  onHousekeepingTaskBlocked?: (event: unknown) => void;
  onHousekeepingTaskCompleted?: (event: unknown) => void;
  onHousekeepingTaskReopened?: (event: unknown) => void;
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
  consecutiveFailures: number;
  everConnected: boolean;
  lastFailureAt?: number;
  lastReconnectAt?: number;
};

type RealtimeError = { retryable?: unknown; status?: unknown };

function isTerminalRealtimeError(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const error = value as RealtimeError;
  return error.retryable === false || (
    typeof error.status === "number" &&
    error.status >= 400 && error.status < 500 &&
    error.status !== 408 && error.status !== 429
  );
}

function notifySubscribers(
  subscribers: Set<OwnerRealtimeHandlers>,
  name: keyof OwnerRealtimeHandlers,
  payload?: unknown,
) {
  subscribers.forEach((subscriber) => {
    (subscriber[name] as ((value?: unknown) => void) | undefined)?.(payload);
  });
}

export function createOwnerConnectionManager(deps: {
  enabled: boolean;
  getTicket(hotelId: string): Promise<{ ticket: string; expiresAt: string }>;
  createSocket(auth: { mode: "owner"; ticket: string }): ManagedSocket;
  scheduleReconnect?: (callback: () => void, attempt: number) => () => void;
}) {
  const entries = new Map<string, Entry>();

  function scheduleRetry(hotelId: string, entry: Entry) {
    if (entry.cancelReconnect || entry.subscribers.size === 0) return;
    const generation = entry.generation;
    let cancelled = false;
    const retry = async () => {
      // Also handles schedulers that invoke immediately while acquisition is pending.
      await entry.pending;
      if (cancelled || entry.generation !== generation || entries.get(hotelId) !== entry || entry.subscribers.size === 0) return;
      cancelled = true;
      entry.cancelReconnect = undefined;
      entry.lastFailureAt = undefined;
      void acquire(hotelId, entry);
    };
    const cancel = deps.scheduleReconnect
      ? deps.scheduleReconnect(() => void retry(), entry.consecutiveFailures)
      : (() => {
          const timer = setTimeout(() => void retry(), Math.min(300_000, Math.pow(2, entry.consecutiveFailures) * 2_000));
          return () => clearTimeout(timer);
        })();
    entry.cancelReconnect = () => {
      cancelled = true;
      cancel();
    };
  }

  function acquire(hotelId: string, entry: Entry): Promise<void> {
    if (!deps.enabled || entry.subscribers.size === 0 || entry.socket) return Promise.resolve();
    if (entry.pending) return entry.pending;
    if (entry.cancelReconnect) return Promise.resolve();

    // Cooldown check: if failed recently with consecutive failures, enforce backoff
    const now = Date.now();
    if (entry.lastFailureAt && entry.consecutiveFailures > 0) {
      const cooldownMs = Math.min(300_000, Math.pow(2, entry.consecutiveFailures) * 2_000);
      if (now - entry.lastFailureAt < cooldownMs) {
        return Promise.resolve();
      }
    }

    const generation = entry.generation;
    const acquisition = deps
      .getTicket(hotelId)
      .then(({ ticket }) => {
        if (entry.generation !== generation || entry.subscribers.size === 0) return;

        const socket = deps.createSocket({ mode: "owner", ticket });
        let terminal = false;
        entry.socket = socket;

        const seenEventIds = new Set<string>();
        const isDuplicateEvent = (evt: unknown): boolean => {
          if (typeof evt !== "object" || evt === null) return false;
          const e = evt as Record<string, unknown>;
          const id =
            (typeof e.eventId === "string" && e.eventId) ||
            (typeof e.id === "string" && e.id) ||
            (typeof e.taskId === "string" && `${e.taskId}:${e.status ?? ""}`) ||
            (typeof e.bookingId === "string" && `${e.bookingId}:${e.status ?? ""}`) ||
            (typeof e.orderId === "string" && `${e.orderId}:${e.status ?? ""}`);
          if (!id) return false;
          if (seenEventIds.has(id)) return true;
          seenEventIds.add(id);
          setTimeout(() => seenEventIds.delete(id), 30_000);
          return false;
        };

        const fanout = (name: keyof OwnerRealtimeHandlers) => (event?: unknown) => {
          if (isDuplicateEvent(event)) return;
          const request =
            typeof event === "object" && event !== null && "request" in event
              ? event.request
              : event;
          notifySubscribers(entry.subscribers, name, request);
        };
        const fanoutRaw = (name: keyof OwnerRealtimeHandlers) => (event?: unknown) => {
          if (isDuplicateEvent(event)) return;
          notifySubscribers(entry.subscribers, name, event);
        };

        socket.on("connect", () => {
          if (entry.socket !== socket) return;
          entry.consecutiveFailures = 0;
          entry.lastFailureAt = undefined;
          if (entry.everConnected) {
            const now = Date.now();
            if (!entry.lastReconnectAt || now - entry.lastReconnectAt >= 5_000) {
              entry.lastReconnectAt = now;
              entry.subscribers.forEach((subscriber) => subscriber.onReconnect?.());
            }
          }
          entry.everConnected = true;
        });

        socket.on("request_realtime.ready", fanout("onReady"));
        socket.on("guest_request.created", fanout("onCreated"));
        socket.on("guest_request.updated", fanout("onUpdated"));
        socket.on("guest_request.answered", fanout("onAnswered"));
        socket.on("guest_message.created", fanoutRaw("onGuestMessageCreated"));
        socket.on("conversation.closed", fanoutRaw("onConversationClosed"));
        socket.on("external_service_order.created", fanoutRaw("onExternalOrderCreated"));
        socket.on("external_service_order.status_changed", fanoutRaw("onExternalOrderStatusChanged"));
        socket.on("external_service_order.hotel_acknowledged", fanoutRaw("onExternalOrderHotelAcknowledged"));
        socket.on("external_service_order.voucher_issued", fanoutRaw("onExternalOrderVoucherIssued"));
        socket.on("partner_settlement.created", fanoutRaw("onPartnerSettlementCreated"));
        socket.on("partner_settlement.updated", fanoutRaw("onPartnerSettlementUpdated"));
        socket.on("channel_booking.created", fanoutRaw("onChannelBookingCreated"));
        socket.on("channel_booking.cancelled", fanoutRaw("onChannelBookingCancelled"));
        socket.on("room_status.updated", fanoutRaw("onRoomStatusUpdated"));
        socket.on("housekeeping_task.created", fanoutRaw("onHousekeepingTaskCreated"));
        socket.on("housekeeping_task.claimed", fanoutRaw("onHousekeepingTaskClaimed"));
        socket.on("housekeeping_task.started", fanoutRaw("onHousekeepingTaskStarted"));
        socket.on("housekeeping_task.blocked", fanoutRaw("onHousekeepingTaskBlocked"));
        socket.on("housekeeping_task.completed", fanoutRaw("onHousekeepingTaskCompleted"));
        socket.on("housekeeping_task.reopened", fanoutRaw("onHousekeepingTaskReopened"));
        socket.on("request_realtime.error", (error) => {
          terminal = isTerminalRealtimeError(error);
          fanout("onError")(error);
        });
        const reconnect = () => {
          if (entry.socket !== socket || entry.subscribers.size === 0) return;
          entry.socket = undefined;
          entry.consecutiveFailures += 1;
          entry.lastFailureAt = Date.now();
          if (terminal) return;

          entry.generation += 1;
          scheduleRetry(hotelId, entry);
        };
        socket.on("connect_error", reconnect);
        socket.on("disconnect", reconnect);
        socket.connect();
      })
      .catch((error: unknown) => {
        if (entry.generation !== generation) return;
        entry.consecutiveFailures += 1;
        entry.lastFailureAt = Date.now();
        entry.subscribers.forEach((subscriber) => subscriber.onError?.(error));
        if (!isTerminalRealtimeError(error)) scheduleRetry(hotelId, entry);
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
        entry = { subscribers: new Set(), generation: 0, consecutiveFailures: 0, everConnected: false };
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
