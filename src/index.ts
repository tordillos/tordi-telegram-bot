import { Env } from "./types";
import { createBot, createWebhookHandler, sendNewsToGroup } from "./bot";
import { setupForwarder } from "./forwarder";
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
        setupForwarder(bot, env);
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
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(processNews(env));
  },
};

async function processNews(env: Env) {
  if (!env.GROUP_CHAT_ID) {
    console.error("GROUP_CHAT_ID not configured, skipping news check");
    return;
  }

  const bot = createBot(env);

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

  // Send Gaceta articles (filtered by "tordillos")
  for (const article of gacetaArticles) {
    await sendNewsToGroup(bot, env.GROUP_CHAT_ID, article);
  }
  if (gacetaArticles.length > 0) {
    await markGacetaSent(env, gacetaArticles);
  }

  // Send Noticias a Tiempo articles
  for (const article of noticiasArticles) {
    await sendNewsToGroup(bot, env.GROUP_CHAT_ID, article);
  }
  if (noticiasArticles.length > 0) {
    await markNoticiasSent(env, noticiasArticles);
  }

  console.log(
    `News check complete: ${gacetaArticles.length} gaceta, ${noticiasArticles.length} noticias`
  );
}
