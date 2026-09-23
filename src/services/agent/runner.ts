import type { Content, FunctionCall, Part } from "@google/genai";
import type { CoachCard, CoachEvent, CoachStep, CoachTool, ToolContext } from "./types.js";

/** Satu giliran model: teks dan/atau function call, plus konten mentah untuk riwayat. */
export interface ModelTurn {
  text?: string;
  functionCalls?: FunctionCall[];
  content?: Content;
}

export type GenerateFn = (contents: Content[]) => Promise<ModelTurn>;

export interface RunAgentInput {
  generate: GenerateFn;
  tools: CoachTool[];
  ctx: ToolContext;
  /** Riwayat percakapan (user/model) sebelum pesan ini. */
  history: Content[];
  message: string;
  emit: (event: CoachEvent) => void | Promise<void>;
  maxSteps?: number;
  /** Pembuat id langkah (bisa diganti di test). */
  newId?: () => string;
}

export interface RunAgentResult {
  text: string;
  steps: CoachStep[];
  cards: CoachCard[];
}

const FALLBACK_TEXT =
  "I did what I could for now — take a look at the results above and tell me what to do next.";

/**
 * Loop agent: model memanggil tool -> hasil dikirim balik -> ulangi sampai model
 * menjawab dengan teks atau batas langkah tercapai. Setiap langkah & kartu
 * di-emit supaya FE bisa menampilkan progres secara langsung.
 */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { generate, tools, ctx, emit } = input;
  const maxSteps = input.maxSteps ?? 8;
  const newId = input.newId ?? (() => crypto.randomUUID());
  const byName = new Map(tools.map((t) => [t.name, t]));

  const contents: Content[] = [
    ...input.history,
    { role: "user", parts: [{ text: input.message }] },
  ];
  const steps: CoachStep[] = [];
  const cards: CoachCard[] = [];

  for (let turn = 0; turn < maxSteps; turn++) {
    // Giliran terakhir: paksa model menjawab tanpa tool.
    const isLast = turn === maxSteps - 1;
    const result = await generate(
      isLast
        ? [
            ...contents,
            {
              role: "user",
              parts: [{ text: "Stop using tools now and give the learner your final answer." }],
            },
          ]
        : contents,
    );

    const calls = result.functionCalls ?? [];
    if (calls.length === 0 || isLast) {
      const text = result.text?.trim() || FALLBACK_TEXT;
      return { text, steps, cards };
    }

    contents.push(
      result.content ?? { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) },
    );

    const responses: Part[] = [];
    for (const call of calls) {
      const tool = call.name ? byName.get(call.name) : undefined;
      const step: CoachStep = {
        id: newId(),
        tool: call.name ?? "unknown",
        label: tool?.label ?? "Thinking",
        status: "running",
      };
      steps.push(step);
      await emit({ type: "step", step: { ...step } });

      let output: Record<string, unknown>;
      try {
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        const res = await tool.run(ctx, (call.args ?? {}) as Record<string, unknown>);
        output = res.output;
        step.status = "done";
        step.summary = res.summary;
        if (res.card) {
          cards.push(res.card);
          await emit({ type: "card", card: res.card });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output = { error: message };
        step.status = "error";
        step.summary = message;
      }
      await emit({ type: "step", step: { ...step } });
      responses.push({
        functionResponse: { id: call.id, name: call.name, response: output },
      });
    }
    contents.push({ role: "user", parts: responses });
  }

  return { text: FALLBACK_TEXT, steps, cards };
}
