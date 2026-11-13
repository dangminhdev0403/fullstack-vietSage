import type { RevenueBookCategory } from "./schemas/hotel-revenue-book.schema";

export interface RevenueBookCollection {
  id: string;
  receivedAt: string;
  amount: number;
  method: string;
  reference: string | null;
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
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  revenueTotal: number;
  revenueLines: Array<{ date: string; roomRevenue: number; minibarRevenue: number; laundryRevenue: number; otherRevenue: number; revenueTotal: number }>;
  balanceAdjustment: number;
  openingBalance: number;
  closingBalance: number;
  collections: RevenueBookCollection[];
  notes: string | null;
  declarationStatus: string | null;
  version: number | null;
  voidedAt: string | null;
}
export interface RevenueBookTotals {
  roomRevenue: number;
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  revenueTotal: number;
  collectedTotal: number;
  cashTotal: number;
  bankTransferTotal: number;
  otherCollectedTotal: number;
  openingBalance: number;
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
  rooms: Array<{ id: string; number: string }>;
  canManage: boolean;
}
