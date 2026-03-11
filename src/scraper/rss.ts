import { NewsArticle } from "../types";

function extractTag(xml: string, tag: string): string {
  const cdataMatch = xml.match(
    new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`)
  );
  if (cdataMatch) return cdataMatch[1].trim();

  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function parseRssFeed(xml: string, source: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = stripHtml(extractTag(itemXml, "title"));
    const url = extractTag(itemXml, "link");
    const summary = stripHtml(extractTag(itemXml, "description"));
    const publishedAt = extractTag(itemXml, "pubDate");

    if (title && url) {
      articles.push({ title, url, summary, source, publishedAt });
    }
  }

  return articles;
}

export async function fetchRss(
  feedUrl: string,
  source: string
): Promise<NewsArticle[]> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    console.error(`RSS fetch failed for ${feedUrl}: ${response.status}`);
    return [];
  }

  const xml = await response.text();
  return parseRssFeed(xml, source);
}
