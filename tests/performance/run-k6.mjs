import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const roles = ["petugas_sekolah", "admin_dinas", "viewer_dinas"];
const mode = process.argv[2] || "smoke";

if (!["smoke", "spike", "report"].includes(mode)) {
  console.error("Mode harus smoke, spike, atau report.");
  process.exit(1);
}

const environment = { ...process.env, PERF_MODE: mode };
const sessionPath = path.resolve(
  directory,
  process.env.K6_SESSION_FILE || ".sessions.local.json",
);
if (!sessionPath.startsWith(`${directory}${path.sep}`))
  throw new Error("K6_SESSION_FILE harus berada di dalam tests/performance/.");

if (fs.existsSync(sessionPath)) {
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  if (session.schemaVersion !== 1 || !session.roles || !session.fixtures)
    throw new Error("Format file sesi k6 tidak dikenali.");
  const configuredBaseUrl = process.env.K6_BASE_URL?.replace(/\/$/u, "");
  if (configuredBaseUrl && configuredBaseUrl !== session.baseUrl)
    throw new Error("K6_BASE_URL tidak cocok dengan target pembuat sesi.");
  const maximumAgeMinutes = Number(process.env.K6_SESSION_MAX_AGE_MINUTES || "45");
  const age = Date.now() - Date.parse(session.createdAt);
  if (
    !Number.isFinite(maximumAgeMinutes) ||
    maximumAgeMinutes <= 0 ||
    !Number.isFinite(age) ||
    age > maximumAgeMinutes * 60_000
  )
    throw new Error("File sesi k6 sudah kedaluwarsa. Jalankan npm run perf:sessions kembali.");

  environment.K6_BASE_URL = session.baseUrl;
  environment.K6_CONFIRM_TEST_SESSIONS = "true";
  for (const role of roles) {
    const suffix = role.toUpperCase();
    const cookies = session.roles[role]?.cookies;
    if (!Array.isArray(cookies) || cookies.some((value) => typeof value !== "string"))
      throw new Error(`Sesi ${role} tidak lengkap.`);
    environment[`K6_SESSION_COOKIES_${suffix}`] = JSON.stringify(cookies);
    environment[`K6_ALUMNI_ID_${suffix}`] = session.fixtures.alumni?.[role] || "";
    environment[`K6_MURID_ID_${suffix}`] = session.fixtures.murid?.[role] || "";
  }
  environment.K6_FOREIGN_ALUMNI_ID_PETUGAS_SEKOLAH =
    session.fixtures.foreignAlumni?.petugas_sekolah || "";
  console.log("Menggunakan sesi Supabase SSR lokal yang telah diverifikasi.");
} else {
  environment.K6_CONFIRM_TEST_SESSIONS = "false";
  for (const role of roles) {
    const suffix = role.toUpperCase();
    delete environment[`K6_SESSION_COOKIE_${suffix}`];
    delete environment[`K6_SESSION_COOKIES_${suffix}`];
    delete environment[`K6_ALUMNI_ID_${suffix}`];
    delete environment[`K6_MURID_ID_${suffix}`];
  }
  delete environment.K6_FOREIGN_ALUMNI_ID_PETUGAS_SEKOLAH;
  console.log(
    "File sesi belum tersedia. Route privat akan dilaporkan NOT TESTED; jalankan npm run perf:sessions untuk cakupan penuh.",
  );
}

const executable = process.platform === "win32" ? "k6.exe" : "k6";
const result = spawnSync(
  executable,
  ["run", "-e", `PERF_MODE=${mode}`, "tests/performance/all-pages.js"],
  {
    cwd: root,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) {
  console.error(`k6 tidak dapat dijalankan: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
