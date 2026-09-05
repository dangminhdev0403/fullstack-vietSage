---
name: design-dna
description: Enforce the VietSage frontend design contract during UI creation, modification, review, typography, responsive, accessibility, or visual-stability work.
---
# Design DNA
## Trigger
Use this skill for any UI create/edit/review task, including typography, spacing, color, components, layout, responsive behavior, motion, accessibility, loading/error/empty states, or visual stability. Skip it for backend-only, infrastructure-only, and copy-only tasks with no rendered UI effect.
## Required workflow
1. Read `PONYTAIL.md`, nearest `AGENTS.md`, frontend rules, and `references/DNA.md`.
2. Load only relevant taxonomy files from `references/`; do not read every file when the task is narrow.
3. Inspect existing shared tokens/primitives before writing code. Fix drift at the shared root when all affected surfaces route through it.
4. Reuse existing components and dependencies. Do not create a parallel design system or modify package files without approval.
5. Enforce: body/primary controls >=16px; metadata >=14px; visible focus; 44px touch targets where applicable; stable loading/error/translated layouts; reduced-motion support.
6. Validate changed UI with the smallest reliable type/lint/test gate plus repository-mandated UI gates. Browser verification follows repository policy.
## Natural-language operations
- Audit: `Use Design DNA to audit <file or surface> and report exact drift.`
- Fix: `Use Design DNA to fix <surface>; prefer shared tokens and primitives.`
- Update contract: `Update Design DNA: <plain-English feedback>. Then report impacted source files; do not edit them unless requested.`
## Source order
Current source and canonical `DESIGN.md` win over stale references. If they conflict, stop and report the conflict; never invent a third rule.
## Output
Report files checked, drift fixed, validation run, remaining visual risk, and exact docs read. Keep reports compact.
