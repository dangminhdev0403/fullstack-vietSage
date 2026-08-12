"use client";

import { useGuestI18n } from "../../i18n/use-guest-i18n";

export type CategoryChipItem = {
  id: string;
  name: string;
};

type GuestCategoryChipsProps = {
  categories: CategoryChipItem[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  allLabel?: string;
};

export function GuestCategoryChips({
  categories,
  selectedCategoryId,
  onSelectCategory,
  allLabel,
}: GuestCategoryChipsProps) {
  const { t } = useGuestI18n();
  const resolvedAllLabel = allLabel ?? t("categories.all");

  return (
    <div
      role="group"
      aria-label={t("categories.filterLabel")}
      className="flex w-full gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar"
    >
      <button
        type="button"
        aria-pressed={selectedCategoryId === null}
        onClick={() => onSelectCategory(null)}
        className={`vs-touch-button shrink-0 min-h-11 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25483f] ${
          selectedCategoryId === null
            ? "bg-[#25483f] text-white shadow-[0_4px_12px_rgba(37,72,63,0.18)]"
            : "border border-[#25483f]/15 bg-[#fffdfa] text-[#4a554e] hover:border-[#25483f]/30 hover:bg-[#f4eedb]/40 hover:text-[#18211d]"
        }`}
      >
        {resolvedAllLabel}
      </button>
      {categories.map((category) => {
        const isSelected = selectedCategoryId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectCategory(category.id)}
            className={`vs-touch-button shrink-0 min-h-11 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#25483f] ${
              isSelected
                ? "bg-[#25483f] text-white shadow-[0_4px_12px_rgba(37,72,63,0.18)]"
                : "border border-[#25483f]/15 bg-[#fffdfa] text-[#4a554e] hover:border-[#25483f]/30 hover:bg-[#f4eedb]/40 hover:text-[#18211d]"
            }`}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
