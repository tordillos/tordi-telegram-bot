export interface Env {
  BOT_TOKEN: string;
  GROUP_CHAT_ID: string;
  SOURCE_CHANNEL_ID: string;
  NEWS_KV: KVNamespace;
}

export interface NewsArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt: string;
}
