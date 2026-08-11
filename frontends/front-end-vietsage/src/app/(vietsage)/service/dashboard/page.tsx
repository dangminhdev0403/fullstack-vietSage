"use client";

import { useServicePortal } from "@/features/service-portal/use-service-portal";
import { ServiceDashboardView } from "@/features/service-portal/components/service-dashboard-view";

export default function ServiceDashboardPage() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8 font-medium text-slate-500">Đang tải bảng điều khiển...</div>;
  if (data.isError || !data.data)
    return <div role="alert" className="p-8 text-rose-600 font-medium">Không thể tải thông tin đối tác dịch vụ.</div>;
  return <ServiceDashboardView data={data.data} />;
}
