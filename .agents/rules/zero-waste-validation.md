# Zero-Waste Validation Gate

This rule is mandatory for all agents (Codex, Antigravity, and any automated runner) working in `fullstack-vietSage`.

## 1. Scope: Pure UI / CSS / Styling / JSX Layout / Copywriting
When the task involves editing CSS, Tailwind classes, spacing, colors, JSX layout, UI text, or presentation components:

### The ONLY Validation Command Allowed:
```bash
node scripts/verify-ui-rules.cjs
```

### STRICTLY FORBIDDEN (DO NOT EXECUTE):
1. **NEVER run ANY test suite or unit test**:
   - Strictly forbidden: `node --test`, `npm test`, `pnpm test`, `jest`, `vitest`, `playwright`.
   - Never run arbitrary test files (e.g. NEVER run `marketing-home-vi.test.ts` when editing CSS or layout).
2. **NEVER run `tsc --noEmit` on pure CSS / styling / copy**:
   - `tsc` is only permitted if new TypeScript interfaces, types, or props were introduced.
   - For pure CSS edits (`globals.css`), running `tsc` is strictly forbidden.
3. **NEVER run full build or full lint**:
   - Strictly forbidden: `next build`, `pnpm build`, `eslint .`, `pnpm lint`.
4. **NEVER inspect unrelated files via git**:
   - Strictly forbidden to run `git diff` on files not assigned to the task (e.g., inspecting `tape-chart-view.tsx` when task was `globals.css`).
5. **NEVER execute ad-hoc node scripts**:
   - Strictly forbidden: `node -e "..."`.

---

## 2. Scope: Backend Services / DTO / Business Logic
- Run ONLY the single scoped unit test for that specific modified file (e.g., `jest path/to/service.spec.ts`).
- NEVER run full-repo test suites.

---

## 3. Scope: Database Schema / Prisma
- Run ONLY `npx prisma validate`.
- NEVER run `prisma migrate reset` or seed production.

---

## 4. Scope: Markdown / Documentation
- Read `git diff` for the documentation file only.
- NEVER run tests, lint, build, or typecheck.
