import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const news = JSON.parse(await readFile(resolve(root, 'content/news.json'), 'utf8'));
const jobs = JSON.parse(await readFile(resolve(root, 'content/jobs.json'), 'utf8'));
const siteOrigin = 'https://brief.fintechxhub.com';
const escapeXml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const dateKey = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};
const rssDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString();
};
const newsItems = Array.isArray(news.items) ? news.items.slice(0, 20) : [];
const rssItems = newsItems.map((item) => `    <item>\n      <title>${escapeXml(item.title)}</title>\n      <link>${escapeXml(item.url)}</link>\n      <guid isPermaLink="true">${escapeXml(item.url)}</guid>\n      <pubDate>${rssDate(item.publishedAt)}</pubDate>\n      <description>${escapeXml(item.summary || 'เปิดลิงก์ต้นฉบับเพื่ออ่านรายละเอียดเพิ่มเติม')}</description>\n      <source url="${escapeXml(item.sourceUrl || '')}">${escapeXml(item.sourceName || '')}</source>\n    </item>`).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Portal — ข่าวสารและคู่มือ</title>\n    <link>${siteOrigin}/</link>\n    <atom:link rel="self" type="application/rss+xml" href="${siteOrigin}/rss.xml" />\n    <description>ข่าวสาร บทวิเคราะห์ และคู่มือที่คัดสรรให้เข้าใจง่าย</description>\n    <language>th</language>\n    <lastBuildDate>${rssDate(news.generatedAt || jobs.generatedAt)}</lastBuildDate>\n${rssItems}\n  </channel>\n</rss>\n`;
const pages = [
  ['/', '1.0'], ['/news.html', '0.9'], ['/category.html', '0.7'], ['/sources.html', '0.4'], ['/jobs.html', '0.8'], ['/article.html', '0.8'], ['/about.html', '0.5'], ['/contact.html', '0.4'], ['/privacy.html', '0.4'],
];
const lastmod = dateKey(news.generatedAt || jobs.generatedAt);
const urls = pages.map(([path, priority]) => `  <url>\n    <loc>${siteOrigin}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
const writeAtomically = async (path, content) => {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
};
await writeAtomically(resolve(root, 'rss.xml'), rss);
await writeAtomically(resolve(root, 'sitemap.xml'), sitemap);
console.log(`Generated RSS with ${newsItems.length} items and sitemap with ${pages.length} URLs`);
