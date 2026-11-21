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
export const EMPTY_DELETED_ROWS: string[] = [];

interface RevenueBookCustomState {
  // hotelId -> list of custom columns
  columnsByHotel: Record<string, CustomRevenueColumn[]>;
  // key: `${hotelId}:${columnId}:${rowKey}` -> amount
  valuesByCell: Record<string, number>;
  // key: `${hotelId}:${rowKey}` -> custom note
  notesByRow: Record<string, string>;
  // key: `${hotelId}:${rowKey}` -> custom description
  descriptionsByRow: Record<string, string>;
  // key: `${hotelId}:${field}:${rowKey}` -> text override (roomNumber, docNumber, paymentDate, bankTime)
  textOverrides: Record<string, string>;
  // key: `${hotelId}` -> array of deleted/hidden rowKeys
  deletedRowsByHotel: Record<string, string[]>;

  // Actions
  addColumn: (hotelId: string, name: string) => string;
  renameColumn: (hotelId: string, columnId: string, newName: string) => void;
  removeColumn: (hotelId: string, columnId: string) => void;
  removeAllColumns: (hotelId: string) => void;
  setCellValue: (hotelId: string, columnId: string, rowKey: string, value: number | null) => void;
  getCellValue: (hotelId: string, columnId: string, rowKey: string) => number | undefined;
  setNote: (hotelId: string, rowKey: string, note: string) => void;
  getNote: (hotelId: string, rowKey: string) => string | undefined;
  setDescription: (hotelId: string, rowKey: string, description: string) => void;
  getDescription: (hotelId: string, rowKey: string) => string | undefined;
  deleteRow: (hotelId: string, rowKey: string) => void;
  deleteRows: (hotelId: string, rowKeys: string[]) => void;
  restoreRow: (hotelId: string, rowKey: string) => void;
  restoreAllRows: (hotelId: string) => void;
  clearAllCustomValues: (hotelId: string) => void;
  clearAllCustomDescriptions: (hotelId: string) => void;
  clearAllCustomNotes: (hotelId: string) => void;
  setTextOverride: (hotelId: string, field: string, rowKey: string, value: string) => void;
  getTextOverride: (hotelId: string, field: string, rowKey: string) => string | undefined;
  clearAllTextOverrides: (hotelId: string) => void;
  getColumns: (hotelId: string) => CustomRevenueColumn[];
}

export const useRevenueBookCustomStore = create<RevenueBookCustomState>()(
  persist(
    (set, get) => ({
      columnsByHotel: {},
      valuesByCell: {},
      notesByRow: {},
      descriptionsByRow: {},
      textOverrides: {},
      deletedRowsByHotel: {},

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

      removeAllColumns: (hotelId) => {
        set((state) => {
          const current = state.columnsByHotel[hotelId] || [];
          const newValues = { ...state.valuesByCell };
          for (const col of current) {
            for (const key of Object.keys(newValues)) {
              if (key.startsWith(`${hotelId}:${col.id}:`)) {
                delete newValues[key];
              }
            }
          }
          return {
            columnsByHotel: {
              ...state.columnsByHotel,
              [hotelId]: [],
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

      deleteRow: (hotelId, rowKey) => {
        set((state) => {
          const current = state.deletedRowsByHotel[hotelId] || [];
          if (current.includes(rowKey)) return state;
          return {
            deletedRowsByHotel: {
              ...state.deletedRowsByHotel,
              [hotelId]: [...current, rowKey],
            },
          };
        });
      },

      deleteRows: (hotelId, rowKeys) => {
        set((state) => {
          const current = new Set(state.deletedRowsByHotel[hotelId] || []);
          for (const key of rowKeys) {
            current.add(key);
          }
          return {
            deletedRowsByHotel: {
              ...state.deletedRowsByHotel,
              [hotelId]: Array.from(current),
            },
          };
        });
      },

      restoreRow: (hotelId, rowKey) => {
        set((state) => {
          const current = state.deletedRowsByHotel[hotelId] || [];
          return {
            deletedRowsByHotel: {
              ...state.deletedRowsByHotel,
              [hotelId]: current.filter((k) => k !== rowKey),
            },
          };
        });
      },

      restoreAllRows: (hotelId) => {
        set((state) => ({
          deletedRowsByHotel: {
            ...state.deletedRowsByHotel,
            [hotelId]: [],
          },
        }));
      },

      clearAllCustomValues: (hotelId) => {
        set((state) => {
          const prefix = `${hotelId}:`;
          const nextValues = { ...state.valuesByCell };
          for (const key of Object.keys(nextValues)) {
            if (key.startsWith(prefix)) {
              delete nextValues[key];
            }
          }
          return { valuesByCell: nextValues };
        });
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

      setTextOverride: (hotelId, field, rowKey, value) => {
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
        const key = `${hotelId}:${field}:${rowKey}`;
        return get().textOverrides[key];
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
