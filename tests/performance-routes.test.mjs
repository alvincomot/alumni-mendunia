import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const performanceDirectory = path.join(root, "tests", "performance");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function manifest() {
  execFileSync(process.execPath, [path.join(performanceDirectory, "discover-routes.mjs")], {
    cwd: root,
  });
  return JSON.parse(
    fs.readFileSync(path.join(performanceDirectory, "route-manifest.json"), "utf8"),
  );
}

test("performance manifest discovers every App Router page and handler", () => {
  const routes = manifest();
  const sourceFiles = new Set([
    ...routes.pages.map((entry) => entry.sourceFile),
    ...routes.handlers.map((entry) => entry.sourceFile),
  ]);
  const actual = walk(path.join(root, "app"));
  const actualPages = actual.filter((file) => /page\.(?:[jt]sx?)$/.test(file));
  const actualHandlers = actual.filter((file) => /route\.(?:[jt]s)$/.test(file));
  const actualRoutes = [...actualPages, ...actualHandlers].map((file) =>
    path.relative(root, file).split(path.sep).join("/"),
  );
  assert.equal(routes.pageCount, actualPages.length);
  assert.equal(routes.handlerCount, actualHandlers.length);
  assert.deepEqual(new Set(actualRoutes), sourceFiles);
  assert.equal(routes.pages.some((page) => page.access === "review_required"), false);
});

test("performance policy covers roles, dynamic IDs and security exclusions", () => {
  const routes = manifest();
  const alumniDetail = routes.pages.find(
    (page) => page.route === "/dashboard/alumni/[id]",
  );
  assert.deepEqual(alumniDetail.dynamicParameters, [
    {
      name: "id",
      fixtureKey: "alumni",
      catchAll: false,
      optional: false,
    },
  ]);
  assert.deepEqual(alumniDetail.allowedRoles, [
    "petugas_sekolah",
    "admin_dinas",
    "viewer_dinas",
  ]);
  const activeStudentDetail = routes.pages.find(
    (page) => page.route === "/dashboard/murid-aktif/[id]",
  );
  assert.deepEqual(activeStudentDetail.dynamicParameters, [
    {
      name: "id",
      fixtureKey: "murid",
      catchAll: false,
      optional: false,
    },
  ]);
  assert.deepEqual(activeStudentDetail.allowedRoles, [
    "petugas_sekolah",
    "admin_dinas",
    "viewer_dinas",
  ]);
  assert.match(
    routes.pages.find((page) => page.route === "/auth/update-password").skipReason,
    /token nyata tidak diuji/,
  );
  assert.match(
    routes.handlers.find((handler) => handler.route === "/api/monitoring/pageview")
      .skipReason,
    /menulis telemetry/,
  );
  assert.deepEqual(routes.classifications, [
    "ALLOWED",
    "DENIED_EXPECTED",
    "NOT_APPLICABLE",
  ]);
  assert.equal(
    routes.pages.find((page) => page.route === "/dashboard/users")
      .roleClassifications.viewer_dinas,
    "DENIED_EXPECTED",
  );
});

test("k6 suite blocks unsafe targets and reports all result states", () => {
  const suite = fs.readFileSync(path.join(performanceDirectory, "all-pages.js"), "utf8");
  const bootstrap = fs.readFileSync(
    path.join(performanceDirectory, "create-test-sessions.mjs"),
    "utf8",
  );
  const runner = fs.readFileSync(
    path.join(performanceDirectory, "run-k6.mjs"),
    "utf8",
  );
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(suite, /K6_ALLOW_REMOTE_TARGET/);
  assert.match(suite, /K6_CONFIRM_ISOLATED_TARGET/);
  assert.match(suite, /K6_CONFIRM_TEST_SESSIONS/);
  assert.match(suite, /NOT TESTED/);
  assert.match(suite, /EXPECTED DENIAL/);
  assert.match(suite, /NOT APPLICABLE/);
  assert.match(suite, /foreign_alumni/);
  assert.match(suite, /body\.includes\("Keluar"\)/);
  assert.match(suite, /maxRedirects:\s*0/);
  assert.match(suite, /NEXT_REDIRECT/);
  assert.match(suite, /NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.match(suite, /K6_REPORT_ITERATIONS/);
  assert.match(suite, /runFullCoverage\("warmup"\)/);
  assert.match(bootstrap, /signInWithPassword/);
  assert.match(bootstrap, /auth\.getUser/);
  assert.match(bootstrap, /K6_CONFIRM_FIXTURES_ARE_FICTITIOUS/);
  assert.match(bootstrap, /resolveReadableFixture/);
  assert.match(bootstrap, /resolveForeignAlumniFixture/);
  assert.match(bootstrap, /verifySupabaseEndpoint/);
  assert.match(runner, /K6_SESSION_MAX_AGE_MINUTES/);
  assert.equal(
    packageJson.scripts["perf:sessions"],
    "node tests/performance/create-test-sessions.mjs",
  );
  for (const script of ["perf:smoke", "perf:spike", "perf:report"])
    assert.match(packageJson.scripts[script] ?? "", /run-k6\.mjs/);
});

test("performance secret files stay ignored and example contains no credentials", () => {
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  const example = fs.readFileSync(
    path.join(performanceDirectory, "config.example.env"),
    "utf8",
  );
  assert.match(ignore, /config\.local\.env/);
  assert.match(ignore, /\.sessions\*\.local\.json/);
  assert.match(example, /replace-with-local-password/);
  assert.doesNotMatch(example, /sb_secret_|service_role|eyJ[A-Za-z0-9_-]+\./);
});
