import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { Counter, Rate, Trend } from "k6/metrics";

const manifest = JSON.parse(open("./route-manifest.json"));
const mode = (__ENV.PERF_MODE || "smoke").toLowerCase();
const baseUrl = (__ENV.K6_BASE_URL || __ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const roles = manifest.roles;
const statusCodes = [200, 303, 307, 308, 401, 403, 404, 429, 500, 502, 503];
const localTarget = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(baseUrl);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportIterations = Number(__ENV.K6_REPORT_ITERATIONS || "5");

if (!["smoke", "spike", "report"].includes(mode))
  throw new Error("PERF_MODE harus smoke, spike, atau report.");
if (!/^https?:\/\/[^/?#]+$/.test(baseUrl) || /^https?:\/\/[^/]*@/i.test(baseUrl))
  throw new Error("K6_BASE_URL harus berupa origin HTTP(S) tanpa path atau kredensial.");
if (!localTarget && (__ENV.K6_ALLOW_REMOTE_TARGET !== "true" || __ENV.K6_CONFIRM_ISOLATED_TARGET !== "true"))
  throw new Error("Target non-local diblokir. Staging terisolasi memerlukan K6_ALLOW_REMOTE_TARGET=true dan K6_CONFIRM_ISOLATED_TARGET=true.");
if (mode === "spike" && !localTarget)
  throw new Error("SPIKE hanya boleh dijalankan pada localhost yang terisolasi.");
if (mode === "spike" && __ENV.K6_CONFIRM_ISOLATED_TARGET !== "true")
  throw new Error("Konfirmasi localhost terisolasi dengan K6_CONFIRM_ISOLATED_TARGET=true sebelum SPIKE.");
if (!Number.isInteger(reportIterations) || reportIterations < 2 || reportIterations > 20)
  throw new Error("K6_REPORT_ITERATIONS harus berupa bilangan bulat antara 2 dan 20.");

function environmentName(role) {
  return role.toUpperCase();
}

function readSessions(role) {
  if (__ENV.K6_CONFIRM_TEST_SESSIONS !== "true") return [];
  const suffix = environmentName(role);
  const jsonValue = __ENV[`K6_SESSION_COOKIES_${suffix}`];
  const singleValue = __ENV[`K6_SESSION_COOKIE_${suffix}`];
  if (jsonValue) {
    try {
      const parsed = JSON.parse(jsonValue);
      return Array.isArray(parsed)
        ? parsed.filter((value) => typeof value === "string" && value.trim())
        : [];
    } catch {
      throw new Error(`K6_SESSION_COOKIES_${suffix} harus berupa array JSON.`);
    }
  }
  return singleValue && singleValue.trim() ? [singleValue.trim()] : [];
}

const sessions = Object.fromEntries(roles.map((role) => [role, readSessions(role)]));
const allSessionValues = roles.flatMap((role) => sessions[role]);
if (new Set(allSessionValues).size !== allSessionValues.length)
  throw new Error("Setiap role/VU harus menggunakan sesi uji terpisah; cookie duplikat ditolak.");
if (mode === "spike" && roles.some((role) => sessions[role].length < 5))
  throw new Error("SPIKE 15 VU memerlukan lima sesi uji unik untuk setiap role agar refresh session tidak dibagi antar-VU.");

function readFixtureId(role, fixtureKey) {
  const key = `K6_${fixtureKey.toUpperCase()}_ID_${environmentName(role)}`;
  const value = __ENV[key];
  return value && uuidPattern.test(value) ? value : null;
}

function responseFor(page, role) {
  return page.roleClassifications[role] === "ALLOWED" ? page.allowedResponse : page.deniedResponse;
}

function createCases() {
  const entries = [];
  for (const page of manifest.pages) {
    if (page.access === "public") {
      entries.push({ page, role: "public", classification: "ALLOWED", expected: page.publicResponse, variant: "default" });
      continue;
    }
    if (page.access === "special_session") {
      for (const role of roles)
        entries.push({
          page,
          role,
          classification: page.roleClassifications[role],
          expected: null,
          variant: "default",
        });
      continue;
    }
    if (page.access === "authenticated")
      for (const role of roles)
        entries.push({
          page,
          role,
          classification: page.roleClassifications[role],
          expected: responseFor(page, role),
          variant: "default",
        });
  }
  const alumniDetail = manifest.pages.find((page) => page.route === "/dashboard/alumni/[id]");
  if (alumniDetail)
    entries.push({
      page: alumniDetail,
      role: "petugas_sekolah",
      classification: "DENIED_EXPECTED",
      expected: { kind: "render", statuses: [404] },
      fixtureOverride: "foreign_alumni",
      variant: "cross_school",
    });
  return entries;
}

const cases = createCases();
const runnableCases = cases.filter((entry) => entry.classification !== "NOT_APPLICABLE");
const publicCases = runnableCases.filter((entry) => entry.role === "public");
const roleCases = Object.fromEntries(
  roles.map((role) => [role, runnableCases.filter((entry) => entry.role === role)]),
);

function caseKey(entry) {
  return `${entry.role}:${entry.page.route}:${entry.variant}`;
}

function displayPage(entry) {
  return entry.variant === "cross_school" ? `${entry.page.route} (lintas sekolah)` : entry.page.route;
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function metricId(entry) {
  const readable = `${entry.role}_${entry.page.route}_${entry.variant}`
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
  return `${readable}_${hash(caseKey(entry))}`;
}

const metrics = Object.fromEntries(
  cases.map((entry) => {
    const id = metricId(entry);
    return [
      caseKey(entry),
      {
        id,
        requests: new Counter(`page_requests_${id}`),
        errors: new Rate(`page_errors_${id}`),
        duration: new Trend(`page_duration_${id}`, true),
        statuses: Object.fromEntries(
          [...statusCodes, "other"].map((status) => [status, new Counter(`page_status_${status}_${id}`)]),
        ),
      },
    ];
  }),
);

export const options = {
  maxRedirects: 0,
  thresholds: {
    checks: ["rate>0.99"],
    page_errors: ["rate<0.01"],
    "http_req_duration{phase:measurement}": [`p(95)<${Number(__ENV.K6_P95_LIMIT_MS || (mode === "spike" ? 2500 : 2000))}`],
  },
  scenarios:
    mode === "spike"
      ? {
          all_pages_spike: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
              { duration: "1s", target: 15 },
              { duration: "15s", target: 15 },
              { duration: "2s", target: 0 },
            ],
            gracefulRampDown: "3s",
          },
        }
      : {
          all_pages_once: {
            executor: "shared-iterations",
            vus: 1,
            iterations: mode === "report" ? reportIterations + 1 : 1,
            maxDuration: mode === "report" ? "10m" : "2m",
          },
        },
};

const aggregateErrors = new Rate("page_errors");

function resolvePath(entry) {
  let resolved = entry.page.route;
  for (const parameter of entry.page.dynamicParameters) {
    const fixtureKey = entry.fixtureOverride || parameter.fixtureKey;
    const value = readFixtureId(entry.role, fixtureKey);
    if (!value) return null;
    const token = parameter.catchAll
      ? parameter.optional
        ? `[[...${parameter.name}]]`
        : `[...${parameter.name}]`
      : `[${parameter.name}]`;
    resolved = resolved.replace(token, encodeURIComponent(value));
  }
  return resolved;
}

function normalizedLocation(response) {
  const location = response.headers.Location || response.headers.location || "";
  return location.replace(/^https?:\/\/[^/]+/i, "");
}

function responseBody(response) {
  return typeof response.body === "string" ? response.body : "";
}

function streamedRedirectLocation(response) {
  const match = responseBody(response).match(
    /NEXT_REDIRECT;(?:replace|push);([^;]+);(?:303|307|308)/u,
  );
  return match?.[1]
    ?.replaceAll("\\u0026", "&")
    .replace(/^https?:\/\/[^/]+/iu, "") ?? "";
}

function effectiveLocation(response) {
  return normalizedLocation(response) || streamedRedirectLocation(response);
}

function matchesExpectedStatus(expected, response) {
  if (expected.statuses.includes(response.status)) return true;
  if (response.status !== 200) return false;
  if (expected.kind === "redirect" && streamedRedirectLocation(response))
    return true;
  return (
    expected.statuses.includes(404) &&
    responseBody(response).includes("NEXT_HTTP_ERROR_FALLBACK;404")
  );
}

function containsLoginPage(response) {
  const body = responseBody(response);
  return effectiveLocation(response).startsWith("/auth/login") || body.includes("Masuk ke sistem") || body.includes("Masukkan kata sandi akun sekolah");
}

function validateResponse(entry, response) {
  const expected = entry.expected;
  if (!matchesExpectedStatus(expected, response)) return false;
  if (entry.role !== "public" && containsLoginPage(response)) return false;
  if (expected.kind === "redirect")
    return effectiveLocation(response).startsWith(expected.locationPrefix);
  const body = responseBody(response);
  if (expected.bodyIncludes && !body.includes(expected.bodyIncludes)) return false;
  if (entry.classification === "ALLOWED" && entry.page.route.startsWith("/dashboard") && !body.includes("Keluar"))
    return false;
  return true;
}

function sessionFor(role) {
  const available = sessions[role];
  return available.length === 0 ? null : available[(__VU - 1) % available.length];
}

function runCase(entry, phase = "measurement") {
  const path = resolvePath(entry);
  const cookie = entry.role === "public" ? null : sessionFor(entry.role);
  if (!path || (entry.role !== "public" && !cookie)) return;
  const response = http.get(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "k6-alumni-mendunia-all-pages/2.0",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirects: 0,
    responseType: "text",
    tags: {
      classification: entry.classification,
      page: displayPage(entry),
      phase,
      role: entry.role,
    },
    timeout: "15s",
  });
  if (phase === "warmup") return;
  const valid = validateResponse(entry, response);
  const pageMetrics = metrics[caseKey(entry)];
  pageMetrics.requests.add(1);
  pageMetrics.errors.add(!valid);
  pageMetrics.duration.add(response.timings.duration);
  (pageMetrics.statuses[response.status] || pageMetrics.statuses.other).add(1);
  aggregateErrors.add(!valid);
  check(response, {
    [`${entry.role} ${displayPage(entry)} sesuai kebijakan akses`]: () => valid,
  });
}

function runFullCoverage(phase = "measurement") {
  for (const entry of publicCases) runCase(entry, phase);
  for (const role of roles)
    for (const entry of roleCases[role]) runCase(entry, phase);
}

function runSpikeSample() {
  const role = roles[(__VU - 1) % roles.length];
  const available = roleCases[role].filter((entry) => entry.page.dynamicParameters.length === 0 || resolvePath(entry));
  const combined = exec.scenario.iterationInTest % 5 === 0 ? publicCases : available;
  if (combined.length > 0)
    runCase(combined[exec.scenario.iterationInTest % combined.length]);
  sleep(0.15);
}

export default function runAllPages() {
  if (mode === "spike") runSpikeSample();
  else if (mode === "report" && exec.scenario.iterationInTest === 0)
    runFullCoverage("warmup");
  else runFullCoverage();
}

function metricValues(data, name) {
  return data.metrics[name] ? data.metrics[name].values : {};
}

function statusSummary(data, pageMetrics) {
  return [...statusCodes, "other"]
    .map((status) => ({ status, count: metricValues(data, `page_status_${status}_${pageMetrics.id}`).count || 0 }))
    .filter((entry) => entry.count > 0);
}

function missingFixtureNames(entry) {
  return entry.page.dynamicParameters
    .filter((parameter) => !readFixtureId(entry.role, entry.fixtureOverride || parameter.fixtureKey))
    .map((parameter) => entry.fixtureOverride || parameter.fixtureKey);
}

function skipReason(entry) {
  if (entry.classification === "NOT_APPLICABLE")
    return entry.page.skipReason || "Tidak berlaku untuk sesi role biasa.";
  if (entry.role !== "public" && sessions[entry.role].length === 0)
    return __ENV.K6_CONFIRM_TEST_SESSIONS === "true"
      ? `Sesi Supabase SSR untuk ${entry.role} tidak tersedia.`
      : "Sesi autentikasi tervalidasi belum tersedia.";
  const missingFixtures = missingFixtureNames(entry);
  if (missingFixtures.length > 0)
    return `Fixture fiktif ${missingFixtures.join(", ")} belum tersedia atau bukan UUID valid.`;
  return "Tidak mendapat iterasi pada profil pengujian ini.";
}

function reportRows(data) {
  return cases.map((entry) => {
    const pageMetrics = metrics[caseKey(entry)];
    const requestValues = metricValues(data, `page_requests_${pageMetrics.id}`);
    const durationValues = metricValues(data, `page_duration_${pageMetrics.id}`);
    const errorValues = metricValues(data, `page_errors_${pageMetrics.id}`);
    const requests = requestValues.count || 0;
    let result = "NOT TESTED";
    if (entry.classification === "NOT_APPLICABLE") result = "NOT APPLICABLE";
    else if (requests > 0 && errorValues.rate > 0) result = "FAIL";
    else if (requests > 0 && entry.classification === "DENIED_EXPECTED") result = "EXPECTED DENIAL";
    else if (requests > 0) result = "PASS";
    return {
      role: entry.role,
      page: displayPage(entry),
      classification: entry.classification,
      resolvedPath: resolvePath(entry),
      result,
      reason: requests > 0 ? null : skipReason(entry),
      requests,
      statuses: statusSummary(data, pageMetrics),
      errorRate: errorValues.rate || 0,
      averageMs: durationValues.avg || 0,
      p95Ms: durationValues["p(95)"] || 0,
      maximumMs: durationValues.max || 0,
    };
  });
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function htmlReport(report) {
  const rows = report.rows
    .map((row) => `<tr><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.page)}</td><td>${escapeHtml(row.classification)}</td><td>${escapeHtml(row.result)}</td><td>${row.statuses.map((item) => `${item.status}: ${item.count}`).join(", ") || "-"}</td><td>${row.requests}</td><td>${(row.errorRate * 100).toFixed(2)}%</td><td>${row.averageMs.toFixed(2)}</td><td>${row.p95Ms.toFixed(2)}</td><td>${row.maximumMs.toFixed(2)}</td><td>${escapeHtml(row.reason || "-")}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laporan k6 Alumni Mendunia</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#17324d}.table-wrap{overflow-x:auto}.table-wrap:focus-visible{outline:2px solid #17324d;outline-offset:4px}table{border-collapse:collapse;width:100%;min-width:1100px;font-size:13px}th,td{border:1px solid #d6dee6;padding:8px;text-align:left;vertical-align:top}th{background:#eef3f7}h1{margin-bottom:4px}.meta{color:#526274;margin-bottom:24px}@media(max-width:640px){body{margin:20px}h1{font-size:24px}}</style></head><body><h1>Laporan k6 Seluruh Halaman</h1><p class="meta">Mode ${escapeHtml(report.mode)} | Target ${escapeHtml(report.baseUrl)} | ${report.pageCount} halaman ditemukan</p><div class="table-wrap" tabindex="0" aria-label="Tabel hasil pengujian per role dan halaman"><table><thead><tr><th>Role</th><th>Halaman</th><th>Klasifikasi</th><th>Hasil</th><th>Status HTTP</th><th>Request</th><th>Error</th><th>Rata-rata ms</th><th>p95 ms</th><th>Maksimum ms</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>`;
}

function textReport(report) {
  const counted = (result) => report.rows.filter((row) => row.result === result).length;
  const measured = report.rows.filter((row) => ["PASS", "FAIL", "EXPECTED DENIAL"].includes(row.result));
  const notTested = report.rows.filter((row) => row.result === "NOT TESTED");
  const slowest = [...measured].sort((left, right) => right.p95Ms - left.p95Ms).slice(0, 5);
  const lines = [
    "",
    "K6 ALL PAGES REPORT",
    `Mode: ${report.mode}`,
    `Target: ${report.baseUrl}`,
    `Route ditemukan: ${report.pageCount} halaman + ${report.handlerCount} handler`,
    `PASS: ${counted("PASS")}`,
    `FAIL: ${counted("FAIL")}`,
    `EXPECTED DENIAL: ${counted("EXPECTED DENIAL")}`,
    `NOT APPLICABLE: ${counted("NOT APPLICABLE")}`,
    `NOT TESTED: ${counted("NOT TESTED")}`,
    "",
    "Lima kombinasi paling lambat berdasarkan p95:",
    ...slowest.map((row, index) => `${index + 1}. ${row.role} ${row.page}: p95 ${row.p95Ms.toFixed(2)} ms, avg ${row.averageMs.toFixed(2)} ms, max ${row.maximumMs.toFixed(2)} ms`),
  ];
  if (notTested.length > 0) {
    lines.push("", "Route NOT TESTED:");
    for (const row of notTested) lines.push(`- ${row.role} ${row.page}: ${row.reason}`);
  }
  for (const handler of manifest.handlers) lines.push(`- handler ${handler.route}: ${handler.skipReason}`);
  return `${lines.join("\n")}\n`;
}

export function handleSummary(data) {
  const rows = reportRows(data).sort((left, right) => right.p95Ms - left.p95Ms);
  const report = {
    schemaVersion: 2,
    mode,
    baseUrl,
    pageCount: manifest.pageCount,
    handlerCount: manifest.handlerCount,
    sessionCounts: Object.fromEntries(roles.map((role) => [role, sessions[role].length])),
    rows,
    skippedHandlers: manifest.handlers.map((handler) => ({ route: handler.route, reason: handler.skipReason })),
  };
  const prefix = `tests/performance/results/all-pages-${mode}`;
  return {
    stdout: textReport(report),
    [`${prefix}.json`]: `${JSON.stringify(report, null, 2)}\n`,
    [`${prefix}.html`]: htmlReport(report),
  };
}
