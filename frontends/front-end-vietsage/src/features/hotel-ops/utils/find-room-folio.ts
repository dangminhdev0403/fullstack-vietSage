import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";

export async function findRoomFolio(
  roomId: string,
  fetchPage: (page: number) => Promise<BillingPage<FolioListItem>>,
): Promise<FolioListItem | null> {
  for (let page = 1; page <= 100; page += 1) {
    const result = await fetchPage(page);
    const match = result.items.find((folio) =>
      (folio.status === "OPEN" || folio.status === "CHECKOUT_PENDING") &&
      (folio.room?.id === roomId || ("roomId" in folio && folio.roomId === roomId)),
    );
    if (match) return match;
    const pages = Math.ceil(result.total / result.limit);
    if (!Number.isFinite(pages) || pages < 0 || result.page !== page || result.limit <= 0) {
      throw new Error("Incomplete folio pagination");
    }
    if (page >= pages) return null;
    if (result.items.length === 0) throw new Error("Incomplete folio pagination");
  }
  throw new Error("Folio lookup exceeded its page limit");
}
