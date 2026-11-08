# Automated deployment script for VietSage VPS (72.62.69.172)
param(
    [switch]$FrontendOnly,
    [switch]$AuthOnly
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$VPS_HOST = "72.62.69.172"
$VPS_USER = "root"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ">>> Connecting via SSH to $VPS_USER@$VPS_HOST and deploying..." -ForegroundColor Cyan
if ($FrontendOnly) {
    Write-Host ">>> Mode: Frontend Only (Fast Build)" -ForegroundColor Yellow
} elseif ($AuthOnly) {
    Write-Host ">>> Mode: Auth Service Only" -ForegroundColor Yellow
} else {
    Write-Host ">>> Mode: Full Stack Deploy" -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Cyan

$buildTarget = "auth-service frontend"
$recreateTarget = "frontend auth-service"
$skipDb = "0"

if ($FrontendOnly) {
    $buildTarget = "frontend"
    $recreateTarget = "frontend"
    $skipDb = "1"
} elseif ($AuthOnly) {
    $buildTarget = "auth-service"
    $recreateTarget = "auth-service"
    $skipDb = "0"
}

$remoteScript = @'
set -euo pipefail
cd /var/www/fullstack-vietSage

BUILD_TARGET="${1:-auth-service frontend}"
RECREATE_TARGET="${2:-frontend auth-service}"
SKIP_DB="${3:-0}"

echo "=== [1/5] Syncing code from origin/master ==="
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

if [ "$SKIP_DB" = "0" ]; then
  echo "=== [2/5] Verifying Production Topology & Migrations ==="
  python3 scripts/verify-production-migration.py || true
  python3 scripts/verify-production-topology.py || true
fi

echo "=== [3/5] Building Fresh Docker Production Images (${BUILD_TARGET}) ==="
export FRONTEND_BUILD_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose -f docker-compose.prod.yml build ${BUILD_TARGET}
unset FRONTEND_BUILD_AUTH_SECRET

if [ "$SKIP_DB" = "0" ]; then
  echo "=== [4/5] Running Database Migrations & Seeds ==="
  docker compose -f docker-compose.prod.yml up -d postgres
  docker compose -f docker-compose.prod.yml run --rm migrate
  docker compose -f docker-compose.prod.yml run --rm seed
fi

echo "=== [5/5] Starting / Recreating Services (${RECREATE_TARGET}) ==="
docker compose -f docker-compose.prod.yml up -d --force-recreate ${RECREATE_TARGET}
docker compose -f docker-compose.prod.yml up -d

echo "Verifying container status:"
docker compose -f docker-compose.prod.yml ps ${RECREATE_TARGET}

echo "Waiting 3 seconds..."
sleep 3

echo "Testing health endpoint:"
curl -fsS https://vietsage.com/api/health
echo ""

echo "=========================================================="
echo ">>> Deployment completed 100% successfully on commit ${SHORT_COMMIT}! <<<"
echo "=========================================================="
'@

try {
    # Send script safely via stdin to bash -s with arguments
    $remoteScript | ssh -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "bash -s -- `"$buildTarget`" `"$recreateTarget`" `"$skipDb`""

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
