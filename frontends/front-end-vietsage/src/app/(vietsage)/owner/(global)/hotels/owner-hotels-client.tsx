"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Hotel } from "@/features/admin/types/admin-contract";
import { useOwnerHotelsQuery } from "@/features/owner/queries/use-owner-hotels-query";

import { VsIcon } from "../../../_components/vs-icon";

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusLabel(status: string | null | undefined): string {
  return status === "DISABLED" ? "Đã vô hiệu" : "Đang vận hành";
}

function statusTone(status: string | null | undefined): string {
  return status === "DISABLED"
    ? "border border-[#d37a68]/40 bg-[#fff0ea] text-[#9b3f2f]"
    : "border border-[#87b59d]/40 bg-[#e9f4ed] text-[#1f5f45]";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Không thể tải danh sách khách sạn.";
}

export function OwnerHotelsClient() {
  const [query, setQuery] = useState("");
  const hotelsQuery = useOwnerHotelsQuery();

  const hotels = useMemo(() => hotelsQuery.data?.items ?? [], [hotelsQuery.data?.items]);
  const total = hotelsQuery.data?.total ?? hotels.length;

  const filteredHotels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return hotels;

    return hotels.filter((hotel) =>
      [hotel.name, hotel.code ?? "", hotel.timezone ?? ""].join(" ").toLowerCase().includes(normalized),
    );
  }, [hotels, query]);

  const metrics = [
    { label: "Tổng khách sạn", value: total || hotels.length, icon: "hotel" },
    {
      label: "Đang vận hành",
      value: hotels.filter((hotel) => hotel.status !== "DISABLED").length,
      icon: "verified_user",
    },
    {
      label: "Đã vô hiệu",
      value: hotels.filter((hotel) => hotel.status === "DISABLED").length,
      icon: "block",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-[1.5rem] border border-white/70 bg-white/75 p-6 shadow-[0_18px_50px_rgba(31,61,53,0.10)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#5f6b63]">{metric.label}</p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-[#17201b]">{metric.value}</p>
              </div>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#24473d] text-[#e8b363]">
                <VsIcon name={metric.icon} className="text-[24px]" />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-[0_18px_50px_rgba(31,61,53,0.08)] backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo khách sạn, mã, múi giờ..."
              className="min-h-12 w-full rounded-2xl border border-[#dfd6c8] bg-[#fffaf0] px-11 text-sm text-[#17201b] outline-none transition-colors placeholder:text-[#8a8174] focus:border-[#bf7836]"
            />
          </div>
          <button
            type="button"
            onClick={() => void hotelsQuery.refetch()}
            disabled={hotelsQuery.isFetching}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#24473d]/15 bg-[#24473d] px-4 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#17201b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <VsIcon name={hotelsQuery.isFetching ? "sync" : "refresh"} className="text-[18px]" />
            Làm mới
          </button>
        </div>
      </section>

      {hotelsQuery.isError ? (
        <section className="rounded-xl border border-[color:rgba(186,26,26,0.28)] bg-[color:rgba(186,26,26,0.08)] p-5 text-sm text-[color:#8f1717]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p>{getErrorMessage(hotelsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void hotelsQuery.refetch()}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 font-semibold text-[color:#8f1717] transition-colors hover:bg-[color:rgba(255,255,255,0.72)]"
            >
              <VsIcon name="refresh" className="text-[18px]" />
              Thử lại
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_18px_60px_rgba(31,61,53,0.12)] backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-[#f8f1e6] text-xs uppercase tracking-[0.10em] text-[#5f6b63]">
              <tr>
                <th className="px-5 py-4">Khách sạn</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Múi giờ</th>
                <th className="px-5 py-4">Cập nhật</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5dccd]">
              {hotelsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--on-surface-variant)]">
                    Đang tải danh sách khách sạn...
                  </td>
                </tr>
              ) : null}

              {!hotelsQuery.isLoading
                ? filteredHotels.map((hotel: Hotel) => (
                    <tr key={hotel.id} className="align-top transition-colors hover:bg-[#f8f1e6]/70">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#17201b]">{hotel.name}</p>
                        <p className="mt-1 text-xs text-[#6d756e]">{hotel.code ?? hotel.id}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(hotel.status)}`}>{statusLabel(hotel.status)}</span>
                      </td>
                      <td className="px-5 py-4 text-[var(--on-surface-variant)]">{hotel.timezone ?? "Asia/Saigon"}</td>
                      <td className="px-5 py-4 text-[var(--on-surface-variant)]">{formatDate(hotel.updatedAt ?? hotel.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/owner/hotels/${hotel.id}`} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#24473d]/15 bg-[#f8f1e6] px-3 py-2 text-xs font-bold text-[#24473d] transition-colors hover:bg-[#efe3cf]">
                          <VsIcon name="settings" className="text-[16px]" />
                          Quản lý
                        </Link>
                      </td>
                    </tr>
                  ))
                : null}

              {!hotelsQuery.isLoading && filteredHotels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--on-surface-variant)]">
                    Không có khách sạn phù hợp.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}




