# P1 QA Migration Verification Checklist

Use this checklist to verify the P1 QA migration pack without resetting, pushing, or migrating databases. Run commands from the repository root unless a command includes `Set-Location`.

## Preconditions

- Node and package managers are installed for each package lockfile in use.
- Docker Engine is running for compose validation.
- External secrets are not required for the safe checks below.
- Do not run `prisma:reset`, `prisma:push`, `prisma:deploy`, `prisma:dev`, `db:seed`, or any migration command against shared databases during QA verification.

## Backend Auth Service

```powershell
Set-Location .\services\auth-service
npm run build
npm run test
npm run test:e2e
npm run lint
Set-Location ..\..
```

Note: `npm run lint` currently invokes ESLint with `--fix`, so it may edit files. For a non-mutating lint check, run:

```powershell
Set-Location .\services\auth-service
npm exec eslint -- "{src,apps,libs,test}/**/*.ts"
Set-Location ..\..
```

## Contract Export, Verify, and Diff

```powershell
Set-Location .\services\auth-service
npm run openapi:export
Set-Location ..\..\shared\api-contract
npm run verify
Set-Location ..\..
git diff --exit-code -- shared/api-contract/openapi/v1/openapi.json shared/api-contract/openapi/v1/openapi.yaml
```

Expected result: export succeeds, verify reports the path count, and `git diff --exit-code` returns zero unless the migration intentionally changes the OpenAPI contract.

## Frontend API Sync, Lint, and Build

```powershell
Set-Location .\frontends\front-end-vietsage
npm run sync:api:types
npm run lint
npm run build
Set-Location ..\..
git diff --exit-code -- frontends/front-end-vietsage/src/generated/openapi/v1.ts
```

Expected result: generated types stay in sync and the generated type diff check returns zero unless the migration intentionally changes the OpenAPI contract.

## Docker Compose Config and Build

```powershell
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml build
```

Production compose requires real secret values. Use placeholder values only for config syntax validation, not deployment:

```powershell
$env:POSTGRES_PASSWORD = "qa-placeholder"
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
Remove-Item Env:\POSTGRES_PASSWORD
```

## Smoke Tests

Start the local stack only when it is acceptable to create/use local Docker volumes:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Backend health smoke:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/health -Method Get
```

Frontend smoke:

```powershell
Invoke-WebRequest -Uri http://localhost:3000 -Method Get -UseBasicParsing
```

Optional container status check:

```powershell
docker compose -f docker-compose.yml ps
```

Stop the local stack without deleting volumes:

```powershell
docker compose -f docker-compose.yml down
```

## Pass Criteria

- Backend build, unit tests, e2e tests, and lint pass.
- OpenAPI export and contract verification pass.
- Contract and generated frontend API type diffs are either empty or intentionally reviewed.
- Frontend API sync, lint, and build pass.
- Docker compose config and build pass for local compose; production compose config/build pass when required secret placeholders are supplied.
- Smoke tests return successful HTTP responses for backend `/health` and frontend `/`.
