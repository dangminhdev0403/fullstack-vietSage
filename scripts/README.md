# Danh mục Scripts Dự án VietSage

Tài liệu hướng dẫn và phân loại các script trong thư mục `scripts/`:

| Script | Mục đích & Mô tả | Môi trường / Cách dùng |
| :--- | :--- | :--- |
| **`deploy-vps.bat`** | **Triển khai tự động VPS** (6 bước: git pull, verify, build Docker, migrate, restart, health check). Đã đóng gói all-in-one hybrid Batch + PowerShell. | Click đúp chuột trong Explorer hoặc gõ `.\scripts\deploy-vps.bat` |
| **`verify-ui-rules.cjs`** | Quét kiểm định tĩnh toàn bộ UI / JSX / CSS theo chuẩn Typography và thiết kế (font >= 12px, text-balance, text-pretty, anti-fluff). | `node scripts/verify-ui-rules.cjs` |
| **`verify-production-topology.py`** | Kiểm tra an toàn mạng và bảo mật cho Docker Compose (`docker-compose.prod.yml`). Bắt buộc trong CI Gate. | `python scripts/verify-production-topology.py` |
| **`verify-production-migration.py`** | Kiểm tra tính bất biến và an toàn của Prisma Migrations trên môi trường Production. Bắt buộc trong CI Gate. | `python scripts/verify-production-migration.py` |
| **`init-secrets.sh`** | Khởi tạo cấu trúc các file biến môi trường và bí mật rỗng mẫu cho môi trường CI / Docker mới. | `bash scripts/init-secrets.sh` |
| **`capture-qa-window.ps1`** | Tiện ích chụp ảnh cửa sổ phục vụ bộ kiểm thử tự động QA Windows (sử dụng trong CI `qa-capture`). | Chạy tự động trong GitHub Actions |
| **`backup-n8n-volume.sh`** | Tiện ích sao lưu an toàn volume dữ liệu n8n workflow trên máy chủ Linux. | Dành cho quản trị viên hệ thống |
