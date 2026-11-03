import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const loaded = { exports: {} };
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync("lib/alumni/navigation.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(loaded.exports);
const { alumniListPath, alumniReturnPath, alumniFormPath } = loaded.exports;

test("return navigation preserves supported list filters and pagination without form payloads", () => {
  const list = alumniListPath({
    q: "Fiktif",
    country: "Korea Selatan",
    year: "2025",
    page: "2",
    sort: "name_desc",
    password: "do-not-copy",
    full_name: "not-a-list-field",
    school_id: "ignored",
  });
  const url = new URL(list, "https://local.invalid");
  assert.equal(url.pathname, "/dashboard/alumni");
  assert.equal(url.searchParams.get("country"), "Korea Selatan");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("sort"), "name_desc");
  assert.doesNotMatch(list, /password|full_name|school_id|do-not-copy/);
  const target = new URL(
    alumniFormPath("/dashboard/alumni/new", list),
    url.origin,
  );
  assert.equal(alumniReturnPath(target.searchParams.get("returnTo")), list);
});

for (const value of [
  undefined,
  ["/dashboard/alumni"],
  "https://evil.example/dashboard/alumni",
  "//evil.example/dashboard/alumni",
  "javascript:alert(1)",
  "/dashboard/users",
  "/dashboard/alumni/new",
  "/dashboard/alumni#fragment",
  "/dashboard/%61lumni",
]) {
  test(`untrusted return destination falls back to alumni list: ${String(value)}`, () =>
    assert.equal(alumniReturnPath(value), "/dashboard/alumni"));
}

test("empty return filters do not create redundant query strings and text is bounded", () => {
  assert.equal(alumniListPath({ q: " ", page: ["2"] }), "/dashboard/alumni");
  assert.equal(
    alumniFormPath("/dashboard/alumni/new", "/dashboard/alumni"),
    "/dashboard/alumni/new",
  );
  assert.equal(
    new URL(
      alumniListPath({ q: "a".repeat(250) }),
      "https://local.invalid",
    ).searchParams.get("q").length,
    150,
  );
});
