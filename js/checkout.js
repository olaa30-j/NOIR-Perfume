/* ============================================================
   NOIR — checkout flow
   details → payment → review → (card: pay) → confirmation

   - Orders are created by the database function place_order():
     prices, offers, stock and shipping are computed server-side.
   - Payment methods: cash on delivery, bank transfer / InstaPay and a
     TEST-MODE card flow. A real card gateway (Paymob, Stripe, …) plugs in
     at noirCheckout.cardGateway — see the README.
   ============================================================ */
(function () {
  'use strict';

  const T = (k, v) => (typeof window.noirT === 'function' ? window.noirT(k, v) : k);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (n) => '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
  const loc = (o, f) => (typeof window.noirLocalize === 'function' ? window.noirLocalize(o, f) : (o && o[f]) || '');
  const toast = (m) => { if (typeof window.showToast === 'function') window.showToast(m); };

  const state = {
    step: 'details',          // details | payment | review | pay | done
    form: { name: '', email: '', phone: '', city: '', address: '', notes: '' },
    method: null,
    bankRef: '',
    order: null,              // order returned by the database
    busy: false,
    error: '',
    prefilled: false,
  };

  function root() { return document.getElementById('checkout-flow'); }
  function settings() { return (window.NOIR_DB && window.NOIR_DB.settings) || {}; }

  /* ---------- payment methods available right now ---------- */
  function methods() {
    const s = settings();
    const list = [];
    if (s.codEnabled !== false) list.push('cod');
    if (s.bankEnabled) list.push('bank_transfer');
    if (s.cardEnabled && s.paymentSandbox) list.push('card'); // card needs the sandbox until a gateway is wired in
    return list;
  }

  /* ---------- prefill from the signed-in customer ---------- */
  async function prefill() {
    if (state.prefilled) return;
    state.prefilled = true;
    try {
      if (typeof window.noirGetSession === 'function') {
        const s = await window.noirGetSession();
        if (s) {
          if (!state.form.name) state.form.name = s.name || '';
          if (!state.form.email) state.form.email = s.email || '';
          state._signedIn = true;
        }
      }
    } catch (e) { /* guest */ }
  }

  /* ---------- helpers ---------- */
  function cartLines() { return typeof window.getCartItems === 'function' ? window.getCartItems() : []; }
  function lineUnit(l) {
    if (l.type === 'bundle') return Number(l.bundle.price) || 0;
    return typeof window.noirComputePrice === 'function' ? window.noirComputePrice(l.product) : Number(l.product.price) || 0;
  }
  function lineName(l) { return loc(l.type === 'bundle' ? l.bundle : l.product, 'name'); }

  function stepper() {
    const order = ['details', 'payment', 'review'];
    const idx = order.indexOf(state.step);
    return '<ol class="co-steps" aria-label="' + esc(T('checkout.title')) + '">' + order.map((s, i) => {
      const cls = idx === -1 ? 'done' : i < idx ? 'done' : i === idx ? 'current' : '';
      return '<li class="' + cls + '"><span>' + (i < idx || idx === -1 ? '✓' : i + 1) + '</span>' + esc(T('checkout.step.' + s)) + '</li>';
    }).join('') + '</ol>';
  }

  function errorBox() {
    return state.error ? '<p class="co-error" role="alert">' + esc(state.error) + '</p>' : '';
  }

  function summaryHTML(totals, compact) {
    const lines = cartLines();
    const rows = lines.map((l) =>
      '<li><span class="co-sum-name">' + esc(lineName(l)) + ' <em>× ' + l.qty + '</em></span><span>' + money(lineUnit(l) * l.qty) + '</span></li>'
    ).join('');
    return '<div class="co-summary' + (compact ? ' compact' : '') + '">' +
      '<ul>' + rows + '</ul>' +
      '<div class="co-row"><span>' + esc(T('cart.subtotal')) + '</span><span>' + money(totals.subtotal) + '</span></div>' +
      '<div class="co-row"><span>' + esc(T('cart.shipping')) + '</span><span>' + (totals.shipping ? money(totals.shipping) : esc(T('cart.free'))) + '</span></div>' +
      '<div class="co-row total"><span>' + esc(T('cart.total')) + '</span><strong>' + money(totals.total) + '</strong></div>' +
    '</div>';
  }

  function field(name, labelKey, opts) {
    opts = opts || {};
    const v = esc(state.form[name] || '');
    const common = ' name="' + name + '" id="co-' + name + '"' + (opts.required ? ' required' : '') +
      (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '');
    const input = opts.textarea
      ? '<textarea' + common + ' rows="' + (opts.rows || 2) + '">' + v + '</textarea>'
      : '<input' + common + ' type="' + (opts.type || 'text') + '" value="' + v + '"' + (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + '>';
    return '<label class="' + (opts.span ? 'span-two' : '') + '" for="co-' + name + '"><span>' + esc(T(labelKey)) + '</span>' + input + '</label>';
  }

  /* ============================================================
     STEPS
     ============================================================ */
  function viewDetails() {
    return stepper() +
      '<form class="co-form" data-co-form="details" novalidate>' +
        '<div class="co-grid">' +
          field('name', 'checkout.fullName', { required: true, autocomplete: 'name', span: true }) +
          field('email', 'checkout.email', { required: true, type: 'email', autocomplete: 'email' }) +
          field('phone', 'checkout.phone', { required: true, type: 'tel', autocomplete: 'tel', inputmode: 'tel' }) +
          field('city', 'checkout.city', { autocomplete: 'address-level2' }) +
          field('address', 'checkout.address', { required: true, textarea: true, autocomplete: 'street-address', placeholder: T('checkout.addressPh'), span: true }) +
          field('notes', 'checkout.notes', { textarea: true, span: true }) +
        '</div>' + errorBox() +
        (state._signedIn ? '' : '<p class="co-hint">' + esc(T('checkout.signinHint')) + ' <a href="login.html?next=cart.html">' + esc(T('acct.signIn')) + '</a></p>') +
        '<div class="co-actions"><button type="submit" class="button button-gold button-full">' + esc(T('checkout.next')) + ' →</button></div>' +
      '</form>';
  }

  function viewPayment() {
    const list = methods();
    const s = settings();
    if (!list.length) {
      return stepper() + '<p class="co-error">' + esc(T('pay.none')) + '</p>' +
        '<div class="co-actions"><button type="button" class="button button-outline" data-co-back>← ' + esc(T('checkout.back')) + '</button></div>';
    }
    if (!state.method || list.indexOf(state.method) === -1) state.method = list[0];
    const icons = { cod: '💵', card: '💳', bank_transfer: '🏦' };
    const keys = { cod: 'pay.cod', card: 'pay.card', bank_transfer: 'pay.bank' };
    const opts = list.map((m) =>
      '<label class="co-method' + (state.method === m ? ' selected' : '') + '">' +
        '<input type="radio" name="method" value="' + m + '"' + (state.method === m ? ' checked' : '') + '>' +
        '<span class="co-method-icon" aria-hidden="true">' + icons[m] + '</span>' +
        '<span class="co-method-text"><strong>' + esc(T(keys[m])) + '</strong><small>' + esc(T(keys[m] + '.desc')) + '</small></span>' +
        '<span class="co-method-check" aria-hidden="true"></span>' +
      '</label>'
    ).join('');

    let extra = '';
    if (state.method === 'bank_transfer') {
      extra = '<div class="co-extra"><h4>' + esc(T('pay.bank.details')) + '</h4>' +
        '<pre class="co-bank">' + esc(s.bankDetails || '—') + '</pre>' +
        '<label for="co-bankref"><span>' + esc(T('pay.bank.ref')) + '</span><input id="co-bankref" name="bankRef" value="' + esc(state.bankRef) + '"></label>' +
        '<p class="co-hint">' + esc(T('pay.bank.refHint')) + '</p></div>';
    } else if (state.method === 'cod') {
      extra = '<div class="co-extra"><p class="co-hint">' + esc(T('pay.codNote')) + '</p></div>';
    } else if (state.method === 'card') {
      extra = '<div class="co-extra"><p class="co-test">' + esc(T('pay.test')) + '</p></div>';
    }

    return stepper() +
      '<form class="co-form" data-co-form="payment" novalidate>' +
        '<h3 class="co-h">' + esc(T('pay.title')) + '</h3>' +
        '<div class="co-methods" role="radiogroup">' + opts + '</div>' + extra + errorBox() +
        '<div class="co-actions two">' +
          '<button type="button" class="button button-outline" data-co-back>← ' + esc(T('checkout.back')) + '</button>' +
          '<button type="submit" class="button button-gold">' + esc(T('checkout.next')) + ' →</button>' +
        '</div>' +
      '</form>';
  }

  function viewReview() {
    const totals = window.cartTotals();
    const f = state.form;
    const mKeys = { cod: 'pay.cod', card: 'pay.card', bank_transfer: 'pay.bank' };
    return stepper() +
      '<div class="co-review">' +
        summaryHTML(totals, false) +
        '<div class="co-box"><div class="co-box-head"><h4>' + esc(T('checkout.review.deliverTo')) + '</h4>' +
          '<button type="button" class="co-link" data-co-goto="details">' + esc(T('checkout.review.edit')) + '</button></div>' +
          '<p><strong>' + esc(f.name) + '</strong><br>' + esc(f.address) + (f.city ? ', ' + esc(f.city) : '') +
          '<br>' + esc(f.phone) + ' · ' + esc(f.email) + '</p>' +
          (f.notes ? '<p class="co-muted">' + esc(f.notes) + '</p>' : '') +
        '</div>' +
        '<div class="co-box"><div class="co-box-head"><h4>' + esc(T('checkout.review.payWith')) + '</h4>' +
          '<button type="button" class="co-link" data-co-goto="payment">' + esc(T('checkout.review.edit')) + '</button></div>' +
          '<p><strong>' + esc(T(mKeys[state.method])) + '</strong></p></div>' +
        errorBox() +
        '<div class="co-actions two">' +
          '<button type="button" class="button button-outline" data-co-back>← ' + esc(T('checkout.back')) + '</button>' +
          '<button type="button" class="button button-gold" data-co-place' + (state.busy ? ' disabled' : '') + '>' +
            esc(T(state.busy ? 'checkout.placing' : 'checkout.placeOrder')) + ' · ' + money(totals.total) + '</button>' +
        '</div>' +
      '</div>';
  }

  /** Card step (TEST MODE). A real gateway replaces the two buttons. */
  function viewPay() {
    const o = state.order;
    return '<div class="co-pay">' +
      '<p class="eyebrow centered">' + esc(T('pay.card')) + '</p>' +
      '<h3 class="co-h centered">' + esc(T('pay.amountDue')) + ' · ' + money(o.total) + '</h3>' +
      '<p class="co-test">' + esc(T('pay.test')) + '</p>' + errorBox() +
      '<div class="co-actions">' +
        '<button type="button" class="button button-gold button-full" data-co-sandbox="1"' + (state.busy ? ' disabled' : '') + '>' + esc(T('pay.simulateOk')) + '</button>' +
        '<button type="button" class="button button-outline button-full" data-co-sandbox="0"' + (state.busy ? ' disabled' : '') + '>' + esc(T('pay.simulateFail')) + '</button>' +
        '<button type="button" class="co-link centered" data-co-later>' + esc(T('pay.payLater')) + '</button>' +
      '</div></div>';
  }

  function viewDone() {
    const o = state.order;
    const tr = window.noirOrderTracker;
    const failed = o.paymentStatus === 'failed';
    let payBlock = '';
    if (o.paymentMethod === 'bank_transfer') {
      payBlock = '<div class="co-box"><h4>' + esc(T('pay.bank.details')) + '</h4><pre class="co-bank">' + esc(settings().bankDetails || '—') + '</pre>' +
        (o.paymentRef
          ? '<p class="co-hint">' + esc(T('pay.bank.ref')) + ': <strong>' + esc(o.paymentRef) + '</strong></p>'
          : '<form class="co-inline" data-co-ref><input name="ref" placeholder="' + esc(T('pay.bank.ref')) + '" required>' +
            '<button class="button button-outline" type="submit">' + esc(T('acct.saveRef')) + '</button></form>') + '</div>';
    } else if (o.paymentMethod === 'cod') {
      payBlock = '<p class="co-hint centered">' + esc(T('pay.codNote')) + '</p>';
    }
    return '<div class="co-done">' +
      '<div class="co-tick" aria-hidden="true">' + (failed ? '!' : '✓') + '</div>' +
      '<h3 class="co-h centered">' + esc(T(failed ? 'pay.failed' : 'done.title')) + '</h3>' +
      '<p class="modal-description centered">' + esc(T(failed ? 'pay.failedCopy' : 'done.copy')) + '</p>' +
      '<p class="co-ordernum">' + esc(T('done.number')) + ' <strong>' + esc(o.id) + '</strong></p>' +
      '<div class="co-meta"><span class="pill ' + tr.paymentClass(o) + '">' + esc(tr.methodLabel(o.paymentMethod)) + ' · ' + esc(tr.paymentLabel(o)) + '</span>' +
        '<strong>' + money(o.total) + '</strong></div>' +
      tr.timelineHTML(o, [{ status: o.status, created_at: o.createdAt }]) +
      payBlock +
      (state._signedIn ? '' : '<p class="co-hint centered">' + esc(T('done.guestTrack')) + '</p>') +
      '<div class="co-actions two">' +
        '<a class="button button-gold" href="account.html#order=' + encodeURIComponent(o.id) + '">' + esc(T('done.track')) + '</a>' +
        '<button type="button" class="button button-outline" data-co-close>' + esc(T('done.keepShopping')) + '</button>' +
      '</div></div>';
  }

  function viewEmpty() {
    return '<div class="co-done"><p class="modal-description centered">' + esc(T('checkout.empty')) + '</p>' +
      '<div class="co-actions"><a class="button button-gold button-full" href="shop.html">' + esc(T('cart.browse')) + '</a></div></div>';
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const el = root();
    if (!el) return;
    let html;
    if (state.step === 'done') html = viewDone();
    else if (state.step === 'pay') html = viewPay();
    else if (!cartLines().length) html = viewEmpty();
    else if (state.step === 'payment') html = viewPayment();
    else if (state.step === 'review') html = viewReview();
    else html = viewDetails();
    el.innerHTML = html;
    const dlg = el.closest('dialog');
    if (dlg) {
      const h = dlg.querySelector('[data-co-title]');
      if (h) h.textContent = T(state.step === 'done' ? 'done.title' : 'checkout.title');
      const eb = dlg.querySelector('.eyebrow');
      if (eb) eb.hidden = state.step === 'done' || state.step === 'pay';
    }
    const first = el.querySelector('input:not([type=radio]), textarea, button.button-gold');
    if (first && state._focus !== false) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    state._focus = true;
  }

  function go(step) { state.step = step; state.error = ''; render(); }

  function readForm(form) {
    const fd = new FormData(form);
    fd.forEach((v, k) => { if (k in state.form) state.form[k] = String(v).trim(); });
  }

  function validateDetails() {
    const f = state.form;
    if (!f.name || !f.email || !f.phone || !f.address) return T('err.details');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return T('err.details');
    if (f.phone.replace(/\D/g, '').length < 7) return T('err.details');
    return '';
  }

  function explain(err) {
    switch (err && err.code) {
      case 'insufficient_stock': return T('err.stock', { name: err.detail || '' });
      case 'upgrade_required': return T('err.upgrade');
      case 'missing_details': return T('err.details');
      case 'empty_cart': return T('checkout.empty');
      case 'payment_method_disabled':
      case 'invalid_payment_method': return T('pay.none');
      default: return T('err.generic') + (window.location.search.indexOf('debug') !== -1 && err ? ' (' + err.message + ')' : '');
    }
  }

  async function place() {
    if (state.busy) return;
    state.busy = true; state.error = ''; render();
    try {
      const order = await window.noirPlaceOrder({
        ...state.form,
        paymentMethod: state.method,
        paymentRef: state.bankRef,
        items: cartLines().map((l) => ({ type: l.type, id: l.id, qty: l.qty })),
      });
      state.order = order;
      try { await window.noirSyncCustomerAfterOrder({ id: order.id, customer: order.customer, email: order.email, total: order.total }); } catch (e) { /* best effort */ }
      try { await window.clearCart(); } catch (e) { /* ignore */ }
      if (typeof window.noirRefreshStoreData === 'function') window.noirRefreshStoreData();
      window.dispatchEvent(new CustomEvent('noir:order-placed', { detail: { order } }));
      state.busy = false;
      go(state.method === 'card' ? 'pay' : 'done');
    } catch (err) {
      state.busy = false;
      state.error = explain(err);
      if (err && err.code === 'insufficient_stock' && typeof window.noirRefreshStoreData === 'function') window.noirRefreshStoreData();
      render();
    }
  }

  async function sandbox(ok) {
    if (state.busy) return;
    state.busy = true; state.error = ''; render();
    try {
      // A real gateway replaces this call: charge the card, then mark the order paid
      const gw = window.noirCheckout && window.noirCheckout.cardGateway;
      state.order = gw ? await gw(state.order, ok) : await window.noirSandboxPay(state.order.id, ok);
      state.busy = false;
      toast(T(ok ? 'pay.success' : 'pay.failed'));
      go('done');
    } catch (err) {
      state.busy = false;
      state.error = explain(err);
      render();
    }
  }

  /* ============================================================
     EVENTS (delegated on document so it survives re-renders)
     ============================================================ */
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (!root() || !root().contains(f)) return;
    e.preventDefault();

    if (f.dataset.coForm === 'details') {
      readForm(f);
      const msg = validateDetails();
      if (msg) { state.error = msg; state._focus = false; render(); return; }
      go('payment');
    } else if (f.dataset.coForm === 'payment') {
      const m = f.querySelector('input[name=method]:checked');
      if (m) state.method = m.value;
      const ref = f.querySelector('[name=bankRef]');
      state.bankRef = ref ? ref.value.trim() : '';
      go('review');
    } else if (f.hasAttribute('data-co-ref')) {
      const ref = f.querySelector('[name=ref]').value.trim();
      if (!ref) return;
      try {
        await window.noirSubmitPaymentRef(state.order.id, ref, state.order.email);
        state.order.paymentRef = ref;
        toast(T('acct.refSaved'));
        render();
      } catch (err) { toast(explain(err)); }
    }
  });

  document.addEventListener('change', (e) => {
    const el = root();
    if (!el || !el.contains(e.target)) return;
    if (e.target.name === 'method') {
      // keep what was typed for the bank reference while switching
      const ref = el.querySelector('[name=bankRef]');
      if (ref) state.bankRef = ref.value.trim();
      state.method = e.target.value;
      state._focus = false;
      render();
    }
  });

  document.addEventListener('click', (e) => {
    const el = root();
    if (!el || !el.contains(e.target)) return;
    const t = e.target;
    if (t.closest('[data-co-back]')) {
      const f = el.querySelector('form'); if (f) readForm(f);
      go(state.step === 'review' ? 'payment' : 'details');
    } else if (t.closest('[data-co-goto]')) {
      go(t.closest('[data-co-goto]').dataset.coGoto);
    } else if (t.closest('[data-co-place]')) {
      place();
    } else if (t.closest('[data-co-sandbox]')) {
      sandbox(t.closest('[data-co-sandbox]').dataset.coSandbox === '1');
    } else if (t.closest('[data-co-later]')) {
      go('done');
    } else if (t.closest('[data-co-close]')) {
      const m = document.querySelector('site-modals');
      if (m && m.close) m.close('checkout-modal');
    }
  });

  window.addEventListener('noir:language', () => { state._focus = false; render(); });
  window.addEventListener('noir:cart-updated', () => {
    if (state.step === 'done' || state.step === 'pay') return;
    const el = root();
    if (el && el.closest('dialog') && el.closest('dialog').open) { state._focus = false; render(); }
  });

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.noirCheckout = {
    cardGateway: null, // (order, ok) => Promise<order> — plug a real gateway in here
    async start() {
      // a finished order starts a fresh checkout next time
      if (state.step === 'done' || state.step === 'pay') {
        state.step = 'details'; state.order = null; state.bankRef = ''; state.form.notes = '';
      }
      state.error = ''; state.busy = false;
      await prefill();
      if (state.step !== 'payment' && state.step !== 'review') state.step = 'details';
      render();
    },
    render,
  };
})();
