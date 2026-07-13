# Backend Proposal: GuestOS Multilingual API Support for `/g/**`

Date: 2026-06-27
Owner: Frontend GuestOS
Audience: Backend/API team
Status: Partially implemented in backend; frontend handoff instructions refreshed on 2026-06-27.

## Summary

The GuestOS frontend now lets guests select and later correct their language from `/g/**`. The frontend currently translates static UI labels locally, but guest-facing backend data is still returned as a single language string. We need backend locale negotiation for guest APIs so service catalogs, request names, request answers, validation messages, and QR/session metadata stay synchronized with the selected GuestOS language.

## Sync Status

Checked on 2026-06-27:

- Backend locale resolver currently accepts `Accept-Language`, `x-lang`, and `?lang=`.
- Backend normalizes `vi`/`vi-VN` to `vi-VN`; `en`, `zh`, `ko`, `ru`, and `hi` remain short codes.
- Backend service catalog tables now include translation rows for categories/items.
- Backend guest service catalog responses already resolve localized `name` and `description` for:
  - `GET /guest/services`
  - `GET /guest/service-categories/:categoryId/services`
- Backend request history/create/cancel response localization is not yet complete.
- QR scan locale persistence and `supportedLocales` response fields are not yet confirmed.
- Frontend still needs to send the selected GuestOS locale on guest API calls.

Frontend implementation handoff lives in `docs/FRONTEND_GUEST_I18N_INSTRUCTIONS.md`.

Supported frontend locales today:

- `vi` default
- `en`
- `zh`
- `ko`
- `ru`
- `hi`

## Current Frontend Behavior

Guest language is stored locally in `vietsage.guest-os.v1.language`.

Guest pages using localized backend data:

- `/g/[qrCode]`: scans QR and opens GuestOS.
- `/g/language`: first-run and correction screen.
- `/g/home`: shows hotel, room, guest, and navigation text.
- `/g/services`: lists service categories/items and creates requests.
- `/g/requests`: lists request history/status, prices, answers, and cancel actions.

Current guest API methods:

- `POST /guest/qr/scan`
- `GET /guest/session/me`
- `GET /guest/services`
- `GET /guest/service-categories/:categoryId/services`
- `POST /guest/requests`
- `GET /guest/requests`
- `PATCH /guest/requests/:requestId/cancel`
- `POST /guest/session/close`
- `POST /emergency/guest/calls`

## Proposal

### 1. Locale Negotiation

Every guest API endpoint should accept the selected locale through:

1. `Accept-Language` header, preferred for normal requests.
2. Optional `lang` query parameter for cacheable GET/debug flows. Existing backend resolver uses `lang`; do not use `locale` unless backend adds it later.
3. Optional `locale` request body field for QR scan and request creation only if needed.

Backend should normalize locale values using the same rules as frontend:

- `vi`, `vi-VN` -> `vi`
- `en`, `en-US` -> `en`
- `zh`, `zh-CN`, `zh-TW` -> `zh`
- `ko`, `ko-KR` -> `ko`
- `ru`, `ru-RU` -> `ru`
- `hi`, `hi-IN` -> `hi`
- unknown or missing -> `vi`

Recommended response metadata:

```json
{
  "data": {},
  "meta": {
    "locale": "en",
    "fallbackLocale": "vi"
  }
}
```

If the existing envelope cannot add `meta`, include `locale` and `fallbackLocale` inside the guest result object for the affected endpoints.

### 2. Translated Service Catalog Responses

Guest catalog endpoints should resolve `name` and `description` to the requested locale:

- `GET /guest/services`
- `GET /guest/service-categories/:categoryId/services`

Current frontend contract:

```ts
type GuestServiceItem = {
  id: string;
  name: string;
  description: string | null;
  price: string | number | null;
  currency: string;
  quantityEnabled: boolean;
  minQuantity: number;
  maxQuantity: number | null;
};
```

Requested backend behavior:

- Keep `name` and `description` as localized display fields.
- Fall back per field to Vietnamese when a translation is missing.
- Optionally include `translations` for admin/debug clients, but GuestOS only needs the localized display fields.

Example:

`GET /guest/service-categories/abc/services?locale=en`

```json
{
  "category": {
    "id": "abc",
    "hotelId": "hotel_1",
    "name": "Housekeeping",
    "description": "Room cleaning and amenities",
    "sortOrder": 1,
    "status": "ACTIVE"
  },
  "services": [
    {
      "id": "svc_1",
      "name": "Extra towels",
      "description": "Delivered to your room",
      "price": "0",
      "currency": "VND",
      "quantityEnabled": true,
      "minQuantity": 1,
      "maxQuantity": 5
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

### 3. Request Snapshot Localization

Guest request endpoints should preserve what the guest saw when creating a request, while also supporting current-locale display.

Affected endpoints:

- `POST /guest/requests`
- `GET /guest/requests`
- `PATCH /guest/requests/:requestId/cancel`

Requested fields:

```ts
type GuestRequest = {
  id: string;
  displayName: string;
  displayLocale?: "vi" | "en" | "zh" | "ko" | "ru" | "hi";
  status: "CREATED" | "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED";
  priority?: "NORMAL" | "URGENT";
  quantity: number;
  description: string | null;
  answer: string | null;
  answerLocale?: string | null;
  currency?: string | null;
  unitPrice?: string | number | null;
  totalPrice?: string | number | null;
  estimatedTotalAmount?: string | number | null;
  createdAt: string;
  canCancel: boolean;
};
```

Backend should:

- Resolve `displayName` to the current requested locale when listing requests.
- Store `displayLocale` on creation for audit/customer-support clarity.
- Keep guest-entered `description` unchanged; do not machine-translate free text.
- Allow staff answer localization later. If only one answer exists, return it unchanged and set `answerLocale` to the locale used.

### 4. QR Session Language Persistence

`POST /guest/qr/scan` should accept the selected locale if available. This lets backend attach the preferred language to the guest session.

Requested body addition:

```json
{
  "qrCode": "ROOM_QR",
  "currentSessionToken": "optional",
  "forceSwitch": false,
  "locale": "en"
}
```

Requested response addition:

```json
{
  "sessionToken": "...",
  "expiresAt": "...",
  "locale": "en",
  "supportedLocales": ["vi", "en", "zh", "ko", "ru", "hi"],
  "hotel": {
    "name": "VietSage Hotel",
    "timezone": "Asia/Ho_Chi_Minh",
    "brandSettings": {}
  }
}
```

If backend does not want to persist locale on scan, frontend can still send `Accept-Language` on later requests. Persisting it is preferred for staff notifications, analytics, and request audit trails.

### 5. Error and Validation Messages

Backend should return stable error codes plus localized messages:

```json
{
  "status": 400,
  "error": "VALIDATION_ERROR",
  "code": "GUEST_SERVICE_QUANTITY_TOO_LOW",
  "message": "Minimum quantity is 2.",
  "data": {
    "minQuantity": 2
  }
}
```

Frontend can display `message` immediately and optionally map `code` to local text later.

Important guest error codes:

- `GUEST_QR_EXPIRED`
- `GUEST_QR_INVALID`
- `GUEST_SESSION_EXPIRED`
- `GUEST_SESSION_SWITCH_REQUIRED`
- `GUEST_SERVICE_UNAVAILABLE`
- `GUEST_SERVICE_QUANTITY_TOO_LOW`
- `GUEST_SERVICE_QUANTITY_TOO_HIGH`
- `GUEST_REQUEST_NOT_CANCELLABLE`

### 6. Realtime Event Localization

Guest request realtime events should include the same localized request payload shape as `GET /guest/requests`, or include IDs only and let frontend refetch with the current locale.

Preferred:

```json
{
  "type": "guest.request.updated",
  "locale": "en",
  "request": {
    "id": "req_1",
    "displayName": "Extra towels",
    "status": "ACKNOWLEDGED",
    "answer": "The team is preparing your request.",
    "answerLocale": "en"
  }
}
```

## Frontend Integration Plan After Backend Approval

1. Add locale to `GuestOsService` requests through `Accept-Language`.
2. Add optional `locale` to `GuestScanQrRequest`.
3. Extend guest response types with `locale`, `supportedLocales`, `displayLocale`, and `answerLocale`.
4. Stop relying on frontend fallback names for backend-owned service/category/request text.
5. Verify `/g/[qrCode]`, `/g/language`, `/g/home`, `/g/services`, and `/g/requests` in all supported locales.

## Acceptance Criteria

- Service category names/descriptions return in the selected GuestOS language.
- Service item names/descriptions return in the selected GuestOS language.
- Request history displays service names in the selected GuestOS language.
- QR/session response can echo accepted locale and supported locales.
- Guest API errors provide stable `code` values and localized `message` text.
- Missing translations fall back to Vietnamese per field, without failing the request.
- Existing clients that do not send locale continue to receive Vietnamese responses.
