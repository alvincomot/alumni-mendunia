# Password recovery and branded Auth email

Status: application implementation and email reference only. This document
does not configure hosted Supabase, Brevo, DNS, or email templates automatically.

## Application flows

- Dinas: Login > Dinas > Lupa kata sandi > `/auth/forgot-password`.
  The server validates email and calls `resetPasswordForEmail` using the
  existing anonymous/publishable Supabase SSR client. No directory lookup or
  privileged account lookup occurs.
- School: enter NPSN, select **Lanjutkan**, then **Lupa kata sandi?** for an active
  school. The server resolves the stored verified email and requests native Auth
  recovery. It never returns the email or accepts a substitute recovery address.
  Initial activation and its template are documented in
  [School self-service activation](school-self-activation.md).
- For email recovery, Supabase generates the token and `{{ .ConfirmationURL }}`. The PKCE verifier
  is stored by `@supabase/ssr` in cookies when the server sends the request.
  Open the email link in the same browser that requested it. Supabase verifies
  the token, then redirects to `/auth/callback?code=...`. The route exchanges
  the code and verifies the resulting user with Auth before redirecting to
  `/auth/update-password`.
- `/auth/confirm` retains support for existing token-hash invitation/recovery
  templates. It calls `verifyOtp`, verifies the resulting user, and accepts
  only existing allowed OTP types and fixed local destinations.
- Every application-issued activation, invitation, and recovery redirect carries
  an `auth_context` value signed on the server with `SUPABASE_SECRET_KEY`.
  `/auth/confirm`, `/auth/callback`, and `/auth/error` use only a valid signature
  to select School/Dinas error copy and recovery navigation. The value is UI
  context, never authorization; profile, account-state, and RLS checks remain
  authoritative. Legacy links without this context continue to verify normally,
  while their failures use the neutral error page.
- An implicit-flow `#access_token` cannot be read by a server route. Missing
  server credentials with a valid context are reported as an unsupported
  redirect format, not automatically as an expired link. Error redirects set a
  harmless fragment to prevent browser fragment inheritance, and the error page
  removes any fragment from browser history without logging or displaying it.
- The update page and action require verified claims, a verified Auth user,
  and an active application profile or a trusted pending activation context.
  Pending activation creates the profile only after the Auth password update.
  The database profile's
  `must_change_password` flag selects the mandatory first-login flow.
  No query parameter selects or bypasses that flow.
- Mandatory first login: update the password, verify the user again, complete
  the existing server-managed flag lifecycle, then continue to `/dashboard`.
  The discreet `Gunakan akun lain` control signs out locally and never clears
  the flag.
- Dinas email recovery, invitation setup, or an ordinary password update with no
  mandatory flag: update the password, verify the user again, sign out the
  local session, then return to `/auth/login`. Roles, NPSN mapping, and RLS
  are checked again on the next login. This deliberately gives invitation
  setup and recovery the same post-save behavior.
- Application validation accepts 8 to 128 characters with matching
  confirmation, without character-composition requirements. New temporary
  provisioning passwords are no longer issued by the application; existing
  mandatory password-change gates and legacy digest checks remain active.

## Deployment origin and URLs

1. Set the server-only `APP_SITE_URL` environment variable to the approved
   deployment origin: HTTPS, no path, credentials, query, or fragment.
   Do not use `VERCEL_URL` or a browser-supplied host as a production fallback.
2. In Supabase Auth URL Configuration, set **Site URL** to the approved origin.
3. Add the exact `<APP_SITE_URL>/auth/callback` to Redirect URLs for recovery.
   Keep the existing `<APP_SITE_URL>/auth/confirm` configuration for invitations.
   `/auth/update-password` is a fixed internal redirect, not a caller-provided URL.
4. Add local callback URLs separately for development. HTTP is permitted only
   for localhost/loopback. `next dev` can infer a localhost origin; production
   requires `APP_SITE_URL`, including when testing `next start` locally.
5. Do not use broad wildcard production redirect allowlists. A missing or
   malformed deployment origin produces a generic public error and sends no email.

## Brevo and Supabase Custom SMTP

Use an approved sender domain controlled by the project owner. No institutional
domain, mailbox, SMTP login, or credential is provided by this repository.

1. Verify the sender/domain in Brevo and complete domain authentication.
2. Obtain the SMTP login and a dedicated SMTP key from Brevo's SMTP settings.
   The SMTP key is not the Brevo account password or the REST API key.
3. In Supabase Auth Custom SMTP, enter:

   | Field | Value |
   | --- | --- |
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` with STARTTLS, or the supported secure port agreed with the administrator |
   | Username/login | Actual SMTP login shown by Brevo |
   | Password | Dedicated Brevo SMTP key |
   | Sender name | `Alumni Mendunia SMK` |
   | Sender email | Verified address on the approved sender domain |

4. Store SMTP secrets only in Supabase's SMTP configuration and the approved
   secret manager. No SMTP environment variables are needed in Next.js.
   Never add SMTP credentials to `NEXT_PUBLIC_*`, source, screenshots, or Git.
5. Disable click/link tracking for these transactional emails in the Brevo
   account configuration. Verify the delivered button still targets Supabase's
   `/auth/v1/verify` URL without a Brevo tracking redirect. If tracking cannot
   be disabled, resolve that with Brevo before enabling recovery in production.
   Email-link scanners may also consume single-use tokens; request a fresh
   link for testing and assess scanner policy if links expire before use.

## DNS and delivery

- Copy the exact domain verification and DKIM records provided by Brevo.
- Review SPF for the actual sending infrastructure. Brevo's shared service
  manages SPF; a dedicated IP/custom return path can require additional
  configuration. Do not invent SPF values or publish multiple SPF records.
- Preserve the organization's DMARC policy and reporting mailbox. Coordinate
  any required alignment changes with its DNS administrator rather than
  replacing an existing record automatically.
- Check delivered message headers for SPF, DKIM, and DMARC results, plus Inbox
  and Spam placement. Domain verification alone is not proof of delivery.
- Set Supabase Auth email rate limits and Brevo quotas to approved values.
  Keep leaked-password protection and existing Auth abuse protections enabled.
- The app supplements these with 3 recovery requests per client per 15 minutes
  in a bounded instance-local hashed-IP map. This is not a distributed limiter;
  direct Supabase requests remain subject to Supabase's own limits. Configure
  the hosting proxy to overwrite forwarded-IP headers. Shared IPs share this
  allowance. Review gateway/distributed limits before a larger rollout.
- Registered and unregistered email requests get the same accepted message.
  Auth's explicit missing-user codes are also treated as accepted. Delivery,
  network, policy, and rate-limit errors return the same generic service error
  with no provider details. No application lookup asserts whether an email exists.

## Reset Password template

In Supabase Auth Email Templates > Reset Password:

- Subject: `Pemulihan Kata Sandi - Alumni Mendunia SMK`
- Copy the entire [HTML reference](email-templates/reset-password.html).
- Keep the CTA `href="{{ .ConfirmationURL }}"` intact. Supabase alone generates
  this URL. Do not substitute a manually generated token or an application URL.
- Preview and send to an approved fictional test recipient after configuration.
- Fonts use Plus Jakarta Sans and Inter when available, with Arial fallbacks
  for email clients that do not support web fonts. No external images or tracking
  resources are loaded by the template.

## Live acceptance after manual configuration

Use fictional test accounts and record outcomes without tokens or passwords.

1. Dinas email validation: empty, malformed, registered, and unregistered.
   The latter two must have identical public confirmation text.
2. Send once from the intended browser. Confirm sender, subject, Indonesian
   content, untracked Supabase link, DNS results, and Spam/Inbox placement.
3. Follow the link once, save an 8-character-or-longer password, and confirm
   return to login. Old-password login must fail; new-password login must pass.
4. Reopen the used link, use an expired link, and try a wrong-browser PKCE
   callback. All must reject the link without exposing token details.
5. Simulate an SMTP failure in an isolated project and check the generic error.
6. Check School activation, NPSN login/recovery, and stored-email resolution.
   Also check mandatory password replacement for legacy accounts, including
   blocked operational access before completion. Manual credential reissuance
   is no longer available in the application.
   Recheck Dinas role authorization.
7. Confirm no passwords, SMTP keys, PKCE codes, or full recovery URLs reach
   application/analytics logs. Redact query strings at the hosting/access-log
   layer too; application code does not log them.

No live SMTP or hosted Auth-account mutation was performed while preparing this
implementation. Unit tests mock Auth; they do not prove live deliverability,
single-use token enforcement, or old-password invalidation.

## Official references

- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase SSR and PKCE](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo domain troubleshooting, including SPF](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
