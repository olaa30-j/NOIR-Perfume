/* ============================================================
   NOIR — admin dashboard (Supabase ONLY)
   ============================================================ */

let activePanel = 'overview';
let _adminSaving = false;

function adminEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function adminMoney(n) { return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2); }
function adminToast(msg) {
  if (typeof showToast === 'function') return showToast(msg);
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(adminToast._t);
  adminToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function adminPrice(p) { return typeof noirComputePrice === 'function' ? noirComputePrice(p) : p.price; }
function adminDB() {
  return typeof NOIR_DB !== 'undefined' && NOIR_DB ? NOIR_DB : {
    products: [], orders: [], bundles: [], customers: [], heroSlides: [],
    settings: { projectName: '', projectAddress: '', theme: 'midnight', language: 'en', radius: 6 },
  };
}

/* ============================================================
   SESSION
   ============================================================ */
async function adminCheckSession() {
  if (!window.db || !window.db.auth) return null;
  if (typeof noirGetSession !== 'function') return null;
  const session = await noirGetSession();
  if (!session) return null;
  if (session.role !== 'admin') return null;
  return session;
}

function adminUpdateTopbar(session) {
  const el = document.getElementById('admin-name');
  if (!el) return;
  if (!session) { el.innerHTML = 'Guest<br><small>Not signed in</small>'; return; }
  el.innerHTML = adminEsc(session.name || 'Admin') +
    '<br><small>' + adminEsc(session.email || '—') + ' · ' + adminEsc(session.role || 'admin') + '</small>';
}

async function adminSignOut() {
  if (typeof noirLogout === 'function') return await noirLogout('index.html');
  if (window.db && window.db.auth) { try { await window.db.auth.signOut(); } catch (e) {} }
  location.href = 'index.html';
}

/* ============================================================
   ROUTER
   ============================================================ */
function renderAdmin(panel) {
  if (!panel) panel = activePanel || 'overview';
  activePanel = panel;
  const titles = {
    overview: 'Overview', products: 'Products', orders: 'Orders',
    customers: 'Customers', bundles: 'Bundles', offers: 'Offers',
    hero: 'Main Section', settings: 'Settings',
  };
  const titleEl = document.getElementById('admin-title');
  if (titleEl) titleEl.textContent = titles[panel] || 'Overview';
  document.querySelectorAll('.admin-nav[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
  const content = document.getElementById('admin-content');
  if (!content) return;

  if (panel === 'overview') content.innerHTML = renderOverview();
  else if (panel === 'products') content.innerHTML = renderProductsAdmin();
  else if (panel === 'orders') content.innerHTML = renderOrdersAdmin();
  else if (panel === 'customers') content.innerHTML = renderCustomersAdmin();
  else if (panel === 'bundles') content.innerHTML = renderBundlesAdmin();
  else if (panel === 'offers') content.innerHTML = renderOffersAdmin();
  else if (panel === 'hero') content.innerHTML = renderHeroAdmin();
  else content.innerHTML = renderSettingsAdmin();

  bindAdminForms();
}

function bindAdminForms() {
  const pf = document.getElementById('admin-product-form');
  if (pf && !pf._bound) {
    pf._bound = true;
    pf.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); saveAdminProduct(pf); return false; });
  }
  const bf = document.getElementById('admin-bundle-form');
  if (bf && !bf._bound) {
    bf._bound = true;
    bf.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); saveBundle(bf); return false; });
  }
  const hf = document.getElementById('admin-hero-form');
  if (hf && !hf._bound) {
    hf._bound = true;
    hf.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); saveHeroSlide(hf); return false; });
  }
}

/* ============================================================
   OVERVIEW
   ============================================================ */
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
      <article class="stat-card"><div class="stat-card-top"><span>Total sales</span><span class="stat-icon">$</span></div><strong>${adminMoney(revenue)}</strong></article>
      <article class="stat-card"><div class="stat-card-top"><span>Orders</span><span class="stat-icon">▤</span></div><strong>${db.orders.length}</strong></article>
      <article class="stat-card"><div class="stat-card-top"><span>Best sellers</span><span class="stat-icon">⭐</span></div><strong>${bestSellers}</strong><span class="stat-change">${activeBundles} active bundles</span></article>
      <article class="stat-card"><div class="stat-card-top"><span>Products</span><span class="stat-icon">◇</span></div><strong>${db.products.length}</strong><span class="stat-change">${totalUnits} units in stock</span></article>
    </div>
    <section class="admin-panel"><div class="admin-page-heading"><div><h3 style="margin:0">Recent orders</h3><p>Latest customer activity</p></div><button class="text-link" data-admin-action="orders">View all orders →</button></div>${ordersTable(db.orders.slice(0, 5), false)}</section>`;
}

/* ============================================================
   PRODUCTS
   ============================================================ */
function renderProductsAdmin() {
  const db = adminDB();
  return `
    <div class="admin-page-heading"><div><h2>Product catalogue</h2><p>Create and maintain your fragrance collection.</p></div><button class="button button-gold" id="show-product-form" type="button">+ Add product</button></div>
    <section class="admin-panel hidden" id="product-form-panel"><h3 id="product-form-title">Add a new product</h3><form id="admin-product-form" class="admin-product-form" autocomplete="off">
      <input type="hidden" name="id">
      <input type="hidden" name="bottle" value="">
      <label>Product name<input name="name" required maxlength="60"></label>
      <label>Category<select name="category" required><option>Oud</option><option>Amber</option><option>Musk</option><option>Floral</option></select></label>
      <label>Price (USD)<input name="price" type="number" min="1" step=".01" required></label>
      <label>Stock quantity<input name="stock" type="number" min="0" step="1" required></label>
      <label class="span-two">Short notes<input name="subtitle" required maxlength="90"></label>
      <label class="span-two">Product description<textarea name="description" rows="3" required></textarea></label>
      <label class="span-two">Product image (optional)<input name="imageFile" type="file" accept="image/*"></label>
      <label class="span-two" style="display:flex;flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="bestSeller" style="width:auto"><span>⭐ Mark as Best Seller</span></label>
      <fieldset class="span-two" style="border:1px solid var(--line);padding:12px;border-radius:var(--radius)"><legend style="font-size:10px;color:var(--gold-light);padding:0 8px">Offer (optional)</legend><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px"><label>Offer type<select name="offerType"><option value="">No offer</option><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></label><label>Value<input name="offerValue" type="number" min="0" step="1"></label></div></fieldset>
      <div class="form-actions"><button type="button" class="button button-outline" id="cancel-product-form">Cancel</button><button type="submit" class="button button-gold">Save product</button></div>
    </form></section>
    <section class="admin-panel"><div class="admin-page-heading"><div><h3 style="margin:0">All products (${db.products.length})</h3><p>Inventory overview</p></div><input class="admin-search" id="admin-product-search" placeholder="Search products..."></div><div id="admin-products-table">${productsTable(db.products)}</div></section>`;
}

function productsTable(list) {
  if (!list.length) return `<div class="admin-empty">No products match your search.</div>`;
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>IMAGE</th><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th>BEST</th><th>OFFER</th><th>ACTIONS</th></tr></thead><tbody>${list.map(p => {
    const hasOffer = !!p.offer;
    const label = hasOffer ? (p.offer.label || `${p.offer.value}${p.offer.type === 'percent' ? '%' : '$'}`) : '—';
    const thumb = p.bottle
      ? `<img src="${adminEsc(p.bottle)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px">`
      : `<div style="width:40px;height:40px;border-radius:6px;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted)">—</div>`;
    return `<tr><td>${thumb}</td><td><strong>${adminEsc(p.name)}</strong><br><span style="color:var(--muted)">${adminEsc(p.subtitle)}</span></td><td>${adminEsc(p.category)}</td><td>${adminMoney(adminPrice(p))}${hasOffer ? ` <span style="color:var(--muted);text-decoration:line-through;font-size:9px">${adminMoney(p.price)}</span>` : ''}</td><td>${p.stock}</td><td>${p.bestSeller ? '⭐' : '—'}</td><td><span class="status-pill ${hasOffer ? 'pending' : ''}">${label}</span></td><td><button class="table-action" data-edit-product="${p.id}" type="button">Edit</button><button class="table-action danger" data-delete-product="${p.id}" type="button">Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

/* ============================================================
   ORDERS
   ============================================================ */
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

/* ============================================================
   CUSTOMERS
   ============================================================ */
function renderCustomersAdmin() {
  const db = adminDB();
  const customers = db.customers || [];
  return `<div class="admin-page-heading"><div><h2>Customer directory</h2><p>Customer records.</p></div></div><section class="admin-panel"><h3>Customers (${customers.length})</h3>${customers.map(c => {
    const avatar = c.avatarUrl ? `<img src="${adminEsc(c.avatarUrl)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:50%">` : `<span class="avatar">${(c.name || '?')[0]}</span>`;
    return `<div class="admin-customer-card">${avatar}<div style="flex:1"><strong>${adminEsc(c.name)}</strong><p>${adminEsc(c.email)}</p></div><div style="text-align:right"><strong>${c.orders} orders</strong><p>${adminMoney(c.spent)} spent</p></div></div>`;
  }).join('')}</section>`;
}

/* ============================================================
   BUNDLES
   ============================================================ */
function renderBundlesAdmin() {
  const db = adminDB();
  const list = db.bundles;
  return `<div class="admin-page-heading"><div><h2>Bundles</h2><p>Product bundles shown on the home page.</p></div><button class="button button-gold" id="show-bundle-form" type="button">+ Add bundle</button></div>
  <section class="admin-panel hidden" id="bundle-form-panel"><h3 id="bundle-form-title">Add a new bundle</h3><form id="admin-bundle-form" class="admin-product-form" autocomplete="off">
    <input type="hidden" name="id">
    <input type="hidden" name="bottle" value="">
    <label>Bundle name<input name="name" required maxlength="60"></label>
    <label>Price (USD)<input name="price" type="number" min="1" step=".01" required></label>
    <label class="span-two">Description<textarea name="description" rows="2" required></textarea></label>
    <label class="span-two">Badge (optional)<input name="badge" maxlength="20"></label>
    <label class="span-two">Bundle image (optional)<input name="imageFile" type="file" accept="image/*"></label>
    <label class="span-two">Products (Ctrl/Cmd-click to select multiple)<select name="productIds" multiple size="6" required>${db.products.map(p => `<option value="${p.id}">${adminEsc(p.name)} — ${adminMoney(p.price)}</option>`).join('')}</select></label>
    <label class="span-two" style="display:flex;flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="active" checked style="width:auto"><span>Show on home page</span></label>
    <div class="form-actions"><button type="button" class="button button-outline" id="cancel-bundle-form">Cancel</button><button type="submit" class="button button-gold">Save bundle</button></div>
  </form></section>
  <section class="admin-panel"><h3>All bundles (${list.length})</h3>${list.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>IMAGE</th><th>NAME</th><th>PRODUCTS</th><th>PRICE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${list.map(b => {
    const thumb = b.bottle
      ? `<img src="${adminEsc(b.bottle)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px">`
      : `<div style="width:40px;height:40px;border-radius:6px;background:var(--line);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted)">—</div>`;
    return `<tr><td>${thumb}</td><td><strong>${adminEsc(b.name)}</strong></td><td>${b.productIds.length} items</td><td>${adminMoney(b.price)}</td><td><span class="status-pill ${b.active ? '' : 'cancelled'}">${b.active ? 'Active' : 'Hidden'}</span></td><td><button class="table-action" data-edit-bundle="${b.id}" type="button">Edit</button><button class="table-action danger" data-delete-bundle="${b.id}" type="button">Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>` : '<div class="admin-empty">No bundles yet.</div>'}</section>`;
}

/* ============================================================
   HERO / MAIN SECTION
   ============================================================ */
function renderHeroAdmin() {
  const db = adminDB();
  const slides = db.heroSlides || [];
  return `
    <div class="admin-page-heading">
      <div><h2>Main section (Hero)</h2><p>Control the hero carousel — classic text slides or video background.</p></div>
      <button class="button button-gold" id="show-hero-form" type="button">+ Add slide</button>
    </div>

    <section class="admin-panel hidden" id="hero-form-panel">
      <h3 id="hero-form-title">Add a hero slide</h3>
      <form id="admin-hero-form" class="admin-product-form" autocomplete="off">
        <input type="hidden" name="id">
        <input type="hidden" name="bottleImage" value="">
        <input type="hidden" name="videoUrl" value="">
        <input type="hidden" name="videoPoster" value="">

        <label>Position<input name="position" type="number" min="1" step="1" required value="${slides.length + 1}"></label>
        <label>Theme
          <select name="theme" required>
            <option value="classic">Classic (text + bottle)</option>
            <option value="video">Video background</option>
          </select>
        </label>

        <label class="span-two">Eyebrow<input name="eyebrow" maxlength="60"></label>
        <label>Title line 1<input name="titleLine1" maxlength="60"></label>
        <label>Title line 2 (em)<input name="titleLine2" maxlength="60"></label>
        <label class="span-two">Description<textarea name="description" rows="3" maxlength="200"></textarea></label>
        <label>CTA text<input name="ctaText" maxlength="40"></label>
        <label>CTA link<input name="ctaLink" maxlength="120" placeholder="shop.html"></label>
        <label class="span-two">Note (optional)<input name="note" maxlength="80"></label>

        <label class="span-two">Bottle image (classic theme, optional)
          <input name="bottleFile" type="file" accept="image/*">
        </label>
        <label class="span-two">Art caption (classic)<input name="artCaption" maxlength="80"></label>

        <label class="span-two">Video file (video theme, optional)
          <input name="videoFile" type="file" accept="video/mp4,video/webm">
        </label>
        <label class="span-two">Video poster image (optional)
          <input name="posterFile" type="file" accept="image/*">
        </label>
        <label>Overlay opacity (%)<input name="overlayOpacity" type="number" min="0" max="100" value="45"></label>

        <label class="span-two" style="display:flex;flex-direction:row;align-items:center;gap:10px">
          <input type="checkbox" name="active" checked style="width:auto"><span>Active</span>
        </label>
        <div class="form-actions">
          <button type="button" class="button button-outline" id="cancel-hero-form">Cancel</button>
          <button type="submit" class="button button-gold">Save slide</button>
        </div>
      </form>
    </section>

    <section class="admin-panel">
      <h3>Slides (${slides.length})</h3>
      ${slides.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>POS</th><th>THEME</th><th>TITLE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${slides.map(s => `<tr><td>${s.position}</td><td>${adminEsc(s.theme)}</td><td><strong>${adminEsc(s.titleLine1)}</strong><br><span style="color:var(--muted)">${adminEsc(s.titleLine2)}</span></td><td><span class="status-pill ${s.active ? '' : 'cancelled'}">${s.active ? 'Active' : 'Hidden'}</span></td><td><button class="table-action" data-edit-hero="${s.id}" type="button">Edit</button><button class="table-action danger" data-delete-hero="${s.id}" type="button">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="admin-empty">No hero slides.</div>'}
    </section>`;
}

function showHeroForm(slide = null) {
  const panel = document.getElementById('hero-form-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const form = document.getElementById('admin-hero-form');
  form.reset();
  form.elements.id.value = slide?.id || '';
  form.elements.bottleImage.value = slide?.bottleImage || '';
  form.elements.videoUrl.value = slide?.videoUrl || '';
  form.elements.videoPoster.value = slide?.videoPoster || '';
  if (slide) {
    ['position','theme','eyebrow','titleLine1','titleLine2','description','ctaText','ctaLink','note','artCaption','overlayOpacity'].forEach(k => {
      if (form.elements[k]) form.elements[k].value = slide[k] ?? '';
    });
    form.elements.active.checked = slide.active !== false;
    document.getElementById('hero-form-title').textContent = 'Edit slide';
  } else {
    document.getElementById('hero-form-title').textContent = 'Add a hero slide';
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveHeroSlide(form) {
  _adminSaving = true;
  try {
    const data = new FormData(form);
    const rawId = data.get('id');
    const current = rawId ? (adminDB().heroSlides || []).find(s => s.id === Number(rawId)) : null;

    let bottleImage = current?.bottleImage || '';
    let videoUrl = current?.videoUrl || '';
    let videoPoster = current?.videoPoster || '';

    const bottleFile = form.elements.bottleFile?.files?.[0];
    if (bottleFile) {
      try { bottleImage = await noirUploadProductImage(bottleFile); }
      catch (e) { adminToast('❌ Bottle upload failed: ' + e.message); return; }
    }

    const videoFile = form.elements.videoFile?.files?.[0];
    if (videoFile) {
      try { videoUrl = await noirUploadHeroVideo(videoFile); }
      catch (e) { adminToast('❌ Video upload failed: ' + e.message); return; }
    }

    const posterFile = form.elements.posterFile?.files?.[0];
    if (posterFile) {
      try { videoPoster = await noirUploadHeroVideo(posterFile); }
      catch (e) { adminToast('❌ Poster upload failed: ' + e.message); return; }
    }

    const slide = {
      ...(current ? { id: current.id } : {}),
      position: Number(data.get('position')) || 1,
      theme: String(data.get('theme') || 'classic'),
      eyebrow: String(data.get('eyebrow') || '').trim(),
      titleLine1: String(data.get('titleLine1') || '').trim(),
      titleLine2: String(data.get('titleLine2') || '').trim(),
      description: String(data.get('description') || '').trim(),
      ctaText: String(data.get('ctaText') || '').trim(),
      ctaLink: String(data.get('ctaLink') || '').trim(),
      note: String(data.get('note') || '').trim(),
      artCaption: String(data.get('artCaption') || '').trim(),
      overlayOpacity: Number(data.get('overlayOpacity')) || 45,
      bottleImage, videoUrl, videoPoster,
      active: form.elements.active.checked,
    };

    if (typeof noirSaveHeroSlideToDB !== 'function') { adminToast('❌ Helper missing'); return; }
    await noirSaveHeroSlideToDB(slide);
    await noirRefreshStoreData();
    adminToast('✅ Hero slide saved');
    renderAdmin('hero');
  } catch (err) {
    adminToast('❌ Save failed: ' + (err?.message || 'Unknown'));
  } finally { _adminSaving = false; }
}

/* ============================================================
   OFFERS
   ============================================================ */
function renderOffersAdmin() {
  const withOffers = adminDB().products.filter(p => p.offer);
  return `<div class="admin-page-heading"><div><h2>Offers</h2><p>Products currently on sale.</p></div></div><section class="admin-panel"><h3>Active offers (${withOffers.length})</h3>${withOffers.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>PRODUCT</th><th>ORIGINAL</th><th>OFFER</th><th>NEW PRICE</th><th>ACTION</th></tr></thead><tbody>${withOffers.map(p => `<tr><td><strong>${adminEsc(p.name)}</strong></td><td>${adminMoney(p.price)}</td><td><span class="status-pill pending">${p.offer.label || p.offer.value}</span></td><td style="color:var(--gold-light);font-weight:600">${adminMoney(adminPrice(p))}</td><td><button class="table-action" data-edit-product="${p.id}" type="button">Edit</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="admin-empty">No active offers.</div>'}</section>`;
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettingsAdmin() {
  const s = adminDB().settings || {};
  const lang = s.language || 'en';
  const radius = s.radius ?? 6;
  const theme = s.theme || 'midnight';
  const dbReady = (typeof noirHasSupabase === 'function' && noirHasSupabase());
  const themes = ['midnight', 'aurora', 'emerald', 'crimson', 'ivory', 'custom'];

  return `<div class="admin-page-heading"><div><h2>Store settings</h2><p>Project identity, appearance, language and data.</p></div></div>

  <section class="admin-panel" id="admin-store-form">
    <h3>Project identity</h3>
    <div class="admin-product-form" style="grid-template-columns:1fr">
      <label>Project name<input id="settings-project-name" type="text" value="${adminEsc(s.projectName || '')}" maxlength="80"></label>
      <label>Project address<input id="settings-project-address" type="text" value="${adminEsc(s.projectAddress || '')}" maxlength="160"></label>
      <div class="form-actions"><button type="button" class="button button-gold" id="settings-save-identity">Save identity</button></div>
    </div>
  </section>

  <section class="admin-panel">
    <h3>Appearance</h3>
    <div class="admin-setting-row"><label>Language</label><select id="admin-lang-select" class="admin-search"><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option></select></div>
    <div class="admin-setting-row"><label>Default theme</label><select id="admin-theme-select" class="admin-search">${themes.map(t => `<option value="${t}" ${theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="admin-setting-row"><label>Corner radius — <span id="radius-value">${radius}px</span></label><input id="admin-radius-input" type="range" min="0" max="24" step="1" value="${radius}"></div>
  </section>

  <section class="admin-panel">
    <h3>Database</h3>
    <div class="settings-note"><strong style="color:var(--gold-light)">Status:</strong> ${dbReady ? '<span style="color:#8fd4a8">✅ Connected</span>' : '<span style="color:#e7a4a4">❌ Not connected</span>'}</div>
    <button class="button button-outline" id="admin-reload-data" style="margin-top:12px">Reload from database</button>
  </section>`;
}

async function saveSettingsField(patch) {
  if (!noirHasSupabase()) { adminToast('❌ Supabase not configured.'); return; }
  try {
    await noirSaveAppSettings(patch);
    adminToast('✅ Settings saved');
    if (patch.theme && window.noirTheme && window.noirTheme.applyFromDB) window.noirTheme.applyFromDB();
    if (patch.language && typeof noirSetLang === 'function') noirSetLang(patch.language);
  } catch (err) { adminToast('❌ Save failed: ' + (err.message || 'Unknown error')); }
}

/* ============================================================
   PRODUCT FORM
   ============================================================ */
function showProductForm(product = null) {
  const panel = document.getElementById('product-form-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const form = document.getElementById('admin-product-form');
  form.reset();
  form.elements.id.value = product?.id || '';
  form.elements.bottle.value = product?.bottle || '';
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
  _adminSaving = true;
  try {
    const data = new FormData(form);
    const rawId = data.get('id');
    const current = rawId ? adminDB().products.find(p => p.id === Number(rawId)) : null;

    const offerType = String(data.get('offerType') || '');
    const offerValue = Number(data.get('offerValue') || 0);
    let offer = null;
    if (offerType && offerValue > 0) {
      offer = { type: offerType, value: offerValue, label: offerType === 'percent' ? `-${offerValue}%` : `-$${offerValue}` };
    }

    let bottle = current?.bottle || '';
    const fileInput = form.elements.imageFile;
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (file) {
      if (typeof noirUploadProductImage !== 'function') { adminToast('❌ Upload helper missing'); return; }
      try { bottle = await noirUploadProductImage(file); }
      catch (err) { adminToast('❌ Image upload failed: ' + err.message); return; }
    }

    const product = {
      ...(current ? { id: current.id } : {}),
      name: String(data.get('name') || '').trim(),
      category: String(data.get('category') || ''),
      price: Number(data.get('price')),
      stock: Number(data.get('stock')),
      subtitle: String(data.get('subtitle') || '').trim(),
      description: String(data.get('description') || '').trim(),
      bottle,
      badge: current?.badge || '',
      bestSeller: data.get('bestSeller') === 'on',
      offer,
    };

    if (!product.name || !product.subtitle || !product.price) { adminToast('Please enter valid product details.'); return; }
    if (!noirHasSupabase()) { adminToast('❌ Supabase not configured.'); return; }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
    try {
      await noirSaveProductToDB(product);
      await noirRefreshStoreData();
      adminToast(current ? '✅ Product updated' : '✅ Product added');
      activePanel = 'products';
      renderAdmin('products');
    } catch (err) {
      adminToast('❌ Save failed: ' + (err?.message || 'Unknown error'));
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save product'; }
    }
  } finally { _adminSaving = false; }
}

/* ============================================================
   ORDER STATUS
   ============================================================ */
async function updateOrderStatus(id, status) {
  if (!noirHasSupabase()) { adminToast('❌ Supabase not configured.'); return; }
  try {
    await noirUpdateOrderStatusInDB(id, status);
    const order = NOIR_DB.orders.find(o => o.id === id);
    if (order) order.status = status;
    renderAdmin('orders');
    adminToast(`✅ Order ${id} marked ${status.toLowerCase()}.`);
  } catch (err) { adminToast('❌ Update failed: ' + (err.message || 'Unknown error')); }
}

/* ============================================================
   BUNDLE FORM
   ============================================================ */
function showBundleForm(bundle = null) {
  const panel = document.getElementById('bundle-form-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const form = document.getElementById('admin-bundle-form');
  form.reset();
  form.elements.id.value = bundle?.id || '';
  form.elements.bottle.value = bundle?.bottle || '';
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
  _adminSaving = true;
  try {
    const data = new FormData(form);
    const rawId = data.get('id');
    const current = rawId ? adminDB().bundles.find(b => b.id === Number(rawId)) : null;
    const productIds = Array.from(form.elements.productIds.selectedOptions).map(o => Number(o.value));
    if (!productIds.length) { adminToast('Select at least one product.'); return; }

    let bottle = current?.bottle || '';
    const fileInput = form.elements.imageFile;
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;
    if (file) {
      if (typeof noirUploadBundleImage !== 'function') { adminToast('❌ Upload helper missing'); return; }
      try { bottle = await noirUploadBundleImage(file); }
      catch (err) { adminToast('❌ Image upload failed: ' + err.message); return; }
    }

    const bundle = {
      ...(current ? { id: current.id } : {}),
      name: String(data.get('name') || '').trim(),
      description: String(data.get('description') || '').trim(),
      productIds,
      price: Number(data.get('price')),
      badge: String(data.get('badge') || '').trim(),
      bottle,
      active: form.elements.active.checked,
    };
    if (!bundle.name || !bundle.price) { adminToast('Please fill all bundle fields.'); return; }
    if (!noirHasSupabase()) { adminToast('❌ Supabase not configured.'); return; }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
    try {
      await noirSaveBundleToDB(bundle);
      await noirRefreshStoreData();
      adminToast(current ? '✅ Bundle updated' : '✅ Bundle added');
      activePanel = 'bundles';
      renderAdmin('bundles');
    } catch (err) { adminToast('❌ Save failed: ' + (err?.message || 'Unknown error')); }
    finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save bundle'; } }
  } finally { _adminSaving = false; }
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.admin-nav[data-panel]').forEach(b => b.addEventListener('click', () => renderAdmin(b.dataset.panel)));
  const back = document.getElementById('back-to-store');
  if (back) back.addEventListener('click', (e) => { e.preventDefault(); adminSignOut(); });

  const adminContent = document.getElementById('admin-content');
  if (!adminContent) return;

  adminContent.addEventListener('click', async function (event) {
    if (event.target.closest('#show-product-form')) { event.preventDefault(); showProductForm(); return; }
    if (event.target.closest('#cancel-product-form')) { document.getElementById('product-form-panel')?.classList.add('hidden'); return; }
    if (event.target.closest('#show-bundle-form')) { event.preventDefault(); showBundleForm(); return; }
    if (event.target.closest('#cancel-bundle-form')) { document.getElementById('bundle-form-panel')?.classList.add('hidden'); return; }
    if (event.target.closest('#show-hero-form')) { event.preventDefault(); showHeroForm(); return; }
    if (event.target.closest('#cancel-hero-form')) { document.getElementById('hero-form-panel')?.classList.add('hidden'); return; }

    if (event.target.id === 'settings-save-identity') {
      const name = (document.getElementById('settings-project-name')?.value || '').trim();
      const address = (document.getElementById('settings-project-address')?.value || '').trim();
      if (!name) { adminToast('Project name is required.'); return; }
      await saveSettingsField({ projectName: name, projectAddress: address });
      return;
    }

    const editProduct = event.target.closest('[data-edit-product]');
    if (editProduct) {
      const p = adminDB().products.find(x => x.id === Number(editProduct.dataset.editProduct));
      if (p) { if (activePanel !== 'products') { renderAdmin('products'); setTimeout(() => showProductForm(p), 50); } else showProductForm(p); }
      return;
    }

    const delProduct = event.target.closest('[data-delete-product]');
    if (delProduct && confirm('Delete this product?')) {
      try {
        await noirDeleteProductFromDB(Number(delProduct.dataset.deleteProduct));
        NOIR_DB.products = NOIR_DB.products.filter(p => p.id !== Number(delProduct.dataset.deleteProduct));
        adminToast('✅ Product deleted');
        renderAdmin('products');
      } catch (err) { adminToast('❌ Delete failed: ' + (err.message || 'Unknown error')); }
      return;
    }

    const editBundle = event.target.closest('[data-edit-bundle]');
    if (editBundle) {
      const b = adminDB().bundles.find(x => x.id === Number(editBundle.dataset.editBundle));
      if (b) showBundleForm(b);
      return;
    }

    const delBundle = event.target.closest('[data-delete-bundle]');
    if (delBundle && confirm('Delete this bundle?')) {
      try {
        await noirDeleteBundleFromDB(Number(delBundle.dataset.deleteBundle));
        NOIR_DB.bundles = NOIR_DB.bundles.filter(b => b.id !== Number(delBundle.dataset.deleteBundle));
        adminToast('✅ Bundle deleted');
        renderAdmin('bundles');
      } catch (err) { adminToast('❌ Delete failed: ' + (err.message || 'Unknown error')); }
      return;
    }

    const editHero = event.target.closest('[data-edit-hero]');
    if (editHero) {
      const s = (adminDB().heroSlides || []).find(x => x.id === Number(editHero.dataset.editHero));
      if (s) showHeroForm(s);
      return;
    }

    const delHero = event.target.closest('[data-delete-hero]');
    if (delHero && confirm('Delete this hero slide?')) {
      try {
        await noirDeleteHeroSlideFromDB(Number(delHero.dataset.deleteHero));
        await noirRefreshStoreData();
        adminToast('✅ Slide deleted');
        renderAdmin('hero');
      } catch (err) { adminToast('❌ Delete failed: ' + (err.message || 'Unknown error')); }
      return;
    }

    if (event.target.id === 'admin-reload-data') {
      adminToast('Reloading from database…');
      await noirRefreshStoreData();
      await noirLoadAppSettings();
      renderAdmin(activePanel);
      adminToast('✅ Reloaded');
      return;
    }

    const action = event.target.closest('[data-admin-action]');
    if (action) { event.preventDefault(); renderAdmin(action.dataset.adminAction); return; }
  });

  adminContent.addEventListener('input', function (event) {
    if (event.target.id === 'admin-product-search') {
      const q = event.target.value.toLowerCase();
      const list = adminDB().products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(q));
      document.getElementById('admin-products-table').innerHTML = productsTable(list);
    }
    if (event.target.id === 'order-search') {
      const q = event.target.value.toLowerCase();
      const list = adminDB().orders.filter(o => `${o.id} ${o.customer} ${o.email}`.toLowerCase().includes(q));
      document.getElementById('orders-table').innerHTML = ordersTable(list, true);
    }
    if (event.target.id === 'admin-radius-input') {
      const r = Number(event.target.value);
      document.getElementById('radius-value').textContent = r + 'px';
      if (window.noirApplyRadius) window.noirApplyRadius(r);
    }
  });

  adminContent.addEventListener('change', function (event) {
    if (event.target.matches('[data-order-status]')) return updateOrderStatus(event.target.dataset.orderStatus, event.target.value);
    if (event.target.id === 'admin-lang-select') return saveSettingsField({ language: event.target.value });
    if (event.target.id === 'admin-theme-select') return saveSettingsField({ theme: event.target.value });
    if (event.target.id === 'admin-radius-input') return saveSettingsField({ radius: Number(event.target.value) });
  });
});

window.addEventListener('noir:data-ready', function (e) {
  const dot = document.getElementById('db-status-dot');
  const label = document.getElementById('db-status-label');
  if (dot && label) {
    const source = e.detail && e.detail.source;
    if (source === 'supabase') { dot.style.background = '#4fae7a'; label.textContent = 'Connected to Supabase'; }
    else { dot.style.background = '#c89b55'; label.textContent = 'Local mode (offline)'; }
  }
  if (_adminSaving) return;
  if (typeof renderAdmin === 'function' && document.getElementById('admin-app')) renderAdmin(activePanel);
});

/* BOOT */
(function bootAdmin() {
  const run = async () => {
    const session = await adminCheckSession();
    adminUpdateTopbar(session);
    if (!session) { location.replace('login.html?role=admin&next=admin.html'); return; }
    if (typeof renderAdmin === 'function') renderAdmin(activePanel);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 50));
  else setTimeout(run, 50);
})();