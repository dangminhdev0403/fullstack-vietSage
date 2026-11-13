export type RevenueCategory = "ROOM" | "MINIBAR" | "LAUNDRY" | "OTHER";
export type RevenuePaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";

export type RevenueBookRevenueLine = {
  date: string;
  roomRevenue: number;
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  revenueTotal: number;
};

export type RevenueBookCollection = {
  id: string;
  receivedAt: string;
  amount: number;
  method: string;
  reference: string | null;
};

export type RevenueBookEntry = {
  id: string;
  source: "FOLIO" | "MANUAL" | "DEPOSIT" | "RECEIVABLE";
  date: string;
  roomId: string | null;
  roomNumber: string | null;
  documentNumber: string | null;
  description: string;
  category: RevenueCategory | null;
  amount: number | null;
  roomRevenue: number;
  minibarRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  revenueTotal: number;
  openingBalance: number;
  closingBalance: number;
  balanceAdjustment: number;
  revenueLines: RevenueBookRevenueLine[];
  collections: RevenueBookCollection[];
  notes: string | null;
  declarationStatus: string | null;
  version: number | null;
  voidedAt: string | null;
};

export type RevenueBookTotals = Omit<RevenueBookRevenueLine, "date"> & {
  collectedTotal: number;
  cashTotal: number;
  bankTransferTotal: number;
  otherCollectedTotal: number;
  openingBalance: number;
  closingBalance: number;
  balanceAdjustment: number;
};

export type RevenueBook = {
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
};

export type RevenueBookQuery = { from?: string; to?: string };
export type RevenueCollectionInput = {
  receivedAt: string;
  amount: number;
  method: RevenuePaymentMethod;
  reference?: string;
};
export type RevenueEntryFields = {
  date: string;
  description: string;
  category: RevenueCategory;
  amount: number;
  roomId?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
};
export type CreateRevenueEntryInput = RevenueEntryFields & {
  idempotencyKey: string;
  collection?: RevenueCollectionInput;
};
export type UpdateRevenueEntryInput = RevenueEntryFields & { version: number };
export type CollectRevenueInput = RevenueCollectionInput & { idempotencyKey: string; version: number };
export type VoidRevenueEntryInput = { reason: string; version: number };
