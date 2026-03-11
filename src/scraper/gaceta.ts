import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const GACETA_RSS_URL = "https://www.lagacetadesalamanca.es/rss/";
const KEYWORD = "tordillos";

function matchesInTitleOrSummary(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return text.includes(KEYWORD);
}

async function matchesInBody(article: NewsArticle): Promise<boolean> {
  try {
    const response = await fetch(article.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return false;
    const html = await response.text();
    return html.toLowerCase().includes(KEYWORD);
  } catch (err) {
    console.error(`Failed to fetch article body: ${article.url}`, err);
    return false;
  }
}

export async function fetchGacetaNews(env: Env): Promise<NewsArticle[]> {
  const articles = await fetchRss(GACETA_RSS_URL, "La Gaceta de Salamanca");

  // First pass: quick filter by title/summary
  const matchedByHeader = articles.filter(matchesInTitleOrSummary);
  const notMatchedByHeader = articles.filter(
    (a) => !matchesInTitleOrSummary(a)
  );

  // Second pass: check article body for remaining articles
  const bodyChecks = await Promise.all(
    notMatchedByHeader.map(async (article) => ({
      article,
      matches: await matchesInBody(article),
    }))
  );
  const matchedByBody = bodyChecks
    .filter((r) => r.matches)
    .map((r) => r.article);

  const filtered = [...matchedByHeader, ...matchedByBody];

  const newArticles: NewsArticle[] = [];
  for (const article of filtered) {
    const existing = await env.NEWS_KV.get(`gaceta:${article.url}`);
    if (!existing) {
      newArticles.push(article);
    }
  }

  return newArticles;
}

export async function markAsSent(env: Env, articles: NewsArticle[]) {
  for (const article of articles) {
    await env.NEWS_KV.put(`gaceta:${article.url}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }
}
