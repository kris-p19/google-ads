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
  const accents = ['visual-government', 'visual-editorial', 'visual-world', 'visual-tech', 'visual-health'];
  let jobData = null;
  let selectedStatus = 'all';

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

  const setStatus = (message) => {
    if (count) count.textContent = message;
  };

  const createCard = (job, index) => {
    const article = document.createElement('article');
    article.className = 'story-card';

    const visual = document.createElement('div');
    visual.className = `card-visual visual-pattern ${accents[index % accents.length]}`;
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
    title.textContent = job.position;
    const department = document.createElement('p');
    department.textContent = `${job.department} · ${job.category} · ${job.level}`;
    const details = document.createElement('p');
    details.textContent = `${formatSalary(job)} · ${job.positionAmount || 'ไม่ระบุ'} อัตรา · รับสมัคร ${formatDate(job.applicationStart)}–${formatDate(job.applicationEnd)}`;
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const deadline = document.createElement('span');
    deadline.textContent = job.status === 'เปิดรับสมัคร' ? `เหลือ ${job.daysRemaining} วัน` : 'ปิดรับสมัครแล้ว';
    const links = document.createElement('div');
    links.className = 'footer-links';
    const official = document.createElement('a');
    official.href = job.officialUrl;
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    official.textContent = 'ประกาศ ↗';
    links.appendChild(official);
    if (job.applicationUrl) {
      const apply = document.createElement('a');
      apply.href = job.applicationUrl;
      apply.target = '_blank';
      apply.rel = 'noopener noreferrer';
      apply.textContent = 'สมัคร ↗';
      links.appendChild(apply);
    }
    if (job.pdfUrl) {
      const pdf = document.createElement('a');
      pdf.href = job.pdfUrl;
      pdf.target = '_blank';
      pdf.rel = 'noopener noreferrer';
      pdf.textContent = 'PDF ↗';
      links.appendChild(pdf);
    }
    footer.append(deadline, links);
    body.append(eyebrow, title, department, details, footer);
    article.append(visual, body);
    return article;
  };

  const populateMinistries = () => {
    if (!ministry || !jobData) return;
    const names = [...new Set(jobData.jobs.map((job) => job.ministry))].sort((a, b) => a.localeCompare(b, 'th'));
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
    grid.replaceChildren(...filtered.slice(0, 24).map(createCard));
    setStatus(`แสดง ${Math.min(filtered.length, 24)} จาก ${filtered.length} ประกาศ`);
    if (empty) empty.hidden = filtered.length !== 0;
  };

  const readJobsData = async () => {
    try {
      const response = await fetch('/api/content', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.jobs?.jobs)) {
          payload.jobs.generatedAt = payload.jobs.generatedAt || payload.generatedAt;
          return payload.jobs;
        }
      }
    } catch {}

    const response = await fetch('content/jobs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  const loadJobs = async () => {
    if (refresh) refresh.disabled = true;
    setStatus('กำลังโหลดประกาศรับสมัครงาน...');

    try {
      jobData = await readJobsData();
      if (updated) updated.textContent = `อัปเดต ${new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(jobData.generatedAt))}`;
      if (openCount) openCount.textContent = String(jobData.jobs.filter((job) => job.status === 'เปิดรับสมัคร').length);
      if (departmentCount) departmentCount.textContent = String(jobData.departments.length);
      populateMinistries();
      render();
    } catch {
      setStatus('ยังโหลดประกาศไม่ได้ กรุณาสร้างข้อมูลด้วยคำสั่ง fetch-jobs ก่อน');
    } finally {
      if (refresh) refresh.disabled = false;
    }
  };

  if (search) search.addEventListener('input', render);
  if (ministry) ministry.addEventListener('change', render);
  if (status) status.addEventListener('change', () => {
    selectedStatus = status.value;
    render();
  });
  if (refresh) refresh.addEventListener('click', loadJobs);
  loadJobs();
})();
