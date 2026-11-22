"use client";

import { useEffect } from "react";
import { RouteBoundaryState } from "@/app/(vietsage)/_components/route-boundary-state";

export default function StaffRoomsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[STAFF_ROOMS_ERROR_BOUNDARY]", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <RouteBoundaryState
      eyebrow="Sơ đồ phòng"
      title="Không thể tải sơ đồ phòng"
      message={
        error?.message
          ? `Lỗi: ${error.message}. Vui lòng thử tải lại trang hoặc kiểm tra kết nối hệ thống.`
          : "Hệ thống dữ liệu phòng đang phản hồi chậm hoặc chưa sẵn sàng. Vui lòng thử tải lại trang."
      }
      tone="staff"
      action={{ label: "Thử tải lại", onClick: reset }}
    />
  );
}
