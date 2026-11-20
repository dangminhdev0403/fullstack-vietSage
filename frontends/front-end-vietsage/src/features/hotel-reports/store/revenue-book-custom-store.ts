"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/core/storage/safe-storage";

export interface CustomRevenueColumn {
  id: string;
  name: string;
  createdAt: string;
}

export const EMPTY_CUSTOM_COLUMNS: CustomRevenueColumn[] = [];

interface RevenueBookCustomState {
  // hotelId -> list of custom columns
  columnsByHotel: Record<string, CustomRevenueColumn[]>;
  // key: `${hotelId}:${columnId}:${rowKey}` -> amount
  valuesByCell: Record<string, number>;
  // key: `${hotelId}:${rowKey}` -> custom note
  notesByRow: Record<string, string>;

  // Actions
  addColumn: (hotelId: string, name: string) => string;
  renameColumn: (hotelId: string, columnId: string, newName: string) => void;
  removeColumn: (hotelId: string, columnId: string) => void;
  setCellValue: (hotelId: string, columnId: string, rowKey: string, value: number | null) => void;
  getCellValue: (hotelId: string, columnId: string, rowKey: string) => number | undefined;
  setNote: (hotelId: string, rowKey: string, note: string) => void;
  getNote: (hotelId: string, rowKey: string) => string | undefined;
  getColumns: (hotelId: string) => CustomRevenueColumn[];
}

export const useRevenueBookCustomStore = create<RevenueBookCustomState>()(
  persist(
    (set, get) => ({
      columnsByHotel: {},
      valuesByCell: {},
      notesByRow: {},

      addColumn: (hotelId, name) => {
        const id = `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        set((state) => {
          const current = state.columnsByHotel[hotelId] || [];
          return {
            columnsByHotel: {
              ...state.columnsByHotel,
              [hotelId]: [
                ...current,
                { id, name: name.trim(), createdAt: new Date().toISOString() },
              ],
            },
          };
        });
        return id;
      },

      renameColumn: (hotelId, columnId, newName) => {
        set((state) => {
          const current = state.columnsByHotel[hotelId] || [];
          return {
            columnsByHotel: {
              ...state.columnsByHotel,
              [hotelId]: current.map((c) =>
                c.id === columnId ? { ...c, name: newName.trim() } : c,
              ),
            },
          };
        });
      },

      removeColumn: (hotelId, columnId) => {
        set((state) => {
          const current = state.columnsByHotel[hotelId] || [];
          const newValues = { ...state.valuesByCell };
          for (const key of Object.keys(newValues)) {
            if (key.startsWith(`${hotelId}:${columnId}:`)) {
              delete newValues[key];
            }
          }
          return {
            columnsByHotel: {
              ...state.columnsByHotel,
              [hotelId]: current.filter((c) => c.id !== columnId),
            },
            valuesByCell: newValues,
          };
        });
      },

      setCellValue: (hotelId, columnId, rowKey, value) => {
        const key = `${hotelId}:${columnId}:${rowKey}`;
        set((state) => {
          const newValues = { ...state.valuesByCell };
          if (value === null || value === undefined) {
            delete newValues[key];
          } else {
            newValues[key] = value;
          }
          return { valuesByCell: newValues };
        });
      },

      getCellValue: (hotelId, columnId, rowKey) => {
        const key = `${hotelId}:${columnId}:${rowKey}`;
        return get().valuesByCell[key];
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

      getColumns: (hotelId) => {
        return get().columnsByHotel[hotelId] ?? EMPTY_CUSTOM_COLUMNS;
      },
    }),
    {
      name: "vietsage_revenue_book_custom_columns",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
