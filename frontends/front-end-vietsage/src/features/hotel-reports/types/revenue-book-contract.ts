import type { operations } from "@/generated/openapi/v1";

type BookOperation = operations["HotelRevenueBookController_getBook"];
export type RevenueBook = BookOperation["responses"][200]["content"]["application/json"]["data"];
export type RevenueBookQuery = NonNullable<BookOperation["parameters"]["query"]>;
export type RevenueBookEntry = RevenueBook["entries"][number];
export type RevenueBookRevenueLine = RevenueBookEntry["revenueLines"][number];
export type RevenueBookCollection = RevenueBookEntry["collections"][number];
export type RevenueBookTotals = RevenueBook["summary"];
export type CreateRevenueEntryInput = operations["HotelRevenueBookController_create"]["requestBody"]["content"]["application/json"];
export type UpdateRevenueEntryInput = operations["HotelRevenueBookController_update"]["requestBody"]["content"]["application/json"];
export type CollectRevenueInput = operations["HotelRevenueBookController_collect"]["requestBody"]["content"]["application/json"];
export type VoidRevenueEntryInput = operations["HotelRevenueBookController_void"]["requestBody"]["content"]["application/json"];
export type RevenueEntryFields = Omit<UpdateRevenueEntryInput, "version">;
export type RevenueCollectionInput = NonNullable<CreateRevenueEntryInput["collection"]>;
export type RevenueCategory = CreateRevenueEntryInput["category"];
export type RevenuePaymentMethod = RevenueCollectionInput["method"];
