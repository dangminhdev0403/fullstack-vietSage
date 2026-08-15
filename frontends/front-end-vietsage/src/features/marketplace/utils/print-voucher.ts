import { toast } from "sonner";

export type PrintVoucherData = {
  voucherCode: string;
  guestDisplayName: string;
  roomNumber: string;
  providerDisplayName: string;
  orderNumber: string;
  serviceName: string;
  quantity: number;
  totalAmount: number | string;
  currency: string;
  guestNote?: string | null;
  items?: Array<{ serviceName: string; quantity: number; unitPrice: number | string }>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function printMarketplaceVoucherTicket(data: PrintVoucherData) {
  if (typeof window === "undefined") return;

  const popup = window.open("", "_blank", "width=750,height=850");
  if (!popup) {
    toast.error("Vui lòng cho phép trình duyệt bật cửa sổ mới (popup) để in phiếu dịch vụ.");
    return;
  }

  const logoUrl = `${window.location.origin}/brand/vietsage-logo.jpg`;

  const issuedAt = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const numericAmount = typeof data.totalAmount === "number" ? data.totalAmount : Number(data.totalAmount || 0);
  const formattedPrice = Number.isFinite(numericAmount) ? numericAmount.toLocaleString("vi-VN") : String(data.totalAmount);
  const serviceRows = data.items?.length
    ? data.items.map((item) => `<div class="service-line"><strong>${escapeHtml(item.serviceName)}</strong><span>${item.quantity} × ${Number(item.unitPrice).toLocaleString("vi-VN")} ${data.currency}</span></div>`).join("")
    : `<div class="service-title">${data.serviceName}</div>`;
  const noteSection = data.guestNote?.trim()
    ? `<div class="note-card">📝 <strong>Ghi chú từ khách:</strong> "${data.guestNote.trim()}"</div>`
    : "";

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Phiếu dịch vụ ${data.voucherCode} - VietSage</title>
  <style>
    @page { size: auto; margin: 10mm; }
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a !important;
      background: #ffffff !important;
      margin: 0;
      padding: 20px;
    }
    .ticket-container {
      max-width: 620px;
      margin: 0 auto;
      border: 2px solid #0f172a;
      border-radius: 16px;
      padding: 28px;
      background: #ffffff;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
    }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px dashed #cbd5e1;
      padding-bottom: 18px;
      margin-bottom: 20px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      height: 44px;
      width: auto;
      object-fit: contain;
      border-radius: 8px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      color: #00003c;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .ticket-badge {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #6ee7b7;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .voucher-card {
      background: #00003c;
      color: #ffffff;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .voucher-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .voucher-code {
      font-size: 32px;
      font-weight: 900;
      font-family: "Courier New", Courier, monospace;
      color: #f59e0b !important;
      letter-spacing: 3px;
      line-height: 1;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .info-card {
      border: 1.5px solid #0f172a;
      border-radius: 12px;
      padding: 14px 16px;
      background: #ffffff;
    }
    .card-label {
      font-size: 11px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .card-value-main {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
    }
    .card-value-sub {
      font-size: 13px;
      color: #334155;
      font-weight: 700;
    }
    .service-card {
      border: 2px solid #00003c;
      border-radius: 12px;
      padding: 16px 20px;
      background: #f8fafc;
      margin-bottom: 20px;
    }
    .service-title {
      font-size: 18px;
      font-weight: 900;
      color: #00003c;
      margin-bottom: 10px;
    }
    .service-line {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      border-bottom: 1px dashed #cbd5e1;
      font-size: 14px;
    }
    .service-line:last-of-type { border-bottom: 0; }
    .service-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      font-size: 14px;
    }
    .service-price {
      font-size: 18px;
      font-weight: 900;
      color: #047857;
    }
    .note-card {
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      color: #92400e;
      margin-bottom: 18px;
    }
    .footer-note {
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      font-size: 12px;
      font-weight: 700;
      color: #475569;
    }
    .footer-time {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="ticket-container">
    <div class="brand-header">
      <div class="brand-left">
        <img src="${logoUrl}" alt="VietSage Logo" class="brand-logo" />
        <div>
          <div class="brand-title">VietSage</div>
          <div class="brand-sub">Hospitality Operating System</div>
        </div>
      </div>
      <div class="ticket-badge">Phiếu Dịch Vụ</div>
    </div>

    <div class="voucher-card">
      <div>
        <div class="voucher-label">Mã Phiếu Dịch Vụ</div>
        <div class="voucher-code">${data.voucherCode}</div>
      </div>

    </div>

    <div class="grid-2">
      <div class="info-card">
        <span class="card-label">👤 Khách Hàng & Phòng</span>
        <div class="card-value-main">${data.guestDisplayName}</div>
        <div class="card-value-sub">Phòng ${data.roomNumber}</div>
      </div>
      <div class="info-card">
        <span class="card-label">🏨 Đối Tác Cung Cấp</span>
        <div class="card-value-main">${data.providerDisplayName}</div>
        <div class="card-value-sub" style="font-size:11px;font-family:monospace;">Mã đơn: ${data.orderNumber}</div>
      </div>
    </div>

    <div class="service-card">
      <span class="card-label">🎟️ Chi Tiết Dịch Vụ</span>
      ${serviceRows}
      <div class="service-meta">
        <div>Số lượng: <strong>${data.quantity}</strong></div>
        <div class="service-price">Tổng tiền: ${formattedPrice} ${data.currency}</div>
      </div>
    </div>

    ${noteSection}

    <div class="footer-note">
      <div>🎫 <strong>ĐÃ PHÁT HÀNH PHIẾU DỊCH VỤ</strong></div>
      <div>Vui lòng xuất trình hình hoặc đọc mã voucher này khi sử dụng dịch vụ với đối tác.</div>
      <div class="footer-time">Thời gian phát hành: ${issuedAt}</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
