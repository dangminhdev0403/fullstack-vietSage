# BCA demo runtime — 2026-11-05

Status: PARTIAL LIVE VERIFICATION WITH PROVIDER REJECTIONS. The demo accepted initial declarations, GH and TS for both guest kinds. Expired-departure recovery was transmitted but rejected for both kinds. This is not an all-cases-pass result.

## Environment and authorization

- Frontend, backend and local PostgreSQL are running. No migration was applied during this continuation.
- Provider origin: https://api-kbtt.ai-vlab.com; account: demo_tich_hop. No real-provider origin or real credentials were used.
- Added only hotel.kbtt.declarations.manage to the local TENANT_OWNER role after explicit approval covering its four local assignees: 70 → 71 permissions. The earlier supplemental TENANT_KBTT_DECLARATIONS role remains assigned to the tenant account; it is not the active login role.
- Refreshed the application's demo connection through its UI at 20:09:21 local. This fresh check succeeded; the evidence does not rely solely on a saved connected badge.
- Runtime delivery window closed at the end: enabled=false, expiresAt=null. Hotel autoSubmitEnabled=false. The guarded backend remains running with delivery disabled.

## Live results

All times below are Asia/Ho_Chi_Minh (UTC+7). Success requires the provider's business code 200.

| Scenario | Vietnamese | Foreign | Evidence boundary |
| --- | --- | --- | --- |
| Initial declaration | API5, 200 at 19:54:00 | API4, 200 at 19:54:00 | Draft edited/saved and queued in UI; actual minute worker and local DB |
| Future extension after acknowledged 19:55 departure elapsed | API5 RECOVER, 400 at 19:57:00 | API4 RECOVER, 400 at 19:57:00 | Room extension UI → event → actual worker → persisted REJECTED |
| Completed checkout | API12 TS, 200 at 20:01:00 | API13 TS, 200 at 20:01:00 | UI cash settlement of synthetic 100,000 VND → checkout → event → actual worker |
| GH with same-day departure, called immediately after initial | API12, 400 at 20:03:44 | API13, 200 at 20:03:45 | Actual compiled provider client and production departurePayload mapper; separate synthetic guests; not a PMS/UI GH assertion |
| GH with original departure 6 Nov 12:00, extended to 7 Nov 12:00, after >60 seconds | API12, 200 at 20:06:00 | Not repeated | Actual compiled provider client and production mapper; a new synthetic VN guest |
| TS cleanup for adapter-only synthetic guests | Both VN adapter guests, 200 | Foreign adapter guest, 200 | Actual compiled client; all five successfully declared synthetic guests received successful TS |
| Duplicate transmission across worker ticks | No repeated calls observed | No repeated calls observed | Rejected recoveries stayed rejected through later ticks; checkout sent once per guest |

Total: **15 declaration/departure API calls**, **12 successes**, **3 explicit business rejections**. Six calls came from the UI-triggered PMS/worker path; nine came from isolated direct-client checks. Authentication/catalog traffic is not included in this count.

## Provider behavior that limits the proposed lifecycle

### Recovery is not guaranteed by expiration of the acknowledged departure

For both kinds, BCA demo rejected the new declaration as still staying/already declared on the same date. The original arrival (17:40:24), identity and foreign residence validity were preserved. Each RECOVER operation is REJECTED with code 400; the requested 19:58 departure was not recorded as acknowledged. No fallback GH, invented lookup, automatic TS+check-in or repeated recovery was triggered.

The original declarations remained acknowledged; a later actual checkout successfully sent TS for both. Historical recovery rejection records remain in the DB. After successful TS, the current delivery summary intentionally suppresses obsolete non-UNKNOWN extension/recovery issues for that completed identity; it does not erase their history.

This demonstrates that the user-observed disappearance from a BCA web list and the PMS departure deadline do not establish provider deletion or expiry. The supplied GET APIs remain catalogs only. The local RECOVER routing is implemented, but universal provider acceptance has not been established.

### A VN GH rejection also occurred before the stated departure

A separate VN initial declaration succeeded with departure about ten minutes later on the same day, but its immediate GH returned 400 saying the document did not exist. TS then succeeded. A new VN case with tomorrow's departure, tested after more than 60 seconds, accepted GH and TS.

Both timing and the departure date changed in that follow-up, so these observations do not isolate the cause. No undocumented same-day prohibition, fixed waiting period or automatic retry rule was added to application behavior.

## Application fixes and validation

Two form-save defects were reproduced and corrected:

1. A Vietnamese draft could inherit foreign quocTich from cached catalog data.
2. A foreign draft could inherit domestic diaChi from PMS residence data.

The form now initializes/infers fields for the selected guest kind. Both save paths use the kind-aware formatter, which removes only known opposite-contract fields and retains unknown fields for backend strict validation. Foreign residence validity remains explicitly supplied; year-only DOB remains Y with YYYY-01-01 at the provider boundary.

Changed source in this continuation:

- frontends/front-end-vietsage/src/features/kbtt/components/kbtt-declarations-page.tsx
- frontends/front-end-vietsage/src/features/kbtt/types/kbtt-contract.ts
- frontends/front-end-vietsage/src/features/kbtt/kbtt-contract.test.mjs

Checks after those fixes: 15 KBTT contract/regression tests passed; UI verification gate passed; frontend production build and TypeScript passed. Backend production build passed earlier in this run. The final browser run successfully saved and submitted both guest kinds. Documentation-only additions afterward do not require another production build.

## Isolation findings

- No legacy guest was transmitted by the guarded declaration/departure client. It permitted only the two approved PMS fixture identities. Adapter-only checks used three new synthetic identities and did not modify PMS declarations.
- All 49 baseline declaration statuses/provider codes are unchanged; all four baseline lifecycle-operation rows are unchanged in the recorded projection.
- **The full baseline was not unchanged:** a run at 20:00 revalidated nine old locally invalid declarations, changing their updatedAt values. All nine retained FAILED/LOCAL_VALIDATION, and no provider declaration/departure call was emitted for them. The settings UI shows the run with total 9, successful 0, failed 9. The run-status label says “Thành công”, which must not be read as successful guest submissions.
- The guard covered provider delivery, but did not prevent that scheduled local preparation/revalidation. Future isolated runs should block old scheduled jobs in addition to checking running jobs and eligible send queues. No historical rows were restored or altered to conceal this observation.
- Final PMS fixture: QA04-A, stay CHECKED_OUT, room PROCESSING (Chờ dọn), no pending lifecycle event. The 100,000 VND fake cash settlement was explicitly approved immediately before the UI action.

## Remaining evidence gaps

- GH acceptance is proven at the real client/mapper boundary; this continuation did not complete the entire UI → DB → worker GH path before a valid acknowledged deadline.
- Recovery acceptance after a provider-defined archival/expiry event is unproven; the provider contract supplies no lookup/TTL guarantee. The observed immediate cases failed with duplicate/still-staying responses.
- No live timeout, mid-send crash, malformed provider response, token-expiry race or restart recovery was deliberately induced. Unit/mock results are separate evidence; no ambiguous request was blindly retried.
- These results apply to the approved demo only and do not establish real-BCA production readiness.

## Evidence artifacts

Directory: C:/Users/Dangminhdev0403/.codex/visualizations/2026/11/04/01a1a7d0-83c3-72f2-9b7e-0976a3d5afb6/kbtt-ui-20261105

- bca-live-provider-events.jsonl — actual PMS worker provider calls.
- bca-live-rejections.json — sanitized recovery rejection messages.
- bca-gh-provider-smoke.json — bounded direct-client initial/GH/TS results.
- bca-vn-gh-followup.json — delayed VN GH follow-up using tomorrow's departure.
- bca-live-db-baseline.json / bca-live-db-current.json — scoped metadata snapshots.
- bca-live-summary.json / bca-live-test-journal.json — result counts and cleanup state.
- 21-checkout-live-prepared.png / 22-checkout-live-result.png — synthetic checkout preparation/result.
- 23-final-demo-connection.png — fresh final demo connection check in UI.

### Subsequent local calendar-day policy change

After the runtime observations above, the user selected Vietnam calendar-day comparisons for both guest kinds. Hour-only departure edits no longer send GH or trigger RECOVER; RECOVER requires an acknowledged departure day before today and a confirmed later departure day. The earlier hour-based tests remain historical evidence of provider rejection, not verification of the revised day-based path. Focused local mocked tests cover the revised routing; no new live provider acceptance is claimed.

## Calendar-day live follow-up — 21:13 Vietnam time

The backend was rebuilt successfully and restarted with the calendar-day implementation; frontend and PostgreSQL are running. The demo connection was checked successfully in UI at 20:52:07. This follow-up used only two new synthetic guests, BCA DAY VN (VNM) and BCA DAY FOREIGN (RUS), in QA04-F. Historical rejection results above remain unchanged.

| Scenario | Vietnamese | Foreign | Evidence |
| --- | --- | --- | --- |
| Initial check-in; departure 6 Nov 12:00 | 200 at 21:03 | 200 at 21:03 | UI check-in/draft correction → DB → actual minute worker → demo |
| Hour-only extension, 6 Nov 12:00 → 13:00 | No provider call | No provider call | Both operations SUPERSEDED / ALREADY_SYNCHRONIZED, attemptedAt=null; journal remained at two calls |
| Date extension, 6 Nov 13:00 → 7 Nov 13:00 | GH 200 at 21:06 | GH 200 at 21:06 | UI extension → DB → actual minute worker → demo |
| Completed early checkout on 5 Nov | TS 200 at 21:13 | TS 200 at 21:13 | Local API settlement/checkout → DB → actual minute worker → demo; final state verified in UI |

This follow-up produced **6 provider declaration/departure calls, all business code 200**, covering initial, GH and TS for both guest kinds. It closes the earlier missing UI → worker GH evidence gap. Authentication and catalog reads are excluded from the count.

### Invalid inputs and settlement boundary

- UI rejected impossible DOB 31/02/1990 with “Ngày sinh không hợp lệ.” before check-in.
- Missing foreign residence validity produced FAILED / LOCAL_VALIDATION, “Thời hạn tạm trú là bắt buộc”, without a provider submission. It was corrected explicitly in UI before delivery.
- UI rejected extension to 4 Nov with “Thời gian gia hạn phải sau hạn trả phòng hiện tại và ở tương lai”, without a provider call.
- Local payment API rejected amounts 0 and -1 with HTTP 400 / VALIDATION_ERROR, and 200001 against a 200000 balance with HTTP 400 / PAYMENT_AMOUNT_EXCEEDS_BALANCE.
- Checkout was reviewed on UI, but the final fake cash payment of 200000 VND and checkout were performed through the local API, **not the browser payment button**. No real payment gateway was used. UI then showed QA04-F as Chờ dọn and BCA DAY VN as Đã trả phòng. Both occupants received successful TS; pending lifecycle events for this stay are zero.

### Final isolation and limitations

- Guard verified zero due legacy hotels/runs/other queued declarations/other pending operations/events before enabling the bounded window; only the two synthetic identities were permitted. No old/real guest queue was replayed in this follow-up.
- Delivery window is closed again: enabled=false, expiresAt=null. Final UI shows “Gửi nền BCA đang tạm dừng” and last BCA confirmation 21:13 05/11/2026. Project processes remain running. No application source was edited during this operational follow-up.
- RECOVER after a real Vietnam calendar-day transition remains **not live-tested**. Earlier same-day hour-based recovery rejections do not prove acceptance of the revised path. No provider archival/TTL guarantee is assumed.
- At the original small viewport (approximately 674×697), advancing the second-guest check-in did not expose confirmation in several attempts; the 1440×1000 desktop viewport worked. This is a suspected small-viewport interaction issue, not a confirmed root cause or completed responsive audit. The temporary viewport override was reset afterward.
- CDP evidence is limited: 178 records, truncated capture; 14 net::ERR_ABORTED requests all marked canceled=true. They correlate with navigation/read requests and analytics, not BCA writes. These canceled requests/capture limits remain NEEDS_REVIEW; they are not treated as a clean runtime gate or a proven product defect. Browser error/warning log query returned no entries. DB/provider evidence independently confirms the six business outcomes.

Additional artifacts in the evidence directory above:

- bca-day-provider-events.jsonl; bca-day-01-initial.json; bca-day-02-hour-only.json; bca-day-03-date-extension.json; bca-day-04-checkout.json.
- bca-day-negative-payments.json; bca-day-checkout-api.json; bca-day-control.json; bca-day-network.json; bca-day-canceled-requests.json.
- 24-day-initial-success.jpg; 25-day-invalid-extension.jpg; 26-day-hour-only-local.jpg; 27-day-checkout-room.jpg; 28-day-departure-ui.jpg; 29-day-final-paused.jpg.
