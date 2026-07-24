# Frontend Codex Instructions

Codex must follow repository-level instructions before making frontend changes.

## Required Reading

1. `../../AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/RULES.md`
4. Task-specific guide:
   - feature/module work: `docs/MODULE_GUIDE.md`
   - API/contract work: `docs/CONTRACT_GUIDE.md`
   - runtime/UI/state/realtime/error/i18n work: `docs/RUNTIME_UI_GUIDE.md`
   - planning/progress work: `docs/PLANS.md`

## Frontend Rules

- Use Next.js best practices and preserve server/client boundaries.
- Keep route files thin and compose feature components.
- Do not call backend APIs directly from presentation components.
- For every new or materially changed client-side API module, use `@dangminhdev04032005/query-resource`. Create a repository, declare only its real capabilities with `createResource` / `defineQuery` / `defineInfiniteQuery` / `defineMutation`, then consume the generated options from a feature hook. Do not write raw `queryKey` + `queryFn` or raw `mutationFn` objects in pages or feature components.
- Raw TanStack Query hooks remain valid only to consume resource-generated options and for the app-level `QueryClient` provider. Realtime code must use the resource-generated key/cache operations when a resource exists.
- The npm package is infrastructure only: repositories still own HTTP, DTO mapping, transforms, and pagination normalization; resources must not call `fetch`, Axios, or a VietSage API client directly.
- Reuse existing UI/shared components before creating new ones.
- Do not modify `package.json` unless explicitly approved by the user.
- Do not change unrelated backend/shared files during frontend work.

## Completion Report

Include modified files, validation commands, lint/build/typecheck results when run, and docs updated.
