# School self-service activation

This is the current School authentication specification. It supersedes the
Admin-only onboarding notes in earlier verification reports. School provisioning
and temporary-password reissuance have been removed from the application.
School management now shows read-only account details and separate school/profile
status controls. Legacy password gates and explicit orphan-profile recovery remain
available. Use fictional test data.

## Flow and public information

1. Enter an eight-digit NPSN as a string, then select **Lanjutkan**.
2. The server returns only school name, NPSN, lifecycle status, and resend delay.
   School name and NPSN remain visible for every state. **Ubah NPSN** clears the
   email/password fields and returns focus to NPSN.
3. UNCLAIMED schools supply an email. PENDING_ACTIVATION schools see completion
   and resend instructions. ACTIVE schools enter their existing password.
   SUSPENDED schools see an access-disabled message.
4. Activation first creates a short-lived, service-only database operation.
   Supabase `inviteUserByEmail` then requests the native one-time invitation
   through configured Custom SMTP. Only after Auth accepts that request does the
   server bind the Auth ID, start the database expiry and mail cooldown, and
   audit the request. A provider error cancels the operation. No temporary
   password or custom email token is made.
5. `/auth/confirm` verifies the invitation token and Auth user. The password page
   derives pending school context from the verified session and database mapping.
   After an eight-character-or-longer password and matching confirmation are
   accepted by Auth, the service-only completion RPC atomically creates the profile
   and marks the school ACTIVE. It preserves a matching existing profile.
6. School recovery accepts only NPSN. The server resolves the ACTIVE account's
   verified email and calls `resetPasswordForEmail`. Dinas recovery is unchanged.

Email ownership is established by Supabase. The MVP intentionally allows a
person knowing a valid unclaimed NPSN to choose an email and activate by proving
ownership of that email. This does not independently prove institutional authority.
There is no approval queue, document verification, or active-school email-change UI.

## Retry and access rules

The cooldown-loop regression was caused by two incompatible timers. Activation
previously reused the recovery limiter, which allowed three attempts in a fixed
15-minute window, while every application, database or Auth rate-limit error was
reported as a new 60-second wait. The form then replaced its timer with that
hard-coded value after every rejection. Once the application window was full,
the visible minute expired long before the server window, producing the loop.
The activation-specific limiter and authoritative retry contract below replace
that behavior; the recovery flow itself is unchanged.

A later shared-cooldown regression came from using `activation:<client IP>` as
the only application key and merging its remaining 15-minute window directly
into each lookup's `school.retry_after`. Different NPSNs on the same network
therefore displayed the same client-wide protection as if each school had sent
an email. The scopes are now separate: the persistent ordinary cooldown belongs
to the activation operation for one normalized NPSN, while the IP limit remains
a separately labelled abuse-control ceiling.

- An unconfirmed invitation can be invited again. A verified but unfinished
  invitation resumes with a native recovery email using the same stored Auth ID.
- The pending database deadline uses the same number of seconds as Supabase
  Auth's **Email OTP Expiration**. The server-only
  `SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS` value is required and must be
  configured to the same Dashboard value. Missing or invalid configuration
  fails before a database reservation is created. The deadline begins only
  after Auth accepts the invitation or recovery request. A resend renews the
  request and deadline. An expired reservation without an existing profile
  becomes eligible for a new activation request, including correcting the
  email. Existing Auth users are retained, and superseded requests cannot
  finalize a claim.
- Legacy pending rows have a deadline based on their existing updated time until
  the first native request establishes a request ID. No bulk state rewrite occurs.
  An expired pending account with an existing profile can renew its request at
  the same stored email; its profile and Auth identity cannot be substituted.
- The server is authoritative for resend timing. `school_auth_lookup` returns the
  database's ceiling-rounded `retry_after` from `last_sent_at` and any active
  five-minute reservation. The RPC resolves the string NPSN to one school row,
  locks it and checks that row's `last_sent_at`; leading zeroes are preserved.
  A request for another NPSN uses another row and remains eligible. The browser
  maintains separate school and client deadlines from the returned relative
  seconds, including after refresh or a return to the form.
- The application limiter is a separate IP-level safeguard under the explicit
  `activation:ip:<client IP>` key. It permits three concurrent operations from a
  client, counts only provider-accepted delivery initiations toward its
  three-delivery, 15-minute window, and has a separate bounded failure budget.
  Reaching this limit produces a network-wide message and never changes the
  school countdown. Configuration failure occurs before a reservation. Database
  rejection releases the application reservation. Database locking remains the
  persistent cross-tab and cross-instance authority per school. Production
  infrastructure should still provide shared IP limits and overwrite untrusted
  forwarding headers.
- Database cooldown, application rate limit, Supabase Auth rate limit, provider
  failure, invalid account state and configuration failure have distinct safe
  result codes. Supabase Auth rate-limit errors exposed by the JavaScript client
  do not include a reliable per-request remaining duration, so the application
  does not invent one. The provider continues to enforce its limit, while the
  local failure budget prevents a tight retry loop. See the official
  [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
  and [production rate-limit guidance](https://supabase.com/docs/guides/deployment/going-into-prod).
- Pending profiles cannot read or write operational data, even if a profile
  already exists. RLS requires ACTIVE lifecycle, matching active profile and
  school, plus `must_change_password=false`. Dinas permissions remain unchanged.
- First-login password replacement for Admin-provisioned accounts continues to
  use the existing server-managed flag and temporary-password digest.
- Auth and database changes are separate transactions. A rejected provider
  request cancels the fresh reservation immediately; if cancellation itself is
  interrupted, the operation self-heals after five minutes and does not expose
  operational data. A failed binding never deletes an Auth user and can be
  retried against the same email/Auth identity. If Auth saved the password but
  database completion failed, resubmitting the same password is accepted only
  for the verified pending activation so completion can be retried safely.
- `activation_request_id` is a database correlation ID, not an authentication
  token. It is never sufficient to verify email or clear the claim through an
  anonymous/authenticated RPC. Only the server can call completion, after Auth
  accepts the password update for the verified session user.
- Audit rows record school request/completion and profile operations without
  emails, passwords or tokens. Public requests have a null actor; completion
  attributes the operation to the verified Auth user. Auth logs cover password
  and email operations. Email acceptance is not proof of SMTP delivery.

## Migration plan and hosted observations

Read-only inspection on 2026-10-29 verified that the linked hosted migration
history already includes `20261028000200`. The hosted functions and lifecycle
columns match `20261028000200_native_school_self_activation.sql`; the version is
therefore treated as applied and is not edited. No credentials or user email
values were inspected for this audit.

`20261029000100_harden_school_activation_completion.sql` is the pending additive
hardening migration. It stores a request-scoped fingerprint of the current Auth
password hash when an invitation is bound. Completion requires the verified
user's Auth password hash to differ from that baseline. The fingerprint is
cleared after activation and contains neither the password nor the Auth hash.
Existing in-flight pending activations are backfilled with a baseline so their
next successful password change remains usable. Existing ACTIVE accounts, Auth
IDs, profiles, schools, alumni, placements, histories and legacy reconciliation
metadata are retained.

Safe release procedure, performed by an authorized operator:

1. Take an approved database backup. Recheck `supabase migration list --linked`
   and confirm version `20261028000200` is applied and
   `20261029000100` is still unapplied. If the history differs, stop and resolve
   the environment mismatch before deployment.
2. Review the additive hardening SQL and run the isolated SQL tests below. Confirm the
   live schema still matches prerequisites, especially private table/trigger
   definitions and profile administration guards. Resolve schema drift before
   application, rather than using CASCADE or editing prior migration history.
3. Configure the email requirements below, including equal Dashboard and server
   token-expiry values. Deploy the database migration first. Its service-only
   two-argument binding wrapper keeps the immediately preceding application
   release compatible during rollout.
4. Deploy the matching application immediately after the migration. The new
   application fails closed if the three-argument operation-fenced RPC is
   missing. Do not leave mixed versions running longer than the rollout.
5. Run the read-only checks and live fictional-account acceptance below. This
   implementation does not run hosted SQL, migration repair, or Auth changes.

Read-only database checks after application:

```sql
select version from supabase_migrations.schema_migrations order by version;
select status, count(*) from app_private.school_auth_accounts group by status;
select column_name, data_type from information_schema.columns
where table_schema='app_private' and table_name='school_auth_accounts';
select n.nspname, p.proname, p.prosecdef, p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('school_auth_lookup','school_activation_request',
 'school_activation_bind','school_activation_cancel','school_activation_context','complete_school_activation',
 'school_recovery_request','can_read_school','can_write_school','current_school_id');
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='app_private' and p.proname in
 ('can_read_school','can_write_school','current_school_id');
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname='public' order by tablename, policyname;
select school_id,count(*) from public.profiles
where role='petugas_sekolah' and is_active group by school_id having count(*)>1;
```

## Supabase and SMTP configuration

- Set server-only `SUPABASE_SECRET_KEY` and a valid HTTPS `APP_SITE_URL`.
  Keep the existing publishable key and SSR cookie integration.
- Set `SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS` to the exact Supabase Auth
  **Email OTP Expiration** in seconds. The application has no production
  fallback. If Dashboard uses `3600`, set the environment value to `3600`.
- Disable **Allow new users to sign up** in Supabase Auth. Administrative
  invitations are the controlled creation path. Keep public signup routes
  redirected to login. Do not expose `app_private` as an API schema.
- Keep Brevo **Custom SMTP** in Supabase Auth, with verified sender and approved
  sending quotas. The application uses no Brevo REST API or `BREVO_API_KEY`.
  Legacy Brevo environment variables can be removed by the deployment operator.
- Allow exact application URLs `/auth/confirm` and `/auth/callback` and set Site
  URL to the deployment origin. Production never trusts a browser-provided host.
- Install `docs/email-templates/school-activation.html` as the Supabase **Invite
  user** template. It uses `.RedirectTo`, `.TokenHash`, `type=invite` and the CTA
  **Aktivasi Akun Sekolah**. Supabase uses one invite template project-wide;
  the template checks `.Data.school_activation` to retain Dinas invitation wording.
  This marker controls email copy only and is never used for authorization.
- The application now adds a signed `auth_context` query to `.RedirectTo`, so
  the template must append `token_hash` and `type` with `&`, as shown in the
  reference file. A hosted template that still uses `?token_hash=...` will
  produce a malformed redirect. Apply this template update manually in the
  Supabase Dashboard; the repository does not change hosted configuration.
- Keep the Reset password template's `.ConfirmationURL`; native PKCE recovery
  opens in the browser that requested it. Recovery for a verified but unfinished
  activation reaches **Buat Kata Sandi** based on trusted database context.
- Inspect Supabase Auth/Brevo logs for delivery failures, verify Inbox/Spam,
  sender authentication and token expiry. Never log full token URLs. Configure
  hosting access logs to redact query strings.

Official API references: [invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification

```powershell
node --test tests/*.test.mjs
# Use existing isolated PGlite installation, never a hosted connection.
$env:MVP_SQL_TEST_DEPS = '<temporary PGlite directory>'
node tests/database-smoke.mjs
$env:RECOVERY_UI_TEST_DEPS = '<temporary playwright/esbuild directory>'
node tests/password-recovery-browser.mjs
npm run lint
npx tsc --noEmit
npm run build
node tests/school-auth-production-smoke.mjs
```

Database tests execute PostgreSQL RLS/privileges/triggers through PGlite with
fictional Auth records. Application tests mock Auth; browser fixtures mock server
actions. They do not prove live email delivery or Auth password invalidation.
Production route smoke tests submit only invalid/empty inputs and send no email.

Live acceptance after explicit approval and setup: activate a fictional unclaimed
school, inspect actual invitation delivery, consume its link once, create a
password, log in again with NPSN, request NPSN recovery, reset the password and
verify old-password rejection. Test used/expired links, resend, duplicate claims,
partial failures, cross-school access, suspension and Dinas login/recovery.
No hosted Auth users or mailboxes were changed while implementing this task.

## Previous implementation report, before final hardening

Files changed for this task (other working-tree changes predate this task):

- `app/auth/login/school-actions.ts`
- `app/auth/login/page.tsx`
- `app/auth/update-password/actions.ts`
- `app/auth/update-password/page.tsx`
- `app/auth/error/page.tsx`
- `components/school-login-form.tsx`
- `components/login-form.tsx`
- `components/update-password-form.tsx`
- `lib/auth/school-auth.ts`
- `lib/auth/school-activation.ts`
- `lib/auth/school-login.ts`
- `lib/users/admin.ts` (authorization comment)
- `supabase/migrations/20261028000200_native_school_self_activation.sql`
  introduced the native flow and is now applied to the linked database.
- `supabase/migrations/20261029000100_harden_school_activation_completion.sql`
  is the pending additive password-change evidence hardening.
- `tests/school-activation.test.mjs`
- `tests/school-account-provisioning.test.mjs`
- `tests/login.test.mjs`
- `tests/database-smoke.mjs`
- `tests/password-recovery-browser.mjs`
- `tests/school-auth-production-smoke.mjs`
- `docs/email-templates/school-activation.html`
- `docs/password-recovery-email-setup.md`
- `docs/mvp-setup.md`
- `docs/school-self-activation.md`

Actual checks:

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | PASS, 134 tests |
| Isolated PostgreSQL/PGlite | PASS, 16 SQL/RLS scenario groups, duplicate preflight and migration dependency checks |
| Browser fixtures, 390 and 1440px | PASS, four status views, school identity, leading zeros, validation, activation/resend/cooldown, login/recovery, password creation, keyboard and overflow |
| Actual Next production routes | PASS, initial NPSN step, empty validation, keyboard mode switch, protected dashboard redirect; no live credentials submitted |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS, existing Next warning about `cacheComponents` without `partialPrefetching` remains |

SQL tests also compare all four legacy lifecycle states and legacy token rows
before/after migration, exercise fresh profile creation and existing-profile
preservation, reject obsolete request generations, and verify actor attribution.
They cover pending/temporary-password denial, cross-school isolation, inactive
accounts, Dinas permissions and historical provisioning/reissuance RPC safeguards
retained in applied migrations; those RPCs have no current application action.
They are not a multi-connection concurrency or hosted Supabase test.

Remaining release checks: apply the reviewed migration only with approval,
configure SMTP/templates/redirect allowlists, verify public Auth signup is
disabled, then perform live fictional-account acceptance. Supabase/Brevo delivery,
real token consumption/expiry, and old-password rejection are not established by
mocked Auth tests. Shared production IP throttling remains an infrastructure step.

Suggested commit: `feat: implement self-service school account activation`.
No files were staged, committed or pushed.

## Anti-Slop delivery gate

Scope: the School authentication changes; existing Stitch reference composition
is retained. Dials: ENERGY 2 / RHYTHM 2 / MOTION 1. School identity stays in one
neutral bordered block to prevent losing context between steps. Navy headings,
teal actions, Plus Jakarta Sans/Inter and existing spacing preserve the design
system. Auto margins keep longer forms scrollable without clipping their top.

Hard gate:

- R-02 PASS: new interface copy contains no em dashes.
- R-03 PASS: 390/1440px browser checks found no horizontal overflow; long school names wrap.
- R-17 PASS: no statistics or unsupported numbers were added to the interface.
- R-18 PASS: no testimonials or synthetic people were added.
- R-23 PASS: no new visual assets or navigation structures were introduced.
- R-24 PASS: auth links resolve to existing login/recovery routes.
- R-25 PASS: primary text on the identity block is 12.55:1; teal on the block 4.60:1; white/teal CTA 4.81:1; error red/white 8.31:1. Disabled controls retain the existing disabled styling.
- R-26 PASS: lookup, back, activation, resend, password toggle, login, recovery and password save have implemented handlers and browser coverage.
- R-27 PASS: validation, lookup-not-found, service error, pending, cooldown and success states are implemented and exercised.
- R-28 PASS: no FAQ was introduced.
- R-32 PASS: native controls, visible focus, keyboard lookup and mode switching were exercised; focus returns to NPSN and moves to the school heading.
- R-33 PASS: changes were made directly in source using patches.
- R-34 PASS: no theme toggle was introduced; the existing light interface remains.
- R-35 PASS: production build, actual route smoke checks and mocked workflow click-through ran.
- R-36 PASS: request acceptance wording does not claim delivery; live verification limits are recorded above.
- R-37 PASS: root DESIGN.md and existing Stitch login direction guided the changes.
- R-38 PASS: fictional school names appear only in marked test fixtures, not production content.

Purpose gate:

- R-01 PASS: no new gradient/glow; the existing reference hero was preserved.
- R-04 PASS: only the existing password visibility/loading controls are reused for their functions.
- R-06 PASS: heading/body typography follows DESIGN.md; no new typeface or decorative label style.
- R-07 PASS: no patterned background was introduced.
- R-08 PASS: no decorative action arrows were added.
- R-09 PASS: no marketing badges were added.
- R-10 PASS: no glass effects were added.
- R-12 PASS: existing button elevation is retained; the identity block uses a subtle border.
- R-13 PASS: no new glow effects were added.
- R-14 PASS: the single identity block groups the selected school, rather than forming a decorative card grid.
- R-19 PASS: no entrance/motion sequence; only existing pending indicators and hover/focus feedback.
- R-22 PASS: no illustrations were added.

Liveliness:

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 were declared for the existing institutional login.
- Consistency PASS: inherited typography and restrained palette are visible in the reviewed screenshots.
- Focal point PASS: the selected school precedes the status-specific primary action.
- Whitespace PASS: consistent field groups separate identity, input, feedback and actions.
- Accent PASS: teal identifies interactive actions; neutral surfaces carry school information.
- Identity PASS: existing navy/teal palette and heading/body type pairing remain.
- Design Read PASS: the existing School/Dinas authentication screen was the design direction before edits.

Craftsmanship and quality locks:

- C-1 PASS: the identity block, retained typography and spacing have purposes documented above.
- C-2 PASS: interactive controls have implemented behavior and fixture coverage.
- C-3 PASS: every added region serves lookup, school context, credentials or request feedback.
- C-4 PASS: long names, error/pending states, keyboard controls and two viewport widths were checked.
- C-5 PASS: no fabricated testimonial, statistic or delivery claim.
- R-05 PASS: the existing login layout remains; no generic marketing sections were added.
- R-11 PASS: existing rounded input/button surfaces remain; no pill-based redesign.
- R-15 PASS: labels specify Lanjutkan, Ubah NPSN, Masuk and activation/recovery actions.
- R-16 PASS: no marketing buzzwords in the added interface copy.
- R-20 PASS: NPSN, school identity and Indonesian School/Dinas roles determine the content.
- R-21 PASS: no theme changes.
- R-29 PASS: navy/teal plus neutral surfaces; red is reserved for errors.
- R-30 PASS: the user's existing Stitch design is preserved without introducing another product's design.
- R-31 PASS: major visual decisions and their purposes are recorded at the start of this gate.
