"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

// Only non-financial text annotations may be overridden locally in the spreadsheet.
// Monetary amounts, revenue totals, payment dates, transfer times and balances are strictly system-owned.
export type EditableRevenueTextField = "roomNumber" | "docNumber";

const ALLOWED_TEXT_FIELDS = new Set<string>(["roomNumber", "docNumber"]);

function sanitizeTextOverrides(
  raw: Record<string, string> | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const parts = key.split(":");
    const field = parts[1];
    if (field && ALLOWED_TEXT_FIELDS.has(field)) {
      clean[key] = value.trim();
    }
  }
  return clean;
}

interface RevenueBookCustomState {
  // key: `${hotelId}:${rowKey}` -> custom note
  notesByRow: Record<string, string>;
  // key: `${hotelId}:${rowKey}` -> custom description
  descriptionsByRow: Record<string, string>;
  // key: `${hotelId}:${field}:${rowKey}` -> non-financial text override (roomNumber, docNumber)
  textOverrides: Record<string, string>;
  // key: `${hotelId}` -> whether "Doanh thu kênh bán" column is enabled (default false)
  showChannelRevenueByHotel: Record<string, boolean>;

  // Actions
  setShowChannelRevenue: (hotelId: string, show: boolean) => void;
  getShowChannelRevenue: (hotelId: string) => boolean;
  setNote: (hotelId: string, rowKey: string, note: string) => void;
  getNote: (hotelId: string, rowKey: string) => string | undefined;
  setDescription: (hotelId: string, rowKey: string, description: string) => void;
  getDescription: (hotelId: string, rowKey: string) => string | undefined;
  setTextOverride: (
    hotelId: string,
    field: EditableRevenueTextField,
    rowKey: string,
    value: string,
  ) => void;
  getTextOverride: (
    hotelId: string,
    field: EditableRevenueTextField,
    rowKey: string,
  ) => string | undefined;
  clearAllCustomDescriptions: (hotelId: string) => void;
  clearAllCustomNotes: (hotelId: string) => void;
  clearAllTextOverrides: (hotelId: string) => void;
}

export const useRevenueBookCustomStore = create<RevenueBookCustomState>()(
  persist(
    (set, get) => ({
      notesByRow: {},
      descriptionsByRow: {},
      textOverrides: {},
      showChannelRevenueByHotel: {},

      setShowChannelRevenue: (hotelId, show) => {
        set((state) => ({
          showChannelRevenueByHotel: {
            ...state.showChannelRevenueByHotel,
            [hotelId]: show,
          },
        }));
      },

      getShowChannelRevenue: (hotelId) => {
        return Boolean(get().showChannelRevenueByHotel[hotelId]);
      },

      setNote: (hotelId, rowKey, note) => {
        const key = `${hotelId}:${rowKey}`;
        set((state) => {
          const newNotes = { ...state.notesByRow };
          if (!note.trim()) {
            delete newNotes[key];
          } else {
            newNotes[key] = note.trim();
          }
          return { notesByRow: newNotes };
        });
      },

      getNote: (hotelId, rowKey) => {
        const key = `${hotelId}:${rowKey}`;
        return get().notesByRow[key];
      },

      setDescription: (hotelId, rowKey, description) => {
        const key = `${hotelId}:${rowKey}`;
        set((state) => {
          const newDesc = { ...state.descriptionsByRow };
          if (!description.trim()) {
            delete newDesc[key];
          } else {
            newDesc[key] = description.trim();
          }
          return { descriptionsByRow: newDesc };
        });
      },

      getDescription: (hotelId, rowKey) => {
        const key = `${hotelId}:${rowKey}`;
        return get().descriptionsByRow[key];
      },

      setTextOverride: (hotelId, field, rowKey, value) => {
        if (!ALLOWED_TEXT_FIELDS.has(field)) return;
        const key = `${hotelId}:${field}:${rowKey}`;
        set((state) => {
          const next = { ...state.textOverrides };
          if (!value.trim()) {
            delete next[key];
          } else {
            next[key] = value.trim();
          }
          return { textOverrides: next };
        });
      },

      getTextOverride: (hotelId, field, rowKey) => {
        if (!ALLOWED_TEXT_FIELDS.has(field)) return undefined;
        const key = `${hotelId}:${field}:${rowKey}`;
        return get().textOverrides[key];
      },

      clearAllCustomDescriptions: (hotelId) => {
        set((state) => {
          const prefix = `${hotelId}:`;
          const nextDesc = { ...state.descriptionsByRow };
          for (const key of Object.keys(nextDesc)) {
            if (key.startsWith(prefix)) {
              delete nextDesc[key];
            }
          }
          return { descriptionsByRow: nextDesc };
        });
      },

      clearAllCustomNotes: (hotelId) => {
        set((state) => {
          const prefix = `${hotelId}:`;
          const nextNotes = { ...state.notesByRow };
          for (const key of Object.keys(nextNotes)) {
            if (key.startsWith(prefix)) {
              delete nextNotes[key];
            }
          }
          return { notesByRow: nextNotes };
        });
      },

      clearAllTextOverrides: (hotelId) => {
        set((state) => {
          const prefix = `${hotelId}:`;
          const next = { ...state.textOverrides };
          for (const key of Object.keys(next)) {
            if (key.startsWith(prefix)) {
              delete next[key];
            }
          }
          return { textOverrides: next };
        });
      },
    }),
    {
      name: "vietsage_revenue_book_custom_columns",
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        notesByRow: state.notesByRow,
        descriptionsByRow: state.descriptionsByRow,
        textOverrides: state.textOverrides,
        showChannelRevenueByHotel: state.showChannelRevenueByHotel,
      }),
      migrate: (persistedState) => {
        const legacy = (persistedState ?? {}) as {
          notesByRow?: Record<string, string>;
          descriptionsByRow?: Record<string, string>;
          textOverrides?: Record<string, string>;
          showChannelRevenueByHotel?: Record<string, boolean>;
        };
        const showChannelRevenueByHotel: Record<string, boolean> = {};
        if (
          legacy.showChannelRevenueByHotel &&
          typeof legacy.showChannelRevenueByHotel === "object"
        ) {
          for (const [hotelId, enabled] of Object.entries(
            legacy.showChannelRevenueByHotel,
          )) {
            if (typeof enabled === "boolean") {
              showChannelRevenueByHotel[hotelId] = enabled;
            }
          }
        }
        return {
          notesByRow:
            legacy.notesByRow && typeof legacy.notesByRow === "object"
              ? legacy.notesByRow
              : {},
          descriptionsByRow:
            legacy.descriptionsByRow &&
            typeof legacy.descriptionsByRow === "object"
              ? legacy.descriptionsByRow
              : {},
          textOverrides: sanitizeTextOverrides(legacy.textOverrides),
          showChannelRevenueByHotel,
        };
      },
    },
  ),
);
