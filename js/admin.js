/* ============================================================
   NOIR — admin dashboard (Supabase-aware)
   All writes go to Supabase first; localStorage acts as cache.
   ============================================================ */

/* ---------- STATE ---------- */
let activePanel = 'overview';

/* ---------- HELPERS ---------- */
function adminEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function adminMoney(n) {
  return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
}
function adminToast(msg) {
  if (typeof showToast === 'function') return showToast(msg);
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(adminToast._t);
  adminToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function adminPrice(p) {
  return typeof noirComputePrice === 'function' ? noirComputePrice(p) : p.price;
}
function adminDB() {
  return typeof NOIR_DB !== 'undefined' && NOIR_DB ? NOIR_DB : {
    products: [], orders: [], bundles: [], customers: [], settings: { language: 'en', radius: 6 },
  };
}

/* ---------- ROUTER ---------- */
function renderAdmin(panel) {
  if (!panel) panel = activePanel || 'overview';
  activePanel = panel;

  const titles = {
    overview: 'Overview', products: 'Products', orders: 'Orders',
    customers: 'Customers', bundles: 'Bundles', offers: 'Offers', settings: 'Settings',
  };
  const titleEl = document.getElementById('admin-title');
  if (titleEl) titleEl.textContent = titles[panel] || 'Overview';

  document.querySelectorAll('.admin-nav[data-panel]').forEach((b) =>
    b.classList.toggle('active', b.dataset.panel === panel)
  );

  const content = document.getElementById('admin-content');
  if (!content) return;

  if (panel === 'overview') content.innerHTML = renderOverview();
  else if (panel === 'products') content.innerHTML = renderProductsAdmin();
  else if (panel === 'orders') content.innerHTML = renderOrdersAdmin();
  else if (panel === 'customers') content.innerHTML = renderCustomersAdmin();
  else if (panel === 'bundles') content.innerHTML = renderBundlesAdmin();
  else if (panel === 'offers') content.innerHTML = renderOffersAdmin();
  else content.innerHTML = renderSettingsAdmin();
}

/* ---------- OVERVIEW ---------- */
function renderOverview() {
  const db = adminDB();
  const revenue = db.orders.filter(o => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);
  const totalUnits = db.products.reduce((s, p) => s + p.stock, 0);
  const bestSellers = db.products.filter(p => p.bestSeller).length;
  const activeBundles = db.bundles.filter(b => b.active).length;

  return `
    <div class="admin-page-heading">
      <div><h2>Welcome back, Admin</h2><p>Here is what's happening with your store today.</p></div>
      <button class="button button-outline" data-admin-action="products">Manage products ↗</button>
    </div>
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-card-top"><span>Total sales</span><span class="stat-icon">$</span></div><strong>${adminMoney(revenue)}</strong><span class="stat-change">↑ 12.5% <span style="color:var(--muted)">vs last period</span></span></article>
      <article class="stat-card"><div class="stat-card-top"><span>Orders</span><span class="stat-icon">▤</span></div><strong>${db.orders.length}</strong><span class="stat-change">↑ 8.3% <span style="color:var(--muted)">vs last period</span></span></article>
      <article class="stat-card"><div class="stat-card-top"><span>Best sellers</span><span class="stat-icon">⭐</span></div><strong>${bestSellers}</strong><span class="stat-change">${activeBundles} active bundles</span></article>
      <article class="stat-card"><div class="stat-card-top"><span>Products</span><span class="stat-icon">◇</span></div><strong>${db.products.length}</strong><span class="stat-change">${totalUnits} units in stock</span></article>
    </div>
    <div class="admin-two-col">
      <section class="admin-panel"><h3>Sales overview</h3><div class="bar-chart">${[42,65,50,76,61,87,72,95,69,82,100,88].map((h,i) => `<div class="bar-column"><div class="bar" style="height:${h}%;animation-delay:${i*45}ms"></div><span>${['J','F','M','A','M','J','J','A','S','O','N','D'][i]}</span></div>`).join('')}</div><p class="small-note">Illustrative monthly sales — mock data</p></section>
      <section class="admin-panel"><h3>Top fragrances</h3>${[...db.products].sort((a,b)=>b.price-a.price).slice(0,4).map(p => `<div class="top-product-row"><div class="mini-bottle">♧</div><div><strong>${adminEsc(p.name)}</strong><small>${adminEsc(p.category)} collection</small></div><b>${adminMoney(adminPrice(p))}</b></div>`).join('')}</section>
    </div>
    <section class="admin-panel"><div class="admin-page-heading"><div><h3 style="margin:0">Recent orders</h3><p>Latest customer activity</p></div><button class="text-link" data-admin-action="orders">View all orders →</button></div>${ordersTable(db.orders.slice(0, 5), false)}</section>`;
}

/* ---------- PRODUCTS ---------- */
function renderProductsAdmin() {
  const db = adminDB();
  return `
    <div class="admin-page-heading"><div><h2>Product catalogue</h2><p>Create and maintain your fragrance collection.</p></div><button class="button button-gold" id="show-product-form">+ Add product</button></div>
    <section class="admin-panel hidden" id="product-form-panel"><h3 id="product-form-title">Add a new product</h3><form id="admin-product-form" class="admin-product-form">
      <input type="hidden" name="id">
      <label>Product name<input name="name" required maxlength="60" placeholder="e.g. Desert Oud"></label>
      <label>Category<select name="category" required><option>Oud</option><option>Amber</option><option>Musk</option><option>Floral</option></select></label>
      <label>Price (USD)<input name="price" type="number" min="1" step=".01" required placeholder="129"></label>
      <label>Stock quantity<input name="stock" type="number" min="0" step="1" required placeholder="20"></label>
      <label class="span-two">Short notes<input name="subtitle" required maxlength="90" placeholder="Oud · Saffron · Woods"></label>
      <label class="span-two">Product description<textarea name="description" rows="3" required placeholder="Describe the fragrance..."></textarea></label>
      <label class="span-two" style="display:flex;flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="bestSeller" style="width:auto"><span>⭐ Mark as Best Seller</span></label>
      <fieldset class="span-two" style="border:1px solid var(--line);padding:12px;border-radius:var(--radius)"><legend style="font-size:10px;color:var(--gold-light);padding:0 8px">Offer (optional)</legend><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><label>Offer type<select name="offerType"><option value="">No offer</option><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></label><label>Value<input name="offerValue" type="number" min="0" step="1" placeholder="15"></label></div></fieldset>
      <div class="form-actions"><button type="button" class="button button-outline" id="cancel-product-form">Cancel</button><button type="submit" class="button button-gold">Save product</button></div>
    </form></section>
    <section class="admin-panel"><div class="admin-page-heading"><div><h3 style="margin:0">All products (${db.products.length})</h3><p>Inventory overview</p></div><input class="admin-search" id="admin-product-search" placeholder="Search products..."></div><div id="admin-products-table">${productsTable(db.products)}</div></section>`;
}

function productsTable(list) {
  if (!list.length) return `<div class="admin-empty">No products match your search.</div>`;
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th>BEST</th><th>OFFER</th><th>ACTIONS</th></tr></thead><tbody>${list.map(p => {
    const hasOffer = !!p.offer;
    const label = hasOffer ? (p.offer.label || `${p.offer.value}${p.offer.type === 'percent' ? '%' : '$'}`) : '—';
    return `<tr><td><strong>${adminEsc(p.name)}</strong><br><span style="color:var(--muted)">${adminEsc(p.subtitle)}</span></td><td>${adminEsc(p.category)}</td><td>${adminMoney(adminPrice(p))}${hasOffer ? ` <span style="color:var(--muted);text-decoration:line-through;font-size:9px">${adminMoney(p.price)}</span>` : ''}</td><td>${p.stock}</td><td>${p.bestSeller ? '⭐' : '—'}</td><td><span class="status-pill ${hasOffer ? 'pending' : ''}">${label}</span></td><td><button class="table-action" data-edit-product="${p.id}">Edit</button><button class="table-action danger" data-delete-product="${p.id}">Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

/* ---------- ORDERS ---------- */
function ordersTable(list, actions = true) {
  if (!list.length) return `<div class="admin-empty">No orders yet.</div>`;
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>ORDER ID</th><th>CUSTOMER</th><th>DATE</th><th>TOTAL</th><th>STATUS</th>${actions ? '<th>ACTION</th>' : ''}</tr></thead><tbody>${list.map(o => {
    const cls = o.status === 'Processing' ? 'pending' : o.status === 'Cancelled' ? 'cancelled' : '';
    return `<tr><td>${adminEsc(o.id)}</td><td>${adminEsc(o.customer)}</td><td>${adminEsc(o.date)}</td><td>${adminMoney(o.total)}</td><td><span class="status-pill ${cls}">${adminEsc(o.status)}</span></td>${actions ? `<td><select class="admin-search order-status-select" data-order-status="${o.id}">${['Processing','Shipped','Delivered','Cancelled'].map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderOrdersAdmin() {
  const db = adminDB();
  return `<div class="admin-page-heading"><div><h2>Order management</h2><p>Review orders and update fulfilment status.</p></div><span class="status-pill">${db.orders.length} total orders</span></div><section class="admin-panel"><div class="admin-page-heading"><h3 style="margin:0">All orders</h3><input class="admin-search" id="order-search" placeholder="Search order or customer..."></div><div id="orders-table">${ordersTable(db.orders, true)}</div></section>`;
}

/* ---------- CUSTOMERS ---------- */
function renderCustomersAdmin() {
  const db = adminDB();
  const customers = db.customers || [];
  return `<div class="admin-page-heading"><div><h2>Customer directory</h2><p>Sample customer records for your demo store.</p></div></div><section class="admin-panel"><h3>Customers (${customers.length})</h3>${customers.map(c => `<div class="admin-customer-card"><span class="avatar">${(c.name || '?')[0]}</span><div style="flex:1"><strong>${adminEsc(c.name)}</strong><p>${adminEsc(c.email)}</p></div><div style="text-align:right"><strong>${c.orders} orders</strong><p>${adminMoney(c.spent)} spent</p></div></div>`).join('')}<p class="small-note">Customer information is mock data and is not connected to real accounts.</p></section>`;
}

/* ---------- BUNDLES ---------- */
function renderBundlesAdmin() {
  const db = adminDB();
  const list = db.bundles;
  return `<div class="admin-page-heading"><div><h2>Bundles</h2><p>Product bundles shown on the home page.</p></div><button class="button button-gold" id="show-bundle-form">+ Add bundle</button></div>
  <section class="admin-panel hidden" id="bundle-form-panel"><h3 id="bundle-form-title">Add a new bundle</h3><form id="admin-bundle-form" class="admin-product-form">
    <input type="hidden" name="id">
    <label>Bundle name<input name="name" required maxlength="60"></label>
    <label>Price (USD)<input name="price" type="number" min="1" step=".01" required></label>
    <label class="span-two">Description<textarea name="description" rows="2" required></textarea></label>
    <label class="span-two">Badge (optional)<input name="badge" maxlength="20"></label>
    <label class="span-two">Products (Ctrl/Cmd-click to select multiple)<select name="productIds" multiple size="6" required>${db.products.map(p => `<option value="${p.id}">${adminEsc(p.name)} — ${adminMoney(p.price)}</option>`).join('')}</select></label>
    <label class="span-two" style="display:flex;flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="active" checked style="width:auto"><span>Show on home page</span></label>
    <div class="form-actions"><button type="button" class="button button-outline" id="cancel-bundle-form">Cancel</button><button type="submit" class="button button-gold">Save bundle</button></div>
  </form></section>
  <section class="admin-panel"><h3>All bundles (${list.length})</h3>${list.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>NAME</th><th>PRODUCTS</th><th>PRICE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${list.map(b => `<tr><td><strong>${adminEsc(b.name)}</strong></td><td>${b.productIds.length} items</td><td>${adminMoney(b.price)}</td><td><span class="status-pill ${b.active ? '' : 'cancelled'}">${b.active ? 'Active' : 'Hidden'}</span></td><td><button class="table-action" data-edit-bundle="${b.id}">Edit</button><button class="table-action danger" data-delete-bundle="${b.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="admin-empty">No bundles yet.</div>'}</section>`;
}

/* ---------- OFFERS ---------- */
function renderOffersAdmin() {
  const db = adminDB();
  const withOffers = db.products.filter(p => p.offer);
  return `<div class="admin-page-heading"><div><h2>Offers</h2><p>Products currently on sale.</p></div></div><section class="admin-panel"><h3>Active offers (${withOffers.length})</h3>${withOffers.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>PRODUCT</th><th>ORIGINAL</th><th>OFFER</th><th>NEW PRICE</th><th>ACTION</th></tr></thead><tbody>${withOffers.map(p => `<tr><td><strong>${adminEsc(p.name)}</strong></td><td>${adminMoney(p.price)}</td><td><span class="status-pill pending">${p.offer.label || p.offer.value}</span></td><td style="color:var(--gold-light);font-weight:600">${adminMoney(adminPrice(p))}</td><td><button class="table-action" data-edit-product="${p.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="admin-empty">No active offers.</div>'}</section>`;
}

/* ---------- SETTINGS ---------- */
function renderSettingsAdmin() {
  const db = adminDB();
  const lang = db.settings.language || 'en';
  const radius = db.settings.radius ?? 6;
  const dbReady = (typeof noirHasSupabase === 'function' && noirHasSupabase());
  return `<div class="admin-page-heading"><div><h2>Store settings</h2><p>Appearance, language and data.</p></div></div>
  <section class="admin-panel"><h3>Appearance</h3><div class="admin-setting-row"><label for="admin-lang-select">Language</label><select id="admin-lang-select" class="admin-search"><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option></select></div><div class="admin-setting-row"><label for="admin-radius-input">Corner radius — <span id="radius-value">${radius}px</span></label><input id="admin-radius-input" type="range" min="0" max="24" step="1" value="${radius}"></div></section>
  <section class="admin-panel"><h3>Database</h3><div class="settings-note"><strong style="color:var(--gold-light)">Status:</strong> ${dbReady ? '<span style="color:#8fd4a8">✅ Supabase configured</span>' : '<span style="color:#e5c58b">⚠ Local mode (no Supabase)</span>'}<br><br>${dbReady ? 'Data is stored in Supabase and cached in your browser.' : 'Supabase is not configured. Add your URL and key in <code>js/config.js</code>.'}</div><button class="button button-outline" id="admin-reload-data" style="margin-top:12px">Reload from database</button><button class="button button-outline" id="admin-reset-data" style="margin-top:12px;margin-left:8px">Reset local cache</button></section>
  <section class="admin-panel"><h3>About</h3><div class="settings-note"><strong style="color:var(--gold-light)">Authentication</strong><br>Admin: <code>admin@gmail.com</code> / <code>admin</code><br><br><strong style="color:var(--gold-light)">Production</strong><br>Add server-side validation and a payment provider before going live.</div></section>`;
}

/* ---------- PRODUCT FORM ---------- */
function showProductForm(product = null) {
  const panel = document.getElementById('product-form-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const form = document.getElementById('admin-product-form');
  form.reset();
  form.elements.id.value = product?.id || '';
  if (product) {
    for (const key of ['name','category','price','stock','subtitle','description']) form.elements[key].value = product[key] ?? '';
    form.elements.bestSeller.checked = !!product.bestSeller;
    form.elements.offerType.value = product.offer?.type || '';
    form.elements.offerValue.value = product.offer?.value || '';
    document.getElementById('product-form-title').textContent = 'Edit product';
  } else {
    document.getElementById('product-form-title').textContent = 'Add a new product';
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveAdminProduct(form) {
  const data = new FormData(form);
  const id = data.get('id');
  const db = adminDB();
  const current = id ? db.products.find(p => p.id === Number(id)) : null;

  const offerType = String(data.get('offerType') || '');
  const offerValue = Number(data.get('offerValue') || 0);
  let offer = null;
  if (offerType && offerValue > 0) {
    offer = { type: offerType, value: offerValue, label: offerType === 'percent' ? `-${offerValue}%` : `-$${offerValue}` };
  }

  const product = {
    id: current ? current.id : Math.max(0, ...db.products.map(p => p.id)) + 1,
    name: String(data.get('name')).trim(),
    category: String(data.get('category')),
    price: Number(data.get('price')),
    stock: Number(data.get('stock')),
    subtitle: String(data.get('subtitle')).trim(),
    description: String(data.get('description')).trim(),
    bottle: current?.bottle || '',
    badge: current?.badge || '',
    bestSeller: data.get('bestSeller') === 'on',
    offer,
  };

  if (!product.name || !product.subtitle || !product.price) { adminToast('Please enter valid product details.'); return; }

  if (current) {
    NOIR_DB.products = NOIR_DB.products.map(p => p.id === current.id ? product : p);
  } else {
    NOIR_DB.products.unshift(product);
  }
  if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);

  if (typeof noirSaveProductToDB === 'function') {
    const ok = await noirSaveProductToDB(product);
    if (ok) adminToast(current ? 'Product updated in database' : 'Product added to database');
    else if (typeof noirHasSupabase === 'function' && noirHasSupabase()) adminToast('Saved locally — Supabase sync failed');
    else adminToast(current ? 'Product updated' : 'Product added');
  } else {
    adminToast(current ? 'Product updated' : 'Product added');
  }

  renderAdmin('products');
  if (typeof renderProducts === 'function' && document.getElementById('product-grid')) renderProducts();
}

/* ---------- ORDER STATUS ---------- */
async function updateOrderStatus(id, status) {
  const db = adminDB();
  const order = db.orders.find(o => o.id === id);
  if (!order) return;
  order.status = status;
  if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);
  if (typeof noirUpdateOrderStatusInDB === 'function') await noirUpdateOrderStatusInDB(id, status);
  renderAdmin('orders');
  adminToast(`Order ${id} marked ${status.toLowerCase()}.`);
}

/* ---------- BUNDLE FORM ---------- */
function showBundleForm(bundle = null) {
  const panel = document.getElementById('bundle-form-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const form = document.getElementById('admin-bundle-form');
  form.reset();
  form.elements.id.value = bundle?.id || '';
  if (bundle) {
    form.elements.name.value = bundle.name;
    form.elements.price.value = bundle.price;
    form.elements.description.value = bundle.description;
    form.elements.badge.value = bundle.badge || '';
    Array.from(form.elements.productIds.options).forEach(o => { o.selected = bundle.productIds.includes(Number(o.value)); });
    form.elements.active.checked = bundle.active !== false;
    document.getElementById('bundle-form-title').textContent = 'Edit bundle';
  } else {
    document.getElementById('bundle-form-title').textContent = 'Add a new bundle';
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveBundle(form) {
  const data = new FormData(form);
  const id = data.get('id');
  const db = adminDB();
  const current = id ? db.bundles.find(b => b.id === Number(id)) : null;
  const productIds = Array.from(form.elements.productIds.selectedOptions).map(o => Number(o.value));
  if (!productIds.length) { adminToast('Select at least one product.'); return; }

  const bundle = {
    id: current ? current.id : Math.max(0, ...db.bundles.map(b => b.id)) + 1,
    name: String(data.get('name')).trim(),
    description: String(data.get('description')).trim(),
    productIds,
    price: Number(data.get('price')),
    badge: String(data.get('badge') || '').trim(),
    active: form.elements.active.checked,
  };
  if (!bundle.name || !bundle.price) { adminToast('Please fill all bundle fields.'); return; }

  if (current) {
    NOIR_DB.bundles = NOIR_DB.bundles.map(b => b.id === current.id ? bundle : b);
  } else {
    NOIR_DB.bundles.unshift(bundle);
  }
  if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);

  if (typeof noirSaveBundleToDB === 'function') {
    const ok = await noirSaveBundleToDB(bundle);
    if (ok) adminToast(current ? 'Bundle updated in database' : 'Bundle added to database');
    else if (typeof noirHasSupabase === 'function' && noirHasSupabase()) adminToast('Saved locally — Supabase sync failed');
    else adminToast(current ? 'Bundle updated' : 'Bundle added');
  } else {
    adminToast(current ? 'Bundle updated' : 'Bundle added');
  }

  renderAdmin('bundles');
  if (typeof renderBundles === 'function' && document.getElementById('bundles-grid')) renderBundles();
}

/* ---------- LISTENERS ---------- */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.admin-nav[data-panel]').forEach(b =>
    b.addEventListener('click', () => renderAdmin(b.dataset.panel))
  );

  const adminContent = document.getElementById('admin-content');
  if (!adminContent) return;

  adminContent.addEventListener('click', async function (event) {
    if (event.target.closest('#show-product-form')) showProductForm();
    if (event.target.closest('#cancel-product-form')) { const p = document.getElementById('product-form-panel'); if (p) p.classList.add('hidden'); }

    const editProduct = event.target.closest('[data-edit-product]');
    if (editProduct) {
      const db = adminDB();
      const p = db.products.find(x => x.id === Number(editProduct.dataset.editProduct));
      if (p) {
        if (activePanel !== 'products') { renderAdmin('products'); setTimeout(() => showProductForm(p), 50); }
        else showProductForm(p);
      }
    }

    const delProduct = event.target.closest('[data-delete-product]');
    if (delProduct && confirm('Delete this product?')) {
      const pid = Number(delProduct.dataset.deleteProduct);
      NOIR_DB.products = NOIR_DB.products.filter(p => p.id !== pid);
      if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);
      if (typeof noirDeleteProductFromDB === 'function') await noirDeleteProductFromDB(pid);
      renderAdmin('products');
    }

    if (event.target.closest('#show-bundle-form')) showBundleForm();
    if (event.target.closest('#cancel-bundle-form')) { const p = document.getElementById('bundle-form-panel'); if (p) p.classList.add('hidden'); }

    const editBundle = event.target.closest('[data-edit-bundle]');
    if (editBundle) {
      const db = adminDB();
      const b = db.bundles.find(x => x.id === Number(editBundle.dataset.editBundle));
      if (b) showBundleForm(b);
    }

    const delBundle = event.target.closest('[data-delete-bundle]');
    if (delBundle && confirm('Delete this bundle?')) {
      const bid = Number(delBundle.dataset.deleteBundle);
      NOIR_DB.bundles = NOIR_DB.bundles.filter(b => b.id !== bid);
      if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);
      if (typeof noirDeleteBundleFromDB === 'function') await noirDeleteBundleFromDB(bid);
      renderAdmin('bundles');
    }

    if (event.target.id === 'admin-reload-data') { if (typeof noirLoadFromSupabase === 'function') { adminToast('Reloading from database…'); await noirLoadFromSupabase(); renderAdmin(); } }
    if (event.target.id === 'admin-reset-data') { if (confirm('Reset local cache only? Supabase data is untouched.')) { if (typeof noirStoreReset === 'function') noirStoreReset(); location.reload(); } }
    const action = event.target.closest('[data-admin-action]');
    if (action) renderAdmin(action.dataset.adminAction);
  });

  adminContent.addEventListener('submit', function (event) {
    if (event.target.id === 'admin-product-form') { event.preventDefault(); saveAdminProduct(event.target); }
    if (event.target.id === 'admin-bundle-form') { event.preventDefault(); saveBundle(event.target); }
  });

  adminContent.addEventListener('input', function (event) {
    if (event.target.id === 'admin-product-search') {
      const q = event.target.value.toLowerCase();
      const db = adminDB();
      document.getElementById('admin-products-table').innerHTML = productsTable(db.products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(q)));
    }
    if (event.target.id === 'order-search') {
      const q = event.target.value.toLowerCase();
      const db = adminDB();
      document.getElementById('orders-table').innerHTML = ordersTable(db.orders.filter(o => `${o.id} ${o.customer} ${o.email}`.toLowerCase().includes(q)), true);
    }
  });

  adminContent.addEventListener('change', function (event) {
    if (event.target.matches('[data-order-status]')) updateOrderStatus(event.target.dataset.orderStatus, event.target.value);
    if (event.target.id === 'admin-lang-select') { if (typeof noirSetLang === 'function') noirSetLang(event.target.value); renderAdmin('settings'); }
    if (event.target.id === 'admin-radius-input') {
      const r = Number(event.target.value);
      NOIR_DB.settings.radius = r;
      if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);
      if (window.noirApplyRadius) window.noirApplyRadius(r);
      const v = document.getElementById('radius-value');
      if (v) v.textContent = r + 'px';
    }
  });
});

window.addEventListener('noir:data-ready', function () {
  if (typeof renderAdmin === 'function' && document.getElementById('admin-app')) renderAdmin();
});