/* ============================================================
   NOIR — order progress helpers (shared by storefront + admin)
   - status / payment labels (EN / AR via noirT)
   - noirOrderTimelineHTML(order, events): the progress tracker
   ============================================================ */
(function () {
  const STEPS = ['Processing', 'Confirmed', 'Preparing', 'Shipped', 'Delivered'];
  const STEP_ICON = { Processing: '✦', Confirmed: '✓', Preparing: '◈', Shipped: '➜', Delivered: '⌂' };

  const T = (k, v) => (typeof window.noirT === 'function' ? window.noirT(k, v) : k);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function lang() { return typeof window.noirLang === 'function' ? window.noirLang() : 'en'; }
  function locale() { return lang() === 'ar' ? 'ar-EG' : 'en-GB'; }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statusLabel(status) { return T('ostatus.' + status) || status; }
  function methodLabel(m) { return T('pmethod.' + (m || 'cod')); }

  /** Payment label: "Pay on delivery" for unpaid COD, otherwise the payment status. */
  function paymentLabel(o) {
    const st = o.paymentStatus || 'pending';
    if (st === 'pending' && (o.paymentMethod || 'cod') === 'cod') return T('pstatus.pending.cod');
    return T('pstatus.' + st);
  }
  function paymentClass(o) {
    const st = o.paymentStatus || 'pending';
    return st === 'paid' ? 'ok' : st === 'failed' ? 'bad' : st === 'refunded' ? 'muted' : 'warn';
  }
  function statusClass(status) {
    return status === 'Delivered' ? 'ok' : status === 'Cancelled' ? 'bad' : status === 'Processing' ? 'warn' : 'info';
  }

  /** Name of an order line in the active language (names are snapshotted at order time). */
  function lineName(line) {
    if (lang() === 'ar' && line.nameAr) return line.nameAr;
    return line.name || '';
  }

  /**
   * Progress tracker.
   * events: [{ status, note, created_at }] — used for timestamps + notes.
   */
  function timelineHTML(order, events) {
    events = Array.isArray(events) ? events : [];
    const byStatus = {};
    events.forEach((e) => { byStatus[e.status] = e; }); // last event per status wins
    const cancelled = order.status === 'Cancelled';
    const idx = cancelled ? -1 : Math.max(0, STEPS.indexOf(order.status));
    // when cancelled, show how far the order got
    let reached = idx;
    if (cancelled) {
      reached = -1;
      STEPS.forEach((s, i) => { if (byStatus[s]) reached = i; });
    }

    const steps = STEPS.map((s, i) => {
      const ev = byStatus[s];
      let cls = 'pending';
      if (cancelled) cls = i <= reached ? 'done muted' : 'pending';
      else if (i < idx) cls = 'done';
      else if (i === idx) cls = s === 'Delivered' ? 'done current' : 'current';
      const when = ev ? fmtDateTime(ev.created_at) : '';
      const note = ev && ev.note ? '<span class="trk-note">' + esc(ev.note) + '</span>' : '';
      return '<li class="trk-step ' + cls + '">' +
        '<span class="trk-dot" aria-hidden="true">' + (cls.indexOf('done') === 0 ? '✓' : STEP_ICON[s]) + '</span>' +
        '<span class="trk-label">' + esc(statusLabel(s)) + '</span>' +
        (when ? '<time class="trk-time">' + esc(when) + '</time>' : '') + note +
      '</li>';
    }).join('');

    const pct = cancelled ? 0 : Math.round((idx / (STEPS.length - 1)) * 100);
    let banner = '';
    if (cancelled) {
      const ev = byStatus.Cancelled;
      banner = '<p class="trk-banner bad" role="status">✕ ' + esc(statusLabel('Cancelled')) +
        (ev ? ' · ' + esc(fmtDateTime(ev.created_at)) : '') + '</p>';
    }
    return '<div class="trk" style="--trk-pct:' + pct + '%">' + banner +
      '<ol class="trk-steps" aria-label="' + esc(T('acct.timeline')) + '">' + steps + '</ol></div>';
  }

  window.noirOrderSteps = STEPS;
  window.noirOrderTracker = {
    STEPS, statusLabel, methodLabel, paymentLabel, paymentClass, statusClass,
    lineName, timelineHTML, fmtDate, fmtDateTime, esc,
  };
})();
