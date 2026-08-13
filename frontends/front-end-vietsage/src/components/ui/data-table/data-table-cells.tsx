import type { ReactNode } from "react";

export type StatusVariant =
  | "emerald"
  | "amber"
  | "blue"
  | "rose"
  | "slate"
  | "violet";

type StatusBadgeProps = Readonly<{
  status?: string | null;
  label?: ReactNode;
  variant?: StatusVariant;
  className?: string;
}>;

const STATUS_MAP: Record<string, { label: string; variant: StatusVariant; icon?: string }> = {
  // Common operational statuses
  PENDING: { label: "Chờ xử lý", variant: "amber", icon: "⌛" },
  ACCEPTED: { label: "Đã tiếp nhận", variant: "blue", icon: "🤝" },
  PREPARING: { label: "Đang chuẩn bị", variant: "blue", icon: "⚡" },
  DELIVERING: { label: "Đang giao hàng", variant: "violet", icon: "🚚" },
  READY: { label: "Sẵn sàng", variant: "emerald", icon: "✨" },
  COMPLETED: { label: "Hoàn thành", variant: "emerald", icon: "✓" },
  CANCELLED: { label: "Đã hủy", variant: "rose", icon: "✕" },

  // Settlement & Billing statuses
  UNSETTLED: { label: "Chưa quyết toán", variant: "amber", icon: "⌛" },
  SETTLED: { label: "Đã quyết toán", variant: "emerald", icon: "✓" },
  PAID: { label: "Đã thanh toán", variant: "emerald", icon: "✓" },
  UNPAID: { label: "Chưa thanh toán", variant: "rose", icon: "⚠️" },
  PARTIAL: { label: "Thanh toán một phần", variant: "amber", icon: "🌓" },

  // System & Entity statuses
  ACTIVE: { label: "Hoạt động", variant: "emerald", icon: "●" },
  INACTIVE: { label: "Ngừng hoạt động", variant: "slate", icon: "○" },
  CONNECTED: { label: "Đã kết nối", variant: "emerald", icon: "🔗" },
  UNCONNECTED: { label: "Sẵn sàng kết nối", variant: "slate", icon: "⚡" },
};

const VARIANT_STYLES: Record<StatusVariant, string> = {
  emerald: "bg-emerald-100/90 text-emerald-800 border-emerald-300",
  amber: "bg-amber-100/90 text-amber-900 border-amber-300",
  blue: "bg-blue-100/90 text-blue-800 border-blue-300",
  rose: "bg-rose-100/90 text-rose-800 border-rose-300",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
  violet: "bg-violet-100/90 text-violet-800 border-violet-300",
};

export function StatusBadge({
  status,
  label,
  variant,
  className = "",
}: StatusBadgeProps) {
  const normalizedKey = (status ?? "").toUpperCase();
  const preset = STATUS_MAP[normalizedKey];

  const resolvedVariant = variant ?? preset?.variant ?? "slate";
  const resolvedLabel = label ?? preset?.label ?? status ?? "—";
  const resolvedIcon = preset?.icon;

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-full px-3.5 py-1 text-xs font-extrabold border shadow-2xs ${VARIANT_STYLES[resolvedVariant]} ${className}`}
    >
      {resolvedIcon ? <span className="text-[11px] shrink-0">{resolvedIcon}</span> : null}
      <span className="whitespace-nowrap">{resolvedLabel}</span>
    </span>
  );
}

export function MoneyCell({
  value,
  currency = "VND",
  highlight = false,
  className = "",
}: Readonly<{
  value: number | string | null | undefined;
  currency?: string;
  highlight?: boolean;
  className?: string;
}>) {
  const numValue = Number(value ?? 0);
  const formatted = numValue.toLocaleString("vi-VN");

  return (
    <div
      className={`tabular-nums text-right whitespace-nowrap ${
        highlight
          ? "font-black text-amber-900 bg-amber-50/90 px-3.5 py-1 rounded-xl border border-amber-200/90 inline-block shadow-2xs"
          : "font-bold text-slate-900"
      } ${className}`}
    >
      <span>{formatted}</span>{" "}
      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{currency}</span>
    </div>
  );
}

export function CodeCell({
  code,
  prefix = "#",
  className = "",
}: Readonly<{
  code: string | null | undefined;
  prefix?: string;
  className?: string;
}>) {
  if (!code) return <span className="text-slate-400 font-medium whitespace-nowrap">—</span>;
  const fullCode = `${prefix}${code}`;

  return (
    <span
      title={fullCode}
      className={`font-mono text-xs font-black text-slate-900 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-slate-200/90 inline-block max-w-full truncate align-middle shadow-2xs ${className}`}
    >
      {fullCode}
    </span>
  );
}

export function DateCell({
  date,
  format = "date",
  className = "",
}: Readonly<{
  date: Date | string | null | undefined;
  format?: "date" | "datetime" | "time";
  className?: string;
}>) {
  if (!date) return <span className="text-slate-400 font-medium whitespace-nowrap">—</span>;

  const d = new Date(date);
  if (Number.isNaN(d.getTime()))
    return <span className="text-slate-400 font-medium whitespace-nowrap">—</span>;

  let formatted = "";
  if (format === "date") {
    formatted = d.toLocaleDateString("vi-VN");
  } else if (format === "datetime") {
    formatted = `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else {
    formatted = d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <span className={`tabular-nums font-semibold text-slate-700 whitespace-nowrap ${className}`}>
      {formatted}
    </span>
  );
}

export function TextCell({
  title,
  subtext,
  truncate = false,
  className = "",
}: Readonly<{
  title: ReactNode;
  subtext?: ReactNode;
  truncate?: boolean;
  className?: string;
}>) {
  const titleTooltip = typeof title === "string" ? title : undefined;
  const subtextTooltip = typeof subtext === "string" ? subtext : undefined;

  return (
    <div className={`space-y-0.5 min-w-0 max-w-full ${className}`}>
      <p
        title={titleTooltip}
        className={`font-bold text-slate-900 text-sm leading-snug ${
          truncate ? "truncate min-w-0 max-w-full" : ""
        }`}
      >
        {title}
      </p>
      {subtext ? (
        <p
          title={subtextTooltip}
          className={`text-xs font-medium text-slate-500 ${
            truncate ? "truncate min-w-0 max-w-full" : ""
          }`}
        >
          {subtext}
        </p>
      ) : null}
    </div>
  );
}
