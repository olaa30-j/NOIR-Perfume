import { onLayoutReady } from './components/index.js';

/* ============================================================
   NOIR — shared utilities + UI (storefront)
   Fully guarded: no uncaught errors ever.
   Auth is handled EXCLUSIVELY by auth.js (Supabase only).
   This file must NOT contain any auth logic, redirects, or demo code.
   ============================================================ */

/* ---------- SAFE HELPERS ---------- */
function $(sel, parent) {
  try { return (parent || document).querySelector(sel); }
  catch (e) { return null; }
}

function $$(sel, parent) {
  try { return Array.from((parent || document).querySelectorAll(sel)); }
  catch (e) { return []; }
}

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 2600);
}

/* Safe accessors */
function noirDB() {
  if (typeof window.NOIR_DB !== 'undefined' && window.NOIR_DB) return window.NOIR_DB;
  return { products: [], bundles: [], orders: [], customers: [], settings: { language: 'en', radius: 6 } };
}

window.addEventListener('noir:data-ready', function (e) {
  try {
    console.log('[app.js] noir:data-ready →', e.detail);
    if ($('#product-grid')) renderProducts();
    if ($('#bestsellers-grid')) renderBestSellers();
    if ($('#bundles-grid')) renderBundles();
  } catch (err) {
    console.error('[app.js] re-render after data-ready failed:', err);
  }
});

window.addEventListener('noir:settings-ready', function (e) {
  try {
    const settings = e.detail;
    if (settings?.language) {
      document.documentElement.lang = settings.language;
      document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
    }
  } catch (err) { /* ignore */ }
});

function t(key) {
  return typeof noirT === 'function' ? noirT(key) : key;
}
function computePrice(p) {
  return typeof noirComputePrice === 'function' ? noirComputePrice(p) : (p && p.price) || 0;
}
function getProductById(id) {
  return typeof noirGetProduct === 'function' ? noirGetProduct(id) : null;
}
function getBundleById(id) {
  return typeof noirGetBundle === 'function' ? noirGetBundle(id) : null;
}

/* ============================================================
   1. MOBILE MENU + LANGUAGE SWITCHER
   (جوه site-header → محتاج onLayoutReady)
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
  } catch (e) {
    console.error('[app.js] menu init failed:', e);
  }
});

/* ============================================================
   2. PRODUCT CARD
   ============================================================ */
function productCardHTML(p) {
  if (!p) return '';
  const price = computePrice(p);
  const hasOffer = !!p.offer;
  const isBest = !!p.bestSeller;

  return '<article class="product-card" data-product-id="' + p.id + '">' +
    '<div class="product-visual">' +
      (p.badge ? '<span class="product-badge">' + escapeHTML(p.badge) + '</span>' : '') +
      (hasOffer
        ? '<span class="product-badge offer" style="top:' + (p.badge ? '48px' : '12px') + '">' + escapeHTML(p.offer.label || 'Sale') + '</span>'
        : '') +
      (isBest && !hasOffer
        ? '<span class="product-badge best" style="top:' + (p.badge ? '48px' : '12px') + '">⭐</span>'
        : '') +
      '<div class="product-bottle ' + (p.bottle || '') + '"></div>' +
      '<div class="quick-view">' +
        '<button class="button button-outline" data-quick-view="' + p.id + '">' + t('product.quickView') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="product-info">' +
      '<p class="product-category">' + escapeHTML(p.category) + '</p>' +
      '<h3>' + escapeHTML(p.name) + '</h3>' +
      '<p class="product-subtitle">' + escapeHTML(p.subtitle) + '</p>' +
      '<div class="product-bottom">' +
        '<div>' +
          '<span class="product-price">' + money(price) + '</span>' +
          (hasOffer ? '<span class="product-price-old">' + money(p.price) + '</span>' : '') +
        '</div>' +
        '<button class="add-cart" data-add-to-cart="' + p.id + '" aria-label="' + t('product.addToCart') + '">+</button>' +
      '</div>' +
    '</div>' +
  '</article>';
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
  const list = (db.products || []).filter(function (p) { return p.bestSeller; });
  if (!list.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = list.map(productCardHTML).join('');
}

function bundleCardHTML(bundle) {
  if (!bundle) return '';
  const items = (bundle.productIds || []).map(getProductById).filter(Boolean);
  return '<article class="bundle-card">' +
    (bundle.badge ? '<span class="bundle-badge">' + escapeHTML(bundle.badge) + '</span>' : '') +
    '<h3 class="bundle-title">' + escapeHTML(bundle.name) + '</h3>' +
    '<p class="bundle-desc">' + escapeHTML(bundle.description || '') + '</p>' +
    '<div class="bundle-products">' +
      items.map(function (p) { return '<span>' + escapeHTML(p.name) + '</span>'; }).join('') +
    '</div>' +
    '<div class="bundle-foot">' +
      '<span class="bundle-price">' + money(bundle.price) + '</span>' +
      '<button class="button button-gold" data-add-bundle="' + bundle.id + '">Add bundle</button>' +
    '</div>' +
  '</article>';
}

function renderBundles() {
  const grid = $('#bundles-grid');
  const section = $('#bundles-section');
  if (!grid || !section) return;
  const db = noirDB();
  const active = (db.bundles || []).filter(function (b) { return b.active !== false; });
  if (!active.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = active.map(bundleCardHTML).join('');
}

/* ============================================================
   4. CLICK DELEGATION (add-to-cart, bundles, quick-view)
   (event delegation على document → مش محتاج onLayoutReady)
   ============================================================ */
document.addEventListener('click', function (e) {
  try {
    const addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      const id = Number(addBtn.dataset.addToCart);
      if (typeof addToCart === 'function') {
        addToCart(id, 1);
        showToast('Added to bag');
      }
      return;
    }

    const bundleBtn = e.target.closest('[data-add-bundle]');
    if (bundleBtn) {
      const id = Number(bundleBtn.dataset.addBundle);
      const bundle = getBundleById(id);
      if (bundle && typeof addToCart === 'function') {
        bundle.productIds.forEach(function (pid) { addToCart(pid, 1); });
        showToast('Added "' + bundle.name + '" to bag');
      }
      return;
    }

    const quickBtn = e.target.closest('[data-quick-view]');
    if (quickBtn && typeof openProductModal === 'function') {
      openProductModal(Number(quickBtn.dataset.quickView));
      return;
    }
  } catch (err) {
    console.error('[app.js] click handler failed:', err);
  }
});

/* ============================================================
   5. FILTERS + INITIAL RENDER
   (العناصر في index.html — onLayoutReady آمنة في كل الحالات)
   ============================================================ */
onLayoutReady(function () {
  try {
    const search = $('#product-search');
    const category = $('#category-filter');
    const sort = $('#sort-filter');

    function applyFilters() {
      const db = noirDB();
      let list = (db.products || []).slice();
      const q = (search && search.value || '').toLowerCase().trim();
      const cat = (category && category.value) || 'all';
      const s = (sort && sort.value) || 'featured';

      if (q) {
        list = list.filter(function (p) {
          return (p.name + ' ' + p.category + ' ' + p.subtitle).toLowerCase().indexOf(q) !== -1;
        });
      }
      if (cat !== 'all') {
        list = list.filter(function (p) { return p.category === cat; });
      }

      if (s === 'low') list.sort(function (a, b) { return computePrice(a) - computePrice(b); });
      else if (s === 'high') list.sort(function (a, b) { return computePrice(b) - computePrice(a); });

      renderProducts(list);
    }

    if (search) search.addEventListener('input', applyFilters);
    if (category) category.addEventListener('change', applyFilters);
    if (sort) sort.addEventListener('change', applyFilters);

    if ($('#product-grid')) renderProducts();
    if ($('#bestsellers-grid')) renderBestSellers();
    if ($('#bundles-grid')) renderBundles();
  } catch (e) {
    console.error('[app.js] filters init failed:', e);
  }
});

/* ============================================================
   6. LISTEN FOR LANGUAGE CHANGES
   (event على window → مش محتاج onLayoutReady)
   ============================================================ */
window.addEventListener('noir:language', function () {
  try {
    if ($('#product-grid')) renderProducts();
    if ($('#bestsellers-grid')) renderBestSellers();
    if ($('#bundles-grid')) renderBundles();
  } catch (e) {}
});

/* ============================================================
   7. NEWSLETTER (cosmetic)
   (العنصر في index.html — onLayoutReady آمنة)
   ============================================================ */
onLayoutReady(function () {
  try {
    const form = $('#newsletter-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        showToast('Thanks for subscribing!');
        form.reset();
      });
    }
  } catch (e) {
    console.error('[app.js] newsletter init failed:', e);
  }
});

/* ============================================================
   8. NAVBAR BUTTONS — Search + Account
   (search/account في site-header، admin في site-footer → onLayoutReady)
   (signout-btn في account.html → DOMContentLoaded)
   ============================================================ */

/* --- 8a. أزرار الـ layout (header/footer) --- */
onLayoutReady(function () {
  try {
    /* ---- Search button ---- */
    const searchToggle = $('#search-toggle');
    if (searchToggle) {
      searchToggle.addEventListener('click', function () {
        const searchInput = $('#product-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        window.location.href = 'shop.html#shop';
      });
    }

    /* ---- Account button ----
       auth.js already updates the header UI based on session.
       Here we only redirect based on session role. */
    const accountBtn = $('#account-button');
    if (accountBtn) {
      accountBtn.addEventListener('click', async function (e) {
        e.preventDefault();

        if (typeof window.noirGetSession === 'function') {
          try {
            const session = await window.noirGetSession();
            if (session) {
              window.location.href = session.role === 'admin' ? 'admin.html' : 'account.html';
              return;
            }
          } catch (err) {
            console.warn('[app.js] account button session check failed:', err);
          }
        }

        // Not signed in → go to login
        window.location.href = 'login.html';
      });
    }

    /* ---- Admin link in footer ---- */
    const adminOpen = $('#admin-open');
    if (adminOpen) {
      adminOpen.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = 'login.html?role=admin&next=admin.html';
      });
    }
  } catch (e) {
    console.error('[app.js] navbar buttons init failed:', e);
  }
});

/* --- 8b. Sign out button --- */
document.addEventListener('DOMContentLoaded', function () {
  try {
    const signoutBtn = $('#signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        if (typeof window.noirLogout === 'function') {
          await window.noirLogout('login.html');
        } else {
          window.location.href = 'login.html';
        }
      });
    }
  } catch (e) {
    console.error('[app.js] signout init failed:', e);
  }
});

/* ============================================================
   9. NOTE: admin.html guard is handled by admin.js (bootAdmin).
   Do NOT add any redirect logic here — it would cause loops.
   ============================================================ */