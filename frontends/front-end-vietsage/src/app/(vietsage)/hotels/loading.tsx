import { ContentLoadingState } from "../_components/route-boundary-state";

export default function HotelsLoading() {
  return (
    <div className="p-6">
      <ContentLoadingState label="Đang tải dữ liệu vận hành khách sạn..." tone="hotel" />
    </div>
  );
}
