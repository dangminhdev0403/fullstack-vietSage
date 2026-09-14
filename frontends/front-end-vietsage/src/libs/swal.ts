import Swal from "sweetalert2";

export const SwalVietSage = Swal.mixin({
  customClass: {
    popup: "rounded-[2.2rem] bg-white p-7 shadow-2xl border border-gray-100 max-w-lg w-full",
    title: "text-2xl md:text-3xl font-extrabold text-[#18211d] text-center mb-3 tracking-tight",
    htmlContainer: "text-base font-medium text-gray-700 text-center mb-5 leading-relaxed",
    confirmButton:
      "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-7 text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[130px]",
    cancelButton:
      "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-base font-bold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer mx-1.5 min-w-[100px]",
    actions: "flex items-center justify-center gap-3 mt-4",
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

  // 2. Mark date ranges or dates (YYYY-MM-DD)
  marked = marked.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_match, date) => {
    return `___HL_DATE___${date}___HL_END___`;
  });

  // 3. Escape HTML
  let escaped = escapeHtml(marked);

  // 4. Restore highlights with styled tags
  escaped = escaped.replace(/___HL_QUOTE___(.*?)___HL_END___/g, (_m, content) => {
    return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-bold text-slate-900 bg-white border border-slate-200/90 shadow-2xs">${content}</span>`;
  });

  escaped = escaped.replace(/___HL_DATE___(.*?)___HL_END___/g, (_m, date) => {
    return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-semibold text-slate-800 bg-white/80 border border-slate-200/80">${date}</span>`;
  });

  return escaped;
}

export function formatAlertErrorMessage(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return `<p class="text-center text-slate-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  let text = raw.trim();
  if (!text) {
    return `<p class="text-center text-slate-600">Đã xảy ra lỗi không xác định.</p>`;
  }

  // 1. Extract guidance / advice at the end (e.g., "Vui lòng...", "Xin vui lòng...", "Lưu ý:...", "Hướng dẫn:...")
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

  // 2. Check for grouped error patterns: "Bản khai báo X:", "Hồ sơ X:", "Dòng X:", "Lỗi X:", "Mục X:"
  const prefixGroupPattern =
    /(?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s+(\d+|[A-Za-z0-9_-]+)\s*:/i;
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
        /^((?:Bản khai báo|Hồ sơ|Dòng|Lỗi|Mục)\s*(?:\d+|[A-Za-z0-9_-]+))\s*:\s*(.*)$/i,
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
          groups.size > 0 ? Array.from(groups.keys()).pop()! : "Chi tiết";
        if (!groups.has(defaultKey)) groups.set(defaultKey, []);
        groups.get(defaultKey)!.push(chunk);
      }
    }

    let html = `<div class="space-y-3.5 text-left text-[15px] sm:text-base leading-relaxed text-slate-700">`;

    for (const [groupLabel, items] of groups.entries()) {
      html += `<div class="rounded-2xl border border-red-200/80 bg-red-50/70 p-4 space-y-2.5 shadow-2xs">`;
      html += `  <div class="flex items-center gap-2 font-bold text-red-900 text-sm sm:text-base">`;
      html += `    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-800 text-xs font-black">!</span>`;
      html += `    <span>${escapeHtml(groupLabel)}</span>`;
      html += `  </div>`;

      if (items.length === 1) {
        html += `  <p class="text-red-950 pl-7 text-[15px] sm:text-base leading-relaxed">${formatTextContent(items[0])}</p>`;
      } else {
        html += `  <ul class="space-y-2 pl-3">`;
        for (const item of items) {
          html += `    <li class="flex items-start gap-2.5 text-red-950 text-[15px] sm:text-base">`;
          html += `      <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>`;
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

  // 3. Bullet points or line-breaks
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

    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700">`;
    html += `<div class="rounded-2xl border border-red-200/80 bg-red-50/70 p-4 space-y-2.5">`;
    if (title) {
      html += `  <div class="flex items-center gap-2 font-bold text-red-900 text-sm sm:text-base">`;
      html += `    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-800 text-xs font-black">!</span>`;
      html += `    <span>${escapeHtml(title)}</span>`;
      html += `  </div>`;
    }
    html += `<ul class="space-y-2 ${title ? "pl-3" : ""}">`;
    for (const line of itemLines) {
      const cleaned = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
      html += `  <li class="flex items-start gap-2.5 text-red-950">`;
      html += `    <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>`;
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

  // 4. Semicolon-separated multiple items
  const semiItems = text.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  if (semiItems.length >= 2) {
    let html = `<div class="space-y-3 text-left text-[15px] sm:text-base leading-relaxed text-slate-700">`;
    html += `<div class="rounded-2xl border border-red-200/80 bg-red-50/70 p-4 space-y-2">`;
    html += `<ul class="space-y-2">`;
    for (const item of semiItems) {
      html += `  <li class="flex items-start gap-2.5 text-red-950">`;
      html += `    <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"></span>`;
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

  // 5. Single / Simple message with guidance
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

  // 6. Pure single text
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

  return SwalVietSage.fire({
    title,
    html: htmlContent,
    icon: "error",
    showConfirmButton: true,
    confirmButtonText: "OK",
    customClass: {
      popup:
        "rounded-[2.2rem] bg-white p-7 shadow-2xl border border-gray-100 max-w-xl w-full",
      title:
        "text-2xl md:text-3xl font-extrabold text-[#18211d] text-center mb-3 tracking-tight",
      htmlContainer:
        "text-base font-medium text-gray-700 text-center mb-5 leading-relaxed",
      confirmButton:
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-7 text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 transition-all hover:bg-[#1a352d] cursor-pointer mx-1.5 min-w-[130px]",
      cancelButton:
        "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-base font-bold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer mx-1.5 min-w-[100px]",
      actions: "flex items-center justify-center gap-3 mt-4",
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
