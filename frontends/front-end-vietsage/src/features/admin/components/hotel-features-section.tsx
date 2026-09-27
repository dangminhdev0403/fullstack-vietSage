"use client";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useHotelFeatures } from "@/features/admin/hooks/use-hotel-features";
import { SwalVietSage, showErrorAlert } from "@/libs/swal";

export function HotelFeaturesSection({
  hotelId,
  hotelName,
}: {
  hotelId: string;
  hotelName: string;
}) {
  const {
    features,
    isLoading,
    isError,
    error,
    refetch,
    updateStatus,
    isUpdating,
    updatingVariables,
  } = useHotelFeatures({ hotelId });

  return (
    <section
      className="border-t border-slate-100 pt-5 dark:border-slate-800"
      aria-labelledby="hotel-features-title"
    >
      <h3
        id="hotel-features-title"
        className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"
      >
        <VsIcon name="tune" className="text-lg text-[#24473d]" />
        Tính năng đã mở khoá
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Tính năng sản phẩm của khách sạn, độc lập với quyền người dùng.
      </p>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <p className="font-semibold">Không thể tải trạng thái tính năng.</p>
          <p className="mt-1 text-xs">
            {error instanceof Error ? error.message : "Vui lòng thử lại."}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 min-h-10 rounded-xl border border-rose-300 bg-white px-4 text-xs font-semibold hover:bg-rose-100"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {features.map((feature) => {
            const enabled = feature.status === "ENABLED";
            const pending =
              isUpdating && updatingVariables?.featureKey === feature.key;
            const nextStatus = enabled ? "DISABLED" : "ENABLED";
            return (
              <article
                key={feature.key}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/60"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-slate-900 dark:text-white">
                      {feature.label}
                    </strong>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                    >
                      {enabled ? "Đang bật" : "Đang tắt"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {feature.description}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`${enabled ? "Tắt" : "Bật"} ${feature.label} cho ${hotelName}`}
                  onClick={async () => {
                    const confirmation = await SwalVietSage.fire({
                      icon: "question",
                      title: enabled ? "Tắt tính năng?" : "Bật tính năng?",
                      text: `${enabled ? "Tắt" : "Bật"} “${feature.label}” cho “${hotelName}”?`,
                      showCancelButton: true,
                      reverseButtons: false,
                      confirmButtonText: enabled ? "Đồng ý tắt" : "Đồng ý bật",
                      cancelButtonText: "Hủy",
                    });
                    if (!confirmation.isConfirmed) return;
                    try {
                      await updateStatus(feature.key, nextStatus);
                    } catch (mutationError) {
                      await showErrorAlert(
                        "Không thể cập nhật tính năng",
                        mutationError,
                      );
                    }
                  }}
                  className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                >
                  {pending
                    ? "Đang xử lý..."
                    : enabled
                      ? "Tắt tính năng"
                      : "Bật tính năng"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
