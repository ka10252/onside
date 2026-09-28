// Sends one message to the tutor's Telegram, to check the token and chat id are right.
//   npm run notify:test
import Module from "node:module";
import path from "node:path";
const m = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = m._resolveFilename;
m._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(process.cwd(), "scripts", "empty.cjs");
  return original.call(this, req, ...rest);
};
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local first (docs/deploy.md).");
    process.exit(1);
  }
  const { send, submittedMessage } = await import("../src/lib/notify");
  const ok = await send(
    submittedMessage(
      { name: "Test student", title: "Daily practice · Unit 16", student_id: "u_test", questions: 5, minutes: 12, ai_questions: 2, hints: 1 },
      "asg_test",
      process.env.ONSIDE_URL ?? null,
    ),
  );
  console.log(ok ? "Sent. Check your phone." : "Telegram turned it down — see the message above.");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
