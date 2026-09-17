// Provider-neutral AI interface. Feature code (Helper, marking, diagram check…) talks to this,
// never to a vendor SDK, so the provider can be swapped without touching features.

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ImageInput = { mimeType: string; base64: string };

/** What the call is for. Each provider maps tasks to its own models (see gemini.ts, anthropic.ts). */
export type AiTask = "helper" | "leak" | "marking" | "generate";

export const TASK_TIER: Record<AiTask, "main" | "light"> = { helper: "main", leak: "light", marking: "main", generate: "main" };

export type GenerateRequest = {
  task: AiTask;
  system?: string;
  turns: ChatTurn[];
  images?: ImageInput[];
  /** Ask for a JSON object; the caller validates it. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export type BatchResult = { status: "pending" } | { status: "ended"; results: Map<string, { text: string } | { error: string }> };

export interface AiProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<string>;
  /** Optional half-price batch processing (used for marking). */
  submitBatch?(requests: { id: string; req: GenerateRequest }[]): Promise<string>;
  collectBatch?(batchId: string): Promise<BatchResult>;
}

export class AiNotConfiguredError extends Error {
  constructor(message = "AI is not configured. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env.local and restart the dev server.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}
