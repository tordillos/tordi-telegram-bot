import { Bot, webhookCallback } from "grammy";
import { Env, NewsArticle } from "./types";
import { getWeather } from "./weather";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.command("start", (ctx) =>
    ctx.reply(
      "Bot de noticias de Tordillos activo. Monitorizo La Gaceta de Salamanca y Noticias a Tiempo."
    )
  );

  bot.command("status", (ctx) =>
    ctx.reply("El bot está funcionando correctamente.")
  );

  bot.command("tiempo", async (ctx) => {
    try {
      const message = await getWeather();
      await ctx.reply(message, { parse_mode: "HTML" });
    } catch {
      await ctx.reply("No he podido obtener el tiempo. Inténtalo más tarde.");
    }
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
