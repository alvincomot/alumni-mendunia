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
async function check(title, fn) {
  await fn();
  assertions++;
  console.log(`PASS ${title}`);
}
async function as(number) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [
    number ? user(number) : "",
  ]);
  if (number) await db.exec("SET ROLE authenticated");
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
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  for (const filename of [
    "20261021000100_initial_schema.sql",
    "20261023000100_guard_placement_registration.sql",
    "20261023000200_guard_profile_administration.sql",
    "20261023000300_guard_last_active_admin.sql",
  ]) {
    // PGlite does not package pgcrypto; core PostgreSQL gen_random_uuid() is sufficient here.
    const sql = fs
      .readFileSync(path.join(root, "supabase/migrations", filename), "utf8")
      .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await db.exec(sql);
  }
  console.log(
    "PASS all migration SQL executes in isolated PostgreSQL (pgcrypto declaration omitted)",
  );
  await db.exec(`INSERT INTO auth.users VALUES ('${user(1)}'),('${user(2)}'),('${user(3)}'),('${user(4)}');
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
          "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja')",
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
        "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja','Catatan fiktif')",
        [first],
      );
      await assert.rejects(
        db.query(
          "SELECT public.change_placement_status($1,'persiapan_berangkat','aktif_bekerja')",
          [first],
        ),
        /Status berubah/,
      );
      await db.query(
        "SELECT public.change_placement_status($1,'aktif_bekerja','selesai_kontrak')",
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
    "Dinas remains read-only for alumni and cannot invoke placement creation",
    async () => {
      for (const account of [1, 2]) {
        await as(account);
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM public.alumni"))
            .rows[0].n,
          1,
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
    "profile reassignment, role changes and deactivation affect RLS without a new JWT",
    async () => {
      await as(1);
      await db.query("UPDATE public.schools SET is_active=true WHERE id=$1", [
        user(12),
      ]);
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
        1,
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
  console.log(
    `Completed ${assertions} SQL/RLS scenario groups. This is not a hosted Supabase or multi-connection concurrency test.`,
  );
} finally {
  await db.close();
}
