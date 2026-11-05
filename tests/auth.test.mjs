import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, client, calls) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/supabase/server") return { createClient: async () => client };
    if (name === "next/cache") return { revalidatePath: (...args) => calls.push(["revalidate", ...args]) };
    if (name === "next/navigation") return {
      RedirectType: { replace: "replace" },
      redirect: (path, type) => { calls.push(["redirect", path, type]); throw new Error(`Redirect:${path}`); },
    };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return exports;
}

test("logout signs out the current session, clears cached layouts, then redirects to login", async () => {
  const calls = [];
  const { logout } = load("../app/auth/logout.ts", { auth: { signOut: async options => { calls.push(["signOut", options.scope]); return { error: null }; } } }, calls);
  await assert.rejects(logout(), /Redirect:\/login/);
  assert.deepEqual(calls, [["signOut", "local"], ["revalidate", "/", "layout"], ["redirect", "/login", "replace"]]);
});

test("logout failure stays on the page and offers a retry without exposing errors", async () => {
  const calls = [];
  const { logout } = load("../app/auth/logout.ts", { auth: { signOut: async () => ({ error: { message: "Private provider detail" } }) } }, calls);
  assert.equal((await logout()).error, "Could not log out. Please try again.");
  assert.equal(calls.length, 0);
});

test("logout network failures show a recoverable error", async () => {
  const calls = [];
  const { logout } = load("../app/auth/logout.ts", { auth: { signOut: async () => { throw new Error("Private network detail"); } } }, calls);
  assert.match((await logout()).error, /Check your connection/);
  assert.equal(calls.length, 0);
});

for (const [label, user, profile, expected] of [
  ["anonymous users", null, null, "/login"],
  ["non-superadmins", { id: "user" }, { is_superadmin: false }, "/login?error=unauthorized"],
  ["missing profiles", { id: "user" }, null, "/login?error=unauthorized"],
  ["superadmins", { id: "user" }, { is_superadmin: true }, null],
]) {
  test(`the protected-page guard handles ${label}`, async () => {
    const calls = [];
    const query = { select: () => query, eq: (_key, id) => { assert.equal(id, "user"); return query; }, single: async () => ({ data: profile, error: null }) };
    const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => query };
    const { requireSuperadmin } = load("../lib/auth.ts", client, calls);
    if (expected) await assert.rejects(requireSuperadmin(), error => error.message === `Redirect:${expected}`);
    else assert.equal((await requireSuperadmin()).user.id, "user");
  });
}
