# Frontend Rules for front-end-vietsage

> Follows root [`.agents/AGENTS.md`](../../.agents/AGENTS.md) and [`docs/RULES.md`](docs/RULES.md).

## ZERO-WASTE VALIDATION GATE (STRICT)

When editing UI, CSS, Tailwind classes, spacing, JSX layout, copywriting, or presentation components:

1. **Lệnh DUY NHẤT được chạy để kiểm tra**:
   ```bash
   node scripts/verify-ui-rules.cjs
   ```
2. **NGHIÊM CẤM (STRICTLY FORBIDDEN)**:
   - **CẤM chạy mọi lệnh unit test**: `node --test`, `npm test`, `pnpm test`, `jest`, `vitest`, `playwright` (tuyệt đối không chạy bừa file test như `marketing-home-vi.test.ts`).
   - **CẤM chạy `tsc --noEmit`** khi chỉ sửa CSS/styling hoặc đổi text thuần túy (chỉ được chạy nếu có khai báo interface/props/types TypeScript mới).
   - **CẤM chạy `next build`** hoặc full-repo lint.
   - **CẤM soi diff các file không liên quan** (`git diff` file ngoài phạm vi task được giao).
   - **CẤM chạy các đoạn mã ad-hoc** (`node -e "..."`).
