import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'data/news-sources.json');
const outputPath = resolve(root, 'content/news.json');
const sources = JSON.parse(await readFile(sourcePath, 'utf8'));
const NEWS_MAX_AGE_DAYS = 45;
const ENTITY_MAP = { nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (value) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match);

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

const getExternalUrl = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return '';
  const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const getLink = (block) => {
  const rawLink = getTag(block, 'link').trim();
  const atomLink = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] || '';
  return getExternalUrl(decodeEntities(rawLink || atomLink));
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
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'user-agent': 'BriefPortalNewsFetcher/2.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    return entries.map((match) => {
      const block = match[2];
      const title = shorten(getTag(block, 'title'), 180);
      const url = getLink(block);
      const summary = shorten(getTag(block, 'description') || getTag(block, 'summary'));
      const publishedAt = getDate(block);
      if (!title || !url) return null;
      if (publishedAt && Date.now() - new Date(publishedAt).getTime() > NEWS_MAX_AGE_DAYS * 86400000) return null;
      return {
        id: `${source.id}:${url}`,
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

let previous = { items: [] };
try { previous = JSON.parse(await readFile(outputPath, 'utf8')); } catch {}
const attemptedAt = new Date().toISOString();
const results = await Promise.allSettled(sources.map(fetchSource));
const items = [];
const sourceStatus = [];
results.forEach((result, index) => {
  const source = sources[index];
  const previousItems = Array.isArray(previous.items) ? previous.items.filter((item) => item.sourceId === source.id) : [];
  if (result.status === 'fulfilled') {
    items.push(...result.value);
    sourceStatus.push({ id: source.id, status: result.value.length ? 'ok' : 'empty', itemCount: result.value.length, lastAttemptAt: attemptedAt, lastSuccessAt: result.value.length ? attemptedAt : null });
    return;
  }
  console.error(`Skipped ${source.name}: ${result.reason.message}`);
  items.push(...previousItems.slice(0, 10));
  sourceStatus.push({ id: source.id, status: previousItems.length ? 'stale' : 'error', itemCount: previousItems.length, lastAttemptAt: attemptedAt, lastSuccessAt: null });
});

const seen = new Set();
const uniqueItems = items.filter((item) => {
  const key = item.url || item.title;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const balancedItems = sources.flatMap((source) => uniqueItems.filter((item) => item.sourceId === source.id).slice(0, 10));
balancedItems.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
if (!balancedItems.length) throw new Error('No news items were retrieved');

const output = {
  generatedAt: attemptedAt,
  lastSuccessfulAt: sourceStatus.some((source) => source.lastSuccessAt) ? attemptedAt : null,
  usage: 'headline-summary-link-only',
  notice: 'แสดงเฉพาะหัวข้อ สรุปสั้น และลิงก์ต้นฉบับจากฟีดทางการ โดยไม่คัดลอกเนื้อหาเต็มหรือรูปภาพ',
  sources: sources.map(({ id, name, url, homepage, category }) => ({ id, name, url, homepage, category })),
  sourceStatus,
  items: balancedItems.slice(0, 30),
};
const temporaryPath = `${outputPath}.tmp`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(`Saved ${output.items.length} news items to ${outputPath}`);
