(() => {
  const grid = document.querySelector('[data-saved-grid]');
  const empty = document.querySelector('[data-saved-empty]');
  const total = document.querySelector('[data-saved-total]');
  const clear = document.querySelector('[data-saved-clear]');

  if (!grid) return;

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const formatDate = (value) => {
    if (!value) return 'ไม่ระบุวันที่';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ไม่ระบุวันที่';
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const createCard = (item) => {
    const url = safeUrl(item.url);
    if (!url) return null;
    const article = document.createElement('article');
    article.className = 'story-card';
    const visual = document.createElement('a');
    visual.className = `card-visual visual-pattern ${item.type === 'job' ? 'visual-government' : 'visual-editorial'}`;
    visual.href = url;
    visual.target = '_blank';
    visual.rel = 'noopener noreferrer';
    visual.setAttribute('aria-label', `เปิด ${item.title}`);
    const word = document.createElement('span');
    word.className = 'visual-word';
    word.textContent = item.type === 'job' ? 'งาน' : 'ข่าว';
    const label = document.createElement('span');
    label.className = 'visual-label';
    label.textContent = item.source || 'Portal';
    visual.append(word, label);
    const body = document.createElement('div');
    body.className = 'card-body';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = item.type === 'job' ? 'ประกาศงาน' : 'ข่าวที่บันทึก';
    const title = document.createElement('h3');
    const titleLink = document.createElement('a');
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.textContent = item.title;
    title.appendChild(titleLink);
    const meta = document.createElement('p');
    meta.textContent = `${item.source || 'Portal'} · ${formatDate(item.publishedAt)}`;
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    const open = document.createElement('a');
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'เปิดต้นฉบับ ↗';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'save-button is-saved';
    remove.textContent = 'นำออก';
    remove.setAttribute('aria-label', `นำ ${item.title} ออกจากรายการที่บันทึก`);
    remove.addEventListener('click', () => window.portalSaved?.remove(item.id));
    footer.append(open, remove);
    body.append(eyebrow, title, meta, footer);
    article.append(visual, body);
    return article;
  };

  const render = () => {
    const items = window.portalSaved?.getAll() || [];
    const cards = items.map(createCard).filter(Boolean);
    grid.replaceChildren(...cards);
    if (empty) empty.hidden = cards.length !== 0;
    if (total) total.textContent = String(cards.length);
    if (clear) clear.disabled = cards.length === 0;
  };

  clear?.addEventListener('click', () => {
    if (window.confirm('ล้างรายการที่บันทึกทั้งหมดหรือไม่?')) window.portalSaved?.clear();
  });
  document.addEventListener('portal:saved-change', render);
  render();
})();
