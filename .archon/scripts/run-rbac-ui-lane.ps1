param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('role-list', 'capability-groups', 'role-detail', 'integration')]
  [string]$Lane
)

$ErrorActionPreference = 'Stop'
$Repo = 'C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage'
$Image = 'C:\Users\Dangminhdev0403\AppData\Local\hermes\cache\images\img_a01a35150435.jpg'
$Codex = 'C:\nvm4w\nodejs\codex.cmd'

$Common = @'
CHO PHÉP SỬA
User approved this exact Archon UI redesign scope. Do not ask again.
Read AGENTS.md, PONYTAIL.md, frontend AGENTS.md/docs, and .agents/skills/design-dna/SKILL.md before editing.
Use Graphify/Repomix context already available at graphify-out/repomix/rbac-ui-redesign.xml.
Preserve the current capability-only API and unrelated dirty work. No backend, package, lockfile, migration, deploy, Graphify, or biometric edits.
Match the supplied RBAC reference image while respecting current VietSage tokens. Vietnamese UI. Accessible keyboard/focus/44px targets. No new dependency.
Run exactly one focused eslint check for your changed file. Stop after that check.
'@

$Prompts = @{
  'role-list' = @'
Create only frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/_components/rbac-role-list-panel.tsx.
Presentational component only. Props own roles, selected role, tab, search, status filter, selection, custom-menu actions, create action. Implement system/custom tabs with counts, search/filter controls, selected state, system lock badge, custom three-dot menu, responsive behavior. Do not modify callers or any other file.
'@
  'capability-groups' = @'
Create only frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/_components/rbac-capability-groups.tsx.
Presentational component only. Props own grouped capabilities, search/filter, expanded groups, read-only/saving state, and toggle callbacks. Implement overview totals, three-column grouped cards on wide screens, accessible disclosure controls, visible enabled state, responsive single column. Show capability labels/descriptions/risk only; never method/path. Do not modify callers or any other file.
'@
  'role-detail' = @'
Create only frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/_components/rbac-role-detail-header.tsx.
Presentational component only. Props own selected role, user count, active tab, tab change, clone callback. Implement role icon/summary, SYSTEM_TEMPLATE locked banner, clone CTA, detail tabs for permissions/info/users, responsive stacking, accessible tab semantics. Do not modify callers or any other file.
'@
  'integration' = @'
Integrate the three new RBAC presentational components into the existing /admin/permissions surface.
Allowed writes only:
- frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/_components/role-permissions-browser.tsx
- frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/page.tsx
- frontends/front-end-vietsage/src/app/(vietsage)/admin/permissions/permission-types.ts
Reuse current state and capability API. Do not create another data layer. Preserve loading/error/dirty/saving/success behavior. SYSTEM_TEMPLATE remains read-only. CUSTOM remains editable. Wire clone only through existing safe role-create/capability APIs; if unsafe or unavailable, leave the CTA disabled with accurate Vietnamese copy instead of inventing backend work. Run exactly one focused eslint command over these three files.
'@
}

$Prompt = $Common + "`n" + $Prompts[$Lane]
& $Codex exec --model gpt-5.6-sol -c 'model_reasoning_effort="high"' --sandbox workspace-write --approve-for-me -C $Repo -i $Image $Prompt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
