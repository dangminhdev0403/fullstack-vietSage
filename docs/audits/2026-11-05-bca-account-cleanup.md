# BCA account cleanup — local workspace, 2026-11-05

Scope: this workspace and the configured local PostgreSQL `vietsage_auth` database. User authorized clearing real BCA accounts, retaining `test_kblt` and the real BCA URL. No provider request or remote deployment was performed during cleanup.

Baseline: `6fdd10d8`; existing implementation changes were preserved. Secret values are intentionally omitted.

| ID | Classification | Finding and correction | Status |
|---|---|---|---|
| BCA-CRED-01 | VIOLATION | Both ignored Postman files under `shared/kbtt/` contained non-demo hotel username/password defaults. Replaced all copies with `account.json:test_kblt`; cleared access/refresh token, CSLT and declaration ID variables. | VERIFIED |
| BCA-CRED-02 | VIOLATION | Collection contained a separate, unverified Basic client pair. Removed it; the three auth requests now reference the login/token Basic values already validated against the demo, supplied by the ignored environment. | VERIFIED |
| BCA-CRED-03 | COMPLIANT | Local database contained zero `KbttHotelConnection` rows. No stored account needed deletion; declaration/business history was retained. | VERIFIED |
| BCA-CRED-04 | COMPLIANT | Local backend uses only the approved demo origin, with live delivery false, kill switch true and lifecycle delivery false. Real origin remains a reference in OpenAPI and Postman `realBaseUrlReference`. | VERIFIED |
| BCA-CRED-05 | VIOLATION | Frontend public catalogs independently defaulted to the real origin. Changed the no-env fallback to the approved demo and set its ignored local environment to demo. Explicit environment selection, the six supplied GET paths and 24-hour caching remain supported. | VERIFIED |
| BCA-CRED-06 | VIOLATION | OpenAPI listed Production first, so imported tools could select it by default. Demo is now the first server; the real URL is retained as an explicitly authorized Production reference. | VERIFIED |

Verification:

- Checked 1,884 text-file candidates outside dependency/build/Git caches; no remaining copies of removed credentials were found as plaintext, URL-encoded or Base64 values. Two restricted secret files were checked separately with read approval and contained no BCA references or known removed credentials.
- Independent tracked-source review covered 99 BCA/KBTT text files; no embedded real account/token was confirmed. Existing synthetic unit fixtures were retained.
- Three local n8n archives contained no BCA environment references; the two readable archives also contained no known removed credential values. Archives were not modified.
- Both Postman files parse as JSON, default to the demo origin/account, have empty session/establishment variables and preserve the real URL only as a reference. Their client Basic values remain local secrets required by the already verified demo authentication.
- `account.json` has only `test_kblt` among BCA account entries. Other application accounts and secrets were preserved.

- Frontend catalog regression: `node --test frontends/front-end-vietsage/src/features/kbtt/kbtt-public-catalog.test.mjs` passed 3/3; every fetch was mocked, covering demo fallback, all six supplied GET paths, ward query, caching and explicit origin override.
- `pnpm build:front` passed (exit 0, TypeScript and 77 static pages). Existing backend/lifecycle checks were reused because their source did not change in this cleanup.
- Restarted the local frontend after the build; local frontend and backend readiness routes both returned HTTP 200. Both runtime environment files select the approved demo; background delivery remains disabled.
- OpenAPI parses as JSON and defaults imported consumers to demo. Backend has no executable real-origin fallback; missing provider configuration fails unavailable.

Limits: the original provider PDF was retained as the API authority and was not text-extracted or redacted in this pass. Git history, installed dependencies, generated builds and remote/VPS databases are outside this cleanup claim. Clearing local credentials does not revoke a remote BCA account/session; real-provider operations still require the user's explicit command.
