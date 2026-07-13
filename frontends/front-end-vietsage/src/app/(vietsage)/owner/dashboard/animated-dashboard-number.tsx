"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AnimatedDashboardNumberProps = {
  value: number | string | null | undefined;
  className?: string;
  durationMs?: number;
};

function parseNumberValue(value: AnimatedDashboardNumberProps["value"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { numeric: value, prefix: "", suffix: "", fractionDigits: Number.isInteger(value) ? 0 : 1 };
  }

  if (typeof value !== "string") return null;

  const compact = value.trim();
  const match = compact.match(/^([^0-9-]*)(-?[\d.,]+)(.*)$/);
  if (!match) return null;

  const [, prefix, rawNumber, suffix] = match;
  const normalized = rawNumber.replace(/[.,]/g, "");
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) return null;

  return { numeric, prefix, suffix, fractionDigits: 0 };
}

function formatAnimatedValue(parsed: NonNullable<ReturnType<typeof parseNumberValue>>, current: number) {
  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: parsed.fractionDigits,
    minimumFractionDigits: parsed.fractionDigits,
  }).format(current);

  return `${parsed.prefix}${formatted}${parsed.suffix}`;
}

export function AnimatedDashboardNumber({ value, className, durationMs = 950 }: AnimatedDashboardNumberProps) {
  const parsed = useMemo(() => parseNumberValue(value), [value]);
  const finalText = value == null ? "--" : String(value);
  const [display, setDisplay] = useState(finalText);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!parsed) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    const start = performance.now();
    const target = parsed.numeric;

    const animate = (time: number) => {
      const progress = Math.min((time - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      setDisplay(formatAnimatedValue(parsed, current));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(finalText);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [durationMs, finalText, parsed]);

  return <span className={`vs-dashboard-count ${className ?? ""}`}>{display}</span>;
}
