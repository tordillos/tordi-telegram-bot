import { Bot, GrammyError, webhookCallback } from "grammy";
import { Env, NewsArticle } from "./types";
import { getWeather } from "./weather";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    console.log(
      `Update received: chat=${ctx.chat?.id}, text=${ctx.message?.text ?? ""}`
    );
    await next();
  });

  bot.command("start", async (ctx) => {
    console.log(`/start from chat ${ctx.chat?.id}`);
    await ctx.reply("Bot de noticias de Tordillos activo.");
  });

  bot.command("status", async (ctx) => {
    console.log(`/status from chat ${ctx.chat?.id}`);
    await ctx.reply("El bot está funcionando correctamente.");
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`Chat ID: ${ctx.chat?.id}`);
  });

  bot.command("tiempo", async (ctx) => {
    try {
      const message = await getWeather();
      await ctx.reply(message, { parse_mode: "HTML" });
    } catch {
      await ctx.reply("No he podido obtener el tiempo. Inténtalo más tarde.");
    }
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}

export function createWebhookHandler(bot: Bot) {
  return webhookCallback(bot, "cloudflare-mod");
}

export async function sendMessageWithMigration(
  bot: Bot,
  chatId: string | number,
  text: string,
  options?: { parse_mode?: "HTML" }
) {
  try {
    await bot.api.sendMessage(chatId, text, options);
  } catch (err) {
    if (
      err instanceof GrammyError &&
      err.description.includes("upgraded to a supergroup chat")
    ) {
      const newChatId = err.parameters?.migrate_to_chat_id;
      if (newChatId) {
        console.log(
          `Chat migrated from ${chatId} to ${newChatId}. Update GROUP_CHAT_ID!`
        );
        await bot.api.sendMessage(newChatId, text, options);
        return;
      }
    }
    throw err;
  }
}

export async function sendNewsToGroup(
  bot: Bot,
  chatId: string,
  article: NewsArticle
) {
  const caption = [
    `<b>${escapeHtml(article.title)}</b>`,
    "",
    article.summary ? escapeHtml(article.summary) : "",
    "",
    `<a href="${escapeHtml(article.url)}">Leer más</a>`,
    `<i>Fuente: ${escapeHtml(article.source)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");

  if (article.imageUrl) {
    try {
      await bot.api.sendPhoto(chatId, article.imageUrl, {
        caption,
        parse_mode: "HTML",
      });
      return;
    } catch (err) {
      console.error("Failed to send photo, falling back to text:", err);
    }
  }

  await sendMessageWithMigration(bot, chatId, caption, { parse_mode: "HTML" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
