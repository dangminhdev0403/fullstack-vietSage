"use client";

import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export const BRANDED_QR_WATERMARK_SRC =
  "/brand/vietsage-qr-watermark.png";
export const BRANDED_QR_WATERMARK_OPACITY = 0.12;

const WATERMARK_ASPECT_RATIO = 640 / 540;
const WATERMARK_WIDTH_RATIO = 0.82;

export function getBrandedQrWatermarkSize(size: number): {
  height: number;
  width: number;
} {
  const width = Math.round(size * WATERMARK_WIDTH_RATIO);
  return {
    width,
    height: Math.round(width / WATERMARK_ASPECT_RATIO),
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
  const watermarkSize = getBrandedQrWatermarkSize(size);

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
        src: BRANDED_QR_WATERMARK_SRC,
        width: watermarkSize.width,
        height: watermarkSize.height,
        excavate: false,
        opacity: BRANDED_QR_WATERMARK_OPACITY,
      }}
    />
  );
});
