/* ============================================================
   NOIR — account.html
   - signed-in customers: their orders with live progress tracking,
     cancel (while still unpaid / unprepared), bank-transfer reference
   - everyone: track an order with order number + email
   ============================================================ */
(function () {
  'use strict';
  if (!document.getElementById('account-view')) return;

  const T = (k, v) => (typeof window.noirT === 'function' ? window.noirT(k, v) : k);
  const tr = () => window.noirOrderTracker;
  const esc = (s) => tr().esc(s);
  const money = (n) => '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
  const $ = (id) => document.getElementById(id);
  const toast = (m) => { if (typeof window.showToast === 'function') window.showToast(m); };

  const state = { session: null, orders: [], events: {}, open: null };

  function hashOrder() {
    const m = /order=([^&]+)/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- order card ---------- */
  function itemsHTML(o) {
    return '<ul class="order-items">' + (o.items || []).map((l) =>
      '<li><span>' + esc(tr().lineName(l)) + ' <em>× ' + (l.qty || 1) + '</em></span><span>' + money((l.price || 0) * (l.qty || 1)) + '</span></li>'
    ).join('') + '</ul>';
  }

  function canCancel(o) {
    return ['Processing', 'Confirmed'].indexOf(o.status) !== -1 && o.paymentStatus !== 'paid';
  }

  function orderCardHTML(o, opts) {
    opts = opts || {};
    const open = opts.forceOpen || state.open === o.id;
    const ev = opts.events || state.events[o.id] || [];
    const bankRef = o.paymentMethod === 'bank_transfer' && o.paymentStatus === 'pending' && o.status !== 'Cancelled';
    return '<article class="order-card' + (open ? ' open' : '') + '" data-order="' + esc(o.id) + '" id="order-' + esc(o.id) + '">' +
      '<button type="button" class="order-head" data-toggle="' + esc(o.id) + '" aria-expanded="' + open + '">' +
        '<span class="order-id">' + esc(o.id) + '<small>' + esc(tr().fmtDate(o.createdAt || o.date)) + '</small></span>' +
        '<span class="pill ' + tr().statusClass(o.status) + '">' + esc(tr().statusLabel(o.status)) + '</span>' +
        '<strong class="order-total">' + money(o.total) + '</strong>' +
        '<span class="order-chevron" aria-hidden="true">⌄</span>' +
      '</button>' +
      (open
        ? '<div class="order-body">' +
            tr().timelineHTML(o, ev) +
            '<div class="order-cols">' +
              '<div>' + itemsHTML(o) +
                '<div class="order-sum"><span>' + esc(T('cart.shipping')) + '</span><span>' + (o.shippingFee ? money(o.shippingFee) : esc(T('cart.free'))) + '</span></div>' +
                '<div class="order-sum total"><span>' + esc(T('acct.total')) + '</span><strong>' + money(o.total) + '</strong></div></div>' +
              '<div class="order-pay">' +
                '<p class="small-note">' + esc(T('checkout.review.payWith')) + '</p>' +
                '<p><strong>' + esc(tr().methodLabel(o.paymentMethod)) + '</strong></p>' +
                '<span class="pill ' + tr().paymentClass(o) + '">' + esc(tr().paymentLabel(o)) + '</span>' +
                (o.paymentRef ? '<p class="small-note">' + esc(T('pay.bank.ref')) + ': <strong>' + esc(o.paymentRef) + '</strong></p>' : '') +
                (bankRef && !o.paymentRef
                  ? '<form class="co-inline" data-ref="' + esc(o.id) + '"><input name="ref" required placeholder="' + esc(T('pay.bank.ref')) + '"><button class="button button-outline" type="submit">' + esc(T('acct.saveRef')) + '</button></form>'
                  : '') +
                '<p class="small-note">' + esc(o.address) + (o.city ? ', ' + esc(o.city) : '') + '</p>' +
                (opts.guest ? '' : (canCancel(o) ? '<button type="button" class="button button-outline" data-cancel="' + esc(o.id) + '">' + esc(T('acct.cancel')) + '</button>' : '')) +
              '</div>' +
            '</div>' +
          '</div>'
        : '') +
    '</article>';
  }

  function renderOrders() {
    const wrap = $('account-orders-wrap'), list = $('account-orders');
    if (!state.session) { wrap.hidden = true; return; }
    wrap.hidden = false;
    list.innerHTML = state.orders.length
      ? state.orders.map((o) => orderCardHTML(o)).join('')
      : '<p class="order-empty">' + esc(T('acct.noOrders')) + '</p>';
  }

  async function loadEvents(id) {
    try { state.events[id] = await window.noirLoadOrderEvents(id); } catch (e) { state.events[id] = []; }
  }

  async function loadOrders() {
    if (!state.session) return;
    try { state.orders = await window.noirLoadMyOrders(); } catch (e) { state.orders = []; }
    if (state.open) await loadEvents(state.open);
    renderOrders();
  }

  async function openOrder(id, scroll) {
    state.open = state.open === id && !scroll ? null : id;
    if (state.open) await loadEvents(id);
    renderOrders();
    if (scroll) { const el = $('order-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  /* ---------- header / session ---------- */
  async function renderSession() {
    let s = null;
    try { s = await window.noirGetSession(); } catch (e) { /* guest */ }
    state.session = s;
    $('account-name').textContent = s ? (s.name || '') : '';
    $('account-copy').textContent = s ? '' : T('acct.signInCopy');
    $('account-actions').innerHTML = s ? '' : '<a href="login.html?next=account.html" class="button button-gold">' + esc(T('acct.signIn')) + ' →</a>';
    $('account-signed').hidden = !s;
    if (s) {
      $('signed-email').textContent = s.email || '';
      $('signed-role').textContent = s.role === 'admin' ? T('acct.admin') : T('acct.customer');
      $('signed-admin-link').hidden = s.role !== 'admin';
    }
    await loadOrders();
    const want = hashOrder();
    if (want && state.orders.some((o) => o.id === want)) openOrder(want, true);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) { openOrder(tg.dataset.toggle); return; }

    const c = e.target.closest('[data-cancel]');
    if (c) {
      if (!confirm(T('acct.cancelConfirm'))) return;
      try { await window.noirCancelMyOrder(c.dataset.cancel); toast(T('acct.cancelled')); }
      catch (err) { toast(T('acct.cantCancel')); }
      await loadOrders();
    }
    if (e.target.closest('#signout-btn')) {
      if (typeof window.noirLogout === 'function') window.noirLogout('login.html'); else location.href = 'login.html';
    }
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.dataset.ref) {
      e.preventDefault();
      const ref = f.querySelector('[name=ref]').value.trim();
      try { await window.noirSubmitPaymentRef(f.dataset.ref, ref, state.session && state.session.email); toast(T('acct.refSaved')); }
      catch (err) { toast(T('err.generic')); }
      await loadOrders();
    }
    if (f.id === 'track-form') {
      e.preventDefault();
      const out = $('track-result');
      const fd = new FormData(f);
      out.innerHTML = '<p class="small-note">' + esc(T('acct.loading')) + '</p>';
      try {
        const res = await window.noirTrackOrder(String(fd.get('order')).trim(), String(fd.get('email')).trim());
        out.innerHTML = res
          ? orderCardHTML(res.order, { forceOpen: true, events: res.events, guest: true })
          : '<p class="co-error">' + esc(T('acct.notFound')) + '</p>';
      } catch (err) { out.innerHTML = '<p class="co-error">' + esc(T('err.generic')) + '</p>'; }
    }
  });

  window.addEventListener('hashchange', () => { const w = hashOrder(); if (w) openOrder(w, true); });
  window.addEventListener('noir:language', () => { renderSession(); });
  window.addEventListener('noir:notification', () => loadOrders()); // status changes arrive as notifications
  window.addEventListener('noir:auth-changed', renderSession);
  window.addEventListener('noir:session-ready', renderSession);

  // Live progress even if the bell is hidden: refresh when the tab regains focus
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadOrders(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderSession);
  else renderSession();
})();
