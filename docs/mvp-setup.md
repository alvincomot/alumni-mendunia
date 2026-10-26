# MVP setup and operational notes

This guide describes the current implementation, not a replacement SRS. No SRS, diagrams, or ERD documents were present in `docs/` when this task started. Business rules were taken from the master task, AGENTS.md, and the existing migration. Use fictional prototype data only.

## Environment

Keep credentials in local environment files or deployment secret storage, never Git.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public/anonymous client key; RLS remains enforced |
| `SUPABASE_SECRET_KEY` | Server-only Supabase administrative API key |
| `APP_SITE_URL` | Trusted application origin, HTTPS outside localhost |

The admin client is isolated in `lib/users/admin.ts` with `server-only`. It disables persistence, token auto-refresh and URL session detection. Callers first verify claims and the current active `admin_dinas` database profile. Only `SUPABASE_SECRET_KEY` is accepted for administration; do not prefix it with `NEXT_PUBLIC_`. Restart the local server or redeploy after changing environment variables.

Without an administrative key, the profile directory and profile edits remain available to administrators. Email lookup and invitations are unavailable and show a configuration notice. An invalid/missing `APP_SITE_URL` disables new invitations but does not prevent email lookup or explicit orphan-profile recovery. The origin must have no path, query, fragment or credentials; only localhost permits HTTP. No key values are returned to the browser. Directory availability does not verify SMTP delivery.

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

These SQL files were tested in isolated in-memory PostgreSQL, not applied to the connected Supabase database. The application deliberately does not fall back to the unsafe old registration RPC if the new one is missing. Status transitions and read-only screens continue using existing RPCs/tables.

Coordinate frontend deployment with the first migration: older frontend versions call the now-restricted RPC. Roll forward with the matching frontend; do not restore the unsafe execute grants as an automatic rollback.

## Authentication email configuration

1. Set Supabase Auth Site URL to the same trusted origin as `APP_SITE_URL`.
2. Allow the application's `/auth/confirm` and `/auth/callback` redirect URLs for each intended environment. Avoid broad production wildcards.
3. Configure SMTP/sender and delivery limits for the test environment. Use mailboxes controlled by the reviewer, with fictional profile names.
4. Configure the **Invite user** email link for server-side verification:

   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Atur kata sandi akun</a>
   ```

5. Configure the **Reset password** email link similarly:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Pulihkan kata sandi</a>
   ```

The confirmation route verifies the token, writes SSR cookies, and sends invitation/recovery sessions to `/auth/update-password`. It ignores arbitrary `next` URLs. `/auth/callback` also supports recovery flows that return a PKCE authorization code. Do not rely on an implicit hash-fragment invitation template: the server-side password page cannot read URL fragments. This follows Supabase's [server-side email-template guidance](https://supabase.com/docs/guides/auth/auth-email-templates).

The invitation API supplies `APP_SITE_URL + /auth/confirm` as `redirectTo`; the invite template above uses that exact allowlisted URL. Do not add `/auth/confirm` again to `RedirectTo`. An invitation created directly in the Supabase console may have a different redirect value; test console-sent invitations separately.

Email errors are mapped to safe Indonesian diagnostics for missing/invalid credentials, unauthorized recipients, disabled email providers, duplicate accounts and rate limits. Unknown failures advise checking Auth and SMTP logs without reflecting raw provider errors or claiming SMTP is definitely the cause. Supabase's [default SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp) can restrict recipients; use a configured SMTP service for intended recipients. The [Auth error-code reference](https://supabase.com/docs/guides/auth/debugging/error-codes) explains these codes. Do not bypass limits with auto-confirmation, generated passwords or public signup.

Disable public self-signup in Supabase Auth settings as an operational safeguard. The UI has no signup links and both signup routes redirect to login. Account access always requires an active database profile; staff additionally require an assigned active school.

Bootstrap the first fictional administrator using the Supabase administration console and an explicitly approved profile insertion. The application does not provide a bootstrap endpoint or embedded administrator credentials.

## Invitation recovery

Auth account invitation and profile insertion span different services and cannot be one PostgreSQL transaction:

- Existing email with an existing profile: rejected; edit that profile instead.
- Existing Auth account without profile: rejected by default; an administrator must explicitly select **Pulihkan profil** with the same email. This separate button remains available without an invitation redirect URL when orphan accounts exist.
- New invitation succeeds but profile insertion fails: leave the Auth account intact, show recovery instructions, and do not send an automatic repeat invitation or delete the account.
- Recovery uses the existing Auth ID and profile `INSERT`, never `upsert`. A duplicate/concurrent request cannot overwrite the winner's profile assignment.
- An expired/unusable invitation requires operator email recovery/resend through the configured Auth service. The UI does not manufacture passwords or silently resend invitations.
- An invitation request accepted by Auth is not proof of delivery. Transport failures can leave an account without a profile; reload the directory and inspect Auth logs before retrying. Even thrown profile-write errors retain recovery instructions. The application does not promise exactly-once email delivery across concurrent requests to the external Auth API.

Profiles are changed through the administrator's ordinary SSR client, not through the service key. Consequently the existing audit trigger records the authenticated actor. The admin key is only used for the Auth directory and invitations.

## Monitoring/reporting semantics and limits

- One row per authorized alumnus. Only `is_current = true` placements contribute country, sector, and status. Alumni without a placement remain visible and count under **Belum ada penempatan**.
- Completed and canceled placements remain current until replaced. Historical details/status histories remain available on the alumni detail page.
- Server-side filters are shared by alumni lists, dashboards, and CSV export. Staff scope is taken from their verified profile, never the submitted school filter. Dinas access stays read-only for alumni/placements.
- School totals on the dashboard are organization-wide and explicitly labeled as independent of alumni filters. Recent activity shows the eight latest history entries on current placements in the selected scope.
- The MVP fetches authorized alumni in bounded batches before filtering/aggregating in the server. It detects row-limit truncation, changed counts, and duplicate IDs instead of reporting a partial total. Maximum supported scope is 50,000 alumni; Auth directory limit is 10,000 accounts. Larger scopes fail safely, not silently truncate.
- This is not a transactionally consistent multi-query snapshot under concurrent writes. Counts can change between viewing and exporting. Before scaling beyond the prototype, move filtering/aggregation to reviewed database functions and add load testing. No claim of production-scale performance is made.
- CSV contains all filtered records, UTF-8 BOM, Indonesian headers, quoted cells, and formula-prefix neutralization. Export authenticates independently and uses private/no-store headers.

## Audit coverage

Existing triggers record inserts/updates/deletes for schools, profiles, alumni, and placements. The UI exposes no delete controls. Status history is immutable through the application and database privileges.

Auth account creation, invitation email delivery, password resets, and login/logout are not entries in `public.audit_logs`; inspect Supabase Auth logs for those events. The existing audit schema does not retain old/new field snapshots. The UI states this limitation rather than implying full security-event coverage. No unapproved audit schema expansion was performed.

## Local verification commands

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
node --test tests/alumni.test.mjs tests/schools.test.mjs tests/placement-status.test.mjs tests/mvp.test.mjs tests/users-admin.test.mjs
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
3. Admin: invite a new account, accept email in a clean browser, set a password, and confirm assigned role/school. Check profile-only editing without an admin secret. Simulate invitation/profile partial failure in a test project, recover explicitly, and verify duplicate requests do not overwrite profiles.
4. Petugas A: register an alumnus, edit identity, register initial placement. School ID must be inferred. Petugas B must neither read detail nor mutate A's records. Both Dinas roles can read without mutation controls.
5. Exercise departure, completion, and cancellation with/without optional dates and notes. Reject invalid transitions, future actual/end dates, and stale status submissions. Check WIB actor/time/history.
6. From completed/canceled placement, register a successor. Confirm the old placement/history remains, exactly one placement is current, and two simultaneous tabs cannot both register against the same predecessor. Also test two simultaneous initial registrations. This multi-connection test remains necessary after migration deployment.
7. Compare dashboard/report/list totals for school/year/country/status/sector filters. Include alumni without placements, terminal-current placements, and multiple historical placements. Verify zero results and stable sorting/pagination.
8. Viewer/Admin export filtered CSV. Check Indonesian characters, multiline values, and fictional formula-like names such as `=1+1` are text in the intended spreadsheet application. Staff and unauthenticated direct export requests must be denied.
9. Admin audit: confirm actor, action, entity ID, WIB boundaries, filters, and pagination after school/profile changes. Viewer/staff cannot open the audit page or read audit rows.
10. Exercise all screens on desktop and phone, keyboard navigation, dialogs, pending/error/retry/empty states. Browser fixture results are not a substitute for these authenticated live flows.

Do not commit, push, apply migrations, or modify hosted Auth settings without the project owner's approval.
