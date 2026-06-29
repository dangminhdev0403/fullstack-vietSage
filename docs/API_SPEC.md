# VietSage Backend API Spec V1

Status: Runtime + planned contract
Last updated: 2026-05-27

## 1) Current Runtime Status

Implemented now in `services/auth-service`:

- `GET /health`
- Global error response normalization
- `x-request-id` propagation (request header passthrough or auto-generated)

Not implemented yet (currently returns 404):

- `POST /auth/login`
- `GET /auth/me`
- `GET /guest/me/stay`
- `GET /guest/services`
- `POST /guest/requests`
- `GET /guest/requests`
- `GET /guest/requests/:id`
- `GET /staff/requests`
- `PATCH /staff/requests/:id/status`
- `GET /staff/dashboard`
- `GET /admin/dashboard`
- `GET /admin/requests`
- `GET /admin/rooms`

## 2) Base URL and Conventions

Base URL (local): `http://localhost:3000`

Headers:

- `Content-Type: application/json`
- `x-request-id` (optional): if client sends this header, backend echoes it in response.

Auth:

- Bearer token endpoints are planned but not active in runtime yet.

## 3) Common Error Shape (Current Runtime)

All HTTP errors are normalized by global exception filter:

```json
{
  "code": "NOT_FOUND_EXCEPTION",
  "message": "Cannot GET /not-found",
  "details": {
    "error": "Not Found"
  },
  "requestId": "a5e9cb95-7ac9-4f51-b90d-5fe3126f16f6",
  "timestamp": "2026-05-27T00:00:00.000Z",
  "path": "/not-found"
}
```

Notes:

- `details` is optional and depends on error type.
- Validation errors use:

```json
{
  "code": "BAD_REQUEST_EXCEPTION",
  "message": "field must be a string, field should not be empty",
  "details": {
    "validationErrors": ["field must be a string", "field should not be empty"]
  },
  "requestId": "...",
  "timestamp": "...",
  "path": "/some-path"
}
```

## 4) Implemented Endpoint

### `GET /health`

Response 200:

```json
{
  "status": "ok",
  "service": "auth-service",
  "uptimeSeconds": 42,
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

Response headers include:

- `x-request-id: <uuid-or-client-value>`

## 5) Planned Contract (Not Implemented Yet)

The endpoints below are target API contracts for frontend alignment. They currently return 404 until backend milestones are implemented.

## Auth (planned)

### `POST /auth/login`

Request:

```json
{
  "email": "staff@vietsage.local",
  "password": "password"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "user": {
    "id": "uuid",
    "email": "staff@vietsage.local",
    "name": "Staff User",
    "role": "STAFF"
  }
}
```

### `GET /auth/me`

Requires bearer token.

Response:

```json
{
  "id": "uuid",
  "email": "staff@vietsage.local",
  "name": "Staff User",
  "role": "STAFF"
}
```

## Guest (planned)

### `GET /guest/me/stay`

Requires `GUEST` role.

Response:

```json
{
  "id": "uuid",
  "room": {
    "id": "uuid",
    "roomNumber": "402",
    "type": "Luxury Suite"
  },
  "status": "ACTIVE",
  "checkInAt": "2026-01-01T14:00:00.000Z",
  "checkOutAt": "2026-01-02T12:00:00.000Z"
}
```

### `GET /guest/services`

Requires `GUEST` role.

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "code": "CLEANING",
      "name": "Dọn phòng",
      "description": "Yêu cầu vệ sinh và làm mới không gian phòng."
    }
  ]
}
```

### `POST /guest/requests`

Requires `GUEST` role.

Request:

```json
{
  "serviceCategoryId": "uuid",
  "note": "Dọn phòng sau 15 phút",
  "priority": "NORMAL"
}
```

Response:

```json
{
  "id": "uuid",
  "status": "PENDING",
  "priority": "NORMAL",
  "createdAt": "2026-01-01T10:15:00.000Z"
}
```

### `GET /guest/requests`

Requires `GUEST` role.

Query:

- `page`
- `limit`
- `status`

### `GET /guest/requests/:id`

Requires `GUEST` role and request ownership.

Response includes request detail and timeline events.

## Staff (planned)

### `GET /staff/requests`

Requires `STAFF` or `ADMIN` role.

Query:

- `page`
- `limit`
- `status`
- `priority`
- `roomNumber`
- `serviceCategoryId`

Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

### `PATCH /staff/requests/:id/status`

Requires `STAFF` or `ADMIN` role.

Request:

```json
{
  "status": "IN_PROGRESS",
  "note": "Nhân viên đang xử lý"
}
```

Response:

```json
{
  "id": "uuid",
  "status": "IN_PROGRESS",
  "updatedAt": "2026-01-01T10:20:00.000Z"
}
```

### `GET /staff/dashboard`

Requires `STAFF` or `ADMIN` role.

Returns queue counters and current workload summary.

## Admin (planned)

### `GET /admin/dashboard`

Requires `ADMIN` role.

Returns operational KPIs:

- total rooms
- occupied rooms
- available rooms
- active requests
- average response time
- request category breakdown

### `GET /admin/requests`

Requires `ADMIN` role.

Query supports pagination and filters similar to staff requests.

### `GET /admin/rooms`

Requires `ADMIN` role.

Returns room occupancy status.

## 6) Planned Enum Values (For Frontend Mapping)

- `UserRole`: `GUEST`, `STAFF`, `ADMIN`
- `GuestStayStatus`: `ACTIVE`, `CHECKED_OUT`, `CANCELLED`
- `ServiceRequestStatus`: `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- `ServiceRequestPriority`: `NORMAL`, `HIGH`, `URGENT`

## 7) Frontend Synchronization Notes

- Until planned endpoints are implemented, frontend should continue using mock data from `frontends/font-end-vietsage/src/app/(vietsage)/_data/mock.ts`.
- Use this document plus `docs/FRONTEND_SYNC_VALIDATION.md` as the baseline when wiring frontend to real backend APIs.
