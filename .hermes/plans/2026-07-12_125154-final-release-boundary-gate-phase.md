# Final Release Boundary Gate Phase Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the modular-monolith refactor with a final release gate: commit the approved `services/auth-service/tsconfig.json` change, keep VSCode local settings out of the commit/push, add durable boundary regression checks, refresh docs/contracts, run backend/frontend verification, then commit only the intended files.

**Architecture:** No new bounded-context moves and no HTTP contract changes are planned. This phase is a stabilization/audit phase: verify context ownership, prevent old module/path regressions, confirm public-port boundaries, and make the release state reproducible. Treat `.vscode` changes as local developer preferences and exclude them from staging/commit.

**Tech Stack:** NestJS 11, Prisma 7, TypeScript/tsconfig, Jest, ESLint, OpenAPI export, Next.js frontend generated API sync.

---

## Current Context

Latest committed backend boundary phase:

```txt
00070f7 refactor(core-api): harden emergency boundary
```

Current dirty files before final phase:

```txt
M frontends/font-end-vietsage/.vscode/settings.json
M services/auth-service/tsconfig.json
```

User instruction for final phase:

```txt
không đẩy /vscode lên
cho phép add tsconfig.json
```

Interpretation:

- Do **not** stage/commit/push `frontends/font-end-vietsage/.vscode/settings.json`.
- It is OK to include `services/auth-service/tsconfig.json` after validation.
- Do not push to remote unless the user explicitly asks after the final commit.

Current `services/auth-service/tsconfig.json` diff to validate/include:

```diff
-    "baseUrl": "./",
+    "paths": { "*": ["./*"] },
```

Current remaining docs checklist items:

```txt
services/docs/PLANS.md
- [ ] Replace remaining cross-context implementation dependencies with public ports.
- [ ] Export OpenAPI after future HTTP contract changes.
```

---

## Non-Goals

- Do **not** commit or push `.vscode` changes.
- Do **not** rename `services/auth-service`.
- Do **not** split microservices.
- Do **not** add packages or change lockfiles.
- Do **not** create Prisma migrations or change database schema.
- Do **not** change HTTP routes/contracts.
- Do **not** run SonarQube unless the user explicitly asks for tester/review verification.

---

## Task 1: Repository Hygiene Guard

**Objective:** Make sure final work starts with only one allowed pre-existing local change: `services/auth-service/tsconfig.json`; keep `.vscode` out of the commit.

**Files:**

- Preserve local only: `frontends/font-end-vietsage/.vscode/settings.json`
- Allowed to stage after validation: `services/auth-service/tsconfig.json`

**Step 1: Inspect current dirty files**

```bash
git status --short
```

Expected:

```txt
 M frontends/font-end-vietsage/.vscode/settings.json
 M services/auth-service/tsconfig.json
```

Plan action:

- Do not restore `.vscode` unless user explicitly says to discard local IDE preferences.
- Do not use `git add -A` in this phase.
- Always stage with explicit file paths.

**Step 2: Add a pre-commit safety check command**

Before committing, run:

```bash
git diff --cached --name-only | grep -F 'frontends/font-end-vietsage/.vscode/settings.json' && exit 1 || true
```

Expected: no output and exit 0.

**Step 3: Optional local-only protection**

If accidental staging keeps recurring, ask user before running this local-only command:

```bash
git update-index --skip-worktree frontends/font-end-vietsage/.vscode/settings.json
```

Do not run it silently because it changes local Git metadata.

---

## Task 2: Validate and Include `tsconfig.json`

**Objective:** Treat the approved `tsconfig.json` change as an intentional final-phase config update, not accidental drift.

**Files:**

- Modify/commit: `services/auth-service/tsconfig.json`

**Step 1: Confirm JSON is valid**

```bash
cd services/auth-service
node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); console.log('tsconfig json ok')"
```

Expected:

```txt
tsconfig json ok
```

**Step 2: Confirm TypeScript effective config accepts `paths`**

```bash
cd services/auth-service
npx tsc --showConfig > /tmp/vietsage-final-tsconfig-showconfig.json
node -e "const c=require('/tmp/vietsage-final-tsconfig-showconfig.json'); console.log(c.compilerOptions.paths ? 'paths ok' : 'paths missing')"
```

Expected:

```txt
paths ok
```

**Step 3: Run backend build with this config**

```bash
cd services/auth-service
npm run build
```

Expected: PASS.

**Step 4: If build fails**

Do not force-commit the config. Either:

- Restore `baseUrl` and explain why `paths` is not safe, or
- Add the minimal compatible config after evidence, e.g.:

```json
"baseUrl": "./",
"paths": { "*": ["./*"] }
```

Then rerun build/tests.

---

## Task 3: Add Final Boundary Regression Spec

**Objective:** Make the final architecture state self-defending so legacy modules, unsafe webhook contracts, repository exports, or cross-context implementation imports do not return silently.

**Files:**

- Create: `services/auth-service/src/modules/tests/final-boundary-release.spec.ts`

**Step 1: Write failing/guard test**

Create this spec:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const srcRoot = join(__dirname, "..", "..");
const modulesRoot = join(srcRoot, "modules");

const legacyModuleFolders = [
  "auth",
  "rbac",
  "hotel-users",
  "hotels",
  "guest-os",
  "tenant-owners",
  "telegram",
];

const boundedContexts = [
  "identity",
  "organization",
  "property",
  "guest-operations",
  "billing",
  "emergency",
  "notifications",
];

function collectFiles(dir: string, predicate: (path: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(path, predicate);
    }

    return entry.isFile() && predicate(path) ? [path] : [];
  });
}

function readTsFiles(): Array<{ path: string; rel: string; source: string }> {
  return collectFiles(srcRoot, (path) => path.endsWith(".ts")).map((path) => ({
    path,
    rel: relative(srcRoot, path).replaceAll("\\\\", "/"),
    source: readFileSync(path, "utf8"),
  }));
}

describe("final bounded-context release guard", () => {
  it("does not reintroduce legacy module folders", () => {
    const existingLegacyFolders = legacyModuleFolders.filter((folder) =>
      existsSync(join(modulesRoot, folder)),
    );

    expect(existingLegacyFolders).toEqual([]);
  });

  it("keeps repository classes private to module internals", () => {
    const moduleFilesWithRepositoryExports = readTsFiles()
      .filter(({ rel }) => rel.endsWith(".module.ts"))
      .filter(({ source }) => /exports\s*:\s*\[[\s\S]*Repository[\s\S]*\]/m.test(source))
      .map(({ rel }) => rel);

    expect(moduleFilesWithRepositoryExports).toEqual([]);
  });

  it("does not reintroduce URL-path webhook secrets", () => {
    const offenders = readTsFiles()
      .filter(({ source }) => /webhook\/:secret|@Param\(["']secret["']\)/.test(source))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("uses public barrels instead of importing other bounded-context internals", () => {
    const offenders = readTsFiles().flatMap(({ rel, source }) => {
      const currentContext = boundedContexts.find((context) =>
        rel.startsWith(`modules/${context}/`),
      );

      if (!currentContext) {
        return [];
      }

      const badImports = boundedContexts
        .filter((context) => context !== currentContext)
        .filter((context) => {
          const escaped = context.replaceAll("-", "\\-");
          const directImplementationImport = new RegExp(
            `from ["'][^"']*${escaped}/(api|application|domain|infrastructure|tests)(/|["'])`,
          );
          return directImplementationImport.test(source);
        });

      return badImports.length > 0 ? [`${rel} -> ${badImports.join(",")}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});
```

**Step 2: Run the new spec**

```bash
cd services/auth-service
npm test -- --runInBand --silent modules/tests/final-boundary-release.spec.ts
```

Expected:

- PASS if final architecture is already compliant.
- If it fails, inspect each offender and either:
  - replace implementation import with `*-public.ts`, or
  - narrow the guard if it is a false positive with a documented allowlist.

**Step 3: Run module-boundary specs together**

```bash
cd services/auth-service
npm test -- --runInBand --silent \
  modules/tests/final-boundary-release.spec.ts \
  modules/identity/tests/identity.module.spec.ts \
  modules/property/tests/property.module.spec.ts \
  modules/guest-operations/tests/guest-operations.module.spec.ts \
  modules/guest-operations/tests/guest-request-workflow-boundary.spec.ts \
  modules/organization/tests/organization.module.spec.ts \
  modules/billing/tests/billing.module.spec.ts \
  modules/emergency/tests/emergency.module.spec.ts \
  modules/emergency/tests/emergency-boundary.spec.ts \
  modules/notifications/tests/notifications.module.spec.ts
```

Expected: PASS.

---

## Task 4: Final Docs Cleanup

**Objective:** Mark the modular-monolith refactor as complete where the final boundary guard proves it, without overstating future service extraction readiness.

**Files:**

- Modify: `services/docs/PLANS.md`
- Possibly modify: `docs/DOMAIN_MAP.md`
- Possibly modify: `docs/ARCHITECTURE.md`
- Possibly modify: `services/docs/ARCHITECTURE.md`

**Step 1: Update checklist items**

In `services/docs/PLANS.md`, after Task 3 passes, change:

```md
- [ ] Replace remaining cross-context implementation dependencies with public ports.
```

to:

```md
- [x] Replace remaining cross-context implementation dependencies with public ports and final boundary regression tests.
```

Change:

```md
- [ ] Export OpenAPI after future HTTP contract changes.
```

to:

```md
- [x] Export OpenAPI and sync frontend generated types during final release gate.
```

**Step 2: Update release gate section**

Expand `## 4. Release Gate` to include the real final commands:

```bash
npm run build
npm run test -- --runInBand --silent
npm run test:e2e -- --runInBand --silent
npx eslint "{src,apps,libs,test}/**/*.ts"
npm run openapi:export
```

and frontend:

```bash
pnpm run sync:api:types
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

**Step 3: Keep docs honest**

Do not claim the system is ready to extract microservices. Preferred wording:

```txt
The modular-monolith boundary consolidation is complete for the current codebase. Future service extraction still requires ADRs, operational readiness, data migration plans, and versioned contracts.
```

---

## Task 5: Contract Export and Frontend Type Sync

**Objective:** Re-run generated contract sync even if no route changed, because final docs/config/test changes should be released with a fresh contract gate.

**Files potentially generated:**

- `shared/api-contract/openapi/v1/openapi.yaml`
- `shared/api-contract/openapi/v1/openapi.json`
- `frontends/font-end-vietsage/src/generated/openapi/v1.ts`

**Step 1: Backend OpenAPI export**

```bash
cd services/auth-service
npm run openapi:export
```

Expected:

```txt
[openapi] Exported 71 paths to .../shared/api-contract/openapi/v1
```

**Step 2: Frontend generated type sync**

```bash
cd frontends/font-end-vietsage
pnpm run sync:api:types
```

Expected:

```txt
Synced OpenAPI types -> .../frontends/font-end-vietsage/src/generated/openapi/v1.ts
```

**Step 3: Inspect generated diffs**

```bash
git diff --stat -- shared/api-contract/openapi/v1 frontends/font-end-vietsage/src/generated/openapi/v1.ts
```

Expected:

- No generated diff, or only deterministic ordering/metadata diff.
- No path removal for existing API routes.

---

## Task 6: Full Final Verification

**Objective:** Prove the final phase is releaseable with backend, frontend, contract, and Git hygiene gates.

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

- Build PASS.
- Full unit PASS; expected baseline after Emergency phase was `42 suites, 221 tests` before adding the new final boundary spec.
- E2E PASS; expected `1 suite, 16 tests`.
- ESLint PASS with 0 errors; existing warnings are acceptable if unchanged.
- OpenAPI export PASS, expected `71 paths` unless a legitimate contract change is separately approved.

**Frontend gates:**

```bash
cd frontends/font-end-vietsage
pnpm run sync:api:types
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```

Expected:

- Sync PASS.
- Typecheck PASS.
- Lint PASS.
- Build PASS.
- Existing Next build warning may appear and is non-blocking if unchanged:

```txt
ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
```

**Stale-reference checks:**

```bash
git diff --check
```

```bash
# No legacy module folders.
for folder in auth rbac hotel-users hotels guest-os tenant-owners telegram; do
  test ! -e "services/auth-service/src/modules/$folder" || exit 1
done
```

```bash
# No unsafe webhook URL secret contract.
grep -RIn --include='*.ts' -E 'webhook/:secret|@Param\(["'"']secret["'"']\)' services/auth-service/src && exit 1 || true
```

```bash
# No direct guest-session persistence in Emergency.
grep -RIn --include='*.ts' 'prisma\.guestSession' services/auth-service/src/modules/emergency && exit 1 || true
```

**Git hygiene checks:**

```bash
# .vscode must never be staged.
git diff --cached --name-only | grep -F 'frontends/font-end-vietsage/.vscode/settings.json' && exit 1 || true
```

```bash
# tsconfig is allowed/expected if verification passes.
git diff --cached --name-only | grep -F 'services/auth-service/tsconfig.json'
```

Expected:

- `.vscode/settings.json` absent from staged files.
- `services/auth-service/tsconfig.json` present in staged files if still changed and verified.

---

## Task 7: Stage and Commit Final Phase

**Objective:** Commit only final-phase artifacts and the approved `tsconfig.json`; leave `.vscode` local-only.

**Stage exact paths only:**

```bash
git add \
  .hermes/plans/2026-07-12_125154-final-release-boundary-gate-phase.md \
  services/auth-service/tsconfig.json \
  services/auth-service/src/modules/tests/final-boundary-release.spec.ts \
  services/docs/PLANS.md \
  docs/DOMAIN_MAP.md \
  docs/ARCHITECTURE.md \
  services/docs/ARCHITECTURE.md \
  shared/api-contract/openapi/v1/openapi.yaml \
  shared/api-contract/openapi/v1/openapi.json \
  frontends/font-end-vietsage/src/generated/openapi/v1.ts
```

If some optional files have no diff, `git add` is harmless.

**Safety check before commit:**

```bash
git diff --cached --name-status
```

Must not include:

```txt
frontends/font-end-vietsage/.vscode/settings.json
```

**Commit:**

```bash
git commit -m "chore(core-api): finalize modular monolith release gate"
```

**Post-commit checks:**

```bash
git status --short
git log -1 --oneline
```

Expected status after commit:

```txt
 M frontends/font-end-vietsage/.vscode/settings.json
```

If the only remaining dirty file is `.vscode/settings.json`, report that it was intentionally left local-only.

Do **not** push unless the user separately says to push.

---

## Success Criteria

- `services/auth-service/tsconfig.json` is validated and committed if still needed.
- `.vscode/settings.json` is not staged, committed, or pushed.
- Final boundary regression spec exists and passes.
- Services docs mark the boundary-port/OpenAPI release-gate items complete based on real verification.
- Backend build/unit/e2e/eslint/OpenAPI export pass.
- Frontend OpenAPI sync/typecheck/lint/build pass.
- Stale-reference checks pass.
- Commit created:

```txt
chore(core-api): finalize modular monolith release gate
```

- No remote push occurs without explicit user approval.
