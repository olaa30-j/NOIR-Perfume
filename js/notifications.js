/* ============================================================
   NOIR — notifications bell (customers + admins)
   Rows come from the `notifications` table (created by database triggers
   when orders are placed / change status / get paid).
   - Row Level Security decides who sees what (a customer only their own,
     admins the admin feed).
   - Live: Supabase Realtime, with a 60s polling fallback.
   Mount: noirNotifs.mount(document.querySelector('[data-notifs]'))
   ============================================================ */
(function () {
  'use strict';

  const T = (k, v) => (typeof window.noirT === 'function' ? window.noirT(k, v) : k);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const lang = () => (typeof window.noirLang === 'function' ? window.noirLang() : 'en');

  const state = { items: [], session: null, channel: null, timer: null, started: false, mounts: [] };

  const ICON = { new_order: '🛍', order_status: '📦', payment: '💳', payment_ref: '🏦', order_cancelled: '✕', info: '•' };

  function title(n) { return (lang() === 'ar' && n.title_ar) || n.title || ''; }
  function body(n) { return (lang() === 'ar' && n.body_ar) || n.body || ''; }

  function ago(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    const rtf = (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) ? new Intl.RelativeTimeFormat(lang() === 'ar' ? 'ar' : 'en', { numeric: 'auto' }) : null;
    if (!rtf) return d.toLocaleString();
    if (mins < 60) return rtf.format(-Math.max(mins, 0), 'minute');
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  }

  function unread() { return state.items.filter((n) => !n.read).length; }

  function paint() {
    state.mounts.forEach((m) => {
      const n = unread();
      const badge = m.querySelector('.notif-badge');
      if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.classList.toggle('hidden', n === 0); }
      const list = m.querySelector('.notif-list');
      if (!list) return;
      list.innerHTML = state.items.length
        ? state.items.map((n) =>
            '<li><button type="button" class="notif-item' + (n.read ? '' : ' unread') + '" data-nid="' + n.id + '" data-order="' + esc(n.order_id || '') + '">' +
              '<span class="notif-ico" aria-hidden="true">' + (ICON[n.type] || ICON.info) + '</span>' +
              '<span class="notif-txt"><strong>' + esc(title(n)) + '</strong>' +
                (body(n) ? '<small>' + esc(body(n)) + '</small>' : '') +
                '<time>' + esc(ago(n.created_at)) + '</time></span>' +
            '</button></li>').join('')
        : '<li class="notif-empty">' + esc(T('notif.empty')) + '</li>';
    });
  }

  async function load() {
    if (typeof window.noirLoadNotifications !== 'function') return;
    state.items = await window.noirLoadNotifications(30);
    paint();
  }

  function onInsert(row) {
    if (!row || state.items.some((n) => n.id === row.id)) return;
    const s = state.session;
    if (!s) return;
    const mine = (row.audience === 'user' && row.user_id === s.userId) || (row.audience === 'admin' && s.role === 'admin');
    if (!mine) return;
    state.items.unshift(row);
    paint();
    if (typeof window.showToast === 'function') window.showToast((ICON[row.type] || '') + ' ' + title(row));
    window.dispatchEvent(new CustomEvent('noir:notification', { detail: row }));
  }

  function subscribe() {
    unsubscribe();
    if (!window.db || typeof window.db.channel !== 'function' || !state.session) return;
    try {
      state.channel = window.db
        .channel('noir-notifs-' + state.session.userId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => onInsert(p.new))
        .subscribe();
    } catch (e) { /* polling covers it */ }
    state.timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
  }
  function unsubscribe() {
    if (state.channel && window.db && window.db.removeChannel) { try { window.db.removeChannel(state.channel); } catch (e) { /* ignore */ } }
    state.channel = null;
    clearInterval(state.timer);
  }

  async function start() {
    if (typeof window.noirGetSession !== 'function') return;
    let s = null;
    try { s = await window.noirGetSession(); } catch (e) { /* guest */ }
    state.session = s;
    state.mounts.forEach((m) => { m.hidden = !s; });
    if (!s) { unsubscribe(); state.items = []; paint(); return; }
    await load();
    subscribe();
  }

  function setOpen(m, open) {
    const pop = m.querySelector('.notif-pop'), btn = m.querySelector('.notif-btn');
    pop.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  }

  function mount(el) {
    if (!el || el._notifMounted) return;
    el._notifMounted = true;
    el.classList.add('notif');
    el.hidden = true; // shown once a session exists
    el.innerHTML =
      '<button type="button" class="icon-button notif-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(T('notif.open')) + '">' +
        '<span aria-hidden="true">🔔</span><span class="notif-badge hidden">0</span></button>' +
      '<div class="notif-pop" role="dialog" aria-label="' + esc(T('notif.title')) + '">' +
        '<div class="notif-head"><strong>' + esc(T('notif.title')) + '</strong>' +
          '<button type="button" class="co-link notif-all">' + esc(T('notif.markAll')) + '</button></div>' +
        '<ul class="notif-list"></ul></div>';
    state.mounts.push(el);

    el.querySelector('.notif-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !el.querySelector('.notif-pop').classList.contains('open');
      state.mounts.forEach((m) => setOpen(m, false));
      setOpen(el, open);
      if (open) load();
    });
    el.querySelector('.notif-all').addEventListener('click', async () => {
      await window.noirMarkNotificationsRead();
      state.items.forEach((n) => { n.read = true; });
      paint();
    });
    el.querySelector('.notif-list').addEventListener('click', async (e) => {
      const b = e.target.closest('.notif-item');
      if (!b) return;
      const id = Number(b.dataset.nid), order = b.dataset.order;
      const n = state.items.find((x) => x.id === id);
      if (n && !n.read) { n.read = true; paint(); window.noirMarkNotificationsRead([id]); }
      setOpen(el, false);
      if (!order) return;
      if (state.session && state.session.role === 'admin' && document.getElementById('admin-app')) {
        window.dispatchEvent(new CustomEvent('noir:open-order', { detail: { id: order } }));
      } else if (state.session && state.session.role === 'admin' && n && n.audience === 'admin') {
        location.href = 'admin.html#order=' + encodeURIComponent(order);
      } else {
        location.href = 'account.html#order=' + encodeURIComponent(order);
      }
    });

    paint();
    if (!state.started) { state.started = true; start(); }
    else if (state.session) { el.hidden = false; }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.notif')) return;
    state.mounts.forEach((m) => setOpen(m, false));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') state.mounts.forEach((m) => setOpen(m, false)); });
  window.addEventListener('noir:language', paint);
  window.addEventListener('noir:auth-changed', start);
  window.addEventListener('noir:session-ready', start);
  window.addEventListener('noir:order-placed', () => setTimeout(load, 800));

  window.noirNotifs = { mount, reload: load, start };
})();
