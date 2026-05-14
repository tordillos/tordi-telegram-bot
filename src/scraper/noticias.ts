import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const BASE_URL = "https://noticiasatiempo.es";
const RSS_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml"];
const KEYWORD = "tordillos";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function articleKey(article: NewsArticle): string {
  try {
    const path = new URL(article.url).pathname.replace(/\/$/, "");
    const slug = path.split("/").pop() || path;
    return slug;
  } catch {
    return article.url;
  }
}

async function tryRssFeeds(): Promise<NewsArticle[]> {
  for (const path of RSS_PATHS) {
    const articles = await fetchRss(`${BASE_URL}${path}`, "Noticias a Tiempo");
    if (articles.length > 0) {
      return articles;
    }
  }
  return [];
}

function extractDateFromUrl(url: string): string {
  const match = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`).toUTCString();
  }
  return "";
}

function findNearbyImage(html: string, linkIndex: number): string | undefined {
  const searchStart = Math.max(0, linkIndex - 500);
  const context = html.substring(searchStart, linkIndex);
  const imgMatches = [...context.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
  if (imgMatches.length > 0) {
    const src = imgMatches[imgMatches.length - 1][1];
    if (src.startsWith("http")) return src;
  }
  return undefined;
}

function extractArticlesFromHtml(html: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const linkRegex =
    /<a[^>]+href=["'](https?:\/\/(?:www\.)?noticiasatiempo\.es\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;
  const seenKeys = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim();

    if (
      !title ||
      title.length < 10 ||
      (url.endsWith("/") && url.split("/").length <= 4)
    ) {
      continue;
    }

    const article: NewsArticle = {
      title,
      url,
      summary: "",
      source: "Noticias a Tiempo",
      publishedAt: extractDateFromUrl(url),
      imageUrl: findNearbyImage(html, match.index),
    };
    const key = articleKey(article);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    articles.push(article);
  }

  return articles;
}

async function scrapeHomepage(): Promise<NewsArticle[]> {
  try {
    const response = await fetch(BASE_URL, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
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

function matchesKeyword(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return text.includes(KEYWORD);
}

export async function fetchNoticiasNews(env: Env): Promise<NewsArticle[]> {
  let articles = await tryRssFeeds();

  if (articles.length === 0) {
    articles = await scrapeHomepage();
  }

  const filtered = articles.filter(matchesKeyword);

  const newArticles: NewsArticle[] = [];
  for (const article of filtered) {
    const key = articleKey(article);
    const existing = await env.NEWS_KV.get(`noticias:${key}`);
    if (!existing) {
      newArticles.push(article);
    }
  }

  return newArticles;
}

export async function markAsSent(env: Env, articles: NewsArticle[]) {
  for (const article of articles) {
    const key = articleKey(article);
    await env.NEWS_KV.put(`noticias:${key}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }
}
