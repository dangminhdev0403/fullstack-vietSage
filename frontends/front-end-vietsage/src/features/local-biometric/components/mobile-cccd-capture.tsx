"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { parseCccdQr } from "../utils/cccd-qr-parser";
import { safeRandomUuid } from "../utils/safe-uuid";
import type { PhoneCommand } from "../workstation/mobile-shift-security";
import type { ShiftResult } from "../repositories/mobile-shift-repository";

if (typeof window !== "undefined") {
  QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
}

type Props = {
  requestId: string;
  expiresAt: number;
  send: (body: PhoneCommand) => Promise<ShiftResult>;
  sendDocument: (requestId: string, transferId: string, file: File) => Promise<ShiftResult>;
};
type CaptureData = ReturnType<typeof parseCccdQr> & { nationality?: string };

export function MobileCccdCapture({ requestId, expiresAt, send, sendDocument }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const transfer = useRef<string | null>(null);
  const passportTransfer = useRef<string | null>(null);

  const [raw, setRaw] = useState("");
  const [data, setData] = useState<CaptureData | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);


  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.destroy();
      } catch {}
      scannerRef.current = null;
    }
    setFlashOn(false);
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    mounted.current = true;
    const pause = () => {
      // Don't stop camera during "starting", because on mobile OS, the browser's permission prompt triggers visibilitychange/document.hidden!
      if (document.hidden && statusRef.current === "scanning") {
        stopCamera();
        setStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", pause);
    const expiry = setTimeout(() => {
      stopCamera();
      setStatus("idle");
      setRaw("");
      setData(null);
      transfer.current = null;
      setError("Lượt nhận đã hết hạn. Chọn lượt mới trên máy lễ tân.");
    }, Math.max(0, expiresAt - Date.now()));

    return () => {
      mounted.current = false;
      stopCamera();
      clearTimeout(expiry);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [expiresAt, stopCamera]);

  const accept = (value: string) => {
    if (Date.now() >= expiresAt || sending.current || transfer.current) return false;
    try {
      const decoded = parseCccdQr(value);
      setData(decoded);
      setRaw(value);
      transfer.current = safeRandomUuid();
      setError("");
      stopCamera();
      setStatus("idle");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "QR không đúng cấu trúc CCCD";
      setError(`Không nhận diện được QR hợp lệ: ${msg}`);
      return false;
    }
  };

  const start = async () => {
    if (status === "starting" || status === "scanning" || sending.current || data || Date.now() >= expiresAt) return;
    stopCamera();
    setStatus("starting");
    setError("");

    // Allow DOM to unhide video container before starting camera/video playback
    await new Promise((resolve) => setTimeout(resolve, 50));

    const video = videoRef.current;
    if (!video) {
      setStatus("idle");
      return;
    }

    try {
      const scanner = new QrScanner(video, (result) => {
        if (result?.data) accept(result.data);
      }, {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
      });
      await scanner.start();
      if (!mounted.current) {
        scanner.destroy();
        return;
      }
      scannerRef.current = scanner;
      setStatus("scanning");
      try {
        setHasFlash(await scanner.hasFlash());
      } catch {
        setHasFlash(false);
      }
    } catch (err) {
      stopCamera();
      setStatus("idle");
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg && msg !== "Camera not found."
        ? `Không mở được camera: ${msg}. Kiểm tra quyền truy cập camera.`
        : "Không mở được camera. Vui lòng kiểm tra quyền camera trong cài đặt trình duyệt và thử lại.");
    }
  };

  const toggleFlash = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.toggleFlash();
      setFlashOn(scannerRef.current.isFlashOn());
    } catch {}
  };

  const handlePassport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || sending.current || Date.now() >= expiresAt) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Ảnh hộ chiếu phải là JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Ảnh hộ chiếu vượt quá 15MB.");
      return;
    }
    sending.current = true;
    setStatus("sending");
    setError("");
    try {
      passportTransfer.current ??= safeRandomUuid();
      await sendDocument(requestId, passportTransfer.current, file);
      if (mounted.current) setStatus("sent");
    } catch (caught) {
      if (mounted.current) {
        setStatus("idle");
        setError(caught instanceof Error ? caught.message : "Không gửi được ảnh hộ chiếu.");
      }
    } finally {
      sending.current = false;
    }
  };

  const resetScan = () => {
    stopCamera();
    setData(null);
    setRaw("");
    transfer.current = null;
    setError("");
    setStatus("idle");
  };

  const submit = async () => {
    if (!data || !transfer.current || sending.current || Date.now() >= expiresAt) return;
    sending.current = true;
    setStatus("sending");
    setError("");
    try {
      await send({ action: "submit", requestId, transferId: transfer.current, raw });
      if (mounted.current) {
        setRaw("");
        setData(null);
        setStatus("sent");
      }
    } catch (e) {
      if (mounted.current) {
        setStatus("idle");
        setError(e instanceof Error ? e.message : "Mất mạng. Thử gửi lại cùng lượt.");
      }
    } finally {
      sending.current = false;
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-xs">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xl font-bold text-emerald-950">Đã gửi thông tin cho lễ tân!</p>
        <p className="mt-1.5 text-base text-emerald-800">
          Lễ tân đang kiểm tra và điền vào phiếu nhận phòng.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!data && (
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold text-stone-700">Chọn quét QR CCCD hoặc chụp hộ chiếu.</p>
          <button
            type="button"
            disabled={status !== "idle"}
            onClick={() => void start()}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#000080] px-6 py-3.5 text-lg font-bold text-white shadow-md active:scale-[0.98] disabled:opacity-60"
          >
            {status === "starting" ? "Đang mở camera…" : "Mở camera quét QR"}
          </button>
          <label className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-[#000080] bg-white px-6 py-3.5 text-lg font-bold text-[#000080] shadow-xs active:bg-blue-50">
            <span>{status === "sending" ? "Đang gửi ảnh…" : "Chụp hộ chiếu"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={status !== "idle"}
              onChange={(event) => void handlePassport(event)}
              className="sr-only"
            />
          </label>
        </div>
      )}

      {/* QR video viewfinder */}
      <div className={`relative overflow-hidden rounded-2xl bg-black shadow-inner ${status === "scanning" || status === "starting" ? "block" : "hidden"}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-[3/4] w-full object-cover"
          aria-label="Camera quét QR căn cước"
        />

        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-6">
            <div className="rounded-full bg-black/60 px-5 py-2 text-center text-sm font-semibold text-white backdrop-blur-md">
              Đặt mã QR vào giữa khung
            </div>

            <div className="relative aspect-square w-4/5 max-w-[300px]">
              <div className="absolute top-0 left-0 h-9 w-9 rounded-tl-xl border-t-4 border-l-4 border-[#fed65b]" />
              <div className="absolute top-0 right-0 h-9 w-9 rounded-tr-xl border-t-4 border-r-4 border-[#fed65b]" />
              <div className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-xl border-b-4 border-l-4 border-[#fed65b]" />
              <div className="absolute bottom-0 right-0 h-9 w-9 rounded-br-xl border-b-4 border-r-4 border-[#fed65b]" />

              <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-[#fed65b] to-transparent shadow-[0_0_10px_#fed65b] opacity-80" />
            </div>

            <p className="rounded-full bg-black/50 px-4 py-1.5 text-center text-sm font-medium text-white/95 backdrop-blur-sm">
              Giữ máy song song, đủ sáng, không phản chiếu
            </p>
          </div>
        )}

        {status === "scanning" && (
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
            {hasFlash && (
              <button
                type="button"
                onClick={() => void toggleFlash()}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all backdrop-blur-md ${
                  flashOn
                    ? "bg-[#fed65b] text-stone-900 shadow-lg"
                    : "bg-black/60 text-white hover:bg-black/80"
                }`}
              >
                <span>⚡</span>
                <span>{flashOn ? "Tắt đèn Flash" : "Bật đèn Flash"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopCamera();
                setStatus("idle");
              }}
              className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur-md hover:bg-black/80"
            >
              <span>✕</span>
              <span>Dừng camera</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Simplified & Clear Guest Identity Card */}
      {data && (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-md space-y-4">
          <div className="border-b border-stone-100 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-widest text-[#735c00]">
              THÔNG TIN CĂN CƯỚC
            </span>
          </div>

          {/* Guest Identity Information - Large & Clear */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-stone-500">Họ và tên khách</p>
              <p className="text-2xl font-black tracking-tight text-[#00003c]">
                {data.displayName}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-stone-500">Số CCCD / Hộ chiếu</p>
              <p className="font-mono text-lg font-black tracking-wider text-emerald-950 bg-emerald-50 px-3.5 py-1 rounded-xl inline-block border border-emerald-200 mt-0.5">
                {data.identityNumber}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-stone-100">
              <div>
                <p className="text-sm font-medium text-stone-500">Ngày sinh</p>
                <p className="text-base font-bold text-stone-800">{data.dateOfBirth}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-500">Giới tính</p>
                <p className="text-base font-bold text-stone-800">{data.gender || "—"}</p>
              </div>
            </div>

            {data.nationality ? (
              <div className="pt-1 border-t border-stone-100">
                <p className="text-sm font-medium text-stone-500">Quốc tịch</p>
                <p className="text-base font-bold text-stone-800">{data.nationality}</p>
              </div>
            ) : null}

            <div className="pt-1 border-t border-stone-100">
              <p className="text-sm font-medium text-stone-500">Quê quán / Nơi thường trú</p>
              <p className="text-sm leading-relaxed font-semibold text-stone-800">
                {data.residencePlace}
              </p>
            </div>
          </div>

          {/* Card Action Buttons */}
          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              disabled={status === "sending"}
              onClick={() => void submit()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#166534] px-6 py-3.5 text-lg font-bold text-white shadow-md transition-all hover:bg-[#14532d] active:scale-[0.98] disabled:opacity-50"
            >
              {status === "sending" ? (
                <>
                  <svg className="h-6 w-6 animate-spin text-white/80" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Đang gửi cho lễ tân…</span>
                </>
              ) : (
                <>
                  <svg className="h-6 w-6 text-[#fed65b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Xác nhận gửi cho lễ tân</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={status === "sending"}
              onClick={resetScan}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:bg-stone-100"
            >
              <svg className="h-5 w-5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Quét lại thẻ khác</span>
            </button>
          </div>
        </section>
      )}



      {/* 5. Error Feedback Banner */}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-xs">
          <svg className="h-5 w-5 shrink-0 text-red-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 font-medium leading-relaxed">{error}</div>
        </div>
      )}
    </div>
  );
}

