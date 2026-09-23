(() => {
  const liveNews = document.querySelector('[data-live-news]');
  if (!liveNews) return;

  const grid = liveNews.querySelector('[data-live-news-grid]');
  const status = liveNews.querySelector('[data-live-news-status]');
  const updated = liveNews.querySelector('[data-live-news-updated]');
  const refreshButton = liveNews.querySelector('[data-live-news-refresh]');
  const filterButtons = [...liveNews.querySelectorAll('[data-live-filter]')];
  const searchInput = liveNews.querySelector('[data-live-news-search]');
  const categorySelect = liveNews.querySelector('[data-live-news-category]');
  const moreButton = liveNews.querySelector('[data-live-news-more]');
  const empty = liveNews.querySelector('[data-live-news-empty]');
  const accents = ['visual-editorial', 'visual-world', 'visual-tech', 'visual-health', 'visual-travel'];
  const accentClasses = { brand: 'visual-tech', sky: 'visual-world', coral: 'visual-health' };
  let selectedSource = 'all';
  let selectedCategory = 'all';
  let query = '';
  let visibleLimit = 12;
  let newsData = null;

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const formatDate = (value, withTime = false) => {
    if (!value) return 'ไม่ระบุวันที่';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่ระบุวันที่';
    return new Intl.DateTimeFormat('th-TH', withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const getFreshness = (value) => {
    if (!value) return { state: 'unknown', label: 'ไม่ทราบเวลาอัปเดต' };
    const age = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(age)) return { state: 'unknown', label: 'ไม่ทราบเวลาอัปเดต' };
    const minutes = Math.max(0, Math.floor(age / 60000));
    if (minutes < 90) return { state: 'fresh', label: 'ข้อมูลล่าสุด' };
    if (minutes < 1440) return { state: 'stale', label: 'ข้อมูลอาจค่อนข้างเก่า' };
    return { state: 'stale', label: 'ข้อมูลเก่า' };
  };

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const sourceLabel = (data) => {
    const source = data?.contentSource || data?.source || 'static-fallback';
    return source === 'kv' ? 'ข้อมูลจาก Worker/KV' : 'ข้อมูลสำรองล่าสุด';
  };

  const createSaveButton = (item) => {
    const button = document.createElement('button');
    const sync = () => {
      const saved = window.portalSaved?.has(item.id) || false;
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.textContent = saved ? 'บันทึกแล้ว' : 'บันทึก';
    };
    button.type = 'button';
    button.className = 'save-button';
    button.setAttribute('aria-label', `${window.portalSaved?.has(item.id) ? 'นำออกจาก' : 'บันทึก'} ${item.title}`);
    button.addEventListener('click', () => {
      window.portalSaved?.toggle(item);
      sync();
    });
    document.addEventListener('portal:saved-change', sync);
    sync();
    return button;
  };

  const createCard = (item, index) => {
    const url = safeUrl(item.url);
    if (!url) return null;
    const normalized = { ...item, id: String(item.id || `${item.sourceId || 'news'}:${url}`), url };
    const article = document.createElement('article');
    article.className = 'story-card';
    article.dataset.category = item.category || '';

    const visual = document.createElement('a');
    const accentClass = accentClasses[item.accent] || accents[index % accents.length];
    visual.className = `card-visual visual-pattern ${accentClass}`;
    visual.href = url;
    visual.target = '_blank';
    visual.rel = 'noopener noreferrer';
    visual.setAttribute('aria-label', `อ่านข่าวจาก ${item.sourceName || item.sourceId || 'แหล่งข่าว'}: ${item.title}`);

    const label = document.createElement('span');
    label.className = 'visual-label';
    label.textContent = item.sourceName || item.sourceId || 'ข่าว';
    visual.appendChild(label);
    const symbol = document.createElement('span');
    symbol.className = 'visual-symbol visual-symbol-light';
    symbol.textContent = (item.sourceName || item.sourceId || 'NEWS').slice(0, 3).toUpperCase();
    visual.appendChild(symbol);

    const body = document.createElement('div');
    body.className = 'card-body';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = item.category || 'ข่าว';
    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.textContent = item.title || 'ไม่ระบุหัวข้อ';
    title.appendChild(titleLink);
    const summary = document.createElement('p');
    summary.textContent = item.summary || 'เปิดลิงก์ต้นฉบับเพื่ออ่านรายละเอียดเพิ่มเติม';
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const date = document.createElement('span');
    date.textContent = formatDate(item.publishedAt);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const source = document.createElement('a');
    source.href = url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'อ่านต้นฉบับ ↗';
    actions.append(source, createSaveButton(normalized));
    footer.append(date, actions);
    body.append(eyebrow, title, summary, footer);
    article.append(visual, body);
    return article;
  };

  const normalizeItems = (data) => (Array.isArray(data?.items) ? data.items : [])
    .map((item) => ({ ...item, url: safeUrl(item.url) }))
    .filter((item) => item.url);

  const render = () => {
    if (!newsData || !grid) return;
    const normalizedQuery = query.trim().toLocaleLowerCase('th');
    const items = normalizeItems(newsData);
    const filtered = items.filter((item) => {
      const matchesSource = selectedSource === 'all' || item.sourceId === selectedSource;
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const searchable = `${item.title || ''} ${item.summary || ''} ${item.sourceName || ''} ${item.category || ''}`.toLocaleLowerCase('th');
      return matchesSource && matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
    const visible = filtered.slice(0, visibleLimit);
    grid.replaceChildren(...visible.map(createCard).filter(Boolean));
    if (empty) empty.hidden = filtered.length !== 0;
    if (moreButton) {
      moreButton.hidden = filtered.length <= visibleLimit;
      moreButton.textContent = `ดูเพิ่มอีก ${Math.min(12, filtered.length - visibleLimit)} ข่าว`;
    }
    const freshness = getFreshness(newsData.generatedAt);
    setStatus(`แสดง ${visible.length} จาก ${filtered.length} ข่าว · ${sourceLabel(newsData)} · ${freshness.label}`);
  };

  const readNewsData = async () => {
    try {
      const response = await fetch('/api/news', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.items)) return payload;
      }
    } catch {}
    const response = await fetch('content/news.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return { ...payload, contentSource: 'static-fallback' };
  };

  const loadNews = async () => {
    if (refreshButton) refreshButton.disabled = true;
    setStatus('กำลังโหลดข่าวล่าสุด...');
    try {
      newsData = await readNewsData();
      visibleLimit = 12;
      if (updated && newsData.generatedAt) updated.textContent = `อัปเดต ${formatDate(newsData.generatedAt, true)}`;
      render();
    } catch {
      newsData = { items: [] };
      if (empty) empty.hidden = false;
      setStatus('ยังโหลดข่าวไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedSource = button.dataset.liveFilter || 'all';
      filterButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });
      visibleLimit = 12;
      render();
    });
  });
  if (searchInput) searchInput.addEventListener('input', () => { query = searchInput.value; visibleLimit = 12; render(); });
  if (categorySelect) categorySelect.addEventListener('change', () => { selectedCategory = categorySelect.value; visibleLimit = 12; render(); });
  if (moreButton) moreButton.addEventListener('click', () => { visibleLimit += 12; render(); });
  if (refreshButton) refreshButton.addEventListener('click', loadNews);
  document.addEventListener('portal:news-filter', (event) => {
    if (event.detail?.query !== undefined) query = event.detail.query;
    if (event.detail?.category && event.detail.category !== 'ทั้งหมด') {
      const categoryMap = { เทคโนโลยี: 'วิทยาศาสตร์', ธุรกิจ: 'โลก', สังคม: 'โลก', สุขภาพ: 'สุขภาพ', ท่องเที่ยว: 'โลก' };
      selectedCategory = categoryMap[event.detail.category] || 'all';
      if (categorySelect) categorySelect.value = selectedCategory;
    }
    visibleLimit = 12;
    render();
  });
  loadNews();
})();
