import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'data/job-sources.json');
const outputPath = resolve(root, 'content/jobs.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const THAI_TIME_ZONE = 'Asia/Bangkok';

const getDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: THAI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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

const getApplicationStatus = (start, end, today) => {
  if (start && start > today) return 'ยังไม่เริ่ม';
  if (end && end < today) return 'ปิดรับสมัคร';
  if (!start && !end) return 'ไม่ระบุ';
  return 'เปิดรับสมัคร';
};

const getDaysRemaining = (end, today) => {
  if (!end) return null;
  const endDate = new Date(`${end}T00:00:00Z`);
  const currentDate = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.ceil((endDate.getTime() - currentDate.getTime()) / 86400000));
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'BriefPortalJobFetcher/2.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
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

const endpointUrl = (path, params = {}) => {
  const base = source.apiBase.endsWith('/') ? source.apiBase : `${source.apiBase}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
};

const optionalJson = async (path) => {
  try {
    return await fetchJson(endpointUrl(path));
  } catch {
    return [];
  }
};

const [educationLevels, jobCategories, jobSelections, jobLevels, jobConditions] = await Promise.all([
  optionalJson('/educationlevels'), optionalJson('/jobcategories'), optionalJson('/jobselections'), optionalJson('/joblevels'), optionalJson('/jobconditions'),
]);
const educationById = new Map((Array.isArray(educationLevels) ? educationLevels : []).map((item) => [String(item.id), item.educationLevel]));
const categoryById = new Map((Array.isArray(jobCategories) ? jobCategories : []).map((item) => [String(item.id), item.jobCategory]));
const selectionById = new Map((Array.isArray(jobSelections) ? jobSelections : []).map((item) => [String(item.id), item.jobSelection]));
const levelById = new Map((Array.isArray(jobLevels) ? jobLevels : []).map((item) => [String(item.id), item.jobLevel]));
const conditionById = new Map((Array.isArray(jobConditions) ? jobConditions : []).map((item) => [String(item.id), item.jobCondition]));

const departmentResults = await Promise.allSettled(source.departmentTypes.map((type) => fetchJson(endpointUrl(source.departmentEndpoint, { type }))));
const departmentMap = new Map();
departmentResults.forEach((result) => {
  if (result.status === 'rejected' || !Array.isArray(result.value)) return;
  result.value.forEach((department) => {
    const id = String(department.id ?? department.departmentId);
    const existing = departmentMap.get(id) || { ...department, id, types: [] };
    existing.types = [...new Set([...(existing.types || []), ...(department.types || [])])];
    departmentMap.set(id, existing);
  });
});

const departments = [...departmentMap.values()].slice(0, source.maxDepartments);
const jobsEndpoint = source.jobsEndpoint.replace('{department}', encodeURIComponent('__DEPARTMENT__'));
const today = getDateKey();
const jobResults = await mapWithConcurrency(departments, 4, async (department) => {
  const endpoint = jobsEndpoint.replace('__DEPARTMENT__', encodeURIComponent(department.id));
  const response = await fetchJson(endpointUrl(endpoint));
  return (Array.isArray(response) ? response : []).map((job) => {
    const applicationStart = job.applicationStart || null;
    const applicationEnd = job.applicationEnd || null;
    const education = (job.educationLevelIds || []).map((id) => educationById.get(String(id))).filter(Boolean);
    const officialUrl = getExternalUrl(new URL(`jobs/${job.id}`, source.portalUrl).href);
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
if (!uniqueJobs.length) throw new Error('No job announcements were retrieved');

const output = {
  generatedAt: new Date().toISOString(),
  source: { name: source.name, portalUrl: source.portalUrl, apiBase: source.apiBase },
  notice: 'ข้อมูลประกาศรับสมัครงานสาธารณะจาก OCSC โปรดตรวจสอบรายละเอียด เงื่อนไข และประกาศฉบับล่าสุดกับหน้าต้นฉบับก่อนสมัคร',
  departments,
  jobs: uniqueJobs,
};
const temporaryPath = `${outputPath}.tmp`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(`Saved ${output.jobs.length} job announcements from ${output.departments.length} departments`);
