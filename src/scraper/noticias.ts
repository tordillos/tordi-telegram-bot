import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const BASE_URL = "https://noticiasatiempo.es";
const RSS_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml"];

async function tryRssFeeds(): Promise<NewsArticle[]> {
  for (const path of RSS_PATHS) {
    const articles = await fetchRss(`${BASE_URL}${path}`, "Noticias a Tiempo");
    if (articles.length > 0) {
      return articles;
    }
  }
  return [];
}

function extractArticlesFromHtml(html: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  // Match anchor tags with href containing the base domain and article-like paths
  const linkRegex =
    /<a[^>]+href=["'](https?:\/\/(?:www\.)?noticiasatiempo\.es\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;
  const seenUrls = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim();

    // Skip navigation/category links, only take article-like URLs
    if (
      !title ||
      title.length < 10 ||
      seenUrls.has(url) ||
      url.endsWith("/") && url.split("/").length <= 4
    ) {
      continue;
    }

    seenUrls.add(url);
    articles.push({
      title,
      url,
      summary: "",
      source: "Noticias a Tiempo",
      publishedAt: "",
    });
  }

  return articles;
}

async function scrapeHomepage(): Promise<NewsArticle[]> {
  try {
    const response = await fetch(BASE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TordiBot/1.0; +https://github.com/tordillos/tordi-telegram-bot)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.error(`Homepage scrape failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    return extractArticlesFromHtml(html);
  } catch (error) {
    console.error("Homepage scrape error:", error);
    return [];
  }
}

export async function fetchNoticiasNews(env: Env): Promise<NewsArticle[]> {
  let articles = await tryRssFeeds();

  if (articles.length === 0) {
    articles = await scrapeHomepage();
  }

  const newArticles: NewsArticle[] = [];
  for (const article of articles) {
    const existing = await env.NEWS_KV.get(`noticias:${article.url}`);
    if (!existing) {
      newArticles.push(article);
    }
  }

  return newArticles;
}

export async function markAsSent(env: Env, articles: NewsArticle[]) {
  for (const article of articles) {
    await env.NEWS_KV.put(`noticias:${article.url}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
