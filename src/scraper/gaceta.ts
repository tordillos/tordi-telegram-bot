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

function matchesInTitleOrSummary(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return text.includes(KEYWORD);
}

async function matchesInBody(article: NewsArticle): Promise<boolean> {
  try {
    const response = await fetch(article.url, {
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!response.ok) return false;
    const html = await response.text();
    return html.toLowerCase().includes(KEYWORD);
  } catch (err) {
    console.error(`Failed to fetch article body: ${article.url}`, err);
    return false;
  }
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
    const seenUrls = new Set<string>();
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      if (!title || title.length < 10 || seenUrls.has(url)) continue;
      seenUrls.add(url);
      articles.push({
        title,
        url,
        summary: "",
        source: "La Gaceta de Salamanca",
        publishedAt: "",
      });
    }

    console.log(`Tordillos page: found ${articles.length} articles`);
    return articles;
  } catch (err) {
    console.error("Tordillos page scrape error:", err);
    return [];
  }
}

export async function fetchGacetaNews(env: Env): Promise<NewsArticle[]> {
  // Fetch from all RSS feeds in parallel
  const rssResults = await Promise.all(
    GACETA_RSS_FEEDS.map((feed) =>
      fetchRss(feed, "La Gaceta de Salamanca").catch((err) => {
        console.error(`RSS fetch error for ${feed}:`, err);
        return [];
      })
    )
  );

  // Also scrape the Tordillos-specific page
  const tordillosArticles = await fetchFromTordillosPage().catch(() => []);

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const allArticles: NewsArticle[] = [];
  for (const articles of [...rssResults, tordillosArticles]) {
    for (const article of articles) {
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        allArticles.push(article);
      }
    }
  }

  console.log(`Gaceta: ${allArticles.length} total articles from all sources`);

  // Filter by keyword: first title/summary, then body
  const matchedByHeader = allArticles.filter(matchesInTitleOrSummary);
  const notMatchedByHeader = allArticles.filter(
    (a) => !matchesInTitleOrSummary(a)
  );

  const bodyChecks = await Promise.all(
    notMatchedByHeader.map(async (article) => ({
      article,
      matches: await matchesInBody(article),
    }))
  );
  const matchedByBody = bodyChecks
    .filter((r) => r.matches)
    .map((r) => r.article);

  // Tordillos page articles are already about Tordillos, include them all
  const tordillosUrls = new Set(tordillosArticles.map((a) => a.url));
  const matchedFromPage = allArticles.filter(
    (a) => tordillosUrls.has(a.url) && !matchedByHeader.includes(a)
  );

  const filtered = [...matchedByHeader, ...matchedByBody, ...matchedFromPage];
  const uniqueFiltered = filtered.filter(
    (a, i) => filtered.findIndex((b) => b.url === a.url) === i
  );

  const newArticles: NewsArticle[] = [];
  for (const article of uniqueFiltered) {
    const existing = await env.NEWS_KV.get(`gaceta:${article.url}`);
    if (!existing) {
      newArticles.push(article);
    }
  }

  console.log(
    `Gaceta: ${matchedByHeader.length} by header, ${matchedByBody.length} by body, ${matchedFromPage.length} from page, ${newArticles.length} new`
  );
  return newArticles;
}

export async function markAsSent(env: Env, articles: NewsArticle[]) {
  for (const article of articles) {
    await env.NEWS_KV.put(`gaceta:${article.url}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
