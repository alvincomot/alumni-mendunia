import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";

const directory = path.dirname(fileURLToPath(import.meta.url));
const roles = ["petugas_sekolah", "admin_dinas", "viewer_dinas"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const exampleFixtureIds = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
]);

function fail(message) {
  throw new Error(message);
}

function roleSuffix(role) {
  return role.toUpperCase();
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} wajib diisi.`);
  return value;
}

function origin(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} harus berupa origin HTTP(S) yang valid.`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    fail(`${name} harus berupa origin HTTP(S) tanpa path atau kredensial.`);
  return parsed.origin;
}

function isLocal(value) {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function validateSafety(baseUrl, supabaseUrl) {
  if (process.env.K6_CONFIRM_ISOLATED_TARGET !== "true")
    fail("K6_CONFIRM_ISOLATED_TARGET=true wajib diberikan sebelum membuat sesi uji.");
  if (process.env.K6_CONFIRM_FIXTURES_ARE_FICTITIOUS !== "true")
    fail("K6_CONFIRM_FIXTURES_ARE_FICTITIOUS=true wajib diberikan untuk fixture uji.");

  const environment = requiredEnvironment("K6_ENVIRONMENT_NAME");
  if (!isLocal(baseUrl) || !isLocal(supabaseUrl)) {
    if (
      environment !== "isolated-staging" ||
      process.env.K6_ALLOW_REMOTE_TARGET !== "true"
    )
      fail(
        "Target non-local hanya diizinkan untuk K6_ENVIRONMENT_NAME=isolated-staging dengan K6_ALLOW_REMOTE_TARGET=true.",
      );
  } else if (environment !== "local") {
    fail("Target lokal harus menggunakan K6_ENVIRONMENT_NAME=local.");
  }
  if (new URL(baseUrl).hostname.endsWith("vercel.app"))
    fail("Pembuatan sesi uji pada deployment Vercel diblokir.");
  return environment;
}

function configuredFixtureId(role, fixture) {
  const name = `K6_TEST_${fixture.toUpperCase()}_ID_${roleSuffix(role)}`;
  const value = process.env[name]?.trim();
  if (!value || exampleFixtureIds.has(value)) return null;
  if (!uuidPattern.test(value)) fail(`${name} harus berupa UUID valid.`);
  return value;
}

async function verifySupabaseEndpoint(supabaseUrl, publishableKey) {
  if (publishableKey.startsWith("replace-with-"))
    fail("K6_SUPABASE_PUBLISHABLE_KEY masih placeholder dan harus diganti.");
  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    fail(
      "Supabase uji tidak dapat dijangkau. Pastikan URL benar dan layanan lokal atau staging terisolasi aktif.",
    );
  }
  if (!response.ok)
    fail("Endpoint Auth Supabase uji menolak konfigurasi publishable key.");
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function createAuthenticatedContext({ role, supabaseUrl, publishableKey }) {
  const cookieJar = new Map();
  const client = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          if (cookie.value) cookieJar.set(cookie.name, cookie.value);
          else cookieJar.delete(cookie.name);
        }
      },
    },
  });
  const suffix = roleSuffix(role);
  const email = requiredEnvironment(`K6_TEST_EMAIL_${suffix}`);
  const password = requiredEnvironment(`K6_TEST_PASSWORD_${suffix}`);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user)
    fail(`Login akun uji ${role} gagal. Periksa kredensial dan lingkungan Supabase.`);

  const user = await client.auth.getUser();
  if (user.error || !user.data.user || user.data.user.id !== signIn.data.user.id)
    fail(`Sesi Supabase ${role} tidak dapat diverifikasi melalui getUser().`);

  const profile = await client
    .from("profiles")
    .select("full_name, role, school_id, is_active")
    .eq("user_id", user.data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data)
    fail(`Profil akun uji ${role} tidak dapat dibaca melalui RLS.`);
  if (profile.data.role !== role || profile.data.is_active !== true)
    fail(`Profil akun uji tidak cocok dengan role aktif ${role}.`);

  let school = null;
  if (role === "petugas_sekolah") {
    if (typeof profile.data.school_id !== "string")
      fail("Akun petugas_sekolah tidak memiliki school_id.");
    const schoolResult = await client
      .from("schools")
      .select("id, npsn, name, is_active")
      .eq("id", profile.data.school_id)
      .maybeSingle();
    if (schoolResult.error || !schoolResult.data || schoolResult.data.is_active !== true)
      fail("Sekolah akun petugas tidak aktif atau tidak dapat dibaca.");
    const expectedNpsn = requiredEnvironment("K6_TEST_NPSN_PETUGAS_SEKOLAH");
    if (!/^\d{8}$/u.test(expectedNpsn))
      fail("K6_TEST_NPSN_PETUGAS_SEKOLAH harus terdiri dari tepat 8 digit.");
    if (schoolResult.data.npsn !== expectedNpsn)
      fail("NPSN akun petugas tidak cocok dengan K6_TEST_NPSN_PETUGAS_SEKOLAH.");
    school = schoolResult.data;
  }

  return {
    client,
    cookieJar,
    profile: profile.data,
    school,
    userId: user.data.user.id,
  };
}

async function resolveReadableFixture(context, table, role, preferredId) {
  let query = context.client
    .from(table)
    .select("id, school_id")
    .order("id")
    .limit(1);
  if (preferredId) query = query.eq("id", preferredId);
  const result = await query;
  const record = result.data?.[0] ?? null;
  if (result.error || !record)
    fail(
      `Tidak ada fixture fiktif ${table} yang dapat dibaca oleh ${role} melalui RLS.`,
    );
  if (
    role === "petugas_sekolah" &&
    record.school_id !== context.profile.school_id
  )
    fail(`Fixture ${table} petugas tidak berasal dari sekolah akun uji.`);
  return record;
}

async function resolveForeignAlumniFixture(context, schoolId, preferredId) {
  let query = context.client
    .from("alumni")
    .select("id, school_id")
    .neq("school_id", schoolId)
    .order("id")
    .limit(1);
  if (preferredId) query = query.eq("id", preferredId);
  const result = await query;
  const record = result.data?.[0] ?? null;
  if (result.error || !record)
    fail(
      "Tidak ada alumni fiktif dari sekolah lain yang dapat dibaca admin_dinas.",
    );
  return record;
}

async function verifyApplicationSession(baseUrl, cookie, role) {
  const response = await fetch(`${baseUrl}/dashboard`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookie,
      "User-Agent": "alumni-mendunia-k6-session-bootstrap/1.0",
    },
    redirect: "manual",
  });
  const location = response.headers.get("location") || "";
  const body = await response.text();
  if (
    response.status !== 200 ||
    location.includes("/auth/login") ||
    !body.includes("Keluar") ||
    body.includes("Masuk ke sistem")
  )
    fail(`Cookie SSR ${role} tidak memuat shell dashboard terautentikasi.`);
}

async function main() {
  const baseUrl = origin("K6_BASE_URL", "http://127.0.0.1:3000");
  const supabaseUrl = origin("K6_SUPABASE_URL");
  const environment = validateSafety(baseUrl, supabaseUrl);
  const publishableKey = requiredEnvironment("K6_SUPABASE_PUBLISHABLE_KEY");
  await verifySupabaseEndpoint(supabaseUrl, publishableKey);
  const sessionCount = Number(process.env.K6_SESSION_COUNT || "1");
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 5)
    fail("K6_SESSION_COUNT harus bilangan bulat antara 1 dan 5.");

  const contexts = {};
  const fixtures = { alumni: {}, murid: {}, foreignAlumni: {} };
  for (const role of roles) {
    const context = await createAuthenticatedContext({
      role,
      supabaseUrl,
      publishableKey,
    });
    const alumni = await resolveReadableFixture(
      context,
      "alumni",
      role,
      configuredFixtureId(role, "alumni"),
    );
    const murid = await resolveReadableFixture(
      context,
      "active_students",
      role,
      configuredFixtureId(role, "murid"),
    );
    contexts[role] = context;
    fixtures.alumni[role] = alumni.id;
    fixtures.murid[role] = murid.id;
  }
  if (new Set(roles.map((role) => contexts[role].userId)).size !== roles.length)
    fail("Setiap role harus menggunakan akun uji Supabase yang berbeda.");

  const foreignRecord = await resolveForeignAlumniFixture(
    contexts.admin_dinas,
    contexts.petugas_sekolah.profile.school_id,
    configuredFixtureId("petugas_sekolah", "foreign_alumni"),
  );
  const petugasForeign = await contexts.petugas_sekolah.client
    .from("alumni")
    .select("id")
    .eq("id", foreignRecord.id)
    .maybeSingle();
  if (petugasForeign.error || petugasForeign.data)
    fail("RLS petugas tidak menolak fixture alumni lintas sekolah seperti yang diharapkan.");
  fixtures.foreignAlumni.petugas_sekolah = foreignRecord.id;

  const sessionRoles = {};
  for (const role of roles) {
    const cookies = [];
    for (let index = 0; index < sessionCount; index += 1) {
      const context =
        index === 0
          ? contexts[role]
          : await createAuthenticatedContext({ role, supabaseUrl, publishableKey });
      const cookie = cookieHeader(context.cookieJar);
      if (!cookie) fail(`Supabase tidak menghasilkan cookie SSR untuk ${role}.`);
      await verifyApplicationSession(baseUrl, cookie, role);
      cookies.push(cookie);
    }
    if (new Set(cookies).size !== cookies.length)
      fail(`Supabase menghasilkan sesi duplikat untuk ${role}.`);
    sessionRoles[role] = { cookies };
  }

  const outputPath = path.resolve(
    directory,
    process.env.K6_SESSION_FILE || ".sessions.local.json",
  );
  if (!outputPath.startsWith(`${directory}${path.sep}`))
    fail("K6_SESSION_FILE harus berada di dalam tests/performance/.");
  const payload = {
    schemaVersion: 1,
    environment,
    baseUrl,
    supabaseOrigin: supabaseUrl,
    createdAt: new Date().toISOString(),
    roles: sessionRoles,
    fixtures,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(
    `Sesi SSR tervalidasi untuk ${roles.length} role dan ${sessionCount} sesi per role.`,
  );
  console.log("Cookie disimpan pada file lokal yang diabaikan Git dan tidak ditampilkan.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Pembuatan sesi uji gagal.");
  process.exitCode = 1;
});
