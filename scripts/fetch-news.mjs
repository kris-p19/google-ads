import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'data/news-sources.json');
const outputPath = resolve(root, 'content/news.json');
const sources = JSON.parse(await readFile(sourcePath, 'utf8'));

const decodeEntities = (value) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'");

const cleanText = (value) => decodeEntities(value)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getTag = (block, tag) => {
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return expression.exec(block)?.[1] || '';
};

const getLink = (block, source) => {
  const rawLink = getTag(block, 'link').trim();
  const atomLink = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] || '';
  const link = rawLink || atomLink;
  if (!link) return '';
  try {
    return new URL(decodeEntities(link), source.url).href;
  } catch {
    return decodeEntities(link);
  }
};

const getDate = (block) => {
  const value = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated');
  const date = new Date(decodeEntities(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const shorten = (value, length = 260) => {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};

const fetchSource = async (source) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(source.url, {
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'user-agent': 'BriefPortalNewsFetcher/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    return entries.map((match) => {
      const block = match[2];
      const title = shorten(getTag(block, 'title'), 180);
      const url = getLink(block, source);
      const summary = shorten(getTag(block, 'description') || getTag(block, 'summary'));
      const publishedAt = getDate(block);

      if (!title || !url) return null;

      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.homepage,
        sourceFeed: source.url,
        category: source.category,
        accent: source.accent,
        title,
        summary,
        url,
        publishedAt,
      };
    }).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
};

const results = await Promise.allSettled(sources.map(fetchSource));
const items = [];
const seen = new Set();

results.forEach((result, index) => {
  if (result.status === 'rejected') {
    console.error(`Skipped ${sources[index].name}: ${result.reason.message}`);
    return;
  }
  result.value.forEach((item) => {
    const key = item.url || item.title;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  });
});

const balancedItems = sources.flatMap((source) => items.filter((item) => item.sourceId === source.id).slice(0, 10));
balancedItems.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

if (!balancedItems.length) throw new Error('No news items were retrieved');

const output = {
  generatedAt: new Date().toISOString(),
  usage: 'headline-summary-link-only',
  notice: 'แสดงเฉพาะหัวข้อ สรุปสั้น และลิงก์ต้นฉบับจากฟีดทางการ โดยไม่คัดลอกเนื้อหาเต็มหรือรูปภาพ',
  sources: sources.map(({ id, name, url, homepage, category }) => ({ id, name, url, homepage, category })),
  items: balancedItems.slice(0, 30),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Saved ${output.items.length} news items to ${outputPath}`);
