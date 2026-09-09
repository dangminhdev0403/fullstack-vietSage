from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import traceback
import uuid
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from open_mrz_engine import ENGINE

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HOST = "127.0.0.1"
MAX_UPLOAD = 50 * 1024 * 1024
BASE_DIR = Path(__file__).resolve().parent
ALLOWED_BROWSER_ORIGINS = {
    "https://vietsage.com",
    "https://www.vietsage.com",
    "https://stay.vietsage.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}

# Khống chế số lượng tác vụ OCR đồng thời để bảo vệ CPU & RAM dưới tải 10,000 requests
MAX_CONCURRENT_OCR = max(4, (os.cpu_count() or 4) * 2)
OCR_SEMAPHORE = threading.BoundedSemaphore(MAX_CONCURRENT_OCR)

# Bộ lưu trữ khách đã check-in (In-memory CRUD store)
SAVED_GUESTS: list[dict] = []
SAVED_GUESTS_LOCK = threading.Lock()

# Hàng đợi tác vụ ngầm (Async Job Queue) cho batch lớn (100 - 10,000 ảnh)
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def cleanup_old_jobs() -> None:
    """Xóa các job đã hoàn thành cũ hơn 1 giờ để giải phóng bộ nhớ."""
    now = time.time()
    with JOBS_LOCK:
        expired = [jid for jid, j in JOBS.items() if now - j.get("created_at", now) > 3600]
        for jid in expired:
            del JOBS[jid]


def run_async_batch_job(job_id: str, items: list[dict | str | bytes]) -> None:
    """Tác vụ nền xử lý batch ảnh lớn, cập nhật tiến độ liên tục."""
    try:
        cleanup_old_jobs()
        total = len(items)
        chunk_size = 8
        all_results = []
        successful = 0
        failed = 0

        for i in range(0, total, chunk_size):
            chunk = items[i:i + chunk_size]
            with OCR_SEMAPHORE:
                chunk_res = ENGINE.recognize_batch(chunk)
            for r in chunk_res.get("results", []):
                overall_idx = len(all_results) + 1
                r["index"] = overall_idx
                all_results.append(r)
                if r.get("success"):
                    successful += 1
                else:
                    failed += 1

            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id]["progress"] = len(all_results)
                    JOBS[job_id]["successful"] = successful
                    JOBS[job_id]["failed"] = failed

        failed_files = [
            {
                "index": r["index"],
                "filename": r["filename"],
                "error": r.get("error"),
                "message": r.get("message")
            }
            for r in all_results if not r.get("success")
        ]

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"] = "completed"
                JOBS[job_id]["progress"] = total
                JOBS[job_id]["successful"] = successful
                JOBS[job_id]["failed"] = failed
                JOBS[job_id]["failed_files"] = failed_files
                JOBS[job_id]["results"] = all_results
                JOBS[job_id]["completed_at"] = time.time()
    except Exception as e:
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"] = "failed"
                JOBS[job_id]["error"] = str(e)


def parse_multipart_files(body: bytes, content_type: str) -> list[dict]:
    """Bóc tách tất cả các tệp nhị phân từ multipart form data."""
    files = []
    boundary = None
    for part in content_type.split(";"):
        part = part.strip()
        if part.lower().startswith("boundary="):
            boundary = part.split("=", 1)[1].strip('"\'').encode("latin1")
            break

    if boundary:
        delimiter = b"--" + boundary
        chunks = body.split(delimiter)
        for chunk in chunks:
            chunk = chunk.strip(b"\r\n")
            if not chunk or chunk == b"--":
                continue
            if b"\r\n\r\n" in chunk:
                headers_raw, data = chunk.split(b"\r\n\r\n", 1)
                header_str = headers_raw.decode("latin1", errors="ignore")
                fname = None
                if 'filename="' in header_str:
                    fname = header_str.split('filename="', 1)[1].split('"', 1)[0]
                elif 'name="' in header_str:
                    fname = header_str.split('name="', 1)[1].split('"', 1)[0]
                if data:
                    files.append({
                        "filename": fname or f"upload_{len(files) + 1}.jpg",
                        "image": data
                    })

    if not files:
        try:
            raw_msg = b"Content-Type: " + content_type.encode("latin1", errors="ignore") + b"\r\n\r\n" + body
            msg = BytesParser(policy=default).parsebytes(raw_msg)
            for part in msg.iter_parts():
                payload = part.get_payload(decode=True)
                if payload:
                    fname = part.get_filename() or f"upload_{len(files) + 1}.jpg"
                    files.append({
                        "filename": fname,
                        "image": payload
                    })
        except Exception:
            pass

    return files



MOBILE_HTML = """<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Chụp Hộ chiếu / CCCD · Phòng 623</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { background: #f8fafc; color: #0f172a; padding: 16px; line-height: 1.4; }
.card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 18px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.header { text-align: center; margin-bottom: 16px; }
.header h1 { font-size: 18px; font-weight: 800; color: #0f172a; }
.header p { font-size: 13px; color: #64748b; margin-top: 2px; }
.badge-room { display: inline-block; background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 12px; padding: 3px 10px; border-radius: 20px; margin-top: 4px; border: 1px solid #bfdbfe; }
.btn-snap { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 52px; background: #2563eb; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(37,99,235,0.3); }
.btn-snap:active { transform: scale(0.98); background: #1d4ed8; }
.btn-gallery { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 44px; background: white; color: #334155; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 14px; font-weight: 600; margin-top: 8px; cursor: pointer; }
.result-box { margin-top: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; }
.result-title { font-size: 13px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.result-field { font-size: 14px; margin-bottom: 6px; }
.result-field strong { color: #0f172a; }
.status-pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
.status-pill.success { background: #dcfce7; color: #15803d; }
.status-pill.error { background: #fee2e2; color: #b91c1c; }
.loading { text-align: center; padding: 20px; color: #2563eb; font-weight: 700; display: none; }
</style>
</head>
<body>

<div class="card header">
  <h1>📱 Máy quét Hộ chiếu / CCCD Di Động</h1>
  <span class="badge-room">Phòng 623 · Family Suite</span>
  <p style="margin-top:8px">Chụp ảnh Hộ chiếu hoặc CCCD để gửi thẳng vào luồng OCR check-in máy lễ tân.</p>
</div>

<div class="card">
  <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display:none" onchange="handleMobileUpload(this.files[0])">
  <input type="file" id="galleryInput" accept="image/*" style="display:none" onchange="handleMobileUpload(this.files[0])">

  <button type="button" class="btn-snap" onclick="document.getElementById('cameraInput').click()">
    📷 Mở máy ảnh chụp ngay
  </button>
  <button type="button" class="btn-gallery" onclick="document.getElementById('galleryInput').click()">
    🖼️ Chọn ảnh từ thư viện
  </button>

  <div class="loading" id="loadingDiv">
    🔄 Đang phân tích ảnh qua OCR… Vui lòng đợi trong giây lát.
  </div>

  <div id="resultContainer" style="display:none"></div>
</div>

<script>
async function handleMobileUpload(file) {
  if (!file) return;
  const loading = document.getElementById('loadingDiv');
  const resBox = document.getElementById('resultContainer');
  loading.style.display = 'block';
  resBox.style.display = 'none';

  const formData = new FormData();
  formData.append('files', file, file.name || 'mobile_snap.jpg');

  try {
    const res = await fetch('/ocr/batch', {
      method: 'POST',
      headers: { 'X-OCR-Request': '1' },
      body: formData
    }).then(r => r.json());

    loading.style.display = 'none';
    if (res.results && res.results.length > 0) {
      const r = res.results[0];
      const d = r.data || {};
      resBox.className = 'result-box';
      resBox.style.display = 'block';
      if (r.success) {
        try {
          await fetch('/api/guests/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: d.full_name || '',
              documentNumber: d.document_number || '',
              birthDate: d.birth_date || '',
              nationality: d.nationality || d.nationality_code || 'Việt Nam',
              residencePlace: d.residence_place || 'Việt Nam',
              gender: (d.gender === 'Female [F]' || d.gender_code === 'F') ? 'Nữ' : 'Nam',
              filename: file.name || 'mobile_snap.jpg',
              status: d.is_valid ? 'valid' : 'warning',
              message: r.message || d.format_note || ''
            })
          });
        } catch (_) {}

        resBox.innerHTML = `
          <div class="result-title">✓ Nhận diện thành công & Đã gửi máy lễ tân</div>
          <div class="result-field">Họ tên: <strong>${d.full_name || '—'}</strong></div>
          <div class="result-field">Số giấy tờ: <strong>${d.document_number || '—'}</strong></div>
          <div class="result-field">Ngày sinh: <strong>${d.birth_date || '—'}</strong></div>
          <div class="result-field">Quốc tịch: <strong>${d.nationality || d.nationality_code || 'Việt Nam'}</strong></div>
          <p style="font-size:12px;color:#166534;margin-top:8px">🎉 Dữ liệu đã được tự động thêm vào danh sách check-in phòng 623.</p>
        `;
      } else {
        resBox.className = 'result-box';
        resBox.style.background = '#fef2f2';
        resBox.style.borderColor = '#fecaca';
        resBox.innerHTML = `
          <div class="result-title" style="color:#b91c1c">⚠ Không nhận diện được thông tin</div>
          <p style="font-size:13px;color:#7f1d1d">${r.message || 'Vui lòng chụp rõ nét phần mã MRZ ở dưới hộ chiếu hoặc mã QR trên thẻ CCCD.'}</p>
        `;
      }
    }
  } catch (err) {
    loading.style.display = 'none';
    alert('Lỗi kết nối máy chủ: ' + err.message);
  }
}
</script>
</body>
</html>
"""

HTML = """<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Check-in Phòng 623 · Family Suite - OpenMRZ VietSage</title>
<style>
:root {
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-light: #eff6ff;
  --primary-border: #bfdbfe;
  --bg: #f8fafc;
  --card-bg: #ffffff;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --border-focus: #3b82f6;
  --success: #16a34a;
  --success-bg: #f0fdf4;
  --success-border: #bbf7d0;
  --warning: #d97706;
  --warning-bg: #fffbeb;
  --warning-border: #fde68a;
  --danger: #dc2626;
  --danger-bg: #fef2f2;
  --danger-border: #fecaca;
  --radius-lg: 16px;
  --radius-md: 10px;
  --radius-sm: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text-main);
  line-height: 1.5;
  padding: 24px 16px;
}
.modal-container {
  max-width: 880px;
  margin: 0 auto;
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0,0,0,0.03);
  padding: 24px 28px;
  border: 1px solid rgba(226, 232, 240, 0.8);
}

/* TOP HEADER */
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.header-icon {
  width: 44px;
  height: 44px;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.header-icon svg { width: 24px; height: 24px; fill: currentColor; }
.header-title-box h1 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.01em;
}
.header-title-box p {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.security-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--primary-light);
  border: 1px solid var(--primary-border);
  color: #1e40af;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}
.security-badge svg { width: 15px; height: 15px; fill: var(--primary); flex-shrink: 0; }
.btn-close-modal {
  background: none;
  border: none;
  font-size: 22px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  transition: color 0.15s;
}
.btn-close-modal:hover { color: #334155; }

/* INGESTION SECTION (Segmented Switch & Compact Box) */
.ingestion-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 14px 0 8px;
}
.ingestion-segmented {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 3px;
  gap: 4px;
}
.seg-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.seg-btn:hover { color: #0f172a; }
.seg-btn.active {
  background: white;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.ingestion-box-wrap {
  max-width: 100%;
  margin: 0 auto 10px;
}
.dropzone-card {
  border: 2px dashed #93c5fd;
  background: #f0f7ff;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.dropzone-card:hover, .dropzone-card.dragover {
  border-color: var(--primary);
  background: #eff6ff;
  transform: translateY(-1px);
}
.cloud-icon-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cloud-icon-circle svg { width: 18px; height: 18px; fill: currentColor; }
.dropzone-card strong { font-size: 14px; font-weight: 700; color: #1e293b; }
.dropzone-card p { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

.phone-card {
  border: 1px solid var(--border);
  background: white;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  gap: 12px;
}
.phone-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.phone-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.phone-icon-box svg { width: 18px; height: 18px; }
.phone-card strong { font-size: 14px; font-weight: 700; color: #1e293b; }
.phone-card p { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.btn-qr-display {
  background: white;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.btn-qr-display:hover { background: var(--primary-light); }


.btn-subtle-promote {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-subtle-promote:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

/* TABLE TOOLBAR */
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.table-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.table-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.guest-count-pill {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 700;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 20px;
}
.table-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search-input {
  height: 42px;
  padding: 8px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  width: 440px;
  min-width: 340px;
  outline: none;
}
.search-input:focus { border-color: var(--border-focus); }
.status-select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  background: white;
  color: var(--text-main);
  outline: none;
}
.btn-outline-primary {
  background: white;
  border: 1px solid var(--primary);
  color: var(--primary);
  height: 42px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
}
.btn-outline-primary:hover { background: var(--primary-light); }
.btn-outline-danger {
  background: white;
  border: 1px solid #fca5a5;
  color: #dc2626;
  height: 42px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
}
.btn-outline-danger:hover { background: #fee2e2; }

/* INLINE EDITABLE TABLE (Larger Readable Fonts) */
.table-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-x: auto;
  background: white;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
  text-align: left;
}
th {
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 800;
  font-size: 15px;
  padding: 12px 14px;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
td {
  padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}
tr:hover td { background: #fbfcfe; }
tr.row-warning td { background: #fffdf5; }
tr.row-error td { background: #fff5f5; }

/* CELL INPUTS (Larger, High-legibility) */
.cell-input {
  width: 100%;
  height: 42px;
  padding: 8px 12px;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
  background: white;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cell-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}
.cell-input.uppercase { text-transform: uppercase; font-family: monospace; font-weight: 700; }
.cell-select {
  height: 42px;
  padding: 8px 10px;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  background: white;
  color: #0f172a;
  outline: none;
}
.cell-select:focus { border-color: #2563eb; }

/* REFINED STATUS DOT (Clean indicator, not a chunky button) */
.status-dot-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.status-dot-badge .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot-badge.valid { color: #16a34a; }
.status-dot-badge.valid .dot { background: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2); }
.status-dot-badge.warning { color: #d97706; }
.status-dot-badge.warning .dot { background: #d97706; box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.2); }
.status-dot-badge.error { color: #dc2626; }
.status-dot-badge.error .dot { background: #dc2626; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2); }

/* ACTION BUTTON */
.btn-icon-action {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  color: #94a3b8;
  border-radius: 6px;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-icon-action.delete:hover { background: #fee2e2; color: #dc2626; }
.btn-icon-action svg { width: 16px; height: 16px; fill: currentColor; }

/* FOOTER BAR */
.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.footer-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-muted);
}
.footer-summary strong { color: var(--text-main); font-weight: 700; }
.footer-actions-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-secondary {
  background: white;
  border: 1px solid var(--border);
  color: #334155;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-primary {
  background: #2563eb;
  border: none;
  color: white;
  padding: 9px 22px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  transition: background 0.15s;
}
.btn-primary:hover { background: #1d4ed8; }

/* PROGRESS OVERLAY */
.progress-bar-wrap {
  width: 100%;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
  margin: 12px 0;
  display: none;
}
.progress-bar-fill {
  height: 100%;
  width: 0%;
  background: #2563eb;
  transition: width 0.2s;
}

/* DIALOG */
dialog {
  margin: auto;
  border: none;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  max-width: 500px;
  width: 90%;
  padding: 0;
  outline: none;
}
dialog::backdrop { background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(3px); }
.dialog-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dialog-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); }
.dialog-body { padding: 22px 24px; font-size: 14px; text-align: center; }
.dialog-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #f8fafc;
  border-radius: 0 0 16px 16px;
}
.qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 14px;
}
.qr-code-svg { width: 170px; height: 170px; }
</style>
</head>
<body>

<div class="modal-container">
  <!-- TOP HEADER (Clean Title, No noisy guides) -->
  <header class="header-row">
    <div class="header-left">
      <div class="header-icon">
        <svg viewBox="0 0 24 24"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-7 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm6 11H6v-1c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1z"/></svg>
      </div>
      <div class="header-title-box">
        <h1>Check-in Phòng 623 · Family Suite</h1>
        <p>Quét hoặc tải ảnh hộ chiếu / CCCD để tự động trích xuất thông tin khách</p>
      </div>
    </div>
    <div class="header-right">
      <div class="security-badge">
        <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
        <span>Bảo mật PII · Không lưu trữ ảnh trên máy chủ</span>
      </div>
      <button type="button" class="btn-close-modal" title="Đóng" onclick="handleReset()">✕</button>
    </div>
  </header>

  <!-- INGESTION SECTION (Segmented Switch & Compact Box) -->
  <section class="ingestion-toolbar">
    <div class="ingestion-segmented">
      <button type="button" class="seg-btn active" id="segUpload" onclick="switchIntake('upload')">
        <svg style="width:14px;height:14px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        Chọn file ảnh
      </button>
      <button type="button" class="seg-btn" id="segMobile" onclick="switchIntake('mobile')">
        <svg style="width:14px;height:14px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01"/></svg>
        Quét bằng điện thoại
      </button>
    </div>
  </section>

  <div class="ingestion-box-wrap">
    <!-- DROPZONE (Clickable card without redundant button) -->
    <div class="dropzone-card" id="dropzone" onclick="fileInput.click()">
      <div class="cloud-icon-circle">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
      </div>
      <div>
        <strong>Kéo thả hoặc nhấn vào đây để chọn ảnh hộ chiếu / CCCD</strong>
        <p>Hỗ trợ JPG, PNG, WEBP (tối đa 50 ảnh, mỗi ảnh ≤ 15MB)</p>
      </div>
      <input type="file" id="fileInput" multiple accept="image/jpeg,image/png,image/bmp,image/webp" style="display:none">
    </div>

    <!-- PHONE SCAN -->
    <div class="phone-card" id="phoneCard" style="display:none;">
      <div class="phone-card-left">
        <div class="phone-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="3"></rect><path d="M9 18h6"></path><path d="M9 6h6"></path><path d="M10 10h4v4h-4z"></path></svg>
        </div>
        <div>
          <strong>Quét từ điện thoại</strong>
          <p>Dùng điện thoại quét mã QR để chụp ảnh gửi trực tiếp vào bảng danh sách.</p>
        </div>
      </div>
      <button type="button" class="btn-qr-display" onclick="openQrModal()">
        <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm13-2h3v2h-3zm-5 0h2v5h-2zm2 2h3v3h-3zm3 3h3v3h-3zm-5 0h2v3h-2z"/></svg>
        Hiển thị mã QR
      </button>
    </div>
  </div>

  <!-- PROGRESS BAR -->
  <div class="progress-bar-wrap" id="progressBarWrap">
    <div class="progress-bar-fill" id="progressBarFill"></div>
  </div>

  <!-- TABLE TOOLBAR -->
  <div class="table-toolbar">
    <div class="table-toolbar-left">
      <h2 class="table-title">Danh sách khách</h2>
      <span class="guest-count-pill" id="guestCountBadge">0 khách</span>
    </div>
    <div class="table-toolbar-right">
      <input type="text" class="search-input" id="searchInput" placeholder="Tìm theo tên, số CCCD / Hộ chiếu..." oninput="handleFilterChange()">
      <button type="button" class="btn-outline-primary" onclick="addManualGuest()">
        <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        + Thêm khách
      </button>
      <button type="button" class="btn-outline-primary" id="btnPromotePrimary" style="display:none;color:#b45309;border-color:#fcd34d;background:#fffbeb" onclick="promoteSelectedToPrimary()">
        ⭐ Đặt làm đại diện
      </button>
      <button type="button" class="btn-outline-danger" onclick="deleteSelectedGuests()">
        <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        Xóa đã chọn
      </button>
    </div>
  </div>

  <!-- INLINE EDITABLE MULTI-GUEST TABLE -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:36px;text-align:center"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this.checked)"></th>
          <th style="width:45px">#</th>
          <th style="min-width:170px">Họ và tên *</th>
          <th style="min-width:130px">Số CCCD / Hộ chiếu *</th>
          <th style="min-width:130px">Quốc tịch</th>
          <th style="min-width:160px">Quê quán / Địa chỉ</th>
          <th style="width:140px">Ngày sinh <div style="font-size:10px;color:#94a3b8;font-weight:normal">ngày/tháng/năm</div></th>
          <th style="width:100px">Giới tính</th>
          <th style="width:60px;text-align:center">Xóa</th>
        </tr>
      </thead>
      <tbody id="guestsTableBody">
        <tr>
          <td colspan="9" style="text-align:center;padding:36px 12px;color:#94a3b8">
            Chưa có khách nào. Hãy kéo thả ảnh hộ chiếu/CCCD vào ô phía trên hoặc bấm "+ Thêm khách".
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- FOOTER (Clean, No Sample File Button) -->
  <footer class="footer-row">
    <div class="footer-summary">
      <span id="footerGuestSummary" style="font-size:16px;font-weight:700;color:var(--text-main)">Đang hiển thị <strong>0 khách</strong></span>
    </div>

    <div class="footer-actions-group">
      <button type="button" class="btn-secondary" onclick="handleReset()">Hủy</button>
      <button type="button" class="btn-primary" id="btnSaveAll" onclick="saveAllGuests()">
        <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        Hoàn tất check-in
      </button>
    </div>
  </footer>
</div>

<!-- QR CODE MODAL -->
<dialog id="qrModal">
  <div class="dialog-header">
    <h3>📱 Quét hoặc chụp Hộ chiếu / CCCD từ điện thoại</h3>
    <button type="button" class="btn-close-modal" onclick="qrModal.close()">✕</button>
  </div>
  <div class="dialog-body">
    <div class="qr-container">
      <div id="qrCodeContainer" style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">
        <svg class="qr-code-svg" viewBox="0 0 100 100">
          <path d="M10 10h30v30h-30z M15 15h20v20h-20z M20 20h10v10h-10z M60 10h30v30h-30z M65 15h20v20h-20z M70 20h10v10h-10z M10 60h30v30h-30z M15 65h20v20h-20z M20 70h10v10h-10z M50 15h5v5h-5z M50 25h5v5h-5z M45 45h10v10h-10z M60 50h5v10h-5z M70 50h10v5h-10z M85 50h5v15h-5z M60 70h10v5h-10z M50 80h10v10h-10z M75 80h15v10h-15z" fill="#1e293b"/>
        </svg>
      </div>
      <span style="font-size:12px;font-weight:700;color:#2563eb;margin-top:8px">Phòng 623 · Family Suite</span>
    </div>
    <p style="font-size:13px;color:#334155;line-height:1.5;margin-bottom:8px">
      Mở camera điện thoại quét mã QR hoặc truy cập trực tiếp đường link bên dưới để chụp ảnh gửi vào luồng OCR:
    </p>
    <a id="mobileLinkAnchor" href="/mobile" target="_blank" style="font-size:13px;font-weight:700;color:#2563eb;word-break:break-all">
      Mở trang chụp điện thoại: /mobile
    </a>
  </div>
  <div class="dialog-footer">
    <button type="button" class="btn-primary" onclick="qrModal.close()">Đóng</button>
  </div>
</dialog>

<script>
// ISO to readable text nationality mapper
const CODE_TO_TEXT_NATIONALITY = {
  'VNM': 'Việt Nam',
  'VN': 'Việt Nam',
  'KOR': 'Hàn Quốc',
  'USA': 'Hoa Kỳ',
  'CHN': 'Trung Quốc',
  'JPN': 'Nhật Bản',
  'GBR': 'Vương quốc Anh',
  'FRA': 'Pháp',
  'DEU': 'Đức',
  'RUS': 'Nga',
  'AUS': 'Úc',
  'CAN': 'Canada',
  'SGP': 'Singapore',
  'THA': 'Thái Lan',
  'MYS': 'Malaysia',
  'IDN': 'Indonesia',
  'PHL': 'Philippines',
  'IND': 'Ấn Độ',
  'TWN': 'Đài Loan'
};

function formatNationalityText(val) {
  if (!val) return 'Việt Nam';
  const clean = val.trim();
  const up = clean.toUpperCase();
  return CODE_TO_TEXT_NATIONALITY[up] || clean;
}

// STATE MANAGEMENT
let guests = [];
let selectedIds = new Set();
let nextGuestId = 1;

// INITIAL RENDERING
function renderTable() {
  const tbody = document.querySelector('#guestsTableBody');
  const searchVal = document.querySelector('#searchInput').value.trim().toLowerCase();

  const filtered = guests.filter(g => {
    return !searchVal ||
      (g.fullName || '').toLowerCase().includes(searchVal) ||
      (g.documentNumber || '').toLowerCase().includes(searchVal) ||
      (g.residencePlace || '').toLowerCase().includes(searchVal);
  });

  document.querySelector('#guestCountBadge').textContent = `${guests.length} khách`;
  document.querySelector('#footerGuestSummary').innerHTML = `Hiển thị <strong>${guests.length} khách</strong>`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:36px 12px;color:#94a3b8">
          ${guests.length === 0
            ? 'Chưa có khách nào. Hãy kéo thả ảnh hộ chiếu/CCCD vào ô phía trên hoặc bấm "+ Thêm khách".'
            : 'Không tìm thấy khách nào khớp với bộ lọc.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach((g, idx) => {
    const tr = document.createElement('tr');
    if (g.status === 'warning') tr.className = 'row-warning';
    if (g.status === 'error') tr.className = 'row-error';

    const isChecked = selectedIds.has(g.id);

    // Gender select
    const genderSelectHtml = `
      <select class="cell-select" onchange="updateGuestField(${g.id}, 'gender', this.value)">
        <option value="Nam" ${g.gender === 'Nam' ? 'selected' : ''}>Nam</option>
        <option value="Nữ" ${g.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
        <option value="Khác" ${g.gender === 'Khác' ? 'selected' : ''}>Khác</option>
      </select>
    `;

    // Refined status dot (Clean indicator)
    let statusDotHtml = '';
    if (g.status === 'valid') {
      statusDotHtml = `<span class="status-dot-badge valid"><span class="dot"></span> Hợp lệ</span>`;
    } else if (g.status === 'warning') {
      statusDotHtml = `<span class="status-dot-badge warning" title="${escapeHtml(g.message || 'Cần kiểm tra')}"><span class="dot"></span> Cần kiểm tra</span>`;
    } else {
      statusDotHtml = `<span class="status-dot-badge error" title="${escapeHtml(g.message || 'Lỗi nhận diện')}"><span class="dot"></span> Không hợp lệ</span>`;
    }

    const isPrimary = idx === 0;
    const rowNumHtml = isPrimary
      ? `1<div style="font-size:10px;color:#2563eb;font-weight:700">Đại diện</div>`
      : `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
           <span>${idx + 1}</span>
           <button type="button" class="btn-subtle-promote" onclick="promoteGuestToPrimary(${g.id})" title="Chuyển lên làm khách đại diện">
             ⭐ Đặt làm đại diện
           </button>
         </div>`;

    tr.innerHTML = `
      <td style="text-align:center">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectGuest(${g.id}, this.checked)">
      </td>
      <td style="color:#64748b;font-weight:600">
        ${rowNumHtml}
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(g.fullName || '')}" placeholder="NGUYEN VAN A" oninput="updateGuestField(${g.id}, 'fullName', this.value)">
      </td>
      <td>
        <input type="text" class="cell-input uppercase" value="${escapeHtml(g.documentNumber || '')}" placeholder="B12345678" oninput="updateGuestField(${g.id}, 'documentNumber', this.value)">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(g.nationality || 'Việt Nam')}" placeholder="Việt Nam" onchange="updateGuestField(${g.id}, 'nationality', this.value)">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(g.residencePlace || '')}" placeholder="Quê quán / Địa chỉ" oninput="updateGuestField(${g.id}, 'residencePlace', this.value)">
      </td>
      <td>
        <div style="position:relative;display:flex;align-items:center">
          <input
            type="text"
            inputmode="numeric"
            class="cell-input"
            id="dob_${g.id}"
            value="${escapeHtml(formatDisplayDate(g.birthDate || ''))}"
            placeholder="dd/mm/yyyy"
            maxlength="10"
            oninput="handleDobInput(${g.id}, this)"
            onblur="handleDobBlur(${g.id}, this)"
            style="padding-right:26px"
          >
          <input
            type="date"
            id="picker_${g.id}"
            value="${escapeHtml(formatIsoDate(g.birthDate || ''))}"
            style="position:absolute;opacity:0;width:0;height:0;pointer-events:none"
            tabindex="-1"
            onchange="handlePickerChange(${g.id}, this.value)"
          >
          <button
            type="button"
            tabindex="-1"
            onclick="const p=document.getElementById('picker_${g.id}');if(p.showPicker)p.showPicker();else p.focus();"
            title="Chọn ngày trên lịch"
            style="position:absolute;right:4px;background:none;border:none;cursor:pointer;color:#94a3b8;padding:2px;display:flex;align-items:center"
          >
            <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </button>
        </div>
      </td>
      <td>${genderSelectHtml}</td>
      <td style="text-align:center">
        <button type="button" class="btn-icon-action delete" title="Xóa dòng này" onclick="deleteGuest(${g.id})">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDisplayDate(val) {
  if (!val) return '';
  val = String(val).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(val);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val);
  if (dmy) {
    return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  }
  return val;
}

function formatIsoDate(val) {
  if (!val) return '';
  val = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
}

function handleDobInput(id, inputEl) {
  let val = inputEl.value.replace(/[^\d/]/g, '');
  if (/^\d{2}$/.test(val) && inputEl.dataset.prevLen === '1') {
    val += '/';
  } else if (/^\d{2}\/\d{2}$/.test(val) && inputEl.dataset.prevLen === '4') {
    val += '/';
  }
  inputEl.dataset.prevLen = String(inputEl.value.length);
  inputEl.value = val;
  updateGuestField(id, 'birthDate', val);
}

function handleDobBlur(id, inputEl) {
  const digits = inputEl.value.replace(/\D/g, '');
  if (digits.length === 8) {
    const formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    inputEl.value = formatted;
    updateGuestField(id, 'birthDate', formatted);
  }
}

function handlePickerChange(id, isoVal) {
  const displayVal = formatDisplayDate(isoVal);
  const inputEl = document.getElementById(`dob_${id}`);
  if (inputEl) inputEl.value = displayVal;
  updateGuestField(id, 'birthDate', displayVal);
}

// CRUD OPERATIONS
function addManualGuest() {
  const newGuest = {
    id: nextGuestId++,
    fullName: '',
    documentNumber: '',
    nationality: 'Việt Nam',
    residencePlace: '',
    birthDate: '',
    gender: 'Nam',
    status: 'warning',
    message: 'Khách thêm thủ công, vui lòng nhập đầy đủ thông tin.',
    isManual: true,
  };
  guests.push(newGuest);
  renderTable();
}

function updateGuestField(id, field, value) {
  const g = guests.find(item => item.id === id);
  if (!g) return;
  g[field] = value;
  if (g.fullName && g.fullName.trim().length > 2 && g.documentNumber && g.documentNumber.trim().length >= 6) {
    if (g.status === 'error' || g.isManual) {
      g.status = 'valid';
    }
  }
}


function promoteGuestToPrimary(id) {
  const idx = guests.findIndex(g => g.id === id);
  if (idx <= 0) return;
  const [promoted] = guests.splice(idx, 1);
  guests.unshift(promoted);
  selectedIds.clear();
  updateToolbarActions();
  renderTable();
}

function promoteSelectedToPrimary() {
  if (selectedIds.size !== 1) return;
  const [selId] = Array.from(selectedIds);
  promoteGuestToPrimary(selId);
}

function updateToolbarActions() {
  const btn = document.querySelector('#btnPromotePrimary');
  if (!btn) return;
  if (selectedIds.size === 1) {
    const [selId] = Array.from(selectedIds);
    const idx = guests.findIndex(g => g.id === selId);
    if (idx > 0) {
      btn.style.display = 'inline-flex';
      return;
    }
  }
  btn.style.display = 'none';
}

function deleteGuest(id) {
  guests = guests.filter(g => g.id !== id);
  selectedIds.delete(id);
  renderTable();
}

function deleteSelectedGuests() {
  if (selectedIds.size === 0) {
    alert('Vui lòng chọn ít nhất một khách để xóa.');
    return;
  }
  if (!confirm(`Xóa ${selectedIds.size} khách đã chọn?`)) return;
  guests = guests.filter(g => !selectedIds.has(g.id));
  selectedIds.clear();
  document.querySelector('#selectAllCheckbox').checked = false;
  renderTable();
}

function toggleSelectAll(checked) {
  if (checked) {
    guests.forEach(g => selectedIds.add(g.id));
  } else {
    selectedIds.clear();
  }
  updateToolbarActions();
  renderTable();
}

function toggleSelectGuest(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateToolbarActions();
}

function handleFilterChange() {
  renderTable();
}

function handleReset() {
  if (guests.length > 0 && !confirm('Hủy và làm mới danh sách check-in phòng này?')) return;
  guests = [];
  selectedIds.clear();
  renderTable();
}

// DRAG & DROP AND FILE UPLOAD
const dropzone = document.querySelector('#dropzone');
const fileInput = document.querySelector('#fileInput');
const progressBarWrap = document.querySelector('#progressBarWrap');
const progressBarFill = document.querySelector('#progressBarFill');

['dragenter', 'dragover'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length) handleFiles(files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFiles(fileInput.files);
  fileInput.value = '';
});

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  progressBarWrap.style.display = 'block';
  progressBarFill.style.width = '10%';

  const formData = new FormData();
  files.forEach(f => formData.append('files', f, f.name));

  try {
    progressBarFill.style.width = '40%';
    const res = await fetch('/ocr/batch', {
      method: 'POST',
      headers: { 'X-OCR-Request': '1' },
      body: formData
    }).then(r => r.json());

    progressBarFill.style.width = '90%';

    if (res.results && Array.isArray(res.results)) {
      res.results.forEach(r => {
        const d = r.data || {};
        let status = 'valid';
        if (!r.success) status = 'error';
        else if (!d.is_valid) status = 'warning';

        let gGender = 'Nam';
        if (d.gender === 'Female [F]' || d.gender_code === 'F') gGender = 'Nữ';

        const docNum = (d.document_number || '').trim();
        const fullName = (d.full_name || '').trim();
        const nat = formatNationalityText(d.nationality || d.nationality_code || 'Việt Nam');

        // Check duplicate ("không trùng"):
        const existingIdx = guests.findIndex(g => {
          if (docNum && g.documentNumber && g.documentNumber.toLowerCase() === docNum.toLowerCase()) return true;
          if (fullName && g.fullName && g.fullName.toLowerCase() === fullName.toLowerCase()) return true;
          return false;
        });

        // If placeholder guest exists, fill it first
        if (guests.length === 1 && guests[0].fullName === 'NGUYEN VAN A' && !guests[0].filename) {
          guests[0] = {
            id: guests[0].id,
            filename: r.filename,
            fullName: fullName || guests[0].fullName,
            documentNumber: docNum || guests[0].documentNumber,
            nationality: nat,
            residencePlace: d.residence_place || guests[0].residencePlace,
            birthDate: d.birth_date || guests[0].birthDate,
            gender: gGender,
            status: status,
            message: r.message || d.format_note || '',
            data: d,
            rawResult: r
          };
          return;
        }

        if (existingIdx !== -1) {
          // Update existing guest without duplicate
          const g = guests[existingIdx];
          if (fullName) g.fullName = fullName;
          if (docNum) g.documentNumber = docNum;
          if (nat) g.nationality = nat;
          if (d.residence_place) g.residencePlace = d.residence_place;
          if (d.birth_date) g.birthDate = d.birth_date;
          if (gGender) g.gender = gGender;
          g.status = status;
          g.message = r.message || d.format_note || '';
        } else {
          // AUTO ADD NEW GUEST
          guests.push({
            id: nextGuestId++,
            filename: r.filename,
            fullName: fullName,
            documentNumber: docNum,
            nationality: nat,
            residencePlace: d.residence_place || '',
            birthDate: d.birth_date || '',
            gender: gGender,
            status: status,
            message: r.message || d.format_note || '',
            data: d,
            rawResult: r
          });
        }
      });
    }

    progressBarFill.style.width = '100%';
    setTimeout(() => { progressBarWrap.style.display = 'none'; }, 400);
    renderTable();
  } catch (err) {
    progressBarWrap.style.display = 'none';
    alert('Lỗi khi tải ảnh: ' + err.message);
  }
}

// INTAKE SWITCH (Chọn file vs Quét điện thoại)
function switchIntake(mode) {
  const isUpload = mode === 'upload';
  document.getElementById('segUpload').classList.toggle('active', isUpload);
  document.getElementById('segMobile').classList.toggle('active', !isUpload);
  document.getElementById('dropzone').style.display = isUpload ? 'flex' : 'none';
  document.getElementById('phoneCard').style.display = !isUpload ? 'flex' : 'none';
}

// QR MODAL
const qrModal = document.querySelector('#qrModal');
function openQrModal() {
  qrModal.showModal();
}

// SAVE TO BACKEND CRUD
async function saveAllGuests() {
  if (guests.length === 0) {
    alert("Danh sách khách đang trống! Vui lòng tải ảnh hoặc bấm '+ Thêm khách' trước khi hoàn tất.");
    return;
  }

  const btn = document.querySelector("#btnSaveAll");
  btn.disabled = true;
  btn.textContent = "Đang lưu check-in...";

  try {
    const res = await fetch("/api/guests/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guests: guests })
    }).then(r => r.json());

    if (res.success) {
      alert(`🎉 Hoàn tất check-in thành công cho ${guests.length} khách phòng 623!`);
    } else {
      alert("Lỗi khi lưu danh sách: " + (res.message || "Thất bại"));
    }
  } catch (err) {
    alert("Lỗi kết nối máy chủ: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg> Hoàn tất check-in`;
  }
}

// DEFAULT GUEST FOR ROOM 623
window.addEventListener('DOMContentLoaded', () => {
  guests = [
    {
      id: nextGuestId++,
      fullName: 'NGUYEN VAN A',
      documentNumber: 'B12345678',
      nationality: 'Việt Nam',
      residencePlace: 'Hoàn Kiếm, Hà Nội',
      birthDate: '1990-01-01',
      gender: 'Nam',
      status: 'valid',
      message: 'MRZ hợp lệ',
    }
  ];
  renderTable();
});

// DESKTOP REALTIME SYNC (Auto-adds mobile uploads without duplicate)
let lastSyncedCount = 0;
async function pollMobileSync() {
  try {
    const res = await fetch('/api/guests/sync').then(r => r.json());
    if (res.success && Array.isArray(res.guests) && res.guests.length > lastSyncedCount) {
      lastSyncedCount = res.guests.length;
      res.guests.forEach(remoteG => {
        const docNum = (remoteG.documentNumber || '').trim().toLowerCase();
        const fName = (remoteG.fullName || '').trim().toLowerCase();
        const exists = guests.some(g => {
          if (docNum && (g.documentNumber || '').trim().toLowerCase() === docNum) return true;
          if (fName && (g.fullName || '').trim().toLowerCase() === fName) return true;
          return false;
        });
        if (!exists) {
          // If first guest is default placeholder, fill it
          if (guests.length === 1 && guests[0].fullName === 'NGUYEN VAN A' && !guests[0].filename) {
            guests[0] = { ...remoteG, id: guests[0].id };
          } else {
            guests.push({ ...remoteG, id: nextGuestId++ });
          }
        }
      });
      renderTable();
    }
  } catch {}
}
setInterval(pollMobileSync, 2500);

</script>

</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _browser_origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin in ALLOWED_BROWSER_ORIGINS

    def _set_cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_BROWSER_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-VietSage-OCR, X-OCR-Request")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")

    def do_OPTIONS(self) -> None:
        if not self._browser_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def send_json(self, status_code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path in ("/mobile", "/phone", "/m"):
            body = MOBILE_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._set_cors()
            self.end_headers()
            self.wfile.write(body)
            return

        if clean_path in ("", "/index.html", "/ui", "/checkin"):
            body = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._set_cors()
            self.end_headers()
            self.wfile.write(body)
            return

        if clean_path in ("/health", "/api/health"):
            self.send_json(200, {
                "status": "healthy",
                "service": "open-mrz-server",
                "engine": "OpenMRZ (Apache 2.0 / BSD)",
                "concurrency_limit": MAX_CONCURRENT_OCR,
                "saved_guests_count": len(SAVED_GUESTS)
            })
            return

        if clean_path in ("/api/guests/sync", "/sync"):
            with SAVED_GUESTS_LOCK:
                self.send_json(200, {
                    "success": True,
                    "total": len(SAVED_GUESTS),
                    "guests": SAVED_GUESTS
                })
            return

        if clean_path in ("/api/guests", "/guests"):
            with SAVED_GUESTS_LOCK:
                self.send_json(200, {
                    "success": True,
                    "total": len(SAVED_GUESTS),
                    "guests": SAVED_GUESTS
                })
            return

        if clean_path.startswith("/ocr/jobs/") or clean_path.startswith("/api/mrz/jobs/"):
            job_id = clean_path.split("/")[-1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job:
                self.send_json(404, {"success": False, "error": "JOB_NOT_FOUND", "message": f"Không tìm thấy tác vụ có mã {job_id}."})
                return
            self.send_json(200, {"success": True, **job})
            return

        self.send_error(404)

    def do_POST(self) -> None:
        if not self._browser_origin_allowed():
            self.send_json(403, {"success": False, "error": "ORIGIN_NOT_ALLOWED", "message": "Nguồn yêu cầu không được phép."})
            return
        clean_path = self.path.split("?")[0].rstrip("/")
        VALID_ROUTES = (
            "/ocr", "/api/mrz", "/vietsage/mrz",
            "/ocr/batch", "/api/mrz/batch",
            "/ocr/jobs", "/api/mrz/jobs",
            "/api/guests/save", "/api/guests/clear", "/api/guests/add"
        )
        if clean_path not in VALID_ROUTES:
            self.send_json(404, {"success": False, "error": "NOT_FOUND", "message": f"Đường dẫn {self.path} không tồn tại."})
            return

        try:
            size = int(self.headers.get("Content-Length", ""))
        except ValueError:
            size = 0
        if size <= 0:
            self.send_json(200, {"success": False, "error": "EMPTY_PAYLOAD", "message": "Dữ liệu tải lên rỗng (0 byte)."})
            return
        if size > MAX_UPLOAD:
            self.send_json(200, {"success": False, "error": "PAYLOAD_TOO_LARGE", "message": "Kích thước dữ liệu vượt quá giới hạn 50MB."})
            return

        body = self.rfile.read(size)
        raw_content_type = self.headers.get("Content-Type", "")
        content_type = raw_content_type.lower()
        is_job_route = clean_path in ("/ocr/jobs", "/api/mrz/jobs")
        is_batch_route = clean_path.endswith("/batch") or is_job_route or clean_path == "/vietsage/mrz"

        try:
            # 1. Trường hợp JSON
            if "application/json" in content_type or body.strip().startswith(b"{") or body.strip().startswith(b"["):
                try:
                    payload = json.loads(body.decode("utf-8"))
                except Exception:
                    self.send_json(200, {"success": False, "error": "INVALID_JSON", "message": "Dữ liệu JSON gửi lên không hợp lệ."})
                    return

                # CRUD: Lưu danh sách khách vào hệ thống
                if clean_path == "/api/guests/save":
                    incoming_guests = payload.get("guests") or (payload if isinstance(payload, list) else [])
                    with SAVED_GUESTS_LOCK:
                        SAVED_GUESTS.clear()
                        for g in incoming_guests:
                            SAVED_GUESTS.append(g)
                    self.send_json(200, {
                        "success": True,
                        "saved_count": len(incoming_guests),
                        "message": f"Đã lưu thành công {len(incoming_guests)} khách vào hệ thống check-in đoàn!"
                    })
                    return

                if clean_path == "/api/guests/clear":
                    with SAVED_GUESTS_LOCK:
                        SAVED_GUESTS.clear()
                    self.send_json(200, {"success": True, "message": "Đã làm trống danh sách khách lưu trữ."})
                    return

                if clean_path == "/api/guests/add":
                    new_g = payload if isinstance(payload, dict) else {}
                    doc_num = (new_g.get("documentNumber") or "").strip().lower()
                    full_name = (new_g.get("fullName") or "").strip().lower()
                    with SAVED_GUESTS_LOCK:
                        exists = any(
                            (doc_num and (g.get("documentNumber") or "").strip().lower() == doc_num) or
                            (full_name and (g.get("fullName") or "").strip().lower() == full_name)
                            for g in SAVED_GUESTS
                        )
                        if not exists:
                            SAVED_GUESTS.append(new_g)
                    self.send_json(200, {"success": True, "message": "Đã thêm khách mới", "total": len(SAVED_GUESTS)})
                    return

                # Kiểm tra xem có phải batch payload không
                batch_items = None
                if isinstance(payload, list):
                    batch_items = payload
                elif isinstance(payload, dict):
                    if "images" in payload and isinstance(payload["images"], list):
                        batch_items = payload["images"]
                    elif "files" in payload and isinstance(payload["files"], list):
                        batch_items = payload["files"]
                    elif "paths" in payload and isinstance(payload["paths"], list):
                        batch_items = payload["paths"]

                if is_job_route:
                    if not batch_items:
                        self.send_json(200, {"success": False, "error": "EMPTY_BATCH", "message": "Danh sách ảnh tải lên rỗng."})
                        return
                    job_id = uuid.uuid4().hex
                    with JOBS_LOCK:
                        JOBS[job_id] = {
                            "job_id": job_id,
                            "status": "processing",
                            "progress": 0,
                            "total": len(batch_items),
                            "successful": 0,
                            "failed": 0,
                            "created_at": time.time(),
                        }
                    threading.Thread(target=run_async_batch_job, args=(job_id, batch_items), daemon=True).start()
                    self.send_json(202, {
                        "success": True,
                        "job_id": job_id,
                        "status": "processing",
                        "total": len(batch_items),
                        "check_url": f"/ocr/jobs/{job_id}",
                        "message": f"Đã tiếp nhận {len(batch_items)} tài liệu vào hàng đợi xử lý ngầm."
                    })
                    return

                if is_batch_route or batch_items is not None:
                    if not batch_items:
                        self.send_json(200, {"success": False, "error": "EMPTY_BATCH", "message": "Danh sách ảnh tải lên rỗng."})
                        return
                    with OCR_SEMAPHORE:
                        res = ENGINE.recognize_batch(batch_items)
                    self.send_json(200, res)
                    return

                # Xử lý trường hợp ảnh đơn lẻ
                img_input = (
                    payload.get("image")
                    or payload.get("img")
                    or payload.get("base64")
                    or payload.get("url")
                    or payload.get("image_url")
                    or payload.get("image_path")
                    or payload.get("path")
                    or payload.get("file")
                )
                if not img_input:
                    self.send_json(200, {"success": False, "error": "MISSING_FIELD", "message": "Yêu cầu thiếu trường dữ liệu ảnh (image / url / path / file)."})
                    return
                with OCR_SEMAPHORE:
                    res = ENGINE.recognize_image(img_input)
                self.send_json(200, res)
                return

            # 2. Trường hợp Multipart Form-data
            elif "multipart/form-data" in content_type:
                files = parse_multipart_files(body, raw_content_type)
                if not files:
                    self.send_json(200, {"success": False, "error": "EMPTY_PAYLOAD", "message": "Không tìm thấy tệp ảnh nào trong dữ liệu gửi lên."})
                    return

                if is_job_route:
                    job_id = uuid.uuid4().hex
                    with JOBS_LOCK:
                        JOBS[job_id] = {
                            "job_id": job_id,
                            "status": "processing",
                            "progress": 0,
                            "total": len(files),
                            "successful": 0,
                            "failed": 0,
                            "created_at": time.time(),
                        }
                    threading.Thread(target=run_async_batch_job, args=(job_id, files), daemon=True).start()
                    self.send_json(202, {
                        "success": True,
                        "job_id": job_id,
                        "status": "processing",
                        "total": len(files),
                        "check_url": f"/ocr/jobs/{job_id}",
                        "message": f"Đã tiếp nhận {len(files)} tài liệu vào hàng đợi xử lý ngầm."
                    })
                    return

                with OCR_SEMAPHORE:
                    if is_batch_route or len(files) > 1:
                        raw_batch = ENGINE.recognize_batch(files)
                    else:
                        single_res = ENGINE.recognize_image(files[0]["image"])
                        raw_batch = {"results": [{"index": 1, "filename": files[0]["filename"], **single_res}]}

                # Chuẩn hóa đầu ra nếu gọi từ VietSage (/vietsage/mrz)
                if clean_path == "/vietsage/mrz":
                    formatted = []
                    for r in raw_batch.get("results", []):
                        if r.get("success"):
                            d = r.get("data", {})
                            doc_num = d.get("document_number") or ""
                            full_name = d.get("full_name") or ""
                            b_date = d.get("birth_date") or None
                            gender_str = "Nam" if d.get("gender_code") == "M" or d.get("gender") == "Male [M]" else ("Nữ" if d.get("gender_code") == "F" or d.get("gender") == "Female [F]" else None)
                            nat_val = d.get("nationality") or d.get("nationality_code") or "Việt Nam"
                            formatted.append({
                                "success": True,
                                "index": r.get("index"),
                                "filename": r.get("filename"),
                                "documentKind": "passport",
                                "format": d.get("format", "TD3"),
                                "mrzValid": bool(d.get("is_valid", False)),
                                "identityNumber": doc_num,
                                "fullName": full_name,
                                "dateOfBirth": b_date,
                                "gender": gender_str,
                                "nationality": nat_val,
                                "residencePlace": d.get("residence_place"),
                                "expiryDate": d.get("expiry_date"),
                                "guestDisplayName": full_name,
                                "guestIdentityNumber": doc_num,
                                "guestDateOfBirth": b_date,
                                "guestGender": gender_str,
                                "guestNationality": nat_val,
                                "guestResidencePlace": d.get("residence_place"),
                            })
                        else:
                            formatted.append({
                                "success": False,
                                "index": r.get("index"),
                                "filename": r.get("filename"),
                                "code": r.get("error", "PARSE_FAILED"),
                                "error": r.get("message", "Không thể nhận diện MRZ từ tài liệu này"),
                            })
                    self.send_json(200, {"results": formatted})
                    return

                self.send_json(200, raw_batch)
                return

            # 3. Trường hợp Raw Bytes trực tiếp
            else:
                with OCR_SEMAPHORE:
                    res = ENGINE.recognize_image(body)
                self.send_json(200, res)
                return

        except Exception as error:
            print(f"❌ [LỖI SERVER KHÔNG XÁC ĐỊNH / SERVER UNKNOWN_ERROR]: {error}", file=sys.stderr)
            traceback.print_exc()
            self.send_json(200, {
                "success": False,
                "error": "UNKNOWN_ERROR",
                "message": f"Đã xảy ra lỗi không xác định trên máy chủ: {str(error)}"
            })

    def log_message(self, *_: object) -> None:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Open MRZ Server — OCR hộ chiếu & QR CCCD")
    parser.add_argument("--port", type=int, default=8787, help="Cổng lắng nghe (mặc định: 8787)")
    parser.add_argument("--host", type=str, default=HOST, help="Địa chỉ bind (mặc định: 127.0.0.1, dùng 0.0.0.0 cho VPS)")
    args = parser.parse_args()
    bind_host = args.host
    port = args.port
    server = None
    ThreadingHTTPServer.allow_reuse_address = True
    while port < args.port + 100:
        try:
            server = ThreadingHTTPServer((bind_host, port), Handler)
            server.daemon_threads = True
            break
        except OSError:
            print(f"⚠️ Cổng {port} đang bận, thử cổng {port + 1}...")
            port += 1
    if not server:
        raise RuntimeError("Không tìm thấy cổng trống để khởi động máy chủ.")
    print(f"🚀 Open MRZ Server đang chạy tại: http://{bind_host}:{port}")
    print(f"   -> Giao diện: Check-in Phòng 623 · Family Suite")
    print(f"   -> Tương thích: Standalone Web UI + VietSage API (/vietsage/mrz)")
    if bind_host == "0.0.0.0":
        print(f"   -> ⚠️  Đang bind 0.0.0.0 — có thể truy cập từ mạng ngoài")
    server.serve_forever()


if __name__ == "__main__":
    main()
