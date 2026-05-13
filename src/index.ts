import { Env, NewsArticle } from "./types";
import {
  createBot,
  createWebhookHandler,
  sendMessageWithMigration,
  sendNewsToGroup,
} from "./bot";
import { getWeather } from "./weather";
import {
  fetchGacetaNews,
  markAsSent as markGacetaSent,
} from "./scraper/gaceta";
import {
  fetchNoticiasNews,
  markAsSent as markNoticiasSent,
} from "./scraper/noticias";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Setup endpoint: registers the webhook with Telegram
    if (url.pathname === "/setup") {
      const webhookUrl = `${url.origin}/webhook`;
      const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      const response = await fetch(telegramUrl);
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debug endpoint: check webhook status
    if (url.pathname === "/webhookinfo") {
      const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`;
      const response = await fetch(telegramUrl);
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Webhook endpoint: handle Telegram updates
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const body = await request.clone().text();
        console.log("Webhook received:", body);
        const bot = createBot(env);
        const handler = createWebhookHandler(bot);
        return await handler(request);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : "";
        console.error("Webhook error:", message, stack);
        return new Response("OK", { status: 200 });
      }
    }

    return new Response("Tordi Telegram Bot is running", { status: 200 });
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // Daily weather at 8:00 UTC (10:00 CEST / 9:00 CET)
    if (event.cron === "0 8 * * *") {
      ctx.waitUntil(sendDailyWeather(env));
    } else {
      ctx.waitUntil(processNews(env));
    }
  },
};

async function sendDailyWeather(env: Env) {
  if (!env.GROUP_CHAT_ID) {
    console.error("GROUP_CHAT_ID not configured, skipping weather");
    return;
  }

  try {
    const bot = createBot(env);
    const message = await getWeather();
    await sendMessageWithMigration(bot, env.GROUP_CHAT_ID, message, {
      parse_mode: "HTML",
    });
    console.log("Daily weather sent to group");
  } catch (err) {
    console.error("Daily weather error:", err);
  }
}

async function processNews(env: Env) {
  if (!env.GROUP_CHAT_ID) {
    console.error("GROUP_CHAT_ID not configured, skipping news check");
    return;
  }

  const bot = createBot(env);
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  // Fetch news from both sources in parallel
  const [gacetaArticles, noticiasArticles] = await Promise.all([
    fetchGacetaNews(env).catch((err) => {
      console.error("Gaceta fetch error:", err);
      return [];
    }),
    fetchNoticiasNews(env).catch((err) => {
      console.error("Noticias fetch error:", err);
      return [];
    }),
  ]);

  const isRecent = (a: NewsArticle) => {
    if (!a.publishedAt) return true;
    const published = new Date(a.publishedAt).getTime();
    return !isNaN(published) && Date.now() - published < MAX_AGE_MS;
  };

  const recentGaceta = gacetaArticles.filter(isRecent);
  const recentNoticias = noticiasArticles.filter(isRecent);

  for (const article of recentGaceta) {
    await sendNewsToGroup(bot, env.GROUP_CHAT_ID, article);
  }
  if (recentGaceta.length > 0) {
    await markGacetaSent(env, recentGaceta);
  }

  for (const article of recentNoticias) {
    await sendNewsToGroup(bot, env.GROUP_CHAT_ID, article);
  }
  if (recentNoticias.length > 0) {
    await markNoticiasSent(env, recentNoticias);
  }

  const skippedGaceta = gacetaArticles.length - recentGaceta.length;
  const skippedNoticias = noticiasArticles.length - recentNoticias.length;
  console.log(
    `News check complete: ${recentGaceta.length} gaceta, ${recentNoticias.length} noticias (skipped old: ${skippedGaceta} gaceta, ${skippedNoticias} noticias)`
  );
}
