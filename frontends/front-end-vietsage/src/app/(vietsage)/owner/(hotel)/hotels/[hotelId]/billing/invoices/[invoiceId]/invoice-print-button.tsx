"use client";

import Swal from "sweetalert2";

type InvoicePrintButtonProps = {
  label?: string;
};

function getInvoiceFileName(invoice: Element): string {
  const invoiceCode = invoice.querySelector("h1")?.textContent?.trim() || "invoice";
  return `${invoiceCode.replace(/[\\/:*?"<>|]+/g, "-")}.doc`;
}

function buildWordHtml(invoiceHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice</title>
  <style>
    @page WordSection1 { size: 210mm 297mm; margin: 12mm; }
    body {
      margin: 0;
      color: #0f172a;
      background: #ffffff;
      font-family: Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
    }
    .invoice-a4 {
      width: 186mm;
      max-width: 186mm;
      margin: 0 auto;
      background: #ffffff;
      color: #0f172a;
      box-shadow: none !important;
      border: 0 !important;
    }
    header,
    section {
      page-break-inside: avoid;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.1;
    }
    h2 {
      margin: 0;
      font-size: 15px;
    }
    p,
    dl,
    dd,
    dt {
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9px;
    }
    th,
    td {
      border-bottom: 1px solid #d8dee9;
      padding: 5px 4px;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      font-size: 8px;
      text-transform: uppercase;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-black,
    .font-bold {
      font-weight: 700;
    }
    .text-emerald-800 {
      color: #065f46;
    }
    .bg-slate-50,
    .bg-slate-100 {
      background: #f8fafc;
    }
    .border,
    .border-b,
    .border-t,
    .border-y {
      border-color: #d8dee9;
    }
  </style>
</head>
<body>
  ${invoiceHtml}
</body>
</html>`;
}

function downloadWordInvoice() {
  const invoice = document.querySelector(".invoice-a4");
  if (!invoice) {
    throw new Error("Không tìm thấy nội dung hóa đơn để xuất.");
  }

  const wordHtml = buildWordHtml(invoice.outerHTML);
  const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getInvoiceFileName(invoice);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function InvoicePrintButton({ label = "Xuất Word" }: InvoicePrintButtonProps) {
  async function confirmAndExportWord() {
    const result = await Swal.fire({
      icon: "question",
      title: "Xuất hóa đơn sang Word?",
      text: "Hệ thống sẽ tải file .doc từ nội dung hóa đơn đang hiển thị.",
      showCancelButton: true,
      confirmButtonText: "Xuất Word",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
    });

    if (result.isConfirmed) {
      try {
        downloadWordInvoice();
      } catch (error) {
        await Swal.fire({
          icon: "error",
          title: "Không thể xuất hóa đơn",
          text: error instanceof Error ? error.message : "Vui lòng thử lại.",
          confirmButtonText: "Đã hiểu",
          confirmButtonColor: "#0f766e",
        });
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void confirmAndExportWord()}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(0,0,60,0.16)] transition hover:-translate-y-0.5 print:hidden"
    >
      {label}
    </button>
  );
}
