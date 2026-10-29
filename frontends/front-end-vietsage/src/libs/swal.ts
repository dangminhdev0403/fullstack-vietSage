import Swal from "sweetalert2";

/**
 * Prevents typographic orphans (isolated words on trailing lines)
 * by joining the last two words of each sentence or line with a non-breaking space (\u00A0).
 */
export function preventOrphans(text: string): string {
  if (!text || typeof text !== "string") return text;
  // Preserve HTML markup as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed.includes(" ")) return line;
      return trimmed.replace(/\s+([^\s]+)$/, "\u00A0$1");
    })
    .join("\n");
}

/* =====================================================================
   SHARED SWEETALERT2 STYLING TOKENS (HOSPITALITY LUXURY STANDARD)
   ===================================================================== */
export const SWAL_BASE_POPUP_CLASS =
  "relative rounded-[28px] sm:rounded-[32px] bg-white p-6 sm:p-8 md:p-9 shadow-2xl border border-gray-100 max-h-[90vh] flex flex-col my-auto overflow-hidden";

export const SWAL_POPUP_STANDARD =
  `${SWAL_BASE_POPUP_CLASS} w-[94vw] sm:w-[90vw] max-w-[480px]`;

export const SWAL_POPUP_MEDIUM =
  `${SWAL_BASE_POPUP_CLASS} w-[94vw] sm:w-[90vw] max-w-xl`;

export const SWAL_POPUP_LARGE =
  `${SWAL_BASE_POPUP_CLASS} w-[94vw] sm:w-[90vw] md:max-w-2xl`;

export const SWAL_TITLE_CLASS =
  "text-xl sm:text-2xl md:text-[26px] font-bold text-gray-800 text-center mb-2 mt-0.5 tracking-tight shrink-0 text-balance leading-snug max-w-[36ch] mx-auto";

export const SWAL_HTML_CONTAINER_CLASS =
  "text-sm sm:text-base font-normal text-gray-600 text-center leading-relaxed max-h-[58vh] overflow-y-auto pr-1 focus:outline-none custom-scrollbar w-full max-w-[52ch] mx-auto !m-0 !mt-1.5 !mb-1 text-pretty [text-wrap:pretty]";

export const SWAL_HTML_CONTAINER_LEFT_CLASS =
  "text-sm sm:text-base font-normal text-gray-600 !text-left leading-relaxed max-h-[58vh] overflow-y-auto pr-1 focus:outline-none custom-scrollbar w-full max-w-none !m-0 !mt-2.5 !mb-1 text-pretty [text-wrap:pretty]";

export const SWAL_CONFIRM_BTN_CLASS =
  "inline-flex h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] px-7 sm:px-8 text-sm sm:text-base font-bold text-white shadow-md shadow-emerald-600/25 transition-all duration-150 cursor-pointer mx-1.5 min-w-[120px] select-none";

export const SWAL_DANGER_BTN_CLASS =
  "inline-flex h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] active:scale-[0.98] px-7 sm:px-8 text-sm sm:text-base font-bold text-white shadow-md shadow-red-500/25 transition-all duration-150 cursor-pointer mx-1.5 min-w-[120px] select-none";

export const SWAL_CANCEL_BTN_CLASS =
  "inline-flex h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] items-center justify-center gap-2 rounded-xl sm:rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] px-6 sm:px-7 text-sm sm:text-base font-bold text-gray-700 hover:text-gray-900 shadow-2xs transition-all duration-150 cursor-pointer mx-1.5 min-w-[100px] select-none";

export const SWAL_ACTIONS_CLASS =
  "flex flex-wrap sm:flex-nowrap items-center justify-center gap-3 pt-4 sm:pt-5 shrink-0 border-t border-gray-100 w-full mt-4";

export const SwalVietSage = Swal.mixin({
  customClass: {
    popup: SWAL_POPUP_STANDARD,
    title: SWAL_TITLE_CLASS,
    htmlContainer: SWAL_HTML_CONTAINER_CLASS,
    confirmButton: SWAL_CONFIRM_BTN_CLASS,
    cancelButton: SWAL_CANCEL_BTN_CLASS,
    actions: SWAL_ACTIONS_CLASS,
  },
  buttonsStyling: false,
  reverseButtons: false,
  backdrop: "rgba(15, 26, 23, 0.28)",
  willOpen: () => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  },
});

const TRUSTED_ALERT_HTML = Symbol("trustedAlertHtml");

export type TrustedAlertHtml = {
  readonly html: string;
  readonly [TRUSTED_ALERT_HTML]: true;
};

export function trustedAlertHtml(html: string): TrustedAlertHtml {
  return { html, [TRUSTED_ALERT_HTML]: true };
}

function isTrustedAlertHtml(value: unknown): value is TrustedAlertHtml {
  return (
    typeof value === "object" &&
    value !== null &&
    TRUSTED_ALERT_HTML in value &&
    (value as TrustedAlertHtml)[TRUSTED_ALERT_HTML] === true
  );
}

export function resolveAlertContent(
  value: unknown,
  formatAsError = false,
): { text?: string; html?: string } {
  if (isTrustedAlertHtml(value)) return { html: value.html };
  const text = extractErrorMessage(value);
  const orphanSafe = preventOrphans(text);
  return formatAsError ? { html: formatAlertErrorMessage(orphanSafe) } : { text: orphanSafe };
}

export interface AlertOptions {
  timer?: number | false;
  confirmButtonText?: string;
  showCancelButton?: boolean;
  cancelButtonText?: string;
  reverseButtons?: boolean;
  customClass?: {
    popup?: string;
    title?: string;
    htmlContainer?: string;
    confirmButton?: string;
    cancelButton?: string;
    actions?: string;
  };
}

export function showSuccessAlert(
  title: string,
  messageOrHtml: string | TrustedAlertHtml,
  options?: AlertOptions,
) {
  const content = resolveAlertContent(messageOrHtml);
  const isHtml = "html" in content;
  const timer =
    options?.timer === false
      ? undefined
      : options?.timer !== undefined
        ? options.timer
        : isHtml
          ? 3500
          : 2000;
  const timerProgressBar = timer !== undefined;
  return SwalVietSage.fire({
    titleText: preventOrphans(title),
    ...content,
    icon: "success",
    timer,
    timerProgressBar,
    showConfirmButton: true,
    confirmButtonText: options?.confirmButtonText ?? "OK",
    showCancelButton: options?.showCancelButton ?? false,
    cancelButtonText: options?.cancelButtonText ?? "Hủy bỏ",
    reverseButtons: options?.reverseButtons ?? false,
    customClass: {
      popup: options?.customClass?.popup ?? (isHtml ? SWAL_POPUP_MEDIUM : SWAL_POPUP_STANDARD),
      title: options?.customClass?.title ?? SWAL_TITLE_CLASS,
      htmlContainer:
        options?.customClass?.htmlContainer ??
        (isHtml ? SWAL_HTML_CONTAINER_LEFT_CLASS : SWAL_HTML_CONTAINER_CLASS),
      confirmButton: options?.customClass?.confirmButton ?? SWAL_CONFIRM_BTN_CLASS,
      cancelButton: options?.customClass?.cancelButton ?? SWAL_CANCEL_BTN_CLASS,
      actions: options?.customClass?.actions ?? SWAL_ACTIONS_CLASS,
    },
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
    return `<span class="inline-block px-2 py-0.5 mx-0.5 rounded-lg font-bold text-gray-800 bg-gray-50 border border-gray-200 shadow-2xs text-sm sm:text-base">${content}</span>`;
  });

  escaped = escaped.replace(/___HL_DATE___(.*?)___HL_END___/g, (_m, date) => {
    return `<span class="inline-block px-2 py-0.5 mx-0.5 rounded-lg font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 text-sm sm:text-base">${date}</span>`;
  });

  escaped = escaped.replace(/___HL_CODE___(.*?)___HL_END___/g, (_m, code) => {
    return `<span class="inline-block px-2 py-0.5 mx-0.5 rounded font-mono text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200">${code}</span>`;
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

  let html = `<div class="w-full text-left space-y-3.5 font-sans">`;

  // 1. Metric summary cards
  html += `  <div class="grid grid-cols-3 gap-2.5 sm:gap-3.5 text-center select-none">`;
  html += `    <div class="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 shadow-2xs">`;
  html += `      <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-800">Thành công</span>`;
  html += `      <span class="text-2xl sm:text-3xl font-black text-emerald-900 mt-1">${success}</span>`;
  html += `    </div>`;
  html += `    <div class="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-rose-50/90 border border-rose-200/90 shadow-2xs">`;
  html += `      <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-800">Lỗi / Từ chối</span>`;
  html += `      <span class="text-2xl sm:text-3xl font-black text-rose-900 mt-1">${failedCount}</span>`;
  html += `    </div>`;
  html += `    <div class="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-slate-50/90 border border-slate-200/90 shadow-2xs">`;
  html += `      <span class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700">Tổng cộng</span>`;
  html += `      <span class="text-2xl sm:text-3xl font-black text-slate-900 mt-1">${totalCount} <span class="text-xs sm:text-sm font-medium text-slate-600">${itemTypeLabel}</span></span>`;
  html += `    </div>`;
  html += `  </div>`;

  // 2. Error list header & container
  if (parsedItems.length > 0) {
    html += `  <div class="space-y-2.5 pt-1">`;
    html += `    <div class="flex items-center justify-between px-1">`;
    html += `      <div class="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">`;
    html += `        <span class="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span>`;
    html += `        <span>Chi tiết lỗi (${parsedItems.length} ${itemTypeLabel}):</span>`;
    html += `      </div>`;
    if (parsedItems.length > 3) {
      html += `      <span class="text-xs sm:text-sm font-medium text-gray-600 bg-gray-50 px-2.5 py-0.5 rounded-full">Cuộn để xem hết</span>`;
    }
    html += `    </div>`;

    // Scrollable error items
    html += `    <div class="max-h-[42vh] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">`;

    for (let idx = 0; idx < parsedItems.length; idx++) {
      const item = parsedItems[idx];
      html += `      <div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-3.5 sm:p-4 hover:bg-rose-50/90 transition-colors shadow-2xs space-y-1.5">`;

      if (item.room || item.name || item.label) {
        html += `        <div class="flex items-center gap-2 flex-wrap mb-1">`;
        if (item.room) {
          html += `          <span class="inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-black bg-rose-100 text-rose-700 border border-rose-200">`;
          html += `            Phòng ${escapeHtml(item.room)}`;
          html += `          </span>`;
        }
        if (item.label && !item.room) {
          html += `          <span class="inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-black bg-gray-100 text-gray-800 border border-gray-300">`;
          html += `            ${escapeHtml(item.label)}`;
          html += `          </span>`;
        }
        if (item.name) {
          html += `          <span class="font-bold text-gray-800 text-sm sm:text-base">`;
          html += `            ${escapeHtml(item.name)}`;
          html += `          </span>`;
        }
        html += `        </div>`;
      }

      html += `        <p class="text-sm sm:text-base text-gray-600 leading-relaxed font-normal pl-0.5">`;
      html += `          ${formatTextContent(item.message)}`;
      html += `        </p>`;
      html += `      </div>`;
    }

    html += `    </div>`;
    html += `  </div>`;
  }

  // 3. Guidance footer
  if (guidance) {
    html += `  <div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
    html += `    <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
    html += `    <div class="text-sm sm:text-base font-medium leading-relaxed">`;
    html += `      <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
    html += `      <span>${escapeHtml(guidance)}</span>`;
    html += `    </div>`;
    html += `  </div>`;
  }

  html += `</div>`;
  return html;
}

function isRawServerHtmlString(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.startsWith("<") &&
    (lower.includes("<!doctype") ||
      lower.includes("<html") ||
      lower.includes("<head") ||
      lower.includes("<body") ||
      lower.includes("class=\"be_vietnam_pro_") ||
      lower.includes("/_next/static/"))
  );
}

export function formatAlertErrorMessage(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return `<p class="text-center text-gray-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  let text = raw.trim();
  if (isRawServerHtmlString(text)) {
    text = "Máy chủ gặp sự cố xử lý yêu cầu hoặc đường dẫn không khả dụng. Vui lòng thử lại sau.";
  }
  if (!text) {
    return `<p class="text-center text-gray-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  // 1. Extract guidance / advice at the end
  let guidance: string | undefined = undefined;
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
        /^((?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s*(?:\d+|[A-Za-z0-9_-]+))\s*:\s*([\s\S]*)$/i,
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

    let html = `<div class="space-y-3.5 text-left text-base sm:text-lg leading-relaxed text-gray-600 max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar">`;

    for (const [groupLabel, items] of groups.entries()) {
      html += `<div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-4 sm:p-5 space-y-3 shadow-2xs">`;
      html += `  <div class="flex items-center gap-2.5 font-bold text-rose-800 text-base sm:text-lg">`;
      html += `    <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs sm:text-sm font-black">!</span>`;
      html += `    <span>${escapeHtml(groupLabel)}</span>`;
      html += `  </div>`;

      if (items.length === 1) {
        html += `  <p class="text-rose-900 pl-8 text-base sm:text-[17px] leading-relaxed">${formatTextContent(items[0])}</p>`;
      } else {
        html += `  <ul class="space-y-2.5 pl-3.5">`;
        for (const item of items) {
          html += `    <li class="flex items-start gap-3 text-rose-900 text-base sm:text-[17px]">`;
          html += `      <span class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
          html += `      <span class="leading-relaxed">${formatTextContent(item)}</span>`;
          html += `    </li>`;
        }
        html += `  </ul>`;
      }
      html += `</div>`;
    }

    if (guidance) {
      html += `<div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
      html += `  <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
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

    let html = `<div class="space-y-3.5 text-left text-base sm:text-lg leading-relaxed text-gray-600 max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar">`;
    html += `<div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-4 sm:p-5 space-y-3 shadow-2xs">`;
    if (title) {
      html += `  <div class="flex items-center gap-2.5 font-bold text-rose-800 text-base sm:text-lg">`;
      html += `    <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs sm:text-sm font-black">!</span>`;
      html += `    <span>${escapeHtml(title)}</span>`;
      html += `  </div>`;
    }
    html += `<ul class="space-y-2.5 ${title ? "pl-3.5" : ""}">`;
    for (const line of itemLines) {
      const cleaned = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
      html += `  <li class="flex items-start gap-3 text-rose-900 text-base sm:text-[17px]">`;
      html += `    <span class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
      html += `    <span>${formatTextContent(cleaned)}</span>`;
      html += `  </li>`;
    }
    html += `</ul></div>`;
    if (guidance) {
      html += `<div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
      html += `  <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 5. Multiple lines without bullets (e.g. error lines)
  if (lines.length > 1) {
    let html = `<div class="space-y-2.5 text-left text-base sm:text-lg leading-relaxed text-gray-600 max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar">`;
    for (const line of lines) {
      html += `<div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-3.5 sm:p-4 text-rose-900 text-base sm:text-[17px] leading-relaxed shadow-2xs">`;
      html += `  <span>${formatTextContent(line)}</span>`;
      html += `</div>`;
    }
    if (guidance) {
      html += `<div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
      html += `  <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 6. Semicolon-separated multiple items
  const semiItems = text.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  if (semiItems.length >= 2) {
    let html = `<div class="space-y-3.5 text-left text-base sm:text-lg leading-relaxed text-gray-600 max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar">`;
    html += `<div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-4 sm:p-5 space-y-2.5 shadow-2xs">`;
    html += `<ul class="space-y-2.5">`;
    for (const item of semiItems) {
      html += `  <li class="flex items-start gap-3 text-rose-900 text-base sm:text-[17px]">`;
      html += `    <span class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"></span>`;
      html += `    <span>${formatTextContent(item)}</span>`;
      html += `  </li>`;
    }
    html += `</ul></div>`;
    if (guidance) {
      html += `<div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
      html += `  <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
      html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
      html += `    <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
      html += `    <span>${escapeHtml(guidance)}</span>`;
      html += `  </div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // 7. Single / Simple message with guidance
  if (guidance) {
    let html = `<div class="space-y-3.5 text-left text-base sm:text-lg leading-relaxed text-gray-600">`;
    html += `<p class="text-center font-medium text-gray-800 text-base sm:text-lg max-w-[56ch] mx-auto text-pretty">${formatTextContent(text)}</p>`;
    html += `<div class="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 text-amber-900 shadow-2xs">`;
    html += `  <span class="text-lg shrink-0 select-none mt-0.5">💡</span>`;
    html += `  <div class="text-sm sm:text-base font-medium leading-relaxed">`;
    html += `    <span class="font-bold text-amber-800">Hướng dẫn: </span>`;
    html += `    <span>${escapeHtml(guidance)}</span>`;
    html += `  </div></div></div>`;
    return html;
  }

  // 8. Pure single text
  return `<p class="text-center text-base sm:text-lg font-normal text-gray-600 leading-relaxed max-w-[56ch] mx-auto text-pretty">${formatTextContent(text)}</p>`;
}

export function extractErrorMessage(value: unknown): string {
  if (!value) return "Đã xảy ra lỗi không xác định. Vui lòng thử lại.";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return isRawServerHtmlString(trimmed)
      ? "Máy chủ gặp sự cố xử lý yêu cầu hoặc đường dẫn không khả dụng. Vui lòng thử lại sau."
      : trimmed || "Đã xảy ra lỗi không xác định.";
  }
  if (value instanceof Error) {
    const trimmed = value.message.trim();
    return isRawServerHtmlString(trimmed)
      ? "Máy chủ gặp sự cố xử lý yêu cầu hoặc đường dẫn không khả dụng. Vui lòng thử lại sau."
      : trimmed || "Đã xảy ra lỗi không xác định.";
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim();
    if (typeof rec.detail === "string" && rec.detail.trim()) return rec.detail.trim();
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
  }
  const raw = String(value).trim();
  return isRawServerHtmlString(raw)
    ? "Máy chủ gặp sự cố xử lý yêu cầu hoặc đường dẫn không khả dụng. Vui lòng thử lại sau."
    : raw || "Đã xảy ra lỗi không xác định.";
}

export function showErrorAlert(title: string, messageOrError?: unknown) {
  const { html: htmlContent = "" } = resolveAlertContent(messageOrError, true);
  const isLarge =
    htmlContent.includes("grid-cols-") ||
    htmlContent.includes("max-h-") ||
    htmlContent.length > 350;

  return SwalVietSage.fire({
    titleText: preventOrphans(title),
    html: htmlContent,
    icon: "error",
    showConfirmButton: true,
    confirmButtonText: "OK",
    customClass: {
      popup: isLarge ? SWAL_POPUP_LARGE : SWAL_POPUP_MEDIUM,
      title: SWAL_TITLE_CLASS,
      htmlContainer: SWAL_HTML_CONTAINER_LEFT_CLASS,
      confirmButton: SWAL_CONFIRM_BTN_CLASS,
      cancelButton: SWAL_CANCEL_BTN_CLASS,
      actions: SWAL_ACTIONS_CLASS,
    },
  });
}

export interface ConfirmDialogOptions {
  title: string;
  text?: string;
  html?: string | TrustedAlertHtml;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "error" | "info";
  reverseButtons?: boolean;
  confirmVariant?: "primary" | "danger";
  popupSize?: "standard" | "medium" | "large";
}

/* =====================================================================
   HOSPITALITY OPS RICH CONFIRMATION TEMPLATES
   ===================================================================== */

export function parseGuestNameAndTag(rawName: string): { name: string; tag: string | null } {
  if (!rawName || typeof rawName !== "string") return { name: "", tag: null };
  const trimmed = rawName.trim();
  const match = trimmed.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      name: match[1].trim(),
      tag: match[2].trim(),
    };
  }
  return { name: trimmed, tag: null };
}

export interface RoomSwapConfirmParams {
  sourceGuest: string;
  sourceRoom: string;
  sourceDates?: string | null;
  sourceRoomType?: string | null;
  targetGuest: string;
  targetRoom: string;
  targetDates?: string | null;
  targetRoomType?: string | null;
  note?: string;
}

export function formatRoomSwapConfirmHtml(params: RoomSwapConfirmParams): string {
  const {
    sourceGuest,
    sourceRoom,
    sourceDates,
    sourceRoomType,
    targetGuest,
    targetRoom,
    targetDates,
    targetRoomType,
    note,
  } = params;

  const parsedSource = parseGuestNameAndTag(sourceGuest);
  const parsedTarget = parseGuestNameAndTag(targetGuest);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <!-- Card 1: Đơn đang di chuyển -->
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-200/80 text-slate-700">Đơn 1</span>
            <span class="text-xs text-slate-500 font-medium hidden sm:inline">Đang chọn</span>
          </div>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">Giữ nguyên ngày &amp; giá</span>
        </div>

        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <strong class="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[280px]">${escapeHtml(parsedSource.name)}</strong>
            ${
              parsedSource.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedSource.tag)}</span>`
                : ""
            }
          </div>
          ${
            sourceDates || sourceRoomType
              ? `<div class="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  ${sourceRoomType ? `<span>${escapeHtml(sourceRoomType)}</span>` : ""}
                  ${sourceDates && sourceRoomType ? `<span>•</span>` : ""}
                  ${sourceDates ? `<span>${escapeHtml(sourceDates)}</span>` : ""}
                </div>`
              : ""
          }
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-200/70 text-xs sm:text-sm">
          <span class="text-slate-500 font-medium">Chuyển sang:</span>
          <div class="flex items-center gap-2 font-bold shrink-0">
            <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold shadow-2xs">P.${escapeHtml(sourceRoom)}</span>
            <span class="text-emerald-600 font-black text-base">➔</span>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black shadow-xs">P.${escapeHtml(targetRoom)}</span>
          </div>
        </div>
      </div>

      <!-- Divider tráo đổi 2 chiều -->
      <div class="relative flex items-center justify-center my-0.5 select-none">
        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div>
        <div class="relative flex items-center gap-1.5 px-3.5 py-1 bg-white border border-purple-200 rounded-full text-xs font-bold text-purple-700 shadow-2xs whitespace-nowrap">
          <span class="text-sm font-black">⇄</span>
          <span>Hoán đổi vị trí phòng</span>
        </div>
      </div>

      <!-- Card 2: Đơn đối ứng tại phòng đích -->
      <div class="rounded-2xl border border-purple-200/80 bg-purple-50/40 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">Đơn 2</span>
            <span class="text-xs text-purple-700 font-medium hidden sm:inline">Tại phòng đích</span>
          </div>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100/90 text-purple-900 border border-purple-200 whitespace-nowrap">Đổi về P.${escapeHtml(sourceRoom)}</span>
        </div>

        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <strong class="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[280px]">${escapeHtml(parsedTarget.name)}</strong>
            ${
              parsedTarget.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedTarget.tag)}</span>`
                : ""
            }
          </div>
          ${
            targetDates || targetRoomType
              ? `<div class="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  ${targetRoomType ? `<span>${escapeHtml(targetRoomType)}</span>` : ""}
                  ${targetDates && targetRoomType ? `<span>•</span>` : ""}
                  ${targetDates ? `<span>${escapeHtml(targetDates)}</span>` : ""}
                </div>`
              : ""
          }
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-purple-200/70 text-xs sm:text-sm">
          <span class="text-purple-700 font-medium">Chuyển sang:</span>
          <div class="flex items-center gap-2 font-bold shrink-0">
            <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold shadow-2xs">P.${escapeHtml(targetRoom)}</span>
            <span class="text-purple-600 font-black text-base">➔</span>
            <span class="px-2.5 py-1 rounded-lg bg-purple-700 text-white font-black shadow-xs">P.${escapeHtml(sourceRoom)}</span>
          </div>
        </div>
      </div>

      <!-- Explanatory reassurance footer -->
      <div class="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-sky-600">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Hai đơn đặt phòng sẽ hoán đổi phòng cho nhau trên sơ đồ. Ngày nhận/trả phòng và giá tiền của từng đơn được bảo lưu nguyên vẹn.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface RoomMoveConfirmParams {
  guestName: string;
  fromRoom: string;
  toRoom: string;
  startDate: string;
  endDate: string;
  roomTypeName?: string | null;
  nights?: number | null;
  isDirtyOrCleaning?: boolean;
  dirtyStatusLabel?: string;
  note?: string;
}

export function formatRoomMoveConfirmHtml(params: RoomMoveConfirmParams): string {
  const {
    guestName,
    fromRoom,
    toRoom,
    startDate,
    endDate,
    roomTypeName,
    nights,
    isDirtyOrCleaning,
    dirtyStatusLabel,
    note,
  } = params;

  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div class="flex items-center justify-between text-xs pb-2 border-b border-slate-200/70">
          <span class="font-semibold text-slate-500">Khách lưu trú</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Chuyển phòng</span>
          <div class="flex items-center gap-2 font-bold">
            <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 shadow-2xs">P.${escapeHtml(fromRoom)}</span>
            <span class="text-emerald-600 font-black text-base">➔</span>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black shadow-xs">P.${escapeHtml(toRoom)}</span>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Thời gian lưu trú</span>
          <span class="font-bold text-slate-800 text-xs sm:text-sm">
            ${escapeHtml(startDate)} ➔ ${escapeHtml(endDate)}
            ${nights ? `<span class="text-slate-500 font-normal">(${nights} đêm)</span>` : ""}
          </span>
        </div>

        ${
          roomTypeName
            ? `
          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200/70">
            <span class="font-semibold text-slate-500">Hạng phòng</span>
            <span class="font-medium text-slate-700">${escapeHtml(roomTypeName)}</span>
          </div>
        `
            : ""
        }
      </div>

      ${
        isDirtyOrCleaning
          ? `
        <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-amber-900 text-xs sm:text-sm leading-relaxed shadow-2xs">
          <span class="text-base select-none mt-0.5">⚠️</span>
          <div class="space-y-0.5">
            <strong class="font-bold text-amber-950">Phòng ${escapeHtml(toRoom)} đang ở trạng thái ${escapeHtml(dirtyStatusLabel || "chờ dọn dẹp")}:</strong>
            <p class="text-pretty">Vui lòng phối hợp với bộ phận buồng phòng hoàn tất kiểm tra và dọn phòng trước khi khách nhận phòng.</p>
          </div>
        </div>
      `
          : `
        <div class="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
          <span class="text-base select-none mt-0.5 text-sky-600">ℹ️</span>
          <p class="text-pretty">
            ${escapeHtml(note || "Đơn đặt phòng sẽ được chuyển trực tiếp sang phòng mới trên sơ đồ buồng phòng.")}
          </p>
        </div>
      `
      }
    </div>
  `;
}

export interface ExtendStayConfirmParams {
  roomNumber: string;
  guestName: string;
  oldEndDate: string;
  newEndDate: string;
  diffNights: number;
  totalNights: number;
  nightlyRate?: number;
  additionalCost?: number;
  note?: string;
}

export function formatExtendStayConfirmHtml(params: ExtendStayConfirmParams): string {
  const {
    roomNumber,
    guestName,
    oldEndDate,
    newEndDate,
    diffNights,
    totalNights,
    nightlyRate = 0,
    additionalCost = 0,
    note,
  } = params;

  const parsedGuest = parseGuestNameAndTag(guestName);
  const formattedCost =
    additionalCost > 0
      ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(additionalCost)
      : null;

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div class="flex items-center justify-between text-xs pb-2 border-b border-slate-200/70">
          <span class="font-semibold text-slate-500">Khách lưu trú</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Phòng</span>
          <span class="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">P.${escapeHtml(roomNumber)}</span>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Hạn trả phòng</span>
          <div class="flex items-center gap-2 font-bold">
            <span class="line-through text-slate-400 font-medium">${escapeHtml(oldEndDate)}</span>
            <span class="text-emerald-600 font-black text-base">➔</span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">${escapeHtml(newEndDate)}</span>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Số đêm gia hạn</span>
          <span class="font-bold text-slate-900">+${diffNights} đêm <span class="text-slate-500 font-normal">(Tổng: ${totalNights} đêm)</span></span>
        </div>

        ${
          formattedCost
            ? `
          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200/70">
            <span class="font-bold text-slate-700">Tiền phòng phát sinh</span>
            <span class="font-black text-emerald-700 text-sm sm:text-base">${escapeHtml(formattedCost)}</span>
          </div>
        `
            : ""
        }
      </div>

      <div class="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-sky-600">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Hệ thống sẽ cập nhật trạng thái phòng thành Đang ở bình thường và ghi nhận thời hạn lưu trú mới.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface AdjustReservationDatesConfirmParams {
  roomNumber: string;
  guestName: string;
  oldStartDate: string;
  newStartDate: string;
  oldEndDate: string;
  newEndDate: string;
  totalNights: number;
  diffNights: number;
  note?: string;
}

export function formatAdjustReservationDatesConfirmHtml(
  params: AdjustReservationDatesConfirmParams,
): string {
  const {
    roomNumber,
    guestName,
    oldStartDate,
    newStartDate,
    oldEndDate,
    newEndDate,
    totalNights,
    diffNights,
    note,
  } = params;

  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div class="flex items-center justify-between text-xs pb-2 border-b border-slate-200/70">
          <span class="font-semibold text-slate-500">Khách hàng</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Phòng</span>
          <span class="px-2.5 py-0.5 rounded-lg bg-purple-100 text-purple-900 border border-purple-300 font-bold">P.${escapeHtml(roomNumber)}</span>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Ngày nhận phòng</span>
          <div class="flex items-center gap-2 font-bold">
            ${
              oldStartDate !== newStartDate
                ? `<span class="line-through text-slate-400 font-medium">${escapeHtml(oldStartDate)}</span>
                   <span class="text-purple-600 font-black text-base">➔</span>
                   <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 font-bold">${escapeHtml(newStartDate)}</span>`
                : `<span class="text-slate-800">${escapeHtml(newStartDate)}</span>`
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm">
          <span class="font-semibold text-slate-500">Ngày trả phòng</span>
          <div class="flex items-center gap-2 font-bold">
            ${
              oldEndDate !== newEndDate
                ? `<span class="line-through text-slate-400 font-medium">${escapeHtml(oldEndDate)}</span>
                   <span class="text-purple-600 font-black text-base">➔</span>
                   <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 font-bold">${escapeHtml(newEndDate)}</span>`
                : `<span class="text-slate-800">${escapeHtml(newEndDate)}</span>`
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-slate-200/70">
          <span class="font-semibold text-slate-500">Tổng số đêm</span>
          <span class="font-bold text-slate-900">${totalNights} đêm <span class="text-slate-500 font-normal">(${diffNights >= 0 ? `+${diffNights}` : diffNights} đêm)</span></span>
        </div>
      </div>

      <div class="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-sky-600">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note || "Hệ thống sẽ cập nhật ngày nhận/trả phòng và đồng bộ trực tiếp lên sơ đồ buồng phòng.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface CheckOutConfirmParams {
  roomNumber: string;
  guestName: string;
  startDate?: string | null;
  endDate?: string | null;
  roomTypeName?: string | null;
  note?: string;
}

export function formatCheckOutConfirmHtml(params: CheckOutConfirmParams): string {
  const { roomNumber, guestName, startDate, endDate, roomTypeName, note } = params;
  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-500">Phòng trả</span>
          <span class="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs sm:text-sm">Phòng ${escapeHtml(roomNumber)}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-500">Khách lưu trú</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>
        ${
          startDate && endDate
            ? `
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-500">Kỳ lưu trú</span>
            <span class="font-bold text-slate-800 text-xs sm:text-sm">${escapeHtml(startDate)} ➔ ${escapeHtml(endDate)}</span>
          </div>
        `
            : ""
        }
        ${
          roomTypeName
            ? `
          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
            <span class="font-semibold text-slate-500">Hạng phòng</span>
            <span class="font-medium text-slate-700">${escapeHtml(roomTypeName)}</span>
          </div>
        `
            : ""
        }
      </div>
      <div class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-emerald-700">✓</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Xác nhận khách đã hoàn tất thủ tục thanh toán và kiểm tra phòng để tiến hành trả phòng.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface EarlyCheckInConfirmParams {
  guestName: string;
  roomNumber: string;
  scheduledDate: string;
  actualDate?: string;
  isEarly?: boolean;
  reservationCode?: string;
  note?: string;
}

export function formatEarlyCheckInConfirmHtml(params: EarlyCheckInConfirmParams): string {
  const {
    guestName,
    roomNumber,
    scheduledDate,
    actualDate,
    isEarly = true,
    reservationCode,
    note,
  } = params;

  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Khách nhận phòng</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>
        ${
          reservationCode
            ? `
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-amber-800">Mã đặt phòng</span>
            <span class="font-mono font-bold text-amber-900 text-xs">#${escapeHtml(reservationCode)}</span>
          </div>
        `
            : ""
        }
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Phòng gán</span>
          <span class="px-2.5 py-0.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-xs sm:text-sm">Phòng ${escapeHtml(roomNumber)}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Ngày dự kiến</span>
          <span class="font-bold text-slate-700 text-xs sm:text-sm">${escapeHtml(scheduledDate)}</span>
        </div>
        <div class="flex items-center justify-between text-xs pt-2 border-t border-amber-200">
          <span class="font-semibold text-amber-800">Nhận phòng thực tế</span>
          <span class="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-bold text-xs whitespace-nowrap">
            ${escapeHtml(actualDate || "Hôm nay")} • ${isEarly ? "Nhận sớm" : "Nhận trễ"}
          </span>
        </div>
      </div>
      <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-amber-900 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              (isEarly
                ? "Đơn đặt phòng đang được làm thủ tục nhận phòng trước ngày dự kiến. Bạn có chắc chắn muốn tiếp tục?"
                : "Đơn đặt phòng đã quá hạn nhận phòng dự kiến. Bạn có chắc chắn muốn tiếp tục làm thủ tục nhận phòng?"),
          )}
        </p>
      </div>
    </div>
  `;
}

export interface RoomDirtyWarningParams {
  roomNames: string | string[];
  note?: string;
}

export function formatRoomDirtyWarningHtml(params: RoomDirtyWarningParams): string {
  const { roomNames, note } = params;
  const formattedRooms = Array.isArray(roomNames) ? roomNames.join(", ") : roomNames;

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-3.5 sm:p-4 space-y-2 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Phòng cần lưu ý</span>
          <span class="px-2.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-bold text-xs whitespace-nowrap">Chờ dọn dẹp</span>
        </div>
        <div class="text-sm font-bold text-slate-900">
          ${escapeHtml(formattedRooms)}
        </div>
      </div>
      <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-amber-900 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5">⚠️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Phòng đang ở trạng thái Chờ dọn dẹp. Vui lòng xác nhận yêu cầu bộ phận buồng phòng hoàn tất dọn phòng trước khi tạo đặt phòng hoặc nhận phòng cho khách.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface RoomAssignmentConfirmParams {
  guestDisplayName: string;
  reservationCode: string;
  roomName: string;
  roomTypeName?: string | null;
  note?: string;
}

export function formatRoomAssignmentConfirmHtml(params: RoomAssignmentConfirmParams): string {
  const { guestDisplayName, reservationCode, roomName, roomTypeName, note } = params;
  const parsedGuest = parseGuestNameAndTag(guestDisplayName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-500">Khách hàng</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-500">Mã đặt phòng</span>
          <span class="font-mono font-bold text-slate-700 text-xs">#${escapeHtml(reservationCode)}</span>
        </div>
        ${
          roomTypeName
            ? `
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-500">Hạng phòng</span>
            <span class="font-medium text-slate-800 text-xs sm:text-sm">${escapeHtml(roomTypeName)}</span>
          </div>
        `
            : ""
        }
        <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
          <span class="font-semibold text-slate-500">Phòng gán</span>
          <span class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs sm:text-sm shadow-2xs">${escapeHtml(roomName)}</span>
        </div>
      </div>
      <div class="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-slate-600 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-sky-600">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Xác nhận gán phòng cho đơn đặt phòng. Hệ thống sẽ cập nhật trạng thái phòng trực tiếp lên sơ đồ buồng phòng.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface CancelReservationConfirmParams {
  guestName: string;
  reservationCode: string;
  roomNumber?: string | null;
  note?: string;
}

export function formatCancelReservationConfirmHtml(params: CancelReservationConfirmParams): string {
  const { guestName, reservationCode, roomNumber, note } = params;
  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-rose-200/90 bg-rose-50/60 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-rose-800">Khách hàng</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-200/80 text-rose-950 border border-rose-300 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-rose-800">Mã đặt phòng</span>
          <span class="font-mono font-bold text-rose-700 text-xs">#${escapeHtml(reservationCode)}</span>
        </div>

        ${
          roomNumber
            ? `
          <div class="flex items-center justify-between text-xs pt-2 border-t border-rose-200/80">
            <span class="font-semibold text-rose-800">Phòng giải phóng</span>
            <span class="font-bold text-rose-900 text-xs sm:text-sm">Phòng ${escapeHtml(roomNumber)}</span>
          </div>
        `
            : ""
        }
      </div>

      <div class="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-rose-900 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5">⚠️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Đơn đặt phòng sẽ bị hủy. Phòng đã gán (nếu có) sẽ được giải phóng ngay lập tức trên sơ đồ buồng phòng để sẵn sàng đón khách khác.",
          )}
        </p>
      </div>
    </div>
  `;
}

export interface NoShowConfirmParams {
  guestName: string;
  reservationCode: string;
  roomNumber?: string | null;
  note?: string;
}

export function formatNoShowConfirmHtml(params: NoShowConfirmParams): string {
  const { guestName, reservationCode, roomNumber, note } = params;
  const parsedGuest = parseGuestNameAndTag(guestName);

  return `
    <div class="w-full text-left space-y-3 font-sans pt-1">
      <div class="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Khách hàng</span>
          <div class="flex items-center gap-1.5 flex-wrap justify-end">
            <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(parsedGuest.name)}</strong>
            ${
              parsedGuest.tag
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">${escapeHtml(parsedGuest.tag)}</span>`
                : ""
            }
          </div>
        </div>

        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-amber-800">Mã đơn</span>
          <span class="font-mono font-bold text-amber-900 text-xs">#${escapeHtml(reservationCode)}</span>
        </div>

        ${
          roomNumber
            ? `
          <div class="flex items-center justify-between text-xs pt-2 border-t border-amber-200">
            <span class="font-semibold text-amber-800">Phòng giải phóng</span>
            <span class="font-bold text-amber-900 text-xs sm:text-sm">Phòng ${escapeHtml(roomNumber)}</span>
          </div>
        `
            : ""
        }
      </div>

      <div class="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-amber-900 text-xs sm:text-sm leading-relaxed shadow-2xs">
        <span class="text-base select-none mt-0.5 text-amber-700">ℹ️</span>
        <p class="text-pretty">
          ${escapeHtml(
            note ||
              "Xác nhận khách không đến nhận phòng theo lịch hẹn. Phòng đã gán sẽ được giải phóng ngay lập tức trên sơ đồ buồng phòng.",
          )}
        </p>
      </div>
    </div>
  `;
}

export function showConfirmDialog(options: ConfirmDialogOptions) {
  const isDanger =
    options.confirmVariant === "danger" ||
    (options.confirmVariant === undefined &&
      (options.icon === "warning" || options.icon === "error") &&
      /(?:xóa|hủy|ngắt|vô hiệu|thu hồi|đóng|xóa bỏ|delete|remove)/i.test(
        `${options.title} ${options.confirmText ?? ""}`,
      ));

  const resolvedHtml = options.html
    ? isTrustedAlertHtml(options.html)
      ? options.html.html
      : options.html
    : undefined;

  const popupClass =
    options.popupSize === "large"
      ? SWAL_POPUP_LARGE
      : options.popupSize === "medium"
        ? SWAL_POPUP_MEDIUM
        : options.popupSize === "standard"
          ? SWAL_POPUP_STANDARD
          : resolvedHtml
            ? SWAL_POPUP_MEDIUM
            : SWAL_POPUP_STANDARD;

  return SwalVietSage.fire({
    titleText: preventOrphans(options.title),
    text: resolvedHtml ? undefined : (options.text ? preventOrphans(options.text) : undefined),
    html: resolvedHtml,
    icon: options.icon ?? "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Xác nhận",
    cancelButtonText: options.cancelText ?? "Hủy bỏ",
    reverseButtons: options.reverseButtons ?? false,
    customClass: {
      popup: popupClass,
      title: SWAL_TITLE_CLASS,
      htmlContainer: resolvedHtml ? SWAL_HTML_CONTAINER_LEFT_CLASS : SWAL_HTML_CONTAINER_CLASS,
      confirmButton: isDanger ? SWAL_DANGER_BTN_CLASS : SWAL_CONFIRM_BTN_CLASS,
      cancelButton: SWAL_CANCEL_BTN_CLASS,
      actions: SWAL_ACTIONS_CLASS,
    },
  });
}

export function showWarningAlert(
  title: string,
  messageOrHtml: string | TrustedAlertHtml,
  options?: AlertOptions,
) {
  const content = resolveAlertContent(messageOrHtml);
  const isHtml = "html" in content;
  const timer =
    options?.timer === false
      ? undefined
      : options?.timer !== undefined
        ? options.timer
        : isHtml
          ? 4000
          : 2500;
  const timerProgressBar = timer !== undefined;
  return SwalVietSage.fire({
    titleText: preventOrphans(title),
    ...content,
    icon: "warning",
    timer,
    timerProgressBar,
    showConfirmButton: true,
    confirmButtonText: options?.confirmButtonText ?? "OK",
    showCancelButton: options?.showCancelButton ?? false,
    cancelButtonText: options?.cancelButtonText ?? "Hủy bỏ",
    reverseButtons: options?.reverseButtons ?? false,
    customClass: {
      popup: options?.customClass?.popup ?? (isHtml ? SWAL_POPUP_MEDIUM : SWAL_POPUP_STANDARD),
      title: options?.customClass?.title ?? SWAL_TITLE_CLASS,
      htmlContainer:
        options?.customClass?.htmlContainer ??
        (isHtml ? SWAL_HTML_CONTAINER_LEFT_CLASS : SWAL_HTML_CONTAINER_CLASS),
      confirmButton: options?.customClass?.confirmButton ?? SWAL_CONFIRM_BTN_CLASS,
      cancelButton: options?.customClass?.cancelButton ?? SWAL_CANCEL_BTN_CLASS,
      actions: options?.customClass?.actions ?? SWAL_ACTIONS_CLASS,
    },
  });
}
