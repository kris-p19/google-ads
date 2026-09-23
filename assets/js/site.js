(() => {
  const currentDate = document.querySelector('[data-current-date]');
  const currentYear = document.querySelector('[data-current-year]');

  if (currentDate) {
    currentDate.textContent = new Intl.DateTimeFormat('th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }

  if (currentYear) currentYear.textContent = String(new Date().getFullYear());

  let scrollTicking = false;
  const updateScrollProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    document.documentElement.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, progress))));
    scrollTicking = false;
  };

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollProgress);
  }, { passive: true });
  updateScrollProgress();

  const backToTop = document.createElement('button');
  backToTop.type = 'button';
  backToTop.className = 'back-to-top';
  backToTop.setAttribute('aria-label', 'กลับด้านบน');
  backToTop.textContent = '↑';
  backToTop.hidden = true;
  backToTop.tabIndex = -1;
  document.body.appendChild(backToTop);
  const updateBackToTop = () => {
    const visible = window.scrollY > 560;
    backToTop.hidden = !visible;
    backToTop.tabIndex = visible ? 0 : -1;
    backToTop.classList.toggle('is-visible', visible);
  };
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  window.addEventListener('scroll', updateBackToTop, { passive: true });
  updateBackToTop();

  const menuButton = document.querySelector('[data-menu-button]');
  const mobileNav = document.querySelector('[data-mobile-nav]');

  if (menuButton && mobileNav) {
    const mobileLinks = [...mobileNav.querySelectorAll('a')];
    const setMenuState = (open, focusLink = false) => {
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
      mobileNav.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      if (focusLink && open) mobileLinks[0]?.focus();
    };
    const closeMenu = (restoreFocus = false) => {
      setMenuState(false);
      if (restoreFocus) menuButton.focus();
    };

    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      setMenuState(open, open);
    });
    mobileLinks.forEach((link) => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true);
    });
  }

  const savedStorageKey = 'portal-saved-items';
  const readSavedItems = () => {
    try {
      const value = JSON.parse(localStorage.getItem(savedStorageKey) || '[]');
      return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && item.id && item.title && item.url) : [];
    } catch {
      return [];
    }
  };
  const writeSavedItems = (items) => {
    try {
      localStorage.setItem(savedStorageKey, JSON.stringify(items.slice(0, 100)));
    } catch {}
  };
  const updateSavedLinks = () => {
    const count = readSavedItems().length;
    document.querySelectorAll('[data-saved-count]').forEach((element) => {
      element.textContent = `บันทึก (${count})`;
    });
    document.querySelectorAll('[data-saved-link]').forEach((element) => {
      element.setAttribute('aria-label', `รายการที่บันทึก ${count} รายการ`);
    });
  };
  const showToast = (message) => {
    let toast = document.querySelector('[data-portal-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'portal-toast';
      toast.dataset.portalToast = 'true';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  };
  const saved = {
    getAll: readSavedItems,
    has: (id) => readSavedItems().some((item) => item.id === id),
    toggle: (item) => {
      const items = readSavedItems();
      const id = String(item.id || item.url);
      const index = items.findIndex((savedItem) => savedItem.id === id);
      if (index >= 0) {
        items.splice(index, 1);
        writeSavedItems(items);
        updateSavedLinks();
        document.dispatchEvent(new CustomEvent('portal:saved-change'));
        showToast('นำออกจากรายการที่บันทึกแล้ว');
        return false;
      }
      items.unshift({
        id,
        type: item.type || 'news',
        title: String(item.title || '').slice(0, 220),
        url: item.url,
        source: String(item.source || '').slice(0, 120),
        publishedAt: item.publishedAt || null,
      });
      writeSavedItems(items);
      updateSavedLinks();
      document.dispatchEvent(new CustomEvent('portal:saved-change'));
      showToast('บันทึกเรื่องนี้แล้ว');
      return true;
    },
    remove: (id) => {
      writeSavedItems(readSavedItems().filter((item) => item.id !== id));
      updateSavedLinks();
      document.dispatchEvent(new CustomEvent('portal:saved-change'));
    },
    clear: () => {
      writeSavedItems([]);
      updateSavedLinks();
      document.dispatchEvent(new CustomEvent('portal:saved-change'));
    },
  };
  window.portalSaved = saved;
  updateSavedLinks();

  const cards = [...document.querySelectorAll('[data-news-card]')];
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const searchInput = document.querySelector('[data-news-search]');
  const resultCount = document.querySelector('[data-news-count]');
  const emptyState = document.querySelector('[data-news-empty]');
  const validFilters = new Set(filterButtons.map((button) => button.dataset.filter));
  let selectedFilter = 'ทั้งหมด';

  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get('category');
  if (requestedFilter && validFilters.has(requestedFilter)) selectedFilter = requestedFilter;

  const categoryPage = document.querySelector('[data-category-page]');
  if (categoryPage) {
    const categoryDetails = {
      'เทคโนโลยี': { eyebrow: 'หมวดเทคโนโลยี', title: 'เครื่องมือและไอเดียที่นำไปใช้ได้จริง', description: 'ข่าวสาร บทวิเคราะห์ และคู่มือด้านเทคโนโลยีที่ช่วยให้เลือกใช้งานได้เหมาะสมกับงานจริง' },
      'ธุรกิจ': { eyebrow: 'หมวดธุรกิจ', title: 'ข้อมูลและเครื่องมือที่ช่วยให้ธุรกิจเดินหน้า', description: 'เรียนรู้จากกระบวนการทำงาน การจัดการข้อมูล และการตัดสินใจที่เกิดขึ้นจริงในธุรกิจ' },
      'สังคม': { eyebrow: 'หมวดสังคม', title: 'บริบทของเรื่องราวที่กำลังเปลี่ยนไป', description: 'มองประเด็นสังคมผ่านข้อมูล บริบท และคำถามที่ควรตั้งไว้ก่อนสรุป' },
      'สุขภาพ': { eyebrow: 'หมวดสุขภาพ', title: 'เริ่มต้นดูแลตัวเองจากสิ่งที่ทำได้วันนี้', description: 'คู่มือสั้น ๆ สำหรับการพักผ่อน จัดการพลัง และสร้างนิสัยที่เหมาะกับชีวิตจริง' },
      'ท่องเที่ยว': { eyebrow: 'หมวดท่องเที่ยว', title: 'เมือง ชุมชน และการท่องเที่ยวที่มีบริบท', description: 'เรื่องราวการเดินทางที่มองทั้งผู้เยี่ยมชม ชุมชน และสิ่งที่ทำให้ท้องถิ่นยังมีชีวิต' },
    };
    const details = categoryDetails[selectedFilter];
    if (details) {
      const eyebrow = categoryPage.querySelector('[data-category-eyebrow]');
      const title = categoryPage.querySelector('[data-category-title]');
      const description = categoryPage.querySelector('[data-category-description]');
      if (eyebrow) eyebrow.textContent = details.eyebrow;
      if (title) title.textContent = details.title;
      if (description) description.textContent = details.description;
      document.title = `${selectedFilter} — Portal`;
    }
  }

  const updateNews = () => {
    if (!cards.length) return;
    const query = searchInput ? searchInput.value.trim().toLocaleLowerCase('th') : '';
    let visible = 0;
    cards.forEach((card) => {
      const matchesFilter = selectedFilter === 'ทั้งหมด' || card.dataset.category === selectedFilter;
      const searchable = `${card.dataset.title} ${card.textContent}`.toLocaleLowerCase('th');
      const matchesSearch = !query || searchable.includes(query);
      const isVisible = matchesFilter && matchesSearch;
      card.hidden = !isVisible;
      if (isVisible) visible += 1;
    });
    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === selectedFilter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    if (resultCount) resultCount.textContent = `พบ ${visible} เรื่อง`;
    if (emptyState) emptyState.hidden = visible !== 0;
    document.dispatchEvent(new CustomEvent('portal:news-filter', { detail: { query, category: selectedFilter } }));
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedFilter = button.dataset.filter;
      updateNews();
    });
  });
  if (searchInput) searchInput.addEventListener('input', updateNews);
  updateNews();

  const copyButton = document.querySelector('[data-copy-link]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyButton.textContent = 'คัดลอกลิงก์แล้ว';
      } catch {
        copyButton.textContent = 'คัดลอกลิงก์ไม่สำเร็จ';
      }
    });
  }

  const contactForm = document.querySelector('[data-contact-form]');
  const contactStatus = document.querySelector('[data-contact-status]');
  if (contactForm && contactStatus) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = new FormData(contactForm).get('name');
      contactStatus.textContent = `ขอบคุณ ${name} ข้อมูลผ่านการตรวจสอบแล้ว แต่ยังไม่ได้ส่งออก เพราะระบบรับข้อความยังไม่ได้เชื่อมต่อ`;
      contactForm.reset();
    });
  }

  const storageKey = 'portal-ad-consent-v1';
  const banner = document.querySelector('[data-consent-banner]');
  const settingsButton = document.querySelector('[data-consent-settings]');
  const adClient = 'ca-pub-3203802670121740';
  if (banner && settingsButton) {
    let previousFocus = null;
    const hideBanner = (restoreFocus = false) => {
      banner.hidden = true;
      settingsButton.hidden = false;
      if (restoreFocus && previousFocus) previousFocus.focus();
    };
    const showBanner = (focus = false) => {
      if (banner.hidden) previousFocus = document.activeElement;
      banner.hidden = false;
      settingsButton.hidden = true;
      if (focus) window.requestAnimationFrame(() => banner.querySelector('button')?.focus());
    };
    const queueAdUnits = () => {
      document.querySelectorAll('ins.adsbygoogle').forEach((unit) => {
        if (unit.dataset.portalQueued === 'true') return;
        unit.dataset.portalQueued = 'true';
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      });
    };
    const loadAdSense = () => {
      if (!document.querySelector('ins.adsbygoogle')) return;
      queueAdUnits();
      if (document.querySelector('script[data-portal-adsense]')) return;
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`;
      script.dataset.portalAdsense = 'true';
      document.head.appendChild(script);
    };
    let choice = null;
    try { choice = localStorage.getItem(storageKey); } catch {}
    if (choice === 'granted') {
      loadAdSense();
      hideBanner();
    } else if (choice === 'declined') {
      hideBanner();
    } else {
      showBanner();
    }
    banner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-consent]');
      if (!button) return;
      const adsWereLoaded = Boolean(document.querySelector('script[data-portal-adsense]'));
      choice = button.dataset.consent;
      try { localStorage.setItem(storageKey, choice); } catch {}
      if (choice === 'granted') loadAdSense();
      if (choice === 'declined' && adsWereLoaded) {
        window.location.reload();
        return;
      }
      hideBanner();
    });
    settingsButton.addEventListener('click', () => showBanner(true));
  }
})();
