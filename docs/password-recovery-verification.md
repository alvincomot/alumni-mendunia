# Password recovery verification

Date: 2026-10-28 (Asia/Jakarta).

Historical report for the earlier Dinas recovery implementation. Its School
help-page behavior has been superseded by [School self-service activation](school-self-activation.md).

## Scope and changed files

- `.env.example`: explain the trusted origin and both callback allowlist entries.
- `app/auth/forgot-password/actions.ts`: validated, rate-limited recovery using
  the existing Supabase SSR client and safe public responses.
- `lib/auth/recovery.ts`: shared email validation and Indonesian feedback.
- `lib/auth/recovery-rate-limit.ts`: bounded, hashed-IP, instance-local limiter.
- `components/forgot-password-form.tsx`: inline errors, pending/retry and generic
  confirmation using the server action.
- `components/login-form.tsx`: mode-specific recovery destinations.
- `app/auth/school-password-help/page.tsx`: guidance to contact Admin Dinas;
  does not implement the future NPSN request inbox.
- `app/auth/callback/route.ts` and `app/auth/confirm/route.ts`: require a session
  and independently verified Auth user after code/OTP verification.
- `app/auth/update-password/page.tsx`: verify the user; replace standalone logout
  with a discreet switch-account control only for mandatory password changes.
- `app/auth/update-password/actions.ts`: after a successful non-mandatory password
  update and user verification, sign out locally and return a fixed login
  destination. Preserve the mandatory flag completion and dashboard destination.
- `lib/auth/password-change.ts`: type the server-selected redirect destination.
- `components/update-password-form.tsx`: follow the server destination, retain
  inline validation/toggles and add clear recovery instructions.
- `components/use-another-account.tsx`: local sign-out control with pending/error
  states; never clears the password-change flag.
- `docs/email-templates/reset-password.html`: Indonesian Supabase email reference.
- `docs/password-recovery-email-setup.md`: Brevo, SMTP, DNS, URLs and live checklist.
- `docs/mvp-setup.md`: link to the new operational guide.
- `tests/password-recovery.test.mjs`: recovery and callback regression coverage.
- `tests/password-recovery-browser.mjs`: isolated browser fixtures with mocked Auth.
- `tests/school-account-provisioning.test.mjs`: recovery sign-out, failure and
  mandatory-flow regression tests.
- `tests/login.test.mjs`, `tests/form-ux.test.mjs`, `tests/mvp.test.mjs`: adapt
  existing expectations/mocks to the changed UI and strengthened verification.

The worktree already contained earlier changes. Do not stage whole directories
or use `git add .`; review and stage the related files/hunks individually.
No migrations, RLS policies, real Auth accounts, hosted settings or SMTP secrets
were changed. No runtime dependency was added to the project.

## Automated evidence

- `npm run lint`: pass.
- `npx tsc --noEmit`: pass.
- `npm run build`: pass. Existing warning: `cacheComponents` is enabled without
  an explicit `partialPrefetching` option.
- `node --test tests/*.test.mjs`: 122 tests passed, zero failures.
- `RECOVERY_UI_TEST_DEPS=<temporary playwright/esbuild installation>` followed
  by `node tests/password-recovery-browser.mjs`: pass in Chrome at 390px and
  1440px. Fixture dependencies and screenshots are outside the repository.

Recovery unit tests cover empty/malformed input, registered and missing email
responses, Auth/SMTP/network failures, request limits, unsafe/missing deployment
origins, callback error/reuse/expiry/wrong-verifier cases and user mismatches.
An integration test uses the installed `@supabase/ssr` implementation against a
mock HTTP endpoint to prove the PKCE verifier cookie is persisted and an S256
challenge accompanies the recovery request.

Password-action tests verify the authenticated target, eight-character policy,
Auth-update-before-flag-clear order, server-selected destination, local sign-out
after verified update, rejection of forged browser flow settings, and failures
that must not be reported as completed recovery.

## Recorded browser interactions (mocked Auth)

- School recovery link: opens school guidance; back link returns to login.
- Dinas selector and recovery link: open email recovery.
- Empty email submit: inline Indonesian error and email focus.
- Malformed email submit: inline Indonesian format error.
- Simulated service failure: generic error; entered email remains available.
- Retry after failure: generic confirmation and a working login link.
- Login link activated with Enter: returns to the login fixture.
- Recovery update: no standalone logout or switch-account control.
- Seven-character submit: inline minimum-length error.
- Password toggle activated with keyboard Space: shows text; value preserved.
- Hide control: restores password masking.
- Mismatched confirmation: inline Indonesian error.
- Corrected eight-character submit: mocked action succeeds; fixed login
  destination recorded and success toast shown.
- Mandatory flow switch-account control: invokes local sign-out before login.
- Email template: renders at both widths; one CTA retains the literal Supabase
  `{{ .ConfirmationURL }}` placeholder. It is a reference, not a live reset link.
- No horizontal overflow or browser console errors in these scenarios.

## Not verified live

No real recovery email was sent. Brevo sender/domain, SMTP credentials, DNS
alignment, provider click-tracking configuration, actual email-client rendering,
production URL allowlist and hosted password policy still require manual review.
The local environment previously lacked `APP_SITE_URL`; set it for deployment.
Browser fixtures are not a hosted end-to-end test.

Expired/reused tokens and old-password invalidation are represented by mocked
Auth responses or delegated to Supabase; they were not exercised on real hosted
accounts. The live checklist in the setup guide must be completed with fictional
accounts after approved configuration. The limiter is instance-local and does
not replace distributed abuse protection or Supabase rate limits.

## Anti-Slop Delivery Gate

This report applies to the recovery UI/template changes and the isolated browser
scenarios above. It does not claim that hosted email delivery was verified.

R-02 PASS: new recovery copy contains no em dash.
R-03 PASS: browser fixtures and email reference have no overflow at 390px/1440px.
R-17 PASS: no metrics or statistics were added.
R-18 PASS: no testimonials or fictional identities appear in the UI/template.
R-23 PASS: branding uses only the explicitly requested product name.
R-24 PASS: School/Dinas recovery and return-to-login links were clicked.
R-25 PASS: navy body/heading text, slate secondary text and teal actions use the existing high-contrast palette.
R-26 PASS: submit, retry, visibility, return and switch-account controls execute their intended fixture behavior.
R-27 PASS: empty, validation, pending, error/retry and confirmation states are implemented.
R-28 PASS: no FAQ was added.
R-32 PASS: error focus, keyboard Space toggle, Enter link navigation and visible focus styles were verified.
R-33 PASS: UI source was edited directly with patches; the runner only bundles isolated fixtures.
R-34 PASS: the existing light theme is preserved; no new theme is introduced.
R-35 PASS: production build, 122 regression tests and recorded Chrome fixture interactions passed.
R-36 PASS: live-delivery and token-test limitations are explicit; no unsupported claims are presented.
R-37 PASS: root DESIGN.md and existing login design reference guide the changes.
R-38 PASS: test emails occur only in isolated fixtures; product copy contains no fabricated account data.

R-01 PASS: no gradient/glow was added; the existing navy/teal palette provides hierarchy.
R-04 PASS: only existing password visibility icons communicate a real action.
R-06 PASS: Plus Jakarta Sans/Inter are inherited; email clients have explicit Arial fallbacks.
R-07 PASS: no decorative background pattern is used.
R-08 PASS: no decorative button arrows are used.
R-09 PASS: no capsule/eyebrow badge was added.
R-10 PASS: no glassmorphism was added.
R-12 PASS: existing restrained card shadow is retained to separate the form from its background.
R-13 PASS: no glow effects or decorative status lights are used.
R-14 PASS: no feature-card grid was added.
R-19 PASS: MOTION 1 uses existing pending feedback and focus/hover behavior.
R-22 PASS: no illustrations were added.

Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 were declared from DESIGN.md before edits.
Consistency PASS: calm administrative forms and a single email action follow those dials.
Focal point PASS: recovery submit/password save is the primary action in each state.
Whitespace PASS: spacing groups labels, fields, feedback and return navigation.
Accent PASS: teal accents actions and focus without spreading across all content.
Identity motif PASS: navy headings and teal actions repeat the application's visual language.
Design Read PASS: recovery for Dinas and school operators was declared before UI changes.

C-1 PASS: changes reduce ambiguity and preserve clear security-dependent actions.
C-2 PASS: every new control has a tested action or a real destination.
C-3 PASS: UI sections contain only recovery information, fields, feedback or navigation.
C-4 PASS: validation/failure/retry/confirmation and mobile/desktop cases passed the fixtures.
C-5 PASS: no testimonials, statistics or delivery claims are fabricated.
R-05 PASS: existing centered form layout is reused rather than adding template sections.
R-11 PASS: existing input/button/card radii are preserved.
R-15 PASS: CTAs name recovery, password save and account switching directly.
R-16 PASS: no marketing buzzwords are used.
R-20 PASS: School and Dinas instructions describe this application's actual account workflows.
R-21 PASS: existing light administrative design is retained within the requested scope.
R-29 PASS: navy/teal and neutral surfaces remain the active palette, with red only for errors.
R-30 PASS: no external product layout is copied.
R-31 PASS: palette follows the product, centered layout focuses one form, and font/spacing choices support readability.

UI palette PASS: derived from DESIGN.md.
UI accent PASS: highlights primary actions and focus.
UI copy PASS: Indonesian text has no decorative emoji.
UI rhythm PASS: fields/feedback and confirmation retain clear content hierarchy.
UI shapes PASS: no bento, fake terminal or decorative striping appears.
UI heading PASS: no redundant badge appears above headings.
UI behavior PASS: navigation and form controls were exercised in the fixture.
UI motion PASS: no decorative motion was added.
UI effects PASS: existing restrained radii/shadows are preserved.
UI status PASS: feedback represents actual fixture request results.
UI composition PASS: each screen serves the next recovery decision.
UI data PASS: no invented operational data is shown.
UI fields PASS: forms open empty and preserve user input after failures.
UI states PASS: Indonesian feedback explains the next step without disclosing account existence.
UI resilience PASS: keyboard interactions and both target widths passed with zero console errors.

Suggested commit: `feat: improve password recovery and email branding`.
No commit or push was performed.
