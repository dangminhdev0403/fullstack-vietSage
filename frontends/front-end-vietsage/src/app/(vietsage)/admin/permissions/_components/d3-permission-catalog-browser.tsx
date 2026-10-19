"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "../../../_components/vs-icon";
import {
  type BusinessPermissionRisk,
  type D3BoundedContextKey,
  type D3CatalogPermission,
  D3_BOUNDED_CONTEXTS,
  IMMUTABLE_D3_PERMISSION_CATALOG,
  RISK_LEVEL_CONFIG,
} from "../d3-catalog-types";

type ViewMode = "GRID" | "TABLE";

type D3PermissionCatalogBrowserProps = {
  customCatalog?: readonly D3CatalogPermission[] | D3CatalogPermission[];
};

export function D3PermissionCatalogBrowser({
  customCatalog,
}: D3PermissionCatalogBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContext, setSelectedContext] = useState<D3BoundedContextKey | "ALL">("ALL");
  const [selectedRisk, setSelectedRisk] = useState<BusinessPermissionRisk | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const permissions = useMemo(() => {
    return customCatalog && customCatalog.length > 0
      ? customCatalog
      : IMMUTABLE_D3_PERMISSION_CATALOG;
  }, [customCatalog]);

  const stats = useMemo(() => {
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;

    const contextCounts = new Map<D3BoundedContextKey, number>();

    for (const item of permissions) {
      if (item.risk === "LOW") low++;
      else if (item.risk === "MEDIUM") medium++;
      else if (item.risk === "HIGH") high++;
      else if (item.risk === "CRITICAL") critical++;

      contextCounts.set(
        item.bounded_context,
        (contextCounts.get(item.bounded_context) ?? 0) + 1,
      );
    }

    return {
      total: permissions.length,
      low,
      medium,
      high,
      critical,
      contextCounts,
    };
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return permissions.filter((item) => {
      if (selectedContext !== "ALL" && item.bounded_context !== selectedContext) {
        return false;
      }

      if (selectedRisk !== "ALL" && item.risk !== selectedRisk) {
        return false;
      }

      if (q) {
        const matchKey = item.key.toLowerCase().includes(q);
        const matchLabel = item.label.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchContext = (
          D3_BOUNDED_CONTEXTS[item.bounded_context]?.name ?? ""
        )
          .toLowerCase()
          .includes(q);
        return matchKey || matchLabel || matchDesc || matchContext;
      }

      return true;
    });
  }, [permissions, searchQuery, selectedContext, selectedRisk]);

  const groupedByContext = useMemo(() => {
    const groups: {
      context: typeof D3_BOUNDED_CONTEXTS[D3BoundedContextKey];
      items: D3CatalogPermission[];
    }[] = [];

    const order: D3BoundedContextKey[] = [
      "identity",
      "property",
      "billing",
      "marketplace",
      "channel-manager",
      "guest",
      "kbtt",
      "system",
    ];

    for (const ctxKey of order) {
      const items = filteredPermissions.filter(
        (perm) => perm.bounded_context === ctxKey,
      );
      if (items.length > 0) {
        groups.push({
          context: D3_BOUNDED_CONTEXTS[ctxKey],
          items,
        });
      }
    }

    return groups;
  }, [filteredPermissions]);

  const handleCopyKey = async (key: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(key);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch {
      // Fallback silent
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Context & Invariant Banner ── */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <VsIcon name="lock" className="text-[20px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 text-balance">
                  Danh mục Quyền hạn Hệ thống D3 (Immutable Business Permissions)
                </h2>
                <span className="rounded-md border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 whitespace-nowrap">
                  Bất biến
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600 text-pretty">
                Tập hợp các quyền hạn chuẩn được mã hóa cố định theo kiến trúc Bounded Context và hợp đồng API bảo vệ.
                Các quyền này không bị sửa đổi tùy tiện mà dùng làm chuẩn mực để gán cho các vai trò vận hành.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:self-center">
            <span className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-xs whitespace-nowrap">
              {stats.total} Quyền hệ thống
            </span>
            <span className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-xs whitespace-nowrap">
              8 Bounded Contexts
            </span>
          </div>
        </div>

        {/* ── Risk Stats Indicator Bar ── */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-blue-200/60 pt-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setSelectedRisk(selectedRisk === "LOW" ? "ALL" : "LOW")}
            className={`flex items-center gap-2 rounded-xl p-2 text-left transition ${
              selectedRisk === "LOW"
                ? "bg-white shadow-xs ring-2 ring-emerald-600"
                : "hover:bg-white/60"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">
                {stats.low} Quyền
              </div>
              <div className="text-xs text-gray-500 truncate">
                Mức Thấp (Read)
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRisk(selectedRisk === "MEDIUM" ? "ALL" : "MEDIUM")}
            className={`flex items-center gap-2 rounded-xl p-2 text-left transition ${
              selectedRisk === "MEDIUM"
                ? "bg-white shadow-xs ring-2 ring-blue-600"
                : "hover:bg-white/60"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">
                {stats.medium} Quyền
              </div>
              <div className="text-xs text-gray-500 truncate">
                Mức Trung bình
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRisk(selectedRisk === "HIGH" ? "ALL" : "HIGH")}
            className={`flex items-center gap-2 rounded-xl p-2 text-left transition ${
              selectedRisk === "HIGH"
                ? "bg-white shadow-xs ring-2 ring-amber-600"
                : "hover:bg-white/60"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">
                {stats.high} Quyền
              </div>
              <div className="text-xs text-gray-500 truncate">
                Mức Cao (Ghi)
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRisk(selectedRisk === "CRITICAL" ? "ALL" : "CRITICAL")}
            className={`flex items-center gap-2 rounded-xl p-2 text-left transition ${
              selectedRisk === "CRITICAL"
                ? "bg-white shadow-xs ring-2 ring-rose-600"
                : "hover:bg-white/60"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900">
                {stats.critical} Quyền
              </div>
              <div className="text-xs text-gray-500 truncate">
                Trọng yếu (Tiền bạc/Hệ thống)
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Search and Filter Controls Toolbar ── */}
      <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <VsIcon name="search" className="text-[18px]" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo mã quyền (vd: hotel.stays.check-in) hoặc tên quyền..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2.5 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                aria-label="Xóa tìm kiếm"
              >
                <VsIcon name="close" className="text-[16px]" />
              </button>
            )}
          </div>

          {/* View Mode & Action Controls */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 p-0.5" role="group" aria-label="Kiểu hiển thị">
              <button
                type="button"
                onClick={() => setViewMode("GRID")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "GRID"
                    ? "bg-white text-emerald-950 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <VsIcon name="grid_view" className="text-[16px]" />
                <span>Theo phân nhóm</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("TABLE")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "TABLE"
                    ? "bg-white text-emerald-950 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <VsIcon name="table_rows" className="text-[16px]" />
                <span>Bảng tra cứu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bounded Context Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
          <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center gap-1">
            <VsIcon name="filter_alt" className="text-[14px]" />
            <span>Phân hệ:</span>
          </span>

          <button
            type="button"
            onClick={() => setSelectedContext("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              selectedContext === "ALL"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tất cả ({permissions.length})
          </button>

          {(Object.keys(D3_BOUNDED_CONTEXTS) as D3BoundedContextKey[]).map(
            (ctxKey) => {
              const cfg = D3_BOUNDED_CONTEXTS[ctxKey];
              const count = stats.contextCounts.get(ctxKey) ?? 0;
              const isSelected = selectedContext === ctxKey;

              return (
                <button
                  key={ctxKey}
                  type="button"
                  onClick={() => setSelectedContext(isSelected ? "ALL" : ctxKey)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-emerald-800 text-white shadow-xs"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <VsIcon name={cfg.icon} className="text-[14px]" />
                  <span>{cfg.shortName}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-xs ${
                      isSelected
                        ? "bg-emerald-900 text-emerald-100"
                        : "bg-white/80 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            },
          )}
        </div>

        {/* Risk Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center gap-1">
            <VsIcon name="shield" className="text-[14px]" />
            <span>Mức rủi ro:</span>
          </span>

          <button
            type="button"
            onClick={() => setSelectedRisk("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              selectedRisk === "ALL"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tất cả rủi ro
          </button>

          {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as BusinessPermissionRisk[]).map(
            (risk) => {
              const cfg = RISK_LEVEL_CONFIG[risk];
              const isSelected = selectedRisk === risk;
              let count = 0;
              if (risk === "LOW") count = stats.low;
              else if (risk === "MEDIUM") count = stats.medium;
              else if (risk === "HIGH") count = stats.high;
              else count = stats.critical;

              return (
                <button
                  key={risk}
                  type="button"
                  onClick={() => setSelectedRisk(isSelected ? "ALL" : risk)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                    isSelected
                      ? "bg-gray-900 text-white border-gray-900 shadow-xs"
                      : `${cfg.badgeBg} hover:opacity-90`
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSelected ? "bg-white" : cfg.dotBg
                    }`}
                  />
                  <span>{risk}</span>
                  <span className="opacity-75">({count})</span>
                </button>
              );
            },
          )}

          {/* Reset Filters */}
          {(searchQuery || selectedContext !== "ALL" || selectedRisk !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedContext("ALL");
                setSelectedRisk("ALL");
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              <VsIcon name="restart_alt" className="text-[14px]" />
              <span>Đặt lại bộ lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Results Counter Bar ── */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <div>
          Hiển thị{" "}
          <strong className="text-gray-900 font-bold">
            {filteredPermissions.length}
          </strong>{" "}
          / {permissions.length} quyền hệ thống D3
          {selectedContext !== "ALL" && (
            <span>
              {" "}
              thuộc phân hệ{" "}
              <strong className="text-emerald-900">
                {D3_BOUNDED_CONTEXTS[selectedContext]?.name}
              </strong>
            </span>
          )}
        </div>
        {filteredPermissions.length > 0 && (
          <div className="text-xs text-gray-400">
            Nhấn vào mã quyền để sao chép vào bộ nhớ tạm
          </div>
        )}
      </div>

      {/* ── Empty State ── */}
      {filteredPermissions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 mb-3">
            <VsIcon name="search_off" className="text-[28px]" />
          </div>
          <h3 className="text-sm font-bold text-gray-900 text-balance">
            Không tìm thấy quyền hệ thống phù hợp
          </h3>
          <p className="mt-1 max-w-md text-xs text-gray-500 text-pretty">
            Không có quyền nào khớp với từ khóa &ldquo;{searchQuery}&rdquo; hoặc bộ lọc hiện tại. Thử xóa bộ lọc để xem toàn bộ danh mục.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedContext("ALL");
              setSelectedRisk("ALL");
            }}
            className="mt-4 flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-gray-800"
          >
            <VsIcon name="restart_alt" className="text-[16px]" />
            <span>Xóa bộ lọc</span>
          </button>
        </div>
      )}

      {/* ── Mode 1: Grouped Grid View ── */}
      {viewMode === "GRID" && filteredPermissions.length > 0 && (
        <div className="space-y-6">
          {groupedByContext.map(({ context, items }) => (
            <div
              key={context.key}
              className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs"
            >
              {/* Group Header */}
              <div className="flex flex-col gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${context.color.badgeBg}`}
                  >
                    <VsIcon name={context.icon} className="text-[18px]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 text-balance">
                        {context.name}
                      </h3>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 whitespace-nowrap">
                        {items.length} quyền
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 text-pretty">
                      {context.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items Grid */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map((perm) => {
                  const riskConfig = RISK_LEVEL_CONFIG[perm.risk];
                  const isCopied = copiedKey === perm.key;

                  return (
                    <div
                      key={perm.key}
                      className="group flex flex-col justify-between rounded-xl border border-gray-150 bg-gray-50/50 p-3.5 transition-all hover:border-emerald-300 hover:bg-white hover:shadow-xs"
                    >
                      <div>
                        {/* Header: Label & Risk Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold leading-snug text-gray-900 group-hover:text-emerald-950">
                            {perm.label}
                          </h4>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap border ${riskConfig.badgeBg}`}
                            title={riskConfig.description}
                          >
                            {perm.risk}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="mt-1 text-xs text-gray-600 text-pretty line-clamp-2">
                          {perm.description}
                        </p>
                      </div>

                      {/* Footer: Key code + Copy button */}
                      <div className="mt-3 flex items-center justify-between border-t border-gray-150/80 pt-2.5">
                        <code
                          className="font-mono text-xs text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-200 select-all truncate max-w-[220px]"
                          title={perm.key}
                        >
                          {perm.key}
                        </code>

                        <button
                          type="button"
                          onClick={() => handleCopyKey(perm.key)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                            isCopied
                              ? "bg-emerald-100 text-emerald-800"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          }`}
                          title="Sao chép mã quyền"
                        >
                          <VsIcon
                            name={isCopied ? "check" : "content_copy"}
                            className="text-[14px]"
                          />
                          <span className="whitespace-nowrap">
                            {isCopied ? "Đã chép" : "Chép"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Mode 2: Dense Technical Table View ── */}
      {viewMode === "TABLE" && filteredPermissions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/90 text-xs font-bold uppercase tracking-wider text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Mã quyền (Key)
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Tên quyền hệ thống
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Mô tả nghiệp vụ
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Bounded Context
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Mức rủi ro
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPermissions.map((perm) => {
                  const ctx = D3_BOUNDED_CONTEXTS[perm.bounded_context];
                  const riskCfg = RISK_LEVEL_CONFIG[perm.risk];
                  const isCopied = copiedKey === perm.key;

                  return (
                    <tr
                      key={perm.key}
                      className="transition-colors hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-3">
                        <code
                          className="font-mono text-xs font-semibold text-emerald-950 bg-emerald-50/70 border border-emerald-200/70 rounded px-2 py-0.5 select-all whitespace-nowrap"
                        >
                          {perm.key}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900 text-balance">
                          {perm.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        <div className="text-xs text-gray-600 text-pretty">
                          {perm.description}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ctx.color.badgeBg}`}
                        >
                          <VsIcon name={ctx.icon} className="text-[12px]" />
                          <span>{ctx.shortName}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap border ${riskCfg.badgeBg}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${riskCfg.dotBg}`} />
                          <span>{perm.risk}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleCopyKey(perm.key)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            isCopied
                              ? "bg-emerald-100 text-emerald-800"
                              : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-2xs"
                          }`}
                        >
                          <VsIcon
                            name={isCopied ? "check" : "content_copy"}
                            className="text-[14px]"
                          />
                          <span className="whitespace-nowrap">
                            {isCopied ? "Đã chép" : "Sao chép"}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
