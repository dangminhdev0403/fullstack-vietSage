"use client";

import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

export const BRANDED_QR_LOCKUP_SRC = "/brand/vietsage-qr-lockup.png";

const LOCKUP_ASPECT_RATIO = 320 / 76;
const LOCKUP_WIDTH_RATIO = 0.3;

export function getBrandedQrLockupSize(size: number): {
  height: number;
  width: number;
} {
  const width = Math.round(size * LOCKUP_WIDTH_RATIO);
  return {
    width,
    height: Math.round(width / LOCKUP_ASPECT_RATIO),
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
  const lockupSize = getBrandedQrLockupSize(size);

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
        src: BRANDED_QR_LOCKUP_SRC,
        width: lockupSize.width,
        height: lockupSize.height,
        excavate: true,
        opacity: 0.9,
      }}
    />
  );
});
