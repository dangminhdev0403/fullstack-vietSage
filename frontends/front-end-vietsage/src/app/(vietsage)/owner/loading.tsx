import { ContentLoadingState } from "../_components/route-boundary-state";

export default function OwnerLoading() {
  return (
    <div className="p-6">
      <ContentLoadingState label="Đang tải dữ liệu không gian chủ khách sạn..." tone="owner" />
    </div>
  );
}
