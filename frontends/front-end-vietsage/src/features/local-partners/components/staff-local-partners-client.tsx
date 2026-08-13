"use client";

import Image from "next/image";
import { useState } from "react";
import { SwalVietSage } from "@/libs/swal";
import {
  useLocalPartners,
  useNearbyServiceProviders,
} from "../queries/use-local-partners";
import type {
  LocalPartner,
  LocalPartnerInput,
} from "../types/local-partners-contract";
import { PartnerFormModal } from "./partner-form-modal";
import { HotelPartnerSettlementsTab } from "./hotel-partner-settlements-tab";

export function OwnerNearbyProvidersClient({
  hotelId,
  canManage,
}: {
  hotelId: string;
  canManage: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"partners" | "settlements">("partners");
  const { providers, orders, setProviderLink } =
    useNearbyServiceProviders(hotelId);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "connected" | "unconnected"
  >("all");

  const rawList = providers.data ?? [];

  const filteredProviders = rawList.filter((provider) => {
    const displayName = (
      provider.serviceProfile?.displayName ?? provider.name
    ).toLowerCase();
    const address = (provider.serviceProfile?.address ?? "").toLowerCase();
    const code = provider.code.toLowerCase();
    const matchesSearch =
      !searchTerm.trim() ||
      displayName.includes(searchTerm.toLowerCase()) ||
      address.includes(searchTerm.toLowerCase()) ||
      code.includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === "connected") return provider.linked;
    if (statusFilter === "unconnected") return !provider.linked;
    return true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const totalCount = rawList.length;
  const connectedCount = rawList.filter((p) => p.linked).length;
  const availableCount = totalCount - connectedCount;

  const totalFiltered = filteredProviders.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPaginatedList = filteredProviders.slice(
    startIndex,
    startIndex + pageSize,
  );

  function handleViewDetails(provider: {
    id: string;
    code: string;
    name: string;
    linked: boolean;
    distanceMeters: number;
    serviceProfile: {
      displayName: string;
      address?: string | null;
      phone?: string | null;
    } | null;
    marketplaceServices?: Array<{
      id: string;
      name: string;
      unitPrice: number | string;
      currency: string;
    }>;
  }) {
    const displayName = provider.serviceProfile?.displayName ?? provider.name;
    const address = provider.serviceProfile?.address ?? "Địa chỉ chưa cập nhật";
    const phone = provider.serviceProfile?.phone ?? "Chưa cung cấp";
    const distance = (provider.distanceMeters / 1000).toFixed(1);
    const services = provider.marketplaceServices ?? [];

    const serviceListHtml = services.length
      ? `<div style="text-align:left; max-height:320px; overflow-y:auto; padding-right:6px; margin-top:16px; padding-top:14px; border-top:1px solid #e2e8f0;">
          <p style="font-size:13px; font-weight:800; color:#475569; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Danh mục dịch vụ (${services.length}):</p>
          ${services
            .map(
              (s) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;">
              <span style="font-size:14px; font-weight:600; color:#0f172a;">${s.name}</span>
              <span style="font-size:15px; font-weight:800; color:#047857; margin-left:12px;">${Number(s.unitPrice).toLocaleString("vi-VN")} ${s.currency}</span>
            </div>`,
            )
            .join("")}
        </div>`
      : `<p style="font-size:14px; color:#64748b; margin-top:16px; padding-top:14px; border-top:1px solid #e2e8f0;">Đối tác chưa cập nhật danh mục dịch vụ cụ thể.</p>`;

    void SwalVietSage.fire({
      title: `<span style="font-size:22px; font-weight:800; color:#0f172a;">${displayName}</span>`,
      html: `
        <div style="text-align:left; font-size:15px; color:#334155; line-height:1.7;">
          <p style="margin-bottom:8px;">📍 <b>Địa chỉ:</b> ${address}</p>
          <p style="margin-bottom:8px;">📞 <b>Số điện thoại:</b> ${phone}</p>
          <p style="margin-bottom:8px;">⚡ <b>Bán kính vị trí:</b> ${distance} km</p>
          <p style="margin-bottom:8px;">🔗 <b>Trạng thái kết nối:</b> ${
            provider.linked
              ? "<span style='color:#047857; font-weight:700;'>Đã kết nối</span>"
              : "<span style='color:#059669; font-weight:600;'>Sẵn sàng</span>"
          }</p>
          ${serviceListHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: provider.linked ? "Ngắt kết nối" : "Kết nối đối tác",
      cancelButtonText: "Đóng",
    }).then((res) => {
      if (res.isConfirmed && canManage) {
        void toggle(provider);
      }
    });
  }

  async function toggle(provider: {
    id: string;
    code: string;
    name: string;
    linked: boolean;
    serviceProfile: { displayName: string } | null;
  }) {
    const isConnecting = !provider.linked;
    const displayName = provider.serviceProfile?.displayName ?? provider.name;

    const result = await SwalVietSage.fire({
      icon: isConnecting ? "question" : "warning",
      title: isConnecting
        ? "Xác nhận kết nối đối tác?"
        : "Xác nhận ngắt kết nối?",
      html: isConnecting
        ? `Bạn có chắc chắn muốn kết nối với đối tác <b>${displayName}</b>? Dịch vụ từ đối tác này sẽ hiển thị cho khách lưu trú của khách sạn.`
        : `Bạn có chắc chắn muốn ngắt kết nối với đối tác <b>${displayName}</b>? Khách lưu trú sẽ không còn nhìn thấy dịch vụ này.`,
      showCancelButton: true,
      confirmButtonText: isConnecting ? "Kết nối đối tác" : "Ngắt kết nối",
      cancelButtonText: "Hủy bỏ",
    });

    if (!result.isConfirmed) return;

    try {
      await setProviderLink.mutateAsync({
        providerId: provider.id,
        linked: isConnecting,
      });
      await SwalVietSage.fire({
        icon: "success",
        title: isConnecting
          ? "Đã kết nối đối tác thành công!"
          : "Đã ngắt kết nối đối tác!",
        text: isConnecting
          ? `Đã hoàn tất kết nối khách sạn với đối tác ${displayName}.`
          : `Đã ngắt kết nối khách sạn với đối tác ${displayName}.`,
        timer: 1800,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch {
      await SwalVietSage.fire({
        icon: "error",
        title: "Cập nhật thất bại",
        text: "Không thể cập nhật trạng thái kết nối đối tác. Vui lòng thử lại sau.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  }

  return (
    <section className="space-y-5">
      {/* Workspace Top Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("partners")}
          className={`h-12 px-6 text-sm font-extrabold rounded-2xl transition-all duration-200 cursor-pointer flex items-center gap-2 shadow-2xs ${
            activeTab === "partners"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-[1.01]"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-[1.01]"
          }`}
        >
          <span>🤝</span> Mạng lưới đối tác lân cận
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settlements")}
          className={`h-12 px-6 text-sm font-extrabold rounded-2xl transition-all duration-200 cursor-pointer flex items-center gap-2 shadow-2xs ${
            activeTab === "settlements"
              ? "bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-800 text-white shadow-md shadow-emerald-800/25 scale-[1.01]"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-[1.01]"
          }`}
        >
          <span>💰</span> Quyết toán công nợ đối tác
        </button>
      </div>

      {activeTab === "settlements" ? (
        <HotelPartnerSettlementsTab hotelId={hotelId} />
      ) : (
        <>
          {/* Header Section */}
          <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200/60">
                <svg
                  className="w-3.5 h-3.5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                MẠNG LƯỚI ĐỐI TÁC B2B
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
              Đối Tác Dịch Vụ Lân Cận
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Khám phá và kết nối với các đối tác dịch vụ đáng tin cậy trong khu
              vực của bạn.
            </p>
          </div>

          {/* Operational Metrics */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Tổng ở gần
              </span>
              <span className="text-lg font-black text-slate-900">
                {totalCount}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                Đã kết nối
              </span>
              <span className="text-lg font-black text-emerald-800">
                {connectedCount}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-center shadow-2xs">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Sẵn sàng
              </span>
              <span className="text-lg font-black text-slate-700">
                {availableCount}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar: Compact Search & Connection Status Filters */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên đối tác, địa chỉ..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-9 text-sm font-medium text-slate-900 placeholder:text-slate-400 hover:border-amber-300/80 hover:bg-white focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-600/15 transition-all"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200/80"
                  : "text-slate-600 hover:text-emerald-900 hover:bg-white/80"
              }`}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("connected")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "connected"
                  ? "bg-white text-emerald-800 shadow-2xs border border-emerald-200/80"
                  : "text-slate-600 hover:text-emerald-900 hover:bg-white/80"
              }`}
            >
              Đã kết nối ({connectedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("unconnected")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "unconnected"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200/80"
                  : "text-slate-600 hover:text-emerald-900 hover:bg-white/80"
              }`}
            >
              Sẵn sàng ({availableCount})
            </button>
          </div>
        </div>
      </header>

      {/* Partner Directory List */}
      {providers.isPending ? (
        <div className="flex items-center justify-center min-h-[220px] rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-xs">
          <svg
            className="mr-3 h-5 w-5 animate-spin text-emerald-600"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          Đang tải danh sách đối tác lân cận...
        </div>
      ) : providers.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-800"
        >
          Không thể tải danh sách đối tác. Vui lòng làm mới hoặc thử lại sau.
        </div>
      ) : filteredProviders.length > 0 ? (
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs">
            {currentPaginatedList.map((provider) => {
              const displayName =
                provider.serviceProfile?.displayName ?? provider.name;
              const coverImageUrl = (
                provider.serviceProfile as Record<string, unknown> | null
              )?.coverImageUrl as string | undefined;
              const serviceCount = provider.marketplaceServices?.length ?? 0;

              return (
                <article
                  key={provider.id}
                  onClick={() => handleViewDetails(provider)}
                  className={`group relative p-4 sm:p-5 transition-all duration-300 ease-out cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 hover:-translate-y-0.5 hover:z-10 ${
                    provider.linked
                      ? "border-l-emerald-600 bg-gradient-to-r from-emerald-50/50 via-emerald-50/20 to-transparent hover:border-l-emerald-700 hover:bg-gradient-to-r hover:from-emerald-100/90 hover:via-emerald-50/70 hover:to-amber-50/40 hover:shadow-lg hover:shadow-emerald-950/10 hover:ring-1 hover:ring-emerald-400/50"
                      : "border-l-transparent bg-white hover:border-l-amber-500 hover:bg-gradient-to-r hover:from-amber-50/90 hover:via-amber-50/45 hover:to-emerald-50/30 hover:shadow-lg hover:shadow-amber-900/12 hover:ring-1 hover:ring-amber-300/60"
                  }`}
                >
                  {/* Left Section: Logo + Identity + Attributes */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Custom B2B V Shield Emblem */}
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#17201b] via-[#24352b] to-[#0e1511] border-2 border-[#e8b363]/60 shadow-xs group-hover:border-[#f5d089] group-hover:shadow-[0_0_12px_rgba(232,179,99,0.4)] group-hover:scale-105 transition-all overflow-hidden p-1.5">
                      {coverImageUrl ? (
                        <Image
                          unoptimized
                          src={coverImageUrl}
                          alt={displayName}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover rounded-xl"
                        />
                      ) : (
                        <div className="relative flex h-full w-full items-center justify-center">
                          <svg
                            className="h-7 w-7 drop-shadow-[0_2px_6px_rgba(232,179,99,0.45)]"
                            viewBox="0 0 36 36"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient
                                id={`vGoldGrad-${provider.id}`}
                                x1="0%"
                                y1="0%"
                                x2="100%"
                                y2="100%"
                              >
                                <stop offset="0%" stopColor="#fff4d9" />
                                <stop offset="45%" stopColor="#e8b363" />
                                <stop offset="100%" stopColor="#b37b25" />
                              </linearGradient>
                              <linearGradient
                                id={`vGoldDarkGrad-${provider.id}`}
                                x1="0%"
                                y1="0%"
                                x2="100%"
                                y2="100%"
                              >
                                <stop offset="0%" stopColor="#d69b43" />
                                <stop offset="100%" stopColor="#6e460c" />
                              </linearGradient>
                            </defs>
                            <path
                              d="M18 2.5L30.5 8V17.5C30.5 24.8 25.1 31.2 18 33C10.9 31.2 5.5 24.8 5.5 17.5V8L18 2.5Z"
                              fill="#121914"
                              stroke={`url(#vGoldGrad-${provider.id})`}
                              strokeWidth="1.2"
                            />
                            <path
                              d="M11.5 11.5L16.8 24.5H19.2L14.5 11.5H11.5Z"
                              fill={`url(#vGoldGrad-${provider.id})`}
                            />
                            <path
                              d="M24.5 11.5L19.2 24.5H16.8L21.5 11.5H24.5Z"
                              fill={`url(#vGoldDarkGrad-${provider.id})`}
                            />
                            <polygon
                              points="18,19.2 16.5,24.5 19.5,24.5"
                              fill="#fff5dc"
                              opacity="0.95"
                            />
                          </svg>
                        </div>
                      )}

                      <span className="absolute bottom-1 right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 ring-2 ring-[#17201b]" />
                      </span>
                    </div>

                    {/* Body Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900 group-hover:text-emerald-950 group-hover:translate-x-0.5 transition-all truncate">
                          {displayName}
                        </h2>

                        {/* Connection Status Badge */}
                        {provider.linked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 border border-emerald-300/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 shrink-0">
                            <svg
                              className="h-3 w-3 text-emerald-700"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Đã kết nối
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Sẵn sàng
                          </span>
                        )}
                      </div>

                      {/* Operational Subtext: Address • Distance • Available Services Count */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 truncate max-w-[280px]">
                          <svg
                            className="h-3.5 w-3.5 shrink-0 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {provider.serviceProfile?.address ??
                            "Địa điểm dịch vụ lân cận"}
                        </span>

                        <span className="text-slate-300 hidden sm:inline">
                          •
                        </span>

                        <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50/80 border border-amber-200/70 group-hover:bg-amber-100 group-hover:border-amber-300 transition-colors px-2 py-0.5 rounded-md text-[11px]">
                          ⚡ Bán kính{" "}
                          {(provider.distanceMeters / 1000).toFixed(1)} km
                        </span>

                        <span className="text-slate-300 hidden sm:inline">
                          •
                        </span>

                        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 group-hover:bg-slate-200/80 group-hover:text-slate-900 transition-colors px-2 py-0.5 rounded-md text-[11px]">
                          📦 {serviceCount} dịch vụ sẵn có
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions (Dịch vụ cung cấp + Primary Connect CTA + Hover Indicator) */}
                  <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetails(provider);
                      }}
                      className="h-9 w-[145px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 text-xs font-semibold text-slate-700 hover:bg-amber-50/90 hover:border-amber-300 hover:text-amber-950 hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <svg
                        className="h-3.5 w-3.5 text-slate-500 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      <span>Dịch vụ cung cấp</span>
                    </button>

                    {canManage ? (
                      <button
                        type="button"
                        disabled={setProviderLink.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggle(provider);
                        }}
                        className={`group/conn h-9 w-[145px] inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer ${
                          provider.linked
                            ? "border border-emerald-300/90 bg-emerald-50/90 text-emerald-800 shadow-2xs hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 hover:shadow-xs"
                            : "bg-gradient-to-r from-emerald-800 to-emerald-700 text-white shadow-xs hover:from-emerald-700 hover:to-emerald-600 hover:shadow-md hover:shadow-emerald-900/20 hover:scale-[1.02] active:scale-[0.98]"
                        }`}
                      >
                        {provider.linked ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 group-hover/conn:hidden">
                              <svg
                                className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              Đã kết nối
                            </span>
                            <span className="hidden items-center gap-1.5 group-hover/conn:inline-flex text-rose-700">
                              <svg
                                className="h-3.5 w-3.5 text-rose-600 shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              Ngắt kết nối
                            </span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="h-3.5 w-3.5 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 00-5.656-5.656l-1.1 1.1"
                              />
                            </svg>
                            Kết nối đối tác
                          </>
                        )}
                      </button>
                    ) : null}

                    <div className="hidden sm:flex items-center text-slate-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all pl-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {totalFiltered > pageSize ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
              <span className="text-xs font-semibold text-slate-600">
                Hiển thị{" "}
                <strong className="text-slate-900">{startIndex + 1}</strong> -{" "}
                <strong className="text-slate-900">
                  {Math.min(startIndex + pageSize, totalFiltered)}
                </strong>{" "}
                trên tổng số{" "}
                <strong className="text-slate-900">{totalFiltered}</strong> đối
                tác
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Trang trước
                </button>

                <span className="px-2.5 text-xs font-bold text-slate-700">
                  {safePage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-medium text-slate-500 shadow-2xs">
          Không tìm thấy đối tác dịch vụ phù hợp trong bán kính 30 km.
        </div>
      )}

      {orders.data?.length ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">
            Đơn dịch vụ của khách lưu trú
          </h2>
          {orders.data.map((order) => (
            <div
              key={order.id}
              className="grid gap-1 rounded-xl border border-slate-100 p-3 text-sm sm:grid-cols-4"
            >
              <strong>{order.serviceNameSnapshot}</strong>
              <span>
                {order.stay.guestDisplayName} · Phòng{" "}
                {order.stay.room.roomNumber}
              </span>
              <span>
                {Number(order.totalAmount).toLocaleString("vi-VN")}{" "}
                {order.currency}
              </span>
              <span className="font-semibold">{order.status}</span>
            </div>
          ))}
        </section>
      ) : null}
        </>
      )}
    </section>
  );
}

export function StaffLocalPartnersClient({
  hotelId,
  canManage,
}: {
  hotelId: string;
  canManage: boolean;
}) {
  const { list, categories, create, update, status } =
    useLocalPartners(hotelId);
  const [editing, setEditing] = useState<LocalPartner>();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string>();

  async function save(input: LocalPartnerInput) {
    setError(undefined);
    try {
      if (editing) await update.mutateAsync({ partnerId: editing.id, input });
      else await create.mutateAsync(input);
      setFormOpen(false);
      await SwalVietSage.fire({
        icon: "success",
        title: editing ? "Đã cập nhật đối tác" : "Đã thêm đối tác mới",
        timer: 1500,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (cause) {
      setError("Không thể lưu đối tác. Kiểm tra thông tin rồi thử lại.");
      throw cause;
    }
  }

  async function toggle(partner: LocalPartner) {
    const isDisabling = partner.status === "ACTIVE";
    const result = await SwalVietSage.fire({
      icon: isDisabling ? "warning" : "question",
      title: isDisabling
        ? "Ẩn đối tác địa phương?"
        : "Hiển thị đối tác địa phương?",
      html: isDisabling
        ? `Bạn có chắc muốn ẩn đối tác <b>${partner.name}</b> khỏi ứng dụng khách hàng?`
        : `Cho phép hiển thị lại đối tác <b>${partner.name}</b> trên ứng dụng khách hàng?`,
      showCancelButton: true,
      confirmButtonText: isDisabling ? "Ẩn đối tác" : "Hiển thị đối tác",
      cancelButtonText: "Hủy bỏ",
    });

    if (!result.isConfirmed) return;

    setError(undefined);
    try {
      await status.mutateAsync({
        partnerId: partner.id,
        status: isDisabling ? "DISABLED" : "ACTIVE",
      });
      await SwalVietSage.fire({
        icon: "success",
        title: isDisabling ? "Đã ẩn đối tác" : "Đã bật hiển thị",
        timer: 1500,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch {
      await SwalVietSage.fire({
        icon: "error",
        title: "Cập nhật thất bại",
        text: "Không thể cập nhật trạng thái đối tác. Vui lòng thử lại.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    }
  }

  return (
    <section aria-labelledby="partners-title" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              DANH BẠ KHÁCH SẠN
            </span>
          </div>
          <h1
            id="partners-title"
            className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
          >
            Đối tác địa phương
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Các địa điểm ẩm thực, giải trí và dịch vụ lân cận được đề xuất trong
            Guest OS.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-900/10 transition-all text-sm cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Thêm đối tác</span>
          </button>
        ) : null}
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 flex items-center gap-3"
        >
          <svg
            className="w-5 h-5 text-red-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="font-medium text-sm">{error}</p>
        </div>
      ) : null}

      {list.isPending || categories.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-44 animate-pulse rounded-2xl bg-slate-100 border border-slate-200/60" />
          <div className="h-44 animate-pulse rounded-2xl bg-slate-100 border border-slate-200/60" />
        </div>
      ) : list.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-700"
        >
          <p className="font-semibold text-base">
            Không thể tải danh sách đối tác
          </p>
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : list.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.map((partner) => (
            <article
              key={partner.id}
              className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs hover:border-amber-300/80 hover:bg-gradient-to-br hover:from-amber-50/50 hover:via-white hover:to-emerald-50/30 hover:shadow-lg hover:shadow-amber-900/10 hover:ring-1 hover:ring-amber-300/60 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg text-slate-900 group-hover:text-emerald-800 transition-colors">
                        {partner.name}
                      </h2>
                      {partner.isFeatured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-300/60">
                          <svg
                            className="w-3 h-3 fill-amber-500"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          Nổi bật
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 flex items-center gap-1.5">
                      <svg
                        className="w-4 h-4 text-slate-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {partner.address}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      partner.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {partner.status === "ACTIVE" ? "Đang hiển thị" : "Tạm ẩn"}
                  </span>
                </div>

                {partner.distanceMeters != null ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-50/60 w-fit px-2.5 py-1 rounded-lg border border-emerald-100">
                    📍 {partner.distanceMeters} m từ khách sạn
                  </p>
                ) : null}
              </div>

              {canManage ? (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(partner);
                      setFormOpen(true);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>Chỉnh sửa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(partner)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors cursor-pointer"
                  >
                    {partner.status === "ACTIVE" ? "Ẩn" : "Hiển thị"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <svg
            className="w-12 h-12 text-slate-300 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4m-4 0H9"
            />
          </svg>
          <p className="font-semibold text-base text-slate-700">
            Chưa có đối tác địa phương
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Bấm &ldquo;Thêm đối tác&rdquo; để tạo thông tin đối tác lân cận đầu
            tiên.
          </p>
        </div>
      )}

      {formOpen ? (
        <PartnerFormModal
          partner={editing}
          categories={categories.data ?? []}
          onSave={save}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </section>
  );
}
