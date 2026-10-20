<# :
@echo off
chcp 65001 >nul
title Deploy VPS VietSage (72.62.69.172)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('%~f0'))"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Deployment failed with exit code %ERRORLEVEL%!
)
echo.
pause
exit /b %ERRORLEVEL%
#>
# Automated deployment script for VietSage VPS (72.62.69.172)
$ErrorActionPreference = "Stop"

$VPS_HOST = "72.62.69.172"
$VPS_USER = "root"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ">>> Connecting via SSH to $VPS_USER@$VPS_HOST and deploying..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$remoteScript = @'
set -euo pipefail
cd /var/www/fullstack-vietSage

echo "=== [1/6] Syncing code from origin/master ==="
git fetch origin master
git checkout master
git pull origin master

COMMIT_HASH="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short HEAD)"
echo "Current commit on VPS: ${SHORT_COMMIT} (${COMMIT_HASH})"

# Update .release-images.env and .env to track current commit images
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

echo "=== [2/6] Verifying Production Topology & Migrations ==="
python3 scripts/verify-production-migration.py
python3 scripts/verify-production-topology.py

echo "=== [3/6] Building Fresh Docker Production Images ==="
export FRONTEND_BUILD_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose -f docker-compose.prod.yml build auth-service frontend
unset FRONTEND_BUILD_AUTH_SECRET

echo "=== [4/6] Running Database Migrations & Seeds ==="
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml run --rm seed

echo "=== [5/6] Starting / Updating Services ==="
docker compose -f docker-compose.prod.yml up -d

echo "=== [6/6] Verifying container health and live endpoints ==="
docker compose -f docker-compose.prod.yml ps

echo "Waiting 5 seconds for services to settle..."
sleep 5

echo "Testing health endpoint:"
curl -fsS https://vietsage.com/api/health
echo ""

echo "Testing marketing routes:"
curl -fsSI https://vietsage.com/giai-phap | head -n 3
curl -fsSI https://vietsage.com/gia | head -n 3
curl -fsSI https://vietsage.com/tich-hop | head -n 3

echo ""
echo "=========================================================="
echo ">>> All services deployed and verified successfully! <<<"
echo "=========================================================="
'@

try {
    # Send script safely via stdin to bash -s to avoid shell escaping issues
    $remoteScript | ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "bash -s"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n>>> Deployment completed 100% successfully! <<<" -ForegroundColor Green
    } else {
        Write-Host "`n>>> Deployment encountered an error (Exit Code: $LASTEXITCODE) <<<" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "`n[ERROR]: $_" -ForegroundColor Red
    exit 1
}
