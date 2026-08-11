"use client";

import { useServicePortal } from "@/features/service-portal/use-service-portal";
import { ServiceSettingsView } from "@/features/service-portal/components/service-settings-view";

export default function ServiceSettingsPage() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8 font-medium text-slate-500">Đang tải cấu hình vị trí...</div>;
  if (data.isError || !data.data)
    return <div role="alert" className="p-8 text-rose-600 font-medium">Không thể tải thông tin cấu hình.</div>;
  return <ServiceSettingsView data={data.data} />;
}
