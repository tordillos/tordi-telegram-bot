import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const BASE_URL = "https://noticiasatiempo.es";
const KEYWORD = "tordillos";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TORDILLOS_FEEDS = [
  `${BASE_URL}/tag/tordillos/feed/`,
  `${BASE_URL}/etiqueta/tordillos/feed/`,
];
const TORDILLOS_PAGES = [
  `${BASE_URL}/tag/tordillos/`,
  `${BASE_URL}/etiqueta/tordillos/`,
  `${BASE_URL}/?s=tordillos`,
];
const GENERAL_RSS_PATHS = ["/feed", "/rss", "/feed.xml"];

function articleKey(article: NewsArticle): string {
  try {
    const path = new URL(article.url).pathname.replace(/\/$/, "");
    const slug = path.split("/").pop() || path;
    return slug;
  } catch {
    return article.url;
  }
}

function extractDateFromUrl(url: string): string {
  const slashed = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (slashed) {
    return new Date(
      `${slashed[1]}-${slashed[2]}-${slashed[3]}T00:00:00Z`
    ).toUTCString();
  }
  const compact = url.match(/\/(\d{4})(\d{2})(\d{2})\//);
  if (compact) {
    return new Date(
      `${compact[1]}-${compact[2]}-${compact[3]}T00:00:00Z`
    ).toUTCString();
  }
  return "";
}

function findNearbyImage(html: string, linkIndex: number): string | undefined {
  const searchStart = Math.max(0, linkIndex - 500);
  const context = html.substring(searchStart, linkIndex);
  const imgMatches = [
    ...context.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi),
  ];
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

async function fetchPage(url: string): Promise<NewsArticle[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (!response.ok) return [];
    const html = await response.text();
    return extractArticlesFromHtml(html);
  } catch {
    return [];
  }
}

async function tryTordillosFeeds(): Promise<{
  articles: NewsArticle[];
  source: string;
}> {
  for (const feedUrl of TORDILLOS_FEEDS) {
    const articles = await fetchRss(feedUrl, "Noticias a Tiempo");
    if (articles.length > 0) {
      return { articles, source: `rss-tag(${feedUrl})` };
    }
  }
  return { articles: [], source: "" };
}

async function tryTordillosPages(): Promise<{
  articles: NewsArticle[];
  source: string;
}> {
  for (const pageUrl of TORDILLOS_PAGES) {
    const articles = await fetchPage(pageUrl);
    if (articles.length > 0) {
      return { articles, source: `html-tag(${pageUrl})` };
    }
  }
  return { articles: [], source: "" };
}

async function tryGeneralRss(): Promise<{
  articles: NewsArticle[];
  source: string;
}> {
  for (const path of GENERAL_RSS_PATHS) {
    const articles = await fetchRss(
      `${BASE_URL}${path}`,
      "Noticias a Tiempo"
    );
    if (articles.length > 0) {
      return { articles, source: `rss(${path})` };
    }
  }
  return { articles: [], source: "" };
}

function matchesKeyword(article: NewsArticle): boolean {
  const text =
    `${article.title} ${article.summary} ${article.url}`.toLowerCase();
  return text.includes(KEYWORD);
}

export async function fetchNoticiasNews(env: Env): Promise<NewsArticle[]> {
  let articles: NewsArticle[] = [];
  let source = "none";

  // 1. Try Tordillos-specific RSS feeds
  const tagFeed = await tryTordillosFeeds();
  if (tagFeed.articles.length > 0) {
    articles = tagFeed.articles;
    source = tagFeed.source;
  }

  // 2. Try Tordillos tag/search pages
  if (articles.length === 0) {
    const tagPage = await tryTordillosPages();
    if (tagPage.articles.length > 0) {
      articles = tagPage.articles;
      source = tagPage.source;
    }
  }

  // 3. Fallback: general RSS
  if (articles.length === 0) {
    const general = await tryGeneralRss();
    if (general.articles.length > 0) {
      articles = general.articles;
      source = general.source;
    }
  }

  // 4. Fallback: homepage scrape
  if (articles.length === 0) {
    articles = await fetchPage(BASE_URL);
    source = "html-homepage";
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

  console.log(
    `Noticias: ${articles.length} from ${source}, ${filtered.length} matched keyword, ${newArticles.length} new`
  );
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
