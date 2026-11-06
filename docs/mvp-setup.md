# MVP setup and operational notes

For the current password recovery flow, branded email reference, Brevo SMTP,
and redirect allowlist setup, see [Password recovery email setup](password-recovery-email-setup.md).

The standard School flow is self-service activation: NPSN lookup, school email,
native Supabase invitation, then password creation. Active schools continue to
use NPSN and password; recovery resolves their verified email server-side.
See [School self-service activation](school-self-activation.md) for the current
specification, additive hardening migration, and release checks. The School
management page provides read-only account details and separate school/account
status controls. Manual provisioning and temporary-password issuance are retired.

This guide describes the current implementation, not a replacement SRS. No SRS, diagrams, or ERD documents were present in `docs/` when this task started. Business rules were taken from the master task, AGENTS.md, and the existing migration. Use fictional prototype data only.

## Form sessions and post-save navigation

Successful Alumni creation returns to the alumni list, preserves applied list
filters, and shows one success toast with **Tambah Alumni Lagi**. A new form visit
starts at step 1 with clean entry state. Moving between steps preserves the
unfinished entry; validation/server errors preserve inputs. If identity creation
succeeds but placement fails, retry uses the returned identity ID.

Placement creation also returns to the list. Identity editing closes its editor
and refreshes the detail. Successful school/user/status dialogs close, refresh
affected data, and show one toast. Opening another record loads that record's
values. Leaving a form ends its temporary session, including routes retained by
React Activity; no persistent draft storage is implemented. Auth business rules
and server cooldowns remain authoritative. Applied list filters and pagination
stay in the URL; Reset clears both applied values and unapplied input drafts.

See [the form-state regression audit](form-state-navigation-audit.md) for the
reproduced cause, changed files, local Next navigation tests and verification limits.

## Environment

Keep credentials in local environment files or deployment secret storage, never Git.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public/anonymous client key; RLS remains enforced |
| `SUPABASE_SECRET_KEY` | Server-only Supabase administrative API key |
| `APP_SITE_URL` | Trusted application origin, HTTPS outside localhost |
| `SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS` | Required School activation expiry in seconds, matching Supabase Auth Email OTP Expiration |

The admin client is isolated in `lib/users/admin.ts` with `server-only`. It disables persistence, token auto-refresh and URL session detection. Administrative callers verify claims and the current active `admin_dinas` profile. Public School actions use narrowly scoped service-only lifecycle RPCs with validation and rate limits; completion derives its target from the verified session. Only `SUPABASE_SECRET_KEY` is accepted; do not prefix it with `NEXT_PUBLIC_`. Restart the local server or redeploy after changing environment variables.

Without an administrative key, the profile directory and profile edits remain available to administrators. Email lookup and invitations are unavailable and show a configuration notice. An invalid/missing `APP_SITE_URL` disables new invitations but does not prevent email lookup or explicit orphan-profile recovery. The origin must have no path, query, fragment or credentials; only localhost permits HTTP. No key values are returned to the browser. Directory availability does not verify SMTP delivery.

School login also requires `SUPABASE_SECRET_KEY` for a server-only NPSN lookup. An active school must have exactly one active `petugas_sekolah` profile; zero or multiple eligible profiles fail with the same generic login error because NPSN alone cannot select an account safely. The Auth email is resolved by user ID and is never returned to the browser. After password authentication, the ordinary SSR client verifies the claims, active profile, role, school assignment, active school and submitted NPSN again through existing RLS-aware reads.

Login attempts are bounded per client address within each application instance and remain subject to Supabase Auth rate limits. A horizontally scaled production deployment should also configure shared platform or edge rate limiting; the in-process guard is intentionally a bounded prototype safeguard, not a distributed abuse-prevention service.

## Database deployment requires explicit approval

Do not reapply or edit the existing `20261021000100_initial_schema.sql` on a populated database. Review and apply these additive migrations in order using an approved migration workflow:

1. `20261023000100_guard_placement_registration.sql`
   - Adds public/private `create_placement_guarded` wrappers with an expected current placement ID.
   - Locks the authorized alumni row and current placement, compares the snapshot, requires a terminal predecessor, then delegates to the existing creation function.
   - The old public and private creation entry points lose authenticated execute permission to prevent bypassing the new guard.
   - Initial registration uses an explicit `NULL` expected ID. A successor uses the terminal placement ID. A repeated request cannot silently replace the newly created placement, even when that new placement is already terminal.
   - Existing triggers preserve atomic status history and audit entries. No historical placement is deleted and no existing data is rewritten.
2. `20261023000200_guard_profile_administration.sql`
   - Adds a profile trigger to reject own administrative deactivation/demotion and staff assignments to inactive schools.
   - Serializes authenticated profile administration with a transaction advisory lock and rechecks the administrator.
   - Existing profile audit trigger and RLS policies remain intact. Privileged manual bootstrap still works when `auth.uid()` is null.
3. `20261023000300_guard_last_active_admin.sql`
   - Acquires the administration lock before profile statement row locks, and rejects removal of the last active Admin Dinas through updates/deletes, including privileged manual SQL.
   - Locks remaining active administrators when reducing their number. Batch changes that would remove all administrators roll back. The existing stronger restriction against changing one's own administrative access remains.
   - Adds triggers/functions only; no RLS or table grants change. Review all migrations before deployment. Concurrent transactions may be rejected and must be retried after reloading.
4. `20261026000100_secure_school_account_provisioning.sql`
   - Stops before making changes if one school already has more than one active `petugas_sekolah` profile. The exception detail reports affected `school_id` values and counts; the migration never chooses an account to disable or delete.
   - Adds `profiles.must_change_password`, a partial unique index for one active School Staff profile per school, and an Admin Dinas-only provisioning RPC.
   - Adds a service-only completion RPC used after the authenticated user successfully changes the temporary Auth password. Direct authenticated calls cannot clear the flag.
   - Keeps profile creation and password-gate changes in the existing profile audit trail. The Auth account operation remains visible in Supabase Auth logs.
   - Does not change alumni, placement, status-history, or existing school-based RLS rules. The application no longer exposes direct provisioning; this migration and its password gates remain compatibility history.

Versions through `20261028000100_school_account_lifecycle.sql` were confirmed
applied during the read-only inspection on 2026-10-29. The pending version
`20261028000200_native_school_self_activation.sql` replaces the unapplied
Admin-only cleanup proposal. Review the linked activation release procedure;
do not reapply earlier versions or run the old cleanup file.

The application deliberately does not fall back to unsafe database operations
when a required migration is missing. Status transitions and read-only screens
continue using existing RPCs/tables.

Subsequent additive migrations are `20261027000100_school_password_reissuance.sql`
(Admin credential reissuance), `20261028000100_school_account_lifecycle.sql`
(existing School lifecycle), and the pending native activation migration above.
The latter replaces custom-token RPCs with native Auth activation, retains
lifecycle triggers and legacy rows, and requires completed activation and
password replacement in operational RLS. Existing Auth IDs remain unchanged.

Coordinate frontend deployment with the first migration: older frontend versions call the now-restricted RPC. Roll forward with the matching frontend; do not restore the unsafe execute grants as an automatic rollback.

## Authentication email configuration

1. Set Supabase Auth Site URL to the same trusted origin as `APP_SITE_URL`.
2. Set the server-only `SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS` to the same
   number of seconds as Supabase Auth **Email OTP Expiration**. The reviewed
   default is `3600`; mismatched values can make the database and Auth disagree
   about whether an activation is still valid.
3. Allow the application's `/auth/confirm` and `/auth/callback` redirect URLs for each intended environment. Avoid broad production wildcards.
4. Configure SMTP/sender and delivery limits for the test environment. Use mailboxes controlled by the reviewer, with fictional profile names.
5. Use the [Invite user template](email-templates/school-activation.html), which
   keeps separate School activation and Dinas invitation wording.
6. Use the [Reset password template](email-templates/reset-password.html) and
   its native `{{ .ConfirmationURL }}`. Token-hash recovery through `/auth/confirm`
   remains supported for existing templates; do not create custom tokens.

The confirmation route verifies the token, writes SSR cookies, and sends invitation/recovery sessions to `/auth/update-password`. It ignores arbitrary `next` URLs. `/auth/callback` also supports recovery flows that return a PKCE authorization code. Do not rely on an implicit hash-fragment invitation template: the server-side password page cannot read URL fragments. This follows Supabase's [server-side email-template guidance](https://supabase.com/docs/guides/auth/auth-email-templates).

The invitation API supplies `APP_SITE_URL + /auth/confirm` plus a server-signed
`auth_context` query as `redirectTo`; the invite template above appends
`&token_hash=...&type=invite` to that URL. Do not add `/auth/confirm` again to
`RedirectTo`. An invitation created directly in the Supabase console may have a
different redirect value and no trusted application context; test console-sent
invitations separately.

Email errors for Dinas recovery and account invitations are mapped to safe
Indonesian diagnostics without reflecting raw provider errors or claiming SMTP
delivery. Supabase's [default SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp)
can restrict recipients; use configured Custom SMTP for intended recipients.
School accounts use self-activation and native email recovery. Existing accounts
with a mandatory password-change flag must still finish that step.

Disable public self-signup in Supabase Auth settings as an operational safeguard. The UI has no signup links and both signup routes redirect to login. Account access always requires an active database profile; staff additionally require an assigned active school.

## School account administration

Each School table row has **Edit** and a contextual menu. **Detail akun** reads
the existing service-only `school_auth_lookup` RPC for the lifecycle and displays
the linked staff profile, school identity/status and registered Auth email.
The labels are **Belum Aktivasi**, **Menunggu Aktivasi**, **Aktif**, and
**Ditangguhkan**. Read failures show an unavailable state, never an inferred
activation status. Viewer Dinas sees school data without administrative controls
or privileged account reads.

Only an active Admin Dinas can read account details. Email is fetched by the
user ID from the authorized school's staff profile; no client-supplied email,
role or account ID determines the read. Pending activation without a profile
has no safely accessible email in the current read-only RPC contract, so the
dialog explains that email becomes available after profile creation. It does
not query the private schema, enumerate Auth metadata, or invoke recovery to
discover an email. No new migration is introduced by this cleanup.

**Nonaktifkan sekolah** changes school availability. **Tangguhkan akun** changes
the linked profile's active flag. Each has its own confirmation. Reactivating a
school does not reactivate a suspended profile; account reactivation requires
an active school and does not bypass activation/password gates. Ambiguous
multiple profiles are reviewed in Manajemen Pengguna. No accounts are deleted.

Manual School provisioning, temporary credential handoff and password reissuance
have no application UI or server action. Applied migrations, private lifecycle
rows, Auth identities, legacy password digests and mandatory password replacement
remain intact. Use native School recovery for passwords. A legacy Auth account
without a profile can still be reviewed via explicit **Pulihkan profil**.

Bootstrap the first fictional administrator using the Supabase administration console and an explicitly approved profile insertion. The application does not provide a bootstrap endpoint or embedded administrator credentials.

## Invitation recovery

New invitations are limited to Admin Dinas and Viewer Dinas, enforced by the
server schema as well as the UI. School staff use self-activation. Existing
profile administration and explicit orphan recovery remain available to the
authorized administrator. The invitation dialog no longer duplicates the
separate recovery control.

Auth account invitation and profile insertion span different services and cannot be one PostgreSQL transaction:

- Existing email with an existing profile: rejected; edit that profile instead.
- Existing Auth account without profile: rejected by default; an administrator must explicitly select **Pulihkan profil** with the same email. This separate button remains available without an invitation redirect URL when orphan accounts exist.
- New invitation succeeds but profile insertion fails: leave the Auth account intact, show recovery instructions, and do not send an automatic repeat invitation or delete the account.
- Recovery uses the existing Auth ID and profile `INSERT`, never `upsert`. A duplicate/concurrent request cannot overwrite the winner's profile assignment.
- An expired/unusable invitation requires operator email recovery/resend through the configured Auth service. The UI does not manufacture passwords or silently resend invitations.
- An invitation request accepted by Auth is not proof of delivery. Transport failures can leave an account without a profile; reload the directory and inspect Auth logs before retrying. Even thrown profile-write errors retain recovery instructions. The application does not promise exactly-once email delivery across concurrent requests to the external Auth API.

Profiles are changed through the administrator's ordinary SSR client, not through the service key. Consequently the existing audit trigger records the authenticated actor. For user management, the admin key is used for the Auth directory and invitations; School detail reads additionally use the lifecycle lookup and linked Auth user read.

## Monitoring/reporting semantics and limits

- One row per authorized alumnus. Only `is_current = true` placements contribute country, sector, and status. Dashboard, report summaries, and the **Belum ada penempatan** filter combine explicit `false`, missing current rows, and legacy `NULL` state into one operational queue. The database retains `NULL`, and detailed records/exports may still expose that historical uncertainty rather than rewriting it.
- Completed and canceled placements remain current until replaced. Historical details/status histories remain available on the alumni detail page.
- Server-side filters are shared by alumni lists, dashboards, and CSV export. Staff scope is taken from their verified profile, never the submitted school filter. Dinas access stays read-only for alumni/placements.
- School totals on the dashboard are organization-wide and explicitly labeled as independent of alumni filters. Recent activity shows the eight latest history entries on current placements in the selected scope.
- The MVP fetches authorized alumni in bounded batches before filtering/aggregating in the server. It detects row-limit truncation, changed counts, and duplicate IDs instead of reporting a partial total. Maximum supported scope is 50,000 alumni; Auth directory limit is 10,000 accounts. Larger scopes fail safely, not silently truncate.
- This is not a transactionally consistent multi-query snapshot under concurrent writes. Counts can change between viewing and exporting. Before scaling beyond the prototype, move filtering/aggregation to reviewed database functions and add load testing. No claim of production-scale performance is made.
- CSV contains all filtered records, UTF-8 BOM, Indonesian headers, quoted cells, and formula-prefix neutralization. Export authenticates independently and uses private/no-store headers.

## Audit coverage

Existing triggers record inserts/updates/deletes for schools, profiles, alumni, and placements. The UI exposes no delete controls. Status history is immutable through the application and database privileges.

Auth account creation, invitation email delivery, password resets, and login/logout are not entries in `public.audit_logs`; inspect Supabase Auth logs for those events. Profile creation and clearing the first-login flag are recorded by the existing profile trigger, including the authenticated Admin Dinas or School Staff actor. The existing audit schema does not retain old/new field snapshots. The UI states this limitation rather than implying full security-event coverage.

School profile creation, activation/deactivation, and password-gate changes use
the existing profile audit path. Auth password changes remain visible in
Supabase Auth logs rather than `public.audit_logs`.

## Local verification commands

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
node --test tests/*.test.mjs
```

Optional isolated SQL/RLS verification (no connection string or remote access is used):

```powershell
$sqlTestDirectory = Join-Path $env:TEMP ('alumni-sql-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sqlTestDirectory
npm.cmd install --prefix $sqlTestDirectory @electric-sql/pglite
$env:MVP_SQL_TEST_DEPS = $sqlTestDirectory
node tests/database-smoke.mjs
```

The SQL harness supplies a fictional `auth.users`/`auth.uid()` shim and omits only the `CREATE EXTENSION pgcrypto` declaration because PGlite uses PostgreSQL's built-in UUID generator. It exercises real SQL functions, triggers, privileges, and RLS, but not Supabase Auth/PostgREST or multiple concurrent database connections.

## Manual acceptance: three roles and two schools

Create controlled test accounts for Admin Dinas, Viewer Dinas, and staff assigned separately to two fictional schools. Do not send passwords in chat.

1. Login/logout with all three roles; unauthenticated URLs redirect to login. Inactive/missing profiles reach an access-denied page without redirect loops. Deactivate a profile/school after login and confirm the next read/write is refused.
2. Admin: create schools with an eight-digit NPSN including leading zeros; reject duplicates; edit and toggle status. Viewer/staff cannot mutate schools even via direct action calls.
3. Admin: create a direct School account with a verified fictional email, record the one-time credentials, and confirm that a second active account for the same school is rejected. Sign in with NPSN, confirm direct dashboard access is blocked, replace the temporary password, then confirm the dashboard opens. Simulate Auth/profile partial failure and concurrent requests in a test project; verify retries preserve Auth IDs and never delete orphan accounts. Separately verify the existing invitation and explicit profile-recovery flows remain functional.
4. Petugas A: register an alumnus, edit identity, register initial placement. School ID must be inferred. Petugas B must neither read detail nor mutate A's records. Both Dinas roles can read without mutation controls.
5. Exercise departure, completion, and cancellation with/without optional dates and notes. Reject invalid transitions, future actual/end dates, and stale status submissions. Check WIB actor/time/history.
6. From completed/canceled placement, register a successor. Confirm the old placement/history remains, exactly one placement is current, and two simultaneous tabs cannot both register against the same predecessor. Also test two simultaneous initial registrations. This multi-connection test remains necessary after migration deployment.
7. Compare dashboard/report/list totals for school/year/country/status/sector filters. Include alumni without placements, terminal-current placements, and multiple historical placements. Verify zero results and stable sorting/pagination.
8. Viewer/Admin export filtered CSV. Check Indonesian characters, multiline values, and fictional formula-like names such as `=1+1` are text in the intended spreadsheet application. Staff and unauthenticated direct export requests must be denied.
9. Admin audit: confirm actor, action, entity ID, WIB boundaries, filters, and pagination after school/profile changes. Viewer/staff cannot open the audit page or read audit rows.
10. Exercise all screens on desktop and phone, keyboard navigation, dialogs, pending/error/retry/empty states. Browser fixture results are not a substitute for these authenticated live flows.

Do not commit, push, apply migrations, or modify hosted Auth settings without the project owner's approval.
