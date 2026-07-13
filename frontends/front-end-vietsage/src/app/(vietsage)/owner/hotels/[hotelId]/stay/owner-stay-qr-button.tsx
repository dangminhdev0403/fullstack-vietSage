"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { VsIcon } from "../../../../_components/vs-icon";

type OwnerStayQrButtonProps = {
  qrCode?: string | null;
  roomNumber: string;
};

function buildGuestUrl(qrCode: string): string {
  if (typeof window === "undefined") {
    return `/g/${encodeURIComponent(qrCode)}`;
  }

  return new URL(`/g/${encodeURIComponent(qrCode)}`, window.location.origin).toString();
}

export function OwnerStayQrButton({ qrCode, roomNumber }: OwnerStayQrButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const trimmedQrCode = qrCode?.trim() ?? "";
  const guestUrl = useMemo(() => (trimmedQrCode ? buildGuestUrl(trimmedQrCode) : ""), [trimmedQrCode]);
  const isDisabled = !trimmedQrCode;

  async function copyGuestUrl() {
    if (!guestUrl || typeof navigator === "undefined") return;

    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--secondary)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        title={isDisabled ? "Phòng chưa có QR hoạt động" : "Xem QR"}
      >
        <VsIcon name="qr_code" className="text-[18px]" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-8">
          <button
            type="button"
            aria-label="Đóng mã QR"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,211,111,0.2),transparent_34%),rgba(13,30,25,0.68)] backdrop-blur-md"
          />
          <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[#f9f4e8] text-left shadow-[0_34px_100px_rgba(12,24,21,0.45)] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative flex flex-col justify-between overflow-hidden bg-[#173d34] p-8 text-white md:p-10">
              <div className="absolute -left-24 top-10 size-56 rounded-full bg-[#f4d36f]/20 blur-3xl" />
              <div className="absolute -bottom-20 right-0 size-64 rounded-full bg-[#6ab49a]/20 blur-3xl" />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
                aria-label="Đóng"
              >
                <VsIcon name="close" className="text-[22px]" />
              </button>

              <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f4d36f]">Guest Access QR</p>
                <h2 className="mt-4 text-5xl font-black tracking-tight md:text-6xl">Phòng {roomNumber}</h2>
                <p className="mt-5 max-w-sm text-base leading-7 text-white/72">
                  Khách quét mã này để mở GuestOS, chọn ngôn ngữ, xem dịch vụ phòng và gửi yêu cầu trực tiếp đến đội ngũ vận hành.
                </p>
              </div>

              <div className="relative mt-10 grid gap-3 text-sm text-white/78">
                <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
                  <p className="font-bold text-white">Mã đang hoạt động</p>
                  <p className="mt-1 text-xs leading-5">Nếu điện thoại không mở được, hãy kiểm tra URL không phải localhost khi dùng thiết bị ngoài máy dev.</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
                  <p className="font-bold text-white">Dành cho khách lưu trú</p>
                  <p className="mt-1 text-xs leading-5">Không dùng QR này sau khi khách đã checkout hoặc phiên lưu trú đã đóng.</p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-10">
              <div className="mx-auto max-w-xl rounded-[2rem] border border-[#d7bd61]/45 bg-white p-5 shadow-[0_22px_60px_rgba(31,61,53,0.14)] md:p-8">
                <div className="rounded-[1.5rem] bg-[linear-gradient(145deg,#fffdf6,#eef5ef)] p-5 ring-1 ring-[#d7bd61]/30 md:p-7">
                  <div className="mx-auto flex aspect-square w-full max-w-[440px] items-center justify-center rounded-[1.25rem] bg-white p-5 shadow-inner ring-1 ring-black/5">
                    <QRCodeSVG value={guestUrl} size={380} level="M" includeMargin style={{ width: "100%", height: "100%", maxWidth: 380, maxHeight: 380 }} />
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-[#25483f]/10 bg-[#f4f0e4] p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#8a6a13]">Guest URL</p>
                  <p className="break-all font-mono text-sm leading-6 text-[#25483f]">{guestUrl}</p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void copyGuestUrl()}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25483f] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,72,63,0.18)] transition hover:-translate-y-0.5"
                  >
                    <VsIcon name={copied ? "check" : "content_copy"} className="text-[18px]" />
                    {copied ? "Đã sao chép" : "Sao chép URL"}
                  </button>
                  <a
                    href={guestUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#25483f]/20 bg-white px-5 text-sm font-black text-[#25483f] transition hover:-translate-y-0.5 hover:bg-[#f7f2e7]"
                  >
                    <VsIcon name="open_in_new" className="text-[18px]" />
                    Mở GuestOS
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
