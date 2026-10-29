import { onLayoutReady } from './components/index.js';

/* ============================================================
   NOIR — shared utilities + UI (storefront)
   ============================================================ */

function $(sel, parent) {
  try { return (parent || document).querySelector(sel); } catch (e) { return null; }
}
function $$(sel, parent) {
  try { return Array.from((parent || document).querySelectorAll(sel)); } catch (e) { return []; }
}
function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n) {
  return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
}
function showToast(msg) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}
function noirDB() {
  if (typeof window.NOIR_DB !== 'undefined' && window.NOIR_DB) return window.NOIR_DB;
  return { products: [], bundles: [], orders: [], customers: [], heroSlides: [], settings: { language: 'en', radius: 6 } };
}
function t(key) { return typeof noirT === 'function' ? noirT(key) : key; }
function computePrice(p) { return typeof noirComputePrice === 'function' ? noirComputePrice(p) : (p && p.price) || 0; }
function getProductById(id) { return typeof noirGetProduct === 'function' ? noirGetProduct(id) : null; }
function getBundleById(id) { return typeof noirGetBundle === 'function' ? noirGetBundle(id) : null; }
function isImageUrl(value) {
  return typeof value === 'string' && /^(https?:\/\/|\/)/.test(value);
}

/* ============================================================
   1. MOBILE MENU + LANGUAGE SWITCHER
   ============================================================ */
onLayoutReady(function () {
  try {
    const toggle = $('#menu-toggle');
    const nav = $('#main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        const isOpen = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(isOpen));
      });
    }
    const langSel = $('#lang-select');
    if (langSel && typeof NOIR_DB !== 'undefined') {
      langSel.value = NOIR_DB.settings.language || 'en';
      langSel.addEventListener('change', function () {
        if (typeof noirSetLang === 'function') noirSetLang(langSel.value);
      });
    }
  } catch (e) { console.error('[app.js] menu init failed:', e); }
});

/* ============================================================
   2. PRODUCT CARD
   ============================================================ */
function productCardHTML(p) {
  if (!p) return '';
  const price = computePrice(p);
  const hasOffer = !!p.offer;
  const isBest = !!p.bestSeller;

  const visual = isImageUrl(p.bottle)
    ? '<img class="product-image" src="' + escapeHTML(p.bottle) + '" alt="' + escapeHTML(p.name) + '" loading="lazy">'
    : '<div class="product-bottle ' + escapeHTML(p.bottle || '') + '"></div>';

  return '<article class="product-card" data-product-id="' + p.id + '">' +
    '<div class="product-visual">' +
      (p.badge ? '<span class="product-badge">' + escapeHTML(p.badge) + '</span>' : '') +
      (hasOffer ? '<span class="product-badge offer" style="top:' + (p.badge ? '48px' : '12px') + '">' + escapeHTML(p.offer.label || 'Sale') + '</span>' : '') +
      (isBest && !hasOffer ? '<span class="product-badge best" style="top:' + (p.badge ? '48px' : '12px') + '">⭐</span>' : '') +
      visual +
      '<div class="quick-view"><button class="button button-outline" data-quick-view="' + p.id + '">' + t('product.quickView') + '</button></div>' +
    '</div>' +
    '<div class="product-info">' +
      '<p class="product-category">' + escapeHTML(p.category) + '</p>' +
      '<h3>' + escapeHTML(p.name) + '</h3>' +
      '<p class="product-subtitle">' + escapeHTML(p.subtitle) + '</p>' +
      '<div class="product-bottom"><div>' +
        '<span class="product-price">' + money(price) + '</span>' +
        (hasOffer ? '<span class="product-price-old">' + money(p.price) + '</span>' : '') +
      '</div><button class="add-cart" data-add-to-cart="' + p.id + '" aria-label="' + t('product.addToCart') + '">+</button></div>' +
    '</div>' +
  '</article>';
}

/* ============================================================
   HERO — dynamic (classic / video)
   ============================================================ */
function heroSlideHTML(slide, index) {
  if (!slide) return '';
  const isFirst = index === 0;
  const hiddenAttr = isFirst ? '' : ' hidden';

  if (slide.theme === 'video') {
    const overlay = Math.min(100, Math.max(0, slide.overlayOpacity ?? 45)) / 100;
    const poster = slide.videoPoster ? ' poster="' + escapeHTML(slide.videoPoster) + '"' : '';
    return '<div class="hero-slide hero-slide--video' + (isFirst ? ' is-active' : '') + '" data-slide="' + index + '"' + hiddenAttr + '>' +
      '<video class="hero-video" autoplay muted loop playsinline' + poster + '>' +
        '<source src="' + escapeHTML(slide.videoUrl) + '" type="video/mp4">' +
      '</video>' +
      '<div class="hero-video-overlay" style="background:rgba(0,0,0,' + overlay + ')"></div>' +
      '<div class="hero-video-copy">' +
        (slide.eyebrow ? '<p class="eyebrow"><span class="eyebrow-mark">✧</span><span>' + escapeHTML(slide.eyebrow) + '</span></p>' : '') +
        '<h1><span>' + escapeHTML(slide.titleLine1) + '</span><br><em>' + escapeHTML(slide.titleLine2) + '</em></h1>' +
        (slide.description ? '<p class="hero-description">' + escapeHTML(slide.description) + '</p>' : '') +
        (slide.ctaText ? '<a class="button button-outline" href="' + escapeHTML(slide.ctaLink) + '">' + escapeHTML(slide.ctaText) + ' →</a>' : '') +
        (slide.note ? '<div class="hero-note"><span class="note-line"></span><span>' + escapeHTML(slide.note) + '</span></div>' : '') +
      '</div>' +
    '</div>';
  }

  const bottleVisual = isImageUrl(slide.bottleImage)
    ? '<img class="hero-bottle-img" src="' + escapeHTML(slide.bottleImage) + '" alt="" loading="lazy">'
    : '<div class="hero-bottle"><div class="bottle-cap"></div><div class="bottle-neck"></div><div class="bottle-body"><div class="bottle-label"><small>NOIR</small><strong>' + escapeHTML(slide.titleLine2 || '') + '</strong><span>' + escapeHTML(slide.eyebrow || '') + '</span><i>EAU DE PARFUM</i></div></div></div>';

  return '<div class="hero-slide' + (isFirst ? ' is-active' : '') + '" data-slide="' + index + '"' + hiddenAttr + '>' +
    '<div class="hero-copy">' +
      (slide.eyebrow ? '<p class="eyebrow"><span class="eyebrow-mark">✧</span><span>' + escapeHTML(slide.eyebrow) + '</span></p>' : '') +
      '<h1><span>' + escapeHTML(slide.titleLine1) + '</span><br><em>' + escapeHTML(slide.titleLine2) + '</em></h1>' +
      (slide.description ? '<p class="hero-description">' + escapeHTML(slide.description) + '</p>' : '') +
      (slide.ctaText ? '<a class="button button-outline" href="' + escapeHTML(slide.ctaLink) + '">' + escapeHTML(slide.ctaText) + ' →</a>' : '') +
      (slide.note ? '<div class="hero-note"><span class="note-line"></span><span>' + escapeHTML(slide.note) + '</span></div>' : '') +
    '</div>' +
    '<div class="hero-art" role="img">' +
      '<div class="arch"></div><div class="halo"></div>' +
      bottleVisual +
      '<div class="incense inc-one"></div><div class="incense inc-two"></div>' +
      (slide.artCaption ? '<span class="hero-art-caption">' + escapeHTML(slide.artCaption) + '</span>' : '') +
    '</div>' +
  '</div>';
}

function initHeroCarousel() {
  const hero = document.querySelector('[data-hero-carousel]');
  if (!hero) return;
  const slides = Array.from(hero.querySelectorAll('.hero-slide'));
  const dots   = Array.from(hero.querySelectorAll('[data-slide-to]'));
  if (slides.length < 2 || dots.length === 0) return;

  let current = 0;
  let timer = null;
  const AUTOPLAY_MS = 7000;

  function goTo(index) {
    if (index === current) return;
    index = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const isActive = i === index;
      slide.hidden = !isActive;
      slide.classList.toggle('is-active', isActive);
      const vid = slide.querySelector('video');
      if (vid) { isActive ? vid.play().catch(() => {}) : vid.pause(); }
    });
    dots.forEach((dot, i) => {
      const isActive = i === index;
      dot.classList.toggle('active', isActive);
      dot.setAttribute('aria-selected', String(isActive));
    });
    current = index;
  }
  function next() { goTo(current + 1); }
  function startAutoplay() { stopAutoplay(); timer = setInterval(next, AUTOPLAY_MS); }
  function stopAutoplay() { if (timer) { clearInterval(timer); timer = null; } }

  dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); startAutoplay(); }));
  hero.addEventListener('mouseenter', stopAutoplay);
  hero.addEventListener('mouseleave', startAutoplay);
  document.addEventListener('visibilitychange', () => { document.hidden ? stopAutoplay() : startAutoplay(); });
  hero.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { goTo(current - 1); startAutoplay(); }
    if (e.key === 'ArrowRight') { goTo(current + 1); startAutoplay(); }
  });
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) startAutoplay();
}

function renderHeroSlides() {
  const hero = document.querySelector('[data-hero-carousel]');
  if (!hero) return;
  const slides = (noirDB().heroSlides || []).filter(s => s.active !== false);
  if (!slides.length) {
    hero.innerHTML = '<div class="hero-loading">No hero slides configured.</div>';
    return;
  }
  const dotsHTML = '<div class="hero-pagination" role="tablist" aria-label="Hero slides">' +
    slides.map((_, i) => '<button' + (i === 0 ? ' class="active"' : '') + ' type="button" data-slide-to="' + i + '" aria-label="Slide ' + (i + 1) + '" aria-selected="' + (i === 0) + '" role="tab"></button>').join('') +
    '</div>';
  hero.innerHTML = slides.map(heroSlideHTML).join('') + dotsHTML;
  initHeroCarousel();
}

/* ============================================================
   3. RENDERERS
   ============================================================ */
function renderProducts(list) {
  const grid = $('#product-grid');
  if (!grid) return;
  const source = list || noirDB().products || [];
  grid.innerHTML = source.map(productCardHTML).join('');
  const empty = $('#empty-state');
  if (empty) empty.classList.toggle('hidden', source.length > 0);
}

function renderBestSellers() {
  const grid = $('#bestsellers-grid');
  const section = $('#bestsellers-section');
  if (!grid || !section) return;
  const db = noirDB();
  const list = (db.products || []).filter(p => p.bestSeller);
  if (!list.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = list.map(productCardHTML).join('');
}

function bundleCardHTML(bundle) {
  if (!bundle) return '';
  const items = (bundle.productIds || []).map(getProductById).filter(Boolean);
  const image = isImageUrl(bundle.bottle)
    ? '<img class="bundle-image" src="' + escapeHTML(bundle.bottle) + '" alt="' + escapeHTML(bundle.name) + '" loading="lazy">'
    : '';
  return '<article class="bundle-card">' +
    image +
    (bundle.badge ? '<span class="bundle-badge">' + escapeHTML(bundle.badge) + '</span>' : '') +
    '<h3 class="bundle-title">' + escapeHTML(bundle.name) + '</h3>' +
    '<p class="bundle-desc">' + escapeHTML(bundle.description || '') + '</p>' +
    '<div class="bundle-products">' + items.map(p => '<span>' + escapeHTML(p.name) + '</span>').join('') + '</div>' +
    '<div class="bundle-foot"><span class="bundle-price">' + money(bundle.price) + '</span>' +
    '<button class="button button-gold" data-add-bundle="' + bundle.id + '">Add bundle</button></div>' +
  '</article>';
}

function renderBundles() {
  const grid = $('#bundles-grid');
  const section = $('#bundles-section');
  if (!grid || !section) return;
  const active = (noirDB().bundles || []).filter(b => b.active !== false);
  if (!active.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = active.map(bundleCardHTML).join('');
}

function renderOffers() {
  const grid = $('#offers-grid');
  const section = $('#offers-section');
  if (!grid || !section) return;
  const list = (noirDB().products || []).filter(p => !!p.offer);
  if (!list.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = list.map(productCardHTML).join('');
}

function noirRenderAll() {
  try {
    const db = noirDB();
    if (!db.products) return;
    if ($('#product-grid'))     renderProducts();
    if ($('#bestsellers-grid')) renderBestSellers();
    if ($('#bundles-grid'))     renderBundles();
    if ($('#offers-grid'))      renderOffers();
    renderHeroSlides();
  } catch (err) { console.error('[app.js] noirRenderAll failed:', err); }
}

/* ============================================================
   4. FILTERS
   ============================================================ */
onLayoutReady(function () {
  try {
    const search   = $('#product-search');
    const category = $('#category-filter');
    const sort     = $('#sort-filter');

    function applyFilters() {
      let list = (noirDB().products || []).slice();
      const q   = (search && search.value || '').toLowerCase().trim();
      const cat = (category && category.value) || 'all';
      const s   = (sort && sort.value) || 'featured';
      if (q) list = list.filter(p => (p.name + ' ' + p.category + ' ' + p.subtitle).toLowerCase().indexOf(q) !== -1);
      if (cat !== 'all') list = list.filter(p => p.category === cat);
      if (s === 'low')  list.sort((a, b) => computePrice(a) - computePrice(b));
      if (s === 'high') list.sort((a, b) => computePrice(b) - computePrice(a));
      renderProducts(list);
    }
    if (search)   search.addEventListener('input', applyFilters);
    if (category) category.addEventListener('change', applyFilters);
    if (sort)     sort.addEventListener('change', applyFilters);
  } catch (e) { console.error('[app.js] filters init failed:', e); }
});

/* ============================================================
   5. GLOBAL EVENTS
   ============================================================ */
window.addEventListener('noir:data-ready', function (e) {
  console.log('[app.js] noir:data-ready →', e.detail);
  noirRenderAll();
});
window.addEventListener('noir:language', function () { noirRenderAll(); });
window.addEventListener('noir:settings-ready', function (e) {
  try {
    const settings = e.detail;
    if (!settings) return;
    if (settings.language) {
      document.documentElement.lang = settings.language;
      document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
    }
    if (settings.projectName) {
      const first = settings.projectName.trim().split(/\s+/)[0];
      document.querySelectorAll('.brand span').forEach(el => { el.textContent = first; });
    }
    if (settings.projectAddress) {
      document.querySelectorAll('[data-project-address]').forEach(el => { el.textContent = settings.projectAddress; });
    }
  } catch (err) { console.error('[app.js] settings-ready handler failed:', err); }
});

if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
  const s = NOIR_DB.settings;
  if (s.language) {
    document.documentElement.lang = s.language;
    document.documentElement.dir = s.language === 'ar' ? 'rtl' : 'ltr';
  }
  if (s.projectName) {
    const first = s.projectName.trim().split(/\s+/)[0];
    document.querySelectorAll('.brand span').forEach(el => { el.textContent = first; });
  }
  if (s.projectAddress) {
    document.querySelectorAll('[data-project-address]').forEach(el => { el.textContent = s.projectAddress; });
  }
}

/* ============================================================
   6. NEWSLETTER
   ============================================================ */
onLayoutReady(function () {
  try {
    const form = $('#newsletter-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); showToast('Thanks for subscribing!'); form.reset();
    });
  } catch (e) { console.error('[app.js] newsletter init failed:', e); }
});

/* ============================================================
   7. NAVBAR BUTTONS
   ============================================================ */
onLayoutReady(function () {
  try {
    const searchToggle = $('#search-toggle');
    if (searchToggle) searchToggle.addEventListener('click', function () {
      const input = $('#product-search');
      if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      window.location.href = 'shop.html#shop';
    });

    const accountBtn = $('#account-button');
    if (accountBtn) accountBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      if (typeof window.noirGetSession === 'function') {
        try {
          const session = await window.noirGetSession();
          if (session) {
            window.location.href = session.role === 'admin' ? 'admin.html' : 'account.html';
            return;
          }
        } catch (err) { console.warn('[app.js] session check failed:', err); }
      }
      window.location.href = 'login.html';
    });

    const adminOpen = $('#admin-open');
    if (adminOpen) adminOpen.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = 'login.html?role=admin&next=admin.html';
    });
  } catch (e) { console.error('[app.js] navbar buttons init failed:', e); }
});

/* ============================================================
   8. Sign out
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  try {
    const btn = $('#signout-btn');
    if (btn) btn.addEventListener('click', async function (e) {
      e.preventDefault();
      if (typeof window.noirLogout === 'function') await window.noirLogout('login.html');
      else window.location.href = 'login.html';
    });
  } catch (e) { console.error('[app.js] signout init failed:', e); }
});

/* initial render when layout ready (in case data arrives before listener) */
onLayoutReady(renderHeroSlides);