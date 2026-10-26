/* ============================================================
   NOIR — Cart + Product modal
   Fully guarded, works with store.js (localStorage).
   ============================================================ */

const NOIR_CART_KEY = 'noir-cart';

/* ---------- SAFE HELPERS ---------- */
function cartSafe(name, fallback) {
  if (typeof window[name] === 'function') return window[name];
  return fallback;
}

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
  const db = (typeof NOIR_DB !== 'undefined' && NOIR_DB) ? NOIR_DB : { products: [] };
  return db.products.find(function (p) { return p.id === Number(id); });
}
function cartComputePrice(p) {
  if (!p) return 0;
  if (typeof noirComputePrice === 'function') return noirComputePrice(p);
  if (p.offer) {
    if (p.offer.type === 'percent') return Math.round(p.price * (1 - p.offer.value / 100) * 100) / 100;
    if (p.offer.type === 'fixed') return Math.max(0, p.price - p.offer.value);
  }
  return p.price;
}

/* ---------- CART STATE ---------- */
function loadCart() {
  try {
    const raw = localStorage.getItem(NOIR_CART_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}
function saveCart(cart) {
  try { localStorage.setItem(NOIR_CART_KEY, JSON.stringify(cart)); } catch (e) {}
}

let NOIR_CART = loadCart();

/* ---------- PUBLIC API: ADD TO CART ---------- */
function addToCart(productId, qty) {
  const id = Number(productId);
  const quantity = Math.max(1, Number(qty) || 1);
  const product = cartGetProduct(id);
  if (!product) {
    console.warn('[cart.js] product not found:', id);
    return;
  }
  const existing = NOIR_CART.find(function (item) { return item.id === id; });
  if (existing) {
    existing.qty += quantity;
  } else {
    NOIR_CART.push({ id: id, qty: quantity });
  }
  saveCart(NOIR_CART);
  updateCartUI();
  if (typeof showToast === 'function') {
    showToast(product.name + ' added to bag');
  }
}
window.addToCart = addToCart;

/* ---------- PUBLIC API: REMOVE / QTY ---------- */
function removeFromCart(productId) {
  const id = Number(productId);
  NOIR_CART = NOIR_CART.filter(function (item) { return item.id !== id; });
  saveCart(NOIR_CART);
  updateCartUI();
}
function updateQty(productId, delta) {
  const id = Number(productId);
  const item = NOIR_CART.find(function (i) { return i.id === id; });
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    NOIR_CART = NOIR_CART.filter(function (i) { return i.id !== id; });
  }
  saveCart(NOIR_CART);
  updateCartUI();
}
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;

/* ---------- CART TOTAL ---------- */
function cartSubtotal() {
  return NOIR_CART.reduce(function (sum, item) {
    const p = cartGetProduct(item.id);
    if (!p) return sum;
    return sum + cartComputePrice(p) * item.qty;
  }, 0);
}
function cartCount() {
  return NOIR_CART.reduce(function (sum, item) { return sum + item.qty; }, 0);
}
window.cartSubtotal = cartSubtotal;
window.cartCount = cartCount;

/* ---------- RENDER CART UI ---------- */
function updateCartUI() {
  // Badge
  const badge = cart$('#cart-count');
  if (badge) badge.textContent = String(cartCount());

  // Drawer items
  const list = cart$('#cart-items');
  if (list) {
    if (!NOIR_CART.length) {
      list.innerHTML = '<div class="cart-empty">Your bag is empty.</div>';
    } else {
      list.innerHTML = NOIR_CART.map(function (item) {
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

  // Subtotal
  const sub = cart$('#cart-subtotal');
  if (sub) sub.textContent = cartMoney(cartSubtotal());

  // Checkout total (if modal open)
  const coTotal = cart$('#checkout-total');
  if (coTotal) coTotal.textContent = cartMoney(cartSubtotal());
}

/* ---------- CART DRAWER OPEN/CLOSE ---------- */
function openCartDrawer() {
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  if (backdrop) backdrop.classList.remove('hidden');
  document.body.classList.add('lock-scroll');
}
function closeCartDrawer() {
  const drawer = cart$('#cart-drawer');
  const backdrop = cart$('#drawer-backdrop');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) backdrop.classList.add('hidden');
  document.body.classList.remove('lock-scroll');
}
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;

/* ---------- PRODUCT MODAL (quick view) ---------- */
function openProductModal(productId) {
  const id = Number(productId);
  const p = cartGetProduct(id);
  if (!p) return;

  const modal = cart$('#product-modal');
  const detail = cart$('#product-detail');
  if (!modal || !detail) return;

  const price = cartComputePrice(p);
  const hasOffer = !!p.offer;

  detail.innerHTML = '<div class="product-detail-layout">' +
    '<div class="detail-visual">' +
      '<div class="product-bottle ' + (p.bottle || '') + '"></div>' +
    '</div>' +
    '<div class="detail-copy">' +
      '<p class="product-category">' + cartEsc(p.category) + '</p>' +
      '<h2>' + cartEsc(p.name) + '</h2>' +
      '<p class="product-subtitle">' + cartEsc(p.subtitle) + '</p>' +
      '<p>' + cartEsc(p.description) + '</p>' +
      '<div class="detail-price">' +
        cartMoney(price) +
        (hasOffer ? ' <span style="color:var(--muted);text-decoration:line-through;font-size:13px">' + cartMoney(p.price) + '</span>' : '') +
      '</div>' +
      '<button class="button button-gold button-full" data-add-to-cart="' + p.id + '">Add to bag</button>' +
    '</div>' +
  '</div>';

  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }
}
window.openProductModal = openProductModal;

/* ---------- DELEGATED CLICK HANDLERS ---------- */
document.addEventListener('click', function (e) {
  try {
    // Cart triggers
    if (e.target.closest('#cart-open') || e.target.closest('.cart-trigger')) {
      e.preventDefault();
      openCartDrawer();
      return;
    }
    if (e.target.closest('#cart-close')) {
      e.preventDefault();
      closeCartDrawer();
      return;
    }
    if (e.target.closest('#drawer-backdrop')) {
      closeCartDrawer();
      return;
    }

    // Quantity +/-
    const minus = e.target.closest('[data-cart-minus]');
    if (minus) { updateQty(minus.dataset.cartMinus, -1); return; }
    const plus = e.target.closest('[data-cart-plus]');
    if (plus) { updateQty(plus.dataset.cartPlus, +1); return; }

    // Remove
    const rem = e.target.closest('[data-cart-remove]');
    if (rem) { removeFromCart(rem.dataset.cartRemove); return; }

    // Checkout
    if (e.target.closest('#checkout-button')) {
      e.preventDefault();
      if (!NOIR_CART.length) {
        if (typeof showToast === 'function') showToast('Your bag is empty');
        return;
      }
      closeCartDrawer();
      const co = cart$('#checkout-modal');
      if (co && typeof co.showModal === 'function') {
        const total = cart$('#checkout-total');
        if (total) total.textContent = cartMoney(cartSubtotal());
        co.showModal();
      }
      return;
    }

    // Close modals
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const id = closeBtn.dataset.close;
      const m = document.getElementById(id);
      if (m && typeof m.close === 'function') m.close();
      return;
    }
  } catch (err) {
    console.error('[cart.js] click failed:', err);
  }
});

/* ---------- CHECKOUT FORM ---------- */
document.addEventListener('submit', function (e) {
  if (e.target.id !== 'checkout-form') return;
  e.preventDefault();
  const data = new FormData(e.target);
  const name = data.get('name');
  const email = data.get('email');
  const address = data.get('address');

  // Create order in NOIR_DB
  const order = {
    id: 'N-' + Math.floor(1000 + Math.random() * 9000),
    customer: String(name || 'Guest'),
    email: String(email || ''),
    address: String(address || ''),
    date: new Date().toISOString().slice(0, 10),
    total: cartSubtotal(),
    status: 'Processing',
    items: NOIR_CART.map(function (item) {
      const p = cartGetProduct(item.id);
      return { productId: item.id, qty: item.qty, price: p ? cartComputePrice(p) : 0 };
    }),
  };

  if (typeof NOIR_DB !== 'undefined' && NOIR_DB) {
    NOIR_DB.orders.unshift(order);
    if (typeof noirStoreSave === 'function') noirStoreSave(NOIR_DB);
  }

  // Clear cart
  NOIR_CART = [];
  saveCart(NOIR_CART);
  updateCartUI();

  // Close modal
  const m = e.target.closest('dialog');
  if (m && typeof m.close === 'function') m.close();
  e.target.reset();

  if (typeof showToast === 'function') showToast('Order ' + order.id + ' placed!');
});

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function () {
  updateCartUI();

  // Bind any static cart-open buttons
  document.querySelectorAll('#cart-open, .cart-trigger').forEach(function (btn) {
    if (btn._cartBound) return;
    btn._cartBound = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openCartDrawer();
    });
  });
});

// Sync across tabs
window.addEventListener('storage', function (e) {
  if (e.key === NOIR_CART_KEY) {
    NOIR_CART = loadCart();
    updateCartUI();
  }
});