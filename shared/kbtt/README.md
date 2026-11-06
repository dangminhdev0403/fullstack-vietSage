# KBTT CSLT API — Agent Integration Guide

Machine contract: [`openapi.json`](./openapi.json).

## Authority and provenance

- Provider document: `HD_Tichhop-API-CSLT-v1.3.docx.pdf`.
- Filename says **v1.3**; cover says **v1.5, October 2026**.
- Source PDF SHA-256: `ac02fc97c8e48b7f62d28e91570d73fa9ecfc9de95cfc737ae6b6b0e7a8ec8f2`.
- This folder is a normalized implementation aid, not an official replacement for the provider document.
- Exact provider field names remain Vietnamese because they are wire-contract identifiers.
- Sample usernames, passwords, Basic credentials, access tokens, and refresh tokens were intentionally removed.

## Agent reading order

1. Read this file for workflow, boundaries, and known ambiguities.
2. Read `openapi.json` for exact methods, paths, fields, requirements, and schemas.
3. Read current VietSage source before implementation; this contract describes the external provider, not VietSage internal APIs.
4. Treat provider response as successful only when both transport handling succeeds **and** body `code === "200"`.
5. Never log authorization headers, credentials, token query parameters, image Base64, or full identity documents.

## Manual login, demo testing and real-provider approval

- The approved test origin is `https://api-kbtt.ai-vlab.com` (no trailing slash in `KBTT_BASE_URL`). Use the `test_kblt` entry in the ignored repository-root `account.json` for its `demo_url`, `username` and `password`. Do not copy those credentials into tracked files.
- Demo exception authorized by the user: agents may log in, check, refresh and operate only account `demo_tich_hop` at `https://api-kbtt.ai-vlab.com`, using ignored local test credentials. Verify both origin and account; use bounded synthetic fixtures only. For every other account/origin, agents must not initiate login or reauthentication through UI, HTTP/API, Postman or helpers. Open `https://vietsage.localhost/owner/hotels/cmq2k2lm0003f2oui3ifqp808/settings?tab=integrations` for the user to log in, then wait for explicit confirmation. See `.agents/AGENTS.md` for the canonical rule.
- Development setup keeps `KBTT_AUTO_SUBMIT_LIVE_ENABLED=false`, `KBTT_AUTO_SUBMIT_KILL_SWITCH=true` and `KBTT_STAY_LIFECYCLE_ENABLED=false`. After the user's login confirmation, an already authorized controlled demo test may exercise documented non-login adapter operations with synthetic fixtures; these settings keep the existing hotel queues from being drained.
- Login and token Basic auth must come from the supplied provider integration contract or an explicitly supplied demo configuration. Do not guess missing values. Take the establishment ID from the successful demo login response.
- Use synthetic guests only. Keep demo credentials, sessions, queues and declaration history separate from real data. Restart after changing the origin; never forward saved real credentials or tokens to the demo or replay existing real declarations.
- Real BCA operations require a clear user command authorizing the specific real operation. Code, test, build, migration and project-start permissions or a manual-login confirmation do not grant that authorization. This includes real authentication, refresh/revoke, reads, declarations, extensions and checkout. See the canonical rule in `.agents/AGENTS.md`.

## Endpoint matrix

| API | Method and path | Auth | Purpose |
|---|---|---|---|
| 1 | `POST /authorization-service/oauth/token` | Login Basic | Get `AccessToken`, `RefreshToken`, `Exp`, CSLT metadata. |
| 2 | `POST /authorization-service/oauth/refresh-token?refresh_token=...` | Token Basic | Rotate both tokens before expiry. |
| 3 | `DELETE /authorization-service/oauth/revoke?access_token=...` | Token Basic | End provider session. |
| 4 | `POST /client-service/kbtt/kbtt-3th` | Bearer | Foreign guest temporary residence. |
| 5 | `POST /client-service/kbtt-vn/kbtt-3th` | Bearer | Vietnamese guest stay notice. |
| 6 | `GET /cms-backend/public/dm-qt/3th/get-all` | Public | Nationalities. |
| 7 | `GET /cms-backend/public/dm-tinh-tp/get-all` | Public | Provinces/cities. |
| 8 | `GET /cms-backend/public/dm-phuong-xa?trucThuocTinh=...` | Public | Wards/communes by province. |
| 9 | `GET /cms-backend/public/ly-do-cu-tru/get-all` | Public | Stay reasons. |
| 10 | `GET /cms-backend/public/loai-giay-to/get-all` | Public | Document types. |
| 11 | `GET /cms-backend/public/noi-cu-tru/get-all` | Public | Residence places. |
| 12 | `POST /client-service/kbtt-vn/kbtt-3th/doi-ngay-tra-phong` | Bearer | Vietnamese early departure/extension. |
| 13 | `POST /client-service/kbtt/kbtt-3th/doi-ngay-tra-phong` | Bearer | Foreign guest early departure/extension. |

## Token workflow

```text
connect
  POST token
  require code == "200"
  require authority "kbtt:create-3th"
  keep AccessToken + RefreshToken + Exp server-side

before each protected call
  if Exp is within 60 seconds: POST refresh-token
  atomically replace BOTH returned tokens
  if refresh definitively fails: re-login only under the approved credential policy

explicit disconnect
  DELETE revoke
  clear in-memory session
```

`refresh_token` and `access_token` are provider-defined query parameters. Ensure reverse-proxy/application logs redact their values.

## Vietnamese and foreign declarations are different contracts

### Shared source data

Both require one person, room/stay timing, full name, sex, and date of birth. VietSage should retain one canonical occupant record and project it into one provider payload. Do not combine the two payload types.

### Foreign — API 4

Required provider fields:

- `hoTen`
- `quocTich`: code from API 6; **do not assume ISO-3166**
- `soHoChieu`
- `gioiTinh`: `M | F`
- `loaiNgayThangNamSinh`: `D | Y`
- `ngayThangNamSinhStr`
- `ngayDenCsltStr`
- `ngayDiDuKienStr`
- `thoiHanTamTruStr`

`soPhong` is conditionally required for provider-listed accommodation types including hotels/guesthouses. `anhHoChieuB64` is optional.

For foreign year-only birth dates, encode `loaiNgayThangNamSinh: Y` with `YYYY-01-01` at the BCA boundary; retain only `YYYY` in PMS data. Do not label it as an exact known date. Foreign residence validity must be explicitly supplied; never infer it from the hotel departure. Missing validity blocks submission.

### Vietnamese — API 5

Required provider fields:

- `hoTen`
- `gioiTinh`: `M | F`
- `ngayThangNamSinhStr`
- `ngayDenCsltStr`
- `ngayDiDuKienStr`
- `lyDoCuTru`: ID from API 9
- `loaiGiayTo`: ID from API 10
- `soGiayTo`

Optional domestic-only fields include phone, residence type, province, ward, address, notes, and document images. `lyDoChiTiet` must have a value when `lyDoCuTru == 20`. `soPhong` has the same conditional requirement.

### Document-number rules

| `loaiGiayTo` | Type | Rule documented by provider |
|---:|---|---|
| 1 | Thẻ CCCD | Exactly 12 digits. |
| 2 | CMND | Exactly 9 or 12 digits. |
| 3 | Driver licence | Alphanumeric, max 20. |
| 4 | Passport | Alphanumeric, max 10. |
| 5 | Birth certificate | Alphanumeric; no maximum documented. |
| 6 | Health insurance card | Alphanumeric, max 20. |
| 7 | Personal-ID-number notice | Alphanumeric; no maximum documented. |
| 8 | Thẻ Căn Cước | Exactly 12 digits. |

No document number may contain spaces or special characters.

## Catalog synchronization

- API 6–11 are public reference data.
- Cache normalized records by catalog type + provider code/ID; wards also key by parent `trucThuocTinh`.
- Store labels as display data. Submit provider codes/IDs only.
- Refresh into a candidate set; replace the active set only after complete validation.
- On refresh failure, retain the last valid set.
- Mark missing old entries inactive instead of deleting codes referenced by drafts or submitted snapshots.
- The PDF recommends startup caching but defines no TTL, ETag, version, pagination, or deletion semantics. TTL remains an application policy, not a provider fact.

## Submission reliability

- The provider accepts arrays, but errors refer to a 1-based item position.
- Prefer one guest per HTTP request. A batch UI may sequence those requests.
- The provider documents no idempotency key and no declaration lookup endpoint.
- A definitive business rejection may be retried after correction.
- A timeout/reset after transmission has an ambiguous outcome. Record `UNKNOWN`; do not retry automatically.
- Persist an immutable payload fingerprint/snapshot and sanitized provider result for audit. Never persist/log tokens or credential values with it.
- External failure must not roll back VietSage check-in/check-out.

## API 12 scope

API 12 applies only to Vietnamese guests already registered with API 5:

- `TS`: early departure; `thoiGianStr` not required.
- `GH`: extension; `thoiGianStr` is required, must be strictly later than the departure currently registered with BCA, and cannot exceed 30 days from arrival.
- The provider identifies the guest by `(soGiayTo, loaiGiayTo)`.

## API 13 scope

API 13 applies to foreign guests already registered with API 4 (Section 15, Version 1.5):

- `TS`: early departure; `thoiGianStr` not required.
- `GH`: extension; `thoiGianStr` is required (`YYYY-MM-DD HH:mm:ss`) and must be strictly later than the departure currently registered with BCA.
- `thoiHanTamTruVnStr`: temporary residence duration in Vietnam (`YYYY-MM-DD HH:mm:ss`). For `GH`, this field is required when the existing BCA declaration has no temporary-residence duration in Vietnam; otherwise it may be omitted to retain the existing value. Do not derive this value from the hotel departure date.
- The provider identifies the foreign guest by `(soHc, quocTich)`.

## Known source ambiguities

| Issue | Normalization |
|---|---|
| Filename v1.3 vs cover v1.5 | Contract version is `1.5-normalized`; retain both provenance values. |
| Overview says 7 APIs; document contains APIs 1–13 | OpenAPI includes all 13 numbered APIs. |
| API 8 text references inconsistent API numbers for province input | Use `maTT` from API 7 as `trucThuocTinh`. |
| Catalog nationality examples are not consistently ISO-like | Use provider `maQT` verbatim; never derive blindly from ISO codes. |
| Business error heading says 400; observed/demo behavior can return HTTP 200 with body code `"400"` | Always inspect body `code`; do not trust HTTP 200 as business success. |
| API 12 example text/path includes punctuation/line-wrap artifacts | OpenAPI removes PDF wrapping and trailing punctuation. |
| No limits for names, arrays, images, or some document types | OpenAPI does not invent limits. Enforce only documented constraints plus VietSage trust-boundary limits. |

## VietSage stay lifecycle delivery

This section describes local VietSage behavior. It adds no provider endpoint or wire field.

### Activation

- Apply the additive migration `services/auth-service/prisma/migrations/20261105070000_kbtt_stay_lifecycle_delivery/migration.sql` to the explicitly approved database before running the updated application, even with lifecycle delivery disabled: initial submissions now use `submittedCsltId`.
- Regenerate the auth-service Prisma client from the updated schema before compiling or running this implementation. Check the selected database and migration status before applying changes.
- New lifecycle calls require `KBTT_STAY_LIFECYCLE_ENABLED=true` and `KBTT_AUTO_SUBMIT_LIVE_ENABLED=true`; `KBTT_AUTO_SUBMIT_KILL_SWITCH=true` stops delivery. Existing configuration/connection requirements still apply.
- Unit tests, builds, local database checks and demo-provider checks establish different evidence. None proves real BCA acceptance or authorizes a production cutover.

### Delivery rules

- Persist lifecycle events with the stay transaction. Local operation records and consumer receipts prevent repeated processing; they are not a provider idempotency guarantee.
- Preserve the original successful declaration and immutable submission history. Track pending lifecycle operations separately, with the last BCA-confirmed payload/departure as the comparison baseline.
- Snapshot the BCA establishment ID (`submittedCsltId`) before each initial transmission and retain it with the original declaration. Lifecycle delivery must match that establishment and the actual authenticated session. Legacy declarations without this evidence remain blocked for reconciliation; do not backfill it from the current connection.
- Compare lifecycle departure dates in `Asia/Ho_Chi_Minh` for both guest kinds. An hour-only edit within the acknowledged departure day sends neither GH nor a new check-in, even after the checkout hour passes. Initial dispatch and transactional lifecycle claims use the same calendar-day guard. Keep actual PMS timestamps for operations/billing and retain the documented `YYYY-MM-DD HH:mm:ss` wire format.
- For a confirmed later departure day while the last BCA-acknowledged departure day is today or later, send `GH` through API 12/13. Compare with the latest successful extension/recovery, falling back to the original declaration. Count the domestic GH limit as 30 calendar days from arrival; compare foreign residence validity by calendar day without changing its confirmed value. Multiple local edits not yet transmitted may be superseded by the latest confirmed departure day; never change a transmitted snapshot.
- An overdue indicator alone supplies no new departure date and does not trigger a fresh declaration. A later departure day, no earlier than today, must be confirmed first.
- Local overdue policy: once the last BCA-acknowledged departure day is before today in Vietnam and a later departure day (today or later) is confirmed, send a new declaration directly through API 4/5 (`RECOVER`), without probing GH first. Preserve the actual original arrival and acknowledged provider identity; validate the full declaration and foreign residence validity. The domestic 30-day limit documented for GH is not invented for API 5. This is a PMS policy using existing APIs, not a documented provider update/expiry guarantee.
- Deduplicate recovery by the source extension event and acknowledged target departure. A later expiry cycle can create a new recovery; repeated events for an already acknowledged departure send nothing. A rejection remains rejected and an uncertain result remains unknown; neither triggers another declaration.
- A duplicate rejection does not prove the requested new departure was accepted. Keep the rejection available for reconciliation.
- Live demo observation (2026-11-05): recovery declarations for both guest kinds were rejected with business code `400` as still staying/already declared on the same date. The last acknowledged departure having elapsed did not prove provider expiry. Keep these operations rejected for reconciliation; do not mark them synchronized, repeat them automatically, change the actual arrival, or invent TS followed by check-in. See `docs/audits/2026-11-05-bca-demo-runtime.md` for the bounded runtime evidence.
- Use `TS` for actual completed checkout. A room becoming dirty, ready, blocked, or under maintenance does not itself mean a guest checked out. The provider may reject a checkout when its declaration is no longer active; do not manufacture a preceding extension or declaration.
- Keep operations for checked-out stays until their results are resolved. Order operations for the same provider identity so delayed work from an old stay cannot affect a newer stay.
- Record timeout/reset/unfinished transmission as `UNKNOWN`. Do not retry automatically or reset delivery guards after 30 minutes; resolve the uncertainty before dependent delivery.
- Date reductions, same-establishment room transfers, identity corrections, and retrospective declarations are not general update capabilities documented by this provider contract. Preserve the local facts and record unresolved differences without fabricating provider calls.


### State/action matrix (local policy)

| Confirmed local action | Vietnamese guest | Foreign guest |
| --- | --- | --- |
| Check-in with valid declaration | API 5, background queue | API 4, background queue |
| Extend to a later day; acknowledged day is today or later | API 12 GH, at most 30 days from actual arrival | API 13 GH, within independently confirmed residence validity |
| Acknowledged day is before today + confirm a later departure day | API 5 new declaration, actual arrival preserved | API 4 new declaration, actual arrival and residence validity preserved |
| Change checkout hour within the acknowledged day | No provider call | No provider call |
| Overdue indicator without a later departure day | No provider call | No provider call |
| Completed checkout (including debt settlement) | API 12 TS, original acknowledged identity | API 13 TS, original acknowledged passport/nationality |
| Room cleaning/ready/maintenance/blocked | No provider call | No provider call |
| Unsent draft correction | Update local draft; validate before queueing | Update local draft; validate before queueing |
| Identity correction/room move after submission | No undocumented update call; reconcile separately | No undocumented update call; reconcile separately |
| Local validation error | Block before transmission | Block before transmission |
| Explicit business rejection/duplicate | Record rejection for review; no assumed success | Record rejection for review; no assumed success |
| Timeout/interruption/unrecognized response | UNKNOWN; block dependent sends, no blind retry | UNKNOWN; block dependent sends, no blind retry |

The matrix describes implemented routing and capability limits. It does not assert provider acceptance for every scenario.

### Background delivery and the KBTT tab

- Room operations complete locally; provider delivery runs after the PMS transaction. The browser is not the submission worker.
- Explicit declaration submissions enqueue a durable `READY` / `LOCAL_QUEUED` record. A queued response confirms local acceptance only; the minute worker records the eventual BCA outcome under the existing live/kill controls.
- Opening or refreshing the KBTT tab only reads stored evidence. The declarations GET includes a hotel/room-scoped `delivery` summary and bounded recent issues, including guests who already checked out. No new BCA lookup API is introduced.
- The tab distinguishes paused delivery, queued/sending work, confirmed results, and issues requiring review. Missing or failed reads must not display a healthy/successful state. A stored `CONNECTED` status alone does not prove a current provider session or that every lifecycle update succeeded.

### Lookup and the 30-minute observation

- The supplied GET APIs return catalogs only. Neither this contract nor the implementation adds a provider declaration-lookup API.
- VietSage declaration-list GETs read local evidence; they do not verify BCA's current declaration state.
- A user observed records disappearing from a list on the BCA website after about 30 minutes. The supplied PDF does not define that list's lifecycle or a 30-minute declaration TTL. Disappearance is not evidence of deletion, checkout, failure, or permission to declare again.

## Implementation boundary

This contract does **not** authorize automatic submission. VietSage implementation must still define:

- explicit Vietnamese/foreign classification;
- operator review and permissions;
- durable submission states and duplicate prevention;
- PII/image retention;
- demo fixtures and production cutover approval.
