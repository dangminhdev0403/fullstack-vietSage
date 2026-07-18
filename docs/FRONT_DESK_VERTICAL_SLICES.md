# Front Desk vertical slices

## Goal

Build Front Desk as an operational workspace over existing Property, Identity, Billing, Guest Operations, and Housekeeping ownership. Front Desk does not own duplicate hotel, room, stay, folio, or payment data.

## F0 — Checkout safety

Lifecycle invariant:

```text
Invoice issued
→ Folio CHECKOUT_PENDING
→ verified successful payment
→ Payment SUCCEEDED + Invoice PAID + Folio CLOSED
→ GuestStay CHECKED_OUT + guest access revoked
→ Room PROCESSING (turnover required)
```

Invoice issuance must never check out a stay or make a room available.

## F1 — Staff hotel scope

Effective hotel access is the intersection of active capability and active resource scope:

```text
active UserRole + active Role
∩ active TenantUser
∩ active HotelStaffAssignment
∩ active Hotel
```

`HOTEL_MANAGER` and `HOTEL_FRONTDESK` require an active hotel assignment. `GET /auth/me` returns `accessibleHotels`; it does not return or infer `activeHotelId`. The client must explicitly select hotel context.

## F2 — Reservation to check-in

### Ownership

- `Reservation`: Property commercial commitment before arrival.
- `GuestStay`: actual occupancy after check-in.
- `Folio`: Billing account opened atomically with check-in.
- Room readiness remains Property/Housekeeping state.

### Reservation state machine

```text
DRAFT → CONFIRMED → ARRIVAL_READY → CHECKED_IN
  └──────────────→ CANCELLED
                 → NO_SHOW
```

Initial implementation may create directly as `CONFIRMED`; `DRAFT` remains optional until quotation/hold workflows exist.

### Core invariants

1. A reservation can be created without a room assignment.
2. Room assignment does not occupy the room.
3. `ARRIVAL_READY` requires an assigned room and room status `AVAILABLE`.
4. Check-in requires `CONFIRMED` or `ARRIVAL_READY`, valid arrival/departure dates, an active hotel assignment for staff, and an available assigned room.
5. Check-in executes one transaction:
   - lock reservation and room;
   - reject duplicate/concurrent check-in;
   - create `GuestStay ACTIVE` linked by `reservationId`;
   - create/open one folio;
   - set room `OCCUPIED`;
   - activate/reuse room QR according to existing rules;
   - set reservation `CHECKED_IN` and `checkedInAt`.
6. Repeating check-in with the same reservation returns the existing stay or a stable conflict; it must never create a second stay/folio.
7. Cancelled/no-show reservations cannot be checked in without an explicit audited restore flow.

### Proposed additive persistence

`Reservation`:

- `id`, `hotelId`, nullable `roomId`;
- unique `reservationCode`;
- guest name/phone;
- `plannedCheckInAt`, `plannedCheckOutAt`;
- status timestamps and actor IDs;
- indexes `(hotelId, status, plannedCheckInAt)` and `(hotelId, roomId, status)`.

`GuestStay.reservationId` is nullable and unique for compatibility with existing direct/walk-in stay records.

### API tracer order

1. `POST /hotels/{hotelId}/reservations` — create confirmed reservation, room optional.
2. `GET /hotels/{hotelId}/reservations?arrivalDate=&status=` — arrivals queue.
3. `POST /hotels/{hotelId}/reservations/{reservationId}/assign-room` — atomic room assignment validation.
4. `POST /hotels/{hotelId}/reservations/{reservationId}/check-in` — transactional conversion to stay.
5. Cancellation/no-show commands after create/assign/check-in is verified.

### Compatibility

Existing `/hotels/{hotelId}/stays` and `/stays/check-in` remain temporarily for walk-in compatibility. New Front Desk UI must use reservation APIs. Removal requires usage telemetry and a separate breaking-contract approval.

## Runtime promotion gates

- Additive SQL reviewed with rollback.
- Prisma validate/generate.
- RED→GREEN service/repository/authorization tests.
- OpenAPI export and contract verification.
- Correct VietSage integration database with matching migration lineage.
- Authenticated create → assign → check-in → reload persistence QA.
- Duplicate/concurrent check-in negative test.
- Independent review before frontend route promotion.

## Current local blocker

The currently configured PostgreSQL database reports unrelated MYLTV academic migration history and no common VietSage migration. No VietSage migration may be applied to that database. Runtime persistence QA remains blocked until a correct isolated VietSage database is supplied or created with explicit approval.
