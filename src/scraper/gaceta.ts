import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const GACETA_RSS_FEEDS = [
  "https://www.lagacetadesalamanca.es/rss/",
  "https://www.lagacetadesalamanca.es/rss/provincia/",
  "https://www.lagacetadesalamanca.es/rss/salamanca/",
];
const TORDILLOS_PAGE =
  "https://www.lagacetadesalamanca.es/temas/lugares/tordillos.html";
const KEYWORD = "tordillos";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function articleKey(article: NewsArticle): string {
  // Extract the slug from the URL path, ignoring query params and domain variations
  // e.g. "lecciones-mondongueras-tordillos-20260315083655-ga" from the full URL
  try {
    const path = new URL(article.url).pathname;
    const filename = path.split("/").pop() || path;
    return filename.replace(/\.html$/, "");
  } catch {
    return article.url;
  }
}

function matchesInTitleOrSummary(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return text.includes(KEYWORD);
}

function extractDateFromUrl(url: string): string {
  const match = url.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return new Date(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
    ).toUTCString();
  }
  return "";
}

async function fetchFromTordillosPage(): Promise<NewsArticle[]> {
  try {
    const response = await fetch(TORDILLOS_PAGE, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (!response.ok) {
      console.error(`Tordillos page fetch failed: ${response.status}`);
      return [];
    }
    const html = await response.text();
    const articles: NewsArticle[] = [];
    const linkRegex =
      /<a[^>]+href=["'](https?:\/\/(?:www\.)?lagacetadesalamanca\.es\/[^"']+\.html)["'][^>]*>([^<]+)<\/a>/gi;
    const seenKeys = new Set<string>();
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      if (!title || title.length < 10) continue;
      const article: NewsArticle = {
        title,
        url,
        summary: "",
        source: "La Gaceta de Salamanca",
        publishedAt: extractDateFromUrl(url),
      };
      const key = articleKey(article);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      articles.push(article);
    }

    console.log(`Tordillos page: found ${articles.length} articles`);
    return articles;
  } catch (err) {
    console.error("Tordillos page scrape error:", err);
    return [];
  }
}

export async function fetchGacetaNews(env: Env): Promise<NewsArticle[]> {
  const rssResults = await Promise.all(
    GACETA_RSS_FEEDS.map((feed) =>
      fetchRss(feed, "La Gaceta de Salamanca").catch((err) => {
        console.error(`RSS fetch error for ${feed}:`, err);
        return [];
      })
    )
  );

  const tordillosArticles = await fetchFromTordillosPage().catch(() => []);

  // Deduplicate by slug (filename without .html)
  const seenKeys = new Set<string>();
  const allArticles: NewsArticle[] = [];
  for (const articles of [...rssResults, tordillosArticles]) {
    for (const article of articles) {
      const key = articleKey(article);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allArticles.push(article);
      }
    }
  }

  console.log(`Gaceta: ${allArticles.length} total articles from all sources`);

  // Filter by keyword: title/summary only (no body fetch to avoid excessive requests)
  const tordillosKeys = new Set(tordillosArticles.map(articleKey));
  const filtered = allArticles.filter(
    (a) => matchesInTitleOrSummary(a) || tordillosKeys.has(articleKey(a))
  );

  const newArticles: NewsArticle[] = [];
  for (const article of filtered) {
    const key = articleKey(article);
    const existing = await env.NEWS_KV.get(`gaceta:${key}`);
    if (!existing) {
      newArticles.push(article);
    }
  }

  console.log(
    `Gaceta: ${filtered.length} matched keyword, ${newArticles.length} new`
  );
  return newArticles;
}

export async function markAsSent(env: Env, articles: NewsArticle[]) {
  for (const article of articles) {
    const key = articleKey(article);
    await env.NEWS_KV.put(`gaceta:${key}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }
}
