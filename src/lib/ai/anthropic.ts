import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiTask, BatchResult, GenerateRequest } from "./provider";

// Claude models per task (docs/decisions.md). Override in .env.local.
// Helper and the leak check are short, frequent calls: Haiku 4.5. Marking and question writing need judgement: Sonnet 5.
const MODELS: Record<AiTask, string> = {
  helper: process.env.ANTHROPIC_MODEL_HELPER || "claude-haiku-4-5",
  leak: process.env.ANTHROPIC_MODEL_LEAK || "claude-haiku-4-5",
  marking: process.env.ANTHROPIC_MODEL_MARKING || "claude-sonnet-5",
  generate: process.env.ANTHROPIC_MODEL_GENERATE || "claude-sonnet-5",
};

const MAX_TOKENS: Record<AiTask, number> = { helper: 600, leak: 200, marking: 8000, generate: 16000 };

// Haiku 4.5 takes temperature but not effort; Sonnet 5 / Opus 5 take effort but reject sampling parameters.
const isHaiku = (model: string) => model.startsWith("claude-haiku");
const EFFORT: Partial<Record<AiTask, "low" | "medium" | "high">> = { marking: "medium", generate: "medium", helper: "low", leak: "low" };

function params(req: GenerateRequest): Anthropic.MessageCreateParamsNonStreaming {
  const model = MODELS[req.task];
  const messages: Anthropic.MessageParam[] = req.turns.map((t, i) => {
    const last = i === req.turns.length - 1 && t.role === "user";
    if (!last || !req.images?.length) return { role: t.role, content: t.text };
    return {
      role: "user",
      content: [
        ...req.images.map(
          (img): Anthropic.ImageBlockParam => ({
            type: "image",
            source: { type: "base64", media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: img.base64 },
          }),
        ),
        { type: "text", text: t.text },
      ],
    };
  });
  const json = req.json ? "\n\nReply with the JSON object only, no other text." : "";
  return {
    model,
    max_tokens: req.maxTokens ?? MAX_TOKENS[req.task],
    // The system prompt (rules + question + mark scheme) is stable per question: cache it across Helper turns.
    ...(req.system || json
      ? { system: [{ type: "text" as const, text: (req.system ?? "") + json, cache_control: { type: "ephemeral" as const } }] }
      : {}),
    messages,
    ...(isHaiku(model)
      ? req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}
      : EFFORT[req.task]
        ? { output_config: { effort: EFFORT[req.task]! } }
        : {}),
  };
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason === "refusal") throw new Error("Claude declined this request");
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  /** `options` lets tests pass a fake fetch and base URL, so no real request is made. */
  constructor(apiKey: string, options: Omit<ConstructorParameters<typeof Anthropic>[0] & object, "apiKey"> = {}) {
    this.client = new Anthropic({ apiKey, ...options });
  }

  async generate(req: GenerateRequest): Promise<string> {
    return textOf(await this.client.messages.create(params(req)));
  }

  async submitBatch(requests: { id: string; req: GenerateRequest }[]): Promise<string> {
    const batch = await this.client.messages.batches.create({
      requests: requests.map(({ id, req }) => ({ custom_id: id, params: params(req) })),
    });
    return batch.id;
  }

  async collectBatch(batchId: string): Promise<BatchResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") return { status: "pending" };
    const results = new Map<string, { text: string } | { error: string }>();
    for await (const r of await this.client.messages.batches.results(batchId)) {
      if (r.result.type === "succeeded") {
        try {
          results.set(r.custom_id, { text: textOf(r.result.message) });
        } catch (e) {
          results.set(r.custom_id, { error: e instanceof Error ? e.message : "failed" });
        }
      } else {
        results.set(r.custom_id, { error: r.result.type });
      }
    }
    return { status: "ended", results };
  }
}
