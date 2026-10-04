# Agent D — GuestOS Checkout QR

**Goal:** Replace the current no-upfront-payment LocalMate submit UX with explicit fee confirmation, Stripe Checkout QR/direct link, bounded payment-state polling, and complete VI/EN/RU states.

**Workspace:** Your assigned Orca worktree only.

**Read first:** `PONYTAIL.md`, `.agents/AGENTS.md`, frontend runtime/design rules, `.agents/skills/design-dna/SKILL.md`, `.agents/skills/ui-quality-promax/SKILL.md`, then master plan sections “UI contract” and “Agent D”.

**Allowed writes:**
- `frontends/front-end-vietsage/src/features/marketplace/types/marketplace-contract.ts`
- `frontends/front-end-vietsage/src/features/marketplace/repositories/guest-marketplace-repository.ts`
- `frontends/front-end-vietsage/src/features/marketplace/resources/guest-marketplace-resource.ts`
- `frontends/front-end-vietsage/src/features/marketplace/queries/use-guest-marketplace.ts`
- `frontends/front-end-vietsage/src/features/marketplace/components/localmate-order-request-dialog.tsx`
- one focused test beside this flow
- `frontends/front-end-vietsage/src/app/api/guest/marketplace/[...path]/route.ts`
- the exact GuestOS backend service methods used by that route
- one minimal secret-free payment-return page only if existing routing requires it

**Do not write:** request-realtime files, backend service, marketplace-admin, n8n, package/lockfiles, secrets.

**Frozen API:** order/create/detail returns `payment` string fields and nullable `checkoutUrl`/`expiresAt`; `POST /guest/marketplace/orders/:orderId/payment-session` creates/returns the hosted session. Browser redirect never marks paid.

**Required behavior:**
- Explicit confirmation shows backend-authoritative total, VietSage fee rate/amount, guide remainder, expiry/refund policy.
- Render `QRCodeSVG` from installed `qrcode.react` and an accessible direct `Pay now` link to the same URL; no dependency changes.
- Session retry reuses the same order; never creates a duplicate order.
- Poll existing order detail every 2s only for `CREATING`, `OPEN`, `REFUND_PENDING`; stop on terminal state/unmount.
- Handle disabled/provider unavailable, open, paid/not-required, expired/cancelled/failed, refund pending/refunded, disputed without raw provider errors.
- Do not persist Checkout URL in browser storage or expose secrets/order session tokens in return URL.
- Complete VI/EN/RU copy; Vietnamese voice remains `em`–`Quý khách`; accessible labels/status updates.

**Acceptance:** Focused test covers amount display, explicit consent, QR/direct-link equality, no duplicate order on retry, polling lifecycle, terminal/error states, and locale keys.

**Focused checks:**
```bash
cd frontends/front-end-vietsage
node --test src/features/marketplace/components/localmate-payment-flow.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

**Forbidden:** browser automation/live payment, install, commit/push/deploy. Stop only for concrete missing contract/scope decision; otherwise finish.
