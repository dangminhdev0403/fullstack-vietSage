# Frontend Instructions: GuestOS Backend I18n Sync

Date: 2026-06-27
Owner: Frontend GuestOS
Source proposal: `docs/BACKEND_GUEST_I18N_PROPOSAL.md`

## Current Backend Contract

Backend guest catalog localization is partially available.

Locale negotiation currently works through:

- `Accept-Language` header
- `x-lang` header
- `?lang=` query parameter

Use the frontend GuestOS locale codes:

- `vi`
- `en`
- `zh`
- `ko`
- `ru`
- `hi`

Backend maps `vi` to `vi-VN` internally. Continue sending `vi` from the frontend UI/store.

Localized backend-owned text is currently available for:

- `GET /guest/services`
- `GET /guest/service-categories/:categoryId/services`

Not fully confirmed/complete yet:

- `POST /guest/qr/scan` locale persistence
- `GET /guest/session/me` locale metadata
- `POST /guest/requests` localized display snapshot
- `GET /guest/requests` current-locale `displayName`
- `PATCH /guest/requests/:requestId/cancel` localized returned request
- realtime localized request payloads
- localized stable guest API error codes/messages

## Implementation Instructions

1. Add a GuestOS locale option to `GuestOsService` request methods.

   File:

   - `src/features/guest-os/service/guest-os-service.ts`

   Recommended helper:

   ```ts
   type GuestLocaleCode = "vi" | "en" | "zh" | "ko" | "ru" | "hi";

   function localeHeaders(locale?: GuestLocaleCode) {
     return locale ? { "Accept-Language": locale, "x-lang": locale } : undefined;
   }
   ```

   Use whatever header API `HttpClient.request(...)` already supports. If `HttpClient` does not support request headers yet, add a narrow `headers?: Record<string, string>` option there and forward it to `fetch`.

2. Send the selected locale on these calls first:

   - `listServices(sessionToken, locale)`
   - `listServicesByCategory(sessionToken, categoryId, query, locale)`

   These endpoints are already backend-localized.

3. Also thread locale through these methods now, but keep UI fallbacks because backend support is not complete:

   - `scanQr(inputWithLocale)`
   - `getCurrentSession(sessionToken, locale)`
   - `createRequest(sessionToken, input, locale)`
   - `listRequests(sessionToken, query, locale)`
   - `cancelRequest(sessionToken, requestId, locale)`
   - `createEmergencyCall(sessionToken, input, locale)`

4. Update call sites to pass `locale` from `useGuestI18n()`.

   Primary files:

   - `src/app/(vietsage)/g/[qrCode]/page.tsx`
   - `src/app/(vietsage)/g/home/page.tsx`
   - `src/app/(vietsage)/g/services/page.tsx`
   - `src/app/(vietsage)/g/requests/page.tsx`

5. Extend frontend types without requiring backend to return the fields yet.

   File:

   - `src/features/guest-os/types/guest-os-contract.ts`

   Add optional fields:

   ```ts
   export type GuestLocaleCode = "vi" | "en" | "zh" | "ko" | "ru" | "hi";

   export type GuestScanQrRequest = {
     qrCode: string;
     deviceFingerprint?: string;
     currentSessionToken?: string;
     forceSwitch?: boolean;
     locale?: GuestLocaleCode;
   };

   export type GuestScanQrResult = {
     locale?: GuestLocaleCode;
     supportedLocales?: GuestLocaleCode[];
     // existing fields...
   };

   export type GuestRequest = {
     displayLocale?: GuestLocaleCode;
     answerLocale?: GuestLocaleCode | string | null;
     // existing fields...
   };
   ```

6. Do not remove local UI dictionaries.

   Keep frontend dictionaries for static UI labels, buttons, empty states, status labels, validation hints, and fallback messages.

   Backend should own only backend data text:

   - service category `name` / `description`
   - service item `name` / `description`
   - request `displayName`
   - backend validation/error `message`
   - staff answer text when backend supports localized answers

7. Prefer `Accept-Language`; use `?lang=` only when a route needs query-based debugging.

   Do not send `?locale=` right now. Backend resolver currently reads `lang`, not `locale`.

## Expected Behavior After Frontend Sync

- Changing language on `/g/language` changes subsequent guest service catalog API responses.
- `/g/services` displays localized service categories/items from backend.
- Missing backend translations fall back to Vietnamese without frontend failure.
- Existing guests with no saved language continue to use Vietnamese.
- Request pages continue to work even before backend request-localization is complete.

## Verification Checklist

- Select `en`, open `/g/services`, confirm `Accept-Language: en` is sent.
- Select `zh`, open a category detail, confirm `Accept-Language: zh` is sent.
- Select `vi`, confirm `Accept-Language: vi` is sent and Vietnamese fallback appears.
- Submit a service request in a non-Vietnamese locale and confirm request creation still succeeds.
- Open `/g/requests` and confirm the page still handles current backend response shape.
- Re-scan QR after selecting a non-default locale and confirm the scan payload includes `locale`.

## Backend Follow-Up Still Needed

Backend should still finish:

- Request `displayName` localization for list/create/cancel responses.
- Persisting or echoing locale on QR scan/session.
- Stable guest error `code` values with localized `message`.
- Realtime event payload locale behavior.
