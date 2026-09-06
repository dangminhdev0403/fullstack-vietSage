"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { parseCccdQr, type CccdQrData } from "../utils/cccd-qr-parser";
import { safeRandomUuid } from "../utils/safe-uuid";
import jsQR from "../utils/jsqr";
import type { PhoneCommand } from "../workstation/mobile-shift-security";
import type { ShiftResult } from "../repositories/mobile-shift-repository";

if (typeof window !== "undefined") {
  QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
}

type Props = { requestId: string; expiresAt: number; send: (body: PhoneCommand) => Promise<ShiftResult> };

export function MobileCccdCapture({ requestId, expiresAt, send }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const transfer = useRef<string | null>(null);

  const [raw, setRaw] = useState("");
  const [data, setData] = useState<CccdQrData | null>(null);
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
      const scanner = new QrScanner(
        video,
        (result) => {
          if (result && result.data) {
            accept(result.data);
          }
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 8,
          returnDetailedScanResult: true,
        }
      );

      await scanner.start();
      if (!mounted.current) {
        scanner.destroy();
        return;
      }

      scannerRef.current = scanner;
      setStatus("scanning");

      try {
        const canFlash = await scanner.hasFlash();
        setHasFlash(canFlash);
      } catch {
        setHasFlash(false);
      }
    } catch (err) {
      stopCamera();
      setStatus("idle");
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg && msg !== "Camera not found."
          ? `Không mở được camera: ${msg}. Kiểm tra quyền truy cập camera.`
          : "Không mở được camera. Vui lòng kiểm tra quyền camera trong cài đặt trình duyệt và thử lại."
      );
    }
  };

  const toggleFlash = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.toggleFlash();
      setFlashOn(scannerRef.current.isFlashOn());
    } catch {}
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setStatus("starting");
    try {
      // 1. Try QrScanner.scanImage (uses WebAssembly worker / BarcodeDetector)
      try {
        const result = await QrScanner.scanImage(file, {
          returnDetailedScanResult: true,
          alsoTryWithoutScanRegion: true,
        });
        if (result && result.data && accept(result.data)) return;
      } catch {}

      // 2. Secondary fallback with jsQR on canvas
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Lỗi tải ảnh"));
        img.src = url;
      });
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "attemptBoth" });
        if (code && code.data && accept(code.data)) return;
      }

      setError("Không tìm thấy mã QR trong ảnh. Hãy chụp gần hơn và đủ sáng.");
      setStatus("idle");
    } catch {
      setError("Không đọc được ảnh. Vui lòng thử lại.");
      setStatus("idle");
    } finally {
      e.target.value = "";
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
      {/* 1. Pre-scan Actions */}
      {!data && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={status === "starting" || status === "scanning"}
            onClick={() => void start()}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#000080] px-6 py-3.5 text-lg font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"
          >
            {status === "starting" ? (
              <>
                <svg className="h-6 w-6 animate-spin text-white/80" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span>Đang mở camera…</span>
              </>
            ) : status === "scanning" ? (
              <>
                <span className="relative flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500" />
                </span>
                <span>Camera đang quét…</span>
              </>
            ) : (
              <>
                <svg className="h-6 w-6 text-[#fed65b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Bấm để quét CCCD</span>
              </>
            )}
          </button>

          <label className="flex min-h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-stone-200 bg-white px-5 py-3 text-center text-base font-semibold text-stone-700 shadow-xs transition-all hover:border-[#fed65b] hover:bg-stone-50 active:bg-stone-100">
            <svg className="h-5 w-5 text-[#735c00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Tải ảnh CCCD từ điện thoại</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void handleFile(e)}
            />
          </label>
        </div>
      )}

      {/* 2. Video Viewfinder with Luxury Targeting Reticle */}
      <div className={`relative overflow-hidden rounded-2xl bg-black shadow-inner ${status === "scanning" || status === "starting" ? "block" : "hidden"}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-[3/4] w-full object-cover"
          aria-label="Camera quét căn cước"
        />

        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-6">
            {/* Top Prompt */}
            <div className="rounded-full bg-black/60 px-5 py-2 text-sm font-semibold tracking-wide text-white backdrop-blur-md">
              Đặt mã QR trên thẻ vào giữa khung
            </div>

            {/* Reticle with 4 Corner Brackets */}
            <div className="relative aspect-square w-4/5 max-w-[260px]">
              <div className="absolute top-0 left-0 h-9 w-9 rounded-tl-xl border-t-4 border-l-4 border-[#fed65b]" />
              <div className="absolute top-0 right-0 h-9 w-9 rounded-tr-xl border-t-4 border-r-4 border-[#fed65b]" />
              <div className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-xl border-b-4 border-l-4 border-[#fed65b]" />
              <div className="absolute bottom-0 right-0 h-9 w-9 rounded-br-xl border-b-4 border-r-4 border-[#fed65b]" />

              <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-[#fed65b] to-transparent shadow-[0_0_10px_#fed65b] opacity-80" />
            </div>

            {/* Bottom Guidance */}
            <p className="rounded-full bg-black/50 px-4 py-1.5 text-center text-sm font-medium text-white/95 backdrop-blur-sm">
              Giữ yên điện thoại cách thẻ 15-20cm
            </p>
          </div>
        )}

        {/* Floating controls in camera view */}
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
              <p className="text-sm font-medium text-stone-500">Số CCCD</p>
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

            <div className="pt-1">
              <p className="text-sm font-medium text-stone-500">Nơi thường trú</p>
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

      {/* 4. Simple manual text input fallback */}
      {!data && (
        <details className="group rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-stone-600 group-open:text-[#000080]">
            <span>Nhập tay nếu không quét được QR</span>
            <span className="text-stone-400 transition-transform group-open:rotate-180">▼</span>
          </summary>

          <div className="mt-3 space-y-2.5">
            <textarea
              value={raw}
              maxLength={4096}
              onChange={(e) => setRaw(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-sm text-stone-800 focus:border-[#000080] focus:bg-white focus:outline-none"
              placeholder="Dán chuỗi số thẻ QR (vd: 001099...||NGUYỄN VĂN A|...)"
              aria-label="Nội dung QR căn cước"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => accept(raw)}
              disabled={!raw.trim()}
              className="min-h-11 w-full rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-stone-900 disabled:opacity-40"
            >
              Giải mã thông tin
            </button>
          </div>
        </details>
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

