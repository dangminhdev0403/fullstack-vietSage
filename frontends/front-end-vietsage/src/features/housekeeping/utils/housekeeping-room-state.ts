export const HOUSEKEEPING_ROOM_STATES = {
  processing: { label: "Cần dọn", icon: "cleaning_services", style: "border-amber-300 bg-amber-50 text-amber-950" },
  cleaning: { label: "Đang dọn", icon: "cleaning_services", style: "border-blue-300 bg-blue-50 text-blue-950" },
  available: { label: "Sạch", icon: "check_circle", style: "border-emerald-300 bg-emerald-50 text-emerald-950" },
  occupied: { label: "Có khách", icon: "hotel", style: "border-slate-200 bg-white text-slate-700" },
  reserved: { label: "Đã đặt", icon: "event", style: "border-slate-200 bg-white text-slate-700" },
  maintenance: { label: "Bảo trì", icon: "build", style: "border-slate-300 bg-slate-100 text-slate-700" },
  blocked: { label: "Tạm dừng", icon: "pause_circle", style: "border-rose-300 bg-rose-50 text-rose-950" },
} as const;
