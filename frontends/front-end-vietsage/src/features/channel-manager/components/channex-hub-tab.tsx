"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useChannex } from "../hooks/use-channel-manager";
import type {
  ChannexDoctorReport,
} from "../types/channel-manager.types";
import { ChannexChannelDetailModal } from "./channex-channel-detail-modal";
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
  const [loadingProviderCode, setLoadingProviderCode] = useState<string | null>(
    null,
  );
  const [selectedProviderCode, setSelectedProviderCode] = useState<
    string | null
  >(null);
  const [selectedManageChannelId, setSelectedManageChannelId] = useState<
    string | null
  >(null);
  const [mappingFilter, setMappingFilter] = useState("ALL");
  const [searchMapping, setSearchMapping] = useState("");
  const [copiedMappingId, setCopiedMappingId] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelKind, setChannelKind] = useState<"all" | "ota" | "meta" | "cm">(
    "all",
  );

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

  const connectedByCode = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof channelCatalog>["connections"]
    >();
    for (const connection of channelCatalog?.connections ?? []) {
      map.set(connection.code, [
        ...(map.get(connection.code) ?? []),
        connection,
      ]);
    }
    return map;
  }, [channelCatalog?.connections]);

  const allProviders = useMemo(
    () => channelCatalog?.providers ?? [],
    [channelCatalog?.providers],
  );

  const normalizedChannelSearch = channelSearch.trim().toLowerCase();

  const visibleProviders = useMemo(() => {
    return allProviders.filter((provider) => {
      if (channelKind !== "all" && provider.kind !== channelKind) return false;

      if (!normalizedChannelSearch) return true;
      return [
        provider.title,
        provider.code,
        ...provider.parameters.map(
          (parameter) => parameter.title ?? parameter.key,
        ),
      ].some((value) => value.toLowerCase().includes(normalizedChannelSearch));
    });
  }, [allProviders, channelKind, normalizedChannelSearch]);

  const sortedVisibleProviders = useMemo(() => {
    return [...visibleProviders].sort((a, b) => {
      const aConn = (connectedByCode.get(a.code) ?? []).length > 0 ? 1 : 0;
      const bConn = (connectedByCode.get(b.code) ?? []).length > 0 ? 1 : 0;
      if (aConn !== bConn) return bConn - aConn;

      const aNative = a.nativeSupported ? 1 : 0;
      const bNative = b.nativeSupported ? 1 : 0;
      if (aNative !== bNative) return bNative - aNative;

      return a.title.localeCompare(b.title);
    });
  }, [visibleProviders, connectedByCode]);

  const selectedProvider = allProviders.find(
    (provider) => provider.code === selectedProviderCode,
  );

  const handleOpenChannels = async (
    channelId?: string,
    providerCode?: string,
  ) => {
    try {
      if (providerCode) setLoadingProviderCode(providerCode);
      const session = await channelSession.mutateAsync({ channelId });
      setChannelIframeUrl(session.iframeUrl);
    } catch (error: unknown) {
      await showErrorAlert("Không thể mở quản lý kênh OTA", error);
    } finally {
      setLoadingProviderCode(null);
    }
  };

  const handleCloseIframe = useCallback(() => {
    setChannelIframeUrl(null);
    void refreshChannelCatalog();
    void refreshMappings();
  }, [refreshChannelCatalog, refreshMappings]);

  useEffect(() => {
    if (!channelIframeUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseIframe();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [channelIframeUrl, handleCloseIframe]);

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
      {/* Dynamic Catalog Section */}
      <section className="rounded-2xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--outline-variant)] pb-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--on-surface)]">
                Kênh bán phòng OTA
              </h2>
              {propertyMapping ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Property Channex đã liên kết
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Chưa liên kết Property Channex
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--on-surface-variant)]">
              Danh sách các nền tảng kết nối và thông số cấu hình cần thiết.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void refreshChannelCatalog()}
              disabled={isLoadingChannelCatalog}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50 transition cursor-pointer shadow-2xs"
            >
              <VsIcon
                name="refresh"
                className={`text-base ${isLoadingChannelCatalog ? "animate-spin text-[var(--primary)]" : ""}`}
              />
              <span>{isLoadingChannelCatalog ? "Đang tải..." : "Làm mới catalog"}</span>
            </button>
          </div>
        </div>

        {/* Warning banner when property mapping is missing */}
        {!propertyMapping && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <strong>Lưu ý:</strong> Khách sạn chưa được cấu hình liên kết với Channex.{" "}
            {roleScope === "admin"
              ? "Vui lòng liên kết khách sạn với Property trên Channex trong tab Cấu hình Channex trước khi kết nối OTA."
              : "Vui lòng liên hệ quản trị viên nền tảng để hoàn tất liên kết thuộc tính (Property Mapping) trước khi mở bán OTA."}
          </div>
        )}

        {/* Search & Kind Filter Toolbar */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--on-surface-variant)]">
              <VsIcon name="search" className="text-base" />
            </span>
            <input
              type="search"
              value={channelSearch}
              onChange={(event) => setChannelSearch(event.target.value)}
              placeholder="Tìm kiếm nền tảng (Booking.com, Agoda, Airbnb, Expedia...)"
              className="min-h-10 w-full rounded-xl border border-[var(--outline-variant)] bg-white pl-9 pr-9 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition shadow-2xs"
            />
            {channelSearch && (
              <button
                type="button"
                onClick={() => setChannelSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <VsIcon name="close" className="text-sm" />
              </button>
            )}
          </div>

          {/* Kind Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-1">
            {[
              { id: "all", label: "Tất cả" },
              { id: "ota", label: "OTA" },
              { id: "meta", label: "Metasearch" },
              { id: "cm", label: "Channel Manager" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChannelKind(tab.id as typeof channelKind)}
                className={`min-h-8 rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                  channelKind === tab.id
                    ? "bg-white text-[var(--primary)] shadow-2xs"
                    : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content: Unconfigured, Error, Loading, Empty, or Providers Grid */}
        {channelCatalog && channelCatalog.isConfigured === false ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center space-y-2">
            <p className="font-bold text-amber-950 text-base">
              Channex API chưa được cấu hình trên hệ thống
            </p>
            <p className="text-xs text-amber-800 max-w-lg mx-auto leading-relaxed">
              Biến môi trường CHANNEX_API_KEY chưa được thiết lập trên máy chủ. Vui lòng kiểm tra lại cấu hình hệ thống để kích hoạt danh mục kênh và kết nối OTA.
            </p>
            <button
              type="button"
              onClick={() => void refreshChannelCatalog()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-800 px-4 text-xs font-bold text-white hover:bg-amber-900 transition cursor-pointer mt-2"
            >
              <VsIcon name="refresh" className="text-sm" />
              <span>Kiểm tra lại</span>
            </button>
          </div>
        ) : isErrorChannelCatalog ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-5 text-center space-y-2">
            <p className="font-bold text-rose-900">
              Không thể tải danh mục kênh từ Channex
            </p>
            <p className="text-xs text-rose-700">
              Vui lòng kiểm tra lại cấu hình API Channex và thử lại.
            </p>
            <button
              type="button"
              onClick={() => void refreshChannelCatalog()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-700 px-4 text-xs font-bold text-white hover:bg-rose-800 transition cursor-pointer mt-2"
            >
              <VsIcon name="refresh" className="text-sm" />
              <span>Thử lại</span>
            </button>
          </div>
        ) : isLoadingChannelCatalog ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-xl border border-[var(--outline-variant)] bg-white p-4 space-y-3"
              >
                <div className="h-5 w-2/3 rounded bg-gray-200" />
                <div className="h-4 w-1/3 rounded bg-gray-100" />
                <div className="h-8 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : sortedVisibleProviders.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--outline-variant)] p-8 text-center text-sm text-[var(--on-surface-variant)]">
            Không tìm thấy nền tảng nào phù hợp.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedVisibleProviders.map((provider) => {
              const providerConnections =
                connectedByCode.get(provider.code) ?? [];
              const isConnected = providerConnections.length > 0;
              const setupParams = provider.parameters.filter(
                (p) => p.type !== "hidden",
              );

              return (
                <article
                  key={provider.code}
                  className="flex flex-col justify-between rounded-xl border border-[var(--outline-variant)] bg-white p-4 shadow-2xs hover:border-[var(--primary)] transition-colors"
                >
                  <div className="space-y-3">
                    {/* Tên nền tảng & Loại */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3
                          className="truncate text-base font-bold text-[var(--on-surface)]"
                          title={provider.title}
                        >
                          {provider.title}
                        </h3>
                        <p className="font-mono text-xs text-[var(--on-surface-variant)] mt-0.5">
                          {provider.code}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--on-surface-variant)]">
                        {provider.kind}
                      </span>
                    </div>

                    {/* Trạng thái kết nối */}
                    <div>
                      {isConnected ? (
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span>Đã kết nối ({providerConnections.length} kênh)</span>
                          </span>
                          {providerConnections.length > 1 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {providerConnections.map((conn) => (
                                <button
                                  key={conn.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedManageChannelId(conn.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 cursor-pointer transition"
                                  title={`Quản lý chi tiết: ${conn.title || conn.id}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      conn.isActive
                                        ? "bg-emerald-500"
                                        : "bg-slate-400"
                                    }`}
                                  />
                                  <span className="max-w-[120px] truncate">
                                    {conn.title || "Kênh"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-2.5 py-0.5 text-xs font-medium text-[var(--on-surface-variant)]">
                          Chưa kết nối
                        </span>
                      )}
                    </div>

                    {/* Thông số cần thiết */}
                    <div className="border-t border-[var(--outline-variant)] pt-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--on-surface-variant)] block mb-1.5">
                        Thông số cần thiết:
                      </span>
                      {setupParams.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {setupParams.map((param) => (
                            <span
                              key={param.key}
                              className="inline-flex items-center rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-2 py-0.5 text-xs text-[var(--on-surface)]"
                            >
                              {param.title ?? param.key}
                              {param.type === "password" && " 🔒"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--on-surface-variant)] italic">
                          Không yêu cầu thông số (xác thực qua Channex Hub)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Nút thao tác */}
                  <div className="mt-4 pt-3 border-t border-[var(--outline-variant)]">
                    <button
                      type="button"
                      onClick={() => {
                        if (isConnected) {
                          const channelId = providerConnections[0]?.id;
                          if (channelId) {
                            setSelectedManageChannelId(channelId);
                          } else {
                            void handleOpenChannels(undefined, provider.code);
                          }
                        } else if (provider.nativeSupported) {
                          setSelectedProviderCode(provider.code);
                        } else {
                          void handleOpenChannels(undefined, provider.code);
                        }
                      }}
                      disabled={!propertyMapping || channelSession.isPending}
                      className={`min-h-10 w-full rounded-lg px-3 text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                        isConnected
                          ? "border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50"
                          : provider.nativeSupported
                            ? "bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 shadow-2xs"
                            : "border border-[var(--outline-variant)] bg-white text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
                      }`}
                    >
                      {loadingProviderCode === provider.code ? (
                        <>
                          <VsIcon
                            name="refresh"
                            className="animate-spin text-base"
                          />
                          <span>Đang kết nối...</span>
                        </>
                      ) : isConnected ? (
                        <span>Quản lý kết nối</span>
                      ) : provider.nativeSupported ? (
                        <span>Thiết lập kết nối</span>
                      ) : (
                        <span>Kết nối qua Channex</span>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Direct Channel Setup Wizard Modal */}
      {selectedProvider && (
        <ChannexChannelWizard
          key={selectedProvider.code}
          provider={selectedProvider}
          onClose={() => setSelectedProviderCode(null)}
          onFallback={() =>
            handleOpenChannels(undefined, selectedProvider.code)
          }
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

      {/* Native Channel Detail & Rate Mapping Modal */}
      {selectedManageChannelId && (
        <ChannexChannelDetailModal
          hotelId={hotelId}
          channelId={selectedManageChannelId}
          roleScope={roleScope}
          onClose={() => setSelectedManageChannelId(null)}
          onOpenChannexIframe={(id) => {
            setSelectedManageChannelId(null);
            void handleOpenChannels(id);
          }}
          onCatalogRefresh={() => {
            void refreshChannelCatalog();
            void refreshMappings();
          }}
        />
      )}

      {/* Channex Special Adapter Iframe Modal Dialog */}
      {channelIframeUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="channex-iframe-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={handleCloseIframe}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-[var(--outline-variant)] max-w-6xl w-full h-[90vh] max-h-[960px] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] font-bold">
                  <VsIcon name="public" className="text-xl" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="channex-iframe-modal-title"
                      className="text-lg sm:text-xl font-bold text-[var(--on-surface)]"
                    >
                      Thiết lập kết nối trên Channex Hub
                    </h2>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                      Phiên bảo mật
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm text-[var(--on-surface-variant)]">
                    Sau khi liên kết kênh trên Channex, bấm{" "}
                    <strong>Đóng cửa sổ</strong> để cập nhật trạng thái kết nối.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseIframe}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] shadow-2xs transition cursor-pointer self-end sm:self-center"
              >
                <VsIcon name="close" className="text-base" />
                <span>Đóng cửa sổ</span>
              </button>
            </div>
            <div className="relative flex-1 w-full bg-slate-50 min-h-0">
              <iframe
                src={channelIframeUrl}
                title="Channex Channel Manager"
                className="h-full w-full bg-white border-0"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Admin Operational Diagnostics & Mappings */}
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
                  className="mt-4 min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-5 text-base font-bold text-[var(--primary)] hover:bg-[var(--surface-container)] disabled:opacity-50 cursor-pointer"
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
                  className="mt-4 min-h-11 rounded-xl bg-amber-800 px-5 text-base font-bold text-white hover:bg-amber-900 disabled:opacity-50 cursor-pointer"
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
                  className="min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-low)] disabled:opacity-50 cursor-pointer"
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
                            className="min-h-11 rounded-lg px-3 text-sm font-bold text-[var(--primary)] hover:bg-[var(--surface-container-low)] cursor-pointer"
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
