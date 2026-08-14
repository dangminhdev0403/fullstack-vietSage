Run the VietSage External Service Order E2E acceptance test using the connected Google MCP/browser automation tools.

IMPORTANT:
- Do NOT use Platform Admin.
- Use separate Incognito/anonymous browser contexts for every role to avoid session/cookie contamination.
- GuestOS must remain anonymous: do NOT log in and do NOT scan a QR code. Open the GuestOS deep link directly.
- Do NOT modify code during testing. This is black-box validation only.
- Do NOT manually refresh to make realtime behavior pass.

TEST CONTEXTS

1. HOTEL OWNER
Email: tenant@vietsage.vn
Password: Admin@123

2. HOTEL FRONT DESK
Email: frontdesk2@vietsage.vn
Password: Admin@123

3. EXTERNAL SERVICE PARTNER
Email: owner.annhien@vietsage.vn
Password: Admin@123

4. GUEST
Anonymous Incognito tab.
Open the existing GuestOS deep link directly instead of scanning QR.

Use separate browser contexts for all four sessions.

PRIMARY E2E FLOW

Guest
→ External Service
→ Create MarketplaceOrder
→ Hotel Owner receives realtime
→ Front Desk can observe the order if supported by the existing hotel realtime model
→ Partner receives realtime
→ Hotel acknowledges
→ Hotel issues Service Voucher
→ Guest receives voucher/code realtime
→ Partner verifies voucher
→ Partner redeems voucher
→ Partner fulfills service
→ Guest + Hotel + Partner receive realtime status
→ Hotel invoice contains the same order
→ Settlement references the same MarketplaceOrder

1. GUEST DISCOVERY

In the anonymous GuestOS session:

- Open GuestOS using the existing deep link.
- Navigate to External Services.
- Verify:
  - Hotel Services and External Services are separated.
  - External Services are discoverable without excessive scrolling.
  - Search works.
  - Category filtering works.
  - No Urgent/Normal options appear.
  - Quantity + pricing unit are displayed correctly.

Select an external service from An Nhiên Spa & Wellness.

Record:
- service name
- provider
- quantity
- pricing unit
- unit price
- total

2. CREATE EXTERNAL ORDER

Create the order from GuestOS.

Record:
- orderId
- orderNumber
- hotelId
- stayId
- roomId
- serviceTenantId
- amount

Verify:
- exactly ONE MarketplaceOrder is created.
- no duplicate Hotel/Partner order exists.

3. REALTIME CREATION

Immediately after creating the order:

HOTEL OWNER:
- Without refresh, verify the new order appears under "Dịch vụ bên ngoài".
- Verify it does NOT appear under "Yêu cầu dịch vụ khách sạn".

FRONT DESK:
- Verify the same external order is visible if Front Desk is part of the existing hotel request/reception flow.
- It must remain coordination/read-only regarding Partner fulfillment.

PARTNER:
- Without refresh, verify the order appears in the Partner Order Console.

GUEST:
- Verify the Guest order state updates without refresh.

Event expected:
external_service_order.created

Expected realtime scopes:
owner:hotel:${hotelId}:requests
service-tenant:${serviceTenantId}
guest-session:${sessionId} and/or guest-stay:${stayId}

4. HOTEL ACKNOWLEDGEMENT

In Hotel Owner or authorized Front Desk context, locate the external order.

Verify:
- Provider
- Service
- Guest
- Room
- Quantity + pricing unit
- Total
- Partner fulfillment status
- Hotel coordination status

Click:
"Tiếp nhận"

Verify:
RECEIVED → ACKNOWLEDGED

Without refresh:
- Guest receives hotel acknowledgement.
- Partner receives the relevant update.
- Hotel UI updates immediately.

Event:
external_service_order.hotel_acknowledged

Hotel MUST NOT have Partner fulfillment actions such as:
Accept
Prepare
Deliver
Complete

5. ISSUE SERVICE VOUCHER

Hotel clicks:
"Cấp phiếu dịch vụ"

Verify:
- exactly ONE ServiceVoucher exists.
- voucher is linked to the SAME MarketplaceOrder.
- voucher number is unique.
- QR/token exists.
- voucher is not duplicated on retry/double-click.
- Hotel coordination status becomes VOUCHER_ISSUED.

Without refresh:
Guest must immediately see:

Dịch vụ bên ngoài
Provider
Service
Quantity + unit
Total
✓ Khách sạn đã tiếp nhận
Mã dịch vụ / Voucher
QR or verification code
Expiry if configured

Event:
external_service_order.voucher_issued

Do NOT require Guest to scan the QR for this test.

6. PARTNER VOUCHER VERIFICATION

In the Partner session:

- Open voucher verification.
- Use the voucher number / verification code obtained from the GuestOS UI.
- Verify the server accepts the valid voucher.

Then test invalid cases:
- wrong voucher
- expired voucher if available
- already redeemed voucher
- voucher belonging to another service tenant

Expected: invalid cases rejected server-side.

7. ATOMIC REDEMPTION

Redeem the valid voucher.

Verify:
ISSUED → REDEEMED

Attempt a second redemption.

Expected:
- second redemption fails.
- no duplicate service consumption.
- no duplicate accounting/settlement record.

8. PARTNER FULFILLMENT

Partner executes the real fulfillment lifecycle:

ACCEPTED
→ PREPARING
→ READY / DELIVERING
→ COMPLETED

At every transition, WITHOUT refresh:

GUEST:
- sees current status.

HOTEL:
- sees current Partner fulfillment status as read-only.

PARTNER:
- sees own updated status.

Event:
external_service_order.status_changed

Hotel MUST NOT be able to mutate Partner fulfillment status.

9. HOTEL BILLING

Verify the completed external order is represented in the guest Hotel invoice/folio.

Check:
- same MarketplaceOrder reference
- correct quantity
- correct pricing unit
- correct total
- no duplicate invoice charge

10. SETTLEMENT

Verify settlement references the SAME MarketplaceOrder.

Check:
- hotelId
- serviceTenantId
- orderId
- grossAmount
- commissionAmount
- netAmount
- settlement status

Expected:
netAmount = grossAmount - commissionAmount

11. RECONNECT / REFRESH RECOVERY

After the order has moved through several states:

- Refresh GuestOS.
- Refresh Hotel Owner.
- Refresh Front Desk.
- Refresh Partner.

Verify:
- current order state remains correct.
- voucher remains correct.
- no duplicate rows.
- no status regression.

If MCP supports socket/network disconnect simulation:
- disconnect/reconnect one client.
- verify snapshot/refetch restores the current state.

12. AUTHORIZATION

Verify:
- Hotel cannot fulfill/cancel Partner order through Partner actions.
- Front Desk cannot access another hotel's external orders.
- Partner cannot access another tenant's orders.
- Partner cannot redeem another Partner's voucher.
- Guest can only see its own order/voucher.

13. UI REGRESSION

Verify:
HOTEL:
- "Dịch vụ bên ngoài" is separate from Hotel operational requests.
- External orders are rendered only in the correct tab/list.
- Table/list is compact and scannable.

PARTNER:
- Order console clearly identifies External Service.
- Fulfillment controls work.

GUEST:
- External Service is clearly distinguished from Hotel Services.
- No Urgent/Normal controls.
- Voucher is easy to find in /g/request or existing request/order detail.
- Guest does not need to call the Partner manually.

14. EVIDENCE

For every major step capture:
- screenshot
- URL
- visible status
- order number
- voucher number
- relevant event/status result

Final report must contain:

PASS / FAIL

1. Guest discovery
2. External order creation
3. Hotel realtime
4. Front Desk visibility
5. Partner realtime
6. Hotel acknowledgement
7. Voucher issuance
8. Guest realtime voucher
9. Partner verification
10. Atomic redemption
11. Partner fulfillment
12. Guest realtime status
13. Hotel realtime status
14. Hotel billing
15. Settlement
16. Reconnect recovery
17. Authorization isolation
18. UI regression

For every FAIL report:
- exact step
- expected
- actual
- likely root cause
- severity P0/P1/P2/P3
- screenshot/evidence

CRITICAL ACCEPTANCE RULE:
A realtime requirement PASSES only when the receiving session updates WITHOUT manual refresh.

Do not change code during this run. Report confirmed defects only.