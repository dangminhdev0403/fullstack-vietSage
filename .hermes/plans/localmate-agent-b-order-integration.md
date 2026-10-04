# Agent B — Marketplace LocalMate payment integration

**Goal:** Integrate the concrete LocalMate payment service into guest order creation/read/session/cancel and isolate LocalMate completion from generic Marketplace folio/revenue/settlement accounting.

**Depends on:** Agent A integrated into your baseline. Do not start against a baseline lacking `src/modules/localmate-payments`.

**Workspace:** Your assigned Orca worktree only.

**Read first:** `PONYTAIL.md`, `.agents/AGENTS.md`, backend architecture/rules/contracts, concrete payment module public exports, then master plan sections “Money invariants”, “HTTP/API contract”, “Guide completion and financial isolation”, and “Agent B”.

**Allowed writes:**
- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts`
- `services/auth-service/src/modules/marketplace/api/guest-marketplace.controller.ts`
- `services/auth-service/src/modules/marketplace/domain/marketplace-order.schema.ts`
- `services/auth-service/src/modules/marketplace/marketplace.module.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-order.service.spec.ts`
- `services/auth-service/src/modules/marketplace/tests/localmate-payment-order.spec.ts`
- `services/auth-service/src/app.module.ts` only if required to wire the concrete payment module once

**Do not write:** Prisma/migrations, payment internals, notifications, frontend/admin, packages, secrets, n8n, docs.

**Required behavior:**
- Detect LocalMate only through verified service relation; currency `VND` only.
- In the existing order transaction, snapshot `tourTotal`, config rate, rounded VND platform fee, guide remainder; `hotelServiceFeeAmount=0`, `customerTotalAmount=tourTotal`.
- Create one payment row: `NOT_REQUIRED` + notification `PENDING` for zero fee; otherwise `CREATING/BLOCKED`.
- Do not call creation-time Telegram for LocalMate. Generic order path remains unchanged.
- Return payment summary on create/detail/list where contract requires it.
- Add owned `POST orders/:orderId/payment-session`, delegating to Agent A service; stable ownership and terminal-state behavior.
- Cancellation: unpaid cancels/expires; paid pre-ack persists refund intent and delegates idempotent refund; post-ack returns stable 409/admin review.
- LocalMate complete creates no full-tour folio, hotel revenue entry, guide settlement, or voucher side effect that implies VietSage owes 85%. Generic orders retain current accounting.
- Preserve capacity and idempotency semantics.

**Acceptance:** Focused regressions prove 15/85, zero fee, config snapshot immutability, no early Telegram, ownership, cancel/refund paths, no LocalMate folio/revenue/settlement, and unchanged generic order completion.

**Focused check:**
```bash
cd services/auth-service && node node_modules/jest/bin/jest.js --runInBand src/modules/marketplace/tests/marketplace-order.service.spec.ts src/modules/marketplace/tests/localmate-payment-order.spec.ts
```

**Forbidden:** migration application, provider writes, install, commit/push/deploy. Stop only for concrete contract/scope blocker; otherwise finish.
