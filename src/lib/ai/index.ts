import "server-only";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { AiNotConfiguredError, type AiProvider, type GenerateRequest } from "./provider";

export * from "./provider";

let provider: AiProvider | null = null;

/** Claude when ANTHROPIC_API_KEY is set (or AI_PROVIDER=anthropic), else Gemini. */
function pick(): AiProvider {
  const want = process.env.AI_PROVIDER;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if ((want === "anthropic" || (!want && claudeKey)) && claudeKey) return new AnthropicProvider(claudeKey);
  if ((want === "gemini" || !want) && geminiKey) return new GeminiProvider(geminiKey);
  throw new AiNotConfiguredError();
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
}

export function ai(): AiProvider {
  provider ??= pick();
  return provider;
}

/** Pulls the JSON object out of a reply (models sometimes wrap it in fences or a sentence). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/g, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(t.slice(start, end + 1));
}

/** JSON call with one retry on bad JSON (docs/ai-prompts.md). */
export async function generateJson<T>(req: Omit<GenerateRequest, "json">, validate: (v: unknown) => v is T): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const turns =
      attempt === 0
        ? req.turns
        : [...req.turns, { role: "user" as const, text: `Your last reply was not valid JSON for the schema (${lastError}). Return only the JSON object.` }];
    const text = await ai().generate({ ...req, turns, json: true });
    try {
      const value = extractJson(text);
      if (validate(value)) return value;
      lastError = "schema mismatch";
    } catch (e) {
      lastError = e instanceof Error ? e.message : "parse error";
    }
  }
  throw new Error(`AI returned invalid JSON twice: ${lastError}`);
}
