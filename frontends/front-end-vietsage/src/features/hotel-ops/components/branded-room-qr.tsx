"use client";

import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export const BRANDED_QR_MARK_SRC = "/brand/vietsage-mark-white.png";
export const BRANDED_QR_MARK_OPACITY = 1;

const MARK_ASPECT_RATIO = 977 / 1021;
const MARK_WIDTH_RATIO = 0.2;

export function getBrandedQrMarkSize(size: number): {
  height: number;
  width: number;
} {
  const width = Math.round(size * MARK_WIDTH_RATIO);
  return {
    width,
    height: Math.round(width / MARK_ASPECT_RATIO),
  };
}

type BrandedRoomQrProps = {
  className?: string;
  size: number;
  title?: string;
  value: string;
};

export const BrandedRoomQr = forwardRef<
  SVGSVGElement,
  Readonly<BrandedRoomQrProps>
>(function BrandedRoomQr({ className, size, title, value }, ref) {
  const markSize = getBrandedQrMarkSize(size);

  return (
    <QRCodeSVG
      ref={ref}
      value={value}
      size={size}
      fgColor="#00003c"
      bgColor="#ffffff"
      level="H"
      marginSize={4}
      boostLevel
      className={className}
      title={title}
      imageSettings={{
        src: BRANDED_QR_MARK_SRC,
        width: markSize.width,
        height: markSize.height,
        excavate: true,
        opacity: BRANDED_QR_MARK_OPACITY,
      }}
    />
  );
});
