# Notifications Shell Phase Implementation Plan

> **For Hermes:** Use `backend/nestjs-module-refactoring`, `backend/nestjs-backend-integrations`, and `backend/test-driven-development` to implement this plan task-by-task after explicit execution approval.

**Goal:** Refactor the legacy Telegram provider code and hotel notification-route management into a provider-agnostic `src/modules/notifications` bounded-context shell, while replacing the URL-secret webhook with a header-based webhook secret contract.

**Architecture:** Keep the backend as a modular monolith. `notifications` is named by business capability: notification routing, delivery attempts, provider callbacks, and delivery tracking. Telegram is only the first provider adapter; future providers can be added under the same context without creating misleading modules such as `telegram/zalo.service.ts`. Cross-context checks must use public ports such as `property-public.ts`, not Property repositories.

**Tech Stack:** NestJS 11, Prisma 7, Zod, Jest, ESLint.

---

## Current Context

The previous commit `cb390fd refactor(core-api): align bounded context modules` consolidated:

- `auth`, `rbac`, `hotel-users` -> `src/modules/identity`
- `hotels` -> `src/modules/property`
- `guest-os` -> `src/modules/guest-operations`

Current notification-related code remains split:

- Provider adapter/runtime delivery:
  - `services/auth-service/src/modules/telegram/telegram.module.ts`
  - `services/auth-service/src/modules/telegram/telegram-notification.service.ts`
  - `services/auth-service/src/modules/telegram/telegram-webhook.controller.ts`
- Staff notification route management parked in Property:
  - `services/auth-service/src/modules/property/api/hotel-notification-routes.controller.ts`
  - `services/auth-service/src/modules/property/application/hotel-notification-routes.service.ts`
- Current cross-context consumers:
  - `services/auth-service/src/modules/guest-operations/guest-operations.module.ts`
  - `services/auth-service/src/modules/guest-operations/application/guest-os.service.ts`
  - `services/auth-service/src/app.module.ts`
  - `services/auth-service/src/shared/events/tests/guest-request-event-boundary.spec.ts`

## Naming Decision

Use `notifications`, not `telegram`, because the module owns the notification capability, not a single provider.

| Candidate | Decision |
| --- | --- |
| `notifications` | Preferred. Owns route selection, delivery, provider callbacks, and delivery status. |
| `communications` | Too broad for current scope; would imply chat, campaign, inbox, email threads, etc. |
| `integrations` | Too generic; likely becomes a dumping ground for Google Sheets, payment, webhook, etc. |
| `messaging` | Easy to confuse with chat/conversations rather than notification delivery. |
| `alerts` | Too narrow; not every notification is an alert. |

Provider-specific names stay inside the context:

```txt
notifications/
  api/
    telegram-webhook.controller.ts
  application/
    telegram-notification.service.ts
  infrastructure/
    providers/
      telegram.provider.ts      # later, if/when provider abstraction is split
      zalo.provider.ts          # later
      email.provider.ts         # later
```

## Security Decision: Remove Secret from URL Path

Current route is unsafe because the secret is in the URL path:

```txt
POST /integrations/telegram/webhook/:secret
```

Problems:

- URLs are commonly captured by reverse proxy/access logs/APM traces.
- Route metrics can accidentally expose high-cardinality secret path segments.
- Error reports and request logs often include the full URL.
- Secret rotation is harder because the registered provider URL contains the secret.

Target canonical route:

```txt
POST /integrations/telegram/webhook
```

Secret validation must use a header, preferably Telegram's official webhook header:

```txt
X-Telegram-Bot-Api-Secret-Token: [REDACTED]
```

Implementation may optionally accept an internal fallback header only if needed by local tooling:

```txt
X-Telegram-Webhook-Secret: [REDACTED]
```

Do **not** put secrets in path params or query strings. Do **not** log received secret values.

## Non-goals

- Do not change Prisma schema, migrations, or database tables.
- Do not change package files or lockfiles.
- Do not send real Telegram messages during tests.
- Do not rename `services/auth-service`.
- Do not extract a separate microservice, queue, broker, or outbox worker in this phase.
- Do not move staff-side guest request workflow out of Property in this phase.
- Do not introduce Zalo/Email/SMS providers in this phase; only leave the module ready for them.
- Do not keep `/integrations/telegram/webhook/:secret` as the long-term contract.

Compatibility choice for implementation:

- **Default/security-first:** remove the path-secret route and use only `POST /integrations/telegram/webhook` with header secret.
- **Temporary bridge only if explicitly needed:** keep `POST /integrations/telegram/webhook/:secret` as a deprecated adapter for one deployment window, but do not document it as the canonical route and remove it in a follow-up cleanup.

## Target Structure

```txt
services/auth-service/src/modules/notifications/
  notifications.module.ts
  notifications-public.ts
  api/
    telegram-webhook.controller.ts
    hotel-notification-routes.controller.ts
  application/
    telegram-notification.service.ts
    hotel-notification-routes.service.ts
  tests/
    notifications.module.spec.ts
    telegram-webhook.controller.spec.ts
```

Potential later cleanup, not required in this phase:

```txt
src/modules/notifications/domain/
src/modules/notifications/infrastructure/providers/
```

Only create later folders if implementation needs them now.

---

## Task 1: Confirm Baseline Before Edits

**Objective:** Confirm the post-commit tree and current gates before moving notification code.

**Files:** none.

**Steps:**

1. Check status and latest commit:

```bash
git status --short
git log -1 --oneline
```

Expected:

- Latest commit is `cb390fd refactor(core-api): align bounded context modules` or a descendant.
- No unrelated dirty files except this plan if it remains uncommitted.

2. Run baseline gates if not recently run:

```bash
cd services/auth-service
npm run build
npm test -- --runInBand --silent
npm run test:e2e -- --runInBand --silent
npx eslint "{src,apps,libs,test}/**/*.ts"
```

Expected:

- Build passes.
- Unit/e2e tests pass.
- ESLint exits 0; existing warnings are acceptable if no errors.

---

## Task 2: Add RED Notifications Boundary Test

**Objective:** Add a failing test proving the intended `NotificationsModule` boundary is not implemented yet.

**Files:**

- Create: `services/auth-service/src/modules/notifications/tests/notifications.module.spec.ts`

**Test shape:**

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NotificationsModule } from "../notifications.module";
import { TelegramNotificationService } from "../application/telegram-notification.service";
import { HotelNotificationRoutesService } from "../application/hotel-notification-routes.service";

describe("NotificationsModule public boundary", () => {
  it("exports provider delivery service without exposing route configuration internals", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, NotificationsModule) ?? [];

    expect(moduleExports).toEqual([TelegramNotificationService]);
    expect(moduleExports).not.toContain(HotelNotificationRoutesService);
  });

  it("replaces the legacy telegram module folder with the notifications bounded context", () => {
    const modulesRoot = join(__dirname, "..", "..");

    expect(existsSync(join(modulesRoot, "telegram"))).toBe(false);
    expect(existsSync(join(modulesRoot, "notifications"))).toBe(true);
  });
});
```

**Run:**

```bash
cd services/auth-service
npm test -- --runInBand modules/notifications/tests/notifications.module.spec.ts
```

Expected: FAIL because `notifications.module.ts` and moved files do not exist yet.

---

## Task 3: Add RED Webhook Secret Contract Test

**Objective:** Add a failing test that requires the Telegram webhook to use a header secret rather than a URL path secret.

**Files:**

- Create: `services/auth-service/src/modules/notifications/tests/telegram-webhook.controller.spec.ts`

**Test intent:**

- Missing header -> `ForbiddenException`.
- Wrong header -> `ForbiddenException`.
- Correct `X-Telegram-Bot-Api-Secret-Token` header -> accepts update and calls `TelegramNotificationService.handleCallback`.
- Controller source must not define `webhook/:secret` unless the implementation explicitly chooses a temporary bridge.

**Test shape:**

```ts
import { ForbiddenException } from "@nestjs/common";
import { TelegramWebhookController } from "../api/telegram-webhook.controller";
import type { TelegramNotificationService } from "../application/telegram-notification.service";

describe("TelegramWebhookController", () => {
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  });

  it("rejects webhook calls without the Telegram secret header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    const service = { handleCallback: jest.fn() } as unknown as TelegramNotificationService;
    const controller = new TelegramWebhookController(service);

    await expect(controller.handleWebhook(undefined, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts webhook calls with the official Telegram secret-token header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    const service = { handleCallback: jest.fn() } as unknown as TelegramNotificationService;
    const controller = new TelegramWebhookController(service);

    await expect(
      controller.handleWebhook("expected-secret", {
        callback_query: { id: "callback-1", data: "guest_request:confirm:req-1" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(service.handleCallback).toHaveBeenCalledWith({
      id: "callback-1",
      data: "guest_request:confirm:req-1",
    });
  });
});
```

**Expected initial result:** FAIL because the current controller lives under `src/modules/telegram` and currently uses `@Post("webhook/:secret")` with `@Param("secret")`.

---

## Task 4: Move Telegram Provider Shell to Notifications

**Objective:** Move the provider adapter and webhook controller into the new bounded context.

**Files:**

- Move:
  - `src/modules/telegram/telegram.module.ts` -> `src/modules/notifications/notifications.module.ts`
  - `src/modules/telegram/telegram-notification.service.ts` -> `src/modules/notifications/application/telegram-notification.service.ts`
  - `src/modules/telegram/telegram-webhook.controller.ts` -> `src/modules/notifications/api/telegram-webhook.controller.ts`
- Create:
  - `src/modules/notifications/notifications-public.ts`
- Remove legacy folder after move:
  - `src/modules/telegram/`

**Implementation notes:**

- Rename `TelegramModule` to `NotificationsModule`.
- Keep class names `TelegramNotificationService` and `TelegramWebhookController` to minimize churn and preserve provider meaning.
- Update relative imports:
  - from `../../common/...` to `../../../common/...` inside `application/telegram-notification.service.ts`
  - from `../../shared/...` to `../../../shared/...`
  - from `../../prisma/...` to `../../../prisma/...`
  - from controller `../../shared/...` to `../../../shared/...`
- `notifications-public.ts` should initially export:

```ts
export { TelegramNotificationService } from "./application/telegram-notification.service";
```

---

## Task 5: Replace URL Secret Webhook with Header Secret Webhook

**Objective:** Remove the secret from the route path and validate Telegram webhook calls through a header.

**Files:**

- Modify: `src/modules/notifications/api/telegram-webhook.controller.ts`
- Test: `src/modules/notifications/tests/telegram-webhook.controller.spec.ts`

**Target controller shape:**

```ts
import { Body, Controller, ForbiddenException, Headers, Post } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { TelegramNotificationService } from "../application/telegram-notification.service";

@SkipAuthorization()
@Controller("integrations/telegram")
export class TelegramWebhookController {
  constructor(private readonly telegramNotificationService: TelegramNotificationService) {}

  @Post("webhook")
  @ApiDescript("Telegram webhook endpoint for receiving updates from the Telegram Bot API")
  async handleWebhook(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertWebhookSecret(secret);

    const update = body as {
      callback_query?: {
        id: string;
        data?: string;
        from?: { id?: number; first_name?: string; last_name?: string; username?: string };
      };
    };
    if (update.callback_query?.id) {
      await this.telegramNotificationService.handleCallback(update.callback_query);
    }

    return { ok: true };
  }

  private assertWebhookSecret(actual: string | undefined): void {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected || !actual || !this.safeEquals(actual, expected)) {
      throw new ForbiddenException("Invalid Telegram webhook secret");
    }
  }

  private safeEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
```

**Important:** Do not log `actual`, `expected`, or the request URL when rejecting webhook calls.

**Temporary bridge, only if explicitly needed:**

If production cannot rotate the webhook URL immediately, add a separate deprecated method:

```ts
@Post("webhook/:secret")
async handleLegacyWebhook(@Param("secret") secret: string, @Body() body: unknown) {
  return this.handleWebhook(secret, body);
}
```

But prefer not to implement this bridge unless the deployment needs it.

---

## Task 6: Move Hotel Notification Route Management from Property

**Objective:** Move staff notification-route HTTP handling and workflow into Notifications while keeping the `/hotels` route contract stable.

**Files:**

- Move:
  - `src/modules/property/api/hotel-notification-routes.controller.ts` -> `src/modules/notifications/api/hotel-notification-routes.controller.ts`
  - `src/modules/property/application/hotel-notification-routes.service.ts` -> `src/modules/notifications/application/hotel-notification-routes.service.ts`

**Implementation notes:**

- Keep `@Controller("hotels")` unchanged.
- Keep route methods unchanged:
  - `GET :hotelId/notification-routes`
  - `POST :hotelId/notification-routes`
  - `PATCH :hotelId/notification-routes/:routeId`
- Update imports:
  - `parseWithZod`, decorators, shared security from `../../../...`
  - `hotelIdParamSchema` should come from `../../property/domain/schemas/shared.schema` unless a public route-param schema is created. Prefer minimal move first.
  - `HotelAccessService` should come from `../../property/property-public` rather than Property internals.
- `NotificationsModule` must import `PropertyModule` so `HotelAccessService` can be injected through the public boundary.
- Remove `HotelNotificationRoutesController` and `HotelNotificationRoutesService` from `PropertyModule` controllers/providers.

---

## Task 7: Update Module Wiring and Cross-context Imports

**Objective:** Point all consumers to the Notifications boundary.

**Files:**

- Modify: `src/app.module.ts`
- Modify: `src/modules/guest-operations/guest-operations.module.ts`
- Modify: `src/modules/guest-operations/application/guest-os.service.ts`
- Modify: `src/shared/events/tests/guest-request-event-boundary.spec.ts`

**Changes:**

- `AppModule` imports `NotificationsModule` instead of `TelegramModule`.
- `GuestOperationsModule` imports `NotificationsModule` instead of `TelegramModule`.
- `GuestOsService` imports `TelegramNotificationService` from `../../notifications/notifications-public`.
- Shared event boundary test references:

```ts
"modules/notifications/application/telegram-notification.service.ts"
```

instead of:

```ts
"modules/telegram/telegram-notification.service.ts"
```

---

## Task 8: Green the Boundary/Webhook Tests and Build

**Objective:** Confirm the shell move compiles, the new boundary is enforced, and webhook secret validation no longer uses URL path secrets.

**Run:**

```bash
cd services/auth-service
npm test -- --runInBand modules/notifications/tests/notifications.module.spec.ts modules/notifications/tests/telegram-webhook.controller.spec.ts
npm run build
```

Expected:

- New boundary test passes.
- Webhook controller test passes.
- Build passes.

If build fails, inspect exact TS errors and fix relative imports or Nest module providers/imports before proceeding.

---

## Task 9: Update Architecture Docs

**Objective:** Align docs with the new Notifications bounded context and secure webhook contract.

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOMAIN_MAP.md`
- Modify: `services/docs/ARCHITECTURE.md`
- Modify: `services/docs/MODULE_GUIDE.md`
- Modify: `services/docs/PLANS.md`

**Expected doc updates:**

- Replace `src/modules/telegram` current-code references with `src/modules/notifications`.
- Document that Telegram is a provider adapter inside Notifications, not the context name.
- Document that canonical Telegram webhook route is:

```txt
POST /integrations/telegram/webhook
X-Telegram-Bot-Api-Secret-Token: [REDACTED]
```

- Document that `/hotels/:hotelId/notification-routes*` remains a compatibility route contract owned by Notifications.
- Mark Notifications shell split as complete in `services/docs/PLANS.md` after verification.

---

## Task 10: Final Verification Gates

**Objective:** Prove the phase did not break runtime behavior or contracts.

**Commands:**

```bash
cd services/auth-service
npm run build
npm test -- --runInBand --silent modules/notifications/tests/notifications.module.spec.ts modules/notifications/tests/telegram-webhook.controller.spec.ts
npm test -- --runInBand --silent
npm run test:e2e -- --runInBand --silent
npx eslint "src/modules/notifications/**/*.ts" "src/app.module.ts" "src/modules/guest-operations/**/*.ts" "src/modules/property/property.module.ts" "src/shared/events/tests/guest-request-event-boundary.spec.ts"
npx eslint "{src,apps,libs,test}/**/*.ts"
```

From repo root:

```bash
git diff --check

grep -RIn --include='*.ts' --include='*.md' \
  -E 'src/modules/telegram|modules/telegram|TelegramModule|from "\.\/modules\/telegram|from "\.\.\/telegram|from "\.\.\/\.\.\/telegram' \
  docs services/docs services/auth-service/src || true

grep -RIn --include='*.ts' --include='*.md' \
  -E 'webhook/:secret|@Param\("secret"\).*webhook|/integrations/telegram/webhook/:secret' \
  docs services/docs services/auth-service/src || true

grep -RIn --include='*.ts' \
  -E '^import .*from ".*modules/notifications/(api|application|domain|infrastructure)|^import .*from "(\.\/modules\/notifications|\.\.\/notifications|\.\.\/\.\.\/notifications)/(api|application|domain|infrastructure)' \
  services/auth-service/src | grep -v '^services/auth-service/src/modules/notifications/' || true
```

Expected:

- Build passes.
- Targeted Notifications tests pass.
- Full unit/e2e tests pass.
- Targeted ESLint exits 0.
- Full ESLint exits 0; existing warnings acceptable if no new errors.
- `git diff --check` passes.
- No stale legacy Telegram module/path refs remain.
- No canonical path-secret webhook route remains.
- No external imports of Notifications internals; external consumers use `notifications-public` or `NotificationsModule`.

---

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Relative imports break after moving provider/controller files | Run `npm run build` immediately after move and fix exact TS errors. |
| `NotificationsModule` needs `HotelAccessService` for route config | Import `PropertyModule` and consume `HotelAccessService` through `property-public`. |
| Telegram webhook breaks if provider URL is not rotated | Use the canonical header route; if production needs migration, explicitly add a deprecated bridge for one deployment window. |
| Secret leaks through URL logging | Remove `:secret` from canonical route and use `X-Telegram-Bot-Api-Secret-Token`; do not log secret values. |
| Direct provider dependency from Guest Operations remains | Use `notifications-public.ts` first; consider a later notification-intent port if needed. |
| Real Telegram API call during tests | Avoid integration tests that call `sendMessage`; test only boundary and pure controller behavior unless network is mocked. |
| Scope creep into request workflow extraction | Keep staff request workflow in Property for this phase; only notification route config moves. |

## Commit Plan

After all gates pass:

```bash
git add -A
git commit -m "refactor(notifications): create notifications bounded context"
```

Suggested commit body:

```txt
Move Telegram provider/webhook code and hotel notification-route management into src/modules/notifications while making Telegram a provider adapter inside the notification capability.

Replace URL-path webhook secrets with header-based Telegram webhook secret validation, update module wiring/docs, and add boundary tests for the modular-monolith notifications context.
```
