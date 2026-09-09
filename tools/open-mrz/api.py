"""
Open MRZ RESTful API Server (JSON in -> JSON out)
Bilingual: Tieng Anh + Tieng Viet khong dau (English + Non-accented Vietnamese)
100% Permissive Open-Source (OpenCV Morphology + Tesseract 5.4 OCR-B, Apache 2.0 / BSD / MIT)
0 AGPL, 0 copyleft, 0 DLL dong, 0 co che trial, 0 rui ro ban quyen.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from open_mrz_engine import ENGINE

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HOST = "127.0.0.1"
DEFAULT_PORT = 8787
MAX_PAYLOAD = 15 * 1024 * 1024  # 15 MB


def process_image_bytes(data: bytes) -> dict:
    return ENGINE.recognize_image(data)


def process_image_base64(b64_string: str) -> dict:
    return ENGINE.recognize_base64(b64_string)


class ApiHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/health", "/api/health"):
            self.send_json(200, {
                "status": "healthy",
                "service": "open-mrz-api",
                "engine": "open-mrz-cleanroom",
                "version": "2.0.0"
            })
            return

        self.send_json(200, {
            "name": "Open MRZ OCR API (100% Clean-Room Open-Source)",
            "usage": "POST /api/mrz with JSON { 'image': '<base64>' } or { 'image_path': '<path>' }",
            "endpoints": {
                "POST /api/mrz": "Nhan dien va boc tach MRZ tu JSON / Recognize and parse MRZ from JSON",
                "GET /health": "Kiem tra trang thai server / Health check"
            }
        })

    def do_POST(self) -> None:
        if self.path not in ("/api/mrz", "/api/ocr", "/ocr"):
            self.send_json(404, {"success": False, "error": f"Duong dan {self.path} khong ton tai / Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            content_length = 0

        if content_length <= 0 or content_length > MAX_PAYLOAD:
            self.send_json(413, {"success": False, "error": f"Payload phai tu 1 byte den {MAX_PAYLOAD // (1024*1024)} MB"})
            return

        body = self.rfile.read(content_length)
        content_type = self.headers.get("Content-Type", "").lower()

        try:
            # 1. Truong hop Client gui JSON: { "image": "base64..." } hoac { "image_path": "..." }
            if "application/json" in content_type or body.strip().startswith(b"{"):
                try:
                    payload = json.loads(body.decode("utf-8"))
                except Exception:
                    self.send_json(400, {"success": False, "error": "JSON body khong hop le / Invalid JSON"})
                    return

                if "image" in payload or "image_base64" in payload:
                    b64_str = payload.get("image") or payload.get("image_base64")
                    res = process_image_base64(b64_str)
                    self.send_json(200, res)
                    return

                if "image_path" in payload or "path" in payload:
                    file_path = Path(payload.get("image_path") or payload.get("path"))
                    if not file_path.is_file():
                        self.send_json(400, {"success": False, "error": f"File khong ton tai / File not found: {file_path.name}"})
                        return
                    res = process_image_bytes(file_path.read_bytes())
                    self.send_json(200, res)
                    return

                self.send_json(400, {"success": False, "error": "Thieu truong 'image' (base64) hoac 'image_path' trong JSON"})
                return

            # 2. Truong hop Client gui file binary truc tiep
            res = process_image_bytes(body)
            self.send_json(200, res)

        except (ValueError, RuntimeError, FileNotFoundError) as err:
            self.send_json(422, {"success": False, "error": str(err)})
        except Exception as err:
            self.send_json(500, {"success": False, "error": f"Loi he thong / System error: {str(err)}"})

    def log_message(self, format: str, *args: object) -> None:
        # Khong ghi log thong tin ca nhan / request body de bao mat
        pass


def run_api_server(port: int = DEFAULT_PORT) -> None:
    server = None
    curr_port = port
    while curr_port < port + 50:
        try:
            server = ThreadingHTTPServer((HOST, curr_port), ApiHandler)
            break
        except OSError:
            curr_port += 1

    if not server:
        raise RuntimeError("Khong the mo port cho server API / Failed to bind port")

    print(f"🚀 Open MRZ JSON API dang chay tai: http://{HOST}:{curr_port}")
    print(f"   -> Engine:       100% Ma Nguon Mo (ONNX Segmentation + Tesseract 5.4)")
    print(f"   -> Endpoint POST: http://{HOST}:{curr_port}/api/mrz")
    print(f"   -> Healthcheck:   http://{HOST}:{curr_port}/health")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Open MRZ RESTful API Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port lắng nghe (default 8787)")
    args = parser.parse_args()
    run_api_server(args.port)
