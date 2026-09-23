import { test } from "node:test";
import assert from "node:assert/strict";
import type { Content } from "@google/genai";
import { runAgent, type GenerateFn, type ModelTurn } from "./runner.js";
import type { CoachEvent, CoachTool } from "./types.js";

const ctx = { userId: "u1", signedLanguage: "ase" };

function scripted(turns: ModelTurn[]) {
  const calls: Content[][] = [];
  const generate: GenerateFn = async (contents) => {
    calls.push(contents.map((c) => ({ ...c })));
    return turns[Math.min(calls.length - 1, turns.length - 1)]!;
  };
  return { generate, calls };
}

const echoTool: CoachTool = {
  name: "echo",
  label: "Echoing",
  description: "",
  parameters: { type: "object" },
  async run(_ctx, args) {
    return {
      output: { echoed: args.value },
      summary: `echo ${String(args.value)}`,
      card: { type: "signs", phrases: [String(args.value)] },
    };
  },
};

const failingTool: CoachTool = {
  name: "boom",
  label: "Failing",
  description: "",
  parameters: { type: "object" },
  async run() {
    throw new Error("kaboom");
  },
};

let n = 0;
const newId = () => `s${++n}`;

test("runAgent: tanpa tool -> langsung jawab teks", async () => {
  const { generate } = scripted([{ text: "Hi there" }]);
  const events: CoachEvent[] = [];
  const res = await runAgent({ generate, tools: [], ctx, history: [], message: "hi", emit: (e) => void events.push(e), newId });
  assert.equal(res.text, "Hi there");
  assert.equal(res.steps.length, 0);
  assert.equal(events.length, 0);
});

test("runAgent: jalankan tool, kirim hasil balik, lalu jawab", async () => {
  const { generate, calls } = scripted([
    { functionCalls: [{ id: "c1", name: "echo", args: { value: "hello" } }] },
    { text: "Done!" },
  ]);
  const events: CoachEvent[] = [];
  const res = await runAgent({ generate, tools: [echoTool], ctx, history: [], message: "go", emit: (e) => void events.push(e), newId });

  assert.equal(res.text, "Done!");
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0]!.status, "done");
  assert.equal(res.steps[0]!.summary, "echo hello");
  assert.deepEqual(res.cards, [{ type: "signs", phrases: ["hello"] }]);
  // step running -> card -> step done
  assert.deepEqual(events.map((e) => e.type), ["step", "card", "step"]);

  // Giliran kedua menerima: user msg, model function call, user function response.
  const second = calls[1]!;
  assert.equal(second.length, 3);
  const response = second[2]!.parts![0]!.functionResponse!;
  assert.equal(response.name, "echo");
  assert.equal(response.id, "c1");
  assert.deepEqual(response.response, { echoed: "hello" });
});

test("runAgent: error tool & tool tak dikenal diteruskan ke model, tidak crash", async () => {
  const { generate, calls } = scripted([
    { functionCalls: [{ name: "boom", args: {} }, { name: "nope", args: {} }] },
    { text: "Recovered" },
  ]);
  const res = await runAgent({ generate, tools: [failingTool], ctx, history: [], message: "x", emit: () => {}, newId });
  assert.equal(res.text, "Recovered");
  assert.deepEqual(res.steps.map((s) => s.status), ["error", "error"]);
  const parts = calls[1]![2]!.parts!;
  assert.deepEqual(parts[0]!.functionResponse!.response, { error: "kaboom" });
  assert.match(String(parts[1]!.functionResponse!.response!.error), /Unknown tool/);
});

test("runAgent: berhenti di maxSteps walau model terus memanggil tool", async () => {
  const { generate, calls } = scripted([
    { functionCalls: [{ name: "echo", args: { value: 1 } }] },
  ]);
  const res = await runAgent({ generate, tools: [echoTool], ctx, history: [], message: "loop", emit: () => {}, maxSteps: 3, newId });
  assert.equal(calls.length, 3);
  assert.equal(res.steps.length, 2); // giliran terakhir tidak menjalankan tool
  assert.ok(res.text.length > 0);
  const lastPrompt = calls[2]!.at(-1)!.parts![0]!.text!;
  assert.match(lastPrompt, /final answer/);
});

test("runAgent: riwayat ikut dikirim sebelum pesan baru", async () => {
  const { generate, calls } = scripted([{ text: "ok" }]);
  const history: Content[] = [
    { role: "user", parts: [{ text: "earlier" }] },
    { role: "model", parts: [{ text: "reply" }] },
  ];
  await runAgent({ generate, tools: [], ctx, history, message: "now", emit: () => {}, newId });
  assert.deepEqual(
    calls[0]!.map((c) => c.parts![0]!.text),
    ["earlier", "reply", "now"],
  );
});
