/* ============================================================
   NOIR — Cart (Supabase ONLY, one row per user)
   Schema:
     carts { user_id uuid PK, items jsonb[], created_at, updated_at }
   Items: [{ type:'product'|'bundle', id:number, qty:number }, ...]
   - No localStorage
   - Guests: in-memory only
   - Logged-in: single Supabase row per user (created by DB trigger)
   - Emits 'noir:cart-updated' on every change
   - Exposes getCartCountFromDB() so UI can read the count from
     Supabase directly (authoritative), instead of memory.
   - Guests are blocked from adding to cart (products + bundles)
     and are redirected to login.html?next=…
   ============================================================ */

const NOIR_CART_DEBUG = /[?&]debug\b/.test(location.search);

function cartLog(...args) {
  if (NOIR_CART_DEBUG) console.log('%c[CART]', 'color:#4fae7a;font-weight:bold', ...args);
}
function cartWarn(...args) {
  if (NOIR_CART_DEBUG) console.warn('%c[CART]', 'color:#e0a800;font-weight:bold', ...args);
}
function cartErr(...args) {
  console.error('%c[CART]', 'color:#e05252;font-weight:bold', ...args);
}

/* ---------- HELPERS ---------- */
function cart$(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
function cartEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cartT(key, vars) { return typeof window.noirT === 'function' ? window.noirT(key, vars) : key; }
function cartLoc(o, f) { return typeof window.noirLocalize === 'function' ? window.noirLocalize(o, f) : (o && o[f]) || ''; }
function cartMoney(n) {
  return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
}
function cartGetProduct(id) {
  if (typeof window.noirGetProduct === 'function') return window.noirGetProduct(id);
  if (typeof window.NOIR_DB !== 'undefined' && window.NOIR_DB.products) {
    return window.NOIR_DB.products.find(p => p.id === Number(id));
  }
  return null;
}
function cartGetBundle(id) {
  if (typeof window.noirGetBundle === 'function') return window.noirGetBundle(id);
  if (typeof window.NOIR_DB !== 'undefined' && window.NOIR_DB.bundles) {
    return window.NOIR_DB.bundles.find(b => b.id === Number(id));
  }
  return null;
}
function cartComputePrice(p) {
  if (!p) return 0;
  if (typeof window.noirComputePrice === 'function') return window.noirComputePrice(p);
  return Number(p.price) || 0;
}

/* ---------- AUTH GATE ---------- */
/**
 * Resolve current session (normalized). Returns null for guests.
 * Cheap when noirGetSession() is available; falls back to db.auth.getUser().
 */
async function cartGetSession() {
  if (typeof window.noirGetSession === 'function') {
    try {
      const s = await window.noirGetSession();
      if (s && (s.userId || s.email)) return s;
    } catch (e) { /* ignore */ }
  }
  if (window.db && window.db.auth) {
    try {
      const { data } = await window.db.auth.getUser();
      const u = data && data.user;
      if (u) {
        return {
          userId: u.id,
          email: u.email || null,
          role: u.app_metadata?.role || u.user_metadata?.role || 'customer',
        };
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

function cartRequireLogin() {
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  window.location.href = 'login.html?next=' + next;
}

/* ---------- STATE ---------- */
let NOIR_CART = [];            // [{ type:'product'|'bundle', id, qty }]
let CURRENT_USER_ID = null;
let READY = false;

function emitCartUpdate() {
  try {
    window.dispatchEvent(new CustomEvent('noir:cart-updated', {
      detail: { items: getCartItems(), count: cartCount(), subtotal: cartSubtotal() },
    }));
  } catch (e) { cartWarn('emit failed:', e); }
}

/* ---------- SUPABASE ---------- */
function hasSB() {
  return window.db && typeof window.db.from === 'function';
}

/** noirGetSession() returns { userId, email, role, name } */
async function sbGetUser() {
  try {
    if (typeof window.noirGetSession === 'function') {
      const s = await window.noirGetSession();
      if (s && s.userId) return { id: s.userId, email: s.email || null };
      if (s && s.email)  return { id: null,    email: s.email };
    }
    if (window.db && window.db.auth) {
      const { data } = await window.db.auth.getUser();
      if (data && data.user) return { id: data.user.id, email: data.user.email };
    }
  } catch (e) { /* ignore */ }
  return { id: null, email: null };
}

/** Load items array from the single carts row. */
async function sbLoad(userId) {
  if (!hasSB() || !userId) return [];
  const { data, error } = await window.db
    .from('carts')
    .select('items')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) { cartErr('sbLoad failed:', error); return []; }
  const raw = data && Array.isArray(data.items) ? data.items : [];
  return raw
    .filter(it => it && (it.type === 'product' || it.type === 'bundle') && Number.isFinite(Number(it.id)))
    .map(it => ({ type: it.type, id: Number(it.id), qty: Math.max(1, Number(it.qty) || 1) }));
}

/**
 * Save items. Uses update-first (row exists via DB trigger),
 * insert fallback only for edge cases.
 */
async function sbSave(userId, items) {
  if (!hasSB() || !userId) return;

  const clean = (items || [])
    .filter(it => it && (it.type === 'product' || it.type === 'bundle') && Number.isFinite(Number(it.id)))
    .map(it => ({ type: it.type, id: Number(it.id), qty: Math.max(1, Number(it.qty) || 1) }));

  // 1) update — expected path (trigger created the row)
  const upd = await window.db
    .from('carts')
    .update({ items: clean, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();

  if (upd.error) { cartErr('sbSave update failed:', upd.error); return; }
  if (upd.data) return;

  // 2) insert fallback
  cartWarn('sbSave: row missing, inserting (trigger may have missed this user)');
  const ins = await window.db
    .from('carts')
    .insert({ user_id: userId, items: clean })
    .select('user_id')
    .maybeSingle();
  if (ins.error) cartErr('sbSave insert failed:', ins.error);
}

/** Clear contents but keep the row (trigger owns lifecycle). */
async function sbClear(userId) {
  if (!hasSB() || !userId) return;
  const { error } = await window.db
    .from('carts')
    .update({ items: [], updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) cartErr('sbClear failed:', error);
}

/**
 * Authoritative cart count — read directly from Supabase.
 * Returns 0 for guests or if Supabase is not available.
 * Safe: never throws.
 */
async function getCartCountFromDB() {
  if (!hasSB()) return 0;

  const user = await sbGetUser();
  if (!user.id) return 0;

  try {
    const { data, error } = await window.db
      .from('carts')
      .select('items')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) { cartWarn('getCartCountFromDB failed:', error); return 0; }

    const items = data && Array.isArray(data.items) ? data.items : [];
    return items.reduce(
      (sum, it) => sum + Math.max(1, Number(it.qty) || 1),
      0
    );
  } catch (e) {
    cartWarn('getCartCountFromDB exception:', e);
    return 0;
  }
}

/* ---------- SYNC ---------- */
async function syncForUser() {
  const user = await sbGetUser();
  CURRENT_USER_ID = user.id;
  cartLog('syncForUser: userId =', user.id);

  if (user.id && hasSB()) {
    const remote = await sbLoad(user.id);

    if (NOIR_CART.length) {
      // merge guest items into user's cart
      const merged = mergeItems(remote, NOIR_CART);
      NOIR_CART = merged;
      await sbSave(user.id, NOIR_CART);
      cartLog('merged guest cart → items:', NOIR_CART.length);
    } else {
      NOIR_CART = remote;
      cartLog('loaded cart → items:', NOIR_CART.length);
    }
  } else {
    cartLog('guest mode — in-memory only');
  }
  emitCartUpdate();
  READY = true;
}

function mergeItems(base, add) {
  const out = base.map(it => ({ ...it }));
  for (const it of add) {
    const found = out.find(x => x.type === it.type && x.id === it.id);
    if (found) found.qty += it.qty;
    else out.push({ ...it });
  }
  return out;
}

/** Persist full state. */
async function persist() {
  if (CURRENT_USER_ID) await sbSave(CURRENT_USER_ID, NOIR_CART);
}

/* ---------- CORE: ADD PRODUCT ---------- */
async function addProductToCart(productId, qty) {
  if (!(await cartGetSession())) { cartRequireLogin(); return; }

  const id = Number(productId);
  const quantity = Math.max(1, Number(qty) || 1);
  const product = cartGetProduct(id);
  if (!product) { cartWarn('addProductToCart: not found:', id); return; }
  const inBag = (NOIR_CART.find(it => it.type === 'product' && it.id === id) || {}).qty || 0;
  if (Number.isFinite(product.stock) && inBag + quantity > product.stock) {
    if (typeof showToast === 'function') showToast(cartT(product.stock > 0 ? 'err.stock' : 'product.outOfStock', { name: cartLoc(product, 'name') }));
    return;
  }

  const existing = NOIR_CART.find(it => it.type === 'product' && it.id === id);
  if (existing) existing.qty += quantity;
  else NOIR_CART.push({ type: 'product', id, qty: quantity });

  emitCartUpdate();
  cartLog('Added product:', product.name, '| lines:', NOIR_CART.length);
  if (typeof showToast === 'function') showToast(cartT('cart.added', { name: cartLoc(product, 'name') }));

  await persist();
}

/* ---------- CORE: ADD BUNDLE ---------- */
async function addBundleToCart(bundleId, qty) {
  if (!(await cartGetSession())) { cartRequireLogin(); return; }

  const id = Number(bundleId);
  const quantity = Math.max(1, Number(qty) || 1);
  const bundle = cartGetBundle(id);
  if (!bundle) { cartWarn('addBundleToCart: not found:', id); return; }

  const existing = NOIR_CART.find(it => it.type === 'bundle' && it.id === id);
  if (existing) existing.qty += quantity;
  else NOIR_CART.push({ type: 'bundle', id, qty: quantity });

  emitCartUpdate();
  cartLog('Added bundle:', bundle.name, '| lines:', NOIR_CART.length);
  if (typeof showToast === 'function') showToast(cartT('cart.added', { name: cartLoc(bundle, 'name') }));

  await persist();
}

/* ---------- CORE: REMOVE ---------- */
async function removeLine(type, id) {
  NOIR_CART = NOIR_CART.filter(it => !(it.type === String(type) && it.id === Number(id)));
  emitCartUpdate();
  await persist();
}

/* ---------- CORE: QTY ---------- */
async function updateLineQty(type, id, delta) {
  const t = String(type);
  const n = Number(id);
  const line = NOIR_CART.find(it => it.type === t && it.id === n);
  if (!line) return;

  const d = Number(delta) || 0;
  if (d > 0 && t === 'product') {
    const p = cartGetProduct(n);
    if (p && Number.isFinite(p.stock) && line.qty + d > p.stock) {
      if (typeof showToast === 'function') showToast(cartT('err.stock', { name: cartLoc(p, 'name') }));
      return;
    }
  }
  line.qty += d;
  if (line.qty <= 0) {
    NOIR_CART = NOIR_CART.filter(it => !(it.type === t && it.id === n));
  }
  emitCartUpdate();
  await persist();
}

async function setLineQty(type, id, qty) {
  const t = String(type);
  const n = Number(id);
  const q = Math.max(1, Number(qty) || 1);
  const line = NOIR_CART.find(it => it.type === t && it.id === n);
  if (!line) return;
  line.qty = q;
  emitCartUpdate();
  await persist();
}

async function clearCart() {
  NOIR_CART = [];
  emitCartUpdate();
  if (CURRENT_USER_ID) await sbClear(CURRENT_USER_ID);
}

/* ---------- TOTALS ---------- */
function cartSubtotal() {
  return NOIR_CART.reduce((sum, line) => {
    if (line.type === 'product') {
      const p = cartGetProduct(line.id);
      return p ? sum + cartComputePrice(p) * line.qty : sum;
    }
    if (line.type === 'bundle') {
      const b = cartGetBundle(line.id);
      return b ? sum + (Number(b.price) || 0) * line.qty : sum;
    }
    return sum;
  }, 0);
}

/** Shipping rule (estimate shown in the UI — the database recomputes it on checkout). */
function cartShipping(subtotal) {
  const s = (window.NOIR_DB && window.NOIR_DB.settings) || {};
  const flat = s.shippingFlat != null ? Number(s.shippingFlat) : 8;
  const free = s.freeShippingOver != null ? Number(s.freeShippingOver) : 99;
  if (!subtotal) return { fee: 0, freeOver: free, freeLeft: free };
  const fee = subtotal >= free ? 0 : flat;
  return { fee, freeOver: free, freeLeft: Math.max(0, free - subtotal) };
}
function cartTotals() {
  const subtotal = cartSubtotal();
  const sh = cartShipping(subtotal);
  return { subtotal, shipping: sh.fee, total: subtotal + sh.fee, freeOver: sh.freeOver, freeLeft: sh.freeLeft, count: cartCount() };
}

function cartCount() {
  return NOIR_CART.reduce((sum, line) => sum + line.qty, 0);
}

/* ---------- GET ITEMS ---------- */
function getCartItems() {
  return NOIR_CART
    .map(line => {
      if (line.type === 'product') {
        const product = cartGetProduct(line.id);
        return product ? { type: 'product', id: line.id, qty: line.qty, product } : null;
      }
      if (line.type === 'bundle') {
        const bundle = cartGetBundle(line.id);
        return bundle ? { type: 'bundle', id: line.id, qty: line.qty, bundle } : null;
      }
      return null;
    })
    .filter(Boolean);
}

/* ---------- DRAWER ---------- */
function openCartDrawer() {
  const siteCart = document.querySelector('site-cart');
  if (siteCart && typeof siteCart.open === 'function') { siteCart.open(); return; }
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
  if (backdrop) backdrop.classList.remove('hidden');
  document.body.classList.add('lock-scroll');
}
function closeCartDrawer() {
  const siteCart = document.querySelector('site-cart');
  if (siteCart && typeof siteCart.close === 'function') { siteCart.close(); return; }
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
  if (backdrop) backdrop.classList.add('hidden');
  document.body.classList.remove('lock-scroll');
}

/* ---------- PRODUCT MODAL ---------- */
function openProductModal(productId) {
  const id = Number(productId);
  const p = cartGetProduct(id);
  if (!p) { cartWarn('openProductModal: not found', id); return; }

  const modal = cart$('#product-modal');
  const detail = cart$('#product-detail');
  if (!modal || !detail) return;

  const price = cartComputePrice(p);
  const hasOffer = !!p.offer;
  const out = Number.isFinite(p.stock) && p.stock <= 0;
  const visual = /^(https?:\/\/|\/)/.test(p.bottle || '')
    ? '<img class="product-image" src="' + cartEsc(p.bottle) + '" alt="' + cartEsc(cartLoc(p, 'name')) + '">'
    : '<div class="product-bottle ' + cartEsc(p.bottle || '') + '"></div>';
  const cat = typeof window.noirCategory === 'function' ? window.noirCategory(p.category) : p.category;

  detail.innerHTML = '<div class="product-detail-layout">' +
    '<div class="detail-visual">' + visual + '</div>' +
    '<div class="detail-copy">' +
      '<p class="product-category">' + cartEsc(cat) + '</p>' +
      '<h2>' + cartEsc(cartLoc(p, 'name')) + '</h2>' +
      '<p class="product-subtitle">' + cartEsc(cartLoc(p, 'subtitle')) + '</p>' +
      '<p>' + cartEsc(cartLoc(p, 'description')) + '</p>' +
      '<div class="detail-price">' + cartMoney(price) +
        (hasOffer ? ' <span style="color:var(--muted);text-decoration:line-through;font-size:13px">' + cartMoney(p.price) + '</span>' : '') +
      '</div>' +
      '<button class="button button-gold button-full" data-add-to-cart="' + p.id + '"' + (out ? ' disabled' : '') + '>' +
        cartT(out ? 'product.outOfStock' : 'product.addToCart') + '</button>' +
    '</div>' +
  '</div>';

  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}

/* ============================================================
   CUSTOMER SYNC (after checkout)
   Note: customers.cart_id no longer exists — we use user_id only.
   ============================================================ */
async function syncCustomerAfterOrder(order) {
  if (!CURRENT_USER_ID || !hasSB()) return;

  try {
    const user = await sbGetUser();

    const { data: existing, error: getErr } = await window.db
      .from('customers')
      .select('*')
      .eq('user_id', CURRENT_USER_ID)
      .maybeSingle();

    if (getErr) cartWarn('customer get failed:', getErr);

    const prevOrders = Array.isArray(existing?.orders) ? existing.orders : [];
    const prevSpent = Number(existing?.spent) || 0;

    const row = {
      user_id: CURRENT_USER_ID,
      name: order.customer,
      email: order.email || user.email,
      orders: [...prevOrders, order.id],
      spent: prevSpent + Number(order.total || 0),
    };

    if (existing) {
      const { error } = await window.db
        .from('customers')
        .update(row)
        .eq('user_id', CURRENT_USER_ID);
      if (error) throw error;
      cartLog('Customer updated ✓ (orders:', row.orders.length, ')');
    } else {
      const { error } = await window.db.from('customers').insert(row);
      if (error) throw error;
      cartLog('Customer created ✓');
    }
  } catch (e) {
    cartWarn('syncCustomerAfterOrder failed:', e);
  }
}

/* ============================================================
   EXPOSE API
   ============================================================ */
window.addToCart           = addProductToCart;   // product alias
window.addProductToCart    = addProductToCart;
window.addBundleToCart     = addBundleToCart;
window.removeLine          = removeLine;
window.updateLineQty       = updateLineQty;
window.setLineQty          = setLineQty;
window.clearCart           = clearCart;
window.getCartItems        = getCartItems;
window.getCartCount        = cartCount;
window.getCartCountFromDB  = getCartCountFromDB;   // ← authoritative count
window.getCartSubtotal     = cartSubtotal;
window.cartSubtotal        = cartSubtotal;
window.cartCount           = cartCount;
window.openCartDrawer      = openCartDrawer;
window.closeCartDrawer     = closeCartDrawer;
window.openProductModal    = openProductModal;
window.cartTotals          = cartTotals;
window.cartShipping        = cartShipping;
window.noirSyncCustomerAfterOrder = syncCustomerAfterOrder;
window.noirGetCartUserId   = function () { return CURRENT_USER_ID; };

Object.defineProperty(window, 'noirCart', {
  get() { return { items: getCartItems() }; },
  configurable: true,
});

/* ============================================================
   DELEGATED CLICKS
   data-cart-minus / data-cart-plus / data-cart-remove
   accept either "product:12" / "bundle:3" or bare "12" (product).

   `data-add-to-cart` and `data-add-bundle` are gated behind login
   below. app.js also has a gate, but this is the safety net so the
   rule holds even if cart.js is loaded without app.js (admin pages,
   standalone product pages, etc.).
   ============================================================ */
function parseLineKey(key) {
  const s = String(key || '');
  if (s.indexOf(':') === -1) return { type: 'product', id: Number(s) };
  const [type, id] = s.split(':');
  return { type: type === 'bundle' ? 'bundle' : 'product', id: Number(id) };
}

document.addEventListener('click', async function (e) {
  try {
    const addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      if (addBtn.disabled) return;
      e.preventDefault();
      if (!(await cartGetSession())) { cartRequireLogin(); return; }
      await addProductToCart(Number(addBtn.dataset.addToCart), 1);
      return;
    }

    const bundleBtn = e.target.closest('[data-add-bundle]');
    if (bundleBtn) {
      if (bundleBtn.disabled) return;
      e.preventDefault();
      if (!(await cartGetSession())) { cartRequireLogin(); return; }
      await addBundleToCart(Number(bundleBtn.dataset.addBundle), 1);
      return;
    }

    const quickBtn = e.target.closest('[data-quick-view]');
    if (quickBtn) { openProductModal(Number(quickBtn.dataset.quickView)); return; }

    if (e.target.closest('#cart-open') || e.target.closest('.cart-trigger')) {
      e.preventDefault(); openCartDrawer(); return;
    }
    if (e.target.closest('#cart-close')) { e.preventDefault(); closeCartDrawer(); return; }
    if (e.target.closest('#drawer-backdrop')) { closeCartDrawer(); return; }

    const minus = e.target.closest('[data-cart-minus]');
    if (minus) { const k = parseLineKey(minus.dataset.cartMinus); await updateLineQty(k.type, k.id, -1); return; }

    const plus = e.target.closest('[data-cart-plus]');
    if (plus) { const k = parseLineKey(plus.dataset.cartPlus); await updateLineQty(k.type, k.id, +1); return; }

    const rem = e.target.closest('[data-cart-remove]');
    if (rem) { const k = parseLineKey(rem.dataset.cartRemove); await removeLine(k.type, k.id); return; }

  } catch (err) { cartErr('click failed:', err); }
});

/* Checkout (details → payment → review → confirmation) lives in js/checkout.js */

/* ============================================================
   INIT
   ============================================================ */
async function initCart() {
  emitCartUpdate();
  try { await syncForUser(); } catch (e) { cartWarn('sync failed:', e); }

  window.addEventListener('noir:data-ready', () => emitCartUpdate());

  if (window.db && window.db.auth && window.db.auth.onAuthStateChange) {
    window.db.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        await syncForUser();
      }
    });
  }
  window.addEventListener('noir:auth-changed', () => syncForUser());

  cartLog('cart.js initialized (one-row-per-user, items jsonb, backend count ready, login-gated add)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCart);
} else {
  initCart();
}

window.addEventListener('noir:language', function () {
  const m = document.getElementById('product-modal');
  const add = m && m.open && m.querySelector('[data-add-to-cart]');
  if (add) openProductModal(Number(add.dataset.addToCart));
});