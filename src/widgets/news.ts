import { loadCache, saveCache } from './cache.js';
import { fetchRss } from './rss.js';
import { shorten } from './shorten.js';
import type { NewsWidget } from '../types.js';

const CACHE_TTL = 1800;

export const NEWS_SOURCES: Record<string, string> = {
  'G1':         'https://g1.globo.com/rss/g1/',
  'Folha':      'https://feeds.folha.uol.com.br/mundo/rss091.xml',
  'UOL':        'https://rss.uol.com.br/feed/noticias.xml',
  'HN':         'https://hnrss.org/frontpage',
  'TechCrunch': 'https://techcrunch.com/feed/',
  'Ars':        'https://feeds.arstechnica.com/arstechnica/index',
  'Verge':      'https://www.theverge.com/rss/index.xml',
};

interface CachedItem { label: string; short: string }

async function fetchItems(sources: string[]): Promise<CachedItem[]> {
  const all: CachedItem[] = [];
  for (const src of sources) {
    const url = NEWS_SOURCES[src];
    if (!url) continue;
    const items = await fetchRss(url, 10);
    for (const item of items) {
      const short = item.link ? await shorten(item.link) : '';
      all.push({ label: `[${src}] ${item.title}`, short });
    }
  }
  return all;
}

export async function getItems(config: NewsWidget): Promise<string[]> {
  const sources = config.sources ?? Object.keys(NEWS_SOURCES);
  const cacheKey = `news_${sources.join('_')}`;

  let items = loadCache<CachedItem[]>(cacheKey, CACHE_TTL);
  if (!items) {
    items = await fetchItems(sources);
    if (!items.length) items = [{ label: '[news] sem conexão', short: '' }];
    saveCache(cacheKey, items);
  }

  return items.map(i => i.short ? `${i.label}  ${i.short}` : i.label);
}
