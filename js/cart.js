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
   ============================================================ */

const NOIR_CART_DEBUG = true;

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
  const id = Number(productId);
  const quantity = Math.max(1, Number(qty) || 1);
  const product = cartGetProduct(id);
  if (!product) { cartWarn('addProductToCart: not found:', id); return; }

  const existing = NOIR_CART.find(it => it.type === 'product' && it.id === id);
  if (existing) existing.qty += quantity;
  else NOIR_CART.push({ type: 'product', id, qty: quantity });

  emitCartUpdate();
  cartLog('Added product:', product.name, '| lines:', NOIR_CART.length);
  if (typeof showToast === 'function') showToast(product.name + ' added to bag');

  await persist();
}

/* ---------- CORE: ADD BUNDLE ---------- */
async function addBundleToCart(bundleId, qty) {
  const id = Number(bundleId);
  const quantity = Math.max(1, Number(qty) || 1);
  const bundle = cartGetBundle(id);
  if (!bundle) { cartWarn('addBundleToCart: not found:', id); return; }

  const existing = NOIR_CART.find(it => it.type === 'bundle' && it.id === id);
  if (existing) existing.qty += quantity;
  else NOIR_CART.push({ type: 'bundle', id, qty: quantity });

  emitCartUpdate();
  cartLog('Added bundle:', bundle.name, '| lines:', NOIR_CART.length);
  if (typeof showToast === 'function') showToast(bundle.name + ' added to bag');

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

  line.qty += Number(delta) || 0;
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

  detail.innerHTML = '<div class="product-detail-layout">' +
    '<div class="detail-visual"><div class="product-bottle ' + (p.bottle || '') + '"></div></div>' +
    '<div class="detail-copy">' +
      '<p class="product-category">' + cartEsc(p.category) + '</p>' +
      '<h2>' + cartEsc(p.name) + '</h2>' +
      '<p class="product-subtitle">' + cartEsc(p.subtitle) + '</p>' +
      '<p>' + cartEsc(p.description) + '</p>' +
      '<div class="detail-price">' + cartMoney(price) +
        (hasOffer ? ' <span style="color:var(--muted);text-decoration:line-through;font-size:13px">' + cartMoney(p.price) + '</span>' : '') +
      '</div>' +
      '<button class="button button-gold button-full" data-add-to-cart="' + p.id + '">Add to bag</button>' +
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

Object.defineProperty(window, 'noirCart', {
  get() { return { items: getCartItems() }; },
  configurable: true,
});

/* ============================================================
   DELEGATED CLICKS
   data-cart-minus / data-cart-plus / data-cart-remove
   accept either "product:12" / "bundle:3" or bare "12" (product).
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
      await addProductToCart(Number(addBtn.dataset.addToCart), 1);
      return;
    }

    const bundleBtn = e.target.closest('[data-add-bundle]');
    if (bundleBtn) {
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

/* ============================================================
   CHECKOUT → Supabase
   ============================================================ */
document.addEventListener('submit', async function (e) {
  if (e.target.id !== 'checkout-form') return;
  e.preventDefault();

  const data = new FormData(e.target);
  const name = data.get('name');
  const email = data.get('email');
  const address = data.get('address');

  if (typeof noirHasSupabase !== 'function' || !noirHasSupabase()) {
    if (typeof showToast === 'function') showToast('❌ Cannot place order — DB not connected.');
    return;
  }

  if (!NOIR_CART.length) {
    if (typeof showToast === 'function') showToast('Your bag is empty');
    return;
  }

  const order = {
    id: 'N-' + Math.floor(1000 + Math.random() * 9000),
    customer: String(name || 'Guest'),
    email: String(email || ''),
    address: String(address || ''),
    customerId: CURRENT_USER_ID,
    total: cartSubtotal(),
    status: 'Processing',
    items: NOIR_CART.map(line => {
      if (line.type === 'product') {
        const p = cartGetProduct(line.id);
        return {
          type: 'product',
          productId: line.id,
          qty: line.qty,
          price: p ? cartComputePrice(p) : 0,
          name: p ? p.name : '',
        };
      }
      const b = cartGetBundle(line.id);
      return {
        type: 'bundle',
        bundleId: line.id,
        qty: line.qty,
        price: b ? Number(b.price) || 0 : 0,
        name: b ? b.name : '',
        productIds: b ? b.productIds : [],
      };
    }),
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing order…'; }

  try {
    await noirSaveOrderToDB(order);
    cartLog('Order saved ✓', order.id);

    if (typeof window.NOIR_DB !== 'undefined' && window.NOIR_DB) {
      window.NOIR_DB.orders.unshift(order);
    }

    await syncCustomerAfterOrder(order);
    await clearCart();

    const m = e.target.closest('dialog');
    if (m && typeof m.close === 'function') m.close();
    e.target.reset();

    if (typeof showToast === 'function') showToast('✅ Order ' + order.id + ' placed!');

    if (typeof window.noirRefreshStoreData === 'function') {
      await window.noirRefreshStoreData();
    }
  } catch (err) {
    cartErr('order save failed:', err);
    if (typeof showToast === 'function') showToast('❌ Order failed: ' + (err.message || 'Unknown error'));
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place order'; }
  }
});

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

  cartLog('cart.js initialized (one-row-per-user, items jsonb, backend count ready)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCart);
} else {
  initCart();
}