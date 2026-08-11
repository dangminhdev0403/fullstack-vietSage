"use client";

import { useServicePortal } from "@/features/service-portal/use-service-portal";
import { ServiceOrdersView } from "@/features/service-portal/components/service-orders-view";

export default function ServiceOrdersPage() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8 font-medium text-slate-500">Đang tải danh sách đơn hàng...</div>;
  if (data.isError || !data.data)
    return <div role="alert" className="p-8 text-rose-600 font-medium">Không thể tải danh sách đơn hàng.</div>;
  return <ServiceOrdersView data={data.data} />;
}
