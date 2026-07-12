# Emergency Boundary Hardening Phase Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Harden the Emergency bounded context after the core domain-boundary consolidation by moving it to the same `api/application/domain/infrastructure/tests` shape, removing exported repository internals, and replacing direct Guest Operations persistence reads with a public emergency-session resolver port while preserving `/emergency/guest/calls`.

**Architecture:** Keep VietSage as a modular monolith. Emergency owns emergency call/incident/location/notification persistence, while Guest Operations remains the source of guest-session context. Emergency should depend on a public Guest Operations port/service contract, not query guest-session tables directly from its repository. No Prisma migration, package change, or HTTP contract change is planned.

**Tech Stack:** NestJS 11, Prisma 7, Zod, Jest, OpenAPI export, frontend OpenAPI type sync.

---

## Current Context

Latest clean baseline before this plan:

```txt
dbe4d46 refactor(core-api): consolidate domain boundaries
```

Current Emergency shape:

```txt
services/auth-service/src/modules/emergency/
  emergency.controller.ts
  emergency.module.ts
  emergency.repository.ts
  emergency.service.ts
  schemas/emergency.schema.ts
```

Current route to preserve:

```txt
POST /emergency/guest/calls
```

Current notable issues:

1. `EmergencyModule` exports `EmergencyRepository`, leaking persistence internals:
   ```ts
   exports: [EmergencyService, EmergencyRepository]
   ```
2. `EmergencyRepository.findGuestSession()` directly queries `prisma.guestSession` with hotel/room/stay relations. That couples Emergency persistence to Guest Operations/Property-owned data.
3. Emergency module is still flat, unlike the already consolidated contexts:
   ```txt
   identity/
   property/
   guest-operations/
   notifications/
   organization/
   billing/
   ```
4. There are no dedicated Emergency unit/boundary tests yet.
5. Frontend already calls the stable route through:
   ```txt
   frontends/font-end-vietsage/src/features/guest-os/service/guest-os-service.ts
   frontends/font-end-vietsage/src/app/api/guest/emergency/calls/route.ts
   ```

## Non-Goals

- Do **not** rename `services/auth-service`.
- Do **not** split microservices.
- Do **not** add message broker/cache.
- Do **not** change Prisma schema or create migrations in this phase.
- Do **not** change public API paths or request/response semantics unless a failing verification proves a hidden contract issue.
- Do **not** edit frontend hand-written code unless OpenAPI sync/typing reveals a real break.
- Do **not** expose actual secrets/tokens in logs or docs.

---

## Target Structure

```txt
services/auth-service/src/modules/emergency/
  emergency.module.ts
  api/
    emergency.controller.ts
  application/
    emergency.service.ts
  domain/
    schemas/
      emergency.schema.ts
    types/
      emergency-session-context.ts
  infrastructure/
    repositories/
      emergency.repository.ts
  tests/
    emergency.module.spec.ts
    emergency.service.spec.ts
    emergency-boundary.spec.ts
```

Guest Operations public boundary additions:

```txt
services/auth-service/src/modules/guest-operations/
  application/
    guest-emergency-context.service.ts
  guest-operations-public.ts
```

Proposed new public contract:

```ts
export type GuestEmergencyContext = {
  sessionId: string;
  guestSessionId: string;
  tenantId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  roomFloor?: string | null;
  stayGuestPhone?: string | null;
};
```

The exact shape can be adjusted during implementation, but the key rule is: Emergency receives a small context DTO from Guest Operations, not a raw Prisma `guestSession` payload.

---

## Task 1: Baseline and RED Boundary Tests

**Objective:** Prove the next phase starts from a clean baseline and add failing tests that describe the intended boundaries.

**Files:**

- Create: `services/auth-service/src/modules/emergency/tests/emergency.module.spec.ts`
- Create: `services/auth-service/src/modules/emergency/tests/emergency-boundary.spec.ts`
- Create: `services/auth-service/src/modules/emergency/tests/emergency.service.spec.ts`
- Read/confirm: `services/auth-service/src/modules/emergency/emergency.module.ts`
- Read/confirm: `services/auth-service/src/modules/emergency/emergency.repository.ts`

**Step 1: Run baseline gates**

```bash
cd services/auth-service
npm run build
npm test -- --runInBand --silent
```

Expected: both PASS before changes.

**Step 2: Add `emergency.module.spec.ts`**

Test should assert:

- `EmergencyModule` exports `EmergencyService`.
- `EmergencyModule` does **not** export `EmergencyRepository`.
- `EmergencyModule` imports `GuestOperationsModule` only because it needs the public guest emergency context provider/guard.

Sketch:

```ts
import { MODULE_METADATA } from "@nestjs/common/constants";
import { EmergencyModule } from "../emergency.module";
import { EmergencyService } from "../application/emergency.service";
import { EmergencyRepository } from "../infrastructure/repositories/emergency.repository";

describe("EmergencyModule boundary", () => {
  it("does not export persistence internals", () => {
    const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, EmergencyModule) ?? [];

    expect(exportsMetadata).toContain(EmergencyService);
    expect(exportsMetadata).not.toContain(EmergencyRepository);
  });
});
```

Initial expected result: FAIL until files are moved and exports are fixed.

**Step 3: Add `emergency-boundary.spec.ts`**

Test should scan `src/modules/emergency` and assert:

- No file imports `../guest-operations/application/*` or `../guest-operations/infrastructure/*`.
- `EmergencyRepository` does not call `guestSession`, `guestStay`, `room`, or `hotel` Prisma delegates.
- Emergency only imports `../guest-operations/guest-operations-public` for the guard/public port.

Initial expected result: FAIL because current `EmergencyRepository.findGuestSession()` reads `prisma.guestSession` directly.

**Step 4: Add service behavior tests**

Test `EmergencyService.createGuestEmergencyCall()` with mocks:

- When resolver returns no guest context → throws `NotFoundException`.
- When location DTO includes `emergencyLocationId` → repository looks up that location and creates call/incident/timeline/notification.
- When only manual `dispatchableAddress` is provided → marks uncertainty based on confidence.
- When no location/address exists → uses fallback emergency location.

Initial expected result: FAIL until `EmergencyService` injects a resolver and files are moved.

**Step 5: Run RED tests**

```bash
npm test -- --runInBand --silent \
  modules/emergency/tests/emergency.module.spec.ts \
  modules/emergency/tests/emergency-boundary.spec.ts \
  modules/emergency/tests/emergency.service.spec.ts
```

Expected: FAIL for boundary reasons.

---

## Task 2: Move Emergency to Context Folder Shape

**Objective:** Match the standard bounded-context layout without changing behavior.

**Files:**

- Move: `services/auth-service/src/modules/emergency/emergency.controller.ts` → `services/auth-service/src/modules/emergency/api/emergency.controller.ts`
- Move: `services/auth-service/src/modules/emergency/emergency.service.ts` → `services/auth-service/src/modules/emergency/application/emergency.service.ts`
- Move: `services/auth-service/src/modules/emergency/emergency.repository.ts` → `services/auth-service/src/modules/emergency/infrastructure/repositories/emergency.repository.ts`
- Move: `services/auth-service/src/modules/emergency/schemas/emergency.schema.ts` → `services/auth-service/src/modules/emergency/domain/schemas/emergency.schema.ts`
- Modify: `services/auth-service/src/modules/emergency/emergency.module.ts`

**Step 1: Move files**

Target imports:

```ts
// emergency.module.ts
import { EmergencyController } from "./api/emergency.controller";
import { EmergencyService } from "./application/emergency.service";
import { EmergencyRepository } from "./infrastructure/repositories/emergency.repository";
```

**Step 2: Fix relative imports**

Expected adjustments:

```ts
// api/emergency.controller.ts
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../../guest-operations/guest-operations-public";
import { EmergencyService } from "../application/emergency.service";
import { createEmergencyCallBodySchema } from "../domain/schemas/emergency.schema";
```

```ts
// infrastructure/repositories/emergency.repository.ts
import { PrismaService } from "../../../../prisma/prisma.service";
```

**Step 3: Preserve route contract**

Verify controller still has:

```ts
@ApiTags("emergency")
@Controller("emergency")
@Post("guest/calls")
```

**Step 4: Build**

```bash
npm run build
```

Expected: PASS or import-path errors only; fix until PASS.

---

## Task 3: Add Guest Operations Emergency Context Port

**Objective:** Move guest-session context lookup ownership into Guest Operations and expose a small public resolver to Emergency.

**Files:**

- Create: `services/auth-service/src/modules/guest-operations/application/guest-emergency-context.service.ts`
- Modify: `services/auth-service/src/modules/guest-operations/guest-operations.module.ts`
- Modify: `services/auth-service/src/modules/guest-operations/guest-operations-public.ts`
- Create: `services/auth-service/src/modules/guest-operations/tests/guest-emergency-context.service.spec.ts`

**Step 1: Create public DTO/type**

Prefer colocating type with service and exporting from `guest-operations-public.ts`:

```ts
export type GuestEmergencyContext = {
  sessionId: string;
  guestSessionId: string;
  tenantId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  roomFloor?: string | null;
  stayGuestPhone?: string | null;
};
```

**Step 2: Implement resolver service in Guest Operations**

```ts
@Injectable()
export class GuestEmergencyContextService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySessionId(sessionId: string): Promise<GuestEmergencyContext | null> {
    const session = await this.prisma.guestSession.findUnique({
      where: { id: sessionId },
      include: { hotel: true, room: true, stay: true },
    });

    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      guestSessionId: session.id,
      tenantId: session.hotel.tenantId,
      hotelId: session.hotelId,
      roomId: session.roomId,
      roomNumber: session.room.roomNumber,
      roomFloor: session.room.floor,
      stayGuestPhone: session.stay.guestPhone,
    };
  }
}
```

Implementation may keep the Prisma query here because Guest Operations owns guest-session context.

**Step 3: Export from `GuestOperationsModule` and public barrel**

```ts
providers: [
  GuestOsService,
  HotelRequestsService,
  GuestEmergencyContextService,
  GuestOsRepository,
  HotelRequestsRepository,
  GuestSessionGuard,
]
exports: [GuestOsService, GuestSessionGuard, GuestEmergencyContextService]
```

```ts
export {
  GuestEmergencyContextService,
  type GuestEmergencyContext,
} from "./application/guest-emergency-context.service";
```

**Step 4: Add resolver tests**

Test cases:

- returns `null` for missing session
- maps Prisma session/hotel/room/stay to `GuestEmergencyContext`
- does not expose full Prisma relation payload

**Step 5: Verify targeted tests**

```bash
npm test -- --runInBand --silent \
  modules/guest-operations/tests/guest-emergency-context.service.spec.ts
```

Expected: PASS.

---

## Task 4: Refactor EmergencyService to Consume Guest Context Port

**Objective:** Remove direct guest-session lookup from `EmergencyRepository`; use `GuestEmergencyContextService` from the public Guest Operations boundary.

**Files:**

- Modify: `services/auth-service/src/modules/emergency/application/emergency.service.ts`
- Modify: `services/auth-service/src/modules/emergency/infrastructure/repositories/emergency.repository.ts`
- Modify: `services/auth-service/src/modules/emergency/tests/emergency.service.spec.ts`
- Modify: `services/auth-service/src/modules/emergency/tests/emergency-boundary.spec.ts`

**Step 1: Inject resolver into EmergencyService**

```ts
constructor(
  private readonly emergencyRepository: EmergencyRepository,
  private readonly guestEmergencyContextService: GuestEmergencyContextService,
) {}
```

**Step 2: Replace direct repository call**

Before:

```ts
const session = await this.emergencyRepository.findGuestSession(sessionId);
```

After:

```ts
const session = await this.guestEmergencyContextService.findBySessionId(sessionId);
```

**Step 3: Update field reads**

Replace raw Prisma relation access:

```ts
session.hotel.tenantId
session.room.roomNumber
session.room.floor
session.stay.guestPhone
```

with DTO fields:

```ts
session.tenantId
session.roomNumber
session.roomFloor
session.stayGuestPhone
```

**Step 4: Delete `EmergencyRepository.findGuestSession()`**

EmergencyRepository should only use emergency-owned persistence delegates:

```txt
emergencyLocation
emergencyCallEvent
emergencyIncident
emergencyIncidentTimeline
emergencyNotification
```

**Step 5: Run targeted tests**

```bash
npm test -- --runInBand --silent \
  modules/emergency/tests/emergency.module.spec.ts \
  modules/emergency/tests/emergency-boundary.spec.ts \
  modules/emergency/tests/emergency.service.spec.ts
```

Expected: PASS.

---

## Task 5: Fix EmergencyModule Public Surface

**Objective:** Ensure Emergency exports only application-level service, not repository internals.

**Files:**

- Modify: `services/auth-service/src/modules/emergency/emergency.module.ts`
- Test: `services/auth-service/src/modules/emergency/tests/emergency.module.spec.ts`

**Step 1: Update module**

```ts
@Module({
  imports: [PrismaModule, GuestOperationsModule],
  controllers: [EmergencyController],
  providers: [EmergencyService, EmergencyRepository],
  exports: [EmergencyService],
})
export class EmergencyModule {}
```

**Step 2: Confirm no external imports of repository**

Search should return only emergency-internal files/tests:

```bash
grep -RIn --include='*.ts' 'EmergencyRepository' src | cat
```

Expected: external modules do not import it.

---

## Task 6: Contract and Docs Sync

**Objective:** Keep docs/current OpenAPI generated artifacts aligned with the internal refactor.

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOMAIN_MAP.md`
- Modify: `services/docs/ARCHITECTURE.md`
- Modify: `services/docs/PLANS.md`
- Generated if changed: `shared/api-contract/openapi/v1/openapi.yaml`
- Generated if changed: `shared/api-contract/openapi/v1/openapi.json`
- Generated if changed: `frontends/font-end-vietsage/src/generated/openapi/v1.ts`

**Step 1: Update docs**

Update Emergency row to reflect:

```txt
src/modules/emergency (api/application/domain/infrastructure/tests)
```

and note:

```txt
Emergency consumes Guest Operations via a public guest emergency context port; it does not query guest-session persistence directly.
```

**Step 2: Export OpenAPI**

Even though no route should change, run export because controller paths/imports moved:

```bash
cd services/auth-service
npm run openapi:export
```

Expected: 71 paths or current equivalent path count. No path removals.

**Step 3: Sync frontend generated OpenAPI types**

```bash
cd frontends/font-end-vietsage
pnpm run sync:api:types
```

Expected: generated type sync succeeds. Hand-written frontend should not need changes.

---

## Task 7: Full Verification and Commit

**Objective:** Prove behavior and contracts remained stable, then commit the phase.

**Backend gates:**

```bash
cd services/auth-service
npm run build
npm test -- --runInBand --silent
npm run test:e2e -- --runInBand --silent
npx eslint "{src,apps,libs,test}/**/*.ts"
npm run openapi:export
```

Expected:

- build PASS
- full unit PASS
- e2e PASS
- eslint 0 errors; existing warnings acceptable if unchanged
- OpenAPI export PASS

**Frontend gates:**

```bash
cd frontends/font-end-vietsage
pnpm run sync:api:types
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

Expected:

- typecheck PASS
- lint PASS
- build PASS
- existing `localStorage is not available because --localstorage-file was not provided` warning may appear during static generation; non-blocking if unchanged.

**Stale-ref checks:**

```bash
git diff --check
```

```bash
grep -RIn --include='*.ts' -E \
  'modules/emergency/emergency\.controller|modules/emergency/emergency\.service|modules/emergency/emergency\.repository|schemas/emergency|prisma\.guestSession' \
  services/auth-service/src || true
```

Expected:

- No flat emergency import paths remain except acceptable docs/test text.
- No `prisma.guestSession` usage inside `src/modules/emergency`.
- No external imports of `EmergencyRepository`.

**Commit message:**

```bash
git add -A
git commit -m "refactor(core-api): harden emergency boundary"
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Circular import between Emergency and Guest Operations | Keep only `EmergencyModule -> GuestOperationsModule`; do not import Emergency back into Guest Operations. |
| Resolver leaks Prisma payload | Return a small DTO and test that only needed fields are exposed. |
| Route accidentally changes due controller move | OpenAPI export + frontend type sync + e2e verify `/emergency/guest/calls`. |
| Boundary test over-matches legitimate product labels | Scope boundary checks to import paths/delegates, not product-copy strings. |
| Emergency notification persistence confused with Notifications context | Keep existing `EmergencyNotification` persistence as emergency incident workflow state in this phase; defer cross-context notification dispatch integration unless separately approved. |

---

## Success Criteria

- `src/modules/emergency` uses `api/application/domain/infrastructure/tests` structure.
- `/emergency/guest/calls` remains stable.
- `EmergencyRepository` is no longer exported by `EmergencyModule`.
- Emergency no longer queries `prisma.guestSession` directly.
- Guest Operations exposes a public `GuestEmergencyContextService` or equivalent port.
- Backend build/unit/e2e/eslint/OpenAPI export pass.
- Frontend generated OpenAPI sync/typecheck/lint/build pass.
- Commit created with phase-specific message after verification.
