/* ============================================================
   NOIR — cart.html (full-page shopping bag)
   Renders into #bag-page-items / #bag-page-summary and stays live.
   ============================================================ */
(function () {
  'use strict';
  const items = document.getElementById('bag-page-items');
  const summary = document.getElementById('bag-page-summary');
  const count = document.getElementById('bag-page-count');
  if (!items || !summary) return;

  function render() {
    if (!window.noirBagHTML) return;
    const h = window.noirBagHTML({ variant: 'page' });
    items.innerHTML = h.items;
    summary.innerHTML = h.footer ? '<h2>' + (window.noirT ? window.noirT('cart.summary') : 'Order summary') + '</h2>' + h.footer : '';
    summary.hidden = !h.hasItems;
    document.getElementById('bag-page').classList.toggle('is-empty', !h.hasItems);
    if (count) count.textContent = h.hasItems ? window.noirT('cart.items', { n: window.getCartCount() }) : '';
  }

  ['noir:cart-updated', 'noir:data-ready', 'noir:language', 'noir:settings-ready'].forEach((ev) => window.addEventListener(ev, render));
  document.addEventListener('DOMContentLoaded', render);
  render();

  // On this page the summary's checkout button opens the same checkout dialog
  summary.addEventListener('click', (e) => {
    if (!e.target.closest('[data-checkout]')) return;
    const m = document.querySelector('site-modals');
    if (m && m.open) m.open('checkout-modal');
  });
  window.addEventListener('noir:order-placed', render);
})();
