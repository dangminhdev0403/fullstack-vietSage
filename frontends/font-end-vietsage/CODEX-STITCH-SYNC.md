# CODEX STITCH UI SYNC SYSTEM

## Purpose

Stitch MCP is the source of truth for UI synchronization.
The target output must be Next.js code in this repository (TS/TSX + App Router), not standalone HTML/CSS/JS files.

## Project Scope (Hard Lock)

Only use the Stitch project titled `VietSage`.

- Ignore all other Stitch projects.
- If `VietSage` is not found in `list_projects`, stop and report blocker.
- Never sync screens from any non-`VietSage` project into this repository.

## Skill primary

- Use skill /next-best-practices
  Treat it as a mandatory default rule.

## Workflow

For every sync request:

1. list_projects
2. find project: VietSage
3. list_screens
4. match screen
5. get_screen
6. fetch htmlCode if available (as a reference source only)
7. extract:
   - layout
   - typography
   - colors
   - spacing
   - assets
   - reusable patterns
8. map extracted UI to the local Next.js structure:
   - `src/app/*` routes and pages
   - reusable components (shared UI first)
   - project architecture/layers in docs
9. implement directly into local Next.js codebase

Never stop after:

apply_design_system()

Always:

- preserve Next.js server/client boundaries
- prefer Server Components by default
- only add `'use client'` where required
- reuse existing UI primitives before creating new ones
- keep components modular and composable
- avoid unnecessary rerenders
- avoid inline object/function recreation in hot paths
- preserve smooth scrolling performance

Never:

- generate standalone HTML files as final implementation output
- implement feature screens as isolated CSS/JS artifacts outside project architecture

---

# Layout Rules

UI must remain mobile-first.

On web preview:

- center app viewport
- max width around 390px
- preserve mobile visual appearance

Preferred Next.js structure:

- App Router pages/layouts in `src/app`
- reusable UI components in project component layers
- semantic HTML + Tailwind utility classes
- `next/image` for images where applicable

---

# Data Rules

Until backend integration exists:

- use static mock data in TS/TSX modules
- preserve exact text extracted from Stitch htmlCode
- preserve extracted colors and visual hierarchy

---

# Error Handling

If `get_screen` fails:

- retry up to 3 times

If still failing:

- stop
- report exact MCP error
- do not hallucinate layout

If htmlCode exists:

- fetch and parse before coding
- treat htmlCode as visual/content reference only
- convert to Next.js component structure (do not paste as raw HTML output)

---

# Sync Behavior

If screen already exists:

- patch/update only required sections
- preserve reusable structure
- avoid full rewrites

---

# Command Understanding

Examples:

User:
Sync screen: home

Meaning:
Synchronize Home Screen from Stitch MCP into the matching Next.js route/component.

---

User:
detailed requirements

Meaning:
Synchronize Hotel Detail Screen from Stitch MCP into the matching Next.js route/component.

---

# Input Confirmation Rules

Only ask for confirmation when multiple Stitch screens match the same requested screen name.

Do not ask confirmation when the user requests:

- all screens
- VietSage only
- sync all
- export all
- do it
- start implementation

For "VietSage only":

- select project VietSage
- sync all available screens
- do not ask again

## If the user command is ambiguous

Examples:

- multiple Stitch screen variants exist
- keyword matches multiple screens
- route mapping unclear

You must:

1. stop
2. list the matched screen candidates
3. ask the user to confirm the exact screen

Never auto-pick a variant when ambiguity exists.

---

## If the screen exists clearly

Examples:

- unique keyword match
- exact screen name match

You should:

- proceed automatically
- do not ask unnecessary confirmation

---

## If the screen does not exist

You must:

1. stop
2. explain that no Stitch screen exists
3. never hallucinate UI
4. ask the user to create/select a screen

---

## No Plan-Only / No Confirmation Loop

When the user gives a direct execution command such as:

- sync
- export
- implement
- do it
- start implementation
- VietSage only
- sync all
- export all screens

You must treat it as permission to execute.

Do not stop at planning.

Do not ask repeated confirmation.

Do not say "I will start" without modifying files.

After scope is clear, immediately perform tool actions:

1. list_projects
2. select VietSage
3. list_screens
4. get_screen
5. fetch htmlCode
6. map screens to routes/components
7. write/update files into the local Next.js codebase
8. run lint
9. update docs/PROJECT_STATUS.md

A valid completion must include real modified files.

Invalid responses:

- "I will proceed"
- "Starting implementation now"
- "Accepted"
- "On it"
- "Iâ€™ll begin now"
- plan only without edits

If implementation cannot continue, report the exact blocker:

- missing MCP tool
- missing htmlCode
- no matching screen
- file permission error
- lint error
- build error

Never silently stop after a plan.

## Before modifying existing implemented screens

If a screen was already synchronized before:

- explain which files will change
- preserve approved UI

## Finalization

1. npm run lint
2. fix related issues only
3. report modified files
4. provide test steps

