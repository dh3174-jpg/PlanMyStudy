import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, Error, ...globals,
    require(name) {
      if (name === "server-only") return {};
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports;
}
const contracts = load("../lib/study-plan.ts");
const inputs = { courses: "Microeconomics", examDates: "Nov 12, 2026", hardestSubjects: "Microeconomics", availability: "Monday 6–9 PM", productiveTime: "Evening", notes: "" };
// Test fixture only; the application never substitutes generated responses.
const plan = { title: "Study Plan", summary: "Focused review", schedule: [{ day: "Monday", time: "6–7 PM", course: "Microeconomics", activity: "Review practice problems" }] };
const output = { recommendedPlan: "balanced", recommendationReason: "Matches the available time", balanced: plan, intensive: plan, flexible: plan };
function runner(fetch) {
  return load("../lib/gemini.ts", { "@/lib/study-plan": contracts }, {
    process: { env: { GEMINI_API_KEY: "test-only" } }, fetch, AbortSignal,
  }).executeStudyChain;
}
const response = (text, finishReason = "STOP") => ({ ok: true, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }) });

test("input validation rejects missing fields, invalid preferences, and oversized data", () => {
  assert.equal(contracts.validateInputs(inputs).courses, "Microeconomics");
  for (const invalid of [{ ...inputs, courses: " " }, { ...inputs, productiveTime: "Night" }, { ...inputs, availability: "x".repeat(6001) }, null]) {
    assert.throws(() => contracts.validateInputs(invalid));
  }
});
test("structured output validation rejects missing plans, invalid recommendations and empty schedules", () => {
  assert.equal(contracts.isStudyOutput(output), true);
  for (const invalid of [{ ...output, flexible: null }, { ...output, recommendedPlan: "other" }, { ...output, balanced: { ...plan, schedule: [] } }, { ...output, recommendationReason: "" }]) {
    assert.equal(contracts.isStudyOutput(invalid), false);
  }
});
test("steps run sequentially with original inputs, own prompt and immediate previous result", async () => {
  const requests = [];
  let active = false;
  const execute = runner(async (_url, options) => {
    assert.equal(active, false);
    active = true;
    const body = JSON.parse(options.body);
    requests.push(body);
    await new Promise(resolve => setTimeout(resolve, 5));
    active = false;
    return response(requests.length === 1 ? "Priority analysis" : requests.length === 2 ? "Allocated time" : JSON.stringify(output));
  });
  const result = await execute([{ prompt_text: "Rank courses" }, { prompt_text: "Allocate" }, { prompt_text: "Format" }], inputs);
  assert.equal(result.recommendedPlan, "balanced");
  const messages = requests.map(body => JSON.parse(body.contents[0].parts[0].text));
  assert.equal(messages[0].previousStepResult, null);
  assert.equal(messages[1].previousStepResult, "Priority analysis");
  assert.equal(messages[2].previousStepResult, "Allocated time");
  assert.deepEqual(messages.map(message => message.prompt), ["Rank courses", "Allocate", "Format"]);
  assert.ok(messages.every(message => message.originalInputs.courses === inputs.courses));
  assert.equal(requests[0].generationConfig.responseMimeType, undefined);
  assert.equal(requests[2].generationConfig.responseMimeType, "application/json");
});
test("provider failures stop the chain and do not expose provider bodies", async () => {
  let calls = 0;
  const execute = runner(async () => { calls++; return { ok: false, status: 429, json: () => { throw new Error("Must not read provider error body"); } }; });
  await assert.rejects(execute([{ prompt_text: "One" }, { prompt_text: "Two" }], inputs), /quota or rate limit/);
  assert.equal(calls, 1);
});
test("empty chains, truncated responses and malformed outputs fail", async () => {
  await assert.rejects(runner(async () => response("unused"))([], inputs), /at least one/);
  await assert.rejects(runner(async () => response(JSON.stringify(output), "MAX_TOKENS"))([{ prompt_text: "One" }], inputs), /incomplete/);
  await assert.rejects(runner(async () => response("not JSON"))([{ prompt_text: "One" }], inputs), /not valid JSON/);
  await assert.rejects(runner(async () => response("{}"))([{ prompt_text: "One" }], inputs), /missing required/);
});

function actionHarness({ legacy = false, failGeneration = false, failSave = false, denyAuth = false } = {}) {
  const calls = [];
  let generated = 0;
  const supabase = { from(table) {
    const query = { table, filters: [], operation: "select" };
    calls.push(query);
    const result = () => {
      if (table === "prompt_chains") return { data: legacy ? null : { id: 7, name: "Midterm" }, error: null };
      if (table === "prompt_chain_steps") return { data: [{ id: 1, prompt_text: "Analyze" }, { id: 2, prompt_text: "Format" }], error: null };
      return { data: failSave ? null : { id: 42, ...query.values }, error: failSave ? {} : null };
    };
    const builder = {
      select() { return builder; }, eq(key, value) { query.filters.push([key, value]); return builder; },
      order(key) { (query.order ??= []).push(key); return builder; },
      insert(values) { query.operation = "insert"; query.values = values; return builder; },
      single() { return Promise.resolve(result()); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  } };
  const actions = load("../app/run-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": { requireSuperadmin: async () => { if (denyAuth) throw new Error("Denied"); return { supabase, user: { id: "real-user" } }; } },
    "@/lib/workspace": { WORKSPACE: "plan-my-study" },
    "@/lib/study-plan": contracts,
    "@/lib/gemini": { executeStudyChain: async () => { generated++; if (failGeneration) throw new Error("Generation failed"); return output; } },
  });
  return { calls, generated: () => generated, run: actions.runChain };
}
test("generation rejects unauthorized users and foreign workspaces before provider work", async () => {
  const denied = actionHarness({ denyAuth: true });
  await assert.rejects(denied.run(7, inputs), /Denied/);
  assert.equal(denied.calls.length, 0);
  const legacy = actionHarness({ legacy: true });
  assert.match((await legacy.run(7, inputs)).error, /not available in PlanMyStudy/);
  assert.equal(legacy.generated(), 0);
  assert.equal(legacy.calls.length, 1);
  assert.ok(legacy.calls[0].filters.some(([key, value]) => key === "workspace" && value === "plan-my-study"));
});
test("successful runs use authenticated user, ordered steps, verified workspace and only existing columns", async () => {
  const h = actionHarness();
  assert.equal((await h.run(7, { ...inputs, user_id: "attacker" })).run.id, 42);
  assert.equal(h.calls[1].order.join(","), "step_order,id");
  const writes = h.calls.filter(query => query.operation === "insert");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values.user_id, "real-user");
  assert.equal(writes[0].values.prompt_chain_id, 7);
  assert.deepEqual(Object.keys(writes[0].values).sort(), ["input_data", "output_data", "prompt_chain_id", "user_id"]);
  assert.equal(writes[0].values.input_data.chainName, "Midterm");
  assert.equal(h.calls.filter(query => query.table === "prompt_chains").length, 2);
});
test("failed generation never inserts a run; failed persistence reports failure", async () => {
  const failed = actionHarness({ failGeneration: true });
  assert.match((await failed.run(7, inputs)).error, /Generation failed/);
  assert.ok(failed.calls.every(query => query.operation !== "insert"));
  assert.match((await actionHarness({ failSave: true }).run(7, inputs)).error, /could not be saved/);
});
