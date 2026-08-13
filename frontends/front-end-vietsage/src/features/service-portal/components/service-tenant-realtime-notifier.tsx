"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServiceTenantRealtime } from "@/features/request-realtime/use-service-tenant-request-realtime";
import { playRequestAlertSound } from "@/features/request-realtime/audio-notifier";

export function ServiceTenantRealtimeNotifier() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handlers = useMemo(
    () => ({
      onReady: () => {
        toast.success("Realtime đối tác đã kết nối", {
          id: "service-tenant-realtime-ready",
          description: "Thông báo đơn hàng dịch vụ mới sẽ xuất hiện tự động.",
          duration: 3000,
        });
      },
      onExternalOrderCreated: (event: unknown) => {
        playRequestAlertSound(false);

        const raw = event as {
          orderId?: string;
          orderNumber?: string;
          serviceName?: string;
          roomNumber?: string;
          guestDisplayName?: string;
        } | null;

        const orderNum = raw?.orderNumber ? ` #${raw.orderNumber}` : "";
        const room = raw?.roomNumber ? ` (Phòng ${raw.roomNumber})` : "";
        const service = raw?.serviceName ?? "Dịch vụ đối tác";

        toast.info(`🔔 CÓ ĐƠN HÀNG DỊCH VỤ MỚI${orderNum}${room}!`, {
          id: `service-tenant-order-created-${raw?.orderId ?? Date.now()}`,
          description: `${service}${raw?.guestDisplayName ? ` - Khách: ${raw.guestDisplayName}` : ""}`,
          duration: 12000,
          action: {
            label: "👉 Xem ngay",
            onClick: () => router.push("/service/orders"),
          },
        });

        void queryClient.invalidateQueries();
      },
      onExternalOrderStatusChanged: (event: unknown) => {
        const raw = event as { orderId?: string; status?: string } | null;
        if (raw?.orderId) {
          toast.info("Trạng thái đơn hàng dịch vụ đã thay đổi", {
            id: `service-tenant-order-status-${raw.orderId}-${raw.status ?? ""}`,
            duration: 5000,
          });
        }
        void queryClient.invalidateQueries();
      },
      onExternalOrderHotelAcknowledged: (event: unknown) => {
        const raw = event as { orderNumber?: string } | null;
        const orderNum = raw?.orderNumber ? ` #${raw.orderNumber}` : "";
        toast.success(`Khách sạn đã tiếp nhận đơn hàng${orderNum}!`, {
          id: `service-tenant-order-ack-${raw?.orderNumber ?? Date.now()}`,
          duration: 6000,
        });
        void queryClient.invalidateQueries();
      },
      onExternalOrderVoucherIssued: (event: unknown) => {
        const raw = event as { orderNumber?: string; voucherNumber?: string } | null;
        const code = raw?.voucherNumber ? `: ${raw.voucherNumber}` : "";
        toast.success(`Khách sạn đã phát hành voucher${code}!`, {
          id: `service-tenant-voucher-issued-${raw?.voucherNumber ?? Date.now()}`,
          duration: 8000,
        });
        void queryClient.invalidateQueries();
      },
      onPartnerSettlementCreated: () => {
        toast.success("Có khoản quyết toán mới từ khách sạn", {
          id: `service-tenant-settlement-created-${Date.now()}`,
          duration: 8000,
          action: {
            label: "Xem đối soát",
            onClick: () => router.push("/service/settlements"),
          },
        });
        void queryClient.invalidateQueries();
      },
      onPartnerSettlementUpdated: () => {
        toast.info("Thông tin quyết toán đã được cập nhật", {
          id: `service-tenant-settlement-updated-${Date.now()}`,
          duration: 5000,
        });
        void queryClient.invalidateQueries();
      },
      onReconnect: () => {
        void queryClient.invalidateQueries();
      },
    }),
    [queryClient, router],
  );

  useServiceTenantRealtime(handlers);

  return null;
}
