import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependency = createRequire(import.meta.url);

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    const output = ts.transpileModule(
      fs.readFileSync(path.join(root, file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText;
    new Function("require", "module", "exports", output)(
      (name) => {
        if (name in mocks) return mocks[name];
        if (name === "server-only") return {};
        if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
        if (name.startsWith("."))
          return load(path.join(path.dirname(file), name) + ".ts");
        return dependency(name);
      },
      loaded,
      loaded.exports,
    );
    return loaded.exports;
  }
  return load;
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("monitoring paths exclude sensitive URLs and normalize alumni identifiers", () => {
  const paths = loader()("lib/system-monitoring/paths.ts");
  assert.equal(paths.normalizeMonitoredPath("/dashboard/alumni"), "/dashboard/alumni");
  assert.equal(
    paths.normalizeMonitoredPath(
      "/dashboard/alumni/00000000-0000-4000-8000-000000000001",
    ),
    "/dashboard/alumni/[id]",
  );
  assert.equal(paths.normalizeMonitoredPath("/dashboard/alumni?email=x"), null);
  assert.equal(paths.normalizeMonitoredPath("/api/monitoring/pageview"), null);
  assert.equal(paths.normalizeMonitoredPath("/_next/static/test.js"), null);
});

test("pageview deduper blocks rerenders but records later navigation", () => {
  const { createPageViewDeduper } = loader()("lib/system-monitoring/paths.ts");
  const shouldRecord = createPageViewDeduper(1_500);
  assert.equal(shouldRecord("/dashboard", 10_000), true);
  assert.equal(shouldRecord("/dashboard", 10_100), false);
  assert.equal(shouldRecord("/dashboard/alumni", 10_200), true);
  assert.equal(shouldRecord("/dashboard", 10_300), true);
  assert.equal(shouldRecord("/dashboard", 12_000), true);
});

test("monitoring periods use WIB and reject invalid custom dates safely", () => {
  const { resolveMonitoringPeriod } = loader()(
    "lib/system-monitoring/period.ts",
  );
  const now = new Date("2026-11-09T17:30:00.000Z");
  assert.deepEqual(resolveMonitoringPeriod({ period: "today" }, now).period, {
    key: "today",
    from: "2026-11-10",
    to: "2026-11-10",
  });
  assert.match(
    resolveMonitoringPeriod(
      { period: "custom", from: "2026-99-99", to: "2026-11-09" },
      now,
    ).error,
    /tanggal awal dan akhir yang valid/,
  );
  assert.match(
    resolveMonitoringPeriod(
      { period: "custom", from: "2026-01-01", to: "2026-11-09" },
      now,
    ).error,
    /maksimal 90 hari/,
  );
});

test("pageview endpoint authorizes and sends only a normalized path", async () => {
  const calls = [];
  const load = loader({
    "@/lib/alumni/access": {
      getAlumniAccess: async () => ({
        allowed: true,
        supabase: {
          rpc: async (name, args) => {
            calls.push({ name, args });
            return { error: null };
          },
        },
      }),
    },
  });
  const route = load("app/api/monitoring/pageview/route.ts");
  const response = await route.POST(
    new Request("http://local/api/monitoring/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/dashboard/alumni/00000000-0000-4000-8000-000000000001",
        email: "ignored@example.test",
      }),
    }),
  );
  assert.equal(response.status, 204);
  assert.deepEqual(calls, [
    {
      name: "record_app_pageview",
      args: { p_path: "/dashboard/alumni/[id]" },
    },
  ]);
});

test("pageview endpoint rejects unauthenticated and unsupported requests", async () => {
  const route = loader({
    "@/lib/alumni/access": {
      getAlumniAccess: async () => ({ allowed: false, reason: "session" }),
    },
  })("app/api/monitoring/pageview/route.ts");
  const unauthorized = await route.POST(
    new Request("http://local/api/monitoring/pageview", {
      method: "POST",
      body: JSON.stringify({ path: "/dashboard" }),
    }),
  );
  assert.equal(unauthorized.status, 401);
  const invalid = await route.POST(
    new Request("http://local/api/monitoring/pageview", {
      method: "POST",
      body: JSON.stringify({ path: "/api/private" }),
    }),
  );
  assert.equal(invalid.status, 400);
});

test("legacy audit route preserves filters and opens the Audit Log tab", async () => {
  let destination = "";
  const route = loader({
    "next/navigation": { redirect: (value) => { destination = value; } },
    "@/lib/auth/access": { requireAccess: async () => ({ role: "admin_dinas" }) },
  })("app/dashboard/audit-logs/page.tsx");
  await route.default({
    searchParams: Promise.resolve({ action: "UPDATE", page: "3" }),
  });
  assert.equal(
    destination,
    "/dashboard/monitoring?tab=audit&action=UPDATE&page=3",
  );
});

test("sidebar and monitoring page expose one admin-only Monitoring Sistem entry", () => {
  const sidebar = read("components/dashboard-sidebar.tsx");
  const page = read("app/dashboard/monitoring/page.tsx");
  assert.equal((sidebar.match(/label: "Monitoring Sistem"/gu) ?? []).length, 1);
  assert.doesNotMatch(sidebar, /label: "Audit Log"/u);
  assert.doesNotMatch(sidebar, /href: "\/dashboard\/audit-logs"/u);
  assert.match(sidebar, /icon: "activity"/u);
  assert.match(page, /requireAccess\(\["admin_dinas"\]\)/u);
  assert.match(page, /Ringkasan Penggunaan|SystemTabs/u);
  assert.match(page, /AuditLogPanel/u);
  assert.match(page, /HealthPanel/u);
});

test("recent monitoring activity resolves recorded actors without inventing missing identity", async () => {
  const auditRows = [
    {
      id: "audit-1",
      actor_id: "user-1",
      action: "INSERT",
      entity_type: "alumni",
      occurred_at: "2026-11-09T08:00:00.000Z",
    },
    {
      id: "audit-2",
      actor_id: null,
      action: "UPDATE",
      entity_type: "placements",
      occurred_at: "2026-11-09T07:00:00.000Z",
    },
  ];
  const auditQuery = {
    select() { return this; },
    order() { return this; },
    async limit() { return { data: auditRows, error: null }; },
  };
  const profileQuery = {
    select() { return this; },
    async in() {
      return {
        data: [{ user_id: "user-1", full_name: "Admin Dinas" }],
        error: null,
      };
    },
  };
  const { loadRecentMonitoringActivity } = loader()(
    "lib/system-monitoring/data.ts",
  );
  const result = await loadRecentMonitoringActivity({
    supabase: {
      from(table) {
        return table === "audit_logs" ? auditQuery : profileQuery;
      },
    },
  });
  assert.deepEqual(result, [
    {
      id: "audit-1",
      action: "INSERT",
      entityType: "alumni",
      actorName: "Admin Dinas",
      occurredAt: "2026-11-09T08:00:00.000Z",
    },
    {
      id: "audit-2",
      action: "UPDATE",
      entityType: "placements",
      actorName: "Pelaku tidak tercatat",
      occurredAt: "2026-11-09T07:00:00.000Z",
    },
  ]);
});

test("health UI labels unavailable telemetry instead of fabricating reliability claims", () => {
  const health = read("components/monitoring/health-panel.tsx");
  assert.match(health, /Belum dipantau/u);
  assert.match(health, /bukan riwayat[\s\S]*uptime/u);
  assert.doesNotMatch(health, /99\.9|SSO|Real-time sync|email berhasil dikirim/iu);
});

test("monitoring migration stores aggregates without user or request identity", () => {
  const migration = read(
    "supabase/migrations/20261109000100_system_monitoring.sql",
  );
  const table = migration.slice(
    migration.indexOf("CREATE TABLE public.app_pageviews_daily"),
    migration.indexOf("COMMENT ON TABLE public.app_pageviews_daily"),
  );
  assert.match(table, /day date NOT NULL/u);
  assert.match(table, /path text NOT NULL/u);
  assert.match(table, /view_count bigint NOT NULL/u);
  assert.doesNotMatch(table, /user_id|email|npsn|ip_address|query|string|token/iu);
  assert.match(migration, /ON CONFLICT \(day, path\) DO UPDATE/u);
  assert.match(migration, /day < v_today - 399/u);
});
