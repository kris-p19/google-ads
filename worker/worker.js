const CONTENT_KEY = 'latest';
const CONTENT_TTL = 60 * 60 * 24 * 30;
const NEWS_MAX_AGE_DAYS = 45;
const THAI_TIME_ZONE = 'Asia/Bangkok';
const NEWS_SOURCES = [
  { id: 'un-news', name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', homepage: 'https://news.un.org/en/', category: 'โลก', accent: 'sky' },
  { id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/news-release/feed/', homepage: 'https://www.nasa.gov/', category: 'วิทยาศาสตร์', accent: 'brand' },
  { id: 'who', name: 'World Health Organization', url: 'https://www.who.int/rss-feeds/news-english.xml', homepage: 'https://www.who.int/', category: 'สุขภาพ', accent: 'coral' },
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
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
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

const getDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: THAI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getApplicationStatus = (start, end, today = getDateKey()) => {
  if (start && start > today) return 'ยังไม่เริ่ม';
  if (end && end < today) return 'ปิดรับสมัคร';
  if (!start && !end) return 'ไม่ระบุ';
  return 'เปิดรับสมัคร';
};

const getDaysRemaining = (end, today = getDateKey()) => {
  if (!end) return null;
  const endDate = new Date(`${end}T00:00:00Z`);
  const currentDate = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.ceil((endDate.getTime() - currentDate.getTime()) / 86400000));
};

const normalizeJob = (job) => {
  const today = getDateKey();
  return {
    ...job,
    status: getApplicationStatus(job.applicationStart, job.applicationEnd, today),
    daysRemaining: getDaysRemaining(job.applicationEnd, today),
    officialUrl: getExternalUrl(job.officialUrl),
    applicationUrl: getExternalUrl(job.applicationUrl),
    pdfUrl: getExternalUrl(job.pdfUrl),
  };
};

const getFreshness = (value) => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return { state: 'unknown', ageMinutes: null };
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return { state: ageMinutes < 90 ? 'fresh' : ageMinutes < 1440 ? 'stale' : 'expired', ageMinutes };
};

const shorten = (value, length = 260) => {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
};

const fetchWithTimeout = async (url, init, consume) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return consume ? await consume(response) : response;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchText = (url) => fetchWithTimeout(url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } }, (response) => response.text());
const fetchJson = (url) => fetchWithTimeout(url, { headers: { accept: 'application/json' } }, (response) => response.json());

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
    const url = getLink(block);
    const summary = shorten(getTag(block, 'description') || getTag(block, 'summary'));
    const publishedAt = getDate(block);
    if (!title || !url) return null;
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
};

const fetchNews = async (previousItems = []) => {
  const attemptedAt = new Date().toISOString();
  const results = await Promise.allSettled(NEWS_SOURCES.map(parseFeed));
  const currentItems = [];
  const sourceStatus = [];
  results.forEach((result, index) => {
    const source = NEWS_SOURCES[index];
    const previous = previousItems.filter((item) => item.sourceId === source.id);
    if (result.status === 'fulfilled') {
      const fresh = result.value.filter((item) => {
        if (!item.publishedAt) return true;
        const age = Date.now() - new Date(item.publishedAt).getTime();
        return age <= NEWS_MAX_AGE_DAYS * 86400000;
      });
      currentItems.push(...fresh);
      sourceStatus.push({ id: source.id, status: fresh.length ? 'ok' : 'empty', itemCount: fresh.length, lastAttemptAt: attemptedAt, lastSuccessAt: fresh.length ? attemptedAt : null });
      return;
    }
    console.error(`News source skipped: ${source.name}`);
    currentItems.push(...previous.slice(0, 10));
    sourceStatus.push({ id: source.id, status: previous.length ? 'stale' : 'error', itemCount: previous.length, lastAttemptAt: attemptedAt, lastSuccessAt: null });
  });
  const balanced = NEWS_SOURCES.flatMap((source) => currentItems.filter((item) => item.sourceId === source.id).slice(0, 10));
  balanced.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return {
    usage: 'headline-summary-link-only',
    notice: 'แสดงเฉพาะหัวข้อ สรุปสั้น และลิงก์ต้นฉบับจากฟีดทางการ โดยไม่คัดลอกเนื้อหาเต็มหรือรูปภาพ',
    sources: NEWS_SOURCES.map(({ id, name, url, homepage, category }) => ({ id, name, url, homepage, category })),
    sourceStatus,
    lastSuccessfulAt: sourceStatus.some((source) => source.lastSuccessAt) ? attemptedAt : null,
    generatedAt: attemptedAt,
    items: balanced.slice(0, 30),
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
    optionalJson('/educationlevels'), optionalJson('/jobcategories'), optionalJson('/jobselections'), optionalJson('/joblevels'), optionalJson('/jobconditions'),
  ]);
  const educationById = new Map((Array.isArray(educationLevels) ? educationLevels : []).map((item) => [String(item.id), item.educationLevel]));
  const categoryById = new Map((Array.isArray(jobCategories) ? jobCategories : []).map((item) => [String(item.id), item.jobCategory]));
  const selectionById = new Map((Array.isArray(jobSelections) ? jobSelections : []).map((item) => [String(item.id), item.jobSelection]));
  const levelById = new Map((Array.isArray(jobLevels) ? jobLevels : []).map((item) => [String(item.id), item.jobLevel]));
  const conditionById = new Map((Array.isArray(jobConditions) ? jobConditions : []).map((item) => [String(item.id), item.jobCondition]));
  const departmentResults = await Promise.allSettled(OCSC.departmentTypes.map((type) => fetchJson(endpointUrl(OCSC.departmentEndpoint, { type }))));
  const departmentMap = new Map();
  departmentResults.forEach((result) => {
    if (result.status === 'rejected' || !Array.isArray(result.value)) return;
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
    const today = getDateKey();
    return (Array.isArray(response) ? response : []).map((job) => {
      const applicationStart = job.applicationStart || null;
      const applicationEnd = job.applicationEnd || null;
      const education = (job.educationLevelIds || []).map((id) => educationById.get(String(id))).filter(Boolean);
      const officialUrl = getExternalUrl(new URL(`jobs/${job.id}`, OCSC.portalUrl).href);
      return {
        id: String(job.id),
        departmentId: String(job.departmentId ?? department.id),
        department: department.department || job.department || 'ไม่ระบุหน่วยงาน',
        ministry: department.ministry || job.ministry || 'ไม่ระบบกระทรวง',
        position: job.position || 'ตำแหน่งที่ไม่ระบุ',
        category: categoryById.get(String(job.jobCategoryId)) || job.jobCategoryOther || 'ไม่ระบุประเภท',
        selection: selectionById.get(String(job.jobSelectionId)) || job.jobSelectionOther || 'ไม่ระบุวิธีรับสมัคร',
        level: levelById.get(String(job.jobLevelId)) || job.jobLevelOther || 'ไม่ระบุระดับ',
        condition: conditionById.get(String(job.jobConditionId)) || job.jobConditionOther || 'ไม่ระบุเงื่อนไข',
        education,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        positionAmount: job.positionAmount ?? null,
        applicationStart,
        applicationEnd,
        status: getApplicationStatus(applicationStart, applicationEnd, today),
        daysRemaining: getDaysRemaining(applicationEnd, today),
        officialUrl,
        applicationUrl: getExternalUrl(job.url),
        pdfUrl: getExternalUrl(job.fileName),
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
    lastSuccessfulAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    jobs: uniqueJobs,
  };
};

const emptyNews = () => ({ usage: 'headline-summary-link-only', notice: '', sources: [], sourceStatus: [], lastSuccessfulAt: null, items: [] });
const emptyJobs = () => ({ source: { name: OCSC.name, portalUrl: OCSC.portalUrl, apiBase: OCSC.apiBase }, notice: '', departments: [], lastSuccessfulAt: null, jobs: [] });

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

const readStaticResource = async (env, path, validate) => {
  if (!env.ASSETS) return null;
  try {
    const response = await env.ASSETS.fetch(`https://assets.local/${path}`);
    if (!response.ok) return null;
    const data = await response.json();
    return validate(data) ? { ...data, contentSource: 'static-fallback' } : null;
  } catch {
    return null;
  }
};

const readStaticNews = (env) => readStaticResource(env, 'content/news.json', (data) => Array.isArray(data?.items));
const readStaticJobs = (env) => readStaticResource(env, 'content/jobs.json', (data) => Array.isArray(data?.jobs));
const readStaticContent = async (env) => {
  const [news, jobs] = await Promise.all([readStaticNews(env), readStaticJobs(env)]);
  return news && jobs ? { generatedAt: new Date().toISOString(), source: 'static-fallback', news, jobs } : null;
};

const getResource = async (env, resource) => {
  const stored = await readContent(env);
  if (stored?.[resource] && Array.isArray(resource === 'news' ? stored.news.items : stored.jobs.jobs)) {
    const data = resource === 'jobs' ? { ...stored[resource], jobs: stored[resource].jobs.map(normalizeJob) } : stored[resource];
    return { data, source: stored.source || 'kv', generatedAt: data.generatedAt || stored.generatedAt || null };
  }
  const fallback = resource === 'news' ? await readStaticNews(env) : await readStaticJobs(env);
  if (!fallback) return null;
  const data = resource === 'jobs' ? { ...fallback, jobs: fallback.jobs.map(normalizeJob) } : fallback;
  return { data, source: 'static-fallback', generatedAt: data.generatedAt || null };
};

const updateContent = async (env) => {
  const previous = await readContent(env);
  const [newsResult, jobsResult] = await Promise.allSettled([fetchNews(previous?.news?.items || []), fetchJobs()]);
  const news = newsResult.status === 'fulfilled' ? newsResult.value : previous?.news || emptyNews();
  const jobs = jobsResult.status === 'fulfilled' ? jobsResult.value : previous?.jobs || emptyJobs();
  if (!env.CONTENT) throw new Error('CONTENT KV binding is not configured');
  const payload = { generatedAt: new Date().toISOString(), lastSuccessfulUpdate: new Date().toISOString(), news, jobs };
  await env.CONTENT.put(CONTENT_KEY, JSON.stringify(payload), { expirationTtl: CONTENT_TTL });
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Refresh-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const withSecurityHeaders = (headers = {}) => {
  const responseHeaders = new Headers(headers);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => responseHeaders.set(key, value));
  return responseHeaders;
};

const jsonResponse = (data, status, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: withSecurityHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...headers }),
});

const contentPayload = (resource, generatedAt, source) => ({
  ...resource,
  contentSource: source,
  contentGeneratedAt: generatedAt,
  freshness: getFreshness(generatedAt),
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: withSecurityHeaders(headers) });
    if (url.pathname === '/api/news' && request.method === 'GET') {
      const resource = await getResource(env, 'news');
      if (!resource) return jsonResponse({ error: 'NEWS_NOT_READY' }, 503, headers);
      return jsonResponse(contentPayload(resource.data, resource.generatedAt, resource.source), 200, { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=300' });
    }
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      const resource = await getResource(env, 'jobs');
      if (!resource) return jsonResponse({ error: 'JOBS_NOT_READY' }, 503, headers);
      return jsonResponse(contentPayload(resource.data, resource.generatedAt, resource.source), 200, { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=300' });
    }
    if (url.pathname === '/api/content' && request.method === 'GET') {
      const [news, jobs] = await Promise.all([getResource(env, 'news'), getResource(env, 'jobs')]);
      if (!news || !jobs) return jsonResponse({ error: 'CONTENT_NOT_READY' }, 503, headers);
      const source = news.source === jobs.source ? news.source : 'mixed';
      return jsonResponse({ generatedAt: news.generatedAt || jobs.generatedAt, source, news: news.data, jobs: jobs.data }, 200, { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=300' });
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      const content = await readContent(env);
      const staticContent = content ? null : await readStaticContent(env);
      const effective = content || staticContent;
      const news = effective?.news;
      const jobs = effective?.jobs;
      const body = {
        ok: Boolean(effective),
        service: 'brief-content-worker',
        configured: Boolean(env.CONTENT),
        source: effective ? (effective.source || 'kv') : 'unavailable',
        generatedAt: effective?.generatedAt || null,
        lastSuccessfulUpdate: effective?.lastSuccessfulUpdate || effective?.generatedAt || null,
        freshness: getFreshness(effective?.generatedAt),
        newsCount: Array.isArray(news?.items) ? news.items.length : 0,
        jobsCount: Array.isArray(jobs?.jobs) ? jobs.jobs.length : 0,
      };
      return jsonResponse(body, effective ? 200 : 503, { ...headers, 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/api/contact' && request.method === 'POST') return jsonResponse({ error: 'CONTACT_NOT_CONFIGURED' }, 503, headers);
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const token = env.REFRESH_TOKEN;
      if (!token || request.headers.get('x-refresh-token') !== token) return jsonResponse({ error: 'UNAUTHORIZED' }, 401, headers);
      try {
        return jsonResponse(await updateContent(env), 200, headers);
      } catch (error) {
        console.error(`Refresh failed: ${error.message}`);
        return jsonResponse({ error: 'REFRESH_FAILED' }, 500, headers);
      }
    }
    if (env.ASSETS) {
      const assetRequest = url.pathname === '/' ? new Request(new URL('/index.html', request.url), request) : request;
      const response = await env.ASSETS.fetch(assetRequest);
      const responseHeaders = withSecurityHeaders(response.headers);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    }
    return jsonResponse({ error: 'NOT_FOUND' }, 404, headers);
  },

  async scheduled(event, env, ctx) {
    const task = updateContent(env).catch((error) => console.error(`Scheduled update failed: ${error.message}`));
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
    console.log(`Scheduled update started at ${new Date(event.scheduledTime).toISOString()}`);
  },
};
