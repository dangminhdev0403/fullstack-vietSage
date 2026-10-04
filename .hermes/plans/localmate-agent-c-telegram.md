# Agent C — Durable paid-order Telegram handoff

**Goal:** Dispatch LocalMate order cards only after payment eligibility, with DB-backed atomic claim/lease/retry and preserved guide ownership checks.

**Workspace:** Your assigned Orca worktree only.

**Read first:** `PONYTAIL.md`, `.agents/AGENTS.md`, `docs/RULES.md`, service architecture/rules, then the master plan sections “Telegram handoff” and “Agent C”.

**Allowed writes:**
- `services/auth-service/src/modules/notifications/application/telegram-marketplace-bridge.service.ts`
- `services/auth-service/src/modules/notifications/application/localmate-paid-order-notification.service.ts`
- `services/auth-service/src/modules/notifications/notifications.module.ts`
- `services/auth-service/src/modules/notifications/tests/telegram-marketplace-bridge.service.spec.ts`
- `services/auth-service/src/modules/notifications/tests/localmate-paid-order-notification.service.spec.ts`

**Existing dirty work:** bridge service/spec contain verified LocalMate ownership fixes. Preserve them exactly unless a focused regression proves a compatible root-cause adjustment.

**Do not write:** existing conversation retry service/spec, Prisma, Marketplace, frontend, packages, secrets, n8n, docs.

**Required behavior:**
- Eligible only when payment is `PAID` or `NOT_REQUIRED`, order remains `PENDING`, assigned LocalMate and active binding match.
- Scheduled worker atomically claims due `PENDING`/`FAILED` rows using conditional `updateMany`; uses finite lease and bounded backoff.
- Message includes order number, service/time/party, tour total, VietSage paid amount, guide remaining amount, Accept/Reject buttons.
- Send success records `SENT`; transient failure schedules retry; terminal binding/ownership error stops retry safely.
- Never send before payment. Duplicate worker ticks/multi-instance claims do not send concurrently.
- Preserve callback ownership enforcement and existing protected Telegram message behavior.

**Acceptance:** Focused tests cover pre-payment block, paid/not-required eligibility, two-worker claim race, lease recovery, transient retry, terminal binding failure, correct monetary payload, wrong-guide callback rejection.

**Focused check:**
```bash
cd services/auth-service && node node_modules/jest/bin/jest.js --runInBand src/modules/notifications/tests/telegram-marketplace-bridge.service.spec.ts src/modules/notifications/tests/localmate-paid-order-notification.service.spec.ts
```

**Forbidden:** provider writes, commits, pushes, migration application, dependency install. Stop only on concrete contract/scope blocker; otherwise finish.
