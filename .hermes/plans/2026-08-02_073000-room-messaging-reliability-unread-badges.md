# Room Messaging Reliability and Two-Sided Unread Badges Plan

**Goal:** Staff và GuestOS có unread badge đúng DB, realtime, idempotent, concurrency-safe; messaging fail-closed theo hotel/stay và lifecycle checkout.

## Locked invariants

1. Staff unread = `GUEST + readAt null + exact hotel + ACTIVE stay + checkedOutAt null`.
2. Guest unread = `STAFF + readAt null + exact stay + ACTIVE stay + checkedOutAt null`.
3. Không dùng `Room.status`.
4. Read watermark là `readThroughMessageId`. Repository resolve pivot `(createdAt,id)` trong đúng thread, chỉ update message phía đối tác `<= pivot`; message đến sau pivot vẫn unread.
5. Guest send bắt buộc `clientMessageId`, unique `(sessionId, clientMessageId)`. Retry trả existing message/event-equivalent response, không insert/emit lần hai.
6. Rate limit DB-backed theo `stayId + deviceFingerprintHash` (fallback sessionId), khóa transaction theo key trước count/insert. Idempotency lookup chạy trước rate-limit. Vi phạm trả 429 + `Retry-After`; không DB write/event.
7. Event envelope: `{ eventId, messageId, hotelId, stayId, threadId, thread, message }`; client dedupe `eventId`, verify scope before cache change.
8. Infinite history append đúng generated query-resource key, preserve `{pages,pageParams}`, không full refetch.
9. Reconnect/reload fetch unread summary từ DB.
10. Checkout closes conversation, emits `conversation.closed`, clears badge/cache, rejects send/read/list for inactive stay. QR lifecycle untouched.
11. Routes Staff dùng `hotel.messages.view/manage`; missing permission hides nav/badge, disables query/socket subscriber; backend 403.
12. Badge: hidden 0, 1-99, 99+, desktop/mobile, aria-label.

## Minimal schema/migration

- `GuestMessage.clientMessageId String? @db.VarChar(80)`.
- `@@unique([sessionId, clientMessageId])`.
- Add index supporting unread summaries if query plan requires it after EXPLAIN; prefer existing `(threadId,senderType,readAt)` plus hotel/stay indexes unless evidence shows need.
- Add business permissions `hotel.messages.view`, `hotel.messages.manage`; grant TENANT_OWNER and HOTEL_FRONTDESK; SUPER_ADMIN receives canonical permission sync/grant.
- Do not add message sequence/read-receipt table/rate-limit table unless RED concurrency test proves advisory-lock + message history insufficient.

## API

Staff:
- `GET /hotels/:hotelId/messages/unread-summary` -> `{ unreadCount }`, permission `hotel.messages.view`.
- Existing list/detail -> `hotel.messages.view`.
- Reply + mark-read -> `hotel.messages.manage`.
- Mark-read body `{ readThroughMessageId }`.

Guest:
- `GET /guest/messages/unread-summary` -> `{ unreadCount }`.
- Send body `{ body, clientMessageId }`.
- Mark-read body `{ readThroughMessageId }`.
- 429 preserves `Retry-After` through backend and Next BFF.

## Realtime

- Backend allocates `eventId` once per committed new message.
- Emit only after transaction commit.
- Owner room receives exact hotel event; guest room receives exact stay event.
- `conversation.closed` envelope includes eventId/hotelId/stayId/threadId.
- Owner/guest managers forward raw envelope; hooks validate scope and dedupe bounded event-ID set.

## TDD vertical slices

1. RED/GREEN permission migration + route decorators + nav filtering.
2. RED/GREEN Staff DB unread summary + endpoint.
3. RED/GREEN Guest DB unread summary + endpoint.
4. RED/GREEN watermark read with concurrent post-pivot message.
5. RED/GREEN clientMessageId retry dedupe.
6. RED/GREEN DB rate limit, Retry-After, no insert/no event.
7. RED/GREEN event envelope, scope isolation, duplicate forwarding.
8. RED/GREEN Staff resource/badge/update/read/reconnect.
9. RED/GREEN Guest resource/badge/update/read/reconnect.
10. RED/GREEN infinite append and no full refetch.
11. RED/GREEN checkout close, badge clear, send reject, QR unchanged.
12. Authenticated two-actor E2E, then full gates/review.

## Likely files

Backend:
- `services/auth-service/prisma/schema.prisma`
- new migration under `services/auth-service/prisma/migrations/`
- `services/auth-service/prisma/seed.js`
- `services/auth-service/src/modules/identity/application/route-permission-sync.service.ts`
- `services/auth-service/src/modules/guest-operations/domain/schemas/requests.schema.ts`
- `services/auth-service/src/modules/guest-operations/infrastructure/repositories/guest-messages.repository.ts`
- `services/auth-service/src/modules/guest-operations/application/guest-messages.service.ts`
- `services/auth-service/src/modules/guest-operations/api/guest-os.controller.ts`
- `services/auth-service/src/modules/guest-operations/api/hotel-requests.controller.ts`
- shared event port/publisher/emitter and tests
- OpenAPI contract sources/generated outputs

Frontend:
- guest/hotel message resources and BFF routes
- guest/staff message pages
- owner/guest realtime managers/hooks
- workspace shell/sidebar/mobile nav
- GuestOS bottom nav
- focused Node tests
- `frontends/front-end-vietsage/docs/PLANS.md`

## Gates

- Prisma validate + migration tests + clean-DB physical schema check.
- Targeted RED/GREEN tests captured.
- Full backend test/build.
- Frontend focused tests, ESLint, TypeScript, production build.
- OpenAPI generation/path verification.
- Two-actor runtime: two hotels/two stays, duplicate/reconnect/concurrency/rate-limit/checkout.
- Graphify update + bounded Repomix.
- Independent fail-closed security/logic review.
- No commit/push/deploy without separate approval.

## Explicitly separate

Google Sheet catalog realtime remains a separate task. It requires a distinct `service_catalog.updated` event and Guest catalog refresh, but is excluded here to keep messaging migration, authorization, rate limiting, and concurrency review bounded.
