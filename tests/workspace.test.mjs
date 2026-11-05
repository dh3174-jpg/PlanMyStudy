import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real server actions with a bounded Supabase double. No live
// database credentials or writes are involved in these isolation checks.
const compiled = ts.transpileModule(readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness({ existing = [], stepFailure = false } = {}) {
  const calls = [];
  let authChecks = 0;
  const client = {
    from(table) {
      const query = { table, operation: "select", filters: [], values: null };
      calls.push(query);
      const result = () => {
        if (table === "prompt_chains") {
          if (query.operation === "select") {
            const id = query.filters.find(([key]) => key === "id")?.[1];
            if (id !== undefined) return id === 7
              ? { data: { id: 7 }, error: null }
              : { data: null, error: { message: "Not found" } };
            return { data: existing, error: null };
          }
          if (Array.isArray(query.values)) return {
            data: query.values.map((chain, i) => ({ id: i + 10, name: chain.name })), error: null,
          };
          return { data: { id: 7 }, error: null };
        }
        if (stepFailure && table === "prompt_chain_steps" && query.operation === "insert") {
          return { data: null, error: { message: "Insert failed" } };
        }
        return { data: [{ id: 20, prompt_chain_id: 7, step_order: 1, prompt_text: "First" }, { id: 21, prompt_chain_id: 7, step_order: 2, prompt_text: "Second" }], error: null };
      };
      const builder = {
        select() { return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        in(key, value) { query.filters.push([key, value]); return builder; },
        order() { return builder; }, limit() { return builder; },
        insert(values) { query.operation = "insert"; query.values = values; return builder; },
        update(values) { query.operation = "update"; query.values = values; return builder; },
        upsert(values) { query.operation = "upsert"; query.values = values; return builder; },
        delete() { query.operation = "delete"; return builder; },
        single() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "next/cache") return { revalidatePath() {} };
      if (name === "@/lib/workspace") return { WORKSPACE: "plan-my-study" };
      if (name === "@/lib/auth") return { requireSuperadmin: async () => { authChecks++; return { supabase: client }; } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { actions: exports, calls, authChecks: () => authChecks };
}
const scoped = query => query.filters.some(([key, value]) => key === "workspace" && value === "plan-my-study");

test("every legacy chain mutation is rejected before touching children", async () => {
  for (const kind of ["save-chain", "delete-chain", "save-step", "delete-step", "move-step"]) {
    const h = harness();
    const result = await h.actions.mutate({ kind, chainId: 99, stepId: 20, name: "Changed", prompt: "Changed", direction: "down" });
    assert.match(result.error, /not available in PlanMyStudy/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].operation, "select");
    assert.ok(scoped(h.calls[0]));
    assert.equal(h.authChecks(), 1);
  }
});

test("new chains always receive the workspace, regardless of caller input", async () => {
  const h = harness();
  const result = await h.actions.mutate({ kind: "save-chain", name: "Study", workspace: "legacy" });
  assert.equal(result.error, undefined);
  assert.equal(h.calls[0].values.workspace, "plan-my-study");
});

test("chain updates and deletes also scope their final write", async () => {
  for (const kind of ["save-chain", "delete-chain"]) {
    const h = harness();
    const result = await h.actions.mutate({ kind, chainId: 7, name: "Study" });
    assert.equal(result.error, undefined);
    const writes = h.calls.filter(query => query.table === "prompt_chains" && query.operation !== "select");
    assert.equal(writes.length, 1);
    assert.ok(scoped(writes[0]));
  }
});

test("starter action authenticates, scopes its empty check, and inserts exactly the requested data", async () => {
  const h = harness();
  const result = await h.actions.createStarterChains();
  assert.equal(result.chainId, 10);
  assert.equal(h.authChecks(), 1);
  assert.ok(scoped(h.calls[0]));
  const chains = h.calls.find(query => query.table === "prompt_chains" && query.operation === "insert").values;
  assert.equal(chains.length, 3);
  assert.ok(chains.every(chain => chain.workspace === "plan-my-study"));
  assert.equal(chains[0].name, "Midterm Study Plan");
  const steps = h.calls.find(query => query.table === "prompt_chain_steps").values;
  assert.equal(steps.length, 5);
  assert.ok(steps.every((step, index) => step.prompt_chain_id === 10 && step.step_order === index + 1));
});

test("starter action leaves an existing workspace untouched", async () => {
  const h = harness({ existing: [{ id: 7 }] });
  const result = await h.actions.createStarterChains();
  assert.match(result.error, /already contains chains/);
  assert.equal(h.calls.length, 1);
});

test("failed starter steps clean up only the newly created workspace chains", async () => {
  const h = harness({ stepFailure: true });
  const result = await h.actions.createStarterChains();
  assert.match(result.error, /No starter chains were kept/);
  const cleanup = h.calls.at(-1);
  assert.equal(cleanup.operation, "delete");
  assert.ok(scoped(cleanup));
  assert.equal(JSON.stringify(cleanup.filters.find(([key]) => key === "id")[1]), "[10,11,12]");
});
