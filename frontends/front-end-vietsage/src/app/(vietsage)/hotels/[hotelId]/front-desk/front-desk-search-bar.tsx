"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export type FrontDeskSearchBarProps = {
  initialQuery?: string;
  tab: string;
  range?: string;
};

export function FrontDeskSearchBar({
  initialQuery = "",
  tab,
  range,
}: FrontDeskSearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal state when external query changes (e.g. navigation or reset)
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  const applySearch = (nextValue: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = nextValue.trim().slice(0, 120);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", tab);
    if (range && (tab === "arrivals" || tab === "groups")) {
      params.set("range", range);
    }
    if (trimmed) {
      params.set("q", trimmed);
      params.delete("page");
    } else {
      params.delete("q");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      applySearch(nextValue);
    }, 300);
  };

  const handleClear = () => {
    setValue("");
    applySearch("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    applySearch(value);
  };

  const placeholderText =
    tab === "groups"
      ? "Tìm theo mã đoàn, tên đoàn, người đại diện hoặc số điện thoại..."
      : tab === "in-house"
        ? "Tìm theo tên khách, số điện thoại hoặc số phòng..."
        : "Tìm theo tên khách, số điện thoại, mã đặt phòng hoặc số phòng...";

  const hasSearch = Boolean(value.trim() || initialQuery);

  return (
    <form
      className="flex flex-col gap-2.5 sm:flex-row"
      onSubmit={handleSubmit}
      role="search"
    >
      <label className="sr-only" htmlFor="front-desk-search">
        {placeholderText}
      </label>
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
          <VsIcon name="search" className="h-4.5 w-4.5" />
        </div>
        <input
          id="front-desk-search"
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-11 text-base text-slate-900 shadow-2xs transition-all placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          maxLength={120}
          name="q"
          onChange={handleInputChange}
          placeholder={placeholderText}
          type="search"
          value={value}
        />
        {isPending ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-blue-600">
            <VsIcon name="refresh" className="h-4 w-4 animate-spin" />
          </div>
        ) : hasSearch ? (
          <button
            aria-label="Xóa nội dung tìm kiếm"
            className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3.5 text-slate-400 hover:text-slate-700"
            onClick={handleClear}
            title="Xóa nội dung tìm kiếm"
            type="button"
          >
            <VsIcon name="close" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <button
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-[0.98] whitespace-nowrap"
        type="submit"
      >
        {isPending ? (
          <VsIcon name="refresh" className="h-4 w-4 animate-spin" />
        ) : (
          <VsIcon name="search" className="h-4 w-4" />
        )}
        <span>Tìm kiếm</span>
      </button>

      {hasSearch ? (
        <button
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] whitespace-nowrap"
          onClick={handleClear}
          type="button"
        >
          <VsIcon name="close" className="h-4 w-4" />
          <span>Xóa tìm kiếm</span>
        </button>
      ) : null}
    </form>
  );
}
