"use client";

import React from "react";
import type { CccdPreviewModel } from "../utils/cccd-preview";

type Props = { model: CccdPreviewModel };

export function CccdPreview({ model }: Props) {
  return (
    <article className="grid min-w-0 grid-cols-1 gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] md:p-5" aria-label="Thông tin đọc từ CCCD">
      <div className="w-full max-w-[220px] justify-self-center sm:max-w-none">
        <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ aspectRatio: "3/4" }}>
          {model.portraitDataUrl ? (
            // Volatile data URL must not pass through Next image optimization or cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={model.portraitDataUrl} alt="Ảnh chân dung đọc từ chip CCCD" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
          ) : <div className="text-sm font-medium text-slate-500">Không có ảnh</div>}
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <p className="text-sm font-bold text-emerald-900">Xác thực thành công</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">Chip hợp lệ, dữ liệu toàn vẹn, CCCD còn hiệu lực.</p>
        </div>

        <dl className="mb-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          {model.fields.map((field) => {
            const wide = field.label === "Địa chỉ";
            const nowrap = field.label === "CCCD" || field.label === "Tuổi";
            return (
              <div key={field.label} className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
                <dt className="text-xs font-semibold text-slate-500">{field.label}</dt>
                <dd className={`mt-1 text-sm font-semibold leading-5 text-slate-950 ${nowrap ? "whitespace-nowrap" : "break-words"}`}>{field.value}</dd>
              </div>
            );
          })}
        </dl>

      </div>
    </article>
  );
}
