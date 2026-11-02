/* ============================================================
   NOIR — shopping bag markup (shared by the drawer and cart.html)
   window.noirBagHTML({ variant: 'drawer' | 'page' })
     → { items, footer, hasItems, totals }
   Names/categories follow the active language (EN / AR).
   Quantity and remove buttons are handled by cart.js (data-cart-*).
   ============================================================ */
(function () {
  'use strict';

  const T = (k, v) => (typeof window.noirT === 'function' ? window.noirT(k, v) : k);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (n) => '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
  const loc = (o, f) => (typeof window.noirLocalize === 'function' ? window.noirLocalize(o, f) : (o && o[f]) || '');
  const isUrl = (v) => typeof v === 'string' && /^(https?:\/\/|\/)/.test(v);

  function visual(bottle, alt) {
    return isUrl(bottle)
      ? '<img src="' + esc(bottle) + '" alt="' + esc(alt) + '" loading="lazy">'
      : '<div class="product-bottle ' + esc(bottle || '') + '"></div>';
  }

  function lineHTML(line) {
    const isBundle = line.type === 'bundle';
    const src = isBundle ? line.bundle : line.product;
    const qty = Number(line.qty) || 1;
    const unit = isBundle
      ? Number(src.price) || 0
      : (typeof window.noirComputePrice === 'function' ? window.noirComputePrice(src) : Number(src.price) || 0);
    const key = line.type + ':' + line.id;
    const name = loc(src, 'name');
    const category = isBundle ? T('cat.Bundle') : (typeof window.noirCategory === 'function' ? window.noirCategory(src.category) : src.category);
    const onSale = !isBundle && src.offer;
    const atMax = !isBundle && Number.isFinite(src.stock) && qty >= src.stock;
    return '<article class="bag-line" data-line-type="' + esc(line.type) + '" data-line-id="' + esc(line.id) + '">' +
      '<div class="bag-thumb">' + visual(src.bottle, name) + '</div>' +
      '<div class="bag-info">' +
        '<p class="product-category">' + esc(category) + '</p>' +
        '<h3>' + esc(name) + '</h3>' +
        '<p class="bag-unit">' + money(unit) + ' ' + esc(T('cart.each')) +
          (onSale ? ' <s>' + money(src.price) + '</s>' : '') + '</p>' +
        '<div class="bag-qty" role="group" aria-label="' + esc(T('cart.items', { n: qty })) + '">' +
          '<button type="button" data-cart-minus="' + esc(key) + '" aria-label="−">−</button>' +
          '<span aria-live="polite">' + qty + '</span>' +
          '<button type="button" data-cart-plus="' + esc(key) + '" aria-label="+"' + (atMax ? ' disabled' : '') + '>+</button>' +
        '</div>' +
      '</div>' +
      '<div class="bag-side">' +
        '<strong class="bag-line-total">' + money(unit * qty) + '</strong>' +
        '<button type="button" class="bag-remove" data-cart-remove="' + esc(key) + '">' + esc(T('cart.remove')) + '</button>' +
      '</div>' +
    '</article>';
  }

  function emptyHTML() {
    return '<div class="bag-empty">' +
      '<div class="bag-empty-icon" aria-hidden="true">♧</div>' +
      '<h3>' + esc(T('cart.empty.title')) + '</h3>' +
      '<p>' + esc(T('cart.empty.copy')) + '</p>' +
      '<a href="shop.html" class="button button-gold" data-cart-link>' + esc(T('cart.browse')) + ' →</a>' +
    '</div>';
  }

  function shippingBar(t) {
    const pct = t.freeOver > 0 ? Math.min(100, Math.round((t.subtotal / t.freeOver) * 100)) : 100;
    const done = t.freeLeft <= 0;
    return '<div class="bag-ship' + (done ? ' done' : '') + '">' +
      '<p>' + esc(done ? T('cart.freeUnlocked') : T('cart.freeLeft', { amount: money(t.freeLeft) })) + '</p>' +
      '<div class="bag-ship-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
    '</div>';
  }

  function summaryHTML(t, variant) {
    return shippingBar(t) +
      '<div class="bag-totals">' +
        '<div class="bag-row"><span>' + esc(T('cart.subtotal')) + '</span><span>' + money(t.subtotal) + '</span></div>' +
        '<div class="bag-row"><span>' + esc(T('cart.shipping')) + '</span><span>' + (t.shipping ? money(t.shipping) : esc(T('cart.free'))) + '</span></div>' +
        '<div class="bag-row total"><span>' + esc(T('cart.estimated')) + '</span><strong>' + money(t.total) + '</strong></div>' +
      '</div>' +
      '<button type="button" class="button button-gold button-full" data-checkout>' + esc(T('cart.checkout')) + ' →</button>' +
      (variant === 'drawer'
        ? '<a class="bag-view-link" href="cart.html" data-cart-link>' + esc(T('cart.pageTitle')) + ' →</a>'
        : '<a class="bag-view-link" href="shop.html">← ' + esc(T('cart.continue')) + '</a>') +
      '<ul class="bag-perks">' +
        '<li>🔒 ' + esc(T('cart.perk.secure')) + '</li>' +
        '<li>💵 ' + esc(T('cart.perk.cod')) + '</li>' +
        '<li>📦 ' + esc(T('cart.perk.track')) + '</li>' +
      '</ul>';
  }

  window.noirBagHTML = function (opts) {
    const variant = (opts && opts.variant) || 'drawer';
    const lines = typeof window.getCartItems === 'function' ? window.getCartItems() : [];
    if (!lines.length) return { items: emptyHTML(), footer: '', hasItems: false, totals: null };
    const totals = window.cartTotals();
    return { items: lines.map(lineHTML).join(''), footer: summaryHTML(totals, variant), hasItems: true, totals };
  };
})();
