"use client";

import { useEffect, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type GuestDiscoverySearchProps = {
  readonly placeholder: string;
  readonly onSearchChange: (query: string) => void;
  readonly debounceMs?: number;
  readonly initialValue?: string;
};

export function GuestDiscoverySearch({
  placeholder,
  onSearchChange,
  debounceMs = 300,
  initialValue = "",
}: GuestDiscoverySearchProps) {
  const [value, setValue] = useState(initialValue);

  // Debounce search changes
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(value);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, debounceMs, onSearchChange]);

  const handleClear = () => {
    setValue("");
    onSearchChange("");
  };

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#8a8d8a]">
        <VsIcon name="search" className="text-xl" />
      </div>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-12 w-full rounded-2xl border border-[#25483f]/15 bg-[#fffdfa] pl-11 pr-10 text-sm font-medium text-[#18211d] shadow-[0_4px_16px_rgba(31,61,53,0.04)] transition-all placeholder:text-[#8a8d8a] focus:border-[#25483f] focus:outline-none focus:ring-2 focus:ring-[#25483f]/20 md:text-base"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Xóa tìm kiếm"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#7a887f] hover:text-[#18211d]"
        >
          <VsIcon name="close" className="text-lg" />
        </button>
      ) : null}
    </div>
  );
}
