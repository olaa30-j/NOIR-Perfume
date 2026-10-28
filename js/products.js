/* ============================================================
   NOIR — products.js
   Delegates rendering to app.js.
   Ensures cart badge + order sync work.
   ============================================================ */

const PRODUCTS_DEBUG = true;
function pLog(...args) {
  if (PRODUCTS_DEBUG) console.log('%c[PRODUCTS]', 'color:#c89b55;font-weight:bold', ...args);
}

document.addEventListener('DOMContentLoaded', function () {
  try {
    const search = document.getElementById('product-search');
    const category = document.getElementById('category-filter');
    const sort = document.getElementById('sort-filter');

    function apply() {
      if (typeof NOIR_DB === 'undefined') return;
      const q = (search && search.value || '').toLowerCase().trim();
      const cat = (category && category.value) || 'all';
      const s = (sort && sort.value) || 'featured';

      let list = NOIR_DB.products.slice();
      if (q) list = list.filter(p => `${p.name} ${p.category} ${p.subtitle}`.toLowerCase().includes(q));
      if (cat !== 'all') list = list.filter(p => p.category === cat);
      if (s === 'low') list.sort((a, b) => noirComputePrice(a) - noirComputePrice(b));
      else if (s === 'high') list.sort((a, b) => noirComputePrice(b) - noirComputePrice(a));

      if (typeof renderProducts === 'function') renderProducts(list);
      pLog('Filters applied →', { q, cat, s, results: list.length });
    }

    if (search) search.addEventListener('input', apply);
    if (category) category.addEventListener('change', apply);
    if (sort) sort.addEventListener('change', apply);

    if (typeof renderProducts === 'function' && document.getElementById('product-grid')) {
      if (!document.getElementById('product-grid').children.length) apply();
    }
    pLog('products.js initialized');
  } catch (e) {
    console.error('[products.js] init failed:', e);
  }
});

window.addEventListener('noir:language', function () {
  if (typeof renderProducts === 'function' && document.getElementById('product-grid')) {
    renderProducts();
    pLog('Re-rendered on language change');
  }
});

/* ✅ بعد أي إضافة للسلة، أعد رندر الشبكة (لتحديث الـ badges)
   + أطلق noir:cart-updated (لو مش cart.js اللي عملها) */
window.addEventListener('noir:cart-updated', function () {
  pLog('cart updated — badge should refresh automatically via site-header');
});