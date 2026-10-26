# User management completion and verification

Date: 2026-10-23. This report covers the current user-management task; earlier MVP reports describe an earlier configuration state. All automated account data was fictional. No hosted account was created, email sent, hosted setting changed, migration applied, file staged, commit created or push performed.

## Implementation

- Dedicated `server-only` Supabase JS administration client uses `SUPABASE_SECRET_KEY` only, with persistence, auto-refresh and URL session detection disabled.
- Server pages/actions reuse `getClaims()` and the current active `profiles` record through the existing access helpers. Only `admin_dinas` can reach Auth administration. Invitation actions recheck access after reading the directory, immediately before sending.
- Directory requests use sequential `listUsers()` pages and join email to profiles by `user_id`. Only ID/email are retained. Duplicate IDs, changed totals, incomplete pages and more than 10,000 users fail closed. Exactly 10,000 accounts are supported, including servers without count metadata. Pagination does not depend on the installed SDK's Link-header parsing.
- Email lookup and invitation readiness have separate diagnostics. New invitations require a valid trusted application origin. Explicit profile recovery remains available without that origin because it sends no email.
- Server validation enforces supported roles, no school for Dinas and one existing active school for school staff. Profile writes use the requesting administrator's SSR client, preserving RLS and the existing audit actor.
- Existing profiles are never overwritten by an invitation/recovery request. Orphan recovery is explicit and uses INSERT, not upsert. Both returned and thrown partial-write failures retain recovery instructions. No accounts are deleted automatically.
- Profile editing, role/school reassignment and activation remain available without an Auth administration secret. The existing restriction against self-demotion/deactivation remains. New migration `20261023000300_guard_last_active_admin.sql` adds database-wide last-admin protection and statement-level serialization, without changing RLS or earlier migrations.
- Dialogs have required labels, local validation, confirmation reset on reopen, pending/duplicate-submit protection, safe errors, success feedback, keyboard dismissal and empty-school guidance. The existing dashboard loading/error boundaries are reused.
- Existing token-hash confirmation and PKCE callback routes were inspected and reused without code changes in this task. The setup guide now describes the exact invitation redirect/template relationship.

## Changed files / candidate staging list

Review only these task-related changes, together with any prerequisite uncommitted MVP work they depend on. Do not stage the entire dirty worktree automatically.

1. `.env.example`
2. `lib/users/admin.ts`
3. `lib/users/schema.ts`
4. `app/dashboard/users/actions.ts`
5. `app/dashboard/users/page.tsx`
6. `components/users/user-dialog.tsx`
7. `supabase/migrations/20261023000300_guard_last_active_admin.sql` (new, review only)
8. `tests/mvp.test.mjs`
9. `tests/users-admin.test.mjs` (new)
10. `tests/database-smoke.mjs`
11. `docs/mvp-setup.md`
12. `docs/user-management-verification.md` (new)

`.env.local`, applied SQL migrations, authentication utilities/callback code, dependency manifests, and unrelated feature files were not changed by this task. Temporary browser fixtures were updated outside the repository.

## Verification results

| Check | Result and scope |
| --- | --- |
| `npm.cmd run lint` | PASS. An initial test-harness variable naming error was corrected before the passing run. |
| `npx.cmd tsc --noEmit` | PASS. |
| `npm.cmd run build` | PASS. Existing `cacheComponents` / `partialPrefetching` configuration warning remains. |
| Node tests: alumni, schools, placement-status, mvp, users-admin | PASS, 61 tests. Includes unauthorized page/action calls, invitation permissions, orphan/duplicate recovery, thrown failures, SMTP diagnostics, exact pagination boundaries and safe origin validation. Network/framework boundaries are mocked. |
| `tests/database-smoke.mjs` with isolated PGlite | PASS, 13 SQL/RLS scenario groups. Actual SQL triggers enforce last-admin protection, batch rollback, active-school rules, audit actor identity, duplicate INSERT safety and changed role/school/deactivation visibility with the same authenticated ID. Not a hosted or multi-connection test. |
| Headless Chrome component fixtures | PASS, 12 groups. Actual components, production CSS, mocked Auth/actions/router. Includes 320/375/768/1280 px, required fields, pending double submission, error/retry, explicit recovery, profile editing/deactivation, unique labels, confirmation reset, empty schools, Escape and navigation. No runtime/console errors. |
| Production HTTP smoke | PASS. Eight protected routes, including `/dashboard/users`, redirect unauthenticated requests to login; four public auth pages load; invalid confirmation fails closed and signup routes redirect to login. |
| Secret-value scan | PASS. The configured secret value was compared locally against Git-visible files and built static assets without printing it; zero occurrences. `.env.local` is ignored. No claim about Git history or external deployment logs is made. |
| Diff review | PASS. Relevant source/migration changes reviewed; `git diff --check` found no whitespace errors. Existing unrelated worktree changes preserved. |

The browser run found and fixed a real duplicate-submit loading race: React Hook Form's submission flag could reset while another invocation was pending. A dedicated pending flag now follows the guarded network request.

Browser fixture evidence is local and temporary: `C:/Users/alvin/AppData/Local/Temp/alumni-mvp-79cc00421f294803bd9f0611bb5957c0/`. Files include `browser-test.mjs`, `fixture.tsx`, `results.json`, dashboard screenshots and `user-recovery-375.png`. The 375 px recovery screenshot was inspected visually. Fixtures use Arial fallback rather than fetching the production font and do not establish live SMTP delivery or authenticated end-to-end behavior.

Re-run the repository tests using the commands in `docs/mvp-setup.md`. The PGlite dependency is installed outside the project and supplied through `MVP_SQL_TEST_DEPS`; no project dependency was added.

## Remaining configuration and acceptance

1. `SUPABASE_SECRET_KEY` is present locally; its value was not displayed and validity against the hosted Auth API was not asserted. Confirm it belongs to the same project as the public URL. Never use a `NEXT_PUBLIC_` prefix.
2. The owner chose to set the deployment URL independently. Set `APP_SITE_URL` to the HTTPS origin, configure Supabase Site URL and exact redirect allowlists, then restart/redeploy. Until then, the new-invitation button intentionally stays disabled with a specific explanation; email lookup and explicit recovery remain independent.
3. Configure sender/SMTP and the invitation token-hash template as documented in `docs/mvp-setup.md`. Default email restrictions and delivery failures have safe diagnostics, not bypasses. API acceptance is not proof of inbox delivery.
4. Review migration 003 and its preceding profile guard migration before approved deployment. Database-level last-admin enforcement added here is not active on a hosted database until migration deployment. The application still blocks changing one's own administrative access.
5. Run live acceptance with controlled mailboxes and fictional profile names: invite each role, accept the link in a clean browser, set a password, verify role/school access, edit/deactivate, check audit entries, exercise partial-profile recovery, and try two concurrent admin changes. No authenticated test session or approved recipient was provided for this run.
6. Auth account creation/email/password events remain in Supabase Auth logs, not the existing `public.audit_logs` schema. Profile insertion and edits are covered by database audit triggers. Exactly-once delivery cannot be guaranteed across concurrent external Auth API calls; no automatic resend or destructive cleanup was added.
7. Directory listing is bounded and detects several concurrent-change cases, but it is not a transactionally consistent Auth/profile snapshot. Reload after changes; do not infer missing profiles from a failed directory request.

Suggested commit, after approval and prerequisite review:

`feat: complete user account management`

## Anti-Slop delivery gate

Scope: changed user-management UI, tested as component fixtures and reviewed in source; this is not a live-email or production certification. Design Read: education administration, navy structure and restrained teal interaction, data-first table/dialog layout. Dials: ENERGY 2 / RHYTHM 2 / MOTION 1.

### Hard gate

- R-02 PASS: no em dash in newly written user-management UI copy.
- R-03 PASS: browser assertions found no dialog overflow at 320, 375, 768 and 1280 px; the existing wide table remains in its scroll region.
- R-17 PASS: no invented statistics added; profile/orphan counts derive from server results.
- R-18 PASS: no testimonials or fabricated people imagery added.
- R-23 PASS: no visual assets or navigation structure added; fixture names explicitly identify fictional data.
- R-24 PASS: no new navigation links; existing user-management destination was exercised in the fixture.
- R-25 PASS: existing navy/white and semantic text classes retained; measured fixture text minimum contrast 5.82:1. Recovery screenshot shows readable labels and focus. No new palette added.
- R-26 PASS: invitation/recovery/edit submit, cancel, confirmation, role/school controls and activation have real handlers; unavailable invitation is disabled with page diagnostics.
- R-27 PASS: pending request, safe error/retry, success, empty-school and empty-directory states exist; dashboard loading/error boundaries remain in use.
- R-28 PASS: no FAQ added.
- R-32 PASS: native modal focus/keyboard dismissal exercised; labels have unique IDs and focus styling remains visible.
- R-33 PASS: source edits used apply_patch; automated formatting only formatted authored source.
- R-34 PASS: no theme toggle or dark-mode variant introduced.
- R-35 PASS: production build/HTTP smoke and recorded browser component click-through executed; mocked and live boundaries are listed above.
- R-36 PASS: no unsupported security or delivery guarantee; pending deployment/live tests explicitly listed.
- R-37 PASS: DESIGN.md direction and its exact dials used before UI changes.
- R-38 PASS: no fabricated production content; only explicitly fictional test fixtures.

### Purpose gate

- R-01 PASS: no gradients/glows introduced.
- R-04 PASS: no decorative icons introduced.
- R-06 PASS: existing application font stack retained for administrative readability; no display monospace or tracked uppercase labels.
- R-07 PASS: no background pattern introduced.
- R-08 PASS: no decorative arrows introduced.
- R-09 PASS: no promotional capsule badges introduced.
- R-10 PASS: no glassmorphism; dialog backdrop serves modal focus.
- R-12 PASS: existing component elevation only, no new large shadows.
- R-13 PASS: no glow treatment added.
- R-14 PASS: data table and task dialog retained, not feature-card grids.
- R-19 PASS: no template animation added; native dialog and pending feedback fit MOTION 1.
- R-22 PASS: no illustrations introduced.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 explicitly follow DESIGN.md.
- Consistency PASS: compact administrative controls, restrained semantic notices, no motion effects.
- Focal point PASS: page heading and invitation action; modal heading and submit action when open.
- Whitespace PASS: existing 4/8 px spacing separates fields, explanation and actions; phone screenshot inspected.
- Accent PASS: existing teal focus ring provides the deliberate interaction accent alongside navy structure.
- Identity PASS: Indonesian Dinas/school terminology and the navy administrative heading pattern retained.
- Design Read PASS: project-specific direction declared before UI changes.

### Craftsmanship and consistency

- C-1 PASS: changes serve configuration clarity, explicit recovery and safe profile administration.
- C-2 PASS: all changed controls exercised against fixture actions; server behavior independently tested.
- C-3 PASS: no filler section added; notices explain actual unavailable capabilities.
- C-4 PASS: responsive dialog, pending/error/retry, empty schools and keyboard checks passed in the stated fixture scope.
- C-5 PASS: no fabricated claims; email acceptance distinguished from delivery.
- R-05 PASS: existing data-first table/dialog composition preserved.
- R-11 PASS: existing control/card radii retained, no pill conversion.
- R-15 PASS: specific Indonesian actions: Undang pengguna, Pulihkan profil, Simpan perubahan, Batal.
- R-16 PASS: no marketing buzzwords introduced.
- R-20 PASS: role/school assignment and account-recovery language remains specific to this application.
- R-21 PASS: existing light administrative interface retained.
- R-29 PASS: navy/teal foundation and existing semantic amber/red states only.
- R-30 PASS: no external product design copied.
- R-31 PASS: typography/layout/colors retained for consistency; added explanations correspond to actual backend states.
