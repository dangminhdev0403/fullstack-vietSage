"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { VsIcon } from "../../../../../../_components/vs-icon";
import {
  getGuestQrUrl,
  getQrValue,
  getRoomNumber,
} from "../room-qr-utils";

type Props = { hotelId: string };

function subscribeClientOriginChange() {
  return () => undefined;
}

function getClientOriginSnapshot(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function getServerOriginSnapshot(): string {
  return "";
}

function useClientOrigin(): string {
  return useSyncExternalStore(
    subscribeClientOriginChange,
    getClientOriginSnapshot,
    getServerOriginSnapshot,
  );
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function OwnerRoomsQrExportClient({ hotelId }: Props) {
  const router = useRouter();
  const clientOrigin = useClientOrigin();
  const [rooms, setRooms] = useState<HotelRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const roomsPath = `/owner/hotels/${hotelId}/rooms`;

  useEffect(() => {
    let isActive = true;

    async function loadRooms() {
      setIsLoading(true);
      setError(null);

      try {
        const roomsPage = (
          await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
            `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms`,
            { method: "GET" },
          )
        ).data;

        if (isActive) {
          setRooms(roomsPage.items);
        }
      } catch {
        if (isActive) {
          setError("Không thể tải danh sách QR. Vui lòng quay lại và thử lại.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadRooms();

    return () => {
      isActive = false;
    };
  }, [hotelId]);

  const qrRooms = useMemo(
    () => rooms.filter((room) => Boolean(getQrValue(room))),
    [rooms],
  );

  function downloadRoomLinksForExcel(): void {
    const rows = [
      ["Tên phòng", "URL"],
      ...qrRooms.map((room) => [
        `Phòng ${getRoomNumber(room)}`,
        getGuestQrUrl(room, clientOrigin) ?? "",
      ]),
    ];
    const csvContent = `\uFEFF${rows
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n")}`;
    const fileUrl = URL.createObjectURL(
      new Blob([csvContent], { type: "text/csv;charset=utf-8" }),
    );
    const downloadLink = document.createElement("a");
    downloadLink.href = fileUrl;
    downloadLink.download = `danh-sach-qr-phong-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    downloadLink.click();
    URL.revokeObjectURL(fileUrl);
  }

  return (
    <main className="min-h-screen bg-[#f7f2e7] text-[#173d34] print:bg-white">
      <style jsx global>{`
        @media print {
          @page {
            margin: 12mm;
          }

          .qr-export-toolbar {
            display: none !important;
          }

          .qr-export-shell {
            padding: 0 !important;
          }

          .qr-export-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12mm !important;
          }

          .qr-export-card {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
          }

          .qr-export-url {
            display: none !important;
          }
        }
      `}</style>

      <div className="qr-export-toolbar sticky top-0 z-20 border-b border-[#d7bd61]/50 bg-[#173d34] px-4 py-4 text-white shadow-[0_16px_36px_rgba(23,61,52,0.18)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push(roomsPath)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/15"
          >
            <VsIcon name="arrow_back" className="text-lg" />
            Quay lại phòng
          </button>

          <div className="text-center">
            <h1 className="text-lg font-black">VietSage - toàn bộ QR phòng</h1>
            <p className="text-xs font-semibold text-white/70">
              {isLoading ? "Đang tải..." : `${qrRooms.length} mã QR sẵn sàng in`}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={downloadRoomLinksForExcel}
              disabled={isLoading || Boolean(error) || qrRooms.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <VsIcon name="download" className="text-lg" />
              Lưu Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={isLoading || Boolean(error) || qrRooms.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f4d36f] px-4 text-sm font-black text-[#173d34] shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <VsIcon name="download" className="text-lg" />
              In / lưu PDF
            </button>
          </div>
        </div>
      </div>

      <section className="qr-export-shell mx-auto max-w-6xl px-4 py-8">
        {isLoading ? (
          <div className="rounded-2xl border border-[#d7bd61]/60 bg-white p-8 text-center font-bold shadow-[0_18px_42px_rgba(31,61,53,0.10)]">
            Đang tải danh sách QR...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center font-bold text-red-700 shadow-[0_18px_42px_rgba(31,61,53,0.10)]">
            {error}
          </div>
        ) : qrRooms.length === 0 ? (
          <div className="rounded-2xl border border-[#d7bd61]/60 bg-white p-8 text-center font-bold shadow-[0_18px_42px_rgba(31,61,53,0.10)]">
            Không có phòng nào có QR để xuất.
          </div>
        ) : (
          <div className="qr-export-grid grid grid-cols-1 gap-5 md:grid-cols-2">
            {qrRooms.map((room) => {
              const roomNumber = getRoomNumber(room);
              const guestQrUrl = getGuestQrUrl(room, clientOrigin) ?? "";

              return (
                <article
                  key={room.id}
                  className="qr-export-card flex break-inside-avoid flex-col items-center rounded-3xl border border-[#d7bd61]/70 bg-white p-6 text-center shadow-[0_18px_42px_rgba(31,61,53,0.12)]"
                >
                  <h2 className="text-2xl font-black text-[#173d34]">
                    Phòng {roomNumber}
                  </h2>
                  <div className="-mt-1 flex aspect-square w-full max-w-[310px] items-center justify-center">
                    <BrandedRoomQr
                      value={guestQrUrl}
                      size={310}
                      className="h-full w-full"
                      title={`QR GuestOS phòng ${roomNumber}`}
                    />
                  </div>
                  <p className="qr-export-url mt-2 max-w-full break-all rounded-xl bg-[#f7f2e7] px-3 py-2 text-xs font-semibold text-[#5e6a62]">
                    {guestQrUrl}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
