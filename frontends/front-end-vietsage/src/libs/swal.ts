import Swal from "sweetalert2";

export const SwalVietSage = Swal.mixin({
  customClass: {
    popup:
      "rounded-[2rem] bg-white p-5 sm:p-7 shadow-2xl border border-gray-100 w-[94vw] sm:w-[90vw] max-w-lg max-h-[88vh] flex flex-col my-auto overflow-hidden",
    title:
      "text-xl sm:text-2xl md:text-3xl font-extrabold text-[#18211d] text-center mb-2 tracking-tight shrink-0",
    htmlContainer:
      "text-sm sm:text-base font-medium text-gray-700 text-center mb-3 leading-relaxed max-h-[58vh] overflow-y-auto pr-1 focus:outline-none custom-scrollbar w-full !m-0 !mt-2",
    confirmButton:
      "inline-flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-7 text-sm sm:text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[120px]",
    cancelButton:
      "inline-flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm sm:text-base font-bold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer mx-1.5 min-w-[100px]",
    actions:
      "flex items-center justify-center gap-3 pt-3 shrink-0 border-t border-slate-100 w-full mt-2",
  },
  buttonsStyling: false,
  reverseButtons: false,
});

export function showSuccessAlert(title: string, text: string) {
  return SwalVietSage.fire({
    title,
    text,
    icon: "success",
    showConfirmButton: true,
    confirmButtonText: "OK",
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatTextContent(raw: string): string {
  if (!raw) return "";
  // 1. Mark quoted substrings
  let marked = raw.replace(/['"']([^'"']+)['"']/g, (_match, inner) => {
    return `___HL_QUOTE___${inner}___HL_END___`;
  });

  // 2. Mark date ranges or dates (YYYY-MM-DD or DD/MM/YYYY)
  marked = marked.replace(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g, (_match, date) => {
    return `___HL_DATE___${date}___HL_END___`;
  });

  // 3. Mark uppercase codes like [DEU], [ERR_123], DEU
  marked = marked.replace(/\b([A-Z]{3,4}_\w+|[A-Z]{3,4})\b/g, (match) => {
    if (
      ["DEU", "VNM", "USA", "CHN", "KOR", "JPN", "RUS", "IND", "GBR", "FRA", "AUS", "SGP"].includes(
        match,
      ) ||
      match.startsWith("ERR_")
    ) {
      return `___HL_CODE___${match}___HL_END___`;
    }
    return match;
  });

  // 4. Escape HTML
  let escaped = escapeHtml(marked);

  // 5. Restore highlights with styled tags
  escaped = escaped.replace(/___HL_QUOTE___(.*?)___HL_END___/g, (_m, content) => {
    return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-bold text-slate-900 bg-white border border-slate-200 shadow-2xs">${content}</span>`;
  });

  escaped = escaped.replace(/___HL_DATE___(.*?)___HL_END___/g, (_m, date) => {
    return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-semibold text-slate-800 bg-slate-100 border border-slate-200/80">${date}</span>`;
  });

  escaped = escaped.replace(/___HL_CODE___(.*?)___HL_END___/g, (_m, code) => {
    return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded font-mono text-xs font-bold text-rose-900 bg-rose-100 border border-rose-200">${code}</span>`;
  });

  return escaped;
}

export interface BatchResultErrorItem {
  room?: string;
  name?: string;
  label?: string;
  message: string;
}

export function formatBatchResultHtml(options: {
  total?: number;
  success: number;
  failed?: number;
  errors: Array<BatchResultErrorItem | string>;
  guidance?: string;
  itemTypeLabel?: string;
}): string {
  const {
    success = 0,
    errors = [],
    guidance,
    itemTypeLabel = "khách",
  } = options;

  const failedCount = options.failed ?? errors.length;
  const totalCount = options.total ?? (success + failedCount);

  const parsedItems: BatchResultErrorItem[] = errors.map((err) => {
    if (typeof err !== "string") return err;
    const str = err.trim();
    const roomMatch = str.match(
      /^(?:[-*•\d+.]\s*)?Phòng\s+([^\s(:—]+)(?:\s*\(([^)]+)\))?\s*:\s*(.*)$/i,
    );
    if (roomMatch) {
      return {
        room: roomMatch[1].trim(),
        name: roomMatch[2]?.trim(),
        message: roomMatch[3].trim(),
      };
    }
    const labelMatch = str.match(
      /^(?:[-*•\d+.]\s*)?((?:Bản khai báo|Dòng|Mục|Hồ sơ|Khách|Lỗi)\s+[^:]+)\s*:\s*(.*)$/i,
    );
    if (labelMatch) {
      return {
        label: labelMatch[1].trim(),
        message: labelMatch[2].trim(),
      };
    }
    const genericMatch = str.match(/^(?:[-*•\d+.]\s*)?([^:]{2,30})\s*:\s*(.*)$/);
    if (genericMatch) {
      return {
        label: genericMatch[1].trim(),
        message: genericMatch[2].trim(),
      };
    }
    return {
      message: str.replace(/^[-*•\d+.]\s*/, ""),
    };
  });

  let html = `<div class="w-full text-left space-y-3 font-sans">`;

  // 1. Metric summary cards
  html += `  <div class="grid grid-cols-3 gap-2 sm:gap-3 text-center select-none">`;
  html += `    <div class="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 shadow-2xs">`;
  html += `      <span class="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800">Thành công</span>`;
  html += `      <span class="text-xl sm:text-2xl font-black text-emerald-900 mt-0.5">${success}</span>`;
  html += `    </div>`;
  html += `    <div class="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-rose-50/90 border border-rose-200/90 shadow-2xs">`;
  html += `      <span class="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-rose-800">Lỗi / Từ chối</span>`;
  html += `      <span class="text-xl sm:text-2xl font-black text-rose-900 mt-0.5">${failedCount}</span>`;
  html += `    </div>`;
  html += `    <div class="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-slate-50/90 border border-slate-200/90 shadow-2xs">`;
  html += `      <span class="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700">Tổng cộng</span>`;
  html += `      <span class="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">${totalCount} <span class="text-xs font-medium text-slate-600">${itemTypeLabel}</span></span>`;
  html += `    </div>`;
  html += `  </div>`;

  // 2. Error list header & container
  if (parsedItems.length > 0) {
    html += `  <div class="space-y-2 pt-1">`;
    html += `    <div class="flex items-center justify-between px-1">`;
    html += `      <div class="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">`;
    html += `        <span class="inline-flex h-2 w-2 rounded-full bg-rose-500"></span>`;
    html += `        <span>Chi tiết lỗi (${parsedItems.length} ${itemTypeLabel}):</span>`;
    html += `      </div>`;
    if (parsedItems.length > 3) {
      html += `      <span class="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Cuộn để xem hết</span>`;
    }
    html += `    </div>`;

    // Scrollable error items
    html += `    <div class="max-h-[42vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">`;

    for (let idx = 0; idx < parsedItems.length; idx++) {
      const item = parsedItems[idx];
      html += `      <div class="rounded-xl border border-rose-200/80 bg-rose-50/50 p-3 hover:bg-rose-50/80 transition-colors shadow-2xs">`;

      if (item.room || item.name || item.label) {
        html += `        <div class="flex items-center gap-2 flex-wrap mb-1.5">`;
        if (item.room) {
          html += `          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black bg-rose-200/80 text-rose-950 border border-rose-300/80">`;
          html += `            Phòng ${escapeHtml(item.room)}`;
          html += `          </span>`;
        }
        if (item.label && !item.room) {
          html += `          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black bg-slate-200 text-slate-900 border border-slate-300">`;
          html += `            ${escapeHtml(item.label)}`;
          html += `          </span>`;
        }
        if (item.name) {
          html += `          <span class="font-bold text-slate-900 text-sm">`;
          html += `            ${escapeHtml(item.name)}`;
          html += `          </span>`;
        }
        html += `        </div>`;
      }

      html += `        <p class="text-xs sm:text-sm text-slate-800 leading-relaxed font-normal pl-0.5">`;
      html += `          ${formatTextContent(item.message)}`;
      html += `        </p>`;
      html += `      </div>`;
    }

    html += `    </div>`;
    html += `  </div>`;
  }

  // 3. Guidance footer
  if (guidance) {
    html += `  <div class="flex items-start gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/80 p-3 text-amber-950 shadow-2xs">`;
    html += `    <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
    html += `    <div class="text-xs sm:text-sm font-medium leading-relaxed">`;
    html += `      <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
    html += `      <span>${escapeHtml(guidance)}</span>`;
    html += `    </div>`;
    html += `  </div>`;
  }

  html += `</div>`;
  return html;
}

export function formatAlertErrorMessage(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return `<p class="text-center text-slate-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  let text = raw.trim();
  if (!text) {
    return `<p class="text-center text-slate-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  // 1. Extract guidance / advice at the end
  let guidance: string | null = null;
  const guidanceMatch = text.match(
    /(?:^|[.;,\n]\s*)(?:(?:\b(?:Vui lòng|Xin vui lòng|Lưu ý|Gợi ý|Hướng dẫn)\b[:\s]*))(.*)$/i,
  );
  if (guidanceMatch) {
    const fullGuidance = guidanceMatch[0].replace(/^[.;,\n]\s*/, "").trim();
    const remaining = text
      .slice(0, guidanceMatch.index)
      .trim()
      .replace(/[,;.]\s*$/, "");
    if (remaining.length > 0) {
      guidance = fullGuidance;
      text = remaining;
    }
  }

  // 2. Batch summary pattern (e.g. "Thành công: 0/17 khách.\n\nLỗi:\nPhòng 1054...")
  const batchMatch = text.match(
    /(?:^|\n)\s*(?:Thành công|Đã gửi thành công)\s*:\s*(\d+)(?:\s*\/\s*(\d+))?\s*(?:khách|mục|hồ sơ|bản ghi)?/i,
  );
  if (batchMatch) {
    const successCount = parseInt(batchMatch[1], 10);
    const totalCount = batchMatch[2] ? parseInt(batchMatch[2], 10) : undefined;
    const errorSection = text
      .slice(batchMatch.index! + batchMatch[0].length)
      .replace(/^[\s.:\n]*Lỗi:?[\s\n]*/i, "")
      .trim();
    const errorLines = errorSection
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^(?:Lỗi|Thất bại):?$/i.test(l));

    return formatBatchResultHtml({
      total: totalCount,
      success: successCount,
      errors: errorLines,
      guidance,
      itemTypeLabel: "khách",
    });
  }

  // 3. Grouped error patterns: "Bản khai báo X:", "Hồ sơ X:", "Dòng X:", "Lỗi X:", "Mục X:" at line starts
  const prefixGroupPattern =
    /(?:^|\n)\s*(?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s+(\d+|[A-Za-z0-9_-]+)\s*:/i;
  if (prefixGroupPattern.test(text)) {
    const chunks = text
      .split(
        /(?:,\s*|\.\s+|\n+|;\s*)(?=(?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s*(?:\d+|[A-Za-z0-9_-]+)\s*:)/i,
      )
      .map((c) => c.trim())
      .filter(Boolean);

    const groups = new Map<string, string[]>();
    for (const chunk of chunks) {
      const match = chunk.match(
        /^((?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s*(?:\d+|[A-Za-z0-9_-]+))\s*:\s*(.*)$/is,
      );
      if (match) {
        const groupLabel = match[1].trim();
        const itemMsg = match[2]
          .trim()
          .replace(/^[,;.]\s*/, "")
          .replace(/[,;.]\s*$/, "");
        if (!groups.has(groupLabel)) groups.set(groupLabel, []);
        if (itemMsg) groups.get(groupLabel)!.push(itemMsg);
      } else {
        const defaultKey =
          groups.size > 0 ? Array.from(groups.keys()).pop()! : "Chi tiết lỗi";
        if (!groups.has(defaultKey)) groups.set(defaultKey, []);
        groups.get(defaultKey)!.push(chunk);
      }
    }

    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">`;

    for (const [groupLabel, items] of groups.entries()) {
      html += `<div class="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 space-y-2.5 shadow-2xs">`;
      html += `  <div class="flex items-center gap-2 font-bold text-rose-900 text-sm sm:text-base">`;
      html += `    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-200 text-rose-800 text-xs font-black">!</span>`;
      html += `    <span>${escapeHtml(groupLabel)}</span>`;
      html += `  </div>`;

      if (items.length === 1) {
        html += `  <p class="text-rose-950 pl-7 text-[15px] sm:text-base leading-relaxed">${formatTextContent(items[0])}</p>`;
      } else {
        html += `  <ul class="space-y-2 pl-3">`;
        for (const item of items) {
          html += `    <li class="flex items-start gap-2.5 text-rose-950 text-[15px] sm:text-base">`;
          html += `      <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
          html += `      <span class="leading-relaxed">${formatTextContent(item)}</span>`;
          html += `    </li>`;
        }
        html += `  </ul>`;
      }
      html += `</div>`;
    }

    if (guidance) {
      html += `<div class="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-900 shadow-2xs">`;
      html += `  <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  // 4. Bullet points or line-breaks
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isBulletList =
    lines.length > 1 && lines.some((l) => /^[-*•\d+.]\s+/.test(l));

  if (isBulletList) {
    let title: string | null = null;
    let itemLines = lines;
    if (!/^[-*•]|\d+[.)]/.test(lines[0])) {
      title = lines[0].replace(/:\s*$/, "");
      itemLines = lines.slice(1);
    }

    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">`;
    html += `<div class="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 space-y-2.5">`;
    if (title) {
      html += `  <div class="flex items-center gap-2 font-bold text-rose-900 text-sm sm:text-base">`;
      html += `    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-200 text-rose-800 text-xs font-black">!</span>`;
      html += `    <span>${escapeHtml(title)}</span>`;
      html += `  </div>`;
    }
    html += `<ul class="space-y-2 ${title ? "pl-3" : ""}">`;
    for (const line of itemLines) {
      const cleaned = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
      html += `  <li class="flex items-start gap-2.5 text-rose-950">`;
      html += `    <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
      html += `    <span>${formatTextContent(cleaned)}</span>`;
      html += `  </li>`;
    }
    html += `</ul></div>`;
    if (guidance) {
      html += `<div class="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-900">`;
      html += `  <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 5. Multiple lines without bullets (e.g. error lines)
  if (lines.length > 1) {
    let html = `<div class="space-y-2 text-left text-[15px] sm:text-base leading-relaxed text-slate-700 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">`;
    for (const line of lines) {
      html += `<div class="rounded-xl border border-rose-200/80 bg-rose-50/60 p-3 text-rose-950">`;
      html += `  <span>${formatTextContent(line)}</span>`;
      html += `</div>`;
    }
    if (guidance) {
      html += `<div class="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-900">`;
      html += `  <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 6. Semicolon-separated multiple items
  const semiItems = text.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  if (semiItems.length >= 2) {
    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">`;
    html += `<div class="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 space-y-2">`;
    html += `<ul class="space-y-2">`;
    for (const item of semiItems) {
      html += `  <li class="flex items-start gap-2.5 text-rose-950">`;
      html += `    <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
      html += `    <span>${formatTextContent(item)}</span>`;
      html += `  </li>`;
    }
    html += `</ul></div>`;
    if (guidance) {
      html += `<div class="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-900">`;
      html += `  <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 7. Single / Simple message with guidance
  if (guidance) {
    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700">`;
    html += `<p class="text-center font-medium text-slate-800">${formatTextContent(text)}</p>`;
    html += `<div class="flex items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-900">`;
    html += `  <span class="text-base shrink-0 select-none mt-0.5">💡</span>`;
    html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
    html += `    <span class="font-bold text-amber-950">Hướng dẫn: </span>`;
    html += `    <span>${escapeHtml(guidance)}</span>`;
    html += `  </div></div></div>`;
    return html;
  }

  // 8. Pure single text
  return `<p class="text-center text-base font-medium text-slate-700 leading-relaxed">${formatTextContent(text)}</p>`;
}

export function extractErrorMessage(value: unknown): string {
  if (!value) return "Đã xảy ra lỗi không xác định. Vui lòng thử lại.";
  if (typeof value === "string") return value.trim() || "Đã xảy ra lỗi không xác định.";
  if (value instanceof Error) return value.message.trim() || "Đã xảy ra lỗi không xác định.";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim();
    if (typeof rec.detail === "string" && rec.detail.trim()) return rec.detail.trim();
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
  }
  return String(value);
}

export function showErrorAlert(title: string, messageOrError?: unknown) {
  const rawText = extractErrorMessage(messageOrError);
  const isHtml = /^\s*<[a-z][\s\S]*>/i.test(rawText);
  const htmlContent = isHtml ? rawText : formatAlertErrorMessage(rawText);
  const isLarge =
    htmlContent.includes("grid-cols-") ||
    htmlContent.includes("max-h-") ||
    htmlContent.length > 350;

  return SwalVietSage.fire({
    title,
    html: htmlContent,
    icon: "error",
    showConfirmButton: true,
    confirmButtonText: "OK",
    customClass: {
      popup: `rounded-[2rem] bg-white p-5 sm:p-7 shadow-2xl border border-gray-100 ${
        isLarge ? "w-[94vw] sm:w-[90vw] md:max-w-2xl" : "w-[92vw] sm:w-[88vw] max-w-xl"
      } max-h-[88vh] flex flex-col my-auto overflow-hidden`,
      title:
        "text-xl sm:text-2xl md:text-3xl font-extrabold text-[#18211d] text-center mb-2 tracking-tight shrink-0",
      htmlContainer:
        "text-sm sm:text-base font-medium text-gray-700 !text-left mb-3 leading-relaxed max-h-[58vh] overflow-y-auto pr-1 focus:outline-none custom-scrollbar w-full !m-0 !mt-2",
      confirmButton:
        "inline-flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-7 text-sm sm:text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[120px]",
      cancelButton:
        "inline-flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm sm:text-base font-bold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer mx-1.5 min-w-[100px]",
      actions:
        "flex items-center justify-center gap-3 pt-3 shrink-0 border-t border-slate-100 w-full mt-2",
    },
  });
}

export function showConfirmDialog(options: {
  title: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "error" | "info";
}) {
  return SwalVietSage.fire({
    title: options.title,
    ...(options.html ? { html: options.html } : { text: options.text }),
    icon: options.icon ?? "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Xác nhận",
    cancelButtonText: options.cancelText ?? "Hủy bỏ",
  });
}
