---
name: ui-quality-promax
description: Strict UI/UX quality, visual-stability, responsive, typography, interaction, accessibility, and browser-verification skill for fullstack-vietSage. Use for any UI audit, UI fix, polish, redesign, responsive issue, visual bug, workspace/page review, or when deciding whether a rendered interface is stable or production-ready.
---

# UI Quality Pro-Max — VietSage

UI quality is not decoration. A page is acceptable only when it is visually coherent, usable, responsive, accessible at a practical baseline, stable at runtime, and verified in a real browser after the final source change.

Tests, lint, typecheck, build success, DOM existence, or a clean console never substitute for rendered-browser quality.

## 1. When this skill is mandatory

Load and follow this skill when the primary task involves:

- UI/UX inspection, review, audit, polish, or repair;
- responsive stabilization;
- typography, spacing, color, icon, form, table, navigation, or state quality;
- redesign of an existing frontend surface;
- comparison against a visual reference;
- deciding whether a page/module/workspace is visually stable, integration-ready, or release-ready.

Natural-language triggers include: `soi lại giao diện`, `fix UI`, `fix UX`, `polish`, `responsive`, `review giao diện`, `ổn định dashboard`, `kiểm tra UI`, and `redesign existing page`.

## 2. Authority and supporting taste skills

Do not import another product's visual identity into VietSage. Learn the current VietSage design language, design primitives, typography, colors, spacing, components, product behavior, and frontend architecture first.

Resolve design guidance in this order:

1. explicit current user request;
2. repository architecture, security, and business rules;
3. existing VietSage product behavior;
4. existing VietSage design tokens/components;
5. this UI Quality Pro-Max skill;
6. supporting local taste/design skills.

When present locally, inspect and use relevant supporting skills such as:

- `.agents/skills/design-taste-frontend/`
- `.agents/skills/design-taste-frontend-v1/`
- `.agents/skills/high-end-visual-design/`
- `.agents/skills/redesign-existing-projects/`
- `.agents/skills/stitch-design-taste/`

They are advisory heuristics, not authorities. Do not blindly merge unrelated aesthetics. Extract useful rules, reject contradictions, and preserve one coherent VietSage product language.

## 3. Navigation and impact discipline

UI work is still coding work. Follow the repository's mandatory navigation pipeline:

`Graphify query/impact -> minimal file set -> scoped Repomix -> exact source -> edit -> validate -> browser inspect`

Before changing shared primitives, tokens, shell components, navigation components, form primitives, table primitives, or feedback components, use Graphify impact/affected analysis to inspect all direct callers.

Never use UI review as justification for broad repository scanning.

## 4. Mandatory browser-first rule

For web UI targets, final verification through the configured Chrome DevTools MCP is mandatory.

A UI task cannot PASS based on any combination of:

- unit/component tests;
- lint/typecheck;
- production build;
- source inspection;
- DOM existence;
- absence of compile/runtime errors;
- a screenshot captured only before changes;
- manual claims without browser evidence.

If Chrome DevTools MCP is unavailable or cannot connect, mark the browser/visual gate `BLOCKED`.

Screenshots are evidence, not decoration. The agent must visually inspect them and state what was observed.

## 5. Required working loop

For audit-only work:

`discover -> render -> interact -> inspect -> capture -> classify -> report`

For fix work:

`discover -> baseline screenshots -> visually inspect -> classify -> root cause -> smallest coherent edit -> automated validation -> reopen browser -> interact -> AFTER screenshots -> compare BEFORE/AFTER -> Network/Console check -> repeat until stable -> final acceptance`

The agent must not stop after source edits. The last meaningful source change must always be followed by rendered-browser reinspection.

## 6. Strict visual inspection checklist

### 6.1 Typography

Inspect the real rendered typography, not only CSS source:

- actual loaded font family and fallback;
- font resource failures;
- requested weight vs available weight;
- accidental synthetic bold/italic;
- font-size, weight, line-height, letter-spacing;
- heading hierarchy;
- body readability and line length;
- button, label, placeholder, table, badge, and numerical typography;
- truncation and unintended wrapping;
- Vietnamese diacritics and every locale relevant to the surface;
- long translated strings and font-metric breakage.

Reject literal icon ligatures, missing glyphs, unreadably light text, arbitrary unavailable font weights, or clipped labels caused by real font metrics.

### 6.2 Geometry, spacing, and rhythm

Inspect:

- container widths and gutters;
- vertical rhythm;
- section and component spacing;
- control heights;
- icon/text gaps;
- card/form/table density;
- alignment and baseline consistency;
- border radius, borders, shadows, dividers;
- whitespace balance and visual grouping.

Catch visibly harmful 1–4px misalignment, inconsistent control heights, uneven button padding, random spacing values, card rhythm mismatches, and layouts that are unnecessarily cramped or empty.

Prefer existing VietSage tokens and primitives instead of inventing a second spacing system.

### 6.3 Color and hierarchy

Inspect:

- page/background/surface hierarchy;
- primary, secondary, destructive, warning, success, error, info, disabled, hover, active, selected, and focus states;
- text and muted text contrast;
- border visibility;
- status badges and data colors.

Primary actions must look primary. Destructive actions must be unmistakable. Read-only state must differ from actionable state. Important status must not rely on color alone.

Do not claim formal WCAG compliance unless the task explicitly performs it.

### 6.4 Iconography

Reject:

- icon names/ligature strings rendered as visible text;
- missing icon fonts/assets;
- inconsistent icon families without reason;
- arbitrary icon sizes;
- poor baseline alignment;
- tiny clickable icon hit areas;
- ambiguous icon-only actions without accessible names or supporting labels/tooltips where needed.

Reuse the installed/current icon infrastructure. Do not add icon dependencies without explicit approval.

## 7. Responsive quality is mandatory

Do not test only desktop + mobile.

Use a representative viewport matrix including at least:

- 320px
- 360px
- 390px
- 430px
- 768px
- 820px
- 1024px
- 1280px
- 1440px
- 1920px

Also test at least one mobile landscape viewport when relevant and continuously resize around important breakpoints to catch intermediate-width failures.

Inspect:

- horizontal overflow and unintended scrollbars;
- clipping and overlap;
- wrapping/stacking order;
- sidebar/drawer behavior;
- tables and data grids;
- cards and charts;
- dialogs, dropdowns, popovers;
- forms and action groups;
- sticky/fixed elements;
- pagination;
- long labels and translations;
- touch targets;
- nested scroll traps;
- mobile keyboard obstruction where practical.

Responsive acceptance means the experience remains usable, not merely visible.

Use approximately 44×44 CSS px as a practical touch-target baseline for important controls unless an established design system provides a better contextual rule.

## 8. UX inspection

For every surface ask:

- What is the user's goal?
- What is the primary action, and is it obvious?
- Is information ordered by importance?
- Is internal/technical wording leaking into user-facing copy?
- Is status understandable?
- Are destructive actions safe and proportional?
- Do success/error/empty/loading states explain what happens next?
- Are disabled actions understandable?
- Is navigation predictable and Back/Forward behavior sensible?
- Are filters/search/pagination preserved appropriately?
- Are users forced to enter raw IDs/UUIDs instead of human-readable selectors?
- Are permissions rendered clearly without pretending frontend checks are security?

Respect repository frontend rules:

- backend authorization remains authoritative;
- frontend capability filtering is UX only;
- entity selection follows the existing human-readable dropdown rule;
- state ownership remains consistent with VietSage architecture;
- server state continues through `@dangminhdev04032005/query-resource` repository -> resource -> feature hook -> component;
- use existing `SwalVietSage` feedback/confirmation conventions;
- do not replace established state, alert, or query infrastructure during UI polish.

## 9. Forms, tables, overlays, and async states

### Forms

Inspect labels, required state, helper text, validation placement and clarity, grouping, keyboard navigation, autocomplete/autofill semantics, submit/loading/disabled/read-only states, double-submit prevention, password visibility controls where relevant, and mobile keyboard behavior. Placeholders must not be the only label.

### Tables/data-dense UI

Inspect column priority, alignment, numerical alignment, headers, row density, action placement, sticky regions, horizontal scrolling, sorting/filtering/pagination, row selection, bulk actions, long content, status chips, empty/loading/error states, and mobile adaptation.

A desktop table squeezed into 390px is not responsive. Use the least disruptive existing pattern: prioritized columns, horizontal table scroll, card/list adaptation, or detail drawer, only when consistent with the current application.

### Dialogs/menus/popovers/toasts

Inspect viewport collision, z-index, clipping, focus management, Escape/click-outside behavior, destructive confirmation, button order, readable errors, toast stacking, and mobile positioning. Preserve the existing alert/confirmation system.

### Async states

Inspect loading, loaded, empty, error, retry, partial failure where supported, and stale/refetch states where relevant.

Reject layout collapse, large avoidable layout jumps, fake production data hiding failures, raw backend errors, blank empty boxes, or toast-only persistent failures.

## 10. Accessibility baseline

Perform practical accessibility inspection:

- semantic heading structure and landmarks where appropriate;
- button vs link semantics;
- visible form labels and accessible names;
- ARIA state where required;
- keyboard reachability and focus order;
- visible focus;
- dialog focus behavior;
- contrast;
- status/error messaging;
- icon accessibility;
- image alt behavior;
- reduced-motion behavior where motion exists.

Use keyboard-only navigation for primary flows and inspect the browser accessibility tree where practical.

## 11. Zoom and content stress

Where practical test:

- 125%, 150%, and 200% zoom for important workflows;
- long names/emails/property names;
- large numeric values;
- zero and missing optional values;
- translated copy;
- multiple status badges.

Do not accept a UI that works only with ideal demo strings.

## 12. Runtime and performance sanity

Through Chrome DevTools MCP inspect:

- Network requests and waterfalls;
- Console errors, hydration warnings, failed resources, unhandled rejections;
- duplicate/unexpected requests;
- obvious layout shift;
- huge/blocking images/fonts/resources;
- long main-thread stalls;
- excessively heavy or interaction-blocking animation.

This is a sanity gate, not permission for broad performance refactoring.

Motion must have purpose, consistent timing/easing, stable layout, and reduced-motion behavior where appropriate.

## 13. Defect classification

Classify findings:

- `P0`: security-sensitive UI failure, core task unusable, critical navigation broken;
- `P1`: serious user-flow defect, major responsive break, unusable primary interaction, major information failure;
- `P2`: clearly visible quality defect, typography inconsistency, alignment/spacing issue, poor responsive adaptation, confusing secondary UX;
- `P3`: minor polish.

Also classify the change type:

- `CONFIG ONLY`
- `TOKEN / DESIGN SYSTEM`
- `SMALL UI FIX`
- `COMPONENT FIX`
- `COMPONENT REWORK`
- `PAGE/FLOW REWORK`
- `PRODUCT/UX DECISION`
- `BACKEND/ARCHITECTURE OUT OF UI SCOPE`

Fix shared root causes instead of page-specific hacks. Examples: broken icon infrastructure, repeated sidebar overflow, inconsistent button heights, or recurring dialog geometry should be corrected at the responsible shared primitive after checking impact.

## 14. Architecture boundaries

UI polish must never silently:

- duplicate backend authorization logic;
- bypass capability checks;
- alter authentication semantics;
- change service contracts or database schemas;
- add dependencies;
- replace query-resource/state architecture;
- replace `SwalVietSage`;
- refactor unrelated features.

Any such change requires explicit approval.

## 15. Visual acceptance and scorecard

A full UI task may PASS only when:

- no P0 remains;
- no P1 remains;
- no obvious broken fonts/icons remain;
- no obvious clipping/overlap remains;
- no serious horizontal overflow remains;
- all primary flows remain usable;
- the representative responsive matrix has been inspected;
- primary keyboard flow works;
- loading/error/empty states are reasonable;
- no significant relevant Console/runtime errors remain;
- visual language is coherent with VietSage;
- the final rendered browser state was inspected after the final source change.

P2/P3 may remain only when documented.

For full reviews return this scorecard:

| Area | Score |
| --- | --- |
| Visual hierarchy | /10 |
| Typography | /10 |
| Spacing & rhythm | /10 |
| Color & contrast | /10 |
| Iconography | /10 |
| Forms | /10 |
| Tables/data density | /10 |
| Navigation | /10 |
| Feedback/states | /10 |
| Responsive 320–1920 | /10 |
| Touch usability | /10 |
| Accessibility basics | /10 |
| Runtime/browser stability | /10 |
| UX clarity & efficiency | /10 |
| VietSage visual coherence | /10 |
| Overall UI quality | /10 |

Scoring standard:

- 5 = functional but visibly unfinished
- 6 = acceptable internal tooling
- 7 = solid product quality
- 8 = polished production quality
- 9 = exceptionally refined
- 10 = rare; nearly no meaningful improvement remains

Never award 9/10 to a UI with obvious overflow, broken icons, inconsistent typography, poor mobile adaptation, or raw technical copy.

## 16. Final report evidence

For every meaningful fix batch, capture BEFORE and AFTER screenshots at equivalent state/viewport where practical and state what changed visually.

Final report must include:

- routes/surfaces inspected;
- viewport matrix inspected;
- defects fixed and remaining P0/P1/P2/P3;
- exact files changed;
- automated validation commands/results;
- Chrome DevTools MCP findings for DOM/Network/Console/accessibility/responsive behavior;
- representative screenshot evidence;
- scorecard;
- what was verified vs not verified;
- whether the target is stable for integration or still needs work.

A UI PASS without rendered-browser evidence is invalid.
