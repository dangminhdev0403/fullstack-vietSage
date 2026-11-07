# GuestOS production browser test — 2026-11-07

## Scope

- Target: `https://vietsage.com`, tenant `VietSage Hotel`.
- Mode: live UI browser test, tenant Brave session plus isolated GuestOS tab.
- Included: room diagram and plan, stays/front desk, future reservations and groups, room reassignment, GuestOS QR bootstrap, internal services, partner orders, request/chat realtime, room-state refresh, money display, invalid QR, search/filter, English locale, and 320–1920px checks.
- Excluded: password changes, staff-account CRUD, BCA/KBTT actions, checkout commit, stay extension commit, VPS/deploy.
- Evidence: [browser-evidence.json](./evidence/2026-11-07-guestos-production/browser-evidence.json), [guest-order-320-before.png](./evidence/2026-11-07-guestos-production/guest-order-320-before.png).

## Verdict

`FAIL` — 25 PASS, 13 FAIL, 2 BLOCKED in 40 unique checks. Production testing stopped after evidence collection. Three temporary reservations were cancelled; no check-in, checkout, extension, payment, or provider/BCA write was committed. One external partner order remains pending because its staff lifecycle controls were unavailable; it must be reconciled or cancelled through an authorized operational path before deployment if the test tenant treats it as disposable.

## Confirmed defects

| ID | Severity | Finding | Evidence / acceptance |
| --- | --- | --- | --- |
| UI01 | P2 | Check-in modal renders raw status `available` under the room title. | Room 101 check-in form. Map enum to Vietnamese label. |
| RM02 | P1 | Room-plan API returns `409 MISSING_AGREED_ROOM_RATE_SNAPSHOT` after a valid two-room group reservation; plan view does not show the new booking until reload. | `POST/refresh /room-plan`, production response body; arrivals showed two bookings. |
| SV02 | P1 | Internal-service confirmation omits quantity, unit price and total; the confirmation only shows service name and note. | Áo comple qty 21 confirmation. |
| BL01 | P1 | Owner reservation detail rejects a valid cash deposit write with `Không có quyền thực hiện thao tác này`. | Reservation 0149, 70,000 VND cash deposit. |
| BL02 | P1 | Staff request detail shows `Giá dịch vụ: Liên hệ` while GuestOS has a concrete charged amount. | Áo comple, guest total 21 VND vs staff `Liên hệ`. |
| SV04 | P1 | Owner request list receives a new request but exposes no receive/complete/reject control; processing column remains `-`. | P301 Áo comple request. |
| BL03 | P1 | Reservation edit updates the form to 2 nights × 900,000 + 70,000 = 1,870,000, but open detail remains 1,070,000 until a full reload. | Reservation 0149 before/after reload. |
| UI02 | P2 | Room reassignment conflict exposes raw enum `ROOM_RESERVATION_OVERLAP`. | P101 → occupied/reserved P401. |
| RS05 | P1 | “Phòng trống phù hợp” offers a different room type; backend rejects the selection with raw `ROOM_TYPE_MISMATCH`. | P101 booking offered P102; same-type P304 succeeded. |
| RT04 | P1 | Newly created single reservation does not appear in an already-open arrivals tab until reload. | Reservation 0151/P104; reload later showed it. |
| UI03 | P2 | Partner-order detail modal overflows horizontally at 320px (56px) and 360px (16px). | Saved screenshot and DOM measurements; 390px+ passed. |
| BL04 | P0 | Checkout preview for an existing stay shows only a 20 VND service line and omits the room charge despite the room rate being 1,000,000 VND/night. | P301 checkout preview; commit intentionally blocked. |
| RT07 | P1 | Cancellation returns API 200 but the open arrivals list continues showing the reservation as confirmed until reload. | Reservation 0149 cancellation. |

## Blocked by the no-BCA boundary

- New check-in, checkout, and stay-extension commits were not executed. The current local source publishes lifecycle events consumed by KBTT/BCA synchronizers without a request-level opt-out; production flags/revision were not independently verified.
- Partner order `MP72ADC...` (2 × 320 VND + 10% fee = 704 VND) remained `Chờ tiếp nhận`; owner UI exposed read-only detail and GuestOS exposed no cancellation. No real payment or checkout was attempted.

## Passing coverage

- Room search/filters, room-cleaning transition, future group/single reservation creation, date validation, same-type reassignment, QR bootstrap and invalid-token isolation, internal quantity min/max guards, partner-order arithmetic (640 + 64 = 704), guest↔staff chat and offline/reconnect sync, GuestOS locale switch, owner isolation, empty states, and responsive home/checkout checks passed.
- Browser tabs reported no console error/warning entries in the inspected room, arrivals, and requests tabs.

## Local remediation contract

Antigravity may edit only the production flows implicated above and their focused tests/contracts. Preserve all existing KBTT/BCA and unrelated dirty changes. Do not touch VPS, deployment, Channex, password/staff CRUD, or provider configuration. After the fixes, run the focused local suites plus UI gate/typecheck/build as required by the changed files, then report exact commands and results. Only after a clean local verification may the coordinator commit and push the scoped remediation.

## Local remediation status

Applied in the local worktree:

- GuestOS service confirmation now shows quantity, unit price and calculated total.
- Check-in room status and hotel-operations conflict codes are translated into actionable Vietnamese messages.
- Room reassignment lists only rooms matching the reservation room type and refreshes reservation detail after edits.
- Room-plan rate snapshots fall back to the room-type base price when a room has no local override.
- Front-desk arrivals/groups refresh on realtime room/channel events, focus, and a visible 15-second reconciliation interval.
- Partner-order detail wraps long order identifiers at narrow widths.
- Checkout is fail-closed when the folio contains service-only lines but the expected room charge is missing; it cannot collect or close an incomplete folio.
- Staff request detail derives display price from the service override/category default when the legacy price field is empty.

Owner reservation deposit writing remains protected by the existing hotel.billing.manage permission, and the owner request route remains intentionally read-only; these are authorization/product-boundary findings and were not broadened locally. Production was not retested after the local changes.

## Local verification and handoff

- `node_modules/.bin/tsc.CMD --noEmit` from `frontends/front-end-vietsage`: PASS.
- `node scripts/verify-ui-rules.cjs`: PASS (912 frontend files scanned).
- `git diff --check`: PASS.
- Focused backend reservation repository regression: PASS, 49/49 (including the room-type base-price fallback).
- Commit pushed to `origin/master`: `cc953bc0` (`fix: remediate GuestOS hotel operations flows`).
- Unrelated `.local/` remains untracked and was not included in the commit. No VPS or production deployment was performed.
