"use client";

import { useState } from "react";
import Image from "next/image";

type VsServiceImagePreviewProps = {
  readonly src?: string | null;
  readonly alt: string;
  readonly categoryName?: string | null;
  readonly providerName?: string | null;
  readonly className?: string;
};

/** Custom VietSage Professional Gold "V" Logo Monogram Emblem */
function VietSageLogoV({ className = "w-12 h-12" }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vsGoldLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff2cb" />
          <stop offset="50%" stopColor="#d7bd61" />
          <stop offset="100%" stopColor="#967923" />
        </linearGradient>
        <linearGradient id="vsGoldRight" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a3842a" />
          <stop offset="60%" stopColor="#e8cf78" />
          <stop offset="100%" stopColor="#fff8e3" />
        </linearGradient>
        <linearGradient id="vsGoldShield" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d7bd61" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#25483f" stopOpacity="0.1" />
        </linearGradient>
        <filter id="vsGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#d7bd61" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Hexagonal Shield Background */}
      <polygon
        points="32,4 56,17 56,47 32,60 8,47 8,17"
        fill="url(#vsGoldShield)"
        stroke="url(#vsGoldLeft)"
        strokeWidth="1.5"
        strokeOpacity="0.6"
      />

      {/* Geometric V Monogram Left Wing */}
      <path
        d="M17 19 L30 46 H35 L22 19 Z"
        fill="url(#vsGoldLeft)"
        filter="url(#vsGlow)"
      />

      {/* Geometric V Monogram Right Wing */}
      <path
        d="M47 19 L34 46 H29 L42 19 Z"
        fill="url(#vsGoldRight)"
        filter="url(#vsGlow)"
      />

      {/* Top Diamond Crown Accent */}
      <polygon points="32,9 35,14 32,19 29,14" fill="#fff5d6" />
    </svg>
  );
}

export function VsServiceImagePreview({
  src,
  alt,
  categoryName,
  providerName,
  className = "relative aspect-video w-full overflow-hidden",
}: VsServiceImagePreviewProps) {
  const [hasError, setHasError] = useState(false);
  const isValidUrl = Boolean(src?.trim()) && !hasError;

  return (
    <div className={`${className} bg-[#142e26]`}>
      {isValidUrl ? (
        <Image
          unoptimized
          src={src!}
          alt={alt}
          width={640}
          height={360}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        /* VietSage Signature Professional Brand Fallback Preview (No top badge collisions) */
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1d3d33] via-[#142e26] to-[#0b1c17] px-4 pb-3 pt-12 text-white shadow-inner">
          {/* Subtle Ambient Radial Glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d7bd61]/12 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#d7bd61_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />

          {/* Centered VietSage Professional Gold V Monogram Logo */}
          <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#18211d]/80 p-2 shadow-xl shadow-black/30 backdrop-blur-md border border-[#d7bd61]/30 transition-transform duration-300 group-hover:scale-105">
              <VietSageLogoV className="h-10 w-10" />
            </div>

            <p className="mt-2.5 font-mono text-[11px] font-extrabold tracking-[0.25em] text-[#d7bd61] uppercase">
              VIETSAGE
            </p>

            <h4 className="vs-display mt-1 max-w-[90%] line-clamp-1 text-base font-bold text-white/95">
              {alt}
            </h4>

            {providerName ? (
              <p className="mt-0.5 max-w-[85%] line-clamp-1 text-[11px] font-medium text-[#d7bd61]/80">
                {providerName}
              </p>
            ) : null}
          </div>

          {/* Clean Footer Bar */}
          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-2 text-[9px] font-semibold text-white/40">
            <span>Dịch vụ liên kết</span>
            {categoryName ? <span className="truncate max-w-[120px]">{categoryName}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
