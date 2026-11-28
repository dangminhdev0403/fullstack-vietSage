import type { RevenueBookCategory } from "./schemas/hotel-revenue-book.schema";

export interface RevenueBookServiceCategory {
  id: string;
  name: string;
  sortOrder: number;
}
export interface RevenueBookCollection {
  id: string;
  receivedAt: string;
  amount: number;
  method: string;
  reference: string | null;
  splitGroupId?: string | null;
}
export interface RevenueBookEntry {
  id: string;
  source: "FOLIO" | "MANUAL" | "DEPOSIT" | "RECEIVABLE";
  date: string;
  roomId: string | null;
  roomNumber: string | null;
  documentNumber: string | null;
  description: string;
  category: RevenueBookCategory | null;
  amount: number | null;
  roomRevenue: number;
  channelRevenue: number;
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  serviceCategoryRevenues: Record<string, number>;
  otherServiceRevenue: number;
  revenueTotal: number;
  revenueLines: Array<{
    date: string;
    roomRevenue: number;
    channelRevenue: number;
    minibarRevenue: number;
    laundryRevenue: number;
    otherRevenue: number;
    serviceCategoryRevenues: Record<string, number>;
    otherServiceRevenue: number;
    revenueTotal: number;
  }>;
  balanceAdjustment: number;
  closingBalance: number;
  collections: RevenueBookCollection[];
  notes: string | null;
  declarationStatus: string | null;
  version: number | null;
  voidedAt: string | null;
}
export interface RevenueBookTotals {
  roomRevenue: number;
  channelRevenue: number;
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  serviceCategoryRevenues: Record<string, number>;
  otherServiceRevenue: number;
  revenueTotal: number;
  collectedTotal: number;
  cashTotal: number;
  bankTransferTotal: number;
  otherCollectedTotal: number;
  closingBalance: number;
  balanceAdjustment: number;
}
export interface RevenueBook {
  hotelId: string;
  hotelName: string;
  timeZone: string;
  currency: string;
  from: string;
  to: string;
  entries: RevenueBookEntry[];
  summary: RevenueBookTotals;
  serviceCategories: RevenueBookServiceCategory[];
  rooms: Array<{ id: string; number: string }>;
  canManage: boolean;
}
