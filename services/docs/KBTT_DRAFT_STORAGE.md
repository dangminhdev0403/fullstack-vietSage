# KBTT canonical guest profile and compact draft storage

## Storage contract

GuestStayOccupant owns shared current guest identity. GuestStay retains the existing primary-guest compatibility summary consumed by billing, GuestOS and operational queries; this release does not drop those columns or change reservation booking data. KBTT profile edits update the occupant, primary-only stay summary and declaration revision atomically. Co-guest edits never overwrite the primary summary.

KbttGuestDeclaration.draftPayloadJson stores BCA-specific fields and values that cannot be reconstructed exactly from the current guest/stay. Redundant name, sex, document number, birth date, room and arrival/departure strings can be omitted. Provider document type, nationality code, birth-date precision, residence validity and explicit optional/null values retain their provider meaning. Legacy differences and names exceeding the canonical profile limit remain lossless overrides rather than being truncated.

The public draftPayload remains fully composed. List, detail, save and immediate/batch delivery use the same composer, then the unchanged Vietnamese/foreign ready schemas validate the wire payload. Foreign year-only birth dates remain YYYY in the guest profile and YYYY-01-01 plus Y at the provider boundary. Provider nationality codes are not assumed to be ISO codes. submittedPayloadJson, fingerprints, submittedCsltId and provider outcomes remain transmission evidence and are not compacted or recomputed after a profile change.

## Migration and rollout

Migration: prisma/migrations/20261116010000_compact_kbtt_draft_profiles/migration.sql, relative to services/auth-service.

- This data-only migration adds/drops no table or column. It considers only the latest DRAFT/READY/FAILED revision and removes a JSON key only when its value exactly matches a reconstructible canonical value. Malformed JSON, divergent legacy fields and frozen SENDING/SUBMITTED/UNKNOWN/CANCELLED revisions remain unchanged. Submitted snapshots and all source profile values remain untouched.
- The transaction locks the four participating tables against concurrent writers while compacting. It increments the declaration version only when JSON changes, preserving updatedAt, statuses and result metadata. A repeated execution makes no additional changes. It does not promise immediate physical disk reclamation; PostgreSQL manages row/page reuse separately.
- Deploy during the existing maintenance procedure with writers stopped. Verify the target environment and review all pending migrations with `pnpm -C services/auth-service exec prisma migrate status`. Apply the canonical migration chain using `pnpm -C services/auth-service exec prisma migrate deploy` only with approval for that database. Start the matching application version afterward; do not expose compact storage to older application instances during a mixed-version rollout.
- The Prisma schema/client and public response shape are unchanged. Existing deployment client generation can remain as configured; this change requires no new package, service, port or provider setting.
- Check local health/readiness and canonical profile/detail responses after deployment. Keep BCA delivery controls unchanged until an authorized provider test. Browser/provider acceptance and actual migration application are separate evidence.

## Validation and rollback limits

`pnpm -C services/auth-service exec jest --runInBand --runTestsByPath src/modules/kbtt/tests/kbtt-draft-compaction-migration.spec.ts` checks compaction invariants. The read-only verification script `node services/auth-service/scripts/verify-kbtt-draft-compaction.cjs` evaluates the exact migration CTE against synthetic fixtures and plans the UPDATE with EXPLAIN without ANALYZE; it never applies the migration or writes fixture rows.

Retain this application's full-draft composition compatibility if rolling back other changes. Do not simply run an older application whose detail API returns the raw stored JSON. A full legacy rollback requires a separately reviewed rehydration operation under the same writer-stop discipline; no destructive reverse migration is included.
