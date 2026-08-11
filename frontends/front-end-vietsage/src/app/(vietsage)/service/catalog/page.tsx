"use client";

import { useServicePortal } from "@/features/service-portal/use-service-portal";
import { ServiceCatalogView } from "@/features/service-portal/components/service-catalog-view";

export default function ServiceCatalogPage() {
  const { data } = useServicePortal();
  if (data.isPending) return <div className="p-8 font-medium text-slate-500">Đang tải danh mục dịch vụ...</div>;
  if (data.isError || !data.data)
    return <div role="alert" className="p-8 text-rose-600 font-medium">Không thể tải thông tin dịch vụ.</div>;
  return <ServiceCatalogView data={data.data} />;
}
