// Finds the chat id to put in .env.local, using the bot token already there.
//   1. Message your bot once in Telegram (anything).
//   2. npm run notify:chatid
import { loadEnv } from "./env";

type Update = { message?: { chat?: { id: number; type: string; title?: string; first_name?: string; username?: string } } };

async function main() {
  loadEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("Set TELEGRAM_BOT_TOKEN in .env.local first (docs/deploy.md).");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const body = (await res.json()) as { ok: boolean; description?: string; result?: Update[] };
  if (!body.ok) {
    console.error(`Telegram said no: ${body.description ?? res.status}. Check the token.`);
    process.exit(1);
  }
  const chats = new Map<number, string>();
  for (const u of body.result ?? []) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, [c.title, c.first_name, c.username && `@${c.username}`, c.type].filter(Boolean).join(" · "));
  }
  if (chats.size === 0) {
    console.log("Nothing yet. Open Telegram, send your bot any message, then run this again.");
    console.log("(Telegram only keeps the last 24 hours of messages a bot hasn't collected.)");
    process.exit(1);
  }
  console.log("Put one of these in .env.local as TELEGRAM_CHAT_ID:\n");
  for (const [id, who] of chats) console.log(`  ${id}   ${who}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
