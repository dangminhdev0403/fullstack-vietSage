# KBTT CSLT API — Agent Integration Guide

Machine contract: [`openapi.json`](./openapi.json).

## Authority and provenance

- Provider document: `HD_Tichhop-API-CSLT-v1.3.docx.pdf`.
- Filename says **v1.3**; cover says **v1.4, August 2026**.
- Source PDF SHA-256: `fee9fcd523e7e963326cc93e94fe26f0c9e68b4ac42d7fd60eb4000cdc24d195`.
- This folder is a normalized implementation aid, not an official replacement for the provider document.
- Exact provider field names remain Vietnamese because they are wire-contract identifiers.
- Sample usernames, passwords, Basic credentials, access tokens, and refresh tokens were intentionally removed.

## Agent reading order

1. Read this file for workflow, boundaries, and known ambiguities.
2. Read `openapi.json` for exact methods, paths, fields, requirements, and schemas.
3. Read current VietSage source before implementation; this contract describes the external provider, not VietSage internal APIs.
4. Treat provider response as successful only when both transport handling succeeds **and** body `code === "200"`.
5. Never log authorization headers, credentials, token query parameters, image Base64, or full identity documents.

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
- `GH`: extension; `thoiGianStr` required and cannot exceed 30 days from arrival.
- The provider identifies the guest by `(soGiayTo, loaiGiayTo)`.
- The supplied document defines no corresponding foreign departure-change endpoint.

## Known source ambiguities

| Issue | Normalization |
|---|---|
| Filename v1.3 vs cover v1.4 | Contract version is `1.4-normalized`; retain both provenance values. |
| Overview says 7 APIs; document contains APIs 1–12 | OpenAPI includes all 12 numbered APIs. |
| API 12 section path contains `/kbtt-vn/`; curl example omits `-vn` | OpenAPI follows the section path. Confirm with provider before production. |
| API 8 text references inconsistent API numbers for province input | Use `maTT` from API 7 as `trucThuocTinh`. |
| Catalog nationality examples are not consistently ISO-like | Use provider `maQT` verbatim; never derive blindly from ISO codes. |
| Business error heading says 400; observed/demo behavior can return HTTP 200 with body code `"400"` | Always inspect body `code`; do not trust HTTP 200 as business success. |
| API 12 example text/path includes punctuation/line-wrap artifacts | OpenAPI removes PDF wrapping and trailing punctuation. |
| No limits for names, arrays, images, or some document types | OpenAPI does not invent limits. Enforce only documented constraints plus VietSage trust-boundary limits. |

## Implementation boundary

This contract does **not** authorize automatic submission. VietSage implementation must still define:

- explicit Vietnamese/foreign classification;
- operator review and permissions;
- durable submission states and duplicate prevention;
- PII/image retention;
- demo fixtures and production cutover approval.

Current implementation plan: `../../.hermes/plans/2026-09-13_170839-kbtt-domestic-foreign-reporting.md`.
