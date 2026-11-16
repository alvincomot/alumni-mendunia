import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = path.join(root, "app");
const manifestPath = path.join(
  root,
  "tests",
  "performance",
  "route-manifest.json",
);
const roles = ["petugas_sekolah", "admin_dinas", "viewer_dinas"];
const redirectStatuses = [303, 307, 308];
const classifications = {
  allowed: "ALLOWED",
  denied: "DENIED_EXPECTED",
  notApplicable: "NOT_APPLICABLE",
};

const policyOverrides = new Map([
  [
    "/dashboard/alumni/[id]",
    {
      access: "authenticated",
      allowedRoles: roles,
      allowedResponse: { kind: "render", statuses: [200] },
      deniedResponse: accessDeniedRedirect(),
      policySource: "getAlumniAccess read policy",
    },
  ],
  [
    "/dashboard/alumni/new",
    {
      access: "authenticated",
      allowedRoles: ["petugas_sekolah"],
      allowedResponse: { kind: "render", statuses: [200] },
      deniedResponse: {
        kind: "render",
        statuses: [200],
        bodyIncludes: "Akses tidak diizinkan",
      },
      policySource: "getAlumniAccess canWrite policy",
    },
  ],
  [
    "/dashboard/schools",
    {
      access: "authenticated",
      allowedRoles: ["admin_dinas", "viewer_dinas"],
      allowedResponse: { kind: "render", statuses: [200] },
      deniedResponse: {
        kind: "render",
        statuses: [200],
        bodyIncludes: "Akses tidak diizinkan",
      },
      policySource: "getSchoolAccess policy",
    },
  ],
  [
    "/dashboard/audit-logs",
    {
      access: "authenticated",
      allowedRoles: ["admin_dinas"],
      allowedResponse: {
        kind: "redirect",
        statuses: redirectStatuses,
        locationPrefix: "/dashboard/monitoring?tab=audit",
      },
      deniedResponse: accessDeniedRedirect(),
      policySource: "requireAccess plus canonical monitoring redirect",
    },
  ],
  [
    "/protected",
    {
      access: "authenticated",
      allowedRoles: roles,
      allowedResponse: {
        kind: "redirect",
        statuses: redirectStatuses,
        locationPrefix: "/dashboard",
      },
      deniedResponse: loginRedirect(),
      policySource: "authenticated compatibility redirect",
    },
  ],
]);

const publicPolicies = new Map([
  ["/", redirectPolicy("/auth/login")],
  ["/auth/access-denied", renderPolicy()],
  ["/auth/error", renderPolicy()],
  ["/auth/forgot-password", renderPolicy()],
  ["/auth/login", renderPolicy()],
  ["/auth/sign-up", redirectPolicy("/auth/login")],
  ["/auth/sign-up-success", redirectPolicy("/auth/login")],
]);

function renderPolicy() {
  return {
    access: "public",
    publicResponse: { kind: "render", statuses: [200] },
    policySource: "public page",
  };
}

function redirectPolicy(locationPrefix) {
  return {
    access: "public",
    publicResponse: {
      kind: "redirect",
      statuses: redirectStatuses,
      locationPrefix,
    },
    policySource: "canonical public redirect",
  };
}

function accessDeniedRedirect() {
  return {
    kind: "redirect",
    statuses: redirectStatuses,
    locationPrefix: "/auth/access-denied",
  };
}

function loginRedirect() {
  return {
    kind: "redirect",
    statuses: redirectStatuses,
    locationPrefix: "/auth/login",
  };
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function routeFromFile(file) {
  const relativeDirectory = path.relative(appRoot, path.dirname(file));
  const segments = relativeDirectory === "" ? [] : relativeDirectory.split(path.sep);
  const visible = segments.filter(
    (segment) =>
      !(segment.startsWith("(") && segment.endsWith(")")) &&
      !segment.startsWith("@") &&
      !segment.startsWith("_"),
  );
  return visible.length === 0 ? "/" : `/${visible.join("/")}`;
}

function dynamicParameters(route) {
  return [...route.matchAll(/\[\[?\.\.\.(\w+)\]?\]|\[(\w+)\]/g)].map(
    (match) => ({
      name: match[1] ?? match[2],
      fixtureKey: route.startsWith("/dashboard/alumni/")
        ? "alumni"
        : route.startsWith("/dashboard/murid-aktif/")
          ? "murid"
          : match[1] ?? match[2],
      catchAll: Boolean(match[1]),
      optional: match[0].startsWith("[["),
    }),
  );
}

function roleClassifications(policy) {
  if (policy.access === "authenticated")
    return Object.fromEntries(
      roles.map((role) => [
        role,
        policy.allowedRoles.includes(role)
          ? classifications.allowed
          : classifications.denied,
      ]),
    );
  if (policy.access === "special_session")
    return Object.fromEntries(
      roles.map((role) => [role, classifications.notApplicable]),
    );
  return undefined;
}

function rolesFromRequireAccess(source) {
  const restricted = source.match(/requireAccess\(\s*\[([\s\S]*?)\]\s*\)/);
  if (restricted) {
    const found = [...restricted[1].matchAll(/["'](admin_dinas|viewer_dinas|petugas_sekolah)["']/g)].map(
      (match) => match[1],
    );
    if (found.length > 0) return [...new Set(found)];
  }
  if (/requireAccess\(\s*\)/.test(source)) return roles;
  return null;
}

function pagePolicy(route, source) {
  if (route === "/auth/update-password") {
    return {
      access: "special_session",
      skipReason:
        "Memerlukan sesi recovery, undangan, atau wajib-ganti-password yang tervalidasi; token nyata tidak diuji.",
      policySource: "verified password-flow session",
    };
  }
  if (publicPolicies.has(route)) return publicPolicies.get(route);
  if (policyOverrides.has(route)) return policyOverrides.get(route);
  if (route.startsWith("/dashboard")) {
    const allowedRoles = rolesFromRequireAccess(source);
    if (allowedRoles) {
      return {
        access: "authenticated",
        allowedRoles,
        allowedResponse: { kind: "render", statuses: [200] },
        deniedResponse: accessDeniedRedirect(),
        policySource: "requireAccess inferred from page source",
      };
    }
  }
  return {
    access: "review_required",
    skipReason:
      "Kebijakan akses tidak dapat dibuktikan otomatis; tambahkan satu override terpusat setelah review.",
    policySource: "unresolved",
  };
}

function handlerPolicy(route) {
  if (route === "/auth/callback" || route === "/auth/confirm")
    return "Endpoint token autentikasi; tidak diuji tanpa token fiktif yang tervalidasi.";
  if (route === "/api/monitoring/pageview")
    return "Endpoint POST menulis telemetry; dikecualikan dari pengujian halaman read-only.";
  if (route === "/dashboard/reports/export")
    return "Route handler unduhan CSV, bukan halaman HTML; pengujian ini berfokus pada page routes.";
  return "Route handler bukan halaman HTML dan memerlukan audit endpoint terpisah.";
}

const files = walk(appRoot);
const pageFiles = files.filter((file) => /^page\.(?:[jt]sx?)$/.test(path.basename(file)));
const handlerFiles = files.filter((file) => /^route\.(?:[jt]s)$/.test(path.basename(file)));

const pages = pageFiles
  .map((file) => {
    const route = routeFromFile(file);
    const source = fs.readFileSync(file, "utf8");
    const policy = pagePolicy(route, source);
    const classificationsForRoles = roleClassifications(policy);
    return {
      route,
      sourceFile: toPosix(path.relative(root, file)),
      dynamicParameters: dynamicParameters(route),
      ...policy,
      ...(classificationsForRoles
        ? { roleClassifications: classificationsForRoles }
        : {}),
    };
  })
  .sort((left, right) => left.route.localeCompare(right.route));

const handlers = handlerFiles
  .map((file) => {
    const route = routeFromFile(file);
    const source = fs.readFileSync(file, "utf8");
    const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(
      (match) => match[1],
    );
    return {
      route,
      sourceFile: toPosix(path.relative(root, file)),
      methods,
      testedAsPage: false,
      skipReason: handlerPolicy(route),
    };
  })
  .sort((left, right) => left.route.localeCompare(right.route));

const manifest = {
  schemaVersion: 2,
  classifications: Object.values(classifications),
  roles,
  pageCount: pages.length,
  handlerCount: handlers.length,
  pages,
  handlers,
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.mkdirSync(path.join(root, "tests", "performance", "results"), {
  recursive: true,
});

console.log(
  `Route manifest diperbarui: ${pages.length} halaman, ${handlers.length} route handler.`,
);
