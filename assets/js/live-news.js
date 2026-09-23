(() => {
  const liveNews = document.querySelector('[data-live-news]');

  if (!liveNews) return;

  const grid = liveNews.querySelector('[data-live-news-grid]');
  const status = liveNews.querySelector('[data-live-news-status]');
  const updated = liveNews.querySelector('[data-live-news-updated]');
  const refreshButton = liveNews.querySelector('[data-live-news-refresh]');
  const filterButtons = [...liveNews.querySelectorAll('[data-live-filter]')];
  const accents = ['visual-brand', 'visual-coral', 'visual-sky', 'visual-sand', 'visual-lilac'];
  let selectedSource = 'all';
  let newsData = null;

  const formatDate = (value) => {
    if (!value) return 'ไม่ระบุวันที่';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่ระบุวันที่';
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const createCard = (item, index) => {
    const article = document.createElement('article');
    article.className = 'story-card';

    const visual = document.createElement('a');
    visual.className = `card-visual visual-pattern ${item.accent || accents[index % accents.length]}`;
    visual.href = item.url;
    visual.target = '_blank';
    visual.rel = 'noopener noreferrer';
    visual.setAttribute('aria-label', `อ่านข่าวจาก ${item.sourceName}: ${item.title}`);

    const label = document.createElement('span');
    label.className = 'visual-label';
    label.textContent = item.sourceName;
    visual.appendChild(label);

    const symbol = document.createElement('span');
    symbol.className = 'visual-symbol visual-symbol-light';
    symbol.textContent = item.sourceName.slice(0, 3).toUpperCase();
    visual.appendChild(symbol);

    const body = document.createElement('div');
    body.className = 'card-body';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = item.category || 'ข่าว';

    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    titleLink.href = item.url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.textContent = item.title;
    title.appendChild(titleLink);

    const summary = document.createElement('p');
    summary.textContent = item.summary || 'เปิดลิงก์ต้นฉบับเพื่ออ่านรายละเอียดเพิ่มเติม';

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const date = document.createElement('span');
    date.textContent = formatDate(item.publishedAt);
    const source = document.createElement('a');
    source.href = item.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'อ่านต้นฉบับ ↗';
    footer.append(date, source);

    body.append(eyebrow, title, summary, footer);
    article.append(visual, body);
    return article;
  };

  const render = () => {
    if (!newsData || !grid) return;
    const visible = selectedSource === 'all'
      ? newsData.items
      : newsData.items.filter((item) => item.sourceId === selectedSource);
    grid.replaceChildren(...visible.slice(0, 12).map(createCard));
    setStatus(`แสดง ${Math.min(visible.length, 12)} ข่าวล่าสุด · ข้อมูลจากฟีดทางการ`);
  };

  const readNewsData = async () => {
    try {
      const response = await fetch('/api/content', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.news?.items)) {
          payload.news.generatedAt = payload.news.generatedAt || payload.generatedAt;
          return payload.news;
        }
      }
    } catch {}

    const response = await fetch('content/news.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  const loadNews = async () => {
    if (refreshButton) refreshButton.disabled = true;
    setStatus('กำลังโหลดข่าวล่าสุด...');

    try {
      newsData = await readNewsData();
      if (updated && newsData.generatedAt) {
        updated.textContent = `อัปเดต ${formatDate(newsData.generatedAt)}`;
      }
      render();
    } catch {
      setStatus('ยังโหลดข่าวไม่ได้ กรุณาสร้างข้อมูลด้วยคำสั่ง fetch-news ก่อน');
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
      render();
    });
  });

  if (refreshButton) refreshButton.addEventListener('click', loadNews);
  loadNews();
})();
