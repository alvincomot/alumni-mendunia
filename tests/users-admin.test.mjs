import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadAdmin(createClient = () => ({})) {
  const source = fs.readFileSync(
    new URL("../lib/users/admin.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /import "server-only"/);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(
    (name) => {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { createClient };
      throw Error(`Unexpected dependency: ${name}`);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const admin = loadAdmin();
function directory(size, options = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          calls.push(page);
          const start = (page - 1) * perPage;
          const users = Array.from(
            { length: Math.max(0, Math.min(perPage, size - start)) },
            (_, i) => ({
              id: String(start + i),
              email: `fiktif-${start + i}@example.test`,
              user_metadata: { private: true },
            }),
          );
          return {
            data: {
              users,
              total: options.noTotal ? 0 : size,
              nextPage: 1,
              lastPage: 1,
              ...options.data?.(page, users),
            },
            error: options.error ?? null,
          };
        },
      },
    },
  };
}

test("admin client uses only server secret and disables all session behavior", () => {
  const names = [
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const original = names.map((name) => process.env[name]);
  try {
    process.env.SUPABASE_SECRET_KEY = "fictional-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fictional.example.test";
    let call;
    loadAdmin((...args) => {
      call = args;
      return {};
    }).createAdminClient();
    assert.deepEqual(call, [
      "https://fictional.example.test",
      "fictional-secret",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    ]);
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fictional-legacy-key";
    assert.throws(() => admin.createAdminClient(), /SUPABASE_SECRET_KEY/);
  } finally {
    names.forEach((name, index) =>
      original[index] === undefined
        ? delete process.env[name]
        : (process.env[name] = original[index]),
    );
  }
});

test("invite redirects accept only configured secure origins without paths or credentials", () => {
  const previous = process.env.APP_SITE_URL;
  try {
    for (const value of [
      "",
      "not a URL",
      "http://external.example",
      "https://name:password@example.test",
      "https://example.test/path",
      "https://example.test/?next=elsewhere",
      "https://example.test/#fragment",
    ]) {
      process.env.APP_SITE_URL = value;
      assert.throws(() => admin.invitationRedirect(), /APP_SITE_URL/);
    }
    for (const origin of [
      "https://fictional.example.test",
      "http://localhost:3000",
      "http://127.0.0.1:3217",
    ]) {
      process.env.APP_SITE_URL = origin;
      assert.equal(admin.invitationRedirect(), origin + "/auth/confirm");
    }
  } finally {
    if (previous === undefined) delete process.env.APP_SITE_URL;
    else process.env.APP_SITE_URL = previous;
  }
});

test("directory traverses beyond page ten and returns only id/email", async () => {
  const fake = directory(1251);
  const users = await admin.listAuthUsers(fake);
  assert.equal(users.length, 1251);
  assert.deepEqual(
    fake.calls,
    Array.from({ length: 13 }, (_, i) => i + 1),
  );
  assert.deepEqual(Object.keys(users[0]), ["id", "email"]);
});

test("directory handles empty and exact full-page boundaries, including maximum capacity", async () => {
  for (const size of [0, 100, 200, 10_000]) {
    for (const noTotal of [false, true]) {
      const fake = directory(size, { noTotal });
      assert.equal((await admin.listAuthUsers(fake)).length, size);
      assert.equal(
        fake.calls.length,
        size === 0 ? 1 : size / 100 + Number(noTotal),
      );
    }
  }
});

test("directory rejects duplicates, changing counts, truncation, oversized results and API errors", async () => {
  for (const fake of [
    directory(101, {
      data: (page) => (page === 2 ? { users: [{ id: "0" }] } : {}),
    }),
    directory(101, { data: (page) => ({ total: page === 2 ? 102 : 101 }) }),
    directory(101, { data: (page) => (page === 2 ? { users: [] } : {}) }),
    directory(10_001),
    directory(10_001, { noTotal: true }),
    directory(1, { error: { code: "not_admin" } }),
  ])
    await assert.rejects(admin.listAuthUsers(fake));
});

test("infrastructure diagnostics never reflect arbitrary provider messages or keys", () => {
  for (const error of [
    new Error("fictional-private-key"),
    { message: "fictional-private-key", code: "unexpected_failure" },
    { status: 401, message: "fictional-private-key" },
  ])
    assert.doesNotMatch(
      admin.administrationMessage(error),
      /fictional-private-key/,
    );
  assert.match(
    admin.administrationMessage({ status: 403 }),
    /SUPABASE_SECRET_KEY/,
  );
  assert.match(
    admin.administrationMessage({ code: "email_address_not_authorized" }),
    /SMTP/,
  );
});
