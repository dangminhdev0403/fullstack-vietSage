"use client";

import { useRef, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type {
  CollectRevenueInput, CreateRevenueEntryInput, RevenueBook, RevenueBookEntry,
  RevenueCategory, RevenuePaymentMethod, UpdateRevenueEntryInput,
} from "../types/revenue-book-contract";
import { RevenueBookDialog } from "./revenue-book-dialog";

export const REVENUE_CATEGORIES: Record<RevenueCategory, string> = {
  ROOM: "Tiền phòng", MINIBAR: "Minibar / Nước uống", LAUNDRY: "Giặt ủi", OTHER: "Dịch vụ khác",
};
export const REVENUE_METHODS: Record<RevenuePaymentMethod, string> = {
  CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", CARD: "Thẻ", OTHER: "Khác",
};
export const revenueInputClass = "min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:bg-slate-100";
export const revenueButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[var(--outline-variant)] px-4 py-2 text-base font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50";
export const revenuePrimaryClass = `${revenueButtonClass} border-transparent bg-[var(--primary)] text-white hover:opacity-90 hover:bg-[var(--primary)]`;

export function RevenueEntryDialog({ book, entry, mode, busy, onClose, onCreate, onUpdate, onCollect }: {
  book: RevenueBook;
  entry?: RevenueBookEntry;
  mode: "create" | "edit" | "collect";
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateRevenueEntryInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateRevenueEntryInput) => Promise<void>;
  onCollect: (id: string, input: CollectRevenueInput) => Promise<void>;
}) {
  const isCollection = mode === "collect";
  const now = Temporal.Now.zonedDateTimeISO(book.timeZone);
  const [date, setDate] = useState(entry?.date ?? now.toPlainDate().toString());
  const [description, setDescription] = useState(entry?.description ?? "");
  const [category, setCategory] = useState<RevenueCategory>(entry?.category ?? "OTHER");
  const [amount, setAmount] = useState(String(isCollection ? Math.max(0, entry?.closingBalance ?? 0) : entry?.amount ?? ""));
  const [roomId, setRoomId] = useState(entry?.roomId ?? "");
  const [documentNumber, setDocumentNumber] = useState(entry?.documentNumber ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [received, setReceived] = useState(isCollection);
  const [collectedAmount, setCollectedAmount] = useState("");
  const [method, setMethod] = useState<RevenuePaymentMethod>("CASH");
  const [receivedAt, setReceivedAt] = useState(now.toPlainDateTime().toString({ smallestUnit: "minute" }));
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || pending.current) return;
    setError("");
    const value = Number(amount);
    const paid = isCollection ? value : Number(collectedAmount || amount);
    if (!Number.isFinite(value) || value <= 0 || value > 9_999_999_999.99) {
      setError("Số tiền phải lớn hơn 0 và không quá 9.999.999.999,99."); return;
    }
    if ((received || isCollection) && (!Number.isFinite(paid) || paid <= 0 || paid > value)) {
      setError("Tiền đã thu phải lớn hơn 0 và không vượt quá số tiền phát sinh."); return;
    }
    try {
      pending.current = true;
      key.current ??= crypto.randomUUID();
      const collection = (received || isCollection) ? {
        amount: paid, method, reference: reference.trim() || undefined,
        receivedAt: Temporal.PlainDateTime.from(receivedAt).toZonedDateTime(book.timeZone, { disambiguation: "reject" }).toInstant().toString(),
      } : undefined;
      const fields = {
        date, description: description.trim(), category, amount: value,
        roomId: roomId || null, documentNumber: documentNumber.trim() || null, notes: notes.trim() || null,
      };
      if (mode === "create") await onCreate({ ...fields, idempotencyKey: key.current, collection });
      else if (entry && mode === "edit") await onUpdate(entry.id, { ...fields, version: entry.version! });
      else if (entry && collection) await onCollect(entry.id, { ...collection, version: entry.version!, idempotencyKey: key.current });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu khoản phát sinh. Vui lòng thử lại.");
    } finally { pending.current = false; }
  }
  return (
    <RevenueBookDialog title={isCollection ? "Thu tiền khoản bổ sung" : mode === "edit" ? "Sửa khoản bổ sung" : "Thêm khoản phát sinh"} onClose={onClose} busy={busy}>
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        {isCollection ? <p className="text-base font-medium text-pretty">{entry?.description}</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="block text-sm font-medium">Ngày phát sinh</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className={revenueInputClass} /></label>
            <label className="space-y-1.5"><span className="block text-sm font-medium">Phòng</span><select value={roomId} onChange={(event) => setRoomId(event.target.value)} className={revenueInputClass}><option value="">Không gắn phòng</option>{book.rooms.map((room) => <option key={room.id} value={room.id}>Phòng {room.number}</option>)}</select></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="block text-sm font-medium">Nội dung</span><input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Giặt ủi thuê ngoài" className={revenueInputClass} /></label>
            <label className="space-y-1.5"><span className="block text-sm font-medium">Nhóm doanh thu</span><select value={category} onChange={(event) => setCategory(event.target.value as RevenueCategory)} className={revenueInputClass}>{Object.entries(REVENUE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5"><span className="block text-sm font-medium">Số chứng từ</span><input maxLength={120} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} className={revenueInputClass} /></label>
          </div>
        )}
        <label className="block space-y-1.5"><span className="block text-sm font-medium">{isCollection ? "Số tiền thu" : "Số tiền phát sinh"} ({book.currency})</span><input required type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={revenueInputClass} /></label>
        {mode === "create" && <label className="flex min-h-11 items-center gap-3 text-base"><input type="checkbox" checked={received} onChange={(event) => setReceived(event.target.checked)} className="size-5 accent-[var(--primary)]" />Đã thu tiền</label>}
        {(received || isCollection) && (
          <fieldset className="grid gap-4 border-t border-[var(--outline-variant)] pt-4 sm:grid-cols-2">
            <legend className="px-1 text-base font-semibold">Thanh toán</legend>
            {!isCollection && <label className="space-y-1.5"><span className="block text-sm font-medium">Số tiền đã thu ({book.currency})</span><input type="number" min="0.01" step="0.01" max={amount || undefined} value={collectedAmount} placeholder={amount || ""} onChange={(event) => setCollectedAmount(event.target.value)} className={revenueInputClass} /></label>}
            <label className="space-y-1.5"><span className="block text-sm font-medium">Phương thức</span><select value={method} onChange={(event) => setMethod(event.target.value as RevenuePaymentMethod)} className={revenueInputClass}>{Object.entries(REVENUE_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5"><span className="block text-sm font-medium">Thời điểm nhận tiền</span><input required type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className={revenueInputClass} /></label>
            <label className="space-y-1.5"><span className="block text-sm font-medium">Mã tham chiếu</span><input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} className={revenueInputClass} /></label>
          </fieldset>
        )}
        {!isCollection && <label className="block space-y-1.5"><span className="block text-sm font-medium">Ghi chú</span><textarea maxLength={1000} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={revenueInputClass} /></label>}
        {error && <p role="alert" className="text-base text-red-700 text-pretty">{error}</p>}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--outline-variant)] pt-4">
          <button type="button" disabled={busy} onClick={onClose} className={revenueButtonClass}>Hủy</button>
          <button type="submit" disabled={busy} className={revenuePrimaryClass}>{busy ? "Đang lưu…" : isCollection ? "Ghi nhận thu tiền" : "Lưu khoản phát sinh"}</button>
        </footer>
      </form>
    </RevenueBookDialog>
  );
}
