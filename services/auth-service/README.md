# VietSage Auth Service

NestJS backend service for VietSage hotel operations.

## Scope in current milestone

Milestone 0 foundation includes:
- `GET /health` endpoint
- Global request validation
- Global exception filter with consistent error shape
- Request id middleware and request logging
- Environment config via `PORT` and `NODE_ENV`

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
```

## Environment

Copy `.env.example` to `.env` and edit values if needed.

```bash
cp .env.example .env
```

Default values:

```env
NODE_ENV=development
PORT=3000
```

## Run

```bash
npm run start:dev
```

Service starts on `http://localhost:3000` by default.

## Health check

```bash
curl http://localhost:3000/health
```

Example response:

```json
{
  "status": "ok",
  "service": "auth-service",
  "uptimeSeconds": 42,
  "timestamp": "2026-05-26T12:00:00.000Z"
}
```

## Error response shape

All errors are normalized to:

```json
{
  "code": "NOT_FOUND_EXCEPTION",
  "message": "Cannot GET /not-found",
  "details": {
    "statusCode": 404
  },
  "requestId": "a5e9cb95-7ac9-4f51-b90d-5fe3126f16f6",
  "timestamp": "2026-05-26T12:00:00.000Z",
  "path": "/not-found"
}
```

## Validation commands

```bash
npm run build
npm run test
npm run test:e2e
npm run lint
```
