# Hotel revenue book

The A21-style book combines posted hotel charges, confirmed receipts, booking deposits and receivable collections. Off-catalog revenue is stored independently of the service catalog and guest folios. It does not create stays, invoices, guest balances or platform-billing charges.

## Private endpoints

Base: `/hotels/{hotelId}/reports/revenue-book`.

| Method | Suffix | Permission | Body |
| --- | --- | --- | --- |
| GET | — | `hotel.billing.view` | Query `from` and `to` together, or neither |
| POST | `/entries` | `hotel.billing.manage` | `date`, `description`, `category`, `amount`, `idempotencyKey`; optional `roomId`, `documentNumber`, `notes`, `collection` |
| PATCH | `/entries/{entryId}` | `hotel.billing.manage` | Editable entry fields plus `version` |
| POST | `/entries/{entryId}/collections` | `hotel.billing.manage` | `receivedAt`, `amount`, `method`, `idempotencyKey`, `version`; optional `reference` |
| POST | `/entries/{entryId}/void` | `hotel.billing.manage` | `reason`, `version` |

Dates use `YYYY-MM-DD`. Receipt times are ISO instants with an offset. No dates defaults to the hotel's local month-start through today. The inclusive range is limited to 366 days; books exceeding 10,000 accounts are rejected instead of truncated. Amounts are positive VND numbers with at most two decimal places. Categories are `ROOM`, `MINIBAR`, `LAUNDRY`, `OTHER`; manual collection methods are `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER`.

`GET` returns hotel/period metadata, permitted room choices, `canManage`, account `entries` and `summary`. Entries contain daily `revenueLines`, dated `collections`, category totals, opening/closing balances and non-cash `balanceAdjustment`. Mutations return `{id, version}`. Clients invalidate the hotel-scoped book resource after success. Automatic entries are edited through their originating workflows; only manual additions are editable here. Hotel and assigned-room restrictions are enforced on reads, writes and idempotency replays.

## Reconciliation

- `closingBalance = openingBalance + revenueTotal - collectedTotal + balanceAdjustment`. Negative balances represent advances/credit and are retained.
- Charges use their actual posting/business date; receipt dates never create revenue. Voids reverse revenue on their dated event, no earlier than recognition of a future manual charge.
- Booking deposits appear once at receipt. Their synthetic folio payments do not count as new cash. Allocation credits the folio and debits the deposit account through non-cash adjustments.
- Receivable collections remain attached to the originating folio, so a debt transfer does not create revenue or another cash receipt.
- Native refund/void history must contain dated events sufficient to reconcile the stored amount. Incomplete historical refund data produces an actionable reconciliation error instead of guessed cash dates.
- Service category snapshots take precedence when available. Legacy service charges without an explicit report-category snapshot fall back to the available service category/name; unrecognized categories go to `OTHER`.
- Manual updates preserve an audit of old/new values; this initial release does not lock accounting days. Voiding a manual entry with receipts is rejected to preserve cash history. Resolve/refund the actual collection with management before cancellation; this release does not offer manual receipt refunds.

## Storage and rollout

`HotelRevenueEntry` stores manual charges and optimistic versions; `HotelRevenueCollection` stores their receipts. Composite foreign keys keep collections in the same hotel as their parent. Money/category/method checks and idempotency indexes are included in `services/auth-service/prisma/migrations/20261113010000_hotel_revenue_book/migration.sql`.

Prepare and validate the migration before release. Applying it is a separate database operation. A missing table returns a service-unavailable message; the application must not silently replace missing persisted entries with an empty book. Existing folio/payment data and platform fee policy are unchanged.

The owner/staff report routes expose `?tab=book`. The frontend exports a real OOXML `.xlsx` in the A21 layout using the complete returned book, including dated payment details, daily subtotals and authoritative period totals.
