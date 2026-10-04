"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { showErrorAlert } from "@/libs/swal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useChannex } from "../hooks/use-channel-manager";
import { ChannexChannelDetailModal } from "./channex-channel-detail-modal";
import { ChannexChannelWizard } from "./channex-channel-wizard";
import { ChannelLogo } from "./channel-logo";

export function ChannexHubTab({
  hotelId,
  roleScope = "owner",
  canManage,
}: {
  hotelId: string;
  roleScope?: "owner" | "admin";
  canManage: boolean;
}) {
  const {
    mappings,
    refreshMappings,
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
  const [channelSearch, setChannelSearch] = useState("");
  const [channelKind, setChannelKind] = useState<"all" | "ota" | "meta" | "cm">(
    "all",
  );

  const propertyMapping = mappings.find(
    (mapping) => mapping.kind === "property",
  );

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
    if (!canManage) return;
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

  const handleProviderAction = (provider: (typeof allProviders)[number]) => {
    if (!propertyMapping || channelSession.isPending) return;

    const providerConnections = connectedByCode.get(provider.code) ?? [];
    const isConnected = providerConnections.length > 0;

    if (isConnected) {
      const channelId = providerConnections[0]?.id;
      if (channelId) {
        setSelectedManageChannelId(channelId);
      } else if (canManage) {
        void handleOpenChannels(undefined, provider.code);
      }
    } else if (canManage) {
      if (provider.nativeSupported) {
        setSelectedProviderCode(provider.code);
      } else {
        void handleOpenChannels(undefined, provider.code);
      }
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

              const isCardInteractive = isConnected || canManage;

              return (
                <article
                  key={provider.code}
                  role={isCardInteractive ? "button" : "article"}
                  tabIndex={isCardInteractive ? 0 : -1}
                  onClick={() => {
                    if (isCardInteractive) handleProviderAction(provider);
                  }}
                  onKeyDown={(e) => {
                    if (isCardInteractive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      handleProviderAction(provider);
                    }
                  }}
                  className={`group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 select-none ${
                    isCardInteractive
                      ? "hover:-translate-y-0.5 hover:border-emerald-600/50 hover:shadow-md cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header Row: Logo, Title, Code & Badges */}
                    <div className="flex items-start gap-3.5">
                      <ChannelLogo
                        code={provider.code}
                        title={provider.title}
                        size="md"
                        className="rounded-2xl shadow-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <h3
                            className="truncate text-base font-extrabold text-slate-900 group-hover:text-emerald-800 transition"
                            title={provider.title}
                          >
                            {provider.title}
                          </h3>
                          <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              provider.kind === "ota"
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : provider.kind === "meta"
                                  ? "border-purple-200 bg-purple-50 text-purple-800"
                                  : "border-amber-200 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {provider.kind === "ota" ? "OTA" : provider.kind === "meta" ? "Metasearch" : "CM"}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            #{provider.code}
                          </span>
                          {provider.nativeSupported && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              <VsIcon name="bolt" className="text-xs text-emerald-600" />
                              Native API
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Trạng thái kết nối */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      {isConnected ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Đã kết nối ({providerConnections.length} kênh)</span>
                            </span>
                          </div>
                          {providerConnections.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {providerConnections.map((conn) => (
                                <button
                                  key={conn.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedManageChannelId(conn.id);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-900 cursor-pointer shadow-2xs transition"
                                  title={`${canManage ? "Quản lý" : "Xem"} chi tiết: ${conn.title || conn.id}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      conn.isActive
                                        ? "bg-emerald-500"
                                        : "bg-slate-400"
                                    }`}
                                  />
                                  <span className="max-w-[130px] truncate">
                                    {conn.title || "Kênh"}
                                  </span>
                                  <VsIcon name="arrow_forward" className="text-[10px] opacity-60" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
                            <span className="h-2 w-2 rounded-full bg-slate-300" />
                            <span>Chưa liên kết</span>
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            Sẵn sàng kết nối
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Thông số cần thiết */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Yêu cầu xác thực:
                      </span>
                      {setupParams.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {setupParams.map((param) => (
                            <span
                              key={param.key}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-0.5 text-xs font-medium text-slate-700"
                            >
                              <span>{param.title ?? param.key}</span>
                              {param.type === "password" && (
                                <VsIcon name="lock" className="text-[11px] text-slate-400" />
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic flex items-center gap-1.5">
                          <VsIcon name="check_circle" className="text-sm text-emerald-600" />
                          Ủy quyền nhanh một chạm qua Channex Hub
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Nút thao tác */}
                  {(canManage || isConnected) && (
                    <div className="mt-5 pt-3.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProviderAction(provider);
                        }}
                        disabled={!propertyMapping || channelSession.isPending}
                        className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-2xs ${
                          isConnected
                            ? canManage
                              ? "border-2 border-emerald-600 bg-white text-emerald-800 hover:bg-emerald-50 hover:border-emerald-700"
                              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                            : provider.nativeSupported
                              ? "bg-[#25483f] text-white hover:bg-[#1a352d] shadow-sm"
                              : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900"
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
                          canManage ? (
                            <>
                              <VsIcon name="tune" className="text-base" />
                              <span>Quản lý kết nối</span>
                            </>
                          ) : (
                            <>
                              <VsIcon name="visibility" className="text-base" />
                              <span>Xem chi tiết</span>
                            </>
                          )
                        ) : provider.nativeSupported ? (
                          <>
                            <VsIcon name="add_circle" className="text-base" />
                            <span>Thiết lập kết nối</span>
                          </>
                        ) : (
                          <>
                            <VsIcon name="open_in_new" className="text-base" />
                            <span>Kết nối qua Channex</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Direct Channel Setup Wizard Modal */}
      {canManage && selectedProvider && (
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
          canManage={canManage}
          onClose={() => setSelectedManageChannelId(null)}
          onOpenChannexIframe={
            canManage
              ? (id) => {
                  setSelectedManageChannelId(null);
                  void handleOpenChannels(id);
                }
              : undefined
          }
          onCatalogRefresh={() => {
            void refreshChannelCatalog();
            void refreshMappings();
          }}
        />
      )}

      {/* Channex Special Adapter Iframe Modal Dialog */}
      {canManage && channelIframeUrl && (
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
    </div>
  );
}
