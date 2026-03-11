import { Env, NewsArticle } from "../types";
import { fetchRss } from "./rss";

const GACETA_RSS_URL = "https://www.lagacetadesalamanca.es/rss/";
const KEYWORD = "tordillos";

function matchesKeyword(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return text.includes(KEYWORD);
}

export async function fetchGacetaNews(env: Env): Promise<NewsArticle[]> {
  const articles = await fetchRss(GACETA_RSS_URL, "La Gaceta de Salamanca");
  const filtered = articles.filter(matchesKeyword);

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
