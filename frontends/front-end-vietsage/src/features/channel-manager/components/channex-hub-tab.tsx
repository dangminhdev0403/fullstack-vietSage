"use client";

import { useState } from "react";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { useChannex } from "../hooks/use-channel-manager";
import type { ChannexDoctorReport } from "../types/channel-manager.types";
import { ChannexChannelWizard } from "./channex-channel-wizard";

export function ChannexHubTab({
  hotelId,
  roleScope = "owner",
}: {
  hotelId: string;
  roleScope?: "owner" | "admin";
}) {
  const {
    mappings,
    isLoadingMappings,
    refreshMappings,
    pollFeed,
    doctor,
    channelSession,
    prepareChannel,
    createChannel,
    activateChannel,
    channelCatalog,
    isLoadingChannelCatalog,
    isErrorChannelCatalog,
    refreshChannelCatalog,
  } = useChannex(hotelId, roleScope, {
    loadConfig: false,
    loadSimulatedBookings: false,
    loadChannelCatalog: true,
  });
  const [doctorReport, setDoctorReport] = useState<ChannexDoctorReport | null>(
    null,
  );
  const [channelIframeUrl, setChannelIframeUrl] = useState<string | null>(null);
  const [selectedProviderCode, setSelectedProviderCode] = useState<
    string | null
  >(null);
  const [mappingFilter, setMappingFilter] = useState("ALL");
  const [searchMapping, setSearchMapping] = useState("");
  const [copiedMappingId, setCopiedMappingId] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelKind, setChannelKind] = useState("all");

  const propertyMapping = mappings.find(
    (mapping) => mapping.kind === "property",
  );
  const filteredMappings = mappings
    .filter(
      (mapping) => mappingFilter === "ALL" || mapping.kind === mappingFilter,
    )
    .filter((mapping) => {
      const query = searchMapping.trim().toLowerCase();
      if (!query) return true;
      return [mapping.kind, mapping.localId, mapping.channexId].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  const connectedByCode = new Map<
    string,
    NonNullable<typeof channelCatalog>["connections"]
  >();
  for (const connection of channelCatalog?.connections ?? []) {
    connectedByCode.set(connection.code, [
      ...(connectedByCode.get(connection.code) ?? []),
      connection,
    ]);
  }
  const normalizedChannelSearch = channelSearch.trim().toLowerCase();
  const visibleProviders = (channelCatalog?.providers ?? []).filter(
    (provider) => {
      if (channelKind !== "all" && provider.kind !== channelKind) return false;
      if (!normalizedChannelSearch) return true;
      return [
        provider.title,
        provider.code,
        ...provider.parameters.map(
          (parameter) => parameter.title ?? parameter.key,
        ),
      ].some((value) => value.toLowerCase().includes(normalizedChannelSearch));
    },
  );
  const selectedProvider = channelCatalog?.providers.find(
    (provider) => provider.code === selectedProviderCode,
  );

  const handleOpenChannels = async () => {
    try {
      const session = await channelSession.mutateAsync(undefined);
      setChannelIframeUrl(session.iframeUrl);
    } catch (error: unknown) {
      await showErrorAlert("Không thể mở quản lý kênh OTA", error);
    }
  };

  const handleDoctor = async () => {
    try {
      const report = await doctor.mutateAsync(undefined);
      setDoctorReport(report);
    } catch (error: unknown) {
      await showErrorAlert("Không thể chạy kiểm tra Channex", error);
    }
  };

  const handlePendingFeed = async () => {
    try {
      const result = await pollFeed.mutateAsync({ limit: 10 });
      await showSuccessAlert(
        "Đã xử lý đơn đang chờ",
        `Đã xử lý ${result.totalProcessed} revision; tạo mới ${result.newBookingsCount}, hủy ${result.cancelledBookingsCount}, bỏ qua ${result.skippedCount}.`,
      );
    } catch (error: unknown) {
      await showErrorAlert("Không thể xử lý booking feed", error);
    }
  };

  const handleCopyMapping = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMappingId(id);
      window.setTimeout(() => setCopiedMappingId(null), 2000);
    } catch {
      await showErrorAlert(
        "Không thể sao chép",
        "Trình duyệt không cấp quyền clipboard.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--secondary)]">
              Kênh OTA
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--on-surface)]">
              Kết nối và ánh xạ kênh bán
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span
                className={`rounded-full border px-3 py-1.5 font-bold ${
                  propertyMapping
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {propertyMapping
                  ? "Property đã liên kết"
                  : "Chưa liên kết Property"}
              </span>
              <span className="rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-1.5 font-semibold text-[var(--on-surface-variant)]">
                {mappings.length} mapping
              </span>
            </div>
          </div>

          <p className="max-w-xl text-base text-[var(--on-surface-variant)]">
            Chọn nền tảng bên dưới để cấu hình trực tiếp. Channex chỉ mở cho
            OAuth hoặc adapter đặc biệt.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--secondary)]">
              Catalog động từ Channex
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--on-surface)]">
              Toàn bộ nền tảng có thể kết nối
            </h2>
            <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
              Danh sách lấy trực tiếp từ <code>GET /channels/list</code>, không
              giới hạn ở các kênh test. Booking.com dùng Hotel ID test trên
              staging; các nền tảng khác sẵn sàng cấu hình khi vận hành thật.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshChannelCatalog()}
            disabled={isLoadingChannelCatalog}
            className="min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-5 text-base font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
          >
            {isLoadingChannelCatalog ? "Đang tải..." : "Làm mới catalog"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="text-base font-semibold text-[var(--on-surface)]">
            Tìm nền tảng
            <input
              type="search"
              value={channelSearch}
              onChange={(event) => setChannelSearch(event.target.value)}
              placeholder="Booking.com, Agoda, Expedia..."
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
          </label>
          <label className="text-base font-semibold text-[var(--on-surface)]">
            Loại nền tảng
            <select
              value={channelKind}
              onChange={(event) => setChannelKind(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              <option value="all">Tất cả</option>
              <option value="ota">OTA</option>
              <option value="meta">Metasearch</option>
              <option value="cm">Channel Manager</option>
            </select>
          </label>
        </div>

        {isErrorChannelCatalog ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-900">
            Không thể tải catalog Channex. Kiểm tra cấu hình API và thử lại.
          </div>
        ) : isLoadingChannelCatalog ? (
          <div className="mt-5 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-6 text-base text-[var(--on-surface-variant)]">
            Đang tải toàn bộ nền tảng từ Channex...
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-1.5 font-bold text-[var(--on-surface)]">
                {visibleProviders.length}/
                {channelCatalog?.providers.length ?? 0} nền tảng
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800">
                {channelCatalog?.connections.length ?? 0} kết nối đã tạo
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleProviders.map((provider) => {
                const providerConnections =
                  connectedByCode.get(provider.code) ?? [];
                const activeConnections = providerConnections.filter(
                  (connection) => connection.isActive,
                ).length;
                return (
                  <article
                    key={provider.code}
                    className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-[var(--on-surface)]">
                          {provider.title}
                        </h3>
                        <p className="mt-1 font-mono text-sm text-[var(--on-surface-variant)]">
                          {provider.code}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--outline-variant)] bg-white px-2.5 py-1 text-sm font-bold uppercase text-[var(--on-surface-variant)]">
                        {provider.kind}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                      {provider.parameters.length
                        ? `Thiết lập: ${provider.parameters
                            .map((parameter) => parameter.title)
                            .join(", ")}`
                        : "Không yêu cầu trường kết nối thủ công."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm">
                      <span
                        className={`rounded-full border px-2.5 py-1 font-bold ${
                          providerConnections.length
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {providerConnections.length
                          ? `${providerConnections.length} kết nối · ${activeConnections} hoạt động`
                          : "Chưa kết nối"}
                      </span>
                      {provider.messageSupport && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-bold text-blue-800">
                          Tin nhắn
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        provider.nativeSupported
                          ? setSelectedProviderCode(provider.code)
                          : void handleOpenChannels()
                      }
                      disabled={!propertyMapping || channelSession.isPending}
                      className="mt-4 min-h-11 w-full rounded-xl border border-[var(--primary)] bg-white px-4 text-base font-bold text-[var(--primary)] hover:bg-[var(--surface-container-low)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {provider.nativeSupported
                        ? providerConnections.length
                          ? "Cấu hình thêm"
                          : "Thiết lập trực tiếp"
                        : "Mở Channex"}
                    </button>
                  </article>
                );
              })}
            </div>
            {!visibleProviders.length && (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--outline-variant)] p-6 text-center text-base text-[var(--on-surface-variant)]">
                Không có nền tảng phù hợp bộ lọc.
              </p>
            )}
          </>
        )}
      </section>

      {selectedProvider && (
        <ChannexChannelWizard
          key={selectedProvider.code}
          provider={selectedProvider}
          onClose={() => setSelectedProviderCode(null)}
          onFallback={handleOpenChannels}
          prepare={async (input) => {
            try {
              return await prepareChannel.mutateAsync(input);
            } finally {
              prepareChannel.reset();
            }
          }}
          create={async (input) => {
            try {
              return await createChannel.mutateAsync(input);
            } finally {
              createChannel.reset();
            }
          }}
          activate={(channelId) => activateChannel.mutateAsync({ channelId })}
          isPreparing={prepareChannel.isPending}
          isCreating={createChannel.isPending}
          isActivating={activateChannel.isPending}
        />
      )}

      {channelIframeUrl && (
        <section className="overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--on-surface)]">
                Thiết lập adapter đặc biệt trên Channex
              </h2>
              <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                Phiên Channex dùng một lần. Đóng rồi mở lại để tạo phiên mới.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChannelIframeUrl(null)}
              className="min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-5 text-base font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
            >
              Đóng
            </button>
          </div>
          <iframe
            src={channelIframeUrl}
            title="Channex Channel Manager"
            className="h-[760px] w-full bg-white"
            referrerPolicy="no-referrer"
          />
        </section>
      )}

      {roleScope === "admin" && (
        <details className="rounded-2xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm">
          <summary className="min-h-11 cursor-pointer text-xl font-bold text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30">
            Công cụ vận hành
          </summary>
          <div className="mt-5 space-y-6 border-t border-[var(--outline-variant)] pt-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
                <h3 className="text-lg font-bold text-[var(--on-surface)]">
                  Kiểm tra kết nối
                </h3>
                <p className="mt-2 text-base text-[var(--on-surface-variant)]">
                  Kiểm tra API, mappings, ARI mẫu và trạng thái booking feed.
                </p>
                <button
                  type="button"
                  onClick={handleDoctor}
                  disabled={doctor.isPending}
                  className="mt-4 min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-5 text-base font-bold text-[var(--primary)] hover:bg-[var(--surface-container)] disabled:opacity-50"
                >
                  {doctor.isPending ? "Đang kiểm tra..." : "Chạy kiểm tra"}
                </button>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-lg font-bold text-amber-950">
                  Xử lý đơn đang chờ
                </h3>
                <p className="mt-2 text-base text-amber-900">
                  Webhook và poller mỗi phút là luồng bình thường. Chỉ chạy thủ
                  công khi cần xử lý revision đang còn trong cửa sổ feed.
                </p>
                <button
                  type="button"
                  onClick={handlePendingFeed}
                  disabled={pollFeed.isPending}
                  className="mt-4 min-h-11 rounded-xl bg-amber-800 px-5 text-base font-bold text-white hover:bg-amber-900 disabled:opacity-50"
                >
                  {pollFeed.isPending ? "Đang xử lý..." : "Xử lý đơn đang chờ"}
                </button>
              </div>
            </div>

            {doctorReport && (
              <section className="rounded-xl border border-[var(--outline-variant)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-[var(--on-surface)]">
                    Kết quả kiểm tra
                  </h3>
                  <span
                    className={`rounded-full border px-3 py-1 text-sm font-bold ${
                      doctorReport.healthy
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {doctorReport.healthy ? "Đạt" : "Cần xử lý"}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {doctorReport.checks.map((check) => (
                    <div
                      key={check.id}
                      className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {check.status}
                        </span>
                        <span className="text-base font-bold text-[var(--on-surface)]">
                          {check.name}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                        {check.message}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[var(--on-surface)]">
                    Mapping PMS ↔ Channex
                  </h3>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                    Dữ liệu kỹ thuật dùng để đối soát và hỗ trợ sự cố.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshMappings()}
                  disabled={isLoadingMappings}
                  className="min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] disabled:opacity-50"
                >
                  {isLoadingMappings ? "Đang tải..." : "Làm mới"}
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="text-sm font-semibold text-[var(--on-surface)]">
                  Loại mapping
                  <select
                    value={mappingFilter}
                    onChange={(event) => setMappingFilter(event.target.value)}
                    className="mt-1 block min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-base"
                  >
                    <option value="ALL">Tất cả</option>
                    <option value="property">Property</option>
                    <option value="room_type">Hạng phòng</option>
                    <option value="rate_plan">Gói giá</option>
                  </select>
                </label>
                <label className="min-w-0 flex-1 text-sm font-semibold text-[var(--on-surface)]">
                  Tìm mapping
                  <input
                    type="search"
                    value={searchMapping}
                    onChange={(event) => setSearchMapping(event.target.value)}
                    placeholder="Mã nội bộ hoặc UUID"
                    className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base"
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--outline-variant)]">
                <table className="min-w-[760px] w-full text-left">
                  <thead className="bg-[var(--surface-container-low)] text-sm text-[var(--on-surface-variant)]">
                    <tr>
                      <th className="px-4 py-3">Loại</th>
                      <th className="px-4 py-3">Mã nội bộ</th>
                      <th className="px-4 py-3">Channex UUID</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--outline-variant)] bg-white text-base">
                    {filteredMappings.map((mapping) => (
                      <tr key={mapping.id}>
                        <td className="px-4 py-3 font-semibold">
                          {mapping.kind}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {mapping.localId}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {mapping.channexId}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyMapping(
                                mapping.id,
                                mapping.channexId,
                              )
                            }
                            className="min-h-11 rounded-lg px-3 text-sm font-bold text-[var(--primary)] hover:bg-[var(--surface-container-low)]"
                          >
                            {copiedMappingId === mapping.id
                              ? "Đã chép"
                              : "Chép UUID"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!filteredMappings.length && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-base text-[var(--on-surface-variant)]"
                        >
                          Không có mapping phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-sm text-[var(--on-surface-variant)]">
              Kiểm thử booking inbound thật: dùng Booking CRS hoặc kênh OTA test
              chính thức trên Channex. PMS không có API tạo booking Channex giả.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
