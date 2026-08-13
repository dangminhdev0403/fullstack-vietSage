import { useEffect, useRef } from "react";
import { serviceTenantRequestRealtimeManager } from "./service-tenant-connection-manager";
import { requestRealtimeEnabled } from "./request-realtime-config";

type Handlers = {
  onReady?: () => void;
  onExternalOrderCreated?: (event: unknown) => void;
  onExternalOrderStatusChanged?: (event: unknown) => void;
  onExternalOrderHotelAcknowledged?: (event: unknown) => void;
  onExternalOrderVoucherIssued?: (event: unknown) => void;
  onPartnerSettlementCreated?: (event: unknown) => void;
  onPartnerSettlementUpdated?: (event: unknown) => void;
  onReconnect?: () => void;
  onError?: (error: unknown) => void;
};

export function useServiceTenantRealtime(
  handlers: Handlers,
  options: { enabled?: boolean; tenantKey?: string } = {},
) {
  const tenantKey = options.tenantKey ?? "SERVICE_TENANT";
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);
  const enabled = (options.enabled ?? true) && requestRealtimeEnabled;

  useEffect(() => {
    if (!enabled) return;
    return serviceTenantRequestRealtimeManager.subscribe(tenantKey, {
      onReady: () => ref.current.onReady?.(),
      onExternalOrderCreated: (value) => ref.current.onExternalOrderCreated?.(value),
      onExternalOrderStatusChanged: (value) => ref.current.onExternalOrderStatusChanged?.(value),
      onExternalOrderHotelAcknowledged: (value) => ref.current.onExternalOrderHotelAcknowledged?.(value),
      onExternalOrderVoucherIssued: (value) => ref.current.onExternalOrderVoucherIssued?.(value),
      onPartnerSettlementCreated: (value) => ref.current.onPartnerSettlementCreated?.(value),
      onPartnerSettlementUpdated: (value) => ref.current.onPartnerSettlementUpdated?.(value),
      onReconnect: () => ref.current.onReconnect?.(),
      onError: (error) => ref.current.onError?.(error),
    });
  }, [enabled, tenantKey]);
}
