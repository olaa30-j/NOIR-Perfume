/* ============================================================
   NOIR — products.js (shop grid)
   Delegates rendering to app.js. Adds filters if they exist.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  try {
    // If app.js already rendered, just ensure filters are bound
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
      if (s === 'low') list.sort((a,b) => noirComputePrice(a) - noirComputePrice(b));
      else if (s === 'high') list.sort((a,b) => noirComputePrice(b) - noirComputePrice(a));

      if (typeof renderProducts === 'function') renderProducts(list);
    }

    if (search) search.addEventListener('input', apply);
    if (category) category.addEventListener('change', apply);
    if (sort) sort.addEventListener('change', apply);

    // Initial render (app.js may have already done it)
    if (typeof renderProducts === 'function' && document.getElementById('product-grid')) {
      if (!document.getElementById('product-grid').children.length) apply();
    }
  } catch (e) {
    console.error('[products.js] init failed:', e);
  }
});

// Re-render on language change
window.addEventListener('noir:language', function () {
  if (typeof renderProducts === 'function' && document.getElementById('product-grid')) {
    renderProducts();
  }
});