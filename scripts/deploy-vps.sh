#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/fullstack-vietSage"
cd "$APP_DIR"

echo "=== [1/6] Đồng bộ Git commit mới nhất từ origin/master ==="
git fetch origin master
git checkout master
git pull origin master

COMMIT_HASH="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short HEAD)"
echo "Commit hiện tại: ${SHORT_COMMIT} (${COMMIT_HASH})"

# Cập nhật tag hình ảnh phiên bản mới trong .release-images.env và .env
if [ -f .release-images.env ]; then
  cp .release-images.env ".release-images.env.before-${SHORT_COMMIT}"
  sed -i "s|^AUTH_SERVICE_IMAGE=.*|AUTH_SERVICE_IMAGE=vietsage-auth-service:${COMMIT_HASH}|" .release-images.env
  sed -i "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=vietsage-frontend:${COMMIT_HASH}|" .release-images.env
fi

if [ -f .env ]; then
  cp .env ".env.before-${SHORT_COMMIT}"
  sed -i "s|^AUTH_SERVICE_IMAGE=.*|AUTH_SERVICE_IMAGE=vietsage-auth-service:${COMMIT_HASH}|" .env
  sed -i "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=vietsage-frontend:${COMMIT_HASH}|" .env
fi

echo "=== [2/6] Kiểm tra tĩnh Production Topology & Migrations ==="
python3 scripts/verify-production-migration.py
python3 scripts/verify-production-topology.py

echo "=== [3/6] Build Docker Production Images ==="
export FRONTEND_BUILD_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose -f docker-compose.prod.yml build auth-service frontend
unset FRONTEND_BUILD_AUTH_SECRET

echo "=== [4/6] Chạy Prisma Migration & Database Seed ==="
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml run --rm seed

echo "=== [5/6] Khởi động / Cập nhật Docker Compose Stack ==="
docker compose -f docker-compose.prod.yml up -d

echo "=== [6/6] Kiểm tra trạng thái Container & Endpoints Live ==="
docker compose -f docker-compose.prod.yml ps

echo "Kiểm tra /api/health..."
curl -fsS https://vietsage.com/api/health || curl -fsS http://127.0.0.1:8080/health

echo ""
echo "Kiểm tra Nginx Ingress & Routes mới..."
curl -fsSI https://stay.vietsage.com | head -n 5
curl -fsSI https://vietsage.com/giai-phap | head -n 5
curl -fsSI https://vietsage.com/gia | head -n 5
curl -fsSI https://vietsage.com/tich-hop | head -n 5

echo "=== Triển khai VPS hoàn tất thành công! ==="
