import { beforeEach, describe, expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic";

// No real API calls: every request goes to this fake fetch (see memory: no paid API in tests).
type Captured = { url: string; body: Record<string, unknown> };
let calls: Captured[] = [];

const message = (text: string) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "fake",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, body });
  const json = url.includes("/batches")
    ? { id: "msgbatch_test", type: "message_batch", processing_status: "in_progress", request_counts: {} }
    : message('{"ok": true}');
  return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
};

const provider = () =>
  new AnthropicProvider("sk-test-not-real", { fetch: fakeFetch as typeof fetch, baseURL: "http://fake.invalid", maxRetries: 0 });

beforeEach(() => {
  calls = [];
});

describe("AnthropicProvider (fake fetch)", () => {
  it("sends Helper turns to Haiku with a cached system prompt and no effort", async () => {
    const text = await provider().generate({
      task: "helper",
      system: "Rules and question",
      temperature: 0.3,
      turns: [{ role: "user", text: "What do I do first?" }],
      json: true,
    });
    expect(text).toBe('{"ok": true}');
    const b = calls[0]!.body;
    expect(calls[0]!.url).toContain("fake.invalid/v1/messages");
    expect(b.model).toBe("claude-haiku-4-5");
    expect(b.temperature).toBe(0.3);
    expect(b.output_config).toBeUndefined();
    const system = b.system as { text: string; cache_control: unknown }[];
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[0]!.text).toContain("JSON object only");
  });

  it("sends marking to Sonnet 5 with effort and without sampling parameters", async () => {
    await provider().generate({
      task: "marking",
      temperature: 0,
      system: "Mark scheme",
      images: [{ mimeType: "image/png", base64: "AAAA" }],
      turns: [{ role: "user", text: "Student answer" }],
    });
    const b = calls[0]!.body;
    expect(b.model).toBe("claude-sonnet-5");
    expect(b.temperature).toBeUndefined();
    expect(b.output_config).toEqual({ effort: "medium" });
    const content = (b.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
  });

  it("submits marking as one batch with custom ids", async () => {
    const id = await provider().submitBatch([
      { id: "rsp_1", req: { task: "marking", turns: [{ role: "user", text: "a" }] } },
      { id: "rsp_2", req: { task: "marking", turns: [{ role: "user", text: "b" }] } },
    ]);
    expect(id).toBe("msgbatch_test");
    expect(calls[0]!.url).toContain("/v1/messages/batches");
    const reqs = calls[0]!.body.requests as { custom_id: string; params: { model: string } }[];
    expect(reqs.map((r) => r.custom_id)).toEqual(["rsp_1", "rsp_2"]);
    expect(reqs[0]!.params.model).toBe("claude-sonnet-5");
  });
});
