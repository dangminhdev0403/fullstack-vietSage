Review and complete the **External Service financial flow** across the hotel receptionist/owner payment pages and the external partner side.

This is an important business-flow fix, not just a UI change.

## 1. Clearly distinguish service type

Currently the payment page shows external services simply as **"Dịch vụ"**, which is ambiguous.

Every service/order shown in hotel payment screens must clearly indicate its source:

* **Dịch vụ khách sạn** — service fulfilled by the hotel
* **Dịch vụ bên ngoài** — service fulfilled by an external partner

Apply this consistently in:

* Reception payment page
* Owner payment/revenue pages
* Guest billing/order details
* Payment detail
* Invoice/receipt where applicable
* Any order/service detail drawer or modal

Do not change the existing UI design. Reuse the existing badge/tag/status pattern.

## 2. Important business model

For an external service:

```text
Guest
  ↓
Orders external service
  ↓
External Partner fulfills service
  ↓
Hotel records the charge
  ↓
Guest pays Hotel
  ↓
Hotel collects money on behalf of Partner
  ↓
Hotel owes Partner
```

The guest **does NOT pay the external partner directly**.

The guest may use the external service outside the hotel, but the financial settlement happens through the hotel account.

Therefore:

```text
Guest payment ≠ Hotel revenue
```

For an external service:

```text
Guest payment
    ↓
Hotel collects
    ├── Hotel revenue: 0
    └── Partner payable: + service amount
```

For an internal hotel service:

```text
Guest payment
    ↓
Hotel collects
    └── Hotel revenue: + service amount
```

## 3. External Partner financial view

The external partner currently does not appear to have a proper view of:

* Revenue generated from the hotel
* Amount already collected by hotel
* Amount payable to partner
* Outstanding debt/payable
* Completed orders
* Cancelled/refunded orders
* Settlement history

Add the necessary financial information to the **Partner side** using the existing UI architecture.

The partner should be able to understand:

### Revenue

Show:

* Gross service value
* Completed orders
* Cancelled orders
* Amount collected by hotel
* Amount currently payable to partner

Do not incorrectly label the entire amount as "hotel revenue".

### Partner payable / debt

Use a clear concept such as:

**Công nợ phải trả đối tác**

Example:

```text
Dịch vụ bên ngoài
Giá trị dịch vụ:       500.000đ
Khách đã thanh toán:   500.000đ
Hotel đã thu hộ:       500.000đ
Đối tác được nhận:     500.000đ
Đã quyết toán:         0đ
Còn phải trả:          500.000đ
```

The exact settlement amount must follow the existing commission/fee model if one already exists.

Do not invent a commission model if the backend does not currently support one.

## 4. Settlement lifecycle

External-service financial state should be separated from service operational status.

Do NOT use:

```text
Chờ xử lý
Đang xử lý
Hoàn thành
```

as the financial settlement state.

Use separate concepts:

```text
Service status
    ↓
Operational fulfillment

Payment status
    ↓
Guest payment

Settlement status
    ↓
Hotel ↔ Partner financial settlement
```

Example:

```text
Service:       Hoàn thành
Guest payment: Đã thanh toán
Settlement:    Chưa quyết toán
```

After hotel settles with the partner:

```text
Service:       Hoàn thành
Guest payment: Đã thanh toán
Settlement:    Đã quyết toán
```

## 5. Reception / Hotel payment page

When the receptionist opens a guest bill/payment:

Clearly show:

```text
Dịch vụ bên ngoài
An Nhiên Spa & Wellness
Massage 60 phút
450.000đ
```

instead of simply:

```text
Dịch vụ
Massage 60 phút
450.000đ
```

The receptionist must understand that this money is being collected **on behalf of an external partner**.

## 6. Hotel accounting/revenue

Do not count external-service collections as normal hotel service revenue.

The reporting model must distinguish:

```text
Hotel revenue
+
External service collections
+
Partner payable
```

Example:

```text
Doanh thu khách sạn       10.000.000đ
Thu hộ dịch vụ bên ngoài   2.500.000đ
Công nợ phải trả đối tác   2.500.000đ
```

The 2.5M should not inflate hotel operating revenue.

If the platform already has a commission/service-fee model, only the hotel's actual commission should become hotel revenue.

## 7. Partner settlement workflow

Design the minimum viable workflow for hotel → partner settlement.

Required states:

```text
Đã thu hộ
    ↓
Chờ quyết toán
    ↓
Đã quyết toán
```

Partner should be able to see which completed orders are included in the payable amount.

Hotel owner/admin should be able to reconcile:

* Partner
* Orders
* Gross amount
* Commission/fee if applicable
* Net payable
* Amount already settled
* Outstanding amount
* Settlement date
* Settlement reference

Do not create a complex accounting system. Implement only what is required for this business flow.

## 8. Important constraints

* Do not modify the existing external-service operational workflow unnecessarily.
* Do not redesign existing pages.
* Reuse existing order/payment/revenue components where possible.
* Do not duplicate order records just for accounting.
* Do not treat partner revenue as hotel revenue.
* Do not allow a completed external order to disappear from the partner's financial records.
* Cancelled/refunded orders must be excluded or adjusted correctly in the payable calculation.
* Payment status and settlement status must remain separate.
* Backend must remain the source of truth for financial calculations.
* Frontend must never calculate revenue/debt independently.
* Preserve existing API contracts where possible; extend them minimally if required.

## 9. Before coding

First inspect the existing:

* External service order model
* Hotel payment/billing model
* Partner model
* Revenue/reporting APIs
* Payment status
* Order status
* Existing commission/fee logic
* Existing owner/receptionist payment pages
* Existing partner dashboard

Then implement the smallest coherent change that completes this flow end-to-end.

Do not create mock financial values.

The final result must make this distinction unambiguous:

**Hotel service → Hotel revenue**

**External service → Hotel collects payment → Partner payable → Settlement**

Run backend tests/typecheck and frontend build after implementation.
