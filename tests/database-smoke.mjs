// Runs only against an ephemeral in-memory PostgreSQL (PGlite), never Supabase.
// Install PGlite in a temporary directory and set MVP_SQL_TEST_DEPS to that directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (!process.env.MVP_SQL_TEST_DEPS)
  throw Error("Set MVP_SQL_TEST_DEPS to an isolated PGlite installation");
const dependency = createRequire(
  path.join(process.env.MVP_SQL_TEST_DEPS, "package.json"),
);
const { PGlite } = dependency("@electric-sql/pglite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();
const user = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
let assertions = 0;
let schoolCAlumniId;
async function check(title, fn) {
  await fn();
  assertions++;
  console.log(`PASS ${title}`);
}
async function as(number) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.initial_password_change', '', false)");
  await db.query(
    "SELECT set_config('app.password_change_actor_id', '', false)",
  );
  await db.query("SELECT set_config('app.school_password_reissue', '', false)");
  await db.query(
    "SELECT set_config('app.school_password_reissue_request_id', '', false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [
    number ? user(number) : "",
  ]);
  await db.query("SELECT set_config('request.jwt.claim.role', $1, false)", [
    number ? "authenticated" : "",
  ]);
  if (number) await db.exec("SET ROLE authenticated");
}
async function asService() {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.initial_password_change', '', false)");
  await db.query(
    "SELECT set_config('app.password_change_actor_id', '', false)",
  );
  await db.query("SELECT set_config('app.school_password_reissue', '', false)");
  await db.query(
    "SELECT set_config('app.school_password_reissue_request_id', '', false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.query(
    "SELECT set_config('request.jwt.claim.role', 'service_role', false)",
  );
  await db.exec("SET ROLE service_role");
}
async function asAuthenticatedWithoutSession() {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.initial_password_change', '', false)");
  await db.query(
    "SELECT set_config('app.password_change_actor_id', '', false)",
  );
  await db.query("SELECT set_config('app.school_password_reissue', '', false)");
  await db.query(
    "SELECT set_config('app.school_password_reissue_request_id', '', false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.query("SELECT set_config('request.jwt.claim.role', '', false)");
  await db.exec("SET ROLE authenticated");
}
async function asAnonymous() {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.initial_password_change', '', false)");
  await db.query(
    "SELECT set_config('app.password_change_actor_id', '', false)",
  );
  await db.query("SELECT set_config('app.school_password_reissue', '', false)");
  await db.query(
    "SELECT set_config('app.school_password_reissue_request_id', '', false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.query("SELECT set_config('request.jwt.claim.role', 'anon', false)");
  await db.exec("SET ROLE anon");
}
async function asServiceWithoutClaim() {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.initial_password_change', '', false)");
  await db.query(
    "SELECT set_config('app.password_change_actor_id', '', false)",
  );
  await db.query("SELECT set_config('app.school_password_reissue', '', false)");
  await db.query(
    "SELECT set_config('app.school_password_reissue_request_id', '', false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  await db.query("SELECT set_config('request.jwt.claim.role', '', false)");
  await db.exec("SET ROLE service_role");
}
async function register(
  alumni,
  expected,
  status = "persiapan_berangkat",
  country = "Jepang",
) {
  return (
    await db.query(
      "SELECT public.create_placement_guarded($1,$2,$4,'Teknologi','Perusahaan Fiktif',NULL,$3,NULL,NULL,NULL) AS id",
      [alumni, expected, status, country],
    )
  ).rows[0].id;
}

async function registerWithState({
  alumni,
  expected = null,
  secured,
  provider = null,
  sector = null,
  planned = null,
  status = "persiapan_berangkat",
  actual = null,
  employmentStart = null,
  contractEnd = null,
  country = "Jepang",
}) {
  return (
    await db.query(
      "SELECT public.create_placement_guarded($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
      [
        alumni,
        expected,
        country,
        secured,
        provider,
        sector,
        planned,
        status,
        actual,
        employmentStart,
        contractEnd,
      ],
    )
  ).rows[0].id;
}

function migrationSql(filename) {
  return fs
    .readFileSync(path.join(root, "supabase/migrations", filename), "utf8")
    .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
}

async function verifyProvisioningPreflight() {
  const preflightDb = new PGlite();
  try {
    await preflightDb.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, service_role;`);
    for (const filename of [
      "20261021000100_initial_schema.sql",
      "20261023000100_guard_placement_registration.sql",
      "20261023000200_guard_profile_administration.sql",
      "20261023000300_guard_last_active_admin.sql",
    ])
      await preflightDb.exec(migrationSql(filename));
    await preflightDb.exec(`
      INSERT INTO auth.users(id) VALUES ('${user(21)}'),('${user(22)}');
      INSERT INTO public.schools(id,npsn,name,city) VALUES ('${user(31)}','00000031','SMK Preflight Fiktif','Jakarta');
      INSERT INTO public.profiles(user_id,full_name,role,school_id) VALUES
        ('${user(21)}','Petugas Preflight Satu','petugas_sekolah','${user(31)}'),
        ('${user(22)}','Petugas Preflight Dua','petugas_sekolah','${user(31)}');
    `);
    await assert.rejects(
      preflightDb.exec(
        migrationSql("20261026000100_secure_school_account_provisioning.sql"),
      ),
      /Duplicate active School Staff profiles/,
    );
    await preflightDb.exec("ROLLBACK");
    assert.equal(
      (
        await preflightDb.query(
          "SELECT count(*)::int AS n FROM public.profiles WHERE school_id=$1 AND is_active",
          [user(31)],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await preflightDb.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='must_change_password'",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      "PASS provisioning migration preflight reports duplicates and rolls back without modifying accounts",
    );
  } finally {
    await preflightDb.close();
  }
}

async function verifyNativeMigrationDependencies() {
  const cleanupDb = new PGlite();
  const targets = [
    "public.school_auth_request(text,text,text,text)",
    "public.school_auth_validate(text,text)",
    "public.school_auth_begin(text,text,uuid)",
    "public.school_auth_complete(uuid,uuid)",
    "public.school_auth_abort(uuid)",
    "public.school_auth_legacy_complete(uuid)",
    "public.school_auth_admin_change(uuid,text)",
  ];
  const targetOids = targets
    .map((signature) => `to_regprocedure('${signature}')`)
    .join(",");
  try {
    await cleanupDb.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,
        email text DEFAULT (gen_random_uuid()::text || '@example.test'),
        encrypted_password text DEFAULT 'fictional-auth-hash',
        email_confirmed_at timestamptz DEFAULT now(),
        last_sign_in_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, service_role;`);
    for (const filename of [
      "20261021000100_initial_schema.sql",
      "20261023000100_guard_placement_registration.sql",
      "20261023000200_guard_profile_administration.sql",
      "20261023000300_guard_last_active_admin.sql",
      "20261026000100_secure_school_account_provisioning.sql",
      "20261027000100_school_password_reissuance.sql",
    ])
      await cleanupDb.exec(migrationSql(filename));
    await cleanupDb.query(
      "INSERT INTO public.schools(id,npsn,name,city) VALUES ($1,'00000041','SMK Cleanup Fiktif','Jakarta')",
      [user(41)],
    );
    await cleanupDb.exec(
      migrationSql("20261028000100_school_account_lifecycle.sql"),
    );
    await cleanupDb.exec(`INSERT INTO public.schools(id,npsn,name,city) VALUES
      ('${user(42)}','00000042','SMK Pending Fiktif','Jakarta'),
      ('${user(43)}','00000043','SMK Aktif Fiktif','Jakarta'),
      ('${user(44)}','00000044','SMK Nonaktif Fiktif','Jakarta');
      INSERT INTO auth.users(id,email) VALUES ('${user(43)}','legacy-active@example.test');
      UPDATE app_private.school_auth_accounts SET status='PENDING_ACTIVATION',email='legacy-pending@example.test',
        operation_id='${user(45)}',operation_started_at=now() WHERE school_id='${user(42)}';
      UPDATE app_private.school_auth_accounts SET status='ACTIVE',user_id='${user(43)}' WHERE school_id='${user(43)}';
      UPDATE app_private.school_auth_accounts SET status='SUSPENDED',resume_status='UNCLAIMED' WHERE school_id='${user(44)}';
      INSERT INTO app_private.school_auth_tokens(school_id,purpose,token_hash,expires_at)
        VALUES ('${user(42)}','activation',repeat('a',64),now()+interval '1 hour');`);
    const legacyAccounts = (
      await cleanupDb.query(
        "SELECT to_jsonb(a) AS value FROM app_private.school_auth_accounts a ORDER BY school_id",
      )
    ).rows;
    const legacyTokens = (
      await cleanupDb.query("SELECT * FROM app_private.school_auth_tokens")
    ).rows;

    assert.equal(
      (
        await cleanupDb.query(
          `SELECT count(*)::int AS n FROM pg_proc WHERE oid IN (${targetOids})`,
        )
      ).rows[0].n,
      targets.length,
    );
    const triggerDependencies = (
      await cleanupDb.query(`SELECT t.tgname, n.nspname || '.' || p.proname AS function_name
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid=t.tgfoid
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE NOT t.tgisinternal AND p.proname IN ('sync_school_auth_profile','initialize_school_auth')
        ORDER BY t.tgname`)
    ).rows;
    assert.deepEqual(triggerDependencies, [
      {
        tgname: "profiles_sync_school_auth",
        function_name: "app_private.sync_school_auth_profile",
      },
      {
        tgname: "schools_initialize_auth",
        function_name: "app_private.initialize_school_auth",
      },
    ]);
    assert.equal(
      (
        await cleanupDb.query(
          "SELECT count(*)::int AS n FROM app_private.school_auth_accounts",
        )
      ).rows[0].n,
      4,
    );

    await cleanupDb.exec(
      migrationSql("20261028000200_native_school_self_activation.sql"),
    );
    assert.deepEqual(
      (
        await cleanupDb.query(
          "SELECT to_jsonb(a)-'activation_request_id'-'activation_requested_at'-'activation_expires_at'-'activation_operation_is_new'-'activation_operation_ttl_seconds' AS value FROM app_private.school_auth_accounts a ORDER BY school_id",
        )
      ).rows,
      legacyAccounts,
    );
    assert.deepEqual(
      (await cleanupDb.query("SELECT * FROM app_private.school_auth_tokens"))
        .rows,
      legacyTokens,
    );
    assert.equal(
      (
        await cleanupDb.query(
          `SELECT count(*)::int AS n FROM pg_proc WHERE oid IN (${targetOids})`,
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await cleanupDb.query(
          "SELECT count(*)::int AS n FROM app_private.school_auth_accounts",
        )
      ).rows[0].n,
      4,
    );
    await cleanupDb.exec(
      migrationSql("20261029000100_harden_school_activation_completion.sql"),
    );
    assert.equal(
      (
        await cleanupDb.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='app_private' AND table_name='school_auth_accounts' AND column_name='activation_password_fingerprint'",
        )
      ).rows[0].n,
      1,
    );
    console.log(
      "PASS native migrations remove retired token RPCs without CASCADE, retain lifecycle rows/triggers and add password-change evidence",
    );
  } finally {
    await cleanupDb.close();
  }
}

async function verifyPlacementStateBackfill() {
  const placementDb = new PGlite();
  try {
    await placementDb.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, service_role;`);
    for (const filename of [
      "20261021000100_initial_schema.sql",
      "20261023000100_guard_placement_registration.sql",
      "20261023000200_guard_profile_administration.sql",
      "20261023000300_guard_last_active_admin.sql",
    ])
      await placementDb.exec(migrationSql(filename));
    await placementDb.exec(`
      INSERT INTO public.schools(id,npsn,name,city)
        VALUES ('${user(51)}','00000051','SMK Backfill Fiktif','Jakarta');
      INSERT INTO public.alumni(id,school_id,full_name,graduation_year,major) VALUES
        ('${user(52)}','${user(51)}','Alumni Persiapan Historis',2020,'Teknik'),
        ('${user(53)}','${user(51)}','Alumni Aktif Historis',2020,'Teknik');
      INSERT INTO public.placements(id,alumni_id,destination_country,company_name,work_sector,status,is_current) VALUES
        ('${user(54)}','${user(52)}','Jepang','Pemberi Kerja Historis','Manufaktur','persiapan_berangkat',true),
        ('${user(55)}','${user(53)}','Jepang','Pemberi Kerja Aktif','Teknologi','aktif_bekerja',true);
    `);
    await placementDb.exec(
      migrationSql("20261105000100_initial_placement_state.sql"),
    );
    const rows = (
      await placementDb.query(
        "SELECT id,placement_secured,placement_provider_name,company_name FROM public.placements ORDER BY id",
      )
    ).rows;
    assert.deepEqual(rows, [
      {
        id: user(54),
        placement_secured: null,
        placement_provider_name: null,
        company_name: "Pemberi Kerja Historis",
      },
      {
        id: user(55),
        placement_secured: true,
        placement_provider_name: null,
        company_name: "Pemberi Kerja Aktif",
      },
    ]);
    console.log(
      "PASS placement migration preserves unknown preparation state and legacy employer semantics",
    );
  } finally {
    await placementDb.close();
  }
}
try {
  await verifyProvisioningPreflight();
  await verifyNativeMigrationDependencies();
  await verifyPlacementStateBackfill();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,
      email text DEFAULT (gen_random_uuid()::text || '@example.test'),
      encrypted_password text DEFAULT 'fictional-auth-hash',
      email_confirmed_at timestamptz DEFAULT now(),
      last_sign_in_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, service_role;`);
  for (const filename of [
    "20261021000100_initial_schema.sql",
    "20261023000100_guard_placement_registration.sql",
    "20261023000200_guard_profile_administration.sql",
    "20261023000300_guard_last_active_admin.sql",
    "20261026000100_secure_school_account_provisioning.sql",
    "20261027000100_school_password_reissuance.sql",
    "20261028000100_school_account_lifecycle.sql",
    "20261028000200_native_school_self_activation.sql",
    "20261029000100_harden_school_activation_completion.sql",
    "20261105000100_initial_placement_state.sql",
    "20261105000200_edit_current_placement_details.sql",
    "20261106000100_preserve_planned_departure_on_placement_edit.sql",
    "20261106000200_require_contract_end_date_on_completion.sql",
  ]) {
    // PGlite does not package pgcrypto; core PostgreSQL gen_random_uuid() is sufficient here.
    await db.exec(migrationSql(filename));
  }
  console.log(
    "PASS all migration SQL executes in isolated PostgreSQL (pgcrypto declaration omitted)",
  );
  assert.equal(
    (
      await db.query(
        "SELECT to_regprocedure('public.school_auth_request(text,text,text,text)') IS NULL AS removed",
      )
    ).rows[0].removed,
    true,
  );
  assert.equal(
    (
      await db.query(
        "SELECT to_regclass('app_private.school_auth_accounts') IS NOT NULL AS retained",
      )
    ).rows[0].retained,
    true,
  );
  console.log(
    "PASS retired School email RPCs are absent while lifecycle reconciliation metadata is retained",
  );
  await db.exec(`INSERT INTO auth.users(id) VALUES ('${user(1)}'),('${user(2)}'),('${user(3)}'),('${user(4)}');
    INSERT INTO public.schools(id,npsn,name,city) VALUES ('${user(11)}','00000011','SMK Fiktif A','Jakarta'),('${user(12)}','00000012','SMK Fiktif B','Jakarta');
    INSERT INTO public.profiles(user_id,full_name,role,school_id) VALUES
      ('${user(1)}','Admin Fiktif','admin_dinas',NULL),('${user(2)}','Viewer Fiktif','viewer_dinas',NULL),
      ('${user(3)}','Petugas Fiktif A','petugas_sekolah','${user(11)}'),('${user(4)}','Petugas Fiktif B','petugas_sekolah','${user(12)}');`);
  await as(3);
  const alumni = (
    await db.query(
      "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Alumni Fiktif',2020,'Teknik') RETURNING id,school_id",
    )
  ).rows[0];
  await check("school assigned from authenticated profile", async () =>
    assert.equal(alumni.school_id, user(11)),
  );
  const first = await register(alumni.id, null);
  await check(
    "duplicate initial and nonterminal successor rejected without history changes",
    async () => {
      await assert.rejects(register(alumni.id, null), /snapshot changed/);
      await assert.rejects(register(alumni.id, first), /must be terminal/);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.placements"))
          .rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "old public and private RPCs cannot bypass the new guards",
    async () => {
      await assert.rejects(
        db.query("SELECT public.create_placement($1,'Jepang')", [alumni.id]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "SELECT app_private.create_placement($1,'Jepang',NULL,NULL,NULL,'persiapan_berangkat',NULL,NULL,NULL)",
          [alumni.id],
        ),
        /permission denied/,
      );
    },
  );
  await check(
    "cross-school reads and writes are denied by RLS/RPC",
    async () => {
      await as(4);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.alumni")).rows[0]
          .n,
        0,
      );
      await assert.rejects(register(alumni.id, first), /unavailable/);
      await assert.rejects(
        db.query(
          "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja',NULL,'2020-01-01')",
          [first],
        ),
        /tidak diizinkan/,
      );
      await as(3);
    },
  );
  await check(
    "status changes are atomic, expected-status checked and histories immutable",
    async () => {
      await db.query(
        "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja','Catatan fiktif','2020-01-01')",
        [first],
      );
      await assert.rejects(
        db.query(
          "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja',NULL,'2020-01-01')",
          [first],
        ),
        /Status berubah/,
      );
      await assert.rejects(
        db.query(
          "SELECT public.change_placement_status($1,'aktif_bekerja','selesai_kontrak')",
          [first],
        ),
        /Tanggal selesai kontrak wajib diisi/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        2,
      );
      await db.query(
        "SELECT public.change_placement_status($1,'aktif_bekerja','selesai_kontrak',NULL,NULL,'2020-01-02')",
        [first],
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        3,
      );
      await assert.rejects(
        db.exec("UPDATE public.status_histories SET note='bad'"),
        /permission denied/,
      );
    },
  );
  const second = await register(alumni.id, first);
  await check(
    "successor preserves terminal history and rejects repeated expected IDs",
    async () => {
      const rows = (
        await db.query(
          "SELECT id,is_current,status FROM public.placements ORDER BY created_at,id",
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.equal(rows.find((row) => row.id === first).is_current, false);
      assert.equal(
        rows.find((row) => row.id === first).status,
        "selesai_kontrak",
      );
      assert.equal(rows.find((row) => row.id === second).is_current, true);
      await assert.rejects(register(alumni.id, first), /snapshot changed/);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        4,
      );
    },
  );
  await check(
    "invalid successor rolls back current marker and creates no history",
    async () => {
      await db.query(
        "SELECT public.change_placement_status($1,'persiapan_berangkat','batal_berangkat')",
        [second],
      );
      await assert.rejects(
        register(alumni.id, second, "unknown"),
        /tidak valid/,
      );
      await assert.rejects(
        register(alumni.id, second, "persiapan_berangkat", ""),
        /check constraint/,
      );
      assert.equal(
        (await db.query("SELECT id FROM public.placements WHERE is_current"))
          .rows[0].id,
        second,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        5,
      );
    },
  );
  await check(
    "explicit placement state is atomic, constrained and school-scoped",
    async () => {
      await as(3);
      const withoutPlacementAlumni = (
        await db.query(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Alumni Belum Ditempatkan',2021,'Teknik') RETURNING id",
        )
      ).rows[0].id;
      const withoutPlacement = await registerWithState({
        alumni: withoutPlacementAlumni,
        secured: false,
      });
      assert.deepEqual(
        (
          await db.query(
            "SELECT placement_secured,placement_provider_name,work_sector,planned_departure FROM public.placements WHERE id=$1",
            [withoutPlacement],
          )
        ).rows[0],
        {
          placement_secured: false,
          placement_provider_name: null,
          work_sector: null,
          planned_departure: null,
        },
      );
      await assert.rejects(
        registerWithState({
          alumni: withoutPlacementAlumni,
          secured: false,
          provider: "LPK tidak boleh tersimpan",
        }),
        /harus kosong/,
      );

      const historyBefore = (
        await db.query(
          "SELECT count(*)::int AS n FROM public.status_histories WHERE placement_id=$1",
          [withoutPlacement],
        )
      ).rows[0].n;
      await as(1);
      const auditBefore = (
        await db.query(
          "SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type='placements' AND entity_id=$1",
          [withoutPlacement],
        )
      ).rows[0].n;
      await as(3);
      await assert.rejects(
        db.query(
          "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja')",
          [withoutPlacement],
        ),
        /Tanggal keberangkatan wajib diisi/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories WHERE placement_id=$1",
            [withoutPlacement],
          )
        ).rows[0].n,
        historyBefore,
      );
      await db.query(
        "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja',NULL,'2020-01-01')",
        [withoutPlacement],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT status,placement_secured,actual_departure::text FROM public.placements WHERE id=$1",
            [withoutPlacement],
          )
        ).rows[0],
        {
          status: "aktif_bekerja",
          placement_secured: true,
          actual_departure: "2020-01-01",
        },
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories WHERE placement_id=$1",
            [withoutPlacement],
          )
        ).rows[0].n,
        historyBefore + 1,
      );
      await as(1);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type='placements' AND entity_id=$1",
            [withoutPlacement],
          )
        ).rows[0].n,
        auditBefore + 1,
      );
      await as(3);

      const securedAlumni = (
        await db.query(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Alumni Sudah Ditempatkan',2022,'Teknik') RETURNING id",
        )
      ).rows[0].id;
      const securedPlacement = await registerWithState({
        alumni: securedAlumni,
        secured: true,
        provider: "LPK Fiktif",
        sector: "Manufaktur",
        planned: "2027-01-15",
      });
      assert.deepEqual(
        (
          await db.query(
            "SELECT placement_secured,placement_provider_name,work_sector,planned_departure::text FROM public.placements WHERE id=$1",
            [securedPlacement],
          )
        ).rows[0],
        {
          placement_secured: true,
          placement_provider_name: "LPK Fiktif",
          work_sector: "Manufaktur",
          planned_departure: "2027-01-15",
        },
      );
      await assert.rejects(
        db.exec(
          `UPDATE public.placements SET placement_secured=false WHERE id='${securedPlacement}'`,
        ),
        /permission denied/,
      );

      const editSnapshot = (
        await db.query(
          "SELECT status,updated_at FROM public.placements WHERE id=$1",
          [securedPlacement],
        )
      ).rows[0];
      const editHistoryBefore = (
        await db.query(
          "SELECT count(*)::int AS n FROM public.status_histories WHERE placement_id=$1",
          [securedPlacement],
        )
      ).rows[0].n;
      await as(1);
      const editAuditBefore = (
        await db.query(
          "SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type='placements' AND entity_id=$1",
          [securedPlacement],
        )
      ).rows[0].n;
      await as(3);
      await db.query(
        "SELECT public.update_current_placement_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          securedPlacement,
          editSnapshot.status,
          editSnapshot.updated_at,
          "Korea Selatan",
          true,
          "LPK Fiktif Diperbarui",
          "Teknologi",
          "2027-02-01",
          null,
          null,
          null,
        ],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT destination_country,placement_secured,placement_provider_name,work_sector,planned_departure::text,status FROM public.placements WHERE id=$1",
            [securedPlacement],
          )
        ).rows[0],
        {
          destination_country: "Korea Selatan",
          placement_secured: true,
          placement_provider_name: "LPK Fiktif Diperbarui",
          work_sector: "Teknologi",
          planned_departure: "2027-02-01",
          status: "persiapan_berangkat",
        },
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories WHERE placement_id=$1",
            [securedPlacement],
          )
        ).rows[0].n,
        editHistoryBefore,
      );
      await as(1);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type='placements' AND entity_id=$1",
            [securedPlacement],
          )
        ).rows[0].n,
        editAuditBefore + 1,
      );
      await as(3);
      await assert.rejects(
        db.query(
          "SELECT public.update_current_placement_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            securedPlacement,
            editSnapshot.status,
            editSnapshot.updated_at,
            "Jepang",
            true,
            "LPK Usang",
            "Manufaktur",
            "2027-03-01",
            null,
            null,
            null,
          ],
        ),
        /snapshot changed/,
      );
      const latestUpdatedAt = (
        await db.query("SELECT updated_at FROM public.placements WHERE id=$1", [
          securedPlacement,
        ])
      ).rows[0].updated_at;
      for (const account of [1, 2, 4]) {
        await as(account);
        await assert.rejects(
          db.query(
            "SELECT public.update_current_placement_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [
              securedPlacement,
              "persiapan_berangkat",
              latestUpdatedAt,
              "Jepang",
              true,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
          ),
          /unavailable/,
        );
      }
      await as(4);
      await assert.rejects(
        registerWithState({ alumni: securedAlumni, secured: true }),
        /unavailable/,
      );
      await as(3);
      await db.query(
        "SELECT public.change_placement_status($1,$2,$3,$4,$5,$6)",
        [
          securedPlacement,
          "persiapan_berangkat",
          "aktif_bekerja",
          null,
          "2026-01-01",
          null,
        ],
      );
      const activeSnapshot = (
        await db.query(
          "SELECT status,planned_departure::text,actual_departure::text,updated_at FROM public.placements WHERE id=$1",
          [securedPlacement],
        )
      ).rows[0];
      assert.equal(activeSnapshot.planned_departure, "2027-02-01");
      await assert.rejects(
        db.query(
          "SELECT public.update_current_placement_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            securedPlacement,
            activeSnapshot.status,
            activeSnapshot.updated_at,
            "Arab Saudi",
            true,
            "LPK Tidak Sah",
            "Teknologi",
            "2027-03-01",
            activeSnapshot.actual_departure,
            "2026-01-02",
            null,
          ],
        ),
        /Historical planned departure cannot be changed/,
      );
      await db.query(
        "SELECT public.update_current_placement_details($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          securedPlacement,
          activeSnapshot.status,
          activeSnapshot.updated_at,
          "Arab Saudi",
          true,
          "LPK Aktif Diperbarui",
          "Teknologi",
          activeSnapshot.planned_departure,
          activeSnapshot.actual_departure,
          "2026-01-02",
          null,
        ],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT destination_country,placement_provider_name,planned_departure::text,actual_departure::text,employment_start::text,status FROM public.placements WHERE id=$1",
            [securedPlacement],
          )
        ).rows[0],
        {
          destination_country: "Arab Saudi",
          placement_provider_name: "LPK Aktif Diperbarui",
          planned_departure: "2027-02-01",
          actual_departure: "2026-01-01",
          employment_start: "2026-01-02",
          status: "aktif_bekerja",
        },
      );
    },
  );
  await check(
    "Dinas remains read-only for alumni and cannot invoke placement creation",
    async () => {
      for (const account of [1, 2]) {
        await as(account);
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM public.alumni"))
            .rows[0].n,
          3,
        );
        assert.equal(
          (
            await db.query(
              "UPDATE public.alumni SET full_name='Changed' RETURNING id",
            )
          ).rows.length,
          0,
        );
        await assert.rejects(register(alumni.id, second), /unavailable/);
      }
    },
  );
  await check(
    "admin profile updates audit the real actor; own demotion and inactive assignment denied",
    async () => {
      await as(1);
      await db.query(
        "UPDATE public.profiles SET full_name='Viewer Fiktif Baru' WHERE user_id=$1",
        [user(2)],
      );
      const audit = await db.query(
        "SELECT actor_id FROM public.audit_logs WHERE entity_type='profiles' AND action='UPDATE' AND entity_id=$1",
        [user(2)],
      );
      assert.equal(audit.rows[0].actor_id, user(1));
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET is_active=false WHERE user_id=$1",
          [user(1)],
        ),
        /own administrative/,
      );
      await db.query("UPDATE public.schools SET is_active=false WHERE id=$1", [
        user(12),
      ]);
      await assert.rejects(
        db.query("UPDATE public.profiles SET school_id=$1 WHERE user_id=$2", [
          user(12),
          user(3),
        ]),
        /active school/,
      );
    },
  );
  await check(
    "inactive staff and viewer cannot read admin audit logs",
    async () => {
      await as(4);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.alumni")).rows[0]
          .n,
        0,
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Fiktif',2020,'Teknik')",
        ),
      );
      await as(2);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.audit_logs"))
          .rows[0].n,
        0,
      );
    },
  );
  await check(
    "last active admin cannot be demoted, deactivated or deleted even by privileged SQL",
    async () => {
      await as(null);
      for (const sql of [
        "UPDATE public.profiles SET role='viewer_dinas' WHERE user_id=$1",
        "UPDATE public.profiles SET is_active=false WHERE user_id=$1",
        "DELETE FROM public.profiles WHERE user_id=$1",
      ])
        await assert.rejects(
          db.query(sql, [user(1)]),
          /one active Admin Dinas/,
        );
      await db.query(
        "UPDATE public.profiles SET role='admin_dinas' WHERE user_id=$1",
        [user(2)],
      );
      await assert.rejects(
        db.exec(
          "UPDATE public.profiles SET is_active=false WHERE role='admin_dinas'",
        ),
        /one active Admin Dinas/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.profiles WHERE role='admin_dinas' AND is_active",
          )
        ).rows[0].n,
        2,
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET role='viewer_dinas' WHERE user_id=$1",
        [user(2)],
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.profiles WHERE role='admin_dinas' AND is_active",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "invited profile insertion audits the administrator and duplicate recovery cannot overwrite it",
    async () => {
      await as(null);
      await db.query("INSERT INTO auth.users(id) VALUES ($1)", [user(5)]);
      await as(1);
      await db.query(
        "INSERT INTO public.profiles(user_id,full_name,role) VALUES ($1,'Undangan Fiktif','viewer_dinas')",
        [user(5)],
      );
      assert.equal(
        (
          await db.query(
            "SELECT actor_id FROM public.audit_logs WHERE entity_type='profiles' AND action='INSERT' AND entity_id=$1",
            [user(5)],
          )
        ).rows[0].actor_id,
        user(1),
      );
      await assert.rejects(
        db.query(
          "INSERT INTO public.profiles(user_id,full_name,role) VALUES ($1,'Percobaan Duplikat','admin_dinas')",
          [user(5)],
        ),
        /duplicate key/,
      );
      assert.equal(
        (
          await db.query("SELECT role FROM public.profiles WHERE user_id=$1", [
            user(5),
          ])
        ).rows[0].role,
        "viewer_dinas",
      );
    },
  );
  await check(
    "school provisioning is admin-only, unique per active school and RLS-gated until password replacement",
    async () => {
      await as(null);
      await db.query("INSERT INTO auth.users(id) VALUES ($1),($2),($3)", [
        user(6),
        user(7),
        user(8),
      ]);
      await db.query(
        `INSERT INTO public.schools(id,npsn,name,city) VALUES
        ($1,'00000013','SMK Fiktif C','Jakarta'),
        ($2,'00000014','SMK Fiktif D','Jakarta')`,
        [user(13), user(14)],
      );
      const privileges = (
        await db.query(`SELECT
          has_function_privilege('authenticated', 'public.provision_school_profile(uuid,text,uuid)', 'EXECUTE') AS authenticated_wrapper,
          has_function_privilege('authenticated', 'app_private.provision_school_profile(uuid,text,uuid)', 'EXECUTE') AS authenticated_internal,
          has_function_privilege('authenticated', 'public.complete_initial_password_change(uuid)', 'EXECUTE') AS authenticated_completion,
          has_function_privilege('service_role', 'public.complete_initial_password_change(uuid)', 'EXECUTE') AS service_completion`)
      ).rows[0];
      assert.deepEqual(privileges, {
        authenticated_wrapper: true,
        authenticated_internal: false,
        authenticated_completion: false,
        service_completion: true,
      });
      await asAnonymous();
      await assert.rejects(
        db.query(
          "SELECT public.provision_school_profile($1,'Petugas Anonim',$2)",
          [user(6), user(13)],
        ),
        /permission denied/,
      );
      await asAuthenticatedWithoutSession();
      await assert.rejects(
        db.query(
          "SELECT public.provision_school_profile($1,'Petugas Tanpa Sesi',$2)",
          [user(6), user(13)],
        ),
        /administrator required/,
      );
      await as(null);
      await db.exec(`CREATE OR REPLACE FUNCTION app_private.is_admin()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
        AS $$ SELECT NULL::boolean $$;`);
      await as(1);
      await assert.rejects(
        db.query(
          "SELECT public.provision_school_profile($1,'Petugas Helper Null',$2)",
          [user(6), user(13)],
        ),
        /administrator required/,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE public.profiles SET full_name='Ditolak' WHERE user_id=$1 RETURNING user_id",
            [user(2)],
          )
        ).rows.length,
        0,
      );
      await db.exec("RESET ROLE");
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET full_name='Ditolak' WHERE user_id=$1",
          [user(2)],
        ),
        /administrator required/,
      );
      await as(null);
      await db.exec(`CREATE OR REPLACE FUNCTION app_private.is_admin()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
          SELECT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.uid())
              AND p.is_active = true AND p.role = 'admin_dinas'
          );
        $$;`);
      await as(2);
      await assert.rejects(
        db.query(
          "SELECT public.provision_school_profile($1,'Petugas Tidak Sah',$2)",
          [user(6), user(13)],
        ),
        /administrator required/,
      );
      await as(3);
      await assert.rejects(
        db.query(
          "SELECT public.provision_school_profile($1,'Petugas Tidak Sah',$2)",
          [user(6), user(13)],
        ),
        /administrator required/,
      );
      await as(1);
      await assert.rejects(
        db.query(
          "SELECT app_private.provision_school_profile($1,'Jalur Privat',$2)",
          [user(6), user(13)],
        ),
        /permission denied/,
      );
      await db.query(
        "SELECT public.provision_school_profile($1,'Petugas Fiktif C',$2)",
        [user(6), user(13)],
      );
      await db.query(
        "SELECT public.provision_school_profile($1,'Petugas Fiktif D',$2)",
        [user(8), user(14)],
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.profiles WHERE school_id IN ($1,$2) AND role='petugas_sekolah' AND is_active",
            [user(13), user(14)],
          )
        ).rows[0].n,
        2,
      );
      const profile = (
        await db.query(
          "SELECT role,school_id,is_active,must_change_password FROM public.profiles WHERE user_id=$1",
          [user(6)],
        )
      ).rows[0];
      assert.deepEqual(profile, {
        role: "petugas_sekolah",
        school_id: user(13),
        is_active: true,
        must_change_password: true,
      });
      assert.equal(
        (
          await db.query(
            "SELECT actor_id FROM public.audit_logs WHERE entity_type='profiles' AND action='INSERT' AND entity_id=$1",
            [user(6)],
          )
        ).rows[0].actor_id,
        user(1),
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET full_name='Petugas Fiktif C Baru' WHERE user_id=$1",
        [user(6)],
      );
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET must_change_password=false WHERE user_id=$1",
          [user(6)],
        ),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET must_change_password=false WHERE user_id=$1",
          [user(6)],
        ),
        /permission denied|server-managed/,
      );
      await as(null);
      assert.deepEqual(
        (
          await db.query(
            "SELECT full_name,must_change_password FROM public.profiles WHERE user_id=$1",
            [user(6)],
          )
        ).rows[0],
        {
          full_name: "Petugas Fiktif C Baru",
          must_change_password: true,
        },
      );
      await assert.rejects(
        db.query(
          "INSERT INTO public.profiles(user_id,full_name,role,school_id) VALUES ($1,'Petugas Duplikat','petugas_sekolah',$2)",
          [user(7), user(13)],
        ),
        /duplicate key/,
      );
      await as(6);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.schools WHERE id=$1",
            [user(13)],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("SELECT app_private.current_school_id() AS id")).rows[0]
          .id,
        null,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Alumni Kredensial Sementara',2024,'Teknik')",
        ),
      );
      await db.query(
        "SELECT set_config('app.initial_password_change', 'verified', false)",
      );
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET must_change_password=false WHERE user_id=$1",
          [user(6)],
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT public.complete_initial_password_change($1)", [
          user(6),
        ]),
        /permission denied/,
      );
      await asServiceWithoutClaim();
      await assert.rejects(
        db.query("SELECT public.complete_initial_password_change($1)", [
          user(6),
        ]),
        /administration role required/,
      );
      await asService();
      await db.exec("RESET ROLE");
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET must_change_password=false WHERE user_id=$1",
          [user(6)],
        ),
        /server-managed/,
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.complete_initial_password_change($1) AS changed",
            [user(6)],
          )
        ).rows[0].changed,
        true,
      );
      assert.equal(
        (
          await db.query(
            "SELECT auth.uid() AS uid, nullif(current_setting('request.jwt.claim.sub',true),'') AS subject",
          )
        ).rows[0].uid,
        null,
      );
      assert.equal(
        (
          await db.query(
            "SELECT nullif(current_setting('request.jwt.claim.sub',true),'') AS subject",
          )
        ).rows[0].subject,
        null,
      );
      assert.equal(
        (
          await db.query(
            "SELECT public.complete_initial_password_change($1) AS changed",
            [user(2)],
          )
        ).rows[0].changed,
        false,
      );
      await as(6);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.schools WHERE id=$1",
            [user(13)],
          )
        ).rows[0].n,
        1,
      );
      const schoolCAlumni = (
        await db.query(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Alumni Sekolah C Fiktif',2024,'Teknik') RETURNING id,school_id",
        )
      ).rows[0];
      schoolCAlumniId = schoolCAlumni.id;
      assert.equal(schoolCAlumni.school_id, user(13));
      assert.equal(
        (
          await db.query(
            "UPDATE public.alumni SET major='Teknik Fiktif Baru' WHERE id=$1 RETURNING id",
            [schoolCAlumniId],
          )
        ).rows.length,
        1,
      );
      await as(null);
      assert.equal(
        (
          await db.query(
            "SELECT must_change_password FROM public.profiles WHERE user_id=$1",
            [user(6)],
          )
        ).rows[0].must_change_password,
        false,
      );
      assert.equal(
        (
          await db.query(
            "SELECT actor_id FROM public.audit_logs WHERE entity_type='profiles' AND action='UPDATE' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 1",
            [user(6)],
          )
        ).rows[0].actor_id,
        user(6),
      );
    },
  );
  await check(
    "school password reissue is admin-only, relationship-bound, audited and serialized",
    async () => {
      const firstRequest = user(91);
      const secondRequest = user(92);
      const privileges = (
        await db.query(`SELECT
          has_function_privilege('authenticated', 'public.begin_school_password_reissue(uuid,uuid)', 'EXECUTE') AS authenticated_begin,
          has_function_privilege('authenticated', 'app_private.begin_school_password_reissue(uuid,uuid)', 'EXECUTE') AS authenticated_internal,
          has_function_privilege('anon', 'public.begin_school_password_reissue(uuid,uuid)', 'EXECUTE') AS anonymous_begin`)
      ).rows[0];
      assert.deepEqual(privileges, {
        authenticated_begin: true,
        authenticated_internal: false,
        anonymous_begin: false,
      });

      await asAnonymous();
      await assert.rejects(
        db.query("SELECT public.begin_school_password_reissue($1,$2)", [
          user(13),
          firstRequest,
        ]),
        /permission denied/,
      );
      await as(2);
      await assert.rejects(
        db.query("SELECT public.begin_school_password_reissue($1,$2)", [
          user(13),
          firstRequest,
        ]),
        /administrator required/,
      );
      await as(3);
      await assert.rejects(
        db.query("SELECT public.begin_school_password_reissue($1,$2)", [
          user(13),
          firstRequest,
        ]),
        /administrator required/,
      );

      await as(1);
      const target = (
        await db.query(
          "SELECT public.begin_school_password_reissue($1,$2) AS user_id",
          [user(13), firstRequest],
        )
      ).rows[0].user_id;
      assert.equal(target, user(6));
      assert.equal(
        (
          await db.query(
            "SELECT must_change_password FROM public.profiles WHERE user_id=$1",
            [user(6)],
          )
        ).rows[0].must_change_password,
        true,
      );
      assert.equal(
        (
          await db.query(
            "SELECT actor_id FROM public.audit_logs WHERE entity_type='profiles' AND action='UPDATE' AND entity_id=$1 ORDER BY occurred_at DESC LIMIT 1",
            [user(6)],
          )
        ).rows[0].actor_id,
        user(1),
      );
      await as(6);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.schools WHERE id=$1",
            [user(13)],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.alumni WHERE id=$1",
            [schoolCAlumniId],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE public.alumni SET major='Perubahan Ditolak' WHERE id=$1 RETURNING id",
            [schoolCAlumniId],
          )
        ).rows.length,
        0,
      );
      await as(1);
      await assert.rejects(
        db.query("SELECT public.begin_school_password_reissue($1,$2)", [
          user(13),
          secondRequest,
        ]),
        /already in progress/,
      );
      await assert.rejects(
        db.query(
          "UPDATE public.profiles SET must_change_password=false WHERE user_id=$1",
          [user(6)],
        ),
        /permission denied|server-managed/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT public.finish_school_password_reissue($1) AS finished",
            [firstRequest],
          )
        ).rows[0].finished,
        true,
      );
      await db.exec("RESET ROLE");
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM app_private.school_password_reissues",
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check(
    "profile reassignment, role changes and deactivation affect RLS without a new JWT",
    async () => {
      await as(1);
      await db.query("UPDATE public.schools SET is_active=true WHERE id=$1", [
        user(12),
      ]);
      await db.query(
        "UPDATE public.profiles SET is_active=false WHERE user_id=$1",
        [user(4)],
      );
      await db.query(
        "UPDATE public.profiles SET school_id=$1 WHERE user_id=$2",
        [user(12), user(3)],
      );
      await as(3);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.alumni")).rows[0]
          .n,
        0,
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET role='viewer_dinas', school_id=NULL WHERE user_id=$1",
        [user(3)],
      );
      await as(3);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.alumni")).rows[0]
          .n,
        4,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE public.alumni SET full_name='Tidak diizinkan' RETURNING id",
          )
        ).rows.length,
        0,
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET is_active=false WHERE user_id=$1",
        [user(3)],
      );
      await as(3);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM public.alumni")).rows[0]
          .n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE public.profiles SET role='admin_dinas' WHERE user_id=$1 RETURNING user_id",
            [user(3)],
          )
        ).rows.length,
        0,
      );
    },
  );
  await check(
    "native activation is service-only, email-verified, password-complete and isolated by school",
    async () => {
      await as(null);
      await db.exec(`INSERT INTO public.schools(id,npsn,name,city) VALUES
      ('${user(15)}','00000015','SMK Aktivasi Fiktif','Jakarta'),
      ('${user(16)}','00000016','SMK Kedaluwarsa Fiktif','Jakarta');
      INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at) VALUES
      ('${user(9)}','activation@example.test','',NULL),
      ('${user(10)}','expired@example.test','',NULL);`);
      for (const role of [
        asAnonymous,
        asAuthenticatedWithoutSession,
        () => as(1),
        () => as(2),
        () => as(4),
      ]) {
        await role();
        await assert.rejects(
          db.query(
            "SELECT public.school_activation_request('00000015','activation@example.test')",
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT public.school_activation_bind($1,$2,$3)", [
            user(98),
            user(97),
            user(9),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT public.school_activation_cancel($1,$2)", [
            user(98),
            user(97),
          ]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT public.complete_school_activation($1,$2)", [
            user(9),
            user(99),
          ]),
          /permission denied/,
        );
      }
      await asService();
      const lookup = (
        await db.query("SELECT public.school_auth_lookup('00000015') AS value")
      ).rows[0].value;
      assert.equal(lookup.name, "SMK Aktivasi Fiktif");
      assert.equal(lookup.npsn, "00000015");
      assert.equal(lookup.status, "UNCLAIMED");
      assert.equal("email" in lookup, false);
      assert.equal("user_id" in lookup, false);
      await assert.rejects(
        db.query(
          "SELECT public.school_activation_request('00000015','activation@example.test',299)",
        ),
        /Invalid activation expiry/,
      );
      let requested = (
        await db.query(
          "SELECT public.school_activation_request('00000015','activation@example.test',3600) AS value",
        )
      ).rows[0].value;
      assert.equal(requested.user_id, user(9));
      assert.ok(requested.operation_id);
      await as(null);
      assert.deepEqual(
        (
          await db.query(
            "SELECT status,last_sent_at,activation_expires_at FROM app_private.school_auth_accounts WHERE school_id=$1",
            [user(15)],
          )
        ).rows[0],
        {
          status: "UNCLAIMED",
          last_sent_at: null,
          activation_expires_at: null,
        },
      );
      await asService();
      await assert.rejects(
        db.query(
          "SELECT public.school_activation_request('00000015','other@example.test')",
        ),
        /request in progress/,
      );
      assert.equal(
        (
          await db.query("SELECT public.school_activation_bind($1,$2)", [
            requested.request_id,
            user(9),
          ])
        ).rows[0].school_activation_bind,
        true,
      );
      await as(null);
      const accepted = (
        await db.query(
          "SELECT activation_expires_at,activation_requested_at,activation_password_fingerprint,last_sent_at,operation_id FROM app_private.school_auth_accounts WHERE school_id=$1",
          [user(15)],
        )
      ).rows[0];
      assert.equal(accepted.operation_id, null);
      assert.ok(accepted.last_sent_at);
      assert.match(accepted.activation_password_fingerprint, /^[a-f0-9]{32}$/);
      const acceptedTtl =
        (new Date(accepted.activation_expires_at) -
          new Date(accepted.activation_requested_at)) /
        1000;
      assert.ok(acceptedTtl >= 3599 && acceptedTtl <= 3601);
      await asService();
      const initialRetry = (
        await db.query("SELECT public.school_auth_lookup('00000015') AS value")
      ).rows[0].value.retry_after;
      assert.ok(initialRetry > 0 && initialRetry <= 60);
      const otherSchoolLookup = (
        await db.query("SELECT public.school_auth_lookup('00000016') AS value")
      ).rows[0].value;
      assert.equal(otherSchoolLookup.npsn, "00000016");
      assert.equal(otherSchoolLookup.retry_after, 0);
      const otherSchoolRequest = (
        await db.query(
          "SELECT public.school_activation_request('00000016','expired@example.test',3600) AS value",
        )
      ).rows[0].value;
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_cancel($1,$2) AS value",
            [otherSchoolRequest.request_id, otherSchoolRequest.operation_id],
          )
        ).rows[0].value,
        true,
      );
      await assert.rejects(
        db.query("SELECT public.school_activation_request('00000015')"),
        /wait before resending/,
      );
      await as(null);
      await db.query(
        "UPDATE app_private.school_auth_accounts SET last_sent_at=now()-interval '45 seconds' WHERE school_id=$1",
        [user(15)],
      );
      await asService();
      const prematureRetry = (
        await db.query("SELECT public.school_auth_lookup('00000015') AS value")
      ).rows[0].value.retry_after;
      assert.ok(prematureRetry >= 14 && prematureRetry <= 15);
      await assert.rejects(
        db.query("SELECT public.school_activation_request('00000015')"),
        /wait before resending/,
      );
      await as(null);
      await db.query(
        "UPDATE app_private.school_auth_accounts SET last_sent_at=now()-interval '61 seconds' WHERE school_id=$1",
        [user(15)],
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000015') AS value",
          )
        ).rows[0].value.retry_after,
        0,
      );
      const resend = (
        await db.query(
          "SELECT public.school_activation_request('00000015') AS value",
        )
      ).rows[0].value;
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_cancel($1,$2) AS value",
            [resend.request_id, resend.operation_id],
          )
        ).rows[0].value,
        true,
      );
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000015') AS value",
          )
        ).rows[0].value.status,
        "PENDING_ACTIVATION",
      );
      await as(null);
      const afterFailedResend = (
        await db.query(
          "SELECT user_id,activation_request_id,activation_expires_at,activation_password_fingerprint,operation_id FROM app_private.school_auth_accounts WHERE school_id=$1",
          [user(15)],
        )
      ).rows[0];
      assert.equal(afterFailedResend.user_id, user(9));
      assert.equal(
        afterFailedResend.activation_request_id,
        requested.request_id,
      );
      assert.equal(
        new Date(afterFailedResend.activation_expires_at).getTime(),
        new Date(accepted.activation_expires_at).getTime(),
      );
      assert.equal(
        afterFailedResend.activation_password_fingerprint,
        accepted.activation_password_fingerprint,
      );
      assert.equal(afterFailedResend.operation_id, null);
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_context($1) AS value",
            [user(9)],
          )
        ).rows[0].value,
        null,
      );
      await assert.rejects(
        db.query("SELECT public.complete_school_activation($1,$2)", [
          user(9),
          requested.request_id,
        ]),
        /Verified email and Auth password required/,
      );
      await as(null);
      await db.query(
        "UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1",
        [user(9)],
      );
      // A pre-existing matching profile must not bypass the pending lifecycle.
      await db.query(
        "INSERT INTO public.profiles(user_id,full_name,role,school_id) VALUES ($1,'Petugas Aktivasi Fiktif','petugas_sekolah',$2)",
        [user(9), user(15)],
      );
      const seeded = (
        await db.query(
          "INSERT INTO public.alumni(school_id,full_name,graduation_year,major) VALUES ($1,'Alumni Aktivasi Fiktif',2024,'Teknik') RETURNING id",
          [user(15)],
        )
      ).rows[0].id;
      await as(9);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.profiles WHERE user_id=$1",
            [user(9)],
          )
        ).rows[0].n,
        1,
      );
      for (const table of [
        "schools",
        "alumni",
        "placements",
        "status_histories",
      ])
        assert.equal(
          (await db.query(`SELECT count(*)::int AS n FROM public.${table}`))
            .rows[0].n,
          0,
        );
      assert.equal(
        (
          await db.query(
            "UPDATE public.alumni SET major='Rejected' WHERE id=$1 RETURNING id",
            [seeded],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(register(seeded, null), /unavailable/);
      await assert.rejects(
        db.query(
          "INSERT INTO public.alumni(full_name,graduation_year,major) VALUES ('Rejected',2024,'Teknik')",
        ),
        /akses sekolah aktif/,
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_context($1) AS value",
            [user(9)],
          )
        ).rows[0].value.npsn,
        "00000015",
      );
      const previousRequest = requested.request_id;
      await as(null);
      await db.query(
        "UPDATE app_private.school_auth_accounts SET activation_expires_at=now()-interval '1 minute',last_sent_at=now()-interval '2 minutes' WHERE school_id=$1",
        [user(15)],
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000015') AS value",
          )
        ).rows[0].value.status,
        "PENDING_ACTIVATION",
      );
      await assert.rejects(
        db.query(
          "SELECT public.school_activation_request('00000015','substitute@example.test')",
        ),
        /Pending email cannot be changed/,
      );
      requested = (
        await db.query(
          "SELECT public.school_activation_request('00000015') AS value",
        )
      ).rows[0].value;
      assert.notEqual(requested.request_id, previousRequest);
      assert.equal(requested.email, "activation@example.test");
      await assert.rejects(
        db.query("SELECT public.complete_school_activation($1,$2)", [
          user(9),
          previousRequest,
        ]),
        /Activation unavailable/,
      );
      await db.query("SELECT public.school_activation_bind($1,$2,$3)", [
        requested.request_id,
        requested.operation_id,
        user(9),
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_context($1) AS value",
            [user(9)],
          )
        ).rows[0].value.request_id,
        requested.request_id,
      );
      await assert.rejects(
        db.query("SELECT public.complete_school_activation($1,$2)", [
          user(9),
          requested.request_id,
        ]),
        /Verified email and Auth password required/,
      );
      // Auth is simulated here; only Supabase Auth updates this column in deployment.
      await as(null);
      await db.query(
        "UPDATE auth.users SET encrypted_password='fictional-new-auth-hash' WHERE id=$1",
        [user(9)],
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.complete_school_activation($1,$2) AS completed",
            [user(9), requested.request_id],
          )
        ).rows[0].completed,
        true,
      );
      await as(null);
      assert.equal(
        (
          await db.query(
            "SELECT activation_password_fingerprint FROM app_private.school_auth_accounts WHERE school_id=$1",
            [user(15)],
          )
        ).rows[0].activation_password_fingerprint,
        null,
      );
      const activationAuditCount = (
        await db.query(
          "SELECT count(*)::int AS n FROM public.audit_logs WHERE actor_id=$1 AND entity_id=$2",
          [user(9), user(15)],
        )
      ).rows[0].n;
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.complete_school_activation($1,$2) AS completed",
            [user(9), requested.request_id],
          )
        ).rows[0].completed,
        true,
      );
      await as(null);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.audit_logs WHERE actor_id=$1 AND entity_id=$2",
            [user(9), user(15)],
          )
        ).rows[0].n,
        activationAuditCount,
      );
      await as(9);
      assert.deepEqual((await db.query("SELECT id FROM public.schools")).rows, [
        { id: user(15) },
      ]);
      assert.deepEqual((await db.query("SELECT id FROM public.alumni")).rows, [
        { id: seeded },
      ]);
      const placement = await register(seeded, null);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.status_histories",
          )
        ).rows[0].n,
        1,
      );
      await db.query(
        "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja',NULL,'2020-01-01')",
        [placement],
      );
      await as(4);
      assert.equal(
        (await db.query("SELECT id FROM public.alumni WHERE id=$1", [seeded]))
          .rows.length,
        0,
      );
      await assert.rejects(register(seeded, null), /unavailable/);
      for (const account of [1, 2]) {
        await as(account);
        assert.equal(
          (await db.query("SELECT id FROM public.alumni WHERE id=$1", [seeded]))
            .rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "UPDATE public.alumni SET major='Rejected' WHERE id=$1 RETURNING id",
              [seeded],
            )
          ).rows.length,
          0,
        );
      }
      await asService();
      await assert.rejects(
        db.query(
          "SELECT public.school_activation_request('00000015','new@example.test')",
        ),
        /Activation unavailable/,
      );
      await as(null);
      await db.query(
        "UPDATE app_private.school_auth_accounts SET last_sent_at=now()-interval '2 minutes' WHERE school_id=$1",
        [user(15)],
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_recovery_request('00000015') AS value",
          )
        ).rows[0].value.email,
        "activation@example.test",
      );
      await assert.rejects(
        db.query("SELECT public.school_recovery_request('00000015')"),
        /wait before resending/,
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET is_active=false WHERE user_id=$1",
        [user(9)],
      );
      await as(9);
      assert.equal(
        (await db.query("SELECT id FROM public.alumni WHERE id=$1", [seeded]))
          .rows.length,
        0,
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000015') AS value",
          )
        ).rows[0].value.status,
        "SUSPENDED",
      );
      assert.equal(
        (
          await db.query(
            "SELECT public.school_recovery_request('00000015') AS value",
          )
        ).rows[0].value,
        null,
      );
      await as(1);
      await db.query(
        "UPDATE public.profiles SET is_active=true WHERE user_id=$1",
        [user(9)],
      );
      await as(9);
      assert.equal(
        (await db.query("SELECT id FROM public.alumni WHERE id=$1", [seeded]))
          .rows.length,
        1,
      );

      await asService();
      let expired = (
        await db.query(
          "SELECT public.school_activation_request('00000016','expired@example.test') AS value",
        )
      ).rows[0].value;
      assert.equal(
        (
          await db.query(
            "SELECT public.school_activation_cancel($1,$2) AS value",
            [expired.request_id, expired.operation_id],
          )
        ).rows[0].value,
        true,
      );
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000016') AS value",
          )
        ).rows[0].value.status,
        "UNCLAIMED",
      );
      await as(null);
      const cancelled = (
        await db.query(
          "SELECT email,user_id,activation_request_id,activation_password_fingerprint,last_sent_at FROM app_private.school_auth_accounts WHERE school_id=$1",
          [user(16)],
        )
      ).rows[0];
      assert.deepEqual(cancelled, {
        email: null,
        user_id: null,
        activation_request_id: null,
        activation_password_fingerprint: null,
        last_sent_at: null,
      });
      await asService();
      expired = (
        await db.query(
          "SELECT public.school_activation_request('00000016','expired@example.test') AS value",
        )
      ).rows[0].value;
      await db.query("SELECT public.school_activation_bind($1,$2,$3)", [
        expired.request_id,
        expired.operation_id,
        user(10),
      ]);
      await as(null);
      await db.query(
        "UPDATE app_private.school_auth_accounts SET activation_expires_at=now()-interval '1 minute',last_sent_at=now()-interval '2 minutes' WHERE school_id=$1",
        [user(16)],
      );
      await asService();
      assert.equal(
        (
          await db.query(
            "SELECT public.school_auth_lookup('00000016') AS value",
          )
        ).rows[0].value.status,
        "UNCLAIMED",
      );
      const retry = (
        await db.query(
          "SELECT public.school_activation_request('00000016','corrected@example.test') AS value",
        )
      ).rows[0].value;
      assert.notEqual(expired.request_id, retry.request_id);
      await assert.rejects(
        db.query("SELECT public.complete_school_activation($1,$2)", [
          user(10),
          expired.request_id,
        ]),
        /Activation unavailable/,
      );
      await assert.rejects(
        db.query("SELECT public.school_activation_bind($1,$2,$3)", [
          retry.request_id,
          retry.operation_id,
          user(10),
        ]),
        /identity mismatch/,
      );
      await as(null);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM auth.users WHERE id=$1",
            [user(10)],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.profiles WHERE user_id=$1",
            [user(9)],
          )
        ).rows[0].n,
        1,
      );
      // Complete a fresh invitation with no pre-existing application profile.
      await db.query(
        "INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at) VALUES ($1,'corrected@example.test','fictional-auth-hash',now())",
        [user(11)],
      );
      await asService();
      await db.query("SELECT public.school_activation_bind($1,$2,$3)", [
        retry.request_id,
        retry.operation_id,
        user(11),
      ]);
      await assert.rejects(
        db.query("SELECT public.complete_school_activation($1,$2)", [
          user(11),
          retry.request_id,
        ]),
        /Password update for this activation is required/,
      );
      await as(null);
      await db.query(
        "UPDATE auth.users SET encrypted_password='fictional-replaced-auth-hash' WHERE id=$1",
        [user(11)],
      );
      await asService();
      await db.query("SELECT public.complete_school_activation($1,$2)", [
        user(11),
        retry.request_id,
      ]);
      await as(null);
      assert.deepEqual(
        (
          await db.query(
            "SELECT school_id,role,is_active,must_change_password FROM public.profiles WHERE user_id=$1",
            [user(11)],
          )
        ).rows,
        [
          {
            school_id: user(16),
            role: "petugas_sekolah",
            is_active: true,
            must_change_password: false,
          },
        ],
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM public.audit_logs WHERE actor_id=$1 AND entity_id=$2",
            [user(11), user(16)],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  console.log(
    `Completed ${assertions} SQL/RLS scenario groups. This is not a hosted Supabase or multi-connection concurrency test.`,
  );
} finally {
  await db.close();
}
