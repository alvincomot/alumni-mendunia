# MVP verification — 23 October 2026

## Scope and command results

All test records are fictional. No hosted database writes, invitations, account logins, or production migration execution were performed. The owner elected to run authenticated live verification.

| Check actually run | Result |
| --- | --- |
| `npm.cmd run lint` | PASS, exit 0 after fixing the test loader's prohibited `module` variable name |
| `npx.cmd tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run build` | PASS, exit 0; 25 pages generated; existing `partialPrefetching` warning remains |
| `node --test tests/alumni.test.mjs tests/schools.test.mjs tests/placement-status.test.mjs tests/mvp.test.mjs` | 50 PASS, 0 fail/skip |
| `node tests/database-smoke.mjs` with isolated PGlite dependency | 10 SQL/RLS scenario groups PASS, plus successful execution of all three migrations in memory |
| Chrome headless component fixture | 11 scenario groups PASS, no runtime exception or `console.error` |
| Production HTTP smoke | Eight protected routes redirect unauthenticated requests to login; four public auth pages return 200; invalid confirmation/signup routes fail closed |
| `git diff --check` | PASS for tracked changes; initial migration has no diff |
| Built browser JS scan for administrative key variable names | No matches for `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`; this is a scoped scan, not a full secret-audit certification |
| `npm.cmd audit --json` | Exit 1: 9 findings, 7 high/2 moderate; inherited build-tool chains; no forced major upgrades |

An initial type check saw stale generated route types after adding the dashboard layout; `next typegen` regenerated them. The newly resolved TanStack major API differed from v8, so the report table uses the explicit supported v8 dependency. Old test expectations were updated for the guarded RPC, batched current-placement reads, and dashboard/report invalidation. These intermediate failures were corrected and checks rerun.

## Automated application tests

The Node suite executes production modules with mocked Supabase/Next boundaries. It covers:

- Claims and active-profile validation; staff active-school requirement; admin/viewer read-only alumni access.
- Identity validation, inferred school assignment, cross-school write denial, duplicate NPSN, explicit school activation/deactivation.
- All initial statuses, optional date constraints, exact RPC arguments, no direct protected placement writes, partial failure recovery.
- Three legal status transitions, stale snapshots, duplicate submissions, chronological history grouping and missing/error states.
- Successor creation only against the exact terminal current placement, and missing-migration fail-closed behavior without old-RPC fallback.
- Current-placement-only monitoring, no double-current input, unplaced/terminal counts, zero rows, all report dimensions, sorting.
- Bounded batched reads, server row-limit handling, failure rather than silent truncated totals.
- Admin-only profile/invitation operations, active-school assignment, self-demotion/deactivation rejection, stripped unknown fields.
- Existing account/profile rejection, explicit orphan recovery, insert-only profile creation, recoverable partial invitation failures and safe errors.
- Export role checks before loading records, matching filters, no-store headers, UTF-8 BOM and formula/CSV escaping.
- WIB inclusive-start/exclusive-end date filtering and confirmation redirects that ignore external `next` values.

These tests do not claim that remote RLS or Auth delivery works merely because the network mocks passed.

## Isolated PostgreSQL tests

`tests/database-smoke.mjs` creates only an in-memory PGlite database. It supplies fictional auth roles/users and `auth.uid()`, omits only the pgcrypto extension declaration, and runs the original plus both proposed migrations. It exercises real PostgreSQL privileges, RLS, triggers, and functions:

1. School is inferred from the authenticated staff profile on alumni insert.
2. Duplicate initial registration and nonterminal replacement are rejected with no extra placement/history.
3. Old public/private RPC paths cannot bypass the new guard.
4. Staff B cannot read or update staff A's school data.
5. Status changes write history atomically; stale expected status and history edits are rejected.
6. A successor preserves the terminal predecessor/history and keeps exactly one current placement; reusing the predecessor ID fails.
7. Failed successor insert after the old current-marker update rolls back that marker and leaves history unchanged; invalid initial status also fails.
8. Both Dinas roles can read but cannot mutate alumni or create placements.
9. Profile updates record the authenticated administrator; own deactivation and inactive-school assignment fail.
10. Inactive-school staff cannot create alumni; Viewer cannot read audit rows.

This is **not** a hosted Supabase, PostgREST embedding, SMTP, or multiple-concurrent-connection test. Run the simultaneous-tab acceptance scenarios after deployment.

## Browser interaction record

Actual production presentation components were bundled with the compiled stylesheet. Router/server actions/Supabase client were replaced with fictional boundary adapters. Font in the fixture is Arial, so this is not a full authenticated-page typography test.

1. Dashboard/sidebar/filter/chart/table composition at 320, 375, 768 and 1280 px: no horizontal page overflow. Wide table scrolling remains inside its region. Screenshots saved; 375 px screenshot inspected visually.
2. Exact role menus: admin 6, viewer 3, staff 2 links. Mobile Menu opens with Enter; Escape closes and restores focus; clicking users records the correct destination.
3. Invitation dialog opens/closes with Escape, rejects missing required fields, submits selected school, disables pending controls, prevents duplicate pending submissions, blocks closing during the mutation, shows safe retry feedback, then closes/refreshes on mocked success.
4. Selecting a Dinas role removes school assignment; Batal closes the dialog.
5. Empty distribution and zero summary states render without fake monitoring values.
6. Login blocks empty inputs, shows a safe authentication error, and navigates to `/dashboard` on mocked success.
7. Password recovery submits the PKCE callback URL and displays non-enumerating success text.
8. Password setup rejects mismatched passwords without a mutation; matching values navigate to dashboard on mocked update.
9. Logout recovers from a thrown error and re-enables the button; mocked success navigates to login.
10. No runtime exception or `console.error` during these scenarios.
11. Computed dashboard heading/label/value/enabled-button text contrast: minimum 5.82:1, above the 4.5:1 threshold. The runner waits for React's committed pending/success UI rather than asserting immediately after the mocked request resolves.

Artifact directory, not staged: `C:/Users/alvin/AppData/Local/Temp/alumni-mvp-79cc00421f294803bd9f0611bb5957c0/`. Contains fixture source, boundary adapters, browser runner, results JSON, screenshots, HTTP smoke script and temporary PGlite install. No real credentials or business records are in the fixture.

Earlier status-action/history browser scenarios remain documented in `tests/placement-status-verification.md`. This master task reran their Node regression coverage; it did not claim a new live browser test for every earlier screen.

## Production HTTP smoke

Started a local production server on port 3217. Port 3102 was occupied and was not disturbed.

- `/dashboard`, `/dashboard/users`, `/dashboard/reports`, `/dashboard/audit-logs`, `/dashboard/alumni`, `/dashboard/alumni/new`, `/dashboard/schools`, `/dashboard/reports/export`: 307 to `/auth/login` without cookies.
- `/auth/login`, `/auth/forgot-password`, `/auth/access-denied`, `/auth/error`: 200.
- `/auth/confirm` without token, even with external `next`: 307 to `/auth/error`.
- `/auth/sign-up`: 307 to `/auth/login`.

No actual account session, email OTP, or token refresh was supplied. Therefore authenticated redirect chains, expiry/refresh and service integration remain manual acceptance items.

## Anti-Slop delivery gate record

Mode: during (existing session choice). Design Read declared before generation: administrative navy/teal identity from DESIGN.md, ENERGY 2 / RHYTHM 2 / MOTION 1. Functional content determined composition; no assets were created. The gate is recorded honestly: local source/component checks passed, but the complete authenticated-app interaction/resilience gate remains **PARTIAL** pending the owner's live checks. This is a review handoff, not release acceptance.

| Gate | Local evidence / limitation |
| --- | --- |
| R-02, R-17, R-18 | No filler slogans, testimonials, invented customers or fake product claims; fictional people exist only in clearly labeled tests |
| R-03 | Component composition tested at 320/375/768/1280 px; no horizontal page overflow; whole authenticated app remains pending |
| R-23 | No generated/downloaded visual assets; no asset permission required |
| R-24, R-26 | Navigation points to implemented routes; actual page/action controls wired; build/HTTP and fixture interaction evidence above; authenticated navigation still needs live click-through |
| R-25 | Computed fixture text contrast minimum 5.82:1; production colors follow existing DESIGN.md tokens; full live screen audit pending |
| R-27 | Shared dashboard loading/error boundaries plus per-view empty states; mutation pending/success/error branches; fixture exercises critical states |
| R-28 | No FAQ added |
| R-32 | Keyboard Menu/Enter/Escape/focus restoration and dialog Escape tested; native labeled controls and visible focus retained; whole-app keyboard audit pending |
| R-33 | Source edited with apply_patch; only formatting/build tooling and test artifacts generated externally |
| R-34 | App ships light mode without a theme toggle; removed starter themed layout |
| R-35 | Build and actual recorded component click-through completed; no full authenticated E2E PASS claim |
| R-36, R-38 | Real Supabase queries power statistics; empty data stays empty; no fabricated security/compliance/performance certification |
| R-37 | DESIGN.md supplied identity; declared Design Read and dials precede generation |
| R-01 | No gradients/glows; navy anchors navigation and teal highlights actions/data |
| R-04 | No new decorative icon collection |
| R-06 | Existing Geist from DESIGN.md retained; compact numeric/table typography supports scanning; no decorative monospace/uppercase labels |
| R-07, R-08 | No background patterns or decorative button arrows |
| R-09 | Existing badges communicate actual placement state only |
| R-10, R-12, R-13 | No glassmorphism/glow; borders distinguish data surfaces; dialog backdrop separates modal context |
| R-14 | Summary cells repeat because they compare mutually exclusive categories; charts, activity, filters and tables use content-specific layouts |
| R-19 | No decorative animation; chart animation disabled |
| R-22 | No generic illustration |
| Liveliness: dials consistent | Restrained action emphasis, distinct sidebar/header/content rhythm, no motion beyond native interaction |
| Liveliness: focal point | Page title and role-specific primary action precede filters/data; actual state counts provide dashboard emphasis |
| Liveliness: whitespace | Shared page gutters and section gaps separate filters, summaries and tables rather than filling a marketing template |
| Liveliness: accent | Teal action/data accents and active-nav marker; semantic status colors retain specific meanings |
| Liveliness: identity motif | Navy administrative frame, teal markers, school/role context and Indonesian employment-status vocabulary |
| Liveliness: Design Read | Declared before UI generation and applied without inventing a new brand |
| C-1, C-3 | Layout decisions serve school administration, current status comparison and record inspection |
| C-2 | Local fixture controls operate; actual server mutations covered by Node/SQL tests; hosted account/email workflows pending |
| C-4 | Local responsive/empty/error cases tested; authenticated whole-app resilience remains PARTIAL |
| C-5 | Monitoring counts and security statements tied to data/code/test evidence, with limits disclosed |
| R-05, R-11 | No marketing hero/bento/pricing template or all-pill controls; forms/tables/sidebar follow data tasks |
| R-15, R-16 | Specific Indonesian actions: Undang pengguna, Simpan perubahan, Unduh CSV; no marketing buzzwords |
| R-20, R-30 | School identity, four placement statuses and Dinas/staff context anchor the interface, not a consumer SaaS clone |
| R-21, R-29, R-31 | Existing light navy/teal system retained; status colors semantic; visual reasons documented above |

## Outstanding acceptance

See `docs/mvp-setup.md` for migration/email configuration and the three-role/two-school manual checklist. Live email delivery, active-profile/session revocation, PostgREST relationship queries, multi-connection concurrency, production-scale aggregation, and every authenticated screen's keyboard/mobile behavior have not been certified by these local tests.
