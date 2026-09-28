import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, send, submittedMessage } from "./notify";

// No real Telegram calls: every request goes to a fake fetch.
const a = { name: "홍길동", title: "Daily practice · Unit 16 · 28 Sept", student_id: "u1", questions: 5, minutes: 12, ai_questions: 2, hints: 1 };

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

describe("submittedMessage", () => {
  it("says who, what and how it went, with a link to the marking screen", () => {
    expect(submittedMessage(a, "asg_1", "https://onside.example")).toBe(
      "<b>홍길동</b> submitted\nDaily practice · Unit 16 · 28 Sept\n5 questions · 12 min · 1 hint · Helper ×2\nhttps://onside.example/tutor/students/u1/a/asg_1",
    );
  });
  it("says so plainly when no help was used", () => {
    expect(submittedMessage({ ...a, hints: 0, ai_questions: 0 }, "asg_1", null)).toContain("5 questions · 12 min · no help");
  });
  it("leaves out a time nobody recorded, and the link when the address is unknown", () => {
    const out = submittedMessage({ ...a, minutes: 0, hints: 0, ai_questions: 0 }, "asg_1", null);
    expect(out).toBe("<b>홍길동</b> submitted\nDaily practice · Unit 16 · 28 Sept\n5 questions · no help");
  });
  it("escapes a title that would break Telegram's HTML", () => {
    expect(submittedMessage({ ...a, title: "Costs <AC> & revenue" }, "asg_1", null)).toContain("Costs &lt;AC&gt; &amp; revenue");
  });
  it("escapes on its own", () => {
    expect(escapeHtml('a & b < c > d')).toBe("a &amp; b &lt; c &gt; d");
  });
});

describe("send", () => {
  it("does nothing at all without the two settings", async () => {
    const fake = vi.fn();
    expect(await send("hi", fake as unknown as typeof fetch)).toBe(false);
    expect(fake).not.toHaveBeenCalled();
  });
  it("posts to the bot with the chat and HTML mode", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:fake";
    process.env.TELEGRAM_CHAT_ID = "999";
    const fake = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await send("hi", fake as unknown as typeof fetch)).toBe(true);
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:fake/sendMessage");
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: "999", text: "hi", parse_mode: "HTML" });
  });
  it("swallows a refusal rather than failing the submit", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:fake";
    process.env.TELEGRAM_CHAT_ID = "999";
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await send("hi", failing as unknown as typeof fetch)).toBe(false);
  });
});
