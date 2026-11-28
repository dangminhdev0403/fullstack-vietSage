import type { operations } from "@/generated/openapi/v1";

type BookOperation = operations["HotelRevenueBookController_getBook"];
type RawRevenueBook = BookOperation["responses"][200]["content"]["application/json"]["data"];
type RawRevenueBookEntry = RawRevenueBook["entries"][number];
export type RevenueBookCategory = "ROOM" | "MINIBAR" | "LAUNDRY" | "OTHER";
export type RevenueBookSource = "FOLIO" | "MANUAL" | "DEPOSIT" | "RECEIVABLE";
export type RevenueSettlementStatus = "SETTLED" | "UNPAID" | "OVERPAID";
export type RevenueBookCollection = RawRevenueBookEntry["collections"][number] & {
  splitGroupId?: string | null;
};
export type RevenueBookEntry = Omit<RawRevenueBookEntry, "collections"> & {
  collections: RevenueBookCollection[];
};
export type RevenueBook = Omit<RawRevenueBook, "entries"> & {
  entries: RevenueBookEntry[];
};
export type RevenueBookRevenueLine = RevenueBookEntry["revenueLines"][number];
export type RevenueBookTotals = RevenueBook["summary"];
type RawCreateRevenueEntryInput = operations["HotelRevenueBookController_create"]["requestBody"]["content"]["application/json"];
type RawCollectRevenueInput = operations["HotelRevenueBookController_collect"]["requestBody"]["content"]["application/json"];
export type RevenueCategory = RawCreateRevenueEntryInput["category"];
export type RevenuePaymentMethod = NonNullable<NonNullable<RawCreateRevenueEntryInput["collection"]>["method"]>;
export type RevenueCollectionSplitItem = {
  method: RevenuePaymentMethod;
  amount: number;
  destinationAccount?: string | null;
};
export type RevenueCollectionInput = Omit<NonNullable<RawCreateRevenueEntryInput["collection"]>, "amount" | "method"> & {
  amount?: number;
  method?: RevenuePaymentMethod;
  destinationAccount?: string | null;
  splits?: RevenueCollectionSplitItem[];
};
export type CreateRevenueEntryInput = Omit<RawCreateRevenueEntryInput, "collection"> & {
  collection?: RevenueCollectionInput;
};
export type UpdateRevenueEntryInput = operations["HotelRevenueBookController_update"]["requestBody"]["content"]["application/json"];
export type CollectRevenueInput = Omit<RawCollectRevenueInput, "amount" | "method"> & {
  amount?: number;
  method?: RevenuePaymentMethod;
  destinationAccount?: string | null;
  splits?: RevenueCollectionSplitItem[];
};
export type VoidRevenueEntryInput = operations["HotelRevenueBookController_void"]["requestBody"]["content"]["application/json"];
export type RevenueEntryFields = Omit<UpdateRevenueEntryInput, "version">;
export type RevenueBookQuery = NonNullable<BookOperation["parameters"]["query"]> & {
  category?: RevenueBookCategory;
  paymentMethod?: RevenuePaymentMethod;
  source?: RevenueBookSource;
  settlementStatus?: RevenueSettlementStatus;
};
export type UpsertRevenueTargetInput = {
  month: string;
  targetAmount: number;
};
export type UpdateRevenueNoteInput = {
  accountKey: string;
  notes?: string | null;
  roomId?: string | null;
  expectedPriorNote?: string | null;
};
export type UpsertRevenueTargetResponse = {
  hotelId: string;
  month: string;
  targetAmount: number | null;
  revenueTargets: Record<string, number>;
};
