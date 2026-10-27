/* ============================================================
   NOIR — Cart + Product modal (Supabase-only for orders)
   Cart items stay in localStorage (per-user).
   Orders are saved to Supabase.
   After checkout: NO reload — UI refreshes in place.
   ============================================================ */

const NOIR_CART_KEY = 'noir-cart';
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
function cart$ (sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
function cartEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cartMoney(n) {
  return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
}
function cartGetProduct(id) {
  if (typeof noirGetProduct === 'function') return noirGetProduct(id);
  return null;
}
function cartComputePrice(p) {
  if (!p) return 0;
  if (typeof noirComputePrice === 'function') return noirComputePrice(p);
  return p.price;
}

/* ---------- CART STATE ---------- */
function loadCart() {
  try {
    const raw = localStorage.getItem(NOIR_CART_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cartLog('Loaded cart from localStorage:', parsed.length, 'items');
      return parsed;
    }
  } catch (e) { cartWarn('loadCart failed:', e); }
  return [];
}
function saveCart(cart) {
  try { localStorage.setItem(NOIR_CART_KEY, JSON.stringify(cart)); }
  catch (e) { cartWarn('saveCart failed:', e); }
}

let NOIR_CART = loadCart();

/* ---------- ADD ---------- */
function addToCart(productId, qty) {
  const id = Number(productId);
  const quantity = Math.max(1, Number(qty) || 1);
  const product = cartGetProduct(id);
  if (!product) { cartWarn('addToCart: product not found:', id); return; }
  const existing = NOIR_CART.find(item => item.id === id);
  if (existing) existing.qty += quantity;
  else NOIR_CART.push({ id, qty: quantity });
  saveCart(NOIR_CART);
  updateCartUI();
  cartLog('Added to cart:', product.name, '| total items:', cartCount());
  if (typeof showToast === 'function') showToast(product.name + ' added to bag');
}
window.addToCart = addToCart;

/* ---------- REMOVE / QTY ---------- */
function removeFromCart(productId) {
  const id = Number(productId);
  NOIR_CART = NOIR_CART.filter(item => item.id !== id);
  saveCart(NOIR_CART);
  updateCartUI();
  cartLog('Removed from cart:', id);
}
function updateQty(productId, delta) {
  const id = Number(productId);
  const item = NOIR_CART.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) NOIR_CART = NOIR_CART.filter(i => i.id !== id);
  saveCart(NOIR_CART);
  updateCartUI();
}
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;

/* ---------- TOTALS ---------- */
function cartSubtotal() {
  return NOIR_CART.reduce((sum, item) => {
    const p = cartGetProduct(item.id);
    if (!p) return sum;
    return sum + cartComputePrice(p) * item.qty;
  }, 0);
}
function cartCount() {
  return NOIR_CART.reduce((sum, item) => sum + item.qty, 0);
}
window.cartSubtotal = cartSubtotal;
window.cartCount = cartCount;

/* ---------- UI ---------- */
function updateCartUI() {
  const badge = cart$('#cart-count');
  if (badge) badge.textContent = String(cartCount());

  const list = cart$('#cart-items');
  if (list) {
    if (!NOIR_CART.length) {
      list.innerHTML = '<div class="cart-empty">Your bag is empty.</div>';
    } else {
      list.innerHTML = NOIR_CART.map(item => {
        const p = cartGetProduct(item.id);
        if (!p) return '';
        const unitPrice = cartComputePrice(p);
        return '<div class="cart-row">' +
          '<div class="cart-thumb"><div class="product-bottle ' + (p.bottle || '') + '"></div></div>' +
          '<div>' +
            '<h3>' + cartEsc(p.name) + '</h3>' +
            '<p>' + cartEsc(p.subtitle || '') + '</p>' +
            '<div class="quantity-controls">' +
              '<button data-cart-minus="' + p.id + '" aria-label="Decrease">−</button>' +
              '<span>' + item.qty + '</span>' +
              '<button data-cart-plus="' + p.id + '" aria-label="Increase">+</button>' +
            '</div>' +
            '<button class="remove-item" data-cart-remove="' + p.id + '">Remove</button>' +
          '</div>' +
          '<div class="cart-row-price">' + cartMoney(unitPrice * item.qty) + '</div>' +
        '</div>';
      }).join('');
    }
  }

  const sub = cart$('#cart-subtotal');
  if (sub) sub.textContent = cartMoney(cartSubtotal());

  const coTotal = cart$('#checkout-total');
  if (coTotal) coTotal.textContent = cartMoney(cartSubtotal());

  cartLog('updateCartUI →', { items: NOIR_CART.length, total: cartSubtotal() });
}

/* ---------- DRAWER ---------- */
function openCartDrawer() {
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
  if (backdrop) backdrop.classList.remove('hidden');
  document.body.classList.add('lock-scroll');
  cartLog('Cart drawer opened');
}
function closeCartDrawer() {
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
  if (backdrop) backdrop.classList.add('hidden');
  document.body.classList.remove('lock-scroll');
}
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;

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
window.openProductModal = openProductModal;

/* ---------- DELEGATED CLICKS ---------- */
document.addEventListener('click', function (e) {
  try {
    if (e.target.closest('#cart-open') || e.target.closest('.cart-trigger')) { e.preventDefault(); openCartDrawer(); return; }
    if (e.target.closest('#cart-close')) { e.preventDefault(); closeCartDrawer(); return; }
    if (e.target.closest('#drawer-backdrop')) { closeCartDrawer(); return; }

    const minus = e.target.closest('[data-cart-minus]');
    if (minus) { updateQty(minus.dataset.cartMinus, -1); return; }
    const plus = e.target.closest('[data-cart-plus]');
    if (plus) { updateQty(plus.dataset.cartPlus, +1); return; }
    const rem = e.target.closest('[data-cart-remove]');
    if (rem) { removeFromCart(rem.dataset.cartRemove); return; }

    if (e.target.closest('#checkout-button')) {
      e.preventDefault();
      if (!NOIR_CART.length) { if (typeof showToast === 'function') showToast('Your bag is empty'); return; }
      closeCartDrawer();
      const co = cart$('#checkout-modal');
      if (co && typeof co.showModal === 'function') {
        const total = cart$('#checkout-total');
        if (total) total.textContent = cartMoney(cartSubtotal());
        co.showModal();
      }
      return;
    }

    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const id = closeBtn.dataset.close;
      const m = document.getElementById(id);
      if (m && typeof m.close === 'function') m.close();
      return;
    }
  } catch (err) {
    cartErr('click failed:', err);
  }
});

/* ============================================================
   CHECKOUT → Supabase  (NO RELOAD)
   ============================================================ */
document.addEventListener('submit', async function (e) {
  if (e.target.id !== 'checkout-form') return;
  e.preventDefault();

  cartLog('Checkout submit fired');

  const data = new FormData(e.target);
  const name = data.get('name');
  const email = data.get('email');
  const address = data.get('address');

  if (typeof noirHasSupabase !== 'function' || !noirHasSupabase()) {
    cartErr('Supabase not configured');
    if (typeof showToast === 'function') showToast('❌ Cannot place order — database not connected.');
    return;
  }

  const order = {
    id: 'N-' + Math.floor(1000 + Math.random() * 9000),
    customer: String(name || 'Guest'),
    email: String(email || ''),
    address: String(address || ''),
    total: cartSubtotal(),
    status: 'Processing',
    items: NOIR_CART.map(item => {
      const p = cartGetProduct(item.id);
      return { productId: item.id, qty: item.qty, price: p ? cartComputePrice(p) : 0 };
    }),
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing order…'; }

  try {
    cartLog('Saving order to Supabase…', order);
    await noirSaveOrderToDB(order);
    cartLog('Order saved ✓', order.id);

    // Push to in-memory DB so admin sees it immediately
    if (typeof NOIR_DB !== 'undefined' && NOIR_DB) {
      NOIR_DB.orders.unshift(order);
      cartLog('Pushed to NOIR_DB.orders (total orders:', NOIR_DB.orders.length, ')');
    }

    // Clear cart
    NOIR_CART = [];
    saveCart(NOIR_CART);
    updateCartUI();

    // Close modal + reset form
    const m = e.target.closest('dialog');
    if (m && typeof m.close === 'function') m.close();
    e.target.reset();

    if (typeof showToast === 'function') showToast('✅ Order ' + order.id + ' placed!');

    // ✅ NO RELOAD — refresh UI in place
    if (typeof window.noirRefreshStoreData === 'function') {
      cartLog('Calling noirRefreshStoreData() (no reload)…');
      await window.noirRefreshStoreData();
    }
    // Re-render cart badge + totals after data refresh
    updateCartUI();
  } catch (err) {
    cartErr('order save failed:', err);
    if (typeof showToast === 'function') showToast('❌ Order failed: ' + (err.message || 'Unknown error'));
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place order'; }
  }
});

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function () {
  updateCartUI();
  document.querySelectorAll('#cart-open, .cart-trigger').forEach(btn => {
    if (btn._cartBound) return;
    btn._cartBound = true;
    btn.addEventListener('click', e => { e.preventDefault(); openCartDrawer(); });
  });
  cartLog('cart.js initialized');
});

window.addEventListener('storage', function (e) {
  if (e.key === NOIR_CART_KEY) { NOIR_CART = loadCart(); updateCartUI(); }
});