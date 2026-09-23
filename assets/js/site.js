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

  if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
  }

  const menuButton = document.querySelector('[data-menu-button]');
  const mobileNav = document.querySelector('[data-mobile-nav]');

  if (menuButton && mobileNav) {
    const closeMenu = () => {
      menuButton.setAttribute('aria-expanded', 'false');
      mobileNav.classList.remove('is-open');
      document.body.classList.remove('menu-open');
    };

    menuButton.addEventListener('click', () => {
      const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!isOpen));
      mobileNav.classList.toggle('is-open', !isOpen);
      document.body.classList.toggle('menu-open', !isOpen);
    });

    mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }

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

  const storageKey = 'portal-ad-consent';
  const banner = document.querySelector('[data-consent-banner]');
  const settingsButton = document.querySelector('[data-consent-settings]');
  const adClient = 'ca-pub-3203802670121740';

  if (banner && settingsButton) {
    const hideBanner = () => {
      banner.hidden = true;
      settingsButton.hidden = false;
    };

    const showBanner = () => {
      banner.hidden = false;
      settingsButton.hidden = true;
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
      const units = document.querySelectorAll('ins.adsbygoogle');
      if (!units.length) return;
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
    try {
      choice = localStorage.getItem(storageKey);
    } catch {}

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
      try {
        localStorage.setItem(storageKey, choice);
      } catch {}
      if (choice === 'granted') loadAdSense();
      if (choice === 'declined' && adsWereLoaded) {
        window.location.reload();
        return;
      }
      hideBanner();
    });

    settingsButton.addEventListener('click', showBanner);
  }
})();
