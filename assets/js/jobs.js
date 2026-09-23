(() => {
  const jobsPage = document.querySelector('[data-jobs]');
  if (!jobsPage) return;

  const grid = jobsPage.querySelector('[data-jobs-grid]');
  const search = jobsPage.querySelector('[data-jobs-search]');
  const ministry = jobsPage.querySelector('[data-jobs-ministry]');
  const status = jobsPage.querySelector('[data-jobs-status]');
  const count = jobsPage.querySelector('[data-jobs-count]');
  const empty = jobsPage.querySelector('[data-jobs-empty]');
  const updated = jobsPage.querySelector('[data-jobs-updated]');
  const openCount = jobsPage.querySelector('[data-jobs-open-count]');
  const departmentCount = jobsPage.querySelector('[data-jobs-department-count]');
  const refresh = jobsPage.querySelector('[data-jobs-refresh]');
  const moreButton = jobsPage.querySelector('[data-jobs-more]');
  const accents = ['visual-government', 'visual-editorial', 'visual-world', 'visual-tech', 'visual-health'];
  let jobData = null;
  let selectedStatus = 'all';
  let visibleLimit = 24;

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const dateKey = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  };

  const getStatus = (job, today = dateKey()) => {
    const start = job.applicationStart || '';
    const end = job.applicationEnd || '';
    if (start && start > today) return 'ยังไม่เริ่ม';
    if (end && end < today) return 'ปิดรับสมัคร';
    if (!start && !end) return 'ไม่ระบุ';
    return 'เปิดรับสมัคร';
  };

  const getDaysRemaining = (job, today = dateKey()) => {
    if (!job.applicationEnd) return null;
    const end = new Date(`${job.applicationEnd}T00:00:00Z`);
    const current = new Date(`${today}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return null;
    return Math.max(0, Math.ceil((end.getTime() - current.getTime()) / 86400000));
  };

  const normalizeJob = (job) => ({ ...job, status: getStatus(job), daysRemaining: getDaysRemaining(job) });

  const formatDate = (value) => {
    if (!value) return 'ไม่ระบุวันที่';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const formatSalary = (job) => {
    if (!job.salaryMin && !job.salaryMax) return 'เงินเดือนตามประกาศ';
    if (job.salaryMin === job.salaryMax) return `${Number(job.salaryMin).toLocaleString('th-TH')} บาท/เดือน`;
    return `${Number(job.salaryMin).toLocaleString('th-TH')}–${Number(job.salaryMax).toLocaleString('th-TH')} บาท/เดือน`;
  };

  const getFreshness = (value) => {
    if (!value) return 'ไม่ทราบเวลาอัปเดต';
    const age = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(age)) return 'ไม่ทราบเวลาอัปเดต';
    const minutes = Math.max(0, Math.floor(age / 60000));
    if (minutes < 90) return 'ข้อมูลล่าสุด';
    if (minutes < 1440) return 'ข้อมูลอาจค่อนข้างเก่า';
    return 'ข้อมูลเก่า';
  };

  const setStatus = (message) => {
    if (count) count.textContent = message;
  };

  const createSaveButton = (job) => {
    const button = document.createElement('button');
    const sync = () => {
      const saved = window.portalSaved?.has(job.id) || false;
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.textContent = saved ? 'บันทึกแล้ว' : 'บันทึก';
    };
    button.type = 'button';
    button.className = 'save-button';
    button.addEventListener('click', () => {
      window.portalSaved?.toggle({
        id: job.id,
        type: 'job',
        title: job.position,
        url: job.officialUrl,
        source: 'OCSC',
        publishedAt: job.createdAt,
      });
      sync();
    });
    document.addEventListener('portal:saved-change', sync);
    sync();
    return button;
  };

  const createCard = (job, index) => {
    const article = document.createElement('article');
    article.className = 'story-card';
    const officialUrl = safeUrl(job.officialUrl);
    const applicationUrl = safeUrl(job.applicationUrl);
    const pdfUrl = safeUrl(job.pdfUrl);

    const visual = document.createElement(officialUrl ? 'a' : 'div');
    visual.className = `card-visual visual-pattern ${accents[index % accents.length]}`;
    if (officialUrl) {
      visual.href = officialUrl;
      visual.target = '_blank';
      visual.rel = 'noopener noreferrer';
      visual.setAttribute('aria-label', `เปิดประกาศ ${job.position} จาก OCSC`);
    }
    const visualLabel = document.createElement('span');
    visualLabel.className = 'visual-label';
    visualLabel.textContent = job.status;
    const visualWord = document.createElement('span');
    visualWord.className = 'visual-word';
    visualWord.textContent = 'ราชการ';
    visual.append(visualWord, visualLabel);

    const body = document.createElement('div');
    body.className = 'card-body';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = job.ministry;
    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    if (officialUrl) {
      titleLink.href = officialUrl;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
    }
    titleLink.textContent = job.position || 'ตำแหน่งไม่ระบุ';
    title.appendChild(titleLink);
    const department = document.createElement('p');
    department.textContent = `${job.department} · ${job.category} · ${job.level}`;
    const details = document.createElement('p');
    details.textContent = `${formatSalary(job)} · ${job.positionAmount || 'ไม่ระบุ'} อัตรา · รับสมัคร ${formatDate(job.applicationStart)}–${formatDate(job.applicationEnd)}`;
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const deadline = document.createElement('span');
    deadline.textContent = job.status === 'เปิดรับสมัคร'
      ? `เหลือ ${job.daysRemaining ?? 0} วัน`
      : job.status === 'ยังไม่เริ่ม' ? `เริ่ม ${formatDate(job.applicationStart)}` : job.status === 'ไม่ระบุ' ? 'ไม่ระบุกำหนดปิดรับ' : 'ปิดรับสมัครแล้ว';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (officialUrl) {
      const official = document.createElement('a');
      official.href = officialUrl;
      official.target = '_blank';
      official.rel = 'noopener noreferrer';
      official.textContent = 'ประกาศ ↗';
      actions.appendChild(official);
    }
    if (applicationUrl) {
      const apply = document.createElement('a');
      apply.href = applicationUrl;
      apply.target = '_blank';
      apply.rel = 'noopener noreferrer';
      apply.textContent = 'สมัคร ↗';
      actions.appendChild(apply);
    }
    if (pdfUrl) {
      const pdf = document.createElement('a');
      pdf.href = pdfUrl;
      pdf.target = '_blank';
      pdf.rel = 'noopener noreferrer';
      pdf.textContent = 'PDF ↗';
      actions.appendChild(pdf);
    }
    actions.appendChild(createSaveButton(job));
    footer.append(deadline, actions);
    body.append(eyebrow, title, department, details, footer);
    article.append(visual, body);
    return article;
  };

  const populateMinistries = () => {
    if (!ministry || !jobData) return;
    ministry.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'ทุกกระทรวง';
    ministry.appendChild(allOption);
    const names = [...new Set(jobData.jobs.map((job) => job.ministry).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      ministry.appendChild(option);
    });
  };

  const render = () => {
    if (!jobData || !grid) return;
    const query = search ? search.value.trim().toLocaleLowerCase('th') : '';
    const selectedMinistry = ministry ? ministry.value : 'all';
    const filtered = jobData.jobs.filter((job) => {
      const text = `${job.position} ${job.department} ${job.ministry} ${job.category} ${job.level}`.toLocaleLowerCase('th');
      const matchesQuery = !query || text.includes(query);
      const matchesMinistry = selectedMinistry === 'all' || job.ministry === selectedMinistry;
      const matchesStatus = selectedStatus === 'all' || job.status === selectedStatus;
      return matchesQuery && matchesMinistry && matchesStatus;
    });
    const visible = filtered.slice(0, visibleLimit);
    grid.replaceChildren(...visible.map(createCard));
    setStatus(`แสดง ${visible.length} จาก ${filtered.length} ประกาศ · ${getFreshness(jobData.generatedAt)}`);
    if (empty) empty.hidden = filtered.length !== 0;
    if (moreButton) {
      moreButton.hidden = filtered.length <= visibleLimit;
      moreButton.textContent = `ดูเพิ่มอีก ${Math.min(24, filtered.length - visibleLimit)} ประกาศ`;
    }
  };

  const readJobsData = async () => {
    try {
      const response = await fetch('/api/jobs', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.jobs)) return { ...payload, jobs: payload.jobs.map(normalizeJob) };
      }
    } catch {}
    const response = await fetch('content/jobs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return { ...payload, jobs: payload.jobs.map(normalizeJob), contentSource: 'static-fallback' };
  };

  const loadJobs = async () => {
    if (refresh) refresh.disabled = true;
    setStatus('กำลังโหลดประกาศรับสมัครงาน...');
    try {
      jobData = await readJobsData();
      if (updated) {
        const generatedDate = jobData.generatedAt && !Number.isNaN(new Date(jobData.generatedAt).getTime())
          ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(jobData.generatedAt))
          : 'ไม่ทราบ';
        updated.textContent = `อัปเดต ${generatedDate} · ${jobData.contentSource === 'kv' ? 'Worker/KV' : 'ข้อมูลสำรอง'}`;
      }
      if (openCount) openCount.textContent = String(jobData.jobs.filter((job) => job.status === 'เปิดรับสมัคร').length);
      if (departmentCount) departmentCount.textContent = String(jobData.departments?.length || 0);
      populateMinistries();
      visibleLimit = 24;
      render();
    } catch {
      jobData = { jobs: [], departments: [] };
      if (empty) empty.hidden = false;
      setStatus('ยังโหลดประกาศไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
    } finally {
      if (refresh) refresh.disabled = false;
    }
  };

  if (search) search.addEventListener('input', () => { visibleLimit = 24; render(); });
  if (ministry) ministry.addEventListener('change', () => { visibleLimit = 24; render(); });
  if (status) status.addEventListener('change', () => { selectedStatus = status.value; visibleLimit = 24; render(); });
  if (moreButton) moreButton.addEventListener('click', () => { visibleLimit += 24; render(); });
  if (refresh) refresh.addEventListener('click', loadJobs);
  loadJobs();
})();
