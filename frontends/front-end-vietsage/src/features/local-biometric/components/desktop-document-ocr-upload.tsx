"use client";

import React, { useRef, useState } from "react";
import type { CccdCheckInCapture } from "./cccd-check-in-panel";
import {
  recognizeDesktopIdentityDocuments,
  type IdentityDocumentOcrResult,
} from "../utils/identity-document-ocr";

export function convertMrzResultToCapture(result: IdentityDocumentOcrResult): CccdCheckInCapture {
  return {
    guestDisplayName: result.guestDisplayName || result.fullName || "",
    guestIdentityNumber: result.guestIdentityNumber || result.identityNumber || "",
    guestDateOfBirth: result.guestDateOfBirth || result.dateOfBirth,
    guestGender: result.guestGender || result.gender,
    guestNationality: result.guestNationality || result.nationality,
    guestResidencePlace: result.guestResidencePlace || result.residencePlace,
    documentKind: result.documentKind,
    mrzValid: result.mrzValid,
  };
}

export type DesktopDocumentOcrUploadProps = {
  onCaptures: (captures: CccdCheckInCapture[]) => void;
  disabled?: boolean;
};

export function DesktopDocumentOcrUpload({ onCaptures, disabled = false }: DesktopDocumentOcrUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const clearInput = (inputEl?: HTMLInputElement | null) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (inputEl) inputEl.value = "";
  };

  const processFiles = async (rawFiles: File[], inputEl?: HTMLInputElement | null) => {
    if (!rawFiles.length || processingRef.current) return;

    processingRef.current = true;
    setIsProcessing(true);
    setError(null);
    const captures: CccdCheckInCapture[] = [];
    const errors: string[] = [];

    try {
      const accepted = rawFiles.filter((file, index) => {
        if (!file.type.startsWith("image/")) { errors.push(`Tệp ${index + 1}: định dạng không hợp lệ.`); return false; }
        if (file.size > 15 * 1024 * 1024) { errors.push(`Tệp ${index + 1}: vượt quá 15MB.`); return false; }
        return true;
      });
      setProgress(`Đang xử lý ${accepted.length} tài liệu`);
      if (accepted.length) {
        for (const item of await recognizeDesktopIdentityDocuments(accepted)) {
          if (item.success) captures.push(convertMrzResultToCapture(item));
          else errors.push(`Tệp ${item.index || "?"}: ${item.error}.`);
        }
      }
      if (captures.length) onCaptures(captures);
      if (errors.length) setError(errors.join(" "));
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      setProgress("");
      clearInput(inputEl);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await processFiles(files, event.target);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) await processFiles(dropped);
  };

  return (
    <section
      className={`relative cursor-pointer rounded-xl border-2 border-dashed px-4 py-3 text-center transition-all ${
        isDragging
          ? "border-blue-600 bg-blue-50/90 shadow-md ring-4 ring-blue-100"
          : "bg-blue-50/40 hover:border-blue-500 hover:bg-blue-50/70"
      }`}
      style={{ borderColor: isDragging ? "#2563eb" : "#93c5fd" }}
      aria-label="Tải ảnh hộ chiếu hoặc thị thực"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <span className="text-sm sm:text-base font-bold text-slate-800">
          Kéo thả ảnh hộ chiếu / CCCD vào đây hoặc nhấn để chọn
        </span>
        <span className="text-xs text-slate-500 font-medium">
          (Hỗ trợ JPG, PNG, WEBP — tối đa 50 ảnh)
        </span>
        <span className="sr-only">Ảnh hộ chiếu / thị thực</span>
      </div>

      <input
        ref={fileInputRef}
        id="desktop-document-file-input"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/bmp"
        disabled={disabled || isProcessing}
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {isProcessing ? (
        <div role="status" aria-live="polite" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs font-semibold text-blue-800">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span>{progress}</span>
        </div>
      ) : null}

      {error ? (
        <div role="alert" aria-live="assertive" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-left text-xs font-medium text-red-800">
          <p className="font-bold">Một số tệp không nhận diện được:</p>
          <p className="mt-0.5">{error}</p>
        </div>
      ) : null}
    </section>
  );
}
