import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { TASK_TIER, type AiProvider, type GenerateRequest } from "./provider";

// Free-tier models as of 2026-09 (docs/decisions.md). Override in .env.local.
// The free tier often answers 503/429 under load, so each tier falls back to other free models.
const MODELS = {
  main: [process.env.GEMINI_MODEL_MAIN || "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash"],
  light: [process.env.GEMINI_MODEL_LIGHT || "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"],
};

const retryable = (e: unknown) => {
  const status = (e as { status?: number })?.status;
  // 404: model retired for new keys; try the next one
  return status === 404 || status === 429 || status === 500 || status === 503 || status === 504;
};

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(req: GenerateRequest): Promise<string> {
    const contents: Content[] = req.turns.map((t, i) => {
      const parts: Part[] = [{ text: t.text }];
      // Images ride along with the last user turn.
      if (i === req.turns.length - 1 && t.role === "user") {
        for (const img of req.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
      return { role: t.role === "assistant" ? "model" : "user", parts };
    });

    const models = [...new Set(MODELS[TASK_TIER[req.task]])];
    let lastError: unknown;
    for (const [pass, model] of [...models.map((m) => [0, m] as const), ...models.map((m) => [1, m] as const)]) {
      if (pass === 1 && model === models[0]) await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await this.client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: req.system,
            temperature: req.temperature,
            responseMimeType: req.json ? "application/json" : undefined,
          },
        });
        return res.text ?? "";
      } catch (e) {
        lastError = e;
        if (!retryable(e)) throw e;
        console.warn(`gemini ${model} unavailable, trying the next model`);
      }
    }
    throw lastError;
  }
}
