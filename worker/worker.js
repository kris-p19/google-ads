const CONTENT_KEY = 'latest';
const NEWS_SOURCES = [
  {
    id: 'un-news',
    name: 'UN News',
    url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
    homepage: 'https://news.un.org/en/',
    category: 'โลก',
    accent: 'sky',
  },
  {
    id: 'nasa',
    name: 'NASA',
    url: 'https://www.nasa.gov/news-release/feed/',
    homepage: 'https://www.nasa.gov/',
    category: 'วิทยาศาสตร์',
    accent: 'brand',
  },
  {
    id: 'who',
    name: 'World Health Organization',
    url: 'https://www.who.int/rss-feeds/news-english.xml',
    homepage: 'https://www.who.int/',
    category: 'สุขภาพ',
    accent: 'coral',
  },
];

const OCSC = {
  name: 'สำนักงาน ก.พ.',
  portalUrl: 'https://job.ocsc.go.th/portal/',
  apiBase: 'https://jobapp.ocsc.go.th/jobapi',
  departmentEndpoint: '/portal/departments',
  jobsEndpoint: '/portal/departments/{department}/jobs',
  departmentTypes: [0, 1, 2, 3],
  maxDepartments: 40,
};

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

const getLink = (block, sourceUrl) => {
  const rawLink = getTag(block, 'link').trim();
  const atomLink = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] || '';
  const link = rawLink || atomLink;
  if (!link) return '';
  try {
    return new URL(decodeEntities(link), sourceUrl).href;
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

const fetchWithTimeout = async (url, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchText = async (url) => {
  const response = await fetchWithTimeout(url, {
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};

const fetchJson = async (url) => {
  const response = await fetchWithTimeout(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const endpointUrl = (path, params = {}) => {
  const base = OCSC.apiBase.endsWith('/') ? OCSC.apiBase : `${OCSC.apiBase}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
};

const mapWithConcurrency = async (items, limit, worker) => {
  const results = [];
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
};

const parseFeed = async (source) => {
  const xml = await fetchText(source.url);
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  return entries.map((match) => {
    const block = match[2];
    const title = shorten(getTag(block, 'title'), 180);
    const url = getLink(block, source.url);
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
};

const fetchNews = async () => {
  const results = await Promise.allSettled(NEWS_SOURCES.map(parseFeed));
  const items = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`News source skipped: ${NEWS_SOURCES[index].name}`);
      return;
    }
    items.push(...result.value);
  });
  const balanced = NEWS_SOURCES.flatMap((source) => items.filter((item) => item.sourceId === source.id).slice(0, 10));
  balanced.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return {
    usage: 'headline-summary-link-only',
    notice: 'แสดงเฉพาะหัวข้อ สรุปสั้น และลิงก์ต้นฉบับจากฟีดทางการ โดยไม่คัดลอกเนื้อหาเต็มหรือรูปภาพ',
    sources: NEWS_SOURCES.map(({ id, name, url, homepage, category }) => ({ id, name, url, homepage, category })),
    items: balanced,
  };
};

const optionalJson = async (path) => {
  try {
    return await fetchJson(endpointUrl(path));
  } catch {
    return [];
  }
};

const fetchJobs = async () => {
  const [educationLevels, jobCategories, jobSelections, jobLevels, jobConditions] = await Promise.all([
    optionalJson('/educationlevels'),
    optionalJson('/jobcategories'),
    optionalJson('/jobselections'),
    optionalJson('/joblevels'),
    optionalJson('/jobconditions'),
  ]);
  const educationById = new Map(educationLevels.map((item) => [String(item.id), item.educationLevel]));
  const categoryById = new Map(jobCategories.map((item) => [String(item.id), item.jobCategory]));
  const selectionById = new Map(jobSelections.map((item) => [String(item.id), item.jobSelection]));
  const levelById = new Map(jobLevels.map((item) => [String(item.id), item.jobLevel]));
  const conditionById = new Map(jobConditions.map((item) => [String(item.id), item.jobCondition]));
  const departmentResults = await Promise.allSettled(OCSC.departmentTypes.map((type) => fetchJson(endpointUrl(OCSC.departmentEndpoint, { type }))));
  const departmentMap = new Map();
  departmentResults.forEach((result) => {
    if (result.status === 'rejected') return;
    result.value.forEach((department) => {
      const id = String(department.id ?? department.departmentId);
      if (!departmentMap.has(id)) departmentMap.set(id, { id, department: department.department, ministry: department.ministry });
    });
  });
  const departments = [...departmentMap.values()].slice(0, OCSC.maxDepartments);
  if (!departments.length) throw new Error('No OCSC departments retrieved');
  const jobsEndpoint = OCSC.jobsEndpoint.replace('{department}', encodeURIComponent('__DEPARTMENT__'));
  const jobResults = await mapWithConcurrency(departments, 4, async (department) => {
    const endpoint = jobsEndpoint.replace('__DEPARTMENT__', encodeURIComponent(department.id));
    const response = await fetchJson(endpointUrl(endpoint));
    return (Array.isArray(response) ? response : []).map((job) => {
      const applicationEnd = job.applicationEnd || null;
      const isOpen = !applicationEnd || applicationEnd >= new Date().toISOString().slice(0, 10);
      const endDate = applicationEnd ? new Date(`${applicationEnd}T23:59:59Z`) : null;
      const daysRemaining = endDate ? Math.ceil((endDate.getTime() - Date.now()) / 86400000) : null;
      const education = (job.educationLevelIds || []).map((id) => educationById.get(String(id))).filter(Boolean);
      return {
        id: String(job.id),
        departmentId: String(job.departmentId ?? department.id),
        department: department.department || job.department || 'ไม่ระบุหน่วยงาน',
        ministry: department.ministry || job.ministry || 'ไม่ระบุกระทรวง',
        position: job.position || 'ตำแหน่งที่ไม่ระบุ',
        category: categoryById.get(String(job.jobCategoryId)) || job.jobCategoryOther || 'ไม่ระบุประเภท',
        selection: selectionById.get(String(job.jobSelectionId)) || job.jobSelectionOther || 'ไม่ระบุวิธีรับสมัคร',
        level: levelById.get(String(job.jobLevelId)) || job.jobLevelOther || 'ไม่ระบุระดับ',
        condition: conditionById.get(String(job.jobConditionId)) || job.jobConditionOther || 'ไม่ระบุเงื่อนไข',
        education,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        positionAmount: job.positionAmount ?? null,
        applicationStart: job.applicationStart || null,
        applicationEnd,
        status: isOpen ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร',
        daysRemaining,
        officialUrl: new URL(`jobs/${job.id}`, OCSC.portalUrl).href,
        applicationUrl: job.url || '',
        pdfUrl: job.fileName || '',
        createdAt: job.createDate || null,
      };
    });
  });
  const jobs = jobResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const uniqueJobs = [...new Map(jobs.map((job) => [job.id, job])).values()];
  uniqueJobs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return {
    source: { name: OCSC.name, portalUrl: OCSC.portalUrl, apiBase: OCSC.apiBase },
    notice: 'ข้อมูลประกาศรับสมัครงานสาธารณะจาก OCSC โปรดตรวจสอบรายละเอียด เงื่อนไข และประกาศฉบับล่าสุดกับหน้าต้นฉบับก่อนสมัคร',
    departments,
    jobs: uniqueJobs,
  };
};

const emptyNews = () => ({ usage: 'headline-summary-link-only', notice: '', sources: [], items: [] });
const emptyJobs = () => ({ source: { name: OCSC.name, portalUrl: OCSC.portalUrl, apiBase: OCSC.apiBase }, notice: '', departments: [], jobs: [] });

const readContent = async (env) => {
  if (!env.CONTENT) return null;
  try {
    return await env.CONTENT.get(CONTENT_KEY, { type: 'json' });
  } catch {
    try {
      const raw = await env.CONTENT.get(CONTENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
};

const readStaticContent = async (env) => {
  if (!env.ASSETS) return null;
  try {
    const [newsResponse, jobsResponse] = await Promise.all([
      env.ASSETS.fetch('https://assets.local/content/news.json'),
      env.ASSETS.fetch('https://assets.local/content/jobs.json'),
    ]);
    if (!newsResponse.ok || !jobsResponse.ok) return null;
    const [news, jobs] = await Promise.all([newsResponse.json(), jobsResponse.json()]);
    if (!Array.isArray(news.items) || !Array.isArray(jobs.jobs)) return null;
    return { generatedAt: new Date().toISOString(), source: 'static-fallback', news, jobs };
  } catch {
    return null;
  }
};

const updateContent = async (env) => {
  const previous = await readContent(env);
  const [newsResult, jobsResult] = await Promise.allSettled([fetchNews(), fetchJobs()]);
  const news = newsResult.status === 'fulfilled' && newsResult.value.items.length
    ? newsResult.value
    : previous?.news || emptyNews();
  const jobs = jobsResult.status === 'fulfilled' && jobsResult.value.jobs.length
    ? jobsResult.value
    : previous?.jobs || emptyJobs();
  if (!env.CONTENT) throw new Error('CONTENT KV binding is not configured');
  const payload = { generatedAt: new Date().toISOString(), news, jobs };
  await env.CONTENT.put(CONTENT_KEY, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 30 });
  console.log(`Updated ${news.items.length} news items and ${jobs.jobs.length} job announcements`);
  return payload;
};

const corsHeaders = (request, env) => {
  const configured = (env.ALLOWED_ORIGIN || 'https://brief.fintechxhub.com').split(',').map((value) => value.trim());
  const origin = request.headers.get('Origin');
  const allowOrigin = !origin || configured.includes(origin) ? origin || '*' : configured[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const jsonResponse = (data, status, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname === '/api/content' && request.method === 'GET') {
      if (!env.CONTENT) return jsonResponse({ error: 'CONTENT_KV_NOT_CONFIGURED' }, 503, headers);
      const content = await readContent(env);
      if (content) return jsonResponse(content, 200, { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=300' });
      const staticContent = await readStaticContent(env);
      if (staticContent) {
        if (ctx?.waitUntil) ctx.waitUntil(env.CONTENT.put(CONTENT_KEY, JSON.stringify(staticContent), { expirationTtl: 60 * 60 * 24 * 30 }));
        return jsonResponse(staticContent, 200, { ...headers, 'Cache-Control': 'public, max-age=60, s-maxage=60' });
      }
      return jsonResponse({ error: 'CONTENT_NOT_READY' }, 503, headers);
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'brief-content-worker', configured: Boolean(env.CONTENT) }, 200, headers);
    }
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const token = env.REFRESH_TOKEN;
      if (!token || request.headers.get('x-refresh-token') !== token) return jsonResponse({ error: 'UNAUTHORIZED' }, 401, headers);
      try {
        return jsonResponse(await updateContent(env), 200, headers);
      } catch (error) {
        return jsonResponse({ error: error.message }, 500, headers);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return jsonResponse({ error: 'NOT_FOUND' }, 404, headers);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateContent(env).catch((error) => console.error(`Scheduled update failed: ${error.message}`)));
    console.log(`Scheduled update started at ${new Date(event.scheduledTime).toISOString()}`);
  },
};
