import { Bot, webhookCallback } from "grammy";
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

export async function sendNewsToGroup(
  bot: Bot,
  chatId: string,
  article: NewsArticle
) {
  const message = [
    `<b>${escapeHtml(article.title)}</b>`,
    "",
    article.summary ? escapeHtml(article.summary) : "",
    "",
    `<a href="${escapeHtml(article.url)}">Leer más</a>`,
    `<i>Fuente: ${escapeHtml(article.source)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");

  await bot.api.sendMessage(chatId, message, { parse_mode: "HTML" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
